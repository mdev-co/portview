/**
 * Out-of-band OpenAPI dump.
 *
 * Bootstraps the Nest app long enough to build the Swagger document,
 * writes it to disk, then exits without binding a port. Useful when
 * the regular dev server is already running on :3000 and you want
 * to regenerate the typed client without restarting it.
 *
 * Run with:
 *   pnpm --filter @sps/api openapi:dump
 *
 * Writes to apps/web/src/api/openapi-spec.json so Orval can read the
 * file path. The output path is the only constant defined here; the
 * document metadata lives in src/openapi-config.ts so the running
 * api and this script never drift.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { format, resolveConfig } from 'prettier';

import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/openapi-config';

const SPEC_OUTPUT_PATH = resolve(
  __dirname,
  '..',
  '..',
  'web',
  'src',
  'api',
  'openapi-spec.json',
);

async function dump(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api', { exclude: ['/'] });

  const document = buildOpenApiDocument(app);
  const prettierConfig = await resolveConfig(SPEC_OUTPUT_PATH);
  const formatted = await format(JSON.stringify(document, null, 2), {
    ...prettierConfig,
    filepath: SPEC_OUTPUT_PATH,
  });
  writeFileSync(SPEC_OUTPUT_PATH, formatted);

  await app.close();
  process.stdout.write(`OpenAPI spec written to ${SPEC_OUTPUT_PATH}\n`);
}

dump().catch((err: unknown) => {
  console.error('OpenAPI dump failed:', err);
  process.exit(1);
});
