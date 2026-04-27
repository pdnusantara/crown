const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const branchSelect = {
  id: true,
  tenantId: true,
  name: true,
  address: true,
  phone: true,
  openTime: true,
  closeTime: true,
  isActive: true,
  createdAt: true,
  tenant: { select: { id: true, name: true } },
  _count: { select: { users: true } },
};

const createBranchSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  openTime: z.string().optional(),
  closeTime: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updateBranchSchema = createBranchSchema.partial().omit({ tenantId: true });

function resolveTenantId(req) {
  if (req.user.role === 'super_admin') return req.body.tenantId || req.query.tenantId;
  return req.user.tenantId;
}

// GET /api/branches
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir', 'barber'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, isActive } = req.query;

    const where = { deletedAt: null };

    if (req.user.role !== 'super_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [data, total] = await Promise.all([
      prisma.branch.findMany({ where, select: branchSelect, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.branch.count({ where }),
    ]);

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/branches/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const branch = await prisma.branch.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: branchSelect,
    });
    if (!branch) return res.status(404).json({ success: false, error: 'Branch not found' });

    if (req.user.role !== 'super_admin' && branch.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: branch });
  } catch (err) {
    next(err);
  }
});

// POST /api/branches
// Ketika branch baru melewati kuota paket (maxBranches), otomatis buat invoice
// branch_addon di subscription tenant. Semua dalam satu transaksi supaya konsisten.
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const body = createBranchSchema.parse(req.body);

    if (req.user.role === 'tenant_admin') {
      body.tenantId = req.user.tenantId;
    }
    if (!body.tenantId) {
      return res.status(400).json({ success: false, error: 'tenantId is required' });
    }

    const { branch, addonInvoice } = await prisma.$transaction(async (tx) => {
      // Count cabang aktif tenant (soft-deleted tidak dihitung)
      const existingBranchCount = await tx.branch.count({
        where: { tenantId: body.tenantId, deletedAt: null },
      });

      const createdBranch = await tx.branch.create({
        data: body,
        select: branchSelect,
      });

      // Cek paket & kuota
      const subscription = await tx.subscription.findUnique({
        where: { tenantId: body.tenantId },
        select: { id: true, package: true },
      });

      let invoice = null;
      if (subscription) {
        const pkg = await tx.package.findUnique({
          where: { name: subscription.package },
          select: { maxBranches: true, branchAddonPrice: true, branchAddonType: true },
        });

        // Kuota terpakai setelah create = existingBranchCount + 1
        // Branch ini melebihi kuota? (1-indexed: kuota 1 → cabang ke-2 kena addon)
        const overQuota = pkg && pkg.branchAddonPrice > 0 && (existingBranchCount + 1) > pkg.maxBranches;
        if (overQuota) {
          const now = new Date();
          const period = pkg.branchAddonType === 'onetime'
            ? `Cabang: ${createdBranch.name} (one-time)`
            : `Cabang: ${createdBranch.name} — ${now.toLocaleString('en-US', { month: 'short', year: 'numeric' })}`;

          invoice = await tx.invoice.create({
            data: {
              subscriptionId: subscription.id,
              period,
              amount: pkg.branchAddonPrice,
              type: 'branch_addon',
              status: 'pending',
            },
          });
        }
      }

      return { branch: createdBranch, addonInvoice: invoice };
    });

    res.status(201).json({
      success: true,
      data: branch,
      meta: addonInvoice ? { addonInvoice } : undefined,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/branches/:id
router.put('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.branch.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Branch not found' });

    if (req.user.role === 'tenant_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const body = updateBranchSchema.parse(req.body);
    const branch = await prisma.branch.update({
      where: { id: req.params.id },
      data: body,
      select: branchSelect,
    });

    res.json({ success: true, data: branch });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/branches/:id (soft delete)
router.delete('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.branch.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Branch not found' });

    if (req.user.role === 'tenant_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await prisma.branch.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true, data: { message: 'Branch deleted successfully' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
