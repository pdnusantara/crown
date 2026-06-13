const router   = require('express').Router();
const { z }    = require('zod');
const prisma   = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const duitku   = require('../services/duitkuService');
const { invalidateSubscriptionCache } = require('../middleware/enforceSubscription');
const { applySuccessfulPayment } = require('../services/paymentFulfillment');

const BACKEND_URL  = process.env.BACKEND_URL  || process.env.FRONTEND_URL?.replace(/\/$/, '') || 'https://sembapos.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sembapos.com';
const PUBLIC_HOST  = process.env.PUBLIC_HOST  || FRONTEND_URL.replace(/^https?:\/\//, '').replace(/\/$/, '') || 'sembapos.com';
const ORDER_TTL_MIN = Number(process.env.PAYMENT_ORDER_TTL_MINUTES) || 60;

// Tenant beroperasi & login di subdomain (login di-enforce per subdomain).
// Arahkan returnUrl Duitku ke subdomain tenant supaya setelah bayar mereka
// mendarat dalam keadaan login di halaman billing-nya sendiri — bukan di main
// domain (yang menolak sesi akun tenant). Fallback ke main domain bila slug
// belum ada.
function billingReturnUrl(slug, merchantOrderId) {
  const base = slug ? `https://${slug}.${PUBLIC_HOST}` : FRONTEND_URL.replace(/\/$/, '');
  return `${base}/admin/billing?payment=done&order=${merchantOrderId}`;
}

// ── Settings (super admin) ────────────────────────────────────────────────

// GET /api/payment/settings — full settings object, super_admin only
router.get('/settings', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const settings = await duitku.getSettings();
    res.json({
      success: true,
      data: {
        merchantCode:  settings.merchantCode,
        apiKey:        settings.apiKey ? '••••••••' + settings.apiKey.slice(-4) : '',
        environment:   settings.environment,
        expiryMinutes: settings.expiryMinutes,
        active:        settings.active,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/payment/status — flag minimal "active" untuk semua user otentikasi.
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const settings = await duitku.getSettings();
    res.json({ success: true, data: { active: !!settings.active } });
  } catch (err) { next(err); }
});

const settingsSchema = z.object({
  merchantCode:  z.string().min(1).max(100).optional(),
  apiKey:        z.string().min(1).max(200).optional(),
  environment:   z.enum(['sandbox', 'production']).optional(),
  expiryMinutes: z.number().int().min(5).max(1440).optional(),
  active:        z.boolean().optional(),
});

// PUT /api/payment/settings
router.put('/settings', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const body = settingsSchema.parse(req.body);
    const mapping = {
      merchantCode:  'duitku_merchant_code',
      apiKey:        'duitku_api_key',
      environment:   'duitku_environment',
      expiryMinutes: 'duitku_expiry_minutes',
      active:        'duitku_active',
    };
    await Promise.all(
      Object.entries(body).map(([k, v]) =>
        prisma.systemSetting.upsert({
          where:  { key: mapping[k] },
          update: { value: String(v) },
          create: { key: mapping[k], value: String(v) },
        })
      )
    );
    res.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────

// Hitung harga bulanan/tahunan dengan diskon paket tahunan.
// Annual = 12 × monthly × (1 - discount%/100), dibulatkan ke 1000 IDR terdekat.
function computeCyclePrice(pkgPrice, cycle, annualDiscountPercent = 17) {
  if (cycle === 'annual') {
    const raw = pkgPrice * 12 * (1 - (annualDiscountPercent || 0) / 100);
    return Math.round(raw / 1000) * 1000;
  }
  return pkgPrice;
}

// Validate + return promo discount (in IDR) if code is valid for context.
// Returns { promotion, discount } or { error }.
async function resolvePromotion({ code, type, packageName, billingCycle, baseAmount, tenantId }) {
  if (!code) return { promotion: null, discount: 0 };
  const promo = await prisma.promotion.findUnique({ where: { code: code.toUpperCase() } });
  if (!promo || !promo.isActive) return { error: 'Kode promo tidak ditemukan / nonaktif' };

  const now = new Date();
  if (promo.validFrom && now < promo.validFrom) return { error: 'Kode promo belum berlaku' };
  if (promo.validUntil && now > promo.validUntil) return { error: 'Kode promo sudah kedaluwarsa' };
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) return { error: 'Kode promo sudah habis kuota' };

  if (promo.appliesTo.length && !promo.appliesTo.includes(type)) {
    return { error: 'Kode promo tidak berlaku untuk transaksi ini' };
  }
  if (promo.packageScope.length && packageName && !promo.packageScope.includes(packageName)) {
    return { error: `Kode promo hanya untuk paket: ${promo.packageScope.join(', ')}` };
  }
  if (promo.cycleScope.length && billingCycle && !promo.cycleScope.includes(billingCycle)) {
    return { error: `Kode promo hanya untuk siklus: ${promo.cycleScope.join(', ')}` };
  }

  // 1× per tenant per promotion (mencegah abuse)
  const already = await prisma.promotionRedemption.findFirst({
    where: { promotionId: promo.id, tenantId },
  });
  if (already) return { error: 'Anda sudah pernah memakai kode ini' };

  let discount = 0;
  if (promo.discountType === 'percent') {
    discount = Math.round((baseAmount * promo.discountValue) / 100);
  } else {
    discount = promo.discountValue;
  }
  discount = Math.max(0, Math.min(discount, baseAmount - 1000)); // sisakan minimal Rp 1.000

  return { promotion: promo, discount };
}

async function logBilling(actorId, actorName, action, target, detail, severity = 'info') {
  try {
    await prisma.auditLog.create({
      data: { actorId, actorName: actorName || 'system', action: `billing.${action}`, target, detail, severity },
    });
  } catch (err) {
    console.warn('[billing audit] failed:', err.message);
  }
}

// ── Promotions: validate (tenant-side) ────────────────────────────────────

// POST /api/payment/promotions/validate — preview diskon sebelum bayar
const validatePromoSchema = z.object({
  code:          z.string().min(1).max(40),
  type:          z.enum(['subscription', 'upgrade', 'branch_addon', 'staff_addon']),
  targetPackage: z.enum(['Basic', 'Pro', 'Enterprise']).nullish(),
  billingCycle:  z.enum(['monthly', 'annual']).nullish(),
});

router.post('/promotions/validate', authenticate, async (req, res, next) => {
  try {
    if (!req.user.tenantId) return res.status(403).json({ success: false, error: 'Akses ditolak' });
    const body = validatePromoSchema.parse(req.body);

    const sub = await prisma.subscription.findUnique({ where: { tenantId: req.user.tenantId } });
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription tidak ditemukan' });

    const packageName = body.targetPackage || sub.package;
    const pkg = await prisma.package.findUnique({ where: { name: packageName } });
    if (!pkg) return res.status(400).json({ success: false, error: 'Paket tidak ditemukan' });

    let baseAmount;
    if (body.type === 'branch_addon') {
      baseAmount = pkg.branchAddonPrice;
    } else if (body.type === 'staff_addon') {
      baseAmount = pkg.staffAddonPrice;
    } else {
      baseAmount = computeCyclePrice(pkg.price, body.billingCycle || 'monthly', pkg.annualDiscountPercent);
    }

    const result = await resolvePromotion({
      code: body.code,
      type: body.type,
      packageName,
      billingCycle: body.billingCycle || sub.billingCycle,
      baseAmount,
      tenantId: req.user.tenantId,
    });

    if (result.error) return res.status(400).json({ success: false, error: result.error });

    res.json({
      success: true,
      data: {
        code:        result.promotion.code,
        description: result.promotion.description,
        baseAmount,
        discount:    result.discount,
        finalAmount: baseAmount - result.discount,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// ── Create payment order ──────────────────────────────────────────────────

const createOrderSchema = z.object({
  subscriptionId: z.string().min(1),
  invoiceId:      z.string().min(1).nullish(),
  type:           z.enum(['subscription', 'branch_addon', 'staff_addon', 'upgrade']),
  targetPackage:  z.enum(['Basic', 'Pro', 'Enterprise']).nullish(),
  billingCycle:   z.enum(['monthly', 'annual']).nullish(),
  promotionCode:  z.string().min(1).max(40).nullish(),
  idempotencyKey: z.string().min(8).max(128).nullish(),
});

// POST /api/payment/create
router.post('/create', authenticate, async (req, res, next) => {
  try {
    const body = createOrderSchema.parse(req.body);
    const { subscriptionId, invoiceId, type, targetPackage } = body;
    const billingCycle  = body.billingCycle  || 'monthly';
    const promotionCode = body.promotionCode ? body.promotionCode.toUpperCase() : null;
    const idempotencyKey = body.idempotencyKey || null;

    // Idempotency: kalau key sama dan order masih pending/success → return existing
    if (idempotencyKey) {
      const existing = await prisma.paymentOrder.findUnique({ where: { idempotencyKey } });
      if (existing && ['pending', 'success'].includes(existing.status)) {
        return res.json({
          success: true,
          data: { paymentUrl: existing.paymentUrl, merchantOrderId: existing.merchantOrderId, reference: existing.reference, idempotent: true },
        });
      }
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { tenant: { select: { id: true, name: true, email: true, companyName: true, npwp: true, slug: true } } },
    });
    if (!subscription) return res.status(404).json({ success: false, error: 'Subscription tidak ditemukan' });

    if (req.user.role === 'tenant_admin' && subscription.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Akses ditolak' });
    }

    let packageName = subscription.package;
    let amount = subscription.price;
    let productDetails = `Subscription ${subscription.package} — ${subscription.tenant.name}`;
    let resolvedTargetPackage = null;
    let baseBeforePromo = null;

    if (type === 'branch_addon') {
      const pkg = await prisma.package.findUnique({ where: { name: subscription.package } });
      amount = pkg?.branchAddonPrice || 0;
      productDetails = `Tambah Cabang — ${subscription.tenant.name}`;
      baseBeforePromo = amount;

    } else if (type === 'staff_addon') {
      const pkg = await prisma.package.findUnique({ where: { name: subscription.package } });
      amount = pkg?.staffAddonPrice || 0;
      productDetails = `Tambah Staf — ${subscription.tenant.name}`;
      baseBeforePromo = amount;

    } else if (type === 'upgrade') {
      if (!targetPackage) return res.status(400).json({ success: false, error: 'Paket tujuan upgrade wajib diisi' });
      if (targetPackage === subscription.package && billingCycle === subscription.billingCycle) {
        return res.status(400).json({ success: false, error: 'Sudah pada paket & siklus tersebut' });
      }
      const pkg = await prisma.package.findUnique({ where: { name: targetPackage } });
      if (!pkg) return res.status(400).json({ success: false, error: 'Paket tujuan tidak ditemukan' });
      amount = computeCyclePrice(pkg.price, billingCycle, pkg.annualDiscountPercent);
      productDetails = `Upgrade ke ${targetPackage} (${billingCycle === 'annual' ? 'Tahunan' : 'Bulanan'}) — ${subscription.tenant.name}`;
      resolvedTargetPackage = targetPackage;
      packageName = targetPackage;
      baseBeforePromo = amount;

    } else {
      // subscription renewal
      const pkg = await prisma.package.findUnique({ where: { name: subscription.package } });
      amount = computeCyclePrice(pkg?.price ?? subscription.price, billingCycle, pkg?.annualDiscountPercent);
      productDetails = `Perpanjang ${subscription.package} (${billingCycle === 'annual' ? 'Tahunan' : 'Bulanan'}) — ${subscription.tenant.name}`;
      baseBeforePromo = amount;
    }

    // Apply promo
    let discountAmount = 0;
    let promotion = null;
    if (promotionCode) {
      const result = await resolvePromotion({
        code: promotionCode,
        type,
        packageName,
        billingCycle,
        baseAmount: baseBeforePromo,
        tenantId: subscription.tenantId,
      });
      if (result.error) return res.status(400).json({ success: false, error: result.error });
      discountAmount = result.discount;
      promotion = result.promotion;
      amount = baseBeforePromo - discountAmount;
    }

    if (amount <= 0) return res.status(400).json({ success: false, error: 'Nominal pembayaran tidak valid' });

    const merchantOrderId = `CROWN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const callbackUrl = `${BACKEND_URL}/api/payment/callback`;
    const returnUrl   = billingReturnUrl(subscription.tenant.slug, merchantOrderId);

    const duitkuRes = await duitku.createInvoice({
      merchantOrderId,
      amount,
      email:          subscription.tenant.email,
      productDetails,
      callbackUrl,
      returnUrl,
      customerName:   subscription.tenant.companyName || subscription.tenant.name,
    });

    const expiresAt = new Date(Date.now() + ORDER_TTL_MIN * 60 * 1000);

    await prisma.paymentOrder.create({
      data: {
        merchantOrderId,
        idempotencyKey,
        tenantId:       subscription.tenantId,
        invoiceId:      invoiceId || null,
        subscriptionId,
        type,
        targetPackage:  resolvedTargetPackage,
        billingCycle,
        promotionCode:  promotion?.code || null,
        discountAmount,
        amount,
        status:     'pending',
        paymentUrl: duitkuRes.paymentUrl,
        reference:  duitkuRes.reference || null,
        expiresAt,
      },
    });

    await logBilling(req.user.id, req.user.name, 'order.create', `subscription:${subscriptionId}`,
      `type=${type} cycle=${billingCycle} amount=${amount}${promotion ? ` promo=${promotion.code} discount=${discountAmount}` : ''}`);

    res.json({
      success: true,
      data: {
        paymentUrl: duitkuRes.paymentUrl,
        merchantOrderId,
        reference: duitkuRes.reference,
        amount,
        discountAmount,
        expiresAt,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// ── Cancel pending order (tenant_admin) ───────────────────────────────────

router.post('/orders/:merchantOrderId/cancel', authenticate, async (req, res, next) => {
  try {
    const order = await prisma.paymentOrder.findUnique({ where: { merchantOrderId: req.params.merchantOrderId } });
    if (!order) return res.status(404).json({ success: false, error: 'Order tidak ditemukan' });

    if (req.user.role !== 'super_admin' && order.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Akses ditolak' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Order tidak bisa dibatalkan (status=${order.status})` });
    }

    await prisma.paymentOrder.update({
      where: { merchantOrderId: order.merchantOrderId },
      data:  { status: 'cancelled' },
    });

    await logBilling(req.user.id, req.user.name, 'order.cancel', `order:${order.merchantOrderId}`,
      `manually cancelled by ${req.user.role}`);

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Resend payment link via WhatsApp ──────────────────────────────────────

router.post('/orders/:merchantOrderId/resend', authenticate, async (req, res, next) => {
  try {
    const order = await prisma.paymentOrder.findUnique({
      where: { merchantOrderId: req.params.merchantOrderId },
    });
    if (!order) return res.status(404).json({ success: false, error: 'Order tidak ditemukan' });
    if (req.user.role !== 'super_admin' && order.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Akses ditolak' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Order tidak pending' });
    }
    if (!order.paymentUrl) {
      return res.status(400).json({ success: false, error: 'Link pembayaran tidak tersedia' });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: order.tenantId }, select: { name: true } });
    const wa = require('../services/whatsappService');
    const settings = await wa.getTenantSettings(order.tenantId);
    if (!settings.enabled || !settings.notifyAdminPhone) {
      return res.status(400).json({ success: false, error: 'WhatsApp belum aktif. Aktifkan dulu di Pengaturan → WhatsApp.' });
    }

    const text = [
      '[SembaPOS] Link Pembayaran',
      '',
      `Halo ${tenant?.name || ''},`,
      `Berikut ulang link pembayaran Anda:`,
      '',
      order.paymentUrl,
      '',
      `Total: Rp ${order.amount.toLocaleString('id-ID')}`,
      order.expiresAt ? `Kedaluwarsa: ${new Date(order.expiresAt).toLocaleString('id-ID')}` : null,
    ].filter(Boolean).join('\n');

    const result = await wa.sendSystemMessage(order.tenantId, settings.notifyAdminPhone, text);
    if (!result.sent) {
      return res.status(400).json({ success: false, error: result.error || 'Gagal mengirim WhatsApp' });
    }

    await logBilling(req.user.id, req.user.name, 'order.resend', `order:${order.merchantOrderId}`, 'resent via WA');
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Duitku callback (public — no auth) ────────────────────────────────────

router.post('/callback', async (req, res) => {
  try {
    const { merchantCode, amount, merchantOrderId, resultCode, paymentCode, reference } = req.body;

    const settings = await duitku.getSettings();
    if (!duitku.verifyCallback(req.body, settings.apiKey)) {
      console.warn('[Duitku] invalid callback signature', merchantOrderId);
      // Audit alert
      await prisma.auditLog.create({
        data: {
          actorName: 'duitku',
          action:   'billing.signature.invalid',
          target:   `order:${merchantOrderId || 'unknown'}`,
          detail:   `IP=${req.ip} body=${JSON.stringify(req.body).slice(0, 500)}`,
          severity: 'critical',
        },
      }).catch(() => {});
      return res.status(400).send('Invalid signature');
    }

    const order = await prisma.paymentOrder.findUnique({ where: { merchantOrderId } });
    if (!order) return res.status(404).send('Order not found');

    const success = resultCode === '00';
    const status  = success ? 'success' : 'failed';

    // Hardening: Duitku menandatangani merchantCode+amount+merchantOrderId, jadi
    // signature valid sudah menjamin integritas amount. Tetap catat bila amount
    // callback ≠ yang kita tagih (deteksi bug logika harga) — tanpa memblokir.
    if (success && order.amount != null && Math.round(Number(amount)) !== order.amount) {
      await logBilling(null, 'duitku', 'amount.mismatch', `order:${merchantOrderId}`,
        `callback=${amount} expected=${order.amount}`, 'critical').catch(() => {});
    }

    // Idempotency — callback Duitku publik & kerap di-retry; body valid bisa
    // di-replay. Klaim order secara ATOMIK: hanya satu callback yang boleh
    // memindahkan order dari non-'success' ke status final. Callback yang
    // di-replay (order sudah 'success') mendapat count 0 lalu diabaikan —
    // mencegah perpanjangan langganan/lisensi cabang/invoice ganda.
    const claim = await prisma.paymentOrder.updateMany({
      where: { merchantOrderId, status: { not: 'success' } },
      data:  { status, paymentMethod: paymentCode || null, reference: reference || order.reference },
    });
    if (claim.count === 0) {
      return res.status(200).send('OK');
    }

    if (success) {
      try {
        await applySuccessfulPayment(order);
      } catch (err) {
        // Fulfillment gagal SETELAH order diklaim 'success'. Kembalikan ke
        // 'pending' supaya retry callback Duitku / polling /check / cron
        // reconcile bisa mencoba lagi — jangan biarkan tenant sudah bayar tapi
        // langganan tak aktif.
        await prisma.paymentOrder.updateMany({
          where: { merchantOrderId, status: 'success' },
          data:  { status: 'pending' },
        }).catch(() => {});
        throw err; // → 500, Duitku akan retry callback
      }
    } else {
      await logBilling(null, 'duitku', 'order.failed', `order:${merchantOrderId}`,
        `resultCode=${resultCode}`);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('[Duitku callback error]', err);
    res.status(500).send('Error');
  }
});

// ── Check order status ────────────────────────────────────────────────────

router.get('/check/:merchantOrderId', authenticate, async (req, res, next) => {
  try {
    const order = await prisma.paymentOrder.findUnique({ where: { merchantOrderId: req.params.merchantOrderId } });
    if (!order) return res.status(404).json({ success: false, error: 'Order tidak ditemukan' });
    if (req.user.role !== 'super_admin' && order.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Akses ditolak' });
    }

    if (order.status === 'pending') {
      try {
        const duitkuStatus = await duitku.checkStatus(order.merchantOrderId);
        if (duitkuStatus.statusCode === '00') {
          // Duitku mengonfirmasi lunas tapi DB masih pending → callback telat /
          // tak sampai. Klaim atomik lalu jalankan fulfillment yang SAMA dengan
          // callback (perpanjang langganan, lunasi invoice, buka kunci staf,
          // komisi/promo). JANGAN sekadar set status — itu akan menghalangi
          // callback memproses & menyebabkan "dibayar tapi tak aktif".
          const claim = await prisma.paymentOrder.updateMany({
            where: { merchantOrderId: order.merchantOrderId, status: { not: 'success' } },
            data:  { status: 'success' },
          });
          if (claim.count > 0) {
            try {
              await applySuccessfulPayment(order);
            } catch (e) {
              await prisma.paymentOrder.updateMany({
                where: { merchantOrderId: order.merchantOrderId, status: 'success' },
                data:  { status: 'pending' },
              }).catch(() => {});
              throw e; // ditangkap catch luar → non-fatal, retry di poll berikutnya
            }
          }
          order.status = 'success';
        }
      } catch (_) { /* polling failure is non-fatal */ }
    }

    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

// GET /api/payment/my-orders — pending orders milik tenant sendiri
router.get('/my-orders', authenticate, async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    if (!tenantId) return res.status(403).json({ success: false, error: 'Akses ditolak' });

    const orders = await prisma.paymentOrder.findMany({
      where: { tenantId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    res.json({ success: true, data: orders });
  } catch (err) { next(err); }
});

// POST /api/payment/trigger-renewal — super_admin
router.post('/trigger-renewal', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { runRenewalJob } = require('../jobs/subscriptionRenewal');
    const result = await runRenewalJob();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /api/payment/orders — super admin: list all orders
router.get('/orders', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { tenantId, status, page = 1, limit = 20 } = req.query;
    const where = {};
    if (tenantId) where.tenantId = tenantId;
    if (status)   where.status   = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      prisma.paymentOrder.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' } }),
      prisma.paymentOrder.count({ where }),
    ]);
    res.json({ success: true, data: { data, total, page: Number(page), limit: Number(limit) } });
  } catch (err) { next(err); }
});

module.exports = router;
