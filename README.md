<div align="center">

# ⚓ Smart Port Szczecin

**Real-time maritime tracking, built end to end: from a DIY radio antenna to the browser.**

[**▶ LIVE DEMO — sps-radar.pl**](https://sps-radar.pl)

![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![MapLibre GL](https://img.shields.io/badge/MapLibre_GL-WebGL2-396CB2)
![PostGIS](https://img.shields.io/badge/PostgreSQL-PostGIS-336791?logo=postgresql&logoColor=white)
![XState](https://img.shields.io/badge/XState-5-121212)

<!-- To show a screenshot here, add docs/preview.png and uncomment:
<img src="docs/preview.png" alt="SPS operator view: live vessels on the Szczecin waterway" width="900">
-->

</div>

---

## Reviewing this repo? Start here

Three things that tell you the most, in about five minutes:

1. **Open the [live demo](https://sps-radar.pl)** and watch vessels move. Every position on
   screen travelled through hardware and code in this repository: antenna, decoder,
   database, WebSocket, map engine.
2. **Skim two ADRs**: [multipart AIS reassembly](adr/0003-ais-multipart-reassembly.md)
   and [dead-reckoning extrapolation](adr/0011-dead-reckoning-extrapolation-freeze.md).
   They show how decisions are made here: context, options, trade-offs, verdict.
3. **Read one module**: [`apps/web/src/modules/map`](apps/web/src/modules/map) - the
   bridge between React's declarative world and MapLibre's imperative engine.

## What this is

A complete maritime situational awareness platform built solo. Ships broadcast AIS
messages on 162 MHz; a custom SDR receiver picks them up, a hand-written NMEA 0183
parser decodes them, and the live picture ends up in the browser - vessels moving
smoothly on a map, several updates per second, within a strict render-frame budget.

```
 RTL-SDR antenna → NMEA 0183 decoder → NestJS ingest → PostgreSQL / PostGIS
                                                              │
        React 19 + MapLibre GL  ←  binary WebSocket frames  ←─┘
```

No third-party tracking API in the primary path. The radio signal is received,
decoded and rendered by code in this repository.

## Where to look in the code

| If you want to see...                        | Go to                                                                |
| -------------------------------------------- | -------------------------------------------------------------------- |
| React ↔ imperative map engine bridge         | [`apps/web/src/modules/map`](apps/web/src/modules/map)               |
| Per-key store subscriptions (no over-render) | [`apps/web/src/modules/selection`](apps/web/src/modules/selection)   |
| Live telemetry handling in the UI            | [`apps/web/src/modules/telemetry`](apps/web/src/modules/telemetry)   |
| Geofencing (zones, alerts)                   | [`apps/web/src/modules/geofencing`](apps/web/src/modules/geofencing) |
| NMEA 0183 / AIS parsers                      | [`packages/shared/src/parsers`](packages/shared/src/parsers)         |
| Binary WebSocket codecs                      | [`packages/shared/src/codecs`](packages/shared/src/codecs)           |
| Kalman filtering for track smoothing         | [`packages/shared/src/kalman`](packages/shared/src/kalman)           |
| XState machines (ingest source failover)     | [`packages/shared/src/machines`](packages/shared/src/machines)       |
| Multi-source ingest + dead-letter queue      | [`apps/api/src/ingest`](apps/api/src/ingest)                         |
| Raspberry Pi edge bridge (UDP → mTLS WSS)    | [`apps/edge-bridge/src`](apps/edge-bridge/src)                       |

## Engineering highlights

- **Custom receiving hardware**: RTL-SDR Blog V4 + LNA + bandpass filter + DIY 162 MHz dipole
- **Hand-written NMEA 0183 / AIS parser** covering message types 1/2/3/5/18, with
  multipart reassembly and spec-correct branded numeric types
- **Multi-source ingest with automatic failover** (local SDR → WebSDR → AISStream),
  modelled as an XState state machine
- **Binary WebSocket protocol** for telemetry: compact frames instead of JSON chatter
- **Frame-budget rendering**: updates batched to what the display can actually show;
  shapes drawn once and repositioned, not re-rendered
- **Dead-reckoning extrapolation** between position reports, with an explicit freeze
  policy when a source goes stale
- **PostGIS spatial queries** (`ST_DWithin` on a GiST index) for zone logic
- **26 Architecture Decision Records** with D2 diagrams documenting every significant
  design choice

## Decision log (ADRs)

The [`adr/`](adr/) directory documents the reasoning behind the architecture.
A few worth reading:

| Decision                                     | ADR                                                            |
| -------------------------------------------- | -------------------------------------------------------------- |
| Map engine architecture (React ↔ imperative) | [0002](adr/0002-map-engine-architecture.md)                    |
| AIS multipart message reassembly             | [0003](adr/0003-ais-multipart-reassembly.md)                   |
| Binary WebSocket + ingest co-location        | [0007](adr/0007-d5-binary-websocket-and-ingest-co-location.md) |
| Pluggable multi-source ingest                | [0008](adr/0008-pluggable-source-architecture.md)              |
| Dead-reckoning extrapolation and freeze      | [0011](adr/0011-dead-reckoning-extrapolation-freeze.md)        |
| Branded numeric AIS types                    | [0013](adr/0013-branded-numeric-ais-types.md)                  |

## Stack

**Front-end**: React 19, TypeScript 5, MapLibre GL (WebGL2), Tailwind v4 + shadcn/ui,
Nano Stores, XState 5, Vite
**Back-end**: NestJS 11, Prisma, PostgreSQL 16 + PostGIS 3.4, binary WS, OpenAPI
**Edge**: Node on Raspberry Pi, UDP listener, mTLS over Tailscale
**Infra**: Vercel (web), Fly.io (api), Docker, GitHub Actions CI with quality gates
(format, lint, typecheck, tests, bundle budget, dead-code audit)

## Local development

Requires Node 22+, pnpm 9+, Docker (Postgres + PostGIS).

```sh
pnpm install
docker compose up -d
pnpm --filter @sps/api db:migrate
pnpm dev
```

## Licence

Source-available for review only. You may read this code to evaluate the work.
Any use, commercial or otherwise, plus redistribution and derivative works,
requires written permission - see [LICENSE](LICENSE).

## Author

Built and maintained by the repository owner. All rights reserved.
This is a private repository - access is granted individually. Contact via GitHub.
