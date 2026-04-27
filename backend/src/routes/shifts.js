const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const shiftSelect = {
  id: true,
  branchId: true,
  kasirId: true,
  status: true,
  openedAt: true,
  closedAt: true,
  totalRevenue: true,
  totalTransactions: true,
  branch: { select: { id: true, name: true } },
};

const openShiftSchema = z.object({
  branchId: z.string().min(1),
});

// GET /api/shifts
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { branchId, status, kasirId } = req.query;

    const where = {};

    // Determine tenant scope
    if (req.user.role !== 'super_admin') {
      // Filter by tenant through branch
      where.branch = { tenantId: req.user.tenantId };
    } else if (req.query.tenantId) {
      where.branch = { tenantId: req.query.tenantId };
    }

    // Kasir can only see their own shifts
    if (req.user.role === 'kasir') {
      where.kasirId = req.user.id;
    } else if (kasirId) {
      where.kasirId = kasirId;
    }

    if (branchId) {
      if (where.branch) {
        where.branch.id = branchId;
      } else {
        where.branchId = branchId;
      }
    }
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      prisma.shift.findMany({
        where,
        select: {
          ...shiftSelect,
          _count: { select: { transactions: true } },
        },
        skip,
        take: limit,
        orderBy: { openedAt: 'desc' },
      }),
      prisma.shift.count({ where }),
    ]);

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/shifts/active - get current open shift for kasir
router.get('/active', authenticate, requireRole('kasir', 'tenant_admin', 'super_admin'), async (req, res, next) => {
  try {
    const where = { status: 'open' };
    if (req.user.role === 'kasir') {
      where.kasirId = req.user.id;
    }
    if (req.query.branchId) where.branchId = req.query.branchId;

    const shift = await prisma.shift.findFirst({
      where,
      orderBy: { openedAt: 'desc' },
      include: {
        branch: { select: { id: true, name: true } },
        _count: { select: { transactions: true } },
      },
    });

    res.json({ success: true, data: shift });
  } catch (err) {
    next(err);
  }
});

// GET /api/shifts/:id
router.get('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const shift = await prisma.shift.findUnique({
      where: { id: req.params.id },
      include: {
        branch: { select: { id: true, name: true, tenantId: true } },
        transactions: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            total: true,
            paymentMethod: true,
            status: true,
            createdAt: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!shift) return res.status(404).json({ success: false, error: 'Shift not found' });

    if (req.user.role !== 'super_admin' && shift.branch.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (req.user.role === 'kasir' && shift.kasirId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: shift });
  } catch (err) {
    next(err);
  }
});

// POST /api/shifts/open - open a shift
router.post('/open', authenticate, requireRole('kasir', 'tenant_admin', 'super_admin'), async (req, res, next) => {
  try {
    const { branchId } = openShiftSchema.parse(req.body);

    // Check for already open shift
    const existing = await prisma.shift.findFirst({
      where: { branchId, kasirId: req.user.id, status: 'open' },
    });

    if (existing) {
      return res.status(409).json({ success: false, error: 'You already have an open shift for this branch' });
    }

    const shift = await prisma.shift.create({
      data: {
        branchId,
        kasirId: req.user.id,
        status: 'open',
      },
      include: { branch: { select: { id: true, name: true } } },
    });

    res.status(201).json({ success: true, data: shift });
  } catch (err) {
    next(err);
  }
});

// POST /api/shifts/:id/close - close a shift
router.post('/:id/close', authenticate, requireRole('kasir', 'tenant_admin', 'super_admin'), async (req, res, next) => {
  try {
    const shift = await prisma.shift.findUnique({
      where: { id: req.params.id },
      include: { branch: { select: { id: true, name: true, tenantId: true } } },
    });

    if (!shift) return res.status(404).json({ success: false, error: 'Shift not found' });

    if (req.user.role === 'kasir' && shift.kasirId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You can only close your own shifts' });
    }

    if (shift.status === 'closed') {
      return res.status(400).json({ success: false, error: 'Shift is already closed' });
    }

    // Calculate totals from transactions
    const transactions = await prisma.transaction.findMany({
      where: { shiftId: shift.id, status: 'completed' },
      select: { total: true },
    });

    const totalRevenue = transactions.reduce((sum, t) => sum + t.total, 0);
    const totalTransactions = transactions.length;

    const closedShift = await prisma.shift.update({
      where: { id: req.params.id },
      data: {
        status: 'closed',
        closedAt: new Date(),
        totalRevenue,
        totalTransactions,
      },
      include: { branch: { select: { id: true, name: true } } },
    });

    res.json({ success: true, data: closedShift });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
