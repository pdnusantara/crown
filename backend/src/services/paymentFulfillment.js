'use strict';

// Fulfillment terpusat untuk PaymentOrder yang LUNAS. Dipakai oleh:
//   - POST /api/payment/callback (jalur utama, dipanggil server-to-server Duitku)
//   - GET  /api/payment/check/:id (fallback bila callback telat/gagal)
//   - cron reconcile (subscriptionRenewal) — menyapu order pending yang sudah
//     dibayar tapi callback-nya tak pernah sampai
//
// Pemanggil WAJIB sudah meng-klaim order secara atomik (status → 'success')
// sebelum memanggil ini. Semua efek-samping idempoten/guarded; fungsi melempar
// error pada kegagalan DB supaya pemanggil bisa revert status & retry — jangan
// sampai tenant sudah bayar tapi langganan tak aktif.

const prisma = require('../config/database');
const { invalidateSubscriptionCache } = require('../middleware/enforceSubscription');

async function logBilling(actorId, actorName, action, target, detail, severity = 'info') {
  try {
    await prisma.auditLog.create({
      data: { actorId, actorName: actorName || 'system', action: `billing.${action}`, target, detail, severity },
    });
  } catch (err) {
    console.warn('[billing audit] failed:', err.message);
  }
}

async function applySuccessfulPayment(order) {
  const now = new Date();
  const days = order.billingCycle === 'annual' ? 365 : 30;
  const cycle = order.billingCycle || 'monthly';

  if (order.type === 'subscription') {
    const sub = await prisma.subscription.findUnique({ where: { id: order.subscriptionId } });
    const base = sub?.endDate > now ? sub.endDate : now;
    const newEnd = new Date(base.getTime() + days * 86400 * 1000);

    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: order.subscriptionId },
        data:  { status: 'active', endDate: newEnd, billingCycle: cycle },
      }),
      ...(order.invoiceId
        ? [prisma.invoice.update({ where: { id: order.invoiceId }, data: { status: 'paid', paidAt: now } })]
        : [prisma.invoice.create({
            data: {
              subscriptionId: order.subscriptionId,
              period: now.toLocaleString('id-ID', { month: 'long', year: 'numeric' }),
              amount: order.amount,
              originalAmount: order.amount + order.discountAmount,
              discountAmount: order.discountAmount,
              promotionCode:  order.promotionCode,
              billingCycle:   cycle,
              type:   'subscription',
              status: 'paid',
              paidAt: now,
            },
          })]),
    ]);

  } else if (order.type === 'branch_addon') {
    // Lunasi invoice branch_addon PENDING yang sudah dibuat saat cabang
    // ditambahkan — JANGAN membuat invoice baru. Membuat duplikat akan
    // menggandakan paidAddonCount sehingga melisensikan cabang ekstra
    // berikutnya tanpa bayar (kredit add-on "hantu") dan menyisakan badge
    // "menunggu konfirmasi" selamanya. Prioritas target: invoiceId di order
    // → invoice branch_addon pending terlama → fallback buat baru
    // (mis. pembelian lisensi cabang di muka, sebelum cabangnya dibuat).
    let target = null;
    if (order.invoiceId) {
      target = await prisma.invoice.findUnique({ where: { id: order.invoiceId } });
      if (target && (target.type !== 'branch_addon' || target.status === 'paid')) target = null;
    }
    if (!target) {
      target = await prisma.invoice.findFirst({
        where: { subscriptionId: order.subscriptionId, type: 'branch_addon', status: { not: 'paid' } },
        orderBy: { createdAt: 'asc' },
      });
    }
    if (target) {
      await prisma.invoice.update({
        where: { id: target.id },
        data: {
          amount:         order.amount,
          originalAmount: order.amount + order.discountAmount,
          discountAmount: order.discountAmount,
          promotionCode:  order.promotionCode,
          status: 'paid',
          paidAt: now,
        },
      });
    } else {
      await prisma.invoice.create({
        data: {
          subscriptionId: order.subscriptionId,
          period: `Tambah Cabang — ${now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}`,
          amount: order.amount,
          originalAmount: order.amount + order.discountAmount,
          discountAmount: order.discountAmount,
          promotionCode:  order.promotionCode,
          type:   'branch_addon',
          status: 'paid',
          paidAt: now,
        },
      });
    }

  } else if (order.type === 'staff_addon') {
    // Mirror branch_addon flow: lunasi invoice staff_addon pending yang
    // sudah dibuat saat staf ditambahkan. Jangan buat duplikat. Fallback:
    // buat baru kalau order tidak match invoice yang ada (mis. pembelian
    // di muka via UI billing).
    let target = null;
    if (order.invoiceId) {
      target = await prisma.invoice.findUnique({ where: { id: order.invoiceId } });
      if (target && (target.type !== 'staff_addon' || target.status === 'paid')) target = null;
    }
    if (!target) {
      target = await prisma.invoice.findFirst({
        where: { subscriptionId: order.subscriptionId, type: 'staff_addon', status: { not: 'paid' } },
        orderBy: { createdAt: 'asc' },
      });
    }
    if (target) {
      await prisma.invoice.update({
        where: { id: target.id },
        data: {
          amount:         order.amount,
          originalAmount: order.amount + order.discountAmount,
          discountAmount: order.discountAmount,
          promotionCode:  order.promotionCode,
          status: 'paid',
          paidAt: now,
        },
      });
      // Buka kunci staf yang menunggu pembayaran add-on ini → bisa login.
      if (target.staffUserId) {
        await prisma.user.updateMany({
          where: { id: target.staffUserId, lockedPendingAddon: true },
          data: { isActive: true, lockedPendingAddon: false },
        });
      }
    } else {
      await prisma.invoice.create({
        data: {
          subscriptionId: order.subscriptionId,
          period: `Tambah Staf — ${now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}`,
          amount: order.amount,
          originalAmount: order.amount + order.discountAmount,
          discountAmount: order.discountAmount,
          promotionCode:  order.promotionCode,
          type:   'staff_addon',
          status: 'paid',
          paidAt: now,
        },
      });
    }

  } else if (order.type === 'upgrade' && order.targetPackage) {
    const sub = await prisma.subscription.findUnique({ where: { id: order.subscriptionId } });
    const base = sub?.endDate > now ? sub.endDate : now;
    const newEnd = new Date(base.getTime() + days * 86400 * 1000);

    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: order.subscriptionId },
        data:  {
          package:      order.targetPackage,
          price:        order.amount + order.discountAmount, // simpan harga full pkg untuk renewal berikutnya
          status:       'active',
          endDate:      newEnd,
          billingCycle: cycle,
        },
      }),
      prisma.invoice.create({
        data: {
          subscriptionId: order.subscriptionId,
          period: `Upgrade ke ${order.targetPackage} (${cycle === 'annual' ? 'Tahunan' : 'Bulanan'}) — ${now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}`,
          amount: order.amount,
          originalAmount: order.amount + order.discountAmount,
          discountAmount: order.discountAmount,
          promotionCode:  order.promotionCode,
          billingCycle:   cycle,
          type:   'subscription',
          status: 'paid',
          paidAt: now,
        },
      }),
    ]);
  }

  // Realtime: status langganan baru saja berubah (aktif/diperpanjang/upgrade).
  // Super-admin tidak join tenant room → broadcast global `subscription:any-updated`
  // supaya dashboard SA & halaman billing langsung refresh tanpa polling.
  try {
    const { getIO, tenantRoom } = require('../config/socket');
    const io = getIO();
    if (io) {
      io.emit('subscription:any-updated', { tenantId: order.tenantId, source: 'payment' });
      io.to(tenantRoom(order.tenantId)).emit('subscription:updated', { tenantId: order.tenantId, source: 'payment' });
    }
  } catch { /* observability — never block payment flow */ }

  // Affiliate commission tracking — kalau tenant ini direkrut affiliate aktif,
  // catat 1 commission record per invoice yg baru saja sukses. Rate diambil
  // snapshot dari Affiliate.commissionRate. Jangan menggandakan untuk invoice
  // yang sama (unique constraint [invoiceId, affiliateId]).
  try {
    const referral = await prisma.affiliateReferral.findUnique({
      where: { tenantId: order.tenantId },
      include: { affiliate: true },
    });
    // referral.status harus 'active' — klaim manual 'pending'/'rejected'
    // TIDAK menghasilkan komisi sampai disetujui super-admin.
    if (referral && referral.status === 'active' && referral.affiliate && referral.affiliate.status === 'active') {
      // Cari invoice yang baru saja sukses untuk order ini (paid + paidAt > 1 min lalu).
      const invoice = await prisma.invoice.findFirst({
        where: { subscriptionId: order.subscriptionId, status: 'paid' },
        orderBy: { paidAt: 'desc' },
      });
      if (invoice) {
        const rate = referral.affiliate.commissionRate || 0;
        const commission = Math.round(invoice.amount * rate);
        if (commission > 0) {
          try {
            await prisma.affiliateCommission.create({
              data: {
                affiliateId:    referral.affiliateId,
                referralId:     referral.id,
                tenantId:       order.tenantId,
                invoiceId:      invoice.id,
                paymentOrderId: order.id,
                baseAmount:     invoice.amount,
                commissionRate: rate,
                amount:         commission,
                period:         invoice.period,
                status:         'pending', // butuh approval super-admin
              },
            });
            // Realtime notify affiliate + super-admin.
            try {
              const { getIO } = require('../config/socket');
              const io = getIO();
              if (io) {
                io.to('support').emit('affiliate:commission_created', { affiliateId: referral.affiliateId });
                const aff = await prisma.affiliate.findUnique({ where: { id: referral.affiliateId }, select: { userId: true } });
                if (aff) io.to(`user:${aff.userId}`).emit('affiliate:commission_created', { amount: commission });
              }
            } catch { /* noop */ }
          } catch (e) {
            // Unique constraint (invoiceId,affiliateId) — abaikan double trigger.
            if (e?.code !== 'P2002') console.warn('[affiliate commission]', e?.message || e);
          }
        }
      }
    }
  } catch (e) {
    console.warn('[affiliate commission tracking]', e?.message || e);
  }

  // Promotion redemption tracking
  if (order.promotionCode) {
    const promo = await prisma.promotion.findUnique({ where: { code: order.promotionCode } });
    if (promo) {
      // Idempoten: jangan menggandakan redemption/usedCount kalau order ini
      // sudah pernah dicatat (mis. callback + /check sama-sama jalan).
      const existingRedemption = await prisma.promotionRedemption.findFirst({
        where: { promotionId: promo.id, paymentOrderId: order.id },
      });
      if (!existingRedemption) {
        await prisma.$transaction([
          prisma.promotion.update({
            where: { id: promo.id },
            data:  { usedCount: { increment: 1 } },
          }),
          prisma.promotionRedemption.create({
            data: {
              promotionId:    promo.id,
              tenantId:       order.tenantId,
              paymentOrderId: order.id,
              discountApplied: order.discountAmount,
            },
          }),
        ]);
      }
    }
  }

  // Langganan baru saja aktif kembali — buang cache enforce agar operasi
  // tulis tenant langsung terbuka tanpa menunggu TTL.
  invalidateSubscriptionCache(order.tenantId);

  await logBilling(null, 'duitku', 'order.success', `order:${order.merchantOrderId}`,
    `type=${order.type} amount=${order.amount}`);
}

module.exports = { applySuccessfulPayment };
