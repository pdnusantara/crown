const router = require('express').Router();
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

// Lookup paket dari DB — fallback ke angka default kalau row tidak ada
async function getPackagePrice(packageName) {
  const pkg = await prisma.package.findUnique({
    where: { name: packageName },
    select: { price: true },
  });
  if (pkg) return pkg.price;
  // Fallback kalau seed belum ter-apply
  const FALLBACK = { Basic: 299000, Pro: 599000, Enterprise: 1299000 };
  return FALLBACK[packageName] ?? 0;
}

const tenantSelect = {
  id: true,
  name: true,
  slug: true,
  email: true,
  phone: true,
  address: true,
  logo: true,
  isSuspended: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { branches: true, users: true } },
  subscription: {
    select: { package: true, status: true, endDate: true, price: true, autoRenew: true },
  },
};

// Shared slug validator — lowercase letters, numbers, hyphens only
const slugSchema = z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug may contain only lowercase letters, numbers, and hyphens');

const createTenantSchema = z.object({
  name: z.string().min(1).max(255),
  slug: slugSchema,
  email: z.string().email().optional(),
  ownerEmail: z.string().email().optional(),
  ownerName: z.string().min(1).optional(),
  ownerPassword: z.string().min(8).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  logo: z.string().optional(),
  package: z.enum(['Basic', 'Pro', 'Enterprise']).optional(),
}).refine(
  (v) => !!(v.email || v.ownerEmail),
  { message: 'email or ownerEmail is required', path: ['email'] }
);

const updateTenantSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: slugSchema.optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  logo: z.string().optional(),
  isSuspended: z.boolean().optional(),
  package: z.enum(['Basic', 'Pro', 'Enterprise']).optional(),
});

// Revenue this month per tenant (sum Transaction.total via branch.tenantId)
async function computeMonthlyRevenue(tenantIds) {
  if (!tenantIds.length) return {};
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const rows = await prisma.transaction.findMany({
    where: {
      status: 'completed',
      createdAt: { gte: start },
      branch: { tenantId: { in: tenantIds } },
    },
    select: { total: true, branch: { select: { tenantId: true } } },
  });
  const map = {};
  for (const r of rows) {
    const tid = r.branch.tenantId;
    map[tid] = (map[tid] || 0) + r.total;
  }
  return map;
}

function mapPrismaError(err) {
  if (err?.code === 'P2002') {
    const target = err.meta?.target || [];
    const field = Array.isArray(target) ? target.join(', ') : String(target);
    return { status: 409, error: `Duplicate value on ${field}` };
  }
  return null;
}

// GET /api/tenants/resolve — public; returns basic tenant info from X-Tenant-Slug / subdomain
router.get('/resolve', async (req, res) => {
  if (!req.tenant) {
    return res.status(404).json({ success: false, error: 'Tenant not found' });
  }
  res.json({
    success: true,
    data: {
      id: req.tenant.id,
      name: req.tenant.name,
      slug: req.tenant.slug,
      logo: req.tenant.logo || null,
      isSuspended: req.tenant.isSuspended,
    },
  });
});

// GET /api/tenants
router.get('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, isSuspended } = req.query;

    const where = { deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (isSuspended !== undefined) where.isSuspended = isSuspended === 'true';

    const [data, total] = await Promise.all([
      prisma.tenant.findMany({ where, select: tenantSelect, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.tenant.count({ where }),
    ]);

    const revenues = await computeMonthlyRevenue(data.map((t) => t.id));
    const enriched = data.map((t) => ({ ...t, monthlyRevenue: revenues[t.id] || 0 }));

    res.json({ success: true, data: paginatedResponse(enriched, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.role !== 'tenant_admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    if (req.user.role === 'tenant_admin' && req.user.tenantId !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const tenant = await prisma.tenant.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: tenantSelect,
    });

    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const revenues = await computeMonthlyRevenue([tenant.id]);
    res.json({ success: true, data: { ...tenant, monthlyRevenue: revenues[tenant.id] || 0 } });
  } catch (err) {
    next(err);
  }
});

// POST /api/tenants — creates tenant + subscription + optional owner user in one transaction
router.post('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const body = createTenantSchema.parse(req.body);
    const primaryEmail = body.email || body.ownerEmail;
    const packageName = body.package || 'Basic';
    const price = await getPackagePrice(packageName);

    // Pre-check duplicates to return 409 with useful message
    const conflict = await prisma.tenant.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { email: primaryEmail },
          body.slug ? { slug: body.slug } : undefined,
        ].filter(Boolean),
      },
      select: { id: true, email: true, slug: true },
    });
    if (conflict) {
      const field = conflict.email === primaryEmail ? 'email' : 'slug';
      return res.status(409).json({ success: false, error: `Tenant with this ${field} already exists` });
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 14); // 14-day trial

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: body.name,
          slug: body.slug || null,
          email: primaryEmail,
          phone: body.phone || null,
          address: body.address || null,
          logo: body.logo || null,
        },
        select: tenantSelect,
      });

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          package: packageName,
          status: 'trial',
          price,
          startDate: now,
          endDate,
          autoRenew: true,
        },
      });

      // Create owner admin user if ownerEmail supplied
      if (body.ownerEmail) {
        const passwordHash = await bcrypt.hash(body.ownerPassword || 'ChangeMe123!', 10);
        await tx.user.create({
          data: {
            email: body.ownerEmail,
            password: passwordHash,
            name: body.ownerName || tenant.name + ' Admin',
            role: 'tenant_admin',
            tenantId: tenant.id,
            isActive: true,
          },
        });
      }

      // Re-fetch with subscription included in select
      return tx.tenant.findUnique({ where: { id: tenant.id }, select: tenantSelect });
    });

    res.status(201).json({ success: true, data: { ...result, monthlyRevenue: 0 } });
  } catch (err) {
    const mapped = mapPrismaError(err);
    if (mapped) return res.status(mapped.status).json({ success: false, error: mapped.error });
    next(err);
  }
});

// PUT /api/tenants/:id — partial update; also handles package change (upsert subscription)
router.put('/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.tenant.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const body = updateTenantSchema.parse(req.body);

    // Detect conflict before mutating
    const uniqueChecks = [];
    if (body.email && body.email !== existing.email) uniqueChecks.push({ email: body.email });
    if (body.slug && body.slug !== existing.slug)   uniqueChecks.push({ slug: body.slug });
    if (uniqueChecks.length) {
      const conflict = await prisma.tenant.findFirst({
        where: { deletedAt: null, id: { not: existing.id }, OR: uniqueChecks },
        select: { id: true, email: true, slug: true },
      });
      if (conflict) {
        const field = body.email && conflict.email === body.email ? 'email' : 'slug';
        return res.status(409).json({ success: false, error: `Another tenant already uses this ${field}` });
      }
    }

    const { package: packageName, ...tenantFields } = body;

    const tenant = await prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id: req.params.id },
        data: tenantFields,
        select: tenantSelect,
      });

      if (packageName) {
        const price = await getPackagePrice(packageName);
        await tx.subscription.upsert({
          where: { tenantId: req.params.id },
          update: { package: packageName, price },
          create: {
            tenantId: req.params.id,
            package: packageName,
            status: 'trial',
            price,
            startDate: new Date(),
            endDate: new Date(Date.now() + 14 * 86400 * 1000),
            autoRenew: true,
          },
        });
      }

      return tx.tenant.findUnique({ where: { id: req.params.id }, select: tenantSelect });
    });

    const revenues = await computeMonthlyRevenue([tenant.id]);
    res.json({ success: true, data: { ...tenant, monthlyRevenue: revenues[tenant.id] || 0 } });
  } catch (err) {
    const mapped = mapPrismaError(err);
    if (mapped) return res.status(mapped.status).json({ success: false, error: mapped.error });
    next(err);
  }
});

// PATCH /api/tenants/:id/suspend — toggle suspension
router.patch('/:id/suspend', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const updated = await prisma.tenant.update({
      where: { id: req.params.id },
      data: { isSuspended: !tenant.isSuspended },
      select: tenantSelect,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tenants/:id (soft delete)
router.delete('/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.tenant.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Tenant not found' });

    await prisma.tenant.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true, data: { message: 'Tenant deleted successfully' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
