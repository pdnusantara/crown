'use strict';

const cron  = require('node-cron');
const prisma = require('../config/database');
const duitku = require('../services/duitkuService');
const { applySuccessfulPayment } = require('../services/paymentFulfillment');

const BACKEND_URL  = process.env.BACKEND_URL  || 'https://sembapos.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sembapos.com';
const PUBLIC_HOST  = process.env.PUBLIC_HOST  || FRONTEND_URL.replace(/^https?:\/\//, '').replace(/\/$/, '') || 'sembapos.com';
const GRACE_DAYS   = Number(process.env.SUBSCRIPTION_GRACE_DAYS || 7);

// Arahkan returnUrl Duitku ke subdomain tenant (login di-enforce per subdomain)
// supaya setelah bayar mereka mendarat dalam keadaan login. Selaras dengan
// billingReturnUrl di routes/payment.js.
function billingReturnUrl(slug) {
  const base = slug ? `https://${slug}.${PUBLIC_HOST}` : FRONTEND_URL.replace(/\/$/, '');
  return `${base}/admin/billing?payment=done`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function dayStart(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function createBroadcast(tenantIds, { title, message, type = 'warning' }) {
  if (!tenantIds.length) return null;
  return prisma.broadcast.create({
    data: {
      title,
      message,
      type,
      active: true,
      recipients: { create: tenantIds.map(tenantId => ({ tenantId })) },
    },
  });
}

async function alreadyBroadcastedToday(tenantId, titlePrefix) {
  const since = dayStart();
  const found = await prisma.broadcastRecipient.findFirst({
    where: {
      tenantId,
      broadcast: { sentAt: { gte: since }, title: { startsWith: titlePrefix } },
    },
  });
  return !!found;
}

async function hasPendingOrPaidOrderRecently(subscriptionId) {
  const since = new Date(Date.now() - 3 * 86400 * 1000);
  const found = await prisma.paymentOrder.findFirst({
    where: {
      subscriptionId,
      type: 'subscription',
      status: { in: ['pending', 'success'] },
      createdAt: { gte: since },
    },
  });
  return !!found;
}

// Hitung harga sesuai siklus aktif subscription. Untuk annual, gunakan
// annualDiscountPercent dari paket (default 17%) — sama seperti
// computeCyclePrice di payment.js.
async function tryCreateDuitkuOrder(sub) {
  try {
    const settings = await duitku.getSettings();
    if (!settings.active) return null;

    const cycle = sub.billingCycle || 'monthly';
    const pkg = await prisma.package.findUnique({ where: { name: sub.package } });
    const monthly = pkg?.price ?? sub.price;
    const annualDiscPct = pkg?.annualDiscountPercent ?? 17;
    const amount = cycle === 'annual'
      ? Math.round((monthly * 12 * (1 - annualDiscPct / 100)) / 1000) * 1000
      : monthly;

    const merchantOrderId = `CROWN-AUTO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const res = await duitku.createInvoice({
      merchantOrderId,
      amount,
      email:          sub.tenant.email,
      productDetails: `Perpanjang ${sub.package} (${cycle === 'annual' ? 'Tahunan' : 'Bulanan'}) — ${sub.tenant.name}`,
      callbackUrl:    `${BACKEND_URL}/api/payment/callback`,
      returnUrl:      billingReturnUrl(sub.tenant.slug),
      customerName:   sub.tenant.name,
    });

    await prisma.paymentOrder.create({
      data: {
        merchantOrderId,
        tenantId:       sub.tenantId,
        subscriptionId: sub.id,
        type:           'subscription',
        billingCycle:   cycle,
        amount,
        status:         'pending',
        paymentUrl:     res.paymentUrl,
        reference:      res.reference || null,
      },
    });

    return res.paymentUrl;
  } catch (err) {
    console.error(`[RenewalJob] Duitku order error tenant=${sub.tenantId}:`, err.message);
    return null;
  }
}

// Hitung periode "next cycle" untuk label invoice add-on. Cycle berikutnya
// dimulai dari endDate sekarang; pakai bulan+tahun endDate sebagai patokan
// (bulan ini = bulan terakhir cycle aktif → invoice berikutnya untuk bulan
// setelah endDate).
function nextCycleLabel(sub) {
  const cycle = sub.billingCycle || 'monthly';
  const start = new Date(sub.endDate);
  if (cycle === 'annual') {
    return `${start.getFullYear() + 1}`;
  }
  // Bulan setelah endDate
  start.setMonth(start.getMonth() + 1);
  return start.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

// Generate invoice add-on aggregate untuk cycle berikutnya. Idempotent — skip
// kalau invoice dengan label cycle yang sama sudah ada. Dipanggil di D-3
// (mirror pre-create Duitku order untuk subscription).
async function generateRecurringAddonInvoices(sub, log) {
  const pkg = await prisma.package.findUnique({
    where: { name: sub.package },
    select: {
      maxBranches: true, branchAddonPrice: true, branchAddonType: true,
      maxStaff: true, staffPerExtraBranch: true, staffAddonPrice: true, staffAddonType: true,
    },
  });
  if (!pkg) return { branchInvoice: null, staffInvoice: null };

  const cycleLabel = nextCycleLabel(sub);
  const created = { branchInvoice: null, staffInvoice: null };

  // ── BRANCH ADD-ON ────────────────────────────────────────────────────────
  if (pkg.branchAddonType === 'monthly' && pkg.branchAddonPrice > 0) {
    const branchCount = await prisma.branch.count({
      where: { tenantId: sub.tenantId, deletedAt: null },
    });
    const extraBranches = Math.max(0, branchCount - pkg.maxBranches);

    if (extraBranches > 0) {
      const period = `Cabang Tambahan (${extraBranches}) — ${cycleLabel}`;
      const existing = await prisma.invoice.findFirst({
        where: { subscriptionId: sub.id, type: 'branch_addon', period },
      });
      if (!existing) {
        created.branchInvoice = await prisma.invoice.create({
          data: {
            subscriptionId: sub.id,
            period,
            quantity: extraBranches,
            amount: extraBranches * pkg.branchAddonPrice,
            type: 'branch_addon',
            status: 'pending',
          },
        });
        log(`addon: created branch_addon tenant=${sub.tenantId} qty=${extraBranches} period="${period}"`);
      }
    }
  }

  // ── STAFF ADD-ON ─────────────────────────────────────────────────────────
  if (pkg.staffAddonType === 'monthly' && pkg.staffAddonPrice > 0) {
    // Effective max staff dihitung BERDASARKAN cabang add-on yang lisensinya
    // masih aktif di cycle berjalan (sama dengan POST /users supaya konsisten).
    const { paidBranchAddonFilter } = require('../utils/branchLicense');
    const [staffCount, paidBranchAgg] = await Promise.all([
      prisma.user.count({ where: { tenantId: sub.tenantId, deletedAt: null } }),
      prisma.invoice.aggregate({
        where: {
          subscriptionId: sub.id,
          ...paidBranchAddonFilter(sub),
        },
        _sum: { quantity: true },
      }),
    ]);
    const paidBranchAddons = paidBranchAgg._sum.quantity || 0;
    const effectiveMaxStaff = pkg.maxStaff + paidBranchAddons * (pkg.staffPerExtraBranch || 0);
    const extraStaff = Math.max(0, staffCount - effectiveMaxStaff);

    if (extraStaff > 0) {
      const period = `Staf Tambahan (${extraStaff}) — ${cycleLabel}`;
      const existing = await prisma.invoice.findFirst({
        where: { subscriptionId: sub.id, type: 'staff_addon', period },
      });
      if (!existing) {
        created.staffInvoice = await prisma.invoice.create({
          data: {
            subscriptionId: sub.id,
            period,
            quantity: extraStaff,
            amount: extraStaff * pkg.staffAddonPrice,
            type: 'staff_addon',
            status: 'pending',
          },
        });
        log(`addon: created staff_addon tenant=${sub.tenantId} qty=${extraStaff} period="${period}"`);
      }
    }
  }

  return created;
}

async function tryWASend(tenantId, text) {
  try {
    const wa = require('../services/whatsappService');
    const settings = await wa.getTenantSettings(tenantId);
    if (!settings.enabled || !settings.notifyAdminPhone) return false;
    const result = await wa.sendSystemMessage(tenantId, settings.notifyAdminPhone, text);
    return result.sent;
  } catch {
    return false;
  }
}

// Alert super-admin via Telegram: ada order DIBAYAR tapi callback Duitku tak
// pernah sampai (sudah dipulihkan otomatis oleh reconcile). Sinyal masalah
// pengiriman callback (URL callback/jaringan). Best-effort — tak memblokir job;
// kalau Telegram nonaktif/token kosong, sendMessage diam-diam no-op.
async function alertCallbackMissed(orders) {
  try {
    if (!orders.length) return;
    const tg = require('../services/telegramService');
    const esc = tg.escapeHtml || ((s) => String(s));
    const tenantIds = [...new Set(orders.map(o => o.tenantId))];
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true },
    });
    const nameById = Object.fromEntries(tenants.map(t => [t.id, t.name]));
    const lines = orders.slice(0, 15).map(o =>
      `• ${esc(nameById[o.tenantId] || o.tenantId)} — ${esc(o.type)} Rp ${Number(o.amount).toLocaleString('id-ID')} (${esc(o.merchantOrderId)})`
    );
    const text = [
      '⚠️ <b>Callback Duitku terlewat</b>',
      '',
      `${orders.length} pembayaran LUNAS tapi callback-nya tak pernah sampai — sudah dipulihkan otomatis oleh reconcile. Mohon cek konfigurasi callback URL Duitku / jaringan.`,
      '',
      ...lines,
      orders.length > 15 ? `…dan ${orders.length - 15} lainnya` : null,
    ].filter(Boolean).join('\n');
    await tg.sendMessage(text);
  } catch (e) {
    console.warn('[RenewalJob] alertCallbackMissed failed:', e.message);
  }
}

// ── Core job ───────────────────────────────────────────────────────────────

async function runRenewalJob() {
  const now = new Date();
  const log = (...a) => console.log(`[RenewalJob ${now.toISOString()}]`, ...a);
  log('start');

  // ── 0. RECONCILE — order pending yang ternyata SUDAH dibayar tapi callback
  // Duitku tak pernah sampai (mis. gangguan jaringan / URL callback salah).
  // Tanya status langsung ke Duitku; bila lunas, tuntaskan fulfillment yang
  // SAMA dengan callback. Jaring pengaman supaya "dibayar tapi tak aktif" tak
  // terjadi. Dijalankan SEBELUM auto-expire agar order lunas tak ikut di-expire.
  try {
    const settings = await duitku.getSettings();
    if (settings.active && settings.merchantCode && settings.apiKey) {
      const recentCutoff = new Date(now.getTime() - 7 * 86400 * 1000);
      const pendingOrders = await prisma.paymentOrder.findMany({
        where: { status: 'pending', createdAt: { gte: recentCutoff } },
        orderBy: { createdAt: 'asc' },
        take: 200,
      });
      let reconciled = 0;
      const reconciledOrders = [];
      for (const order of pendingOrders) {
        try {
          const st = await duitku.checkStatus(order.merchantOrderId);
          if (st?.statusCode === '00') {
            const claim = await prisma.paymentOrder.updateMany({
              where: { merchantOrderId: order.merchantOrderId, status: { not: 'success' } },
              data:  { status: 'success' },
            });
            if (claim.count > 0) {
              try {
                await applySuccessfulPayment(order);
                reconciled++;
                reconciledOrders.push(order);
                log(`reconcile: fulfilled paid-but-stale order ${order.merchantOrderId} tenant=${order.tenantId}`);
              } catch (e) {
                await prisma.paymentOrder.updateMany({
                  where: { merchantOrderId: order.merchantOrderId, status: 'success' },
                  data:  { status: 'pending' },
                }).catch(() => {});
                console.error(`[RenewalJob] reconcile fulfill error ${order.merchantOrderId}:`, e.message);
              }
            }
          }
        } catch (e) {
          console.warn(`[RenewalJob] reconcile status error ${order.merchantOrderId}:`, e.message);
        }
      }
      if (reconciled) {
        log(`Reconciled ${reconciled} paid order(s) missed by callback`);
        // ALERT super-admin: order ini DIBAYAR tapi callback Duitku tak pernah
        // sampai (sudah dipulihkan otomatis). Sinyal ada masalah pengiriman
        // callback Duitku (URL callback / jaringan) yang perlu dicek manual.
        await alertCallbackMissed(reconciledOrders);
      }
    }
  } catch (e) {
    console.error('[RenewalJob] reconcile step failed:', e.message);
  }

  // ── 0a. AUTO-EXPIRE pending payment orders (TTL 24h) ───────────────────
  const orderTtlCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const expiredOrders = await prisma.paymentOrder.updateMany({
    where: { status: 'pending', createdAt: { lt: orderTtlCutoff } },
    data:  { status: 'expired' },
  });
  if (expiredOrders.count) log(`Expired ${expiredOrders.count} stale pending orders`);

  // ── 0b. AUTO-RESUME paused subs whose pauseUntil has passed ─────────────
  const toResume = await prisma.subscription.findMany({
    where: { status: 'paused', pauseUntil: { lte: now }, tenant: { deletedAt: null } },
  });
  for (const sub of toResume) {
    const elapsedMs = now.getTime() - new Date(sub.pausedAt || now).getTime();
    const newEnd = new Date(new Date(sub.endDate).getTime() + Math.max(0, elapsedMs));
    await prisma.subscription.update({
      where: { id: sub.id },
      data:  { status: 'active', endDate: newEnd, pausedAt: null, pauseUntil: null, pauseReason: null },
    });
    log(`Resumed paused subscription tenant=${sub.tenantId} new endDate=${newEnd.toISOString()}`);
  }

  // ── 1. REMINDER D-7, D-3, D-1 ──────────────────────────────────────────
  for (const days of [7, 3, 1]) {
    const winStart = dayStart(addDays(now, days));
    const winEnd   = new Date(winStart.getTime() + 86400_000 - 1);

    const subs = await prisma.subscription.findMany({
      where: {
        // Skip 'paused' — tenant sengaja menjeda; jangan kirim reminder.
        status:  { in: ['active', 'trial'] },
        endDate: { gte: winStart, lte: winEnd },
        // Tenant terhapus tidak boleh dapat reminder / dibuatkan order Duitku.
        tenant:  { deletedAt: null },
      },
      include: { tenant: { select: { id: true, name: true, email: true, slug: true } } },
    });

    log(`D-${days}: ${subs.length} expiring`);

    for (const sub of subs) {
      const titlePrefix = `[D-${days}] Langganan`;
      if (await alreadyBroadcastedToday(sub.tenantId, titlePrefix)) {
        log(`D-${days}: tenant=${sub.tenantId} skip (already notified today)`);
        continue;
      }

      let paymentUrl = null;

      // D-3 autoRenew: pre-create Duitku order so tenant has a direct link
      if (days === 3 && sub.autoRenew) {
        if (!(await hasPendingOrPaidOrderRecently(sub.id))) {
          paymentUrl = await tryCreateDuitkuOrder(sub);
          if (paymentUrl) log(`D-3: created order tenant=${sub.tenantId}`);
        }
      }

      // D-3: generate aggregate add-on invoices untuk cycle berikutnya
      // (idempotent — skip kalau sudah ada). Dijalankan di D-3 saja supaya
      // reminder D-7 tidak duplicate. Pakai try/catch supaya satu tenant
      // gagal tidak menghentikan job.
      if (days === 3) {
        try {
          const addonResult = await generateRecurringAddonInvoices(sub, log);
          if (addonResult.branchInvoice || addonResult.staffInvoice) {
            log(`D-3: addon invoices tenant=${sub.tenantId} branch=${addonResult.branchInvoice?.id || '-'} staff=${addonResult.staffInvoice?.id || '-'}`);
          }
        } catch (err) {
          console.error(`[RenewalJob] addon invoice error tenant=${sub.tenantId}:`, err.message);
        }
      }

      const endStr = fmtDate(sub.endDate);
      const broadcastMsg = [
        // Tanpa *asterisk* — notifikasi in-app tidak me-render bold ala WhatsApp,
        // jadi bintang akan tampil harfiah ("*1 hari*"). Bold WA dipakai di waMsg.
        `Langganan ${sub.package} Anda akan berakhir dalam ${days} hari (${endStr}).`,
        sub.autoRenew && paymentUrl
          ? `Link pembayaran sudah disiapkan. Buka menu Billing untuk melanjutkan.`
          : `Segera lakukan pembayaran di menu Billing untuk menghindari gangguan layanan.`,
      ].join('\n\n');

      await createBroadcast([sub.tenantId], {
        title:   `${titlePrefix} Segera Berakhir`,
        message: broadcastMsg,
        type:    days === 1 ? 'error' : 'warning',
      });

      const waMsg = [
        `[SembaPOS] Pengingat Perpanjang Langganan`,
        ``,
        `Halo ${sub.tenant.name},`,
        `Subscription ${sub.package} Anda akan berakhir dalam ${days} hari (${endStr}).`,
        paymentUrl
          ? `\nLink Pembayaran:\n${paymentUrl}`
          : `\nBuka aplikasi → menu Billing untuk melakukan pembayaran.`,
      ].join('\n');

      await tryWASend(sub.tenantId, waMsg);
      log(`D-${days}: notified tenant=${sub.tenantId} (${sub.tenant.name})`);
    }
  }

  // ── 2. ACTIVE → OVERDUE (subscription sudah lewat endDate) ─────────────
  // Tidak menyentuh status 'paused' — tetap paused sampai pauseUntil lewat.
  const toOverdue = await prisma.subscription.findMany({
    where: { status: 'active', endDate: { lt: now }, tenant: { deletedAt: null } },
    select: { id: true, tenantId: true, package: true },
  });

  if (toOverdue.length) {
    await prisma.subscription.updateMany({
      where: { id: { in: toOverdue.map(s => s.id) } },
      data:  { status: 'overdue' },
    });
    log(`Marked ${toOverdue.length} as overdue`);

    for (const sub of toOverdue) {
      if (await alreadyBroadcastedToday(sub.tenantId, '[Overdue]')) continue;
      await createBroadcast([sub.tenantId], {
        title:   `[Overdue] Langganan Telah Berakhir`,
        message: [
          `Subscription ${sub.package} Anda telah melewati tanggal berakhir.`,
          `Segera lakukan pembayaran. Anda memiliki masa tenggang ${GRACE_DAYS} hari sebelum akun dinonaktifkan.`,
          `Buka menu Billing untuk membayar.`,
        ].join('\n\n'),
        type: 'error',
      }).catch(() => {});
    }
  }

  // ── 2b. TRIAL → EXPIRED (trial tidak dapat grace; langsung nonaktif) ────
  // Trial yang lewat endDate langsung expired — beda dari pelanggan berbayar
  // yang masih mendapat masa tenggang GRACE_DAYS lewat status 'overdue'.
  const trialToExpire = await prisma.subscription.findMany({
    where: { status: 'trial', endDate: { lt: now }, tenant: { deletedAt: null } },
    select: { id: true, tenantId: true, package: true },
  });

  if (trialToExpire.length) {
    await prisma.subscription.updateMany({
      where: { id: { in: trialToExpire.map(s => s.id) } },
      data:  { status: 'expired' },
    });
    log(`Marked ${trialToExpire.length} trial(s) as expired`);

    for (const sub of trialToExpire) {
      if (await alreadyBroadcastedToday(sub.tenantId, '[Trial]')) continue;
      await createBroadcast([sub.tenantId], {
        title:   `[Trial] Masa Coba Telah Berakhir`,
        message: [
          `Masa trial ${sub.package} Anda telah berakhir.`,
          `Pilih paket berlangganan di menu Billing untuk mengaktifkan kembali toko Anda.`,
        ].join('\n\n'),
        type: 'error',
      }).catch(() => {});
    }
  }

  // ── 3. OVERDUE → EXPIRED (setelah grace period) ─────────────────────────
  const graceDeadline = new Date(now.getTime() - GRACE_DAYS * 86400_000);
  const expiredResult = await prisma.subscription.updateMany({
    where: { status: 'overdue', endDate: { lt: graceDeadline }, tenant: { deletedAt: null } },
    data:  { status: 'expired' },
  });

  if (expiredResult.count) log(`Marked ${expiredResult.count} as expired`);

  // Realtime: kalau ada perubahan status (resume/overdue/trial-expired/expired),
  // beri tahu dashboard super-admin & billing supaya angka langsung segar.
  const changed = toResume.length + toOverdue.length + trialToExpire.length + expiredResult.count;
  if (changed) {
    try {
      const { getIO } = require('../config/socket');
      const io = getIO();
      if (io) io.emit('subscription:any-updated', { source: 'cron' });
    } catch { /* observability only */ }
  }

  // Catat waktu jalan terakhir untuk panel Kesehatan Sistem (super-admin).
  const summary = {
    timestamp:         now.toISOString(),
    overdueCount:      toOverdue.length,
    trialExpiredCount: trialToExpire.length,
    expiredCount:      expiredResult.count,
  };
  try {
    await prisma.systemSetting.upsert({
      where:  { key: 'cron_renewal_last_run' },
      update: { value: JSON.stringify(summary) },
      create: { key: 'cron_renewal_last_run', value: JSON.stringify(summary) },
    });
  } catch (e) { console.error('[RenewalJob] failed to record last_run:', e.message); }

  log('done');
  return summary;
}

// ── Init scheduler ─────────────────────────────────────────────────────────

function initRenewalJob() {
  // Jam 08:00 WIB setiap hari
  cron.schedule('0 8 * * *', () => {
    runRenewalJob().catch(err => console.error('[RenewalJob] unhandled error:', err));
  }, { timezone: 'Asia/Jakarta' });

  console.log('[RenewalJob] Scheduled: daily 08:00 WIB | grace=' + GRACE_DAYS + 'd');
}

module.exports = { initRenewalJob, runRenewalJob };
