<div align="center">

# ⚓ Smart Port Szczecin (SPS)

### Real-time AIS vessel tracker with custom SDR receiver

`Day 0 / 14` · `TypeScript` · `NestJS` · `React 19` · `MapLibre GL` · `PostGIS`

</div>

---

**Stack:** NestJS · React 19 · MapLibre GL · Tailwind v4 + shadcn/ui · PostGIS · TypeScript · pnpm workspaces  
**Deploy:** Vercel + Fly.io  
**Tile source:** OpenStreetMap (MVP)  
**Data:** local SDR (RTL-SDR Blog V4) + WebSDR + [aisstream.io](https://aisstream.io) fallback

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
