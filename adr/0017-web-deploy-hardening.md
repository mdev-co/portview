# ADR 0017 - Web deploy hardening for the public Vercel demo

- Status: accepted
- Date: 2026-05-13

## Context

The api side has been deployed on Fly since ADR 0014 (`sps-api.fly.dev`), but the web side has never shipped publicly. A typed REST client is in place since ADR 0015, and `@nestia/core` makes the boundary single-source-of-truth as of ADR 0016. The next blocker is the public demo URL: a Vercel-hosted SPA pointing at the Fly api.

Going public surfaces a different threat model than local dev. Three concerns dominate:

1. Cross-origin runtime: the web origin (Vercel) will not match the api origin (Fly), so any code that derives api / WebSocket URLs from `window.location` falls through to the wrong host.
2. XSS / response sniffing / clickjacking surface: a public origin gets reached by arbitrary clients including hostile ones. Default browser policies are permissive; standard hardening headers close the gaps.
3. Dependency hygiene: any package marked as a runtime dependency (`dependencies` in `package.json`) ships its known vulnerabilities into the production build context even if the bundle does not import it. The pre-deploy audit found one such package - `shadcn` - declared as runtime when it is a build-time CLI.

## Decision

Land four bundled hardening changes in a single PR:

- **Move `shadcn` to `devDependencies`**: the package is a CLI used to scaffold components (`npx shadcn add ...`), never imported in `src`. The mis-declaration carried six known vulnerabilities into the production audit through transitive dependencies on `@modelcontextprotocol/sdk` and `hono`. Re-classifying drops the prod CVE count from 6 to 0 with no code change.
- **Add `VITE_WS_URL` environment variable** consumed by `telemetry-client.ts` with a fallback to the previous `window.location.host` derivation. Same-origin local dev keeps working unchanged; cross-origin Vercel deploys read the explicit override and connect to the api origin.
- **Vercel deploy config (`vercel.json` + `.vercelignore`)** carrying:
  - Build pipeline: `pnpm install --frozen-lockfile && pnpm --filter @sps/web build` with output at `apps/web/dist`.
  - Eleven security headers including a strict Content Security Policy that allowlists only the api origin (`sps-api.fly.dev` over HTTPS and WSS) and the OSM tile servers.
  - Cache policy: immutable on `/assets/*`, no-cache on `/index.html` so SPA shell updates land without manual revalidation.
  - Ignore list: backend folders, ADRs, GitHub config, husky, IDE files. Keeps the deploy bundle scoped to the web subtree.
- **Block `dangerouslySetInnerHTML` at the linter** via a custom `no-restricted-syntax` rule. The audit found zero occurrences in `apps/web/src`; the rule keeps it that way. A future PR that genuinely needs raw HTML rendering must add a sanitizer and an explicit scoped override with rationale.

## Tradeoffs considered

### Install DOMPurify defensively

Pros: standard recommendation, "sanitizer present" reads well in security audits. Cons: dead dependency in the absence of `dangerouslySetInnerHTML` usage; React JSX already escapes everything passed as children, including AIS-controlled strings (vessel names, callSigns, destinations). Adds bundle weight (~22 KB gzip) for code that runs zero times.

The linter rule blocks the only attack vector that would bypass JSX escaping. DOMPurify gets installed in the PR that actually introduces a use-case, where its presence is load-bearing rather than theatrical.

### Subset the CSP

A relaxed CSP (`script-src 'self' 'unsafe-inline'`, `default-src *`) would be simpler to maintain and harder to break. Cons: leaves obvious holes - inline `<script>` injection, third-party data exfiltration, framing attacks. The deployed surface is small (one origin, one tile provider, no analytics, no auth) so the strict CSP is cheap to maintain.

### Mirror Fly api headers in Vercel

The Fly api already sets helmet defaults; mirroring on Vercel duplicates the work. Cons: two origins, two browsers' takes on default policies. Defense-in-depth applies; the Vercel side is the SPA shell which has different concerns (CSP for inline content, framing for embed defense) than the api side (CORS for credentialed XHR).

### Ship without `Origin-Agent-Cluster`

A newer header for tighter origin isolation against side-channel attacks. Cons: ~30 bytes of header overhead per response. Standardised, supported in all modern browsers since 2023, cheap signal of attention to detail. Enabled.

### Deprecated headers (`X-XSS-Protection`, `Expect-CT`, `Cross-Origin-Embedder-Policy: require-corp`)

`X-XSS-Protection` is ignored by modern browsers and superseded by CSP. `Expect-CT` was deprecated by Chrome in 2024. `Cross-Origin-Embedder-Policy: require-corp` would break OSM tile loading because the OSM tile servers do not advertise the required CORP header. Skipped.

## Consequences

- Production audit (`pnpm audit --prod`) reports zero vulnerabilities. Dev audit still shows the same six because the shadcn CLI is still installed for the workflow that scaffolds new components.
- Vercel build output is bounded to `apps/web/dist`. Backend changes that do not touch the web subtree do not trigger a frontend redeploy unless main is rebuilt explicitly.
- WebSocket connection to the api works whether the web is served from `localhost:5173`, a Vercel preview URL, or the production Vercel URL. Each environment sets `VITE_WS_URL` to point at the appropriate Fly host (always `wss://sps-api.fly.dev/ws/telemetry` for the live api in this PoC).
- Adding `dangerouslySetInnerHTML` is a deliberate decision now, not an accident. The linter forces the author to write the rationale into the PR.
- CSP violations surface as console errors in the browser, which makes the policy debuggable. Tightening / loosening individual directives is a follow-up if a future feature needs (for example) Mapbox-style sprites or a third-party widget.

## Operational notes

The follow-up after this PR lands:

- Configure two Vercel project environment variables: `VITE_API_URL = https://sps-api.fly.dev/api` and `VITE_WS_URL = wss://sps-api.fly.dev/ws/telemetry`.
- After the first successful Vercel deploy, set the corresponding `CORS_ALLOWED_ORIGINS` Fly secret on the api side so the production web origin can call REST endpoints with browser-strict CORS.

## Flow

See `0017-web-deploy-hardening.d2` for the production request path including the new headers, the env override and the rejected paths a hostile request takes.
