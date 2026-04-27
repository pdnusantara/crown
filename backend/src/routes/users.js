const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  phone: true,
  photo: true,
  tenantId: true,
  branchId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
};

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['super_admin', 'tenant_admin', 'kasir', 'barber', 'customer']),
  phone: z.string().optional(),
  photo: z.string().optional(),
  tenantId: z.string().optional(),
  branchId: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updateUserSchema = createUserSchema.partial().omit({ password: true }).extend({
  password: z.string().min(6).optional(),
});

// GET /api/users
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, role, tenantId, branchId, isActive } = req.query;

    const where = { deletedAt: null };

    // tenant_admin can only see users in their tenant
    if (req.user.role === 'tenant_admin') {
      where.tenantId = req.user.tenantId;
    } else if (tenantId) {
      where.tenantId = tenantId;
    }

    if (branchId) where.branchId = branchId;
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.user.findMany({ where, select: userSelect, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.user.count({ where }),
    ]);

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id
router.get('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: userSelect,
    });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // tenant_admin can only view users in same tenant
    if (req.user.role === 'tenant_admin' && user.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// POST /api/users
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const body = createUserSchema.parse(req.body);

    // tenant_admin can only create users in their tenant
    if (req.user.role === 'tenant_admin') {
      body.tenantId = req.user.tenantId;
      if (body.role === 'super_admin' || body.role === 'tenant_admin') {
        return res.status(403).json({ success: false, error: 'Cannot create admin users' });
      }
    }

    const hashedPassword = await bcrypt.hash(body.password, 10);

    const user = await prisma.user.create({
      data: { ...body, password: hashedPassword },
      select: userSelect,
    });

    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id
router.put('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'User not found' });

    if (req.user.role === 'tenant_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const body = updateUserSchema.parse(req.body);

    if (body.password) {
      body.password = await bcrypt.hash(body.password, 10);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: body,
      select: userSelect,
    });

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id (soft delete)
router.delete('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'User not found' });

    if (req.user.role === 'tenant_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await prisma.user.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true, data: { message: 'User deleted successfully' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
