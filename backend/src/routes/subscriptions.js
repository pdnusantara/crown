const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { getIO, tenantRoom } = require('../config/socket');
const { syncTenantFlagsToPackage } = require('../services/featureFlagSync');

function emitSubChange(action, subscription) {
  if (!subscription) return;
  const io = getIO();
  if (!io) return;
  // Tenant_admin tab yang sedang nampilkan billing perlu refresh.
  io.to(tenantRoom(subscription.tenantId)).emit('subscription:updated', {
    action,
    subscriptionId: subscription.id,
    tenantId: subscription.tenantId,
    status: subscription.status,
    package: subscription.package,
  });
  // Super_admin tidak join tenant room — broadcast extra untuk SA pages.
  io.emit('subscription:any-updated', {
    action,
    subscriptionId: subscription.id,
    tenantId: subscription.tenantId,
  });
}

const subscriptionSelect = {
  id: true,
  tenantId: true,
  package: true,
  status: true,
  price: true,
  billingCycle: true,
  startDate: true,
  endDate: true,
  autoRenew: true,
  pausedAt: true,
  pauseUntil: true,
  pauseReason: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { id: true, name: true, email: true } },
  invoices: {
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true, period: true, amount: true, originalAmount: true, discountAmount: true,
      promotionCode: true, billingCycle: true, type: true, status: true, paidAt: true, createdAt: true,
    },
  },
};

async function logBilling(actorId, actorName, action, target, detail, severity = 'info') {
  try {
    await prisma.auditLog.create({
      data: { actorId, actorName: actorName || 'system', action: `billing.${action}`, target, detail, severity },
    });
  } catch (err) {
    console.warn('[billing audit] failed:', err.message);
  }
}

async function getPackagePriceOrFallback(name) {
  const pkg = await prisma.package.findUnique({ where: { name }, select: { price: true } });
  if (pkg) return pkg.price;
  const FALLBACK = { Basic: 299000, Pro: 599000, Enterprise: 1299000 };
  return FALLBACK[name] ?? 0;
}

// Subscription.package adalah enum, bukan relasi Prisma — jadi kita perlu
// fetch Package terpisah lalu merge supaya konsumen frontend tahu kuota
// (maxBranches, branchAddonPrice, branchAddonType) tanpa request kedua.
async function attachPackageMeta(subscription) {
  if (!subscription) return subscription;
  const pkg = await prisma.package.findUnique({
    where: { name: subscription.package },
    select: { maxBranches: true, branchAddonPrice: true, branchAddonType: true },
  });
  return {
    ...subscription,
    maxBranches: pkg?.maxBranches ?? null,
    branchAddonPrice: pkg?.branchAddonPrice ?? 0,
    branchAddonType: pkg?.branchAddonType ?? null,
  };
}

const createSubscriptionSchema = z.object({
  tenantId: z.string().min(1),
  package: z.enum(['Basic', 'Pro', 'Enterprise']),
  status: z.enum(['trial', 'active', 'overdue', 'expired']).optional(),
  price: z.number().int().min(0),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  billingCycle: z.enum(['monthly', 'annual']).optional(),
  autoRenew: z.boolean().optional(),
});

const updateSubscriptionSchema = createSubscriptionSchema.partial().omit({ tenantId: true });

// GET /api/subscriptions
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status, package: pkg } = req.query;

    const where = {};

    // Sembunyikan langganan milik tenant yang sudah di-soft-delete — tanpa ini
    // tenant yang sudah dihapus tetap muncul di halaman billing super-admin.
    where.tenant = { deletedAt: null };

    if (req.user.role === 'tenant_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    if (status) where.status = status;
    if (pkg) where.package = pkg;

    const [data, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        select: subscriptionSelect,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.subscription.count({ where }),
    ]);

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/subscriptions/:id
router.get('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: req.params.id },
      select: {
        ...subscriptionSelect,
        invoices: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, period: true, amount: true, type: true, status: true, paidAt: true, createdAt: true },
        },
      },
    });

    if (!subscription) return res.status(404).json({ success: false, error: 'Subscription not found' });

    if (req.user.role === 'tenant_admin' && subscription.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: subscription });
  } catch (err) {
    next(err);
  }
});

// GET /api/subscriptions/tenant/:tenantId - get subscription by tenant
router.get('/tenant/:tenantId', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.tenantId !== req.params.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { tenantId: req.params.tenantId },
      select: subscriptionSelect,
    });

    if (!subscription) return res.status(404).json({ success: false, error: 'Subscription not found' });

    res.json({ success: true, data: await attachPackageMeta(subscription) });
  } catch (err) {
    next(err);
  }
});

// POST /api/subscriptions
router.post('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const body = createSubscriptionSchema.parse(req.body);

    const existing = await prisma.subscription.findUnique({ where: { tenantId: body.tenantId } });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Tenant already has a subscription' });
    }

    const subscription = await prisma.subscription.create({
      data: body,
      select: subscriptionSelect,
    });

    emitSubChange('create', subscription);
    res.status(201).json({ success: true, data: subscription });
  } catch (err) {
    next(err);
  }
});

// PUT /api/subscriptions/:id
router.put('/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Subscription not found' });

    const body = updateSubscriptionSchema.parse(req.body);
    const subscription = await prisma.subscription.update({
      where: { id: req.params.id },
      data: body,
      select: subscriptionSelect,
    });

    res.json({ success: true, data: subscription });
  } catch (err) {
    next(err);
  }
});

// GET /api/subscriptions/invoices/:invoiceId — single invoice (for printable receipt)
router.get('/invoices/:invoiceId', authenticate, async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.invoiceId },
      include: {
        subscription: {
          include: {
            tenant: {
              select: {
                id: true, name: true, email: true, phone: true, address: true,
                companyName: true, npwp: true, taxAddress: true,
              },
            },
          },
        },
      },
    });
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice tidak ditemukan' });

    if (req.user.role !== 'super_admin' && invoice.subscription.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Akses ditolak' });
    }

    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
});

// POST /api/subscriptions/:id/invoices - create invoice
router.post('/:id/invoices', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { period, amount, type, status } = z.object({
      period: z.string().min(1),
      amount: z.number().int().min(0),
      type: z.enum(['subscription', 'branch_addon']).optional(),
      status: z.enum(['pending', 'paid', 'overdue']).optional(),
    }).parse(req.body);

    const subscription = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!subscription) return res.status(404).json({ success: false, error: 'Subscription not found' });

    const invoice = await prisma.invoice.create({
      data: { subscriptionId: req.params.id, period, amount, type, status },
    });

    res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/subscriptions/:id/invoices/:invoiceId/pay
router.patch('/:id/invoices/:invoiceId/pay', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.invoiceId, subscriptionId: req.params.id },
    });
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });

    const updated = await prisma.invoice.update({
      where: { id: req.params.invoiceId },
      data: { status: 'paid', paidAt: new Date() },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/subscriptions/:id/upgrade — ubah paket + sync harga (admin only)
router.patch('/:id/upgrade', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { package: packageName } = z.object({
      package: z.enum(['Basic', 'Pro', 'Enterprise']),
    }).parse(req.body);

    const existing = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Subscription not found' });

    const price = await getPackagePriceOrFallback(packageName);
    const updated = await prisma.subscription.update({
      where: { id: req.params.id },
      data: {
        package: packageName,
        price,
        status: existing.status === 'expired' ? 'active' : existing.status,
      },
      select: subscriptionSelect,
    });

    await logBilling(req.user.id, req.user.name, 'upgrade.manual', `subscription:${req.params.id}`,
      `${existing.package} → ${packageName} price=${price}`);

    // Pindah paket → sinkronkan feature flag tenant ke feature-set paket baru,
    // supaya fitur ikut aktif/nonaktif sesuai tier langganan.
    if (packageName !== existing.package) {
      try {
        await syncTenantFlagsToPackage(existing.tenantId, packageName);
      } catch (e) {
        console.warn('[upgrade] syncTenantFlagsToPackage gagal:', e?.message || e);
      }
    }

    emitSubChange('upgrade', updated);
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid package name' });
    }
    next(err);
  }
});

// PATCH /api/subscriptions/:id/renew — perpanjang manual (admin only)
router.patch('/:id/renew', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { cycle = 'monthly' } = z.object({
      cycle: z.enum(['monthly', 'annual']).optional(),
    }).parse(req.body || {});

    const existing = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Subscription not found' });

    const now = new Date();
    const days = cycle === 'annual' ? 365 : 30;
    const base = existing.endDate > now ? existing.endDate : now;
    const newEndDate = new Date(base.getTime() + days * 86400 * 1000);

    const updated = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.update({
        where: { id: req.params.id },
        data: { status: 'active', endDate: newEndDate, billingCycle: cycle },
        select: subscriptionSelect,
      });
      await tx.invoice.create({
        data: {
          subscriptionId: sub.id,
          period: now.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
          amount: sub.price,
          billingCycle: cycle,
          type: 'subscription',
          status: 'paid',
          paidAt: now,
        },
      });
      return tx.subscription.findUnique({ where: { id: sub.id }, select: subscriptionSelect });
    });

    await logBilling(req.user.id, req.user.name, 'renew.manual', `subscription:${req.params.id}`,
      `cycle=${cycle} until=${newEndDate.toISOString()}`);

    emitSubChange('renew', updated);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/subscriptions/:id/pause — tenant_admin pause langganan
const pauseSchema = z.object({
  pauseUntil: z.string().datetime(),
  reason:     z.string().min(1).max(500).optional(),
});
const MAX_PAUSE_DAYS = Number(process.env.MAX_PAUSE_DAYS || 30);

router.post('/:id/pause', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const body = pauseSchema.parse(req.body);
    const existing = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Subscription not found' });

    if (req.user.role === 'tenant_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    if (existing.status === 'paused') return res.status(400).json({ success: false, error: 'Sudah dalam status paused' });
    if (existing.status === 'expired') return res.status(400).json({ success: false, error: 'Tidak bisa pause langganan yang sudah berakhir' });

    const now = new Date();
    const pauseUntil = new Date(body.pauseUntil);
    if (pauseUntil <= now) return res.status(400).json({ success: false, error: 'Tanggal pause harus di masa depan' });

    const maxUntil = new Date(now.getTime() + MAX_PAUSE_DAYS * 86400 * 1000);
    if (pauseUntil > maxUntil) {
      return res.status(400).json({ success: false, error: `Pause maksimal ${MAX_PAUSE_DAYS} hari` });
    }

    const updated = await prisma.subscription.update({
      where: { id: req.params.id },
      data: { status: 'paused', pausedAt: now, pauseUntil, pauseReason: body.reason || null, autoRenew: false },
      select: subscriptionSelect,
    });

    await logBilling(req.user.id, req.user.name, 'pause', `subscription:${req.params.id}`,
      `until=${pauseUntil.toISOString()} reason="${body.reason || ''}"`);

    emitSubChange('pause', updated);
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// POST /api/subscriptions/:id/resume — kembali aktif sebelum pauseUntil
router.post('/:id/resume', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Subscription not found' });
    if (req.user.role === 'tenant_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    if (existing.status !== 'paused') return res.status(400).json({ success: false, error: 'Bukan dalam status paused' });

    // Kembalikan endDate plus durasi pause yang tersisa, supaya hari paid yang
    // tidak terpakai selama pause tidak hilang.
    const now = new Date();
    const pausedAt = existing.pausedAt || now;
    const elapsedMs = now.getTime() - new Date(pausedAt).getTime();
    const newEnd = new Date(new Date(existing.endDate).getTime() + Math.max(0, elapsedMs));

    const updated = await prisma.subscription.update({
      where: { id: req.params.id },
      data: { status: 'active', endDate: newEnd, pausedAt: null, pauseUntil: null, pauseReason: null },
      select: subscriptionSelect,
    });

    await logBilling(req.user.id, req.user.name, 'resume', `subscription:${req.params.id}`,
      `extended until=${newEnd.toISOString()}`);

    emitSubChange('resume', updated);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// POST /api/subscriptions/:id/grant-branch — super_admin memberi lisensi cabang gratis
// Membuat invoice branch_addon dengan status=paid (amount=0), sehingga quota licensed
// langsung bertambah 1 tanpa pembayaran.
router.post('/:id/grant-branch', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: req.params.id },
      select: { id: true, tenantId: true },
    });
    if (!subscription) return res.status(404).json({ success: false, error: 'Subscription not found' });

    const { note } = req.body;
    const now = new Date();
    const invoice = await prisma.invoice.create({
      data: {
        subscriptionId: subscription.id,
        period: note || `Lisensi Cabang — ${now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}`,
        amount: 0,
        type: 'branch_addon',
        status: 'paid',
        paidAt: now,
      },
    });

    await logBilling(req.user.id, req.user.name, 'grantBranch', `subscription:${subscription.id}`,
      `tenantId=${subscription.tenantId} note="${note || ''}"`);

    res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/subscriptions/:id/auto-renew — toggle autoRenew
router.patch('/:id/auto-renew', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Subscription not found' });

    if (req.user.role === 'tenant_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const newValue = !existing.autoRenew;
    const updated = await prisma.subscription.update({
      where: { id: req.params.id },
      data: { autoRenew: newValue },
      select: subscriptionSelect,
    });

    await logBilling(req.user.id, req.user.name, 'autoRenew.toggle', `subscription:${req.params.id}`,
      `${existing.autoRenew} → ${newValue}`);

    emitSubChange('auto-renew', updated);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
