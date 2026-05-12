import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  type OpenAPIObject,
  type SwaggerCustomOptions,
  SwaggerModule,
} from '@nestjs/swagger';

/**
 * Single source of truth for the OpenAPI document.
 *
 * Consumed in two places:
 *  - apps/api/src/main.ts wires it into SwaggerModule.setup so the
 *    running api exposes /api/docs (UI) and /api/docs-json (spec),
 *  - apps/api/scripts/dump-openapi.ts builds the spec without
 *    binding a port and writes it to disk so the web side can run
 *    `pnpm apigen` without a live api.
 *
 * Keep the metadata here, never inline it on call sites - otherwise
 * the spec drifts depending on which entry point produced it.
 */

const API_TITLE = 'SPS API';
const API_DESCRIPTION =
  'REST surface for the AIS vessel tracking project. The frontend consumes this spec via Orval to generate a typed client.';
const API_VERSION = '1.0.0';

export type ApiTag = { readonly name: string; readonly description: string };

const API_TAGS: ReadonlyArray<ApiTag> = [
  { name: 'vessels', description: 'Read-only access to the vessel catalogue.' },
];

export const OPENAPI_UI_PATH = 'docs';
export const OPENAPI_JSON_PATH = 'docs-json';

/**
 * Swagger UI behaviour tuned for fast comprehension of a small read
 * surface. Notable choices:
 *
 * - tryItOutEnabled: skips the manual "Try it out" click on every
 *   endpoint; you can hit the request directly from the docs page.
 * - filter: top-of-page search input. With 3 endpoints this matters
 *   little; with 30 it becomes essential, set up now so it lands
 *   for free as the surface grows.
 * - displayRequestDuration: prints round-trip time next to the
 *   response. Cheap performance feedback.
 * - displayOperationId: shows the Orval / generator function name
 *   alongside the path. Useful when grepping generated client code.
 * - syntaxHighlight monokai: dark code blocks regardless of OS
 *   theme; reads well on both light and dark monitors.
 * - persistAuthorization: harmless toggle that keeps any future
 *   bearer token across page reloads.
 * - sorters alpha: deterministic ordering instead of arbitrary
 *   spec ordering; reading the page twice gives the same layout.
 */
const SWAGGER_UI_OPTIONS = {
  docExpansion: 'list' as const,
  filter: true,
  displayRequestDuration: true,
  displayOperationId: true,
  tryItOutEnabled: true,
  persistAuthorization: true,
  tagsSorter: 'alpha' as const,
  operationsSorter: 'alpha' as const,
  defaultModelsExpandDepth: 1,
  defaultModelExpandDepth: 2,
  syntaxHighlight: { theme: 'monokai' as const },
};

/**
 * Custom CSS - tiny visual polish. Keeps the busy Swagger topbar
 * hidden (we are not using the spec selector), tightens the info
 * block and tints the title in the SPS accent indigo.
 */
const SWAGGER_CUSTOM_CSS = `
  .swagger-ui .topbar { display: none; }
  .swagger-ui .info { margin: 24px 0 32px; }
  .swagger-ui .info .title { color: #4c1d95; font-weight: 700; }
  .swagger-ui .scheme-container { box-shadow: none; padding: 12px 0; }
  .swagger-ui .opblock-tag { font-size: 18px; border-bottom: 1px solid #ede9fe; }
  .swagger-ui .opblock.opblock-get { border-color: #2563eb; background: #eff6ff; }
  .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #2563eb; }
  .swagger-ui .btn.execute { background: #4c1d95; border-color: #4c1d95; }
`;

export const SWAGGER_CUSTOM_OPTIONS: SwaggerCustomOptions = {
  jsonDocumentUrl: OPENAPI_JSON_PATH,
  useGlobalPrefix: true,
  customSiteTitle: 'SPS API · Docs',
  customCss: SWAGGER_CUSTOM_CSS,
  swaggerOptions: SWAGGER_UI_OPTIONS,
};

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle(API_TITLE)
    .setDescription(API_DESCRIPTION)
    .setVersion(API_VERSION);
  for (const tag of API_TAGS) {
    builder.addTag(tag.name, tag.description);
  }
  return SwaggerModule.createDocument(app, builder.build());
}
