#!/usr/bin/env bash
# Generates the certificate chain that the apps/api edge-ingest listener
# and every apps/edge-bridge instance need to mutually authenticate.
#
# Output: $REPO_ROOT/certs/ (gitignored)
#   ca/ca.key                     root CA private key
#   ca/ca.crt                     root CA certificate (4096-bit RSA, 10-year validity)
#   server/server.key             server private key
#   server/server.crt             server certificate (SAN: localhost + extra DNS names from CLI)
#   clients/<device>/client.key   per-device client private key
#   clients/<device>/client.crt   per-device client certificate (CN = <device>)
#
# Determinism: re-running the script never overwrites existing files.
# To rotate a key, delete its directory first.
#
# Usage:
#   scripts/gen-edge-certs.sh ca
#   scripts/gen-edge-certs.sh server <extra-dns-1> [<extra-dns-2> ...]
#   scripts/gen-edge-certs.sh client <device-cn>
#
# Typical bootstrap for a local dev environment:
#   scripts/gen-edge-certs.sh ca
#   scripts/gen-edge-certs.sh server
#   scripts/gen-edge-certs.sh client pi-szczecin-01

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
CERTS_DIR="$REPO_ROOT/certs"
CA_DIR="$CERTS_DIR/ca"
SERVER_DIR="$CERTS_DIR/server"
CLIENTS_DIR="$CERTS_DIR/clients"

CA_VALIDITY_DAYS=3650
LEAF_VALIDITY_DAYS=365
KEY_BITS=4096

require_openssl() {
  if ! command -v openssl >/dev/null 2>&1; then
    echo "openssl not found on PATH" >&2
    exit 1
  fi
}

ensure_ca() {
  if [[ -f "$CA_DIR/ca.key" && -f "$CA_DIR/ca.crt" ]]; then
    return 0
  fi
  mkdir -p "$CA_DIR"
  openssl genrsa -out "$CA_DIR/ca.key" "$KEY_BITS"
  openssl req -x509 -new -nodes -sha256 \
    -key "$CA_DIR/ca.key" \
    -days "$CA_VALIDITY_DAYS" \
    -subj "/CN=sps-edge-root-ca" \
    -out "$CA_DIR/ca.crt"
  chmod 600 "$CA_DIR/ca.key"
  echo "wrote $CA_DIR/ca.crt"
}

gen_ca() {
  if [[ -f "$CA_DIR/ca.crt" ]]; then
    echo "CA already exists at $CA_DIR/ca.crt - delete the directory to rotate"
    exit 0
  fi
  ensure_ca
}

gen_server() {
  ensure_ca
  if [[ -f "$SERVER_DIR/server.crt" ]]; then
    echo "server cert already exists at $SERVER_DIR/server.crt - delete the directory to rotate"
    exit 0
  fi
  mkdir -p "$SERVER_DIR"

  local san="DNS:localhost,IP:127.0.0.1"
  for extra in "$@"; do
    san="${san},DNS:${extra}"
  done

  openssl genrsa -out "$SERVER_DIR/server.key" "$KEY_BITS"

  local cnf="$SERVER_DIR/openssl.cnf"
  cat >"$cnf" <<EOF
[ req ]
distinguished_name = dn
prompt = no
req_extensions = v3_req

[ dn ]
CN = sps-edge-ingest

[ v3_req ]
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = $san
EOF

  openssl req -new -key "$SERVER_DIR/server.key" \
    -out "$SERVER_DIR/server.csr" \
    -config "$cnf"

  openssl x509 -req -sha256 \
    -in "$SERVER_DIR/server.csr" \
    -CA "$CA_DIR/ca.crt" -CAkey "$CA_DIR/ca.key" -CAcreateserial \
    -days "$LEAF_VALIDITY_DAYS" \
    -extfile "$cnf" -extensions v3_req \
    -out "$SERVER_DIR/server.crt"

  chmod 600 "$SERVER_DIR/server.key"
  rm "$SERVER_DIR/server.csr" "$cnf"
  echo "wrote $SERVER_DIR/server.crt (SAN: $san)"
}

gen_client() {
  if [[ $# -lt 1 ]]; then
    echo "usage: $0 client <device-cn>" >&2
    exit 1
  fi
  local cn="$1"
  if [[ ! "$cn" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$ ]]; then
    echo "invalid device CN '$cn' (allowed: 1-63 chars, alnum/underscore/dot/dash, no leading dash)" >&2
    exit 1
  fi
  ensure_ca
  local dir="$CLIENTS_DIR/$cn"
  if [[ -f "$dir/client.crt" ]]; then
    echo "client cert already exists at $dir/client.crt - delete the directory to rotate"
    exit 0
  fi
  mkdir -p "$dir"

  openssl genrsa -out "$dir/client.key" "$KEY_BITS"

  local cnf="$dir/openssl.cnf"
  cat >"$cnf" <<EOF
[ req ]
distinguished_name = dn
prompt = no
req_extensions = v3_req

[ dn ]
CN = $cn

[ v3_req ]
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth
EOF

  openssl req -new -key "$dir/client.key" \
    -out "$dir/client.csr" \
    -config "$cnf"

  openssl x509 -req -sha256 \
    -in "$dir/client.csr" \
    -CA "$CA_DIR/ca.crt" -CAkey "$CA_DIR/ca.key" -CAcreateserial \
    -days "$LEAF_VALIDITY_DAYS" \
    -extfile "$cnf" -extensions v3_req \
    -out "$dir/client.crt"

  chmod 600 "$dir/client.key"
  rm "$dir/client.csr" "$cnf"
  echo "wrote $dir/client.crt (CN=$cn)"
}

usage() {
  cat <<EOF
usage: $0 <command> [args]
  ca                            generate root CA (idempotent)
  server [<extra-dns> ...]      generate server cert (SAN always includes localhost + 127.0.0.1)
  client <device-cn>            generate per-device client cert
EOF
  exit 1
}

require_openssl

case "${1:-}" in
  ca) shift; gen_ca "$@" ;;
  server) shift; gen_server "$@" ;;
  client) shift; gen_client "$@" ;;
  *) usage ;;
esac
