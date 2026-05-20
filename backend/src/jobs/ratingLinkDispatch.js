'use strict';

// ── Job: Kirim Link Rating Publik via WhatsApp ─────────────────────────────
// Untuk tiap transaksi `completed` yang sudah melewati `autoSendMinutes`
// (default 15 menit) dan belum di-mark `ratingLinkSentAt`, kirim link halaman
// rating publik ke nomor pelanggan. Idempotent: kolom `ratingLinkSentAt`
// menandai sukses kirim → cron berikutnya skip.
//
// Cron berjalan tiap 5 menit. Per-tenant cek `ratingConfig.enabled`. Best-
// effort — kegagalan kirim TIDAK menandai `ratingLinkSentAt` supaya bisa
// dicoba lagi siklus berikutnya.

const cron = require('node-cron');
const prisma = require('../config/database');
const { sendRatingLink } = require('../services/whatsappService');

const DEFAULT_DELAY_MIN = 15;
const MIN_DELAY_MIN     = 1;
const MAX_DELAY_MIN     = 24 * 60; // 1 hari — guard biar tidak basi
const MAX_PER_RUN       = 100;     // batas aman per tenant per eksekusi
// Batas atas usia transaksi yang masih layak dikirim link rating. Kalau tenant
// baru mengaktifkan fitur, transaksi historis berhari-hari/minggu yg lalu
// JANGAN ikut dikirim — ini bikin spam pelanggan. Asumsi: link rating cuma
// relevan dalam hari yang sama (24 jam).
const MAX_TX_AGE_HOURS  = 24;

function resolveConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const enabled = !!c.enabled;
  let delay = parseInt(c.autoSendMinutes, 10);
  if (!Number.isFinite(delay)) delay = DEFAULT_DELAY_MIN;
  delay = Math.min(MAX_DELAY_MIN, Math.max(MIN_DELAY_MIN, delay));
  return { enabled, autoSendMinutes: delay };
}

async function processTenant(tenant) {
  const cfg = resolveConfig(tenant.ratingConfig);
  if (!cfg.enabled) {
    return { tenantId: tenant.id, skipped: 'disabled', sent: 0 };
  }

  // Transaksi completed yang:
  // - sudah lewat `autoSendMinutes` (siap dikirim)
  // - usianya masih ≤ MAX_TX_AGE_HOURS (cegah spam saat tenant baru aktifkan
  //   fitur — transaksi historis berminggu-minggu lalu tak relevan)
  // - ada nomor HP
  // - belum dikirim link rating
  const now = Date.now();
  const upperBound = new Date(now - cfg.autoSendMinutes * 60_000);
  const lowerBound = new Date(now - MAX_TX_AGE_HOURS * 3600_000);

  const candidates = await prisma.transaction.findMany({
    where: {
      tenantId: tenant.id,
      status: 'completed',
      createdAt: { lte: upperBound, gte: lowerBound },
      ratingLinkSentAt: null,
      customerPhone: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      customerId: true,
      customerName: true,
      customerPhone: true,
      customer: { select: { phone: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_PER_RUN,
  });

  if (candidates.length === 0) {
    return { tenantId: tenant.id, eligible: 0, sent: 0 };
  }

  let sent = 0;
  let failed = 0;
  for (const tx of candidates) {
    try {
      const res = await sendRatingLink(tenant.id, tx);
      if (res?.sent) {
        await prisma.transaction.update({
          where: { id: tx.id },
          data: { ratingLinkSentAt: new Date() },
        });
        sent++;
      } else {
        failed++;
        // Phone invalid atau WA disconnected → catat jangan kirim ulang.
        // Tapi kalau reason 'not_connected' / 'disabled_global' biarkan, coba siklus berikutnya.
        if (res?.reason === 'no_phone' || res?.reason === 'invalid_phone') {
          await prisma.transaction.update({
            where: { id: tx.id },
            data: { ratingLinkSentAt: new Date() }, // mark agar tidak diulang
          }).catch(() => {});
        }
      }
    } catch (err) {
      failed++;
      console.error(`[RatingLink] tx=${tx.id} tenant=${tenant.id} ERROR:`, err.message);
    }
  }

  console.log(`[RatingLink] tenant=${tenant.id} eligible=${candidates.length} sent=${sent} failed=${failed}`);
  return { tenantId: tenant.id, eligible: candidates.length, sent, failed };
}

async function runOnce() {
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null, isSuspended: false, ratingConfig: { not: null } },
    select: { id: true, ratingConfig: true },
  });
  const results = [];
  for (const t of tenants) {
    try {
      results.push(await processTenant(t));
    } catch (err) {
      console.error(`[RatingLink] tenant=${t.id} processTenant ERROR:`, err.message);
    }
  }
  return results;
}

// Backfill once saat boot: tandai transaksi historis (> MAX_TX_AGE_HOURS) yang
// belum punya `ratingLinkSentAt` supaya cron tidak pernah memilihnya. Idempotent —
// untuk record yg sudah disambar batas usia, .updateMany cuma menyentuh yg null.
async function backfillOldTransactions() {
  const cutoff = new Date(Date.now() - MAX_TX_AGE_HOURS * 3600_000);
  try {
    const r = await prisma.transaction.updateMany({
      where: {
        status: 'completed',
        createdAt: { lt: cutoff },
        ratingLinkSentAt: null,
      },
      data: { ratingLinkSentAt: new Date() },
    });
    if (r.count > 0) {
      console.log(`[RatingLink] Backfill: ${r.count} transaksi historis di-skip dari kandidat`);
    }
  } catch (err) {
    console.error('[RatingLink] Backfill ERROR:', err.message);
  }
}

function initRatingLinkDispatchJob() {
  // One-time backfill saat boot supaya tenant yang baru aktifkan fitur tidak
  // dapat antrian kirim utk transaksi berhari-hari yg lalu.
  backfillOldTransactions().catch((err) => console.error('[RatingLink] init backfill failed:', err.message));

  // Tiap 5 menit. Lebih sering dari visitReminder (yang hourly) karena
  // ekspektasi pelanggan dapat link sekitar 15 menit setelah transaksi.
  cron.schedule('*/5 * * * *', () => {
    runOnce().catch((err) => console.error('[RatingLink] cron run failed:', err.message));
  });
  console.log('[RatingLink] Scheduled: every 5 minutes (max-age 24h, backfill on boot)');
}

module.exports = { initRatingLinkDispatchJob, runOnce, processTenant };
