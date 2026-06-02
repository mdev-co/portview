#!/bin/sh
# Container entrypoint for the SPS api. Three responsibilities, in order:
#
#   1. Materialise mTLS certs from Fly secrets to /tmp/certs and point
#      the app at them via env. The certs do NOT live in the image layer
#      so they cannot leak through registry access; they exist only in
#      the running container's tmpfs.
#
#   2. Start tailscaled in userspace networking mode and join the
#      tailnet using TAILSCALE_AUTHKEY (a Fly secret). Pi 4 in
#      Niebuszewo connects to this machine's Tailscale IP for mTLS
#      edge-ingest; no public 8443 port is exposed. Userspace mode
#      avoids the CAP_NET_ADMIN requirement so the non-root container
#      user can run the daemon.
#
#   3. Supervise the upstream CMD (Prisma migrate + Nest app start) so
#      SIGTERM from Fly reaches tailscaled before the script exits.
#      Without supervision the daemon would be killed ungracefully and
#      the persistent state file on /var/lib/tailscale could be
#      corrupted, costing the stable tailnet identity the volume exists
#      to preserve.
#
# Failure of step 2 stops the container with a non-zero exit so Fly
# health-checks fail loud rather than silently serving without
# edge-ingest.

set -eu

CERT_DIR=/tmp/certs
mkdir -p "$CERT_DIR"

# Cert materialisation is optional. The api boots fine without the
# edge-ingest listener (it remains in fallback-source mode using
# AisStream), so a deploy can land Tailscale first and the certs in a
# follow-up secret rotation once the Fly machine's tailnet IP is known
# and a server cert is regenerated to cover it. When all three secrets
# are present we write them to tmpfs and export paths the app reads.
if [ -n "${EDGE_INGEST_SERVER_CERT:-}" ] && \
   [ -n "${EDGE_INGEST_SERVER_KEY:-}" ] && \
   [ -n "${EDGE_INGEST_CA_CERT:-}" ]; then
  printf '%s\n' "$EDGE_INGEST_SERVER_CERT" > "$CERT_DIR/server.crt"
  printf '%s\n' "$EDGE_INGEST_SERVER_KEY" > "$CERT_DIR/server.key"
  printf '%s\n' "$EDGE_INGEST_CA_CERT" > "$CERT_DIR/ca.crt"
  chmod 600 "$CERT_DIR/server.key"
  export EDGE_INGEST_SERVER_CERT_PATH="$CERT_DIR/server.crt"
  export EDGE_INGEST_SERVER_KEY_PATH="$CERT_DIR/server.key"
  export EDGE_INGEST_CA_CERT_PATH="$CERT_DIR/ca.crt"
  if [ -n "${EDGE_INGEST_ALLOWED_CNS:-}" ]; then
    echo "[entrypoint] edge-ingest cert material installed at $CERT_DIR and CN allowlist present; listener will start"
  else
    echo "[entrypoint] edge-ingest cert paths exported but EDGE_INGEST_ALLOWED_CNS is unset; api will start without the edge-ingest listener"
  fi
else
  echo "[entrypoint] edge-ingest cert secrets not set; api will start without the edge-ingest listener"
fi

if [ -z "${TAILSCALE_AUTHKEY:-}" ]; then
  echo "[entrypoint] missing TAILSCALE_AUTHKEY secret" >&2
  exit 1
fi

# Userspace networking: no TUN device, no CAP_NET_ADMIN. Daemon state
# lives on a Fly volume mounted at /var/lib/tailscale so the device's
# private key + machine identity persist across deploys. Without this
# the daemon re-registers as a fresh ephemeral device on every restart
# and Tailscale appends a `-1`, `-2`, ... suffix to the hostname (name
# collision) and rotates the tailnet IP. With persistence the hostname
# `sps-api-fly` and IP stay stable forever.
TS_DIR=/var/lib/tailscale
TS_STATE="$TS_DIR/tailscaled.state"
TS_SOCK="$TS_DIR/tailscaled.sock"
mkdir -p "$TS_DIR"

echo "[entrypoint] starting tailscaled in userspace networking mode with persistent state at $TS_DIR"
tailscaled \
  --tun=userspace-networking \
  --state="$TS_STATE" \
  --socket="$TS_SOCK" \
  --statedir="$TS_DIR" &
TS_PID=$!

# Give the daemon a moment to bind the socket before tailscale up runs.
i=0
while [ ! -S "$TS_SOCK" ] && [ "$i" -lt 30 ]; do
  sleep 0.2
  i=$((i + 1))
done
if [ ! -S "$TS_SOCK" ]; then
  echo "[entrypoint] tailscaled socket never appeared" >&2
  kill "$TS_PID" 2>/dev/null || true
  exit 1
fi

echo "[entrypoint] joining tailnet as sps-api-fly"
tailscale --socket="$TS_SOCK" up \
  --authkey="$TAILSCALE_AUTHKEY" \
  --hostname=sps-api-fly \
  --accept-routes=false

TS_IP=$(tailscale --socket="$TS_SOCK" ip -4 2>/dev/null || echo "")
if [ -z "$TS_IP" ]; then
  echo "[entrypoint] failed to read Tailscale IP after up" >&2
  exit 1
fi
echo "[entrypoint] tailnet IP = $TS_IP"

# Forward SIGTERM / SIGINT to tailscaled before the script exits so the
# daemon has a chance to flush its state file (`tailscaled.state`) to the
# persistent /var/lib/tailscale volume. Without this trap, Fly's stop
# signal lands on the Nest process (PID 1 via tini) and tailscaled is
# torn down ungracefully, which can corrupt the state file and cost the
# stable device identity (hostname, tailnet IP) that the volume exists
# to preserve.
trap 'kill -TERM "$TS_PID" 2>/dev/null; wait "$TS_PID" 2>/dev/null' TERM INT

# Hand off to the upstream CMD (Prisma migrate + Nest app). `exec` would
# replace this shell and lose the trap; using a foreground child + wait
# keeps the trap active so tailscaled receives the signal on shutdown.
"$@" &
APP_PID=$!
# Disable `set -e` around `wait` so a non-zero app exit (Nest crash,
# Prisma migration failure) still triggers the tailscaled shutdown path
# below; otherwise the daemon would be reaped ungracefully by the
# container runtime and lose state.
set +e
wait "$APP_PID"
APP_RC=$?
set -e
kill -TERM "$TS_PID" 2>/dev/null || true
wait "$TS_PID" 2>/dev/null || true
exit "$APP_RC"
