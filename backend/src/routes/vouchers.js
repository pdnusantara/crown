const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const voucherSelect = {
  id: true,
  tenantId: true,
  code: true,
  description: true,
  type: true,
  value: true,
  minPurchase: true,
  maxUses: true,
  usedCount: true,
  isActive: true,
  expiresAt: true,
  createdAt: true,
};

const createVoucherSchema = z.object({
  tenantId: z.string().optional(),
  code: z.string().min(1).toUpperCase(),
  description: z.string().optional(),
  type: z.enum(['percentage', 'flat']),
  value: z.number().int().min(1),
  minPurchase: z.number().int().min(0).optional(),
  maxUses: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().optional(),
});

const updateVoucherSchema = createVoucherSchema.partial().omit({ tenantId: true });

// GET /api/vouchers
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { isActive, search } = req.query;

    const where = {};

    if (req.user.role !== 'super_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) where.code = { contains: search.toUpperCase() };

    const [data, total] = await Promise.all([
      prisma.voucher.findMany({ where, select: voucherSelect, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.voucher.count({ where }),
    ]);

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/vouchers/:id
router.get('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const voucher = await prisma.voucher.findUnique({ where: { id: req.params.id }, select: voucherSelect });
    if (!voucher) return res.status(404).json({ success: false, error: 'Voucher not found' });

    if (req.user.role !== 'super_admin' && voucher.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: voucher });
  } catch (err) {
    next(err);
  }
});

// POST /api/vouchers/validate - validate a voucher code (kasir)
router.post('/validate', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const { code, subtotal } = z.object({
      code: z.string().min(1),
      subtotal: z.number().int().min(0),
    }).parse(req.body);

    const tenantId = req.user.role === 'super_admin' ? req.body.tenantId : req.user.tenantId;

    const voucher = await prisma.voucher.findFirst({
      where: {
        tenantId,
        code: code.toUpperCase(),
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      select: voucherSelect,
    });

    if (!voucher) {
      return res.status(404).json({ success: false, error: 'Voucher not found or expired' });
    }

    if (voucher.maxUses !== null && voucher.usedCount >= voucher.maxUses) {
      return res.status(400).json({ success: false, error: 'Voucher usage limit reached' });
    }

    if (subtotal < voucher.minPurchase) {
      return res.status(400).json({
        success: false,
        error: `Minimum purchase of ${voucher.minPurchase} required for this voucher`,
      });
    }

    let discountAmount = 0;
    if (voucher.type === 'percentage') {
      discountAmount = Math.floor((subtotal * voucher.value) / 100);
    } else {
      discountAmount = Math.min(voucher.value, subtotal);
    }

    res.json({
      success: true,
      data: {
        voucher,
        discountAmount,
        finalTotal: subtotal - discountAmount,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/vouchers
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const body = createVoucherSchema.parse(req.body);

    if (req.user.role !== 'super_admin') {
      body.tenantId = req.user.tenantId;
    }
    if (!body.tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });

    if (body.code) body.code = body.code.toUpperCase();

    const voucher = await prisma.voucher.create({
      data: body,
      select: voucherSelect,
    });

    res.status(201).json({ success: true, data: voucher });
  } catch (err) {
    next(err);
  }
});

// PUT /api/vouchers/:id
router.put('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.voucher.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Voucher not found' });

    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const body = updateVoucherSchema.parse(req.body);
    if (body.code) body.code = body.code.toUpperCase();

    const voucher = await prisma.voucher.update({
      where: { id: req.params.id },
      data: body,
      select: voucherSelect,
    });

    res.json({ success: true, data: voucher });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/vouchers/:id
router.delete('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.voucher.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Voucher not found' });

    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await prisma.voucher.delete({ where: { id: req.params.id } });

    res.json({ success: true, data: { message: 'Voucher deleted successfully' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
