import type { INestiaConfig } from '@nestia/sdk';

/**
 * nestia configuration.
 *
 * `nestia swagger` reads the controller surface and emits the
 * OpenAPI spec consumed by the web side via Orval. The schema source
 * is the controller signature itself: TS types on @TypedRoute /
 * @TypedBody / @TypedQuery / @TypedParam handlers are AOT-extracted
 * by the nestia transformer and emitted into the spec. No
 * @ApiProperty, no Zod schema, no DTO class - the type IS the spec.
 *
 * Path prefix note: the running api applies setGlobalPrefix('api')
 * at runtime, but the controller decorators themselves declare bare
 * paths (e.g. @Controller('vessels')). To keep the spec aligned with
 * the live api, the server URL ends in /api so consumers resolve
 * /vessels against http://host/api/vessels, which is what they hit.
 */
const config: INestiaConfig = {
  input: ['src/**/*.controller.ts'],
  output: 'src/api',
  swagger: {
    output: '../web/src/api/openapi-spec.json',
    openapi: '3.1',
    servers: [
      {
        url: 'http://localhost:3000/api',
        description: 'Local dev api',
      },
    ],
    beautify: true,
    info: {
      title: 'SPS API',
      description:
        'REST surface for the AIS vessel tracking project. The frontend consumes this spec via Orval to generate a typed client.',
      version: '1.0.0',
    },
  },
};

export default config;
