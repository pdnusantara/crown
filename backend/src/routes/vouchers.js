const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { recordAudit } = require('../utils/auditLog');
const { getIO, tenantRoom } = require('../config/socket');

const emitVoucher = (event, payload, tenantId) => {
  if (!tenantId) return;
  try {
    const io = getIO();
    if (io) io.to(tenantRoom(tenantId)).emit(event, payload);
  } catch { /* socket optional */ }
};

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
  tenantId:    z.string().optional(),
  code:        z.string().trim().min(1).max(40).transform(s => s.toUpperCase()),
  description: z.string().max(300).optional().nullable(),
  type:        z.enum(['percentage', 'flat']),
  value:       z.number().int().min(1),
  minPurchase: z.number().int().min(0).optional(),
  maxUses:     z.number().int().min(1).max(1_000_000).optional().nullable(),
  isActive:    z.boolean().optional(),
  expiresAt:   z.union([
                 z.string().datetime(),
                 z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
               ]).optional().nullable(),
});

const updateVoucherSchema = createVoucherSchema.partial().omit({ tenantId: true });

function normalizeExpiresAt(value) {
  if (!value) return null;
  // YYYY-MM-DD → end of day UTC so the voucher remains valid for the entire date
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T23:59:59.999Z`);
  return new Date(value);
}

function validatePercentage(body) {
  if (body.type === 'percentage' && body.value !== undefined && body.value > 100) {
    return 'Diskon persentase maksimal 100';
  }
  return null;
}

// GET /api/vouchers
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { isActive, search, status, type, sortBy } = req.query;

    const where = {};
    if (req.user.role !== 'super_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (type === 'percentage' || type === 'flat') where.type = type;
    if (search) {
      const s = String(search).trim();
      where.OR = [
        { code: { contains: s.toUpperCase() } },
        { description: { contains: s, mode: 'insensitive' } },
      ];
    }

    const now = new Date();
    if (status === 'expired') {
      where.expiresAt = { lt: now };
    } else if (status === 'active') {
      where.isActive = true;
      where.AND = [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }];
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    const orderBy = (() => {
      switch (sortBy) {
        case 'code-asc':    return { code: 'asc' };
        case 'code-desc':   return { code: 'desc' };
        case 'value-asc':   return { value: 'asc' };
        case 'value-desc':  return { value: 'desc' };
        case 'used-desc':   return { usedCount: 'desc' };
        case 'expires-asc': return { expiresAt: 'asc' };
        default:            return { createdAt: 'desc' };
      }
    })();

    const [data, total] = await Promise.all([
      prisma.voucher.findMany({ where, select: voucherSelect, skip, take: limit, orderBy }),
      prisma.voucher.count({ where }),
    ]);

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) { next(err); }
});

// GET /api/vouchers/stats — KPI per tenant
router.get('/stats', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = req.user.role === 'super_admin'
      ? (req.query.tenantId || null)
      : req.user.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });
    const now = new Date();
    const [total, active, expired, inactive, totalUses] = await Promise.all([
      prisma.voucher.count({ where: { tenantId } }),
      prisma.voucher.count({ where: { tenantId, isActive: true, AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }] } }),
      prisma.voucher.count({ where: { tenantId, expiresAt: { lt: now } } }),
      prisma.voucher.count({ where: { tenantId, isActive: false } }),
      prisma.voucher.aggregate({ where: { tenantId }, _sum: { usedCount: true } }),
    ]);
    res.json({
      success: true,
      data: {
        total, active, expired, inactive,
        totalUses: totalUses._sum.usedCount || 0,
      },
    });
  } catch (err) { next(err); }
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
  } catch (err) { next(err); }
});

// POST /api/vouchers/validate — kasir-friendly preview
router.post('/validate', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const { code, subtotal } = z.object({
      code: z.string().min(1),
      subtotal: z.number().int().min(0),
    }).parse(req.body);

    const tenantId = req.user.role === 'super_admin' ? (req.body.tenantId || null) : req.user.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const voucher = await prisma.voucher.findFirst({
      where: { tenantId, code: code.toUpperCase() },
      select: voucherSelect,
    });

    if (!voucher) return res.status(404).json({ success: false, error: 'Kode voucher tidak ditemukan' });
    if (!voucher.isActive) return res.status(400).json({ success: false, error: 'Voucher sudah tidak aktif' });
    if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
      return res.status(400).json({ success: false, error: 'Voucher sudah kadaluarsa' });
    }
    if (voucher.maxUses !== null && voucher.usedCount >= voucher.maxUses) {
      return res.status(400).json({ success: false, error: 'Voucher sudah habis digunakan' });
    }
    if (subtotal < voucher.minPurchase) {
      return res.status(400).json({
        success: false,
        error: `Minimum order Rp ${voucher.minPurchase.toLocaleString('id-ID')}`,
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
      data: { voucher, discountAmount, finalTotal: subtotal - discountAmount },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// POST /api/vouchers/redeem — atomik increment usedCount + re-check limit
router.post('/redeem', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.body);
    const v = await prisma.voucher.findUnique({ where: { id }, select: voucherSelect });
    if (!v) return res.status(404).json({ success: false, error: 'Voucher not found' });
    if (v.tenantId !== req.user.tenantId && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    if (!v.isActive) return res.status(400).json({ success: false, error: 'Voucher tidak aktif' });
    if (v.expiresAt && new Date(v.expiresAt) < new Date()) {
      return res.status(400).json({ success: false, error: 'Voucher kadaluarsa' });
    }

    const updateWhere = { id };
    if (v.maxUses !== null) updateWhere.usedCount = { lt: v.maxUses };

    const result = await prisma.voucher.updateMany({
      where: updateWhere,
      data: { usedCount: { increment: 1 } },
    });
    if (result.count === 0) {
      return res.status(400).json({ success: false, error: 'Voucher sudah habis digunakan' });
    }

    const updated = await prisma.voucher.findUnique({ where: { id }, select: voucherSelect });
    emitVoucher('voucher:updated', updated, updated.tenantId);
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// POST /api/vouchers
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const body = createVoucherSchema.parse(req.body);
    if (req.user.role !== 'super_admin') body.tenantId = req.user.tenantId;
    if (!body.tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });

    const pctErr = validatePercentage(body);
    if (pctErr) return res.status(400).json({ success: false, error: pctErr });

    const data = {
      tenantId:    body.tenantId,
      code:        body.code,
      description: body.description ?? null,
      type:        body.type,
      value:       body.value,
      minPurchase: body.minPurchase ?? 0,
      maxUses:     body.maxUses ?? null,
      isActive:    body.isActive ?? true,
      expiresAt:   normalizeExpiresAt(body.expiresAt),
    };

    let voucher;
    try {
      voucher = await prisma.voucher.create({ data, select: voucherSelect });
    } catch (e) {
      if (e?.code === 'P2002') {
        return res.status(409).json({ success: false, error: `Kode voucher "${body.code}" sudah dipakai di tenant ini` });
      }
      throw e;
    }

    await recordAudit(req, {
      action: 'voucher.create',
      target: `voucher:${voucher.id}`,
      detail: `${voucher.code} ${voucher.type} ${voucher.value}${voucher.type === 'percentage' ? '%' : ''}`,
      severity: 'info',
    });
    emitVoucher('voucher:created', voucher, voucher.tenantId);
    res.status(201).json({ success: true, data: voucher });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
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
    const merged = { ...existing, ...body };
    const pctErr = validatePercentage(merged);
    if (pctErr) return res.status(400).json({ success: false, error: pctErr });

    const data = {};
    if (body.code !== undefined)        data.code = body.code;
    if (body.description !== undefined) data.description = body.description ?? null;
    if (body.type !== undefined)        data.type = body.type;
    if (body.value !== undefined)       data.value = body.value;
    if (body.minPurchase !== undefined) data.minPurchase = body.minPurchase;
    if (body.maxUses !== undefined)     data.maxUses = body.maxUses ?? null;
    if (body.isActive !== undefined)    data.isActive = body.isActive;
    if (body.expiresAt !== undefined)   data.expiresAt = normalizeExpiresAt(body.expiresAt);

    let voucher;
    try {
      voucher = await prisma.voucher.update({ where: { id: req.params.id }, data, select: voucherSelect });
    } catch (e) {
      if (e?.code === 'P2002') {
        return res.status(409).json({ success: false, error: `Kode voucher "${body.code}" sudah dipakai di tenant ini` });
      }
      throw e;
    }

    await recordAudit(req, {
      action: 'voucher.update',
      target: `voucher:${voucher.id}`,
      detail: `${voucher.code} ${Object.keys(data).join(',')}`,
      severity: 'info',
    });
    emitVoucher('voucher:updated', voucher, voucher.tenantId);
    res.json({ success: true, data: voucher });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// POST /api/vouchers/bulk-toggle
router.post('/bulk-toggle', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const body = z.object({
      ids: z.array(z.string().min(1)).min(1).max(500),
      isActive: z.boolean(),
    }).parse(req.body);

    const tenantId = req.user.role === 'super_admin' ? (req.body.tenantId || null) : req.user.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const result = await prisma.voucher.updateMany({
      where: { id: { in: body.ids }, tenantId },
      data: { isActive: body.isActive },
    });
    await recordAudit(req, {
      action: 'voucher.bulk_toggle',
      target: `tenant:${tenantId}`,
      detail: `Bulk ${body.isActive ? 'aktifkan' : 'nonaktifkan'} ${result.count} voucher`,
      severity: 'info',
    });
    emitVoucher('voucher:bulk_changed', { tenantId, count: result.count }, tenantId);
    res.json({ success: true, data: { updated: result.count } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// POST /api/vouchers/bulk-delete
router.post('/bulk-delete', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const body = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }).parse(req.body);
    const tenantId = req.user.role === 'super_admin' ? (req.body.tenantId || null) : req.user.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const result = await prisma.voucher.deleteMany({
      where: { id: { in: body.ids }, tenantId },
    });
    await recordAudit(req, {
      action: 'voucher.bulk_delete',
      target: `tenant:${tenantId}`,
      detail: `Bulk delete ${result.count} voucher`,
      severity: 'info',
    });
    emitVoucher('voucher:bulk_changed', { tenantId, count: result.count }, tenantId);
    res.json({ success: true, data: { deleted: result.count } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
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
    await recordAudit(req, {
      action: 'voucher.delete',
      target: `voucher:${existing.id}`,
      detail: `${existing.code}`,
      severity: 'info',
    });
    emitVoucher('voucher:deleted', { id: existing.id }, existing.tenantId);
    res.json({ success: true, data: { id: existing.id } });
  } catch (err) { next(err); }
});

module.exports = router;
