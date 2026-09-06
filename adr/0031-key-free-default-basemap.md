# ADR 0031 - The default basemap must be key-free and quota-free

- Status: accepted
- Date: 2026-09-06
- Supersedes: the tile-source table in ADR 0030 for `presentation` and `osm-dark`

## Context

#222 moved the `presentation` (default) and `osm-dark` base rasters from CARTO to MapTiler `dataviz-light` / `dataviz-dark`, because CARTO's free basemaps started serving "API KEY REQUIRED" watermarks. It reused the origin-locked key already powering the opt-in Tactical / Backdrop / Satellite modes.

Side effect nobody priced in: from that commit on, every visitor consumed MapTiler quota from the first paint, not only the operators who deliberately switch to a keyed mode. MapTiler Free is 100 000 requests per month. Public launch (LinkedIn post, Medium article, repository made public) landed on 2026-09-01/02; Analytics shows ~78 000 "Rendered maps (512px)" requests on those two days, 104 307 by 2026-09-06. The account was suspended for the rest of the billing period and the map went blank for everyone, including on the default mode. Cloudflare, Vercel and the CSP could not help: the requests go browser -> MapTiler directly and never touch our infrastructure.

## Decision

1. The default mode and any mode reachable without an explicit operator choice must run on a source that needs no API key and has no monthly quota. `presentation` and `osm-dark` move to Esri Canvas (`World_Light_Gray_Base` / `World_Dark_Gray_Base`): key-free, label-free, same CDN and terms as the Esri imagery / topo modes we already ship.
2. MapTiler stays strictly opt-in (Tactical, Backdrop, Satellite). Its sources get `maxzoom: 16`: MapLibre overscales raster tiles past the source maxzoom instead of fetching, which caps the request volume of a pan/zoom session.
3. Every MapTiler key is created with an HTTP-origin allowlist (`sps-radar.pl`, `www.sps-radar.pl`, `localhost`) before it is ever pasted into Vercel. A key without origin lock is a bug.
4. A key rotation is two operations, never one: update `VITE_MAPTILER_KEY` in Vercel AND redeploy (Vite inlines the key at build time).

## Consequences

- The map renders for every visitor regardless of MapTiler account state. Keyed modes degrade to blank tiles when the key is dead; a graceful fallback to the default mode on HTTP 403 is a follow-up, not part of this change.
- Esri Canvas tops out at z16 with real detail; the presentation register (topology only, no labels) is preserved. Slight visual change vs dataviz-light: cooler greys, softer water edge.
- Next step (planned, separate ADR): self-hosted PMTiles basemap (Poland + Baltic extract on Cloudflare R2) with Protomaps themes, removing the last third-party basemap dependency and enabling a fully custom dark tactical style.
