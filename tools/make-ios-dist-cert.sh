#!/usr/bin/env bash
#
# Produces the Apple Distribution certificate the release workflow signs with,
# on a machine that is not a Mac.
#
# Normally Xcode does this: it generates a keypair in the login keychain, sends
# Apple a certificate signing request, and files the certificate it gets back.
# Without a Mac the same exchange is three OpenSSL commands and a visit to the
# developer portal, which is all this script is.
#
#   1. ./tools/make-ios-dist-cert.sh csr "Your Name" "you@example.com"
#
#      Writes .secrets/ios-dist.key (the private key -- Apple never sees it and
#      it cannot be recovered if lost) and .secrets/ios-dist.csr.
#
#   2. developer.apple.com -> Certificates, IDs & Profiles -> Certificates -> +
#      Choose "Apple Distribution", upload .secrets/ios-dist.csr, download the
#      resulting .cer.
#
#   3. ./tools/make-ios-dist-cert.sh p12 ~/Downloads/distribution.cer
#
#      Pairs that certificate back up with the private key from step 1 and
#      writes .secrets/ios-dist.p12 plus the base64 to paste into the
#      APPLE_DIST_CERT_P12_BASE64 repository secret.
#
# Everything lands in .secrets/, which is gitignored. The private key and the
# .p12 are credentials: anything holding them can sign software as you.
#
# Apple allows a small number of distribution certificates per account and they
# expire after a year, so keep .secrets/ios-dist.key somewhere safe rather than
# regenerating on every machine.

set -euo pipefail

out_dir=".secrets"
key="$out_dir/ios-dist.key"
csr="$out_dir/ios-dist.csr"
p12="$out_dir/ios-dist.p12"

usage() {
  sed -n '3,30p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

# OpenSSL 3 defaults PKCS#12 to AES-256, which the macOS keychain on the runner
# will not import. -legacy asks for the RC2/3DES encoding it does read. OpenSSL
# 1.x produces that encoding already and rejects the flag.
pkcs12_legacy_flag() {
  if openssl version | grep -q '^OpenSSL 3'; then
    echo "-legacy"
  fi
}

cmd_csr() {
  local name="${1:-}" email="${2:-}"
  if [ -z "$name" ] || [ -z "$email" ]; then
    echo "usage: $0 csr \"Your Name\" \"you@example.com\"" >&2
    exit 1
  fi

  mkdir -p "$out_dir"
  if [ -e "$key" ]; then
    echo "$key already exists. Move it aside first if you really mean to" >&2
    echo "replace it -- a certificate issued against the old key becomes" >&2
    echo "unusable the moment the key is gone." >&2
    exit 1
  fi

  openssl genrsa -out "$key" 2048
  chmod 600 "$key"
  openssl req -new -key "$key" -out "$csr" \
    -subj "/emailAddress=$email/CN=$name/C=US"

  echo
  echo "Wrote $key and $csr"
  echo
  echo "Next: upload $csr at"
  echo "  https://developer.apple.com/account/resources/certificates/add"
  echo "choosing 'Apple Distribution', then run:"
  echo "  $0 p12 <the downloaded .cer>"
}

cmd_p12() {
  local cer="${1:-}"
  if [ -z "$cer" ]; then
    echo "usage: $0 p12 <path to the .cer downloaded from Apple>" >&2
    exit 1
  fi
  [ -f "$cer" ] || { echo "No such file: $cer" >&2; exit 1; }
  [ -f "$key" ] || { echo "Missing $key -- run '$0 csr' first." >&2; exit 1; }

  # Apple hands back DER; PKCS#12 wants PEM.
  local pem="$out_dir/ios-dist.pem"
  if ! openssl x509 -inform DER -in "$cer" -out "$pem" 2>/dev/null; then
    # Some downloads are already PEM, so try that before giving up.
    openssl x509 -inform PEM -in "$cer" -out "$pem"
  fi

  # Catch a certificate issued against some other key now, rather than as an
  # unhelpful codesign error 25 minutes into a 10x macOS job.
  local key_mod cert_mod
  key_mod="$(openssl rsa -in "$key" -noout -modulus)"
  cert_mod="$(openssl x509 -in "$pem" -noout -modulus)"
  if [ "$key_mod" != "$cert_mod" ]; then
    echo "::error::$cer was not issued for the key in $key." >&2
    echo "Upload $csr to the portal and download the certificate it returns." >&2
    exit 1
  fi

  local password
  password="$(openssl rand -base64 18)"

  # shellcheck disable=SC2046 # the flag is deliberately unquoted; it may be empty
  openssl pkcs12 -export $(pkcs12_legacy_flag) \
    -inkey "$key" -in "$pem" \
    -name "Apple Distribution" \
    -out "$p12" -passout "pass:$password"
  chmod 600 "$p12"
  rm -f "$pem"

  base64 -w0 < "$p12" > "$p12.base64" 2>/dev/null \
    || base64 < "$p12" | tr -d '\n' > "$p12.base64"

  echo
  echo "Wrote $p12"
  echo "Certificate expires: $(openssl x509 -in "$cer" -inform DER -noout -enddate 2>/dev/null | cut -d= -f2)"
  echo
  echo "Set these two repository secrets"
  echo "(Settings -> Secrets and variables -> Actions -> New repository secret):"
  echo
  echo "  APPLE_DIST_CERT_PASSWORD    $password"
  echo "  APPLE_DIST_CERT_P12_BASE64  contents of $p12.base64"
  echo
  echo "On Windows, copy the base64 to the clipboard with:"
  echo "  clip.exe < $p12.base64"
}

case "${1:-}" in
  csr) shift; cmd_csr "$@" ;;
  p12) shift; cmd_p12 "$@" ;;
  *) usage ;;
esac
