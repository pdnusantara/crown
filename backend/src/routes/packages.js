const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { getIO } = require('../config/socket');
const { recordAudit } = require('../utils/auditLog');
const { propagatePackageFeatureChange } = require('../services/featureFlagSync');

const packageSelect = {
  name: true,
  price: true,
  maxBranches: true,
  maxStaff: true,
  staffAddonPrice: true,
  staffAddonType: true,
  branchAddonPrice: true,
  branchAddonType: true,
  // Diskon tahunan (% dari 12×harga) — dipakai LandingPage / RegisterPage /
  // TABillingPage / payment.js / renewal job. Wajib ada di response supaya
  // semua call site tidak fallback ke 17 hardcoded.
  annualDiscountPercent: true,
  description: true,
  features: true,
  updatedAt: true,
};

const packageNameSchema = z.enum(['Basic', 'Pro', 'Enterprise']);

const updatePackageSchema = z.object({
  price:                 z.number().int().min(0).max(999_999_999).optional(),
  maxBranches:           z.number().int().min(1).max(9999).optional(),
  maxStaff:              z.number().int().min(1).max(9999).optional(),
  staffAddonPrice:       z.number().int().min(0).max(999_999_999).optional(),
  staffAddonType:        z.enum(['monthly', 'onetime']).optional(),
  branchAddonPrice:      z.number().int().min(0).max(999_999_999).optional(),
  branchAddonType:       z.enum(['monthly', 'onetime']).optional(),
  annualDiscountPercent: z.number().int().min(0).max(100).optional(),
  description:           z.string().max(500).nullable().optional(),
  features:              z.array(z.string()).max(100).optional(),
}).strict();

// GET /api/packages — list all packages with live tenant counts
router.get('/', authenticate, async (req, res, next) => {
  try {
    const [packages, counts] = await Promise.all([
      prisma.package.findMany({ select: packageSelect, orderBy: { price: 'asc' } }),
      // Hitung tenant per paket — kecualikan tenant yang sudah di-soft-delete.
      prisma.subscription.groupBy({
        by: ['package'],
        _count: { _all: true },
        where: { tenant: { deletedAt: null } },
      }),
    ]);
    const countMap = {};
    for (const c of counts) countMap[c.package] = c._count._all;
    const data = packages.map(p => ({ ...p, tenantCount: countMap[p.name] || 0 }));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/packages/:name
router.get('/:name', authenticate, async (req, res, next) => {
  try {
    const name = packageNameSchema.parse(req.params.name);
    const pkg = await prisma.package.findUnique({
      where: { name },
      select: packageSelect,
    });
    if (!pkg) return res.status(404).json({ success: false, error: 'Package not found' });
    res.json({ success: true, data: pkg });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid package name' });
    }
    next(err);
  }
});

// PUT /api/packages/:name — super_admin only
router.put('/:name', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const name = packageNameSchema.parse(req.params.name);
    const body = updatePackageSchema.parse(req.body);

    if (Object.keys(body).length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    // Simpan daftar fitur lama supaya bisa di-diff dengan yang baru.
    const before = await prisma.package.findUnique({
      where: { name },
      select: { features: true },
    });

    const pkg = await prisma.package.upsert({
      where: { name },
      update: body,
      create: {
        name,
        price: body.price ?? 0,
        maxBranches: body.maxBranches ?? 1,
        maxStaff: body.maxStaff ?? 4,
        staffAddonPrice: body.staffAddonPrice ?? 0,
        staffAddonType: body.staffAddonType ?? 'monthly',
        branchAddonPrice: body.branchAddonPrice ?? 0,
        branchAddonType: body.branchAddonType ?? 'monthly',
        annualDiscountPercent: body.annualDiscountPercent ?? 17,
        description: body.description ?? null,
        features: body.features ?? [],
      },
      select: packageSelect,
    });

    // Propagasi perubahan fitur paket → TenantFeatureFlag tenant terkait.
    // Tanpa ini, mengubah fitur paket tidak pernah sampai ke admin tenant.
    let propagation = null;
    if (body.features !== undefined) {
      propagation = await propagatePackageFeatureChange(
        name, before?.features || [], pkg.features || [],
      );
      if (propagation.affectedTenants > 0) {
        await recordAudit(req, {
          action: 'package.features.propagate',
          target: `package:${name}`,
          detail: `Paket ${name}: ${propagation.affectedTenants} tenant disinkronkan` +
            (propagation.added.length ? ` · +[${propagation.added.join(',')}]` : '') +
            (propagation.removed.length ? ` · -[${propagation.removed.join(',')}]` : ''),
          severity: 'info',
        });
      }
    }

    // Broadcast supaya halaman pricing/billing yang sedang terbuka di tenant
    // langsung sinkron tanpa nunggu refetch periodik.
    const io = getIO();
    if (io) {
      io.emit('package:updated', { name: pkg.name, package: pkg });
    }

    res.json({ success: true, data: pkg, propagation });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: err.errors?.[0]?.message || 'Invalid input' });
    }
    next(err);
  }
});

module.exports = router;
