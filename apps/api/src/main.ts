import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { getCorsAllowedOrigins, getPort, shouldExposeOpenApi } from './env';
import {
  loadOpenApiDocument,
  OPENAPI_UI_PATH,
  SWAGGER_CUSTOM_OPTIONS,
} from './openapi-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  // `/` keeps the legacy Hello-World handler so any tooling that hits
  // the root still gets a response; `/healthz` is excluded from the
  // global `/api` prefix so the Fly edge proxy can probe a path that
  // takes the shortest possible code path through Nest (no module
  // resolution beyond HealthController) and is always reachable
  // regardless of operator-facing API version bumps.
  app.setGlobalPrefix('api', { exclude: ['/', '/healthz'] });

  // CORS allowlist from env. Closed by default - if no origins are
  // configured the api refuses cross-origin browser requests. The
  // production deploy at sps-api.fly.dev sets the secret to the
  // public web origin (e.g. https://sps-radar.vercel.app); local
  // dev sets http://localhost:5173 in the root .env. The WebSocket
  // gateway has its own origin handling inside WsAdapter and is
  // unaffected.
  const corsOrigins = getCorsAllowedOrigins();
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Accept', 'Content-Type'],
      maxAge: 86400,
    });
  }

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
