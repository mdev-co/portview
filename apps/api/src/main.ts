import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import compression from 'compression';
import helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Order matters: helmet sets security response headers (CSP,
  // X-Content-Type-Options, X-Frame-Options, etc.). compression gzips
  // the response body when the client advertises `Accept-Encoding:
  // gzip`. Both are Express middleware threaded through Nest's adapter.
  app.use(helmet());
  app.use(compression());

  app.useWebSocketAdapter(new WsAdapter(app));
  app.setGlobalPrefix('api', { exclude: ['/'] });

  // Browser clients hit the api from a different origin (web on
  // vercel.app, api on fly.dev). The CORS allowlist is driven by an
  // env var so production and local origins live in deploy config,
  // not in source. Comma-separated, e.g.
  //   CORS_ALLOWED_ORIGINS=https://sps.example,http://localhost:5173
  // When unset, only same-origin requests pass (the safe default).
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  app.enableCors({
    origin: allowedOrigins.length === 0 ? false : allowedOrigins,
    methods: ['GET'],
    credentials: false,
    maxAge: 3600,
  });

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
