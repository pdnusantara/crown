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
    # 2>&1 ke /dev/null: selama jendela reload backend, percobaan pertama WAJAR
    # gagal (port belum listen). Tanpa ini, stderr "curl: (7) Failed to connect"
    # bocor ke log dan terlihat seperti deploy gagal padahal retry berikutnya
    # sukses. Error sungguhan tetap dilaporkan via pesan di bawah + exit 1.
    if curl -fsS "$url" >/dev/null 2>&1; then
      [[ $i -gt 1 ]] && echo "   backend siap (percobaan ke-${i})"
      return 0
    fi
    [[ $i -eq 1 ]] && echo "   menunggu backend siap (retry tiap ${delay}s, maks ${tries}×)…"
    sleep "$delay"
  done
  echo "Healthcheck GAGAL untuk ${url} setelah ${tries} percobaan"
  return 1
}

echo "==> Install dependencies"
cd "${APP_ROOT}"
npm install --legacy-peer-deps
npm --prefix "${BACKEND_DIR}" install --legacy-peer-deps

echo "==> Lint gate (blok deploy bila ada ERROR; warning tidak memblokir)"
npm run lint || {
  echo "✖ Lint GAGAL — deploy DIBATALKAN sebelum build.";
  echo "  Perbaiki error di atas (mis. 'is not defined' = import/variabel hilang),";
  echo "  lalu jalankan ulang deploy. Produksi belum tersentuh.";
  exit 1;
}

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

# ── Housekeeping ────────────────────────────────────────────────────────────
# Deploy sudah sukses — lepas trap rollback supaya error pembersihan TIDAK
# memicu rollback. Mencegah disk penuh: backups (6.7GB/46 snapshot pernah
# bikin disk 90%) dan chunk lama yang terus di-carry-forward via `cp -an`.
trap - ERR
KEEP_BACKUPS="${KEEP_BACKUPS:-5}"
ASSET_MAX_AGE_DAYS="${ASSET_MAX_AGE_DAYS:-14}"
# Simpan hanya N backup terbaru (rollback hanya butuh yang terakhir).
ls -1dt "${BACKUP_ROOT}"/dist-* 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -rf || true
# Age-prune chunk lama yang di-carry-forward; klien stale yang minta chunk
# hilang akan auto-reload (vite:preloadError → chunkReload). Chunk build saat
# ini ber-mtime hari ini, jadi tak akan terhapus.
find "${APP_ROOT}/dist/assets" -type f -mtime +"${ASSET_MAX_AGE_DAYS}" -delete 2>/dev/null || true
echo "==> Housekeeping selesai (simpan ${KEEP_BACKUPS} backup, prune asset > ${ASSET_MAX_AGE_DAYS} hari)"
