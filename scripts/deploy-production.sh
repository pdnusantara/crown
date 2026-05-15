#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="/var/www/crown"
BACKEND_DIR="${APP_ROOT}/backend"
TMP_ROOT="${APP_ROOT}/.deploy"
TMP_DIST="${TMP_ROOT}/dist-next"
BACKUP_ROOT="${TMP_ROOT}/backups"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIST="${BACKUP_ROOT}/dist-${TIMESTAMP}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:3001/api/health}"
SITE_HEALTH_URL="${SITE_HEALTH_URL:-https://sembapos.com/}"
HEALTH_RETRIES="${HEALTH_RETRIES:-15}"
HEALTH_DELAY_SECONDS="${HEALTH_DELAY_SECONDS:-2}"

echo "==> Prepare deploy directories"
mkdir -p "${TMP_ROOT}" "${BACKUP_ROOT}"
rm -rf "${TMP_DIST}"

rollback() {
  echo "!! Deploy failed, starting rollback"
  if [[ -d "${BACKUP_DIST}" ]]; then
    rm -rf "${APP_ROOT}/dist"
    mv "${BACKUP_DIST}" "${APP_ROOT}/dist"
    echo "==> Frontend dist restored from backup"
  fi
}

trap rollback ERR

wait_for_health() {
  local url="$1"
  local tries="$2"
  local delay="$3"
  local i
  for ((i = 1; i <= tries; i++)); do
    if curl -fsS "$url" >/dev/null; then
      return 0
    fi
    sleep "$delay"
  done
  echo "Healthcheck failed for ${url} after ${tries} attempts"
  return 1
}

echo "==> Install dependencies"
cd "${APP_ROOT}"
npm install --legacy-peer-deps
npm --prefix "${BACKEND_DIR}" install --legacy-peer-deps

echo "==> Build frontend to temporary directory"
npm run build -- --outDir "${TMP_DIST}"

echo "==> Preflight check dist artifacts"
[[ -f "${TMP_DIST}/index.html" ]] || { echo "Missing index.html in built dist"; exit 1; }
[[ -d "${TMP_DIST}/assets" ]] || { echo "Missing assets folder in built dist"; exit 1; }

echo "==> Preflight API healthcheck"
wait_for_health "${API_HEALTH_URL}" "${HEALTH_RETRIES}" "${HEALTH_DELAY_SECONDS}"

echo "==> Swap dist atomically (with backup)"
if [[ -d "${APP_ROOT}/dist" ]]; then
  mv "${APP_ROOT}/dist" "${BACKUP_DIST}"
fi

# Keep previous hashed assets to prevent dynamic-import 404s
# for users whose browser still references older chunk names.
if [[ -d "${BACKUP_DIST}/assets" && -d "${TMP_DIST}/assets" ]]; then
  cp -an "${BACKUP_DIST}/assets/." "${TMP_DIST}/assets/" || true
fi

mv "${TMP_DIST}" "${APP_ROOT}/dist"

echo "==> Restart backend"
pm2 startOrReload "${APP_ROOT}/ecosystem.config.cjs" --only crown-backend --update-env
pm2 save

echo "==> Post-deploy smoke tests"
wait_for_health "${API_HEALTH_URL}" "${HEALTH_RETRIES}" "${HEALTH_DELAY_SECONDS}"
curl -fkIs "${SITE_HEALTH_URL}" >/dev/null

echo "==> Deploy success"
echo "Backup kept at: ${BACKUP_DIST}"
