#!/usr/bin/env bash
# Inspect a PEM-encoded X.509 certificate and emit a structured journal
# line about its remaining validity. Exit codes mirror the severity so
# operators can wire a downstream alert on systemd unit failures.
#
# Exit codes:
#   0  certificate valid for at least the warn window
#   1  inside the warn window (default 30 days)
#   2  inside the critical window (default 7 days) or already expired
#   3  cannot read or parse the certificate
#
# Usage:
#   check-edge-cert-expiry.sh /etc/sps-edge-bridge/client.crt
#   check-edge-cert-expiry.sh /path/to/cert.pem --warn-days 14 --crit-days 3

set -euo pipefail

WARN_DAYS=30
CRIT_DAYS=7
CERT_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --warn-days) WARN_DAYS="$2"; shift 2 ;;
    --crit-days) CRIT_DAYS="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^$/p' "$0"
      exit 0
      ;;
    *)
      if [[ -z "$CERT_PATH" ]]; then
        CERT_PATH="$1"
        shift
      else
        echo "unexpected argument: $1" >&2
        exit 3
      fi
      ;;
  esac
done

if [[ -z "$CERT_PATH" ]]; then
  echo "usage: $0 <cert-path> [--warn-days N] [--crit-days N]" >&2
  exit 3
fi

if [[ ! -r "$CERT_PATH" ]]; then
  echo "cert-check error: cannot read $CERT_PATH" >&2
  exit 3
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "cert-check error: openssl not on PATH" >&2
  exit 3
fi

# Extract subject CN and notAfter for the journal line.
SUBJECT=$(openssl x509 -in "$CERT_PATH" -noout -subject 2>/dev/null || true)
NOT_AFTER=$(openssl x509 -in "$CERT_PATH" -noout -enddate 2>/dev/null | sed 's/^notAfter=//' || true)

if [[ -z "$NOT_AFTER" ]]; then
  echo "cert-check error: failed to parse $CERT_PATH" >&2
  exit 3
fi

CRIT_SECONDS=$(( CRIT_DAYS * 86400 ))
WARN_SECONDS=$(( WARN_DAYS * 86400 ))

# openssl returns 0 if the cert is valid for at least the given seconds.
if ! openssl x509 -in "$CERT_PATH" -noout -checkend "$CRIT_SECONDS" >/dev/null 2>&1; then
  echo "cert-check CRITICAL: $SUBJECT expires before $CRIT_DAYS days (notAfter=$NOT_AFTER)" >&2
  exit 2
fi

if ! openssl x509 -in "$CERT_PATH" -noout -checkend "$WARN_SECONDS" >/dev/null 2>&1; then
  echo "cert-check WARN: $SUBJECT expires within $WARN_DAYS days (notAfter=$NOT_AFTER)" >&2
  exit 1
fi

echo "cert-check OK: $SUBJECT valid past $WARN_DAYS day window (notAfter=$NOT_AFTER)"
exit 0
