const router = require('express').Router();
const fs = require('fs/promises');
const path = require('path');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { testConfig } = require('../services/whatsappService');

// Direktori dump backup DB (lihat scripts/backup-db.sh). Bisa di-override via env.
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../..', '.backups', 'db');

// Bungkus promise dengan timeout supaya panel tak menggantung kalau gateway lambat.
function withTimeout(promise, ms, onTimeout) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(onTimeout), ms)),
  ]);
}

async function getErrorHealth() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [unresolved, today, last] = await Promise.all([
    prisma.errorLog.count({ where: { resolved: false } }),
    prisma.errorLog.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.errorLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true, level: true, type: true } }),
  ]);
  // Status: ada error belum-resolve hari ini → warn; >20 → bad.
  const status = today > 20 ? 'bad' : (unresolved > 0 ? 'warn' : 'ok');
  return { status, unresolved, today, lastAt: last?.createdAt || null, lastLevel: last?.level || null, lastType: last?.type || null };
}

async function getWhatsappHealth() {
  try {
    const res = await withTimeout(testConfig(), 6000, { __timeout: true });
    if (res?.__timeout) return { status: 'warn', configured: true, reachable: false, reason: 'timeout' };
    return { status: 'ok', configured: true, reachable: true, deviceCount: res?.deviceCount ?? null };
  } catch (err) {
    if (err.code === 'NOT_CONFIGURED') return { status: 'warn', configured: false, reachable: false, reason: 'not_configured' };
    return { status: 'bad', configured: true, reachable: false, reason: err.code || err.message };
  }
}

async function getBackupHealth() {
  try {
    const files = (await fs.readdir(BACKUP_DIR)).filter((f) => f.endsWith('.dump'));
    if (!files.length) return { status: 'bad', count: 0, lastAt: null, reason: 'no_backups' };
    let newest = null;
    for (const f of files) {
      const st = await fs.stat(path.join(BACKUP_DIR, f));
      if (!newest || st.mtimeMs > newest.mtimeMs) newest = { mtimeMs: st.mtimeMs, size: st.size, name: f };
    }
    const ageHours = (Date.now() - newest.mtimeMs) / 3_600_000;
    // Backup harian (cron 02:30). >36 jam tanpa backup → bad, >26 jam → warn.
    const status = ageHours > 36 ? 'bad' : (ageHours > 26 ? 'warn' : 'ok');
    return { status, count: files.length, lastAt: new Date(newest.mtimeMs).toISOString(), sizeBytes: newest.size, ageHours: Math.round(ageHours * 10) / 10 };
  } catch (err) {
    return { status: 'unknown', count: 0, lastAt: null, reason: err.code || err.message };
  }
}

async function getCronRenewalHealth() {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'cron_renewal_last_run' } });
  if (!row) return { status: 'unknown', lastAt: null, reason: 'never_recorded' };
  let payload = {};
  try { payload = JSON.parse(row.value); } catch { /* legacy/plain */ }
  const lastAt = payload.timestamp || row.updatedAt?.toISOString() || null;
  const ageHours = lastAt ? (Date.now() - new Date(lastAt).getTime()) / 3_600_000 : Infinity;
  // Renewal jalan harian (08:00 WIB). >30 jam → bad, >25 jam → warn.
  const status = ageHours > 30 ? 'bad' : (ageHours > 25 ? 'warn' : 'ok');
  return { status, lastAt, ageHours: Number.isFinite(ageHours) ? Math.round(ageHours * 10) / 10 : null, summary: payload };
}

// GET /api/super-admin/system-health — ringkasan kesehatan operasional.
router.get('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const [errors, whatsapp, backup, cronRenewal] = await Promise.all([
      getErrorHealth(),
      getWhatsappHealth(),
      getBackupHealth(),
      getCronRenewalHealth(),
    ]);
    // Status keseluruhan = terburuk dari komponen yang dikenal.
    const rank = { ok: 0, unknown: 1, warn: 2, bad: 3 };
    const overall = [errors, whatsapp, backup, cronRenewal]
      .reduce((acc, c) => (rank[c.status] > rank[acc] ? c.status : acc), 'ok');
    res.json({ success: true, data: { overall, errors, whatsapp, backup, cronRenewal, checkedAt: new Date().toISOString() } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
