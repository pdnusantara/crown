const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const createBookingSchema = z.object({
  tenantId: z.string().optional(),
  branchId: z.string().min(1),
  customerId: z.string().optional(),
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
  serviceId: z.string().min(1),
  barberId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM'),
  notes: z.string().optional(),
});

const updateBookingSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'in_progress', 'done', 'cancelled']).optional(),
  barberId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes: z.string().optional(),
});

// GET /api/bookings
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { branchId, status, date, barberId } = req.query;

    const where = {};

    if (req.user.role !== 'super_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    if (branchId) where.branchId = branchId;
    if (status) where.status = status;
    if (date) where.date = date;
    if (barberId) where.barberId = barberId;

    // Barbers can only see their own bookings
    if (req.user.role === 'barber') {
      where.barberId = req.user.id;
    }

    const [data, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
        include: {
          branch: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, phone: true } },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

    if (req.user.role !== 'super_admin' && booking.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const body = createBookingSchema.parse(req.body);

    if (req.user.role !== 'super_admin') {
      body.tenantId = req.user.tenantId;
    }
    if (!body.tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });

    const booking = await prisma.booking.create({
      data: body,
      include: {
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

// PUT /api/bookings/:id
router.put('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Booking not found' });

    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const body = updateBookingSchema.parse(req.body);
    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: body,
      include: {
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/bookings/:id
router.delete('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Booking not found' });

    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await prisma.booking.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    });

    res.json({ success: true, data: { message: 'Booking cancelled successfully' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
