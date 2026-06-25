#!/usr/bin/env bash
# Isolated notarization smoke tests (credentials / status check / minimal DMG E2E).
# Invoked by .github/workflows/notarize-test.yml
set -euo pipefail

MODE="${MODE:-credentials}"
SUBMISSION_ID="${SUBMISSION_ID:-}"
WAIT_TIMEOUT_MINUTES="${WAIT_TIMEOUT_MINUTES:-120}"
PROFILE_NAME="${NOTARY_PROFILE_NAME:-synapse-notary-test}"
ENTITLEMENTS="${ENTITLEMENTS:-apps/setup-center/src-tauri/Entitlements.plist}"

require_notary_secrets() {
  if [ -z "${APPLE_ID:-}" ] || [ -z "${APPLE_PASSWORD:-}" ] || [ -z "${APPLE_TEAM_ID:-}" ]; then
    echo "ERROR: APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID must be set in repo secrets." >&2
    exit 1
  fi
  APPLE_ID="$(printf '%s' "$APPLE_ID" | tr -d '[:space:]')"
  APPLE_PASSWORD="$(printf '%s' "$APPLE_PASSWORD" | tr -d '[:space:]')"
  APPLE_TEAM_ID="$(printf '%s' "$APPLE_TEAM_ID" | tr -d '[:space:]')"
}

store_notary_profile() {
  xcrun notarytool store-credentials "${PROFILE_NAME}" \
    --apple-id "${APPLE_ID}" \
    --password "${APPLE_PASSWORD}" \
    --team-id "${APPLE_TEAM_ID}"
}

mode_credentials() {
  echo "== Mode: credentials =="
  store_notary_profile
  echo "Credentials stored in keychain profile: ${PROFILE_NAME}"

  echo ""
  echo "== Recent notarization history (up to 15) =="
  xcrun notarytool history \
    --keychain-profile "${PROFILE_NAME}" \
    --output-format json | python - <<'PY'
import json, sys
raw = sys.stdin.read().strip()
if not raw:
    print("(empty history)")
    raise SystemExit(0)
data = json.loads(raw)
items = data.get("history") or data.get("items") or []
if isinstance(data, dict) and "data" in data:
    items = data["data"]
if not items:
    print("(no history entries)")
    raise SystemExit(0)
for row in items[:15]:
    if isinstance(row, dict):
        attrs = row.get("attributes") or row
        sid = row.get("id") or attrs.get("id") or "?"
        status = attrs.get("status") or row.get("status") or "?"
        name = attrs.get("name") or attrs.get("submissionName") or "?"
        created = attrs.get("createdDate") or attrs.get("created") or "?"
        print(f"- {sid} | {status} | {name} | {created}")
    else:
        print(row)
PY

  echo ""
  echo "OK: Apple notary credentials accepted."
}

mode_check_submission() {
  echo "== Mode: check-submission =="
  if [ -z "${SUBMISSION_ID}" ]; then
    echo "ERROR: submission_id input is required for check-submission mode." >&2
    exit 1
  fi
  store_notary_profile

  echo "Querying submission: ${SUBMISSION_ID}"
  info_json="$(xcrun notarytool info "${SUBMISSION_ID}" \
    --keychain-profile "${PROFILE_NAME}" \
    --output-format json)"
  printf '%s\n' "${info_json}" | python -m json.tool

  status="$(printf '%s' "${info_json}" | python -c 'import json,sys; print(json.load(sys.stdin).get("status","").strip())')"
  echo ""
  echo ">>> STATUS: ${status:-unknown}"

  case "${status,,}" in
    invalid|rejected)
      echo ""
      echo "== Notarization log =="
      xcrun notarytool log "${SUBMISSION_ID}" \
        --keychain-profile "${PROFILE_NAME}" || true
      exit 1
      ;;
    accepted)
      echo "OK: Submission already accepted."
      ;;
    "in progress")
      echo "OK: Apple is still processing (In Progress)."
      ;;
    *)
      echo "NOTE: Unexpected status '${status}'."
      ;;
  esac
}

mode_minimal_dmg() {
  echo "== Mode: minimal-dmg (E2E notarization smoke test) =="
  if [ -z "${APPLE_CERTIFICATE:-}" ] || [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
    echo "ERROR: minimal-dmg requires APPLE_CERTIFICATE and APPLE_SIGNING_IDENTITY secrets." >&2
    exit 1
  fi

  IDENTITY="${APPLE_SIGNING_IDENTITY}"
  WORK_DIR="$(mktemp -d)"
  APP_NAME="Synapse Notarize Test"
  APP_PATH="${WORK_DIR}/${APP_NAME}.app"
  DMG_PATH="${WORK_DIR}/${APP_NAME}.dmg"

  cleanup() {
    rm -rf "${WORK_DIR}"
  }
  trap cleanup EXIT

  echo "Importing signing certificate (no resource binaries to sign)..."
  RESOURCE_DIR="$(mktemp -d)"
  export RESOURCE_DIR
  bash scripts/ci/macos-codesign-embedded.sh

  if [ -n "${APPLE_SIGNING_KEYCHAIN_PATH:-}" ] && [ -f "${APPLE_SIGNING_KEYCHAIN_PATH}" ]; then
    security unlock-keychain -p "${APPLE_SIGNING_KEYCHAIN_PASSWORD}" "${APPLE_SIGNING_KEYCHAIN_PATH}"
    security list-keychains -d user -s "${APPLE_SIGNING_KEYCHAIN_PATH}" \
      $(security list-keychains -d user | tr -d '"')
  fi

  mkdir -p "${APP_PATH}/Contents/MacOS"
  cat > "${APP_PATH}/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>launcher</string>
  <key>CFBundleIdentifier</key>
  <string>com.synapse.notarize-test</string>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.0.1</string>
  <key>CFBundleVersion</key>
  <string>1</string>
</dict>
</plist>
EOF
  cat > "${APP_PATH}/Contents/MacOS/launcher" <<'EOF'
#!/bin/bash
echo "Synapse notarize test OK"
EOF
  chmod +x "${APP_PATH}/Contents/MacOS/launcher"

  echo "Signing minimal test app..."
  codesign --force --options runtime --timestamp \
    --entitlements "${ENTITLEMENTS}" \
    --sign "${IDENTITY}" \
    "${APP_PATH}"
  codesign --verify --deep --strict --verbose=2 "${APP_PATH}"

  echo "Creating minimal DMG..."
  hdiutil create -volname "${APP_NAME}" \
    -srcfolder "${APP_PATH}" \
    -ov -format UDZO \
    "${DMG_PATH}"
  ls -lh "${DMG_PATH}"
  du -sh "${DMG_PATH}"

  store_notary_profile

  echo "Submitting minimal DMG (wait timeout: ${WAIT_TIMEOUT_MINUTES}m)..."
  START_TS=$(date +%s)
  submit_json="$(xcrun notarytool submit "${DMG_PATH}" \
    --keychain-profile "${PROFILE_NAME}" \
    --wait \
    --timeout "${WAIT_TIMEOUT_MINUTES}m" \
    --output-format json)"
  END_TS=$(date +%s)
  ELAPSED=$((END_TS - START_TS))
  printf '%s\n' "${submit_json}" | python -m json.tool

  status="$(printf '%s' "${submit_json}" | python -c 'import json,sys; print(json.load(sys.stdin).get("status","").strip())')"
  submission_id="$(printf '%s' "${submit_json}" | python -c 'import json,sys; print(json.load(sys.stdin).get("id",""))')"
  echo ""
  echo ">>> SUBMISSION_ID: ${submission_id}"
  echo ">>> STATUS: ${status} (elapsed ${ELAPSED}s)"

  if [ "${status,,}" != "accepted" ]; then
    echo "ERROR: Expected Accepted, got '${status}'." >&2
    if [ -n "${submission_id}" ]; then
      xcrun notarytool log "${submission_id}" \
        --keychain-profile "${PROFILE_NAME}" || true
    fi
    exit 1
  fi

  echo "Stapling ticket..."
  xcrun stapler staple -v "${DMG_PATH}"
  xcrun stapler validate -v "${DMG_PATH}"

  echo ""
  echo "OK: Minimal DMG notarized and stapled in ${ELAPSED}s."
}

require_notary_secrets

case "${MODE}" in
  credentials)
    mode_credentials
    ;;
  check-submission)
    mode_check_submission
    ;;
  minimal-dmg)
    mode_minimal_dmg
    ;;
  *)
    echo "ERROR: Unknown MODE '${MODE}'. Use credentials | check-submission | minimal-dmg." >&2
    exit 1
    ;;
esac
