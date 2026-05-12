import { defineConfig } from 'orval';

/**
 * Orval configuration for generating the typed api client.
 *
 * The OpenAPI spec is dumped to disk by the api side and committed
 * to the repo, so CI does not need a running api. To refresh after
 * an api change:
 *
 *   pnpm --filter @sps/api openapi:dump   # writes src/api/openapi-spec.json
 *   pnpm --filter @sps/web apigen         # regenerates src/api/generated/
 *
 * Generated files in src/api/generated/ are never edited by hand.
 */
export default defineConfig({
  sps: {
    input: {
      target: './src/api/openapi-spec.json',
    },
    output: {
      target: 'src/api/generated/sps.ts',
      schemas: 'src/api/generated/schemas',
      client: 'fetch',
      mode: 'split',
      override: {
        mutator: {
          path: 'src/lib/orval-fetcher.ts',
          name: 'orvalFetcher',
        },
      },
    },
    hooks: {
      afterAllFilesWrite: 'prettier --write',
    },
  },
});
