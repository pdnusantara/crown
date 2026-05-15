# Sembapos Production Runbook

## Service Inventory
- Frontend (prod): `/var/www/crown/dist` -> `https://sembapos.com`
- Backend (prod): PM2 app `crown-backend` on port `3001`
- Frontend (staging): `/var/www/crown-staging/dist` -> `https://staging.sembapos.com`
- Backend (staging): PM2 app `crown-backend-staging` on port `3002`
- Nginx vhost: `/etc/nginx/sites-available/crown`
- Staging vhost: `/etc/nginx/sites-available/crown-staging`

## Deploy (Production)
1. Update code in `/var/www/crown`
2. (If schema changed) DB sync
   - `cd /var/www/crown/backend`
   - `npx prisma db push`
3. Atomic deploy with rollback guard
   - `cd /var/www/crown`
   - `bash scripts/deploy-production.sh`
4. Manual smoke tests
   - `curl -I https://sembapos.com`
   - `curl -sS http://127.0.0.1:3001/api/health`

Notes:
- Script builds to temporary directory first, validates artifacts, then swaps `dist`.
- If deploy fails after swap, previous `dist` is restored automatically.
- Backup `dist` is stored in `/var/www/crown/.deploy/backups`.

## Deploy (Staging)
1. Sync code to staging
   - `rsync -a --delete --exclude '.git' --exclude 'node_modules' --exclude 'dist' /var/www/crown/ /var/www/crown-staging/`
2. Install deps + DB sync
   - `cd /var/www/crown-staging`
   - `npm install --legacy-peer-deps`
   - `npm --prefix backend install --legacy-peer-deps`
   - `cd backend && npm run db:generate && npx prisma db push && npm run db:seed`
3. Build and restart
   - `cd /var/www/crown-staging && npm run build`
   - `pm2 restart crown-backend-staging --update-env`
   - `pm2 save`
4. Smoke test
   - `curl -I https://staging.sembapos.com`

## Rollback
- Frontend rollback: restore previous `dist` backup and reload Nginx.
- Backend rollback: checkout previous commit, rerun build/migrate if needed, then `pm2 restart crown-backend`.
- Emergency switch: disable failing service in Nginx and reload.

## Backup & Restore
- Ops config: `/etc/sembapos/ops.env`
- Backup script: `/opt/sembapos-ops/backup_postgres.sh`
- Restore test script: `/opt/sembapos-ops/restore_test.sh`
- Backup location: `/var/backups/sembapos`

Manual run:
- `sudo systemctl start sembapos-backup.service`
- `sudo systemctl start sembapos-restore-test.service`

## SSL (Wildcard)
- Active cert: `/etc/letsencrypt/live/sembapos.com/fullchain.pem`
- Manual renew command:
  - `sudo certbot certonly --manual --preferred-challenges dns -d sembapos.com -d '*.sembapos.com'`
- Daily expiry checker (H-14 reminder): `sembapos-ssl-reminder.timer`

## Monitoring and Alerts
- Health script: `/opt/sembapos-ops/healthcheck.sh`
- Timer: every 5 minutes via `sembapos-healthcheck.timer`
- Telegram alert vars in `/etc/sembapos/ops.env`:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_CHAT_ID`

## Security Baseline
- Fail2ban enabled (`sshd`, `sembapos-nginx-login`)
- UFW enabled (`OpenSSH`, `Nginx Full`)
- SSH root login disabled
- NOTE: key-only SSH should be enabled only after valid public key is installed in `~/.ssh/authorized_keys`

## Housekeeping
- Nginx logrotate: `/etc/logrotate.d/nginx`
- PM2 log rotation: module `pm2-logrotate` (20M max, keep 14, compress on)

## Useful Commands
- `pm2 status`
- `pm2 startOrReload /var/www/crown/ecosystem.config.cjs --only crown-backend --update-env`
- `pm2 logs crown-backend --lines 100 --nostream`
- `pm2 logs crown-backend-staging --lines 100 --nostream`
- `systemctl list-timers --all | awk 'NR==1 || /sembapos-/'`
- `sudo nginx -t && sudo systemctl reload nginx`
