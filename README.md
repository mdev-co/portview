<div align="center">

# ⚓ Smart Port Szczecin (SPS)

### Real-time AIS vessel tracker with custom SDR receiver

**[▶ Live demo - sps-radar.pl](https://sps-radar.pl)**

`TypeScript` · `NestJS` · `React 19` · `MapLibre GL` · `PostGIS` · `WebSocket`

</div>

---

## What this is

An end-to-end maritime situational awareness platform, built solo - from a
DIY radio antenna to the browser. Vessels transmitting AIS over 162 MHz are
received by a custom SDR rig, decoded from raw NMEA 0183, persisted in
PostGIS and streamed as binary WebSocket frames to a React + MapLibre
front-end that renders continuously moving targets within a strict frame
budget.

**Full signal path:** RTL-SDR antenna → NMEA 0183 decoder → NestJS ingest
→ PostgreSQL/PostGIS → binary WebSocket → React / MapLibre GL

## Engineering notes

If you are evaluating this repository, these are the parts worth a look:

| Area                                                     | Where                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| Architecture decisions (26 ADRs, with D2 diagrams)       | [`adr/`](adr/)                                                   |
| AIS multipart message reassembly                         | [`adr/0003-ais-multipart-reassembly.md`](adr/)                   |
| Binary WebSocket protocol + ingest co-location           | [`adr/0007-d5-binary-websocket-and-ingest-co-location.md`](adr/) |
| Pluggable multi-source ingest (SDR → WebSDR → AISStream) | [`adr/0008-pluggable-source-architecture.md`](adr/)              |
| Dead-reckoning extrapolation between position reports    | [`adr/0011-dead-reckoning-extrapolation-freeze.md`](adr/)        |
| Branded numeric types for spec-correct AIS values        | [`adr/0013-branded-numeric-ais-types.md`](adr/)                  |
| Map engine architecture (React ↔ imperative bridge)      | [`adr/0002-map-engine-architecture.md`](adr/)                    |

## Highlights

- Custom SDR receiving rig (RTL-SDR + LNA + bandpass + DIY 162 MHz dipole)
- Custom NMEA 0183 parser (types 1/2/3/5/18) in NestJS
- Multi-source ingest with XState fallback (SDR → WebSDR → AISStream)
- Atomic vessel store with per-key subscription (Nano Stores `map()`)
- Binary WebSocket frames for telemetry
- PostGIS spatial queries (`ST_DWithin` with GiST index)
- Built-in observability: `/?debug=1` dev panel

## Local development

Requires: Node 22+, pnpm 9+, Docker (Postgres + PostGIS).

```sh
pnpm install
docker compose up -d
pnpm --filter @sps/api db:migrate
pnpm dev
```

## Architecture

[Day 7 deliverable]

## Live demo

[Day 7 deliverable]

## Licence

Source-available for review only. You may read this code to evaluate the work.
Any use, commercial or otherwise, plus redistribution and derivative
works, requires written permission - see [LICENSE](LICENSE).

## Author

**Michał Roszko** - Software Engineer, React / TypeScript, real-time
geospatial systems.
[sps-radar.pl](https://sps-radar.pl) · grafogeum@gmail.com
