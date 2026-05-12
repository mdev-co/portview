import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { getPort, shouldExposeOpenApi } from './env';
import {
  loadOpenApiDocument,
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
    const document = loadOpenApiDocument();
    if (document !== null) {
      SwaggerModule.setup(
        OPENAPI_UI_PATH,
        app,
        document,
        SWAGGER_CUSTOM_OPTIONS,
      );
    } else {
      console.warn(
        '[openapi] spec file missing - run `pnpm --filter @sps/api openapi:dump` to expose /api/docs.',
      );
    }
  }

  await app.listen(getPort());
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
