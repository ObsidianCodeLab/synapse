#!/usr/bin/env bash
# Import Apple signing certificate and codesign embedded binaries before Tauri build.
# Invoked by release workflows; may be fetched from main at runtime when checkout is an old tag.
set -euo pipefail

MACOS_CODESIGN_SCRIPT_VERSION="v3-macos-keychain-repack"

RESOURCE_DIR="${RESOURCE_DIR:-apps/setup-center/src-tauri/resources}"
ENTITLEMENTS="${ENTITLEMENTS:-apps/setup-center/src-tauri/Entitlements.plist}"
IDENTITY="${APPLE_SIGNING_IDENTITY:-}"

echo "macos-codesign-embedded.sh ${MACOS_CODESIGN_SCRIPT_VERSION}"

CERT_B64="$(printf '%s' "${APPLE_CERTIFICATE:-}" | tr -d '[:space:]')"
if [ -z "$CERT_B64" ]; then
  echo "No APPLE_CERTIFICATE configured, skipping codesign."
  exit 0
fi

P12_PATH="${RUNNER_TEMP:-/tmp}/certificate.p12"
echo "Decoding APPLE_CERTIFICATE (base64 length: ${#CERT_B64})..."
printf '%s' "$CERT_B64" | base64 --decode > "$P12_PATH"
if [ ! -s "$P12_PATH" ]; then
  echo "ERROR: decoded certificate.p12 is empty."
  echo "APPLE_CERTIFICATE must be a single-line base64 of the .p12 file (no PEM headers)."
  exit 1
fi

CERT_PASS="$(printf '%s' "${APPLE_CERTIFICATE_PASSWORD:-}" | tr -d '[:space:]')"
if [ -z "$CERT_PASS" ]; then
  echo "ERROR: APPLE_CERTIFICATE_PASSWORD is empty."
  exit 1
fi

P12_SIZE=$(wc -c < "$P12_PATH" | tr -d ' ')
echo "Preflight: certificate.p12 size=${P12_SIZE} bytes"
FIRST_BYTE=$(xxd -p -l 1 "$P12_PATH" 2>/dev/null || echo "")
if [ -n "$FIRST_BYTE" ] && [ "$FIRST_BYTE" != "30" ]; then
  echo "WARNING: decoded file does not look like DER PKCS12 (expected 0x30, got 0x${FIRST_BYTE})."
  echo "  APPLE_CERTIFICATE may be PEM text or corrupted base64."
fi

OPENSSL_ERR=$(mktemp)
if ! openssl pkcs12 -info -in "$P12_PATH" -passin "pass:${CERT_PASS}" -noout 2>"$OPENSSL_ERR"; then
  echo "ERROR: PKCS12 preflight failed."
  echo "  - APPLE_CERTIFICATE must be single-line base64 of a .p12 export (not PEM text)."
  echo "  - APPLE_CERTIFICATE_PASSWORD must match the password set when exporting the .p12."
  echo "  - Re-encode on macOS: base64 -i certificate.p12 | tr -d '\\n'"
  echo "  - Verify locally: openssl pkcs12 -info -in certificate.p12 -passin pass:YOUR_PASSWORD -noout"
  sed 's/^/  openssl: /' "$OPENSSL_ERR" >&2 || true
  rm -f "$OPENSSL_ERR"
  exit 1
fi
rm -f "$OPENSSL_ERR"
echo "PKCS12 preflight passed (OpenSSL)."

# OpenSSL 3 can decrypt many PKCS12 variants that macOS Security.framework rejects.
# Re-export with 3DES + SHA1 MAC so `security import` succeeds on GitHub runners.
P12_KEYCHAIN="${P12_PATH}.keychain.p12"
echo "Repackaging PKCS12 for macOS keychain compatibility..."
REPACK_ERR=$(mktemp)
repack_ok=0
if openssl pkcs12 -in "$P12_PATH" -passin "pass:${CERT_PASS}" -legacy \
  -export -out "$P12_KEYCHAIN" -passout "pass:${CERT_PASS}" \
  -certpbe PBE-SHA1-3DES -keypbe PBE-SHA1-3DES -macalg sha1 2>"$REPACK_ERR"; then
  repack_ok=1
elif openssl pkcs12 -in "$P12_PATH" -passin "pass:${CERT_PASS}" \
  -export -out "$P12_KEYCHAIN" -passout "pass:${CERT_PASS}" \
  -certpbe PBE-SHA1-3DES -keypbe PBE-SHA1-3DES -macalg sha1 2>"$REPACK_ERR"; then
  repack_ok=1
fi
if [ "$repack_ok" -ne 1 ]; then
  echo "ERROR: failed to repackage PKCS12 for macOS keychain."
  sed 's/^/  openssl: /' "$REPACK_ERR" >&2 || true
  rm -f "$REPACK_ERR"
  exit 1
fi
rm -f "$REPACK_ERR"
REPACK_SIZE=$(wc -c < "$P12_KEYCHAIN" | tr -d ' ')
echo "Repackaged PKCS12 size=${REPACK_SIZE} bytes"

echo "Importing certificate to keychain..."
KEYCHAIN_PATH="${RUNNER_TEMP:-/tmp}/app-signing.keychain-db"
KEYCHAIN_PASSWORD=$(openssl rand -base64 32)
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
IMPORT_ERR=$(mktemp)
if ! security import "$P12_KEYCHAIN" -k "$KEYCHAIN_PATH" -f pkcs12 -A \
  -P "$CERT_PASS" -T /usr/bin/codesign -T /usr/bin/security 2>"$IMPORT_ERR"; then
  echo "ERROR: keychain import failed after PKCS12 repack."
  sed 's/^/  security: /' "$IMPORT_ERR" >&2 || true
  rm -f "$IMPORT_ERR"
  exit 1
fi
rm -f "$IMPORT_ERR"
security set-key-partition-list -S apple-tool:,apple: -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security list-keychains -d user -s "$KEYCHAIN_PATH" $(security list-keychains -d user | tr -d '"')

echo "Signing embedded binaries with identity: ${IDENTITY}"
find "$RESOURCE_DIR" -type f -perm +111 | while read -r bin; do
  if [[ "$bin" == *"/Python.framework/"* ]]; then
    echo "  Skipping Python.framework inner binary at resource stage: $bin"
    continue
  fi
  echo "  Signing: $bin"
  codesign --force --options runtime --timestamp --entitlements "$ENTITLEMENTS" --sign "$IDENTITY" "$bin"
done
echo "All embedded binaries signed."
