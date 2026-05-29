#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Restore database Crown/SembaPOS dari file dump pg_dump (-Fc).
#
# ⚠️  DESTRUKTIF: menimpa data di database tujuan. Wajib konfirmasi manual.
#     JANGAN dijalankan dari cron.
#
# Pakai:  bash scripts/restore-db.sh /path/ke/crown_db_YYYYMMDD-HHMMSS.dump
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$APP_DIR/backend/.env"

DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Pakai: bash scripts/restore-db.sh <file.dump>" >&2
  echo "Dump tersedia:" >&2
  ls -1t "$APP_DIR/.backups/db/"crown_db_*.dump 2>/dev/null | head >&2 || true
  exit 1
fi

DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
DB_NAME="$(basename "${DATABASE_URL%%\?*}")"

if ! pg_restore -l "$DUMP" >/dev/null 2>&1; then
  echo "ERROR: '$DUMP' bukan file dump pg_dump (-Fc) yang valid." >&2; exit 1
fi

echo "════════════════════════════════════════════════════════════"
echo "  RESTORE DATABASE — INI AKAN MENIMPA DATA SAAT INI"
echo "  Database tujuan : $DB_NAME"
echo "  Dari dump       : $(basename "$DUMP") ($(du -h "$DUMP" | cut -f1))"
echo "════════════════════════════════════════════════════════════"
echo "Disarankan: hentikan backend dulu (pm2 stop crown-backend) agar tidak"
echo "ada koneksi yang menulis saat restore berlangsung."
echo
read -r -p "Ketik nama database '$DB_NAME' untuk lanjut: " CONFIRM
if [[ "$CONFIRM" != "$DB_NAME" ]]; then
  echo "Dibatalkan." ; exit 1
fi

echo "Restoring…"
# --clean --if-exists: drop objek lama sebelum buat ulang. --no-owner/-privileges
# supaya tidak gagal soal role. Jalankan dalam 1 transaksi bila bisa.
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error \
  -d "$DATABASE_URL" "$DUMP"

echo "✓ Restore selesai. Jalankan ulang backend bila tadi dihentikan:"
echo "  pm2 start crown-backend   # atau: pm2 restart crown-backend"
