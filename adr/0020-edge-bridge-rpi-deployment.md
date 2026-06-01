# ADR 0020 - Edge bridge deployment on Raspberry Pi 4

**Status:** Accepted
**Date:** 2026-05-29
**Supersedes:** none
**Related:** ADR-0011 (SDR hardware setup), ADR-0018 (edge bridge transport), ADR-0019 (trust zones and sandbox)

## Context

ADR-0019 established the trust zones and sandbox profile for the edge bridge. The remaining piece was the physical deployment: which board, which OS, which artefact layout, and how the bridge reaches the backend across an asymmetric NAT. This ADR records those operational decisions for one device live in Szczecin.

The deployment target is the Niebuszewo ground-floor location described in ADR-0011, where RF reach is limited but at least one antenna and one receiver chain are present. The bridge has to forward decoded NMEA from `rtl_ais` to the Fly-hosted backend without exposing a public port on the device, survive reboots, and rebuild cleanly when the operator iterates.

## Decisions

### D-20-1: Raspberry Pi 4 Model B 4 GB, Debian Trixie Lite 64-bit (arm64)

Pi 4 replaces an earlier Pi 2 B that failed under load: the older USB 2.0 controller produced PLL-not-locked storms with the RTL-SDR Blog V4 under sustained sample rates, and the armhf userland forced the project onto an unofficial Node 18 build.

Pi 4 with Trixie Lite resolves both:

- USB 3 controller plus a powered hub (ICY BOX) eliminates the under-voltage and the PLL errors observed on Pi 2 B.
- arm64 userland gets first-class NodeSource builds for Node 22 LTS, matching `engines.node` in the monorepo. No engine-strict overrides needed.
- Trixie is the current Debian stable since August 2025; security updates apply through 2030.

The board runs headless. WiFi is configured at imaging time via Raspberry Pi Imager preconfigure. SSH is key-only, password authentication disabled.

### D-20-2: Filesystem layout follows FHS, ownership split between root and a dedicated group

The bridge artefacts land in four locations, each chosen for the role it plays:

| Path                                          | Owner                       | Mode | Role                                                                                                  |
| --------------------------------------------- | --------------------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| `/opt/sps-edge-bridge/`                       | `sps:sps`                   | 0755 | Application code and built `dist/`. `ReadOnlyPaths=` in the unit protects it from the running bridge. |
| `/etc/sps-edge-bridge/`                       | `root:sps-edge-bridge-keys` | 0750 | Certs and env file. Bridge reads via supplementary group.                                             |
| `/etc/systemd/system/sps-edge-bridge.service` | `root:root`                 | 0644 | Unit definition. Managed via `systemctl edit` for local overrides.                                    |
| `/usr/local/bin/rtl_ais`                      | `root:root`                 | 0755 | Locally built decoder binary. No apt package exists for `rtl_ais`.                                    |

This mirrors the FHS conventions used by every long-running Linux service. Operators reading `find /etc -name "*edge-bridge*"` find configuration; `find /opt` finds the application; `find /usr/local/bin` finds locally compiled tools. The split between code and config means a rotated cert or changed backend URL does not require redeploying the application.

### D-20-3: Install via tarball + scp from the workstation, not `git clone`

The first deploy provisions code via a workstation-side `tar czf` over `scp`. The Pi never holds a Git working copy of the full repository.

Reasoning:

- `pnpm install` resolves the lockfile; the bridge's transitive dependency tree is the same on Pi as on the workstation. No need for the Pi to talk to GitHub.
- A repo clone on the Pi means another credential to manage (SSH deploy key or PAT) and another attack surface if the Pi is compromised. Tarball means the workstation holds the only repo identity.
- Updates land via the same `tar` over `scp`, then `pnpm install --frozen-lockfile && pnpm --filter @sps/edge-bridge build && systemctl restart`. This is one script away from Ansible later.

The trade-off is that the Pi does not know which Git revision it runs. A future iteration will write the workstation `git rev-parse HEAD` into a version file shipped alongside `dist/`.

### D-20-4: `rtl_ais` built from upstream source, not installed via apt

Debian Trixie ships `rtl-sdr` and `librtlsdr-dev` packages but no `rtl_ais` package. The decoder is built from `github.com/dgiardini/rtl-ais` with the standard `make && sudo make install`, landing in `/usr/local/bin/rtl_ais`.

The build is deterministic with the same toolchain (gcc 14, libusb 1.0.28) that Trixie ships, so the operator can rebuild on a fresh Pi by re-running the same commands. The `Documentation=` URL in the unit file points to the runbook that captures both this build and the surrounding apt prerequisites.

A pre-built binary checked into the repo was considered and rejected: cross-builds against arm64 musl libraries are brittle, and the small operational cost of the build (one minute on Pi 4) is paid once.

### D-20-5: Backend reach through Tailscale overlay, no public port on the Pi

The Pi runs behind a residential NAT with no inbound port forwarding. The backend runs on Fly with a public address but the edge ingest port is firewalled to a CN-allowlisted device pool.

Tailscale gives every node in the tailnet a stable 100.x address. The bridge's `EDGE_BRIDGE_BACKEND_URL` resolves to the workstation's Tailscale IP during local development and to the Fly machine's tailnet address in production. Either way the bridge initiates the connection, no inbound port is exposed on the Pi, and Tailscale's coordination server brokers NAT traversal without explicit port-forwarding.

Plain WAN routing was considered and rejected: residential ISPs in Poland frequently use CGNAT, the bridge cannot reach Fly directly with a stable address, and a WAN-exposed backend would require a much stricter cloud-side firewall. The overlay is the cheapest way to keep the bridge initiating and the backend hidden.

### D-20-6: Server cert SAN includes the Tailscale IP

ADR-0019 establishes mTLS with a CN allowlist. The server cert in `certs/server/server.crt` is signed by the project CA. Until this deploy the SAN was `DNS:localhost, IP:127.0.0.1, DNS:<workstation-hostname>`, sufficient for unit tests against `localhost` but not for a real Pi connecting over Tailscale.

The server cert is regenerated with the workstation's Tailscale IP included in the SAN list. The CA, the workstation key, and the bridge's client cert are unchanged. Pi-side configuration does not change.

## Consequences

- The Pi is reproducible: starting from a flashed SD card, the runbook in `docs/runbooks/edge-bridge-rpi-deploy.md` brings the bridge up in roughly thirty minutes. No state escapes to the Pi that the workstation does not hold a copy of.
- The deployment is **not Ansible-driven yet**. Each step is a manual command from the runbook. This is acceptable for one device; the next device increases the case for an Ansible playbook.
- The bridge can be moved to a different Pi (different hardware) by re-issuing the per-device client cert with the same CN, copying it over, and restarting. The CA does not rotate.
- Operators who replace the SD card lose the runbook-applied state and have to re-run the runbook. State directories under `/var/lib/sps-edge-bridge/` are recreated by systemd.

## Verification

- Boot-time: `journalctl -u sps-edge-bridge.service` shows `READY=1` notify within ten seconds and `WSS connected` within thirty.
- mTLS: `sudo journalctl -u sps-api` on the workstation shows `edge bridge connected: cn=pi-szczecin-01`.
- End-to-end: `rtl_ais -h 127.0.0.1 -P 10110 -n` on the Pi prints AIVDM sentences; within a few seconds the workstation backend logs `accepted=N` rising and the frontend shows vessels.

## What this does not address

- Automatic provisioning of a fresh Pi: still manual via runbook.
- `rtl_ais` running as a managed systemd unit: foreground-only today, will be wrapped in a dedicated `rtl_ais.service` so the bridge unit can `Requires=` it.
- Multi-device fleet: env-based allowlist holds for the first three devices, beyond that the DB-backed registry from ADR-0019 D-19-4 becomes necessary.
