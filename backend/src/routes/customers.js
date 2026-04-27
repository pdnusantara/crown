const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const customerSelect = {
  id: true,
  tenantId: true,
  name: true,
  phone: true,
  email: true,
  gender: true,
  birthDate: true,
  address: true,
  loyaltyPoints: true,
  visitCount: true,
  createdAt: true,
};

const addressSchema = z.object({
  provinsiId:  z.string().optional(),
  provinsi:    z.string().optional(),
  kabupatenId: z.string().optional(),
  kabupaten:   z.string().optional(),
  kecamatanId: z.string().optional(),
  kecamatan:   z.string().optional(),
  kelurahanId: z.string().optional(),
  kelurahan:   z.string().optional(),
  detail:      z.string().max(500).optional(),
}).optional();

const createCustomerSchema = z.object({
  tenantId:      z.string().optional(),
  name:          z.string().min(1),
  phone:         z.string().min(1),
  email:         z.string().email().optional().or(z.literal('')),
  gender:        z.enum(['L', 'P']).optional(),
  birthDate:     z.string().optional().transform(v => v ? new Date(v) : undefined),
  address:       addressSchema,
  loyaltyPoints: z.number().int().min(0).optional(),
  notes:         z.string().max(1000).optional(),
});

const updateCustomerSchema = createCustomerSchema.partial().omit({ tenantId: true });

// GET /api/customers
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, provinsi } = req.query;

    const where = { deletedAt: null };

    if (req.user.role !== 'super_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (provinsi) {
      where.address = { path: ['provinsi'], string_contains: provinsi };
    }

    const [data, total] = await Promise.all([
      prisma.customer.findMany({ where, select: customerSelect, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.customer.count({ where }),
    ]);

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id
router.get('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: {
        ...customerSelect,
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, total: true, createdAt: true, status: true },
        },
      },
    });
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    if (req.user.role !== 'super_admin' && customer.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const body = createCustomerSchema.parse(req.body);
    if (req.user.role !== 'super_admin') body.tenantId = req.user.tenantId;
    if (!body.tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });

    const customer = await prisma.customer.create({ data: body, select: customerSelect });
    res.status(201).json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
});

// PUT /api/customers/:id
router.put('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const existing = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Customer not found' });
    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const body = updateCustomerSchema.parse(req.body);
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: body,
      select: customerSelect,
    });
    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/customers/:id (soft delete)
router.delete('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Customer not found' });
    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    await prisma.customer.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    res.json({ success: true, data: { message: 'Customer deleted' } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/customers/:id/loyalty
router.patch('/:id/loyalty', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const { points } = z.object({ points: z.number().int() }).parse(req.body);
    const existing = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Customer not found' });
    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data:  { loyaltyPoints: Math.max(0, existing.loyaltyPoints + points) },
      select: customerSelect,
    });
    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
