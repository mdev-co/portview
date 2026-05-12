import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { getPort, shouldExposeOpenApi } from './env';
import {
  buildOpenApiDocument,
  OPENAPI_UI_PATH,
  SWAGGER_CUSTOM_OPTIONS,
} from './openapi-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.setGlobalPrefix('api', { exclude: ['/'] });

  // OpenAPI exposure is opt-in via env (see ./env.ts). Default is
  // closed everywhere - dev, CI, prod - so the spec is never
  // exposed by accident. Two-condition guard: NODE_ENV !== production
  // AND SPS_EXPOSE_OPENAPI === 'true'.
  if (shouldExposeOpenApi()) {
    const document = buildOpenApiDocument(app);
    // useGlobalPrefix: true is what makes the docs UI and JSON
    // appear under /api/docs and /api/docs-json instead of /docs
    // and /docs-json. Without it SwaggerModule registers paths
    // verbatim and skips the prefix set on the app.
    SwaggerModule.setup(OPENAPI_UI_PATH, app, document, SWAGGER_CUSTOM_OPTIONS);
  }

  await app.listen(getPort());
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
