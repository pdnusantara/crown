# Backup & Restore Database (Crown / SembaPOS)

Database: **PostgreSQL** (`crown_db`). Backup memakai `pg_dump` format custom (`-Fc`).

## Backup

```bash
bash scripts/backup-db.sh
```

- Hasil disimpan di `.backups/db/crown_db_<TANGGAL>-<JAM>.dump` (perm 600).
- Retensi default **14 hari** (atur via `RETENTION=30 bash scripts/backup-db.sh`).
- Lokasi folder bisa diubah via `BACKUP_DIR=/path bash scripts/backup-db.sh`.
- Log: `.backups/db/backup.log`.

### Cron harian (sudah terpasang)

```cron
30 2 * * * /usr/bin/env bash /var/www/crown/scripts/backup-db.sh >> /var/www/crown/.backups/db/cron.log 2>&1
```

Cek: `crontab -l`. Log cron: `.backups/db/cron.log`.

## Restore

⚠️ **Destruktif** — menimpa database tujuan. Jangan dari cron.

```bash
# 1. (disarankan) hentikan backend agar tak ada koneksi menulis
pm2 stop crown-backend

# 2. restore — script minta konfirmasi nama DB
bash scripts/restore-db.sh .backups/db/crown_db_YYYYMMDD-HHMMSS.dump

# 3. nyalakan kembali
pm2 start crown-backend
```

## Uji restore tanpa menyentuh produksi

Restore dump ke DB sementara lalu hapus (butuh hak `CREATEDB`):

```bash
psql "$DATABASE_URL" -c "CREATE DATABASE crown_restore_test"
pg_restore --no-owner --no-privileges -d "<URL_dengan_dbname_crown_restore_test>" <file.dump>
# verifikasi: SELECT count(*) FROM "Tenant";
psql "$DATABASE_URL" -c "DROP DATABASE crown_restore_test"
```

## Catatan penting

- **Off-site copy:** dump saat ini berada di disk yang sama dengan aplikasi.
  Untuk perlindungan dari kegagalan disk/server, salin dump rutin ke storage
  lain (S3/Cloud Storage/rsync ke server lain). Backup lokal saja **tidak**
  melindungi dari server hilang.
- Disk server terbatas (~6 GB bebas) — retensi 14 hari × ~1 MB aman, tapi pantau
  bila DB membesar.
