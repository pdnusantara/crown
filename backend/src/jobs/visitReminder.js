'use strict';

// ── Job: Pengingat Kunjungan ────────────────────────────────────────────────
// Mengirim pesan WhatsApp otomatis ke pelanggan yang sudah lama tidak datang.
// Konfigurasi per-tenant disimpan di `Tenant.visitReminder`:
//   { enabled, inactiveDays, repeat, sendHour, message }
// Cron berjalan tiap jam; tiap tenant diproses hanya saat jam lokalnya
// (zona waktu tenant) cocok dengan `sendHour` — sehingga jadwal kirim bisa
// diatur sendiri oleh masing-masing tenant.

const cron = require('node-cron');
const prisma = require('../config/database');
const { getTenantStatus, sendSystemMessage } = require('../services/whatsappService');

const DAY_MS = 86400 * 1000;
// Batas aman pesan per tenant per eksekusi — cegah membanjiri gateway.
const MAX_PER_RUN = 150;
// Batas atas jeda yang boleh dikonfigurasi (detik).
const MAX_DELAY_SEC = 600;

const DEFAULTS = {
  enabled: false,
  inactiveDays: 30,
  repeat: false,
  sendHour: 10,
  // Jeda ACAK antar pesan (detik) — tiap pesan menunggu durasi acak antara
  // min & max. Mencegah pola pengiriman beruntun yang memicu blokir WhatsApp.
  minDelaySec: 8,
  maxDelaySec: 30,
  message: 'Halo {nama}! Sudah {hari} hari sejak kunjungan terakhir Anda di {toko}. Kami tunggu kunjungan Anda berikutnya 😊',
};

// Ambil integer aman dari nilai apa pun, dengan fallback bila tidak valid.
function intOr(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Gabungkan konfigurasi tenant dengan default + sanitasi nilai.
function resolveConfig(raw) {
  const c = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  c.enabled = !!c.enabled;
  c.repeat = !!c.repeat;
  c.inactiveDays = Math.min(365, Math.max(1, intOr(c.inactiveDays, DEFAULTS.inactiveDays)));
  c.sendHour = Math.min(23, Math.max(0, intOr(c.sendHour, DEFAULTS.sendHour)));
  // Jeda: kunci ke [1, MAX_DELAY_SEC]; pastikan max ≥ min.
  let lo = Math.min(MAX_DELAY_SEC, Math.max(1, intOr(c.minDelaySec, DEFAULTS.minDelaySec)));
  let hi = Math.min(MAX_DELAY_SEC, Math.max(1, intOr(c.maxDelaySec, DEFAULTS.maxDelaySec)));
  if (hi < lo) hi = lo;
  c.minDelaySec = lo;
  c.maxDelaySec = hi;
  const msg = typeof c.message === 'string' ? c.message.trim() : '';
  c.message = msg || DEFAULTS.message;
  return c;
}

// Durasi jeda acak (ms) antara min & max detik konfigurasi.
function randomDelayMs(cfg) {
  const { minDelaySec: lo, maxDelaySec: hi } = cfg;
  return Math.round((lo + Math.random() * (hi - lo)) * 1000);
}

// Render placeholder {nama} {toko} {hari}. Placeholder tak dikenal dibiarkan.
function renderTemplate(text, vars = {}) {
  return String(text || '').replace(/\{(\w+)\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key] ?? '') : m
  );
}

// Jam saat ini (0-23) pada zona waktu tertentu. null bila tz tidak valid.
function currentHourInTz(tz) {
  try {
    const s = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'Asia/Jakarta', hour: '2-digit', hour12: false,
    }).format(new Date());
    const h = parseInt(s, 10);
    return Number.isFinite(h) ? h % 24 : null;
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Kumpulkan pelanggan tenant yang layak diingatkan saat ini.
// Mengembalikan array { id, name, phone, daysSince }.
async function collectEligible(tenantId, cfg, now = Date.now()) {
  const customers = await prisma.customer.findMany({
    where: {
      tenantId,
      deletedAt: null,
      visitCount: { gt: 0 },
      phone: { not: '' },
    },
    select: { id: true, name: true, phone: true, lastReminderAt: true },
  });
  if (customers.length === 0) return [];

  const ids = customers.map((c) => c.id);
  // Kunjungan terakhir = transaksi `completed` terbaru per pelanggan.
  const lastAgg = await prisma.transaction.groupBy({
    by: ['customerId'],
    where: { tenantId, status: 'completed', customerId: { in: ids } },
    _max: { createdAt: true },
  });
  const lastMap = {};
  for (const r of lastAgg) {
    if (r.customerId) lastMap[r.customerId] = r._max?.createdAt || null;
  }

  const eligible = [];
  for (const c of customers) {
    const lv = lastMap[c.id];
    if (!lv) continue; // belum pernah transaksi `completed`
    const lvTime = new Date(lv).getTime();
    const daysSinceVisit = (now - lvTime) / DAY_MS;
    if (daysSinceVisit < cfg.inactiveDays) continue;

    const remTime = c.lastReminderAt ? new Date(c.lastReminderAt).getTime() : 0;
    if (cfg.repeat) {
      // Mode berulang: kirim ulang tiap `inactiveDays` hari selama nonaktif.
      if (remTime && (now - remTime) / DAY_MS < cfg.inactiveDays) continue;
    } else {
      // Mode sekali: tak diingatkan lagi sampai pelanggan berkunjung lagi.
      if (remTime && remTime >= lvTime) continue;
    }
    eligible.push({ id: c.id, name: c.name, phone: c.phone, daysSince: Math.floor(daysSinceVisit) });
  }
  return eligible;
}

// Proses pengingat untuk satu tenant.
//   opts.dryRun  → hanya hitung pelanggan layak, tidak mengirim apa pun.
//   opts.force   → abaikan pencocokan jam (dipakai tombol "Kirim sekarang").
// Mengembalikan ringkasan { ... eligible, sent, skipped }.
async function processTenant(tenant, opts = {}) {
  const { dryRun = false, force = false } = opts;
  const cfg = resolveConfig(tenant.visitReminder);

  if (!cfg.enabled && !force) {
    return { tenantId: tenant.id, skipped: 'disabled', eligible: 0, sent: 0 };
  }

  const now = Date.now();
  const eligible = await collectEligible(tenant.id, cfg, now);

  if (dryRun) {
    return { tenantId: tenant.id, eligible: eligible.length, sent: 0, config: cfg };
  }
  if (eligible.length === 0) {
    return { tenantId: tenant.id, eligible: 0, sent: 0 };
  }

  // WhatsApp wajib tersambung — kalau tidak, lewati tanpa menandai pelanggan.
  let status = null;
  try {
    status = await getTenantStatus(tenant.id);
  } catch { /* anggap tidak tersambung */ }
  if (status?.status !== 'connected') {
    return { tenantId: tenant.id, skipped: 'not_connected', eligible: eligible.length, sent: 0 };
  }

  let sent = 0;
  let failed = 0;
  const batch = eligible.slice(0, MAX_PER_RUN);
  for (let i = 0; i < batch.length; i++) {
    const cust = batch[i];
    const text = renderTemplate(cfg.message, {
      nama: cust.name || 'Pelanggan',
      toko: tenant.name || '',
      hari: cust.daysSince,
    });
    try {
      const r = await sendSystemMessage(tenant.id, cust.phone, text);
      if (r?.sent) {
        sent++;
        // Tandai terkirim → cegah pengiriman ganda di run berikutnya.
        await prisma.customer.update({
          where: { id: cust.id },
          data: { lastReminderAt: new Date() },
        }).catch(() => {});
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
      console.error(`[VisitReminder] tenant=${tenant.id} cust=${cust.id} gagal:`, err?.message || err);
    }
    // Jeda acak sebelum pesan berikutnya — anti-pola, anti-blokir.
    if (i < batch.length - 1) await sleep(randomDelayMs(cfg));
  }

  console.log(`[VisitReminder] tenant=${tenant.id} eligible=${eligible.length} sent=${sent} failed=${failed}`);
  return { tenantId: tenant.id, eligible: eligible.length, sent, failed };
}

// Jalankan pengingat untuk satu tenant berdasarkan id — dipakai endpoint
// preview ("Kirim sekarang"/perkiraan jumlah) di halaman pengaturan.
async function runForTenant(tenantId, opts = {}) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
    select: { id: true, name: true, timezone: true, visitReminder: true },
  });
  if (!tenant) {
    const e = new Error('Tenant tidak ditemukan.');
    e.code = 'TENANT_NOT_FOUND';
    throw e;
  }
  return processTenant(tenant, { force: true, ...opts });
}

// Pratinjau untuk satu tenant: jumlah pelanggan layak + status koneksi WA +
// konfigurasi efektif. Tidak mengirim apa pun. Dipakai endpoint pengaturan.
async function previewForTenant(tenantId) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
    select: { id: true, name: true, visitReminder: true },
  });
  if (!tenant) {
    const e = new Error('Tenant tidak ditemukan.');
    e.code = 'TENANT_NOT_FOUND';
    throw e;
  }
  const cfg = resolveConfig(tenant.visitReminder);
  const eligible = await collectEligible(tenant.id, cfg, Date.now());
  let connected = false;
  try {
    const s = await getTenantStatus(tenant.id);
    connected = s?.status === 'connected';
  } catch { /* anggap tidak tersambung */ }
  return { eligible: eligible.length, connected, config: cfg };
}

// Eksekusi terjadwal: proses semua tenant yang jam lokalnya == sendHour.
async function runVisitReminderJob() {
  // Ambil semua tenant aktif lalu saring di JS — menghindari filter `null`
  // pada kolom Json yang perilakunya berbeda antar versi Prisma.
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null, isSuspended: false },
    select: { id: true, name: true, timezone: true, visitReminder: true },
  });

  let processed = 0;
  let totalSent = 0;
  for (const tenant of tenants) {
    const cfg = resolveConfig(tenant.visitReminder);
    if (!cfg.enabled) continue;
    const hour = currentHourInTz(tenant.timezone);
    if (hour === null || hour !== cfg.sendHour) continue;
    try {
      const res = await processTenant(tenant, {});
      processed++;
      totalSent += res.sent || 0;
    } catch (err) {
      console.error(`[VisitReminder] tenant=${tenant.id} error:`, err?.message || err);
    }
  }
  if (processed > 0) {
    console.log(`[VisitReminder] run selesai — ${processed} tenant diproses, ${totalSent} pesan terkirim`);
  }
  return { processed, totalSent };
}

function initVisitReminderJob() {
  // Tiap jam tepat; pencocokan jam per-tenant dilakukan di dalam job.
  cron.schedule('0 * * * *', () => {
    runVisitReminderJob().catch((err) =>
      console.error('[VisitReminder] unhandled error:', err)
    );
  });
  console.log('[VisitReminder] Scheduled: hourly (per-tenant sendHour & timezone)');
}

module.exports = {
  initVisitReminderJob,
  runVisitReminderJob,
  runForTenant,
  previewForTenant,
  resolveConfig,
  DEFAULTS,
};
