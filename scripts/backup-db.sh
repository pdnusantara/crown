#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Backup database PostgreSQL Crown/SembaPOS.
#
# - Format custom pg_dump (-Fc): sudah terkompresi & bisa di-restore selektif
#   via pg_restore. Aman dipakai lintas versi minor PostgreSQL.
# - Retensi: simpan N hari terakhir (default 14), sisanya di-prune otomatis.
# - Aman dijalankan dari cron (set -euo pipefail, log ke file).
#
# Pakai:  bash scripts/backup-db.sh
# Env opsional:
#   BACKUP_DIR   (default /var/www/crown/.backups/db)
#   RETENTION    (default 14  — jumlah hari dump disimpan)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$APP_DIR/backend/.env"

BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/.backups/db}"
RETENTION="${RETENTION:-14}"
LOG_FILE="$BACKUP_DIR/backup.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Ambil DATABASE_URL dari backend/.env (tanpa membocorkannya ke log).
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE tidak ditemukan" >&2; exit 1
fi
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL kosong di $ENV_FILE" >&2; exit 1
fi

TS="$(date '+%Y%m%d-%H%M%S')"
OUT="$BACKUP_DIR/crown_db_${TS}.dump"

log "Mulai backup → $(basename "$OUT")"

# -Fc custom format, -Z6 kompresi sedang. Tulis ke file sementara dulu lalu
# rename → file final tidak pernah setengah jadi kalau proses gagal.
TMP="$OUT.part"
if pg_dump -Fc -Z6 --no-owner --no-privileges "$DATABASE_URL" -f "$TMP"; then
  mv "$TMP" "$OUT"
  chmod 600 "$OUT"
else
  rm -f "$TMP"
  log "GAGAL: pg_dump error"
  exit 1
fi

# Validasi: file ada & tidak kosong, dan header dump valid.
if [[ ! -s "$OUT" ]] || ! pg_restore -l "$OUT" >/dev/null 2>&1; then
  log "GAGAL: dump tidak valid → $(basename "$OUT")"
  rm -f "$OUT"
  exit 1
fi

SIZE="$(du -h "$OUT" | cut -f1)"
log "Sukses: $(basename "$OUT") ($SIZE)"

# Prune: hapus dump lebih lama dari RETENTION hari.
DELETED="$(find "$BACKUP_DIR" -maxdepth 1 -name 'crown_db_*.dump' -type f -mtime +"$RETENTION" -print -delete | wc -l)"
if [[ "$DELETED" -gt 0 ]]; then
  log "Prune: hapus $DELETED dump > ${RETENTION} hari"
fi

COUNT="$(find "$BACKUP_DIR" -maxdepth 1 -name 'crown_db_*.dump' -type f | wc -l)"
TOTAL="$(du -sh "$BACKUP_DIR" | cut -f1)"
log "Selesai. Total $COUNT dump, ukuran folder $TOTAL"
