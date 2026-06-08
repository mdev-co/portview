import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

/**
 * Liveness probe consumed by the Fly.io edge proxy. Returns the same
 * literal shape on every request and touches NO database, NO Prisma
 * pool, NO Tailscale daemon and NO downstream service. The point is
 * that the proxy can tell the Node event loop is still spinning even
 * when one of those subsystems is starved or wedged - for example,
 * Prisma pool exhaustion under AIS upsert flood, GC-major pauses on
 * a long-running process, or a transient Tailscale handshake retry.
 *
 * The previous Fly check hit `GET /` and went through the application
 * router (controllers, global throttler guard, etc). That path used
 * `AppController.getHello()` which is also database-free, but the
 * request still had to wait its turn in the event-loop queue behind
 * anything blocking. `/healthz` is registered before the global
 * prefix and decorated with `SkipThrottle` so the request bypasses
 * the rate limiter and gets the shortest possible path to the wire.
 */
@Controller()
export class HealthController {
  @Get('healthz')
  @SkipThrottle()
  live(): { readonly status: 'ok' } {
    return { status: 'ok' };
  }
}
