const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

const packageSelect = {
  name: true,
  price: true,
  maxBranches: true,
  maxStaff: true,
  branchAddonPrice: true,
  branchAddonType: true,
  description: true,
  features: true,
  updatedAt: true,
};

const packageNameSchema = z.enum(['Basic', 'Pro', 'Enterprise']);

const updatePackageSchema = z.object({
  price:            z.number().int().min(0).max(999_999_999).optional(),
  maxBranches:      z.number().int().min(1).max(9999).optional(),
  maxStaff:         z.number().int().min(1).max(9999).optional(),
  branchAddonPrice: z.number().int().min(0).max(999_999_999).optional(),
  branchAddonType:  z.enum(['monthly', 'onetime']).optional(),
  description:      z.string().max(500).nullable().optional(),
  features:         z.array(z.string()).max(100).optional(),
}).strict();

// GET /api/packages — list all packages with live tenant counts
router.get('/', authenticate, async (req, res, next) => {
  try {
    const [packages, counts] = await Promise.all([
      prisma.package.findMany({ select: packageSelect, orderBy: { price: 'asc' } }),
      prisma.subscription.groupBy({ by: ['package'], _count: { _all: true } }),
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

    const pkg = await prisma.package.upsert({
      where: { name },
      update: body,
      create: {
        name,
        price: body.price ?? 0,
        maxBranches: body.maxBranches ?? 1,
        maxStaff: body.maxStaff ?? 5,
        branchAddonPrice: body.branchAddonPrice ?? 0,
        branchAddonType: body.branchAddonType ?? 'monthly',
        description: body.description ?? null,
        features: body.features ?? [],
      },
      select: packageSelect,
    });

    res.json({ success: true, data: pkg });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: err.errors?.[0]?.message || 'Invalid input' });
    }
    next(err);
  }
});

module.exports = router;
