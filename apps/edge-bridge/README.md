# @sps/edge-bridge

Pi-side forwarder that bridges `rtl_ais` UDP NMEA output to the cloud-deployed `apps/api` ingest gateway over mTLS-authenticated WebSocket Secure.

## Why a separate workspace

The repo already has `apps/api/src/ingest/` as a NestJS module owning multi-source XState failover (LocalUdpSource, WebSdrSource, AisStreamSource). The Pi-side forwarder is a different deployment unit running on different hardware; it cannot be a fourth `ISource` because the backend does not start or stop it. Hence a separate workspace, owned by the Pi, talking to the backend through one well-defined transport (WSS + mTLS).

## Architecture target

```
rtl_ais (Pi)  -- UDP 127.0.0.1:10110 -->  apps/edge-bridge (Pi)  -- WSS + mTLS -->  apps/api EdgeIngestGateway (cloud)  -->  IngestService.handleFrame
```

- Listens on local UDP `127.0.0.1:10110` (matches `rtl_ais` default destination).
- Maintains a persistent WSS connection to the backend with exponential backoff reconnect.
- Authenticates every connection via client certificate (mTLS).
- Runs as a sandboxed systemd unit on the Raspberry Pi.

## Chunk roadmap

This workspace lands across four atomic chunks tracked in milestone `Edge bridge + Pi integration`:

1. **scaffold workspace** (this PR) - pnpm package, tsconfig, config loader stub. Boots, loads env, logs resolved target, exits.
2. **transport** - UDP listener, WSS client, exponential backoff reconnect, dropped-message accounting.
3. **backend gateway + mTLS** - `apps/api EdgeIngestModule` with HTTPS + mTLS server, self-signed CA generation script, per-device client certificates.
4. **Pi sandbox + e2e** - systemd unit with `ProtectSystem=strict`, dedicated `sps-edge` user, capability bounding set. e2e fake-NMEA from Pi reaches the vessel store. ADR-0019 documenting the auth model and AIS spoofing threat model.

## Local development

The workspace boots without certificates (defaults cover the scaffold case):

```bash
pnpm --filter @sps/edge-bridge dev
```

Loads config from repo-root `.env`, prints the resolved configuration, exits 0. From chunk 3 onward, certificate paths become mandatory and the bridge refuses to boot without them.

## Configuration

See repo-root `.env.example` for the canonical `EDGE_BRIDGE_*` env vars. The schema in `src/config.ts` is the single source of truth; every var documented inline with the Zod schema.
