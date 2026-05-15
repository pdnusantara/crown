const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { emitQueueEvent, emitBookingEvent } = require('../config/socket');
const { requireLicensedBranch } = require('../middleware/requireLicensedBranch');

// Helper: ekstrak bookingId yang dititipkan di queue.notes JSON saat check-in.
function extractBookingId(notes) {
  if (!notes) return null;
  try {
    const meta = typeof notes === 'string' ? JSON.parse(notes) : notes;
    return meta?.bookingId || null;
  } catch { return null; }
}

// Helper: cascade status queue → booking. Queue done/paid → booking done.
// Queue cancelled → booking dikembalikan ke confirmed (supaya kasir bisa
// re-check-in tanpa harus kebobolan booking). Idempotent.
async function cascadeQueueToBooking(queueEntry, prevStatus) {
  const bookingId = extractBookingId(queueEntry?.notes);
  if (!bookingId) return null;

  let nextStatus = null;
  switch (queueEntry.status) {
    case 'in_progress': nextStatus = 'in_progress'; break;
    case 'done':        nextStatus = 'done';        break;
    case 'paid':        nextStatus = 'done';        break; // dari sisi booking, paid = selesai
    case 'cancelled':   nextStatus = 'confirmed';   break; // revert agar bisa re-check-in
    default: return null;
  }
  if (prevStatus && prevStatus === queueEntry.status) return null;

  try {
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: nextStatus },
      include: {
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });
    emitBookingEvent('booking:updated', updated);
    return updated;
  } catch (err) {
    // Booking mungkin sudah dihapus / id tidak match — log saja, jangan blokir queue.
    if (err?.code !== 'P2025') {
      console.warn('[cascadeQueueToBooking] update failed:', err?.message || err);
    }
    return null;
  }
}

const lookupQueueBranchId = async (req) => {
  const q = await prisma.queue.findUnique({
    where: { id: req.params.id },
    select: { branchId: true },
  });
  return q?.branchId || null;
};

const createQueueSchema = z.object({
  tenantId: z.string().optional(),
  branchId: z.string().min(1),
  customerId: z.string().optional(),
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  serviceId: z.string().optional(),
  serviceNames: z.string().optional(),
  barberId: z.string().optional(),
  barberName: z.string().optional(),
  type: z.enum(['walk_in', 'booking']).optional(),
  notes: z.string().optional(),
  estimatedTime: z.number().int().min(0).optional(),
});

const updateQueueSchema = z.object({
  status: z.enum(['waiting', 'in_progress', 'done', 'paid', 'cancelled']).optional(),
  barberId: z.string().optional(),
  barberName: z.string().optional(),
  notes: z.string().optional(),
  estimatedTime: z.number().int().min(0).optional(),
});

// GET /api/queue
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir', 'barber'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { branchId, status, date } = req.query;

    const where = {};

    if (req.user.role !== 'super_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    if (branchId) where.branchId = branchId;
    if (status) where.status = status;

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }

    const [data, total] = await Promise.all([
      prisma.queue.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ status: 'asc' }, { queueNumber: 'asc' }],
        include: {
          branch: { select: { id: true, name: true } },
        },
      }),
      prisma.queue.count({ where }),
    ]);

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/queue/:id
router.get('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir', 'barber'), async (req, res, next) => {
  try {
    const queue = await prisma.queue.findUnique({
      where: { id: req.params.id },
      include: { branch: { select: { id: true, name: true } } },
    });
    if (!queue) return res.status(404).json({ success: false, error: 'Queue entry not found' });

    if (req.user.role !== 'super_admin' && queue.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: queue });
  } catch (err) {
    next(err);
  }
});

// POST /api/queue
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir', 'barber'), requireLicensedBranch(), async (req, res, next) => {
  try {
    const body = createQueueSchema.parse(req.body);

    if (req.user.role !== 'super_admin') {
      body.tenantId = req.user.tenantId;
    }
    if (!body.tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });

    // Auto-upsert customer by phone so walk-in data langsung tercatat di daftar pelanggan admin.
    // Hanya kalau nomor telepon diberikan (dipakai sebagai kunci unik per tenant).
    if (body.customerPhone && !body.customerId) {
      const existing = await prisma.customer.findFirst({
        where: { tenantId: body.tenantId, phone: body.customerPhone, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        body.customerId = existing.id;
      } else {
        const newCustomer = await prisma.customer.create({
          data: {
            tenantId: body.tenantId,
            name: body.customerName,
            phone: body.customerPhone,
          },
          select: { id: true },
        });
        body.customerId = newCustomer.id;
      }
    }

    // Get next queue number for this branch today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const count = await prisma.queue.count({
      where: {
        branchId: body.branchId,
        createdAt: { gte: todayStart },
      },
    });

    const queue = await prisma.queue.create({
      data: { ...body, queueNumber: count + 1 },
      include: { branch: { select: { id: true, name: true } } },
    });

    emitQueueEvent('queue:created', queue);
    res.status(201).json({ success: true, data: queue });
  } catch (err) {
    next(err);
  }
});

// PUT/PATCH /api/queue/:id
const updateQueueHandler = async (req, res, next) => {
  try {
    const existing = await prisma.queue.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Queue entry not found' });

    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const body = updateQueueSchema.parse(req.body);
    const queue = await prisma.queue.update({
      where: { id: req.params.id },
      data: body,
      include: { branch: { select: { id: true, name: true } } },
    });

    emitQueueEvent('queue:updated', queue);
    // Cascade status ke booking (kalau queue ini berasal dari booking).
    // Async, tidak blokir respons utama.
    cascadeQueueToBooking(queue, existing.status).catch(() => {});
    res.json({ success: true, data: queue });
  } catch (err) {
    next(err);
  }
};

const queueBranchGuard = requireLicensedBranch({ lookupFromExistingRecord: lookupQueueBranchId });
router.put('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir', 'barber'), queueBranchGuard, updateQueueHandler);
router.patch('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir', 'barber'), queueBranchGuard, updateQueueHandler);

// DELETE /api/queue/:id
router.delete('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), queueBranchGuard, async (req, res, next) => {
  try {
    const existing = await prisma.queue.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Queue entry not found' });

    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const queue = await prisma.queue.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
      include: { branch: { select: { id: true, name: true } } },
    });

    emitQueueEvent('queue:deleted', queue);
    cascadeQueueToBooking(queue, existing.status).catch(() => {});
    res.json({ success: true, data: { message: 'Queue entry cancelled' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
