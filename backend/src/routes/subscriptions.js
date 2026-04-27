const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const subscriptionSelect = {
  id: true,
  tenantId: true,
  package: true,
  status: true,
  price: true,
  startDate: true,
  endDate: true,
  autoRenew: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { id: true, name: true, email: true } },
  invoices: {
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, period: true, amount: true, type: true, status: true, paidAt: true, createdAt: true },
  },
};

async function getPackagePriceOrFallback(name) {
  const pkg = await prisma.package.findUnique({ where: { name }, select: { price: true } });
  if (pkg) return pkg.price;
  const FALLBACK = { Basic: 299000, Pro: 599000, Enterprise: 1299000 };
  return FALLBACK[name] ?? 0;
}

const createSubscriptionSchema = z.object({
  tenantId: z.string().min(1),
  package: z.enum(['Basic', 'Pro', 'Enterprise']),
  status: z.enum(['trial', 'active', 'overdue', 'expired']).optional(),
  price: z.number().int().min(0),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  autoRenew: z.boolean().optional(),
});

const updateSubscriptionSchema = createSubscriptionSchema.partial().omit({ tenantId: true });

// GET /api/subscriptions
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status, package: pkg } = req.query;

    const where = {};

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

    res.json({ success: true, data: subscription });
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

// PATCH /api/subscriptions/:id/upgrade — ubah paket + sync harga
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

    res.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid package name' });
    }
    next(err);
  }
});

// PATCH /api/subscriptions/:id/renew — perpanjang 30 hari + buat invoice
router.patch('/:id/renew', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.subscription.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Subscription not found' });

    const now = new Date();
    // Perpanjang dari tanggal akhir kalau masih ke depan, atau dari sekarang kalau sudah lewat
    const base = existing.endDate > now ? existing.endDate : now;
    const newEndDate = new Date(base.getTime() + 30 * 86400 * 1000);

    const updated = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.update({
        where: { id: req.params.id },
        data: { status: 'active', endDate: newEndDate },
        select: subscriptionSelect,
      });
      await tx.invoice.create({
        data: {
          subscriptionId: sub.id,
          period: now.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
          amount: sub.price,
          type: 'subscription',
          status: 'paid',
          paidAt: now,
        },
      });
      return tx.subscription.findUnique({ where: { id: sub.id }, select: subscriptionSelect });
    });

    res.json({ success: true, data: updated });
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

    const updated = await prisma.subscription.update({
      where: { id: req.params.id },
      data: { autoRenew: !existing.autoRenew },
      select: subscriptionSelect,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
