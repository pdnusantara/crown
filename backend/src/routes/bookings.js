const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { requireLicensedBranch } = require('../middleware/requireLicensedBranch');
const { emitBookingEvent } = require('../config/socket');
const { upsertCustomerByPhone } = require('../services/customerService');

const lookupBookingBranchId = async (req) => {
  const b = await prisma.booking.findUnique({
    where: { id: req.params.id },
    select: { branchId: true },
  });
  return b?.branchId || null;
};

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
  source: z.enum(['online', 'walk_in']).optional(),
  notes: z.string().optional(),
});

const updateBookingSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'in_progress', 'done', 'cancelled']).optional(),
  serviceId: z.string().optional(),
  barberId: z.string().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes: z.string().optional(),
});

const bulkBookingSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['confirm', 'cancel']),
});

// Bangun where-clause dasar yang sudah tenant- & cabang-scoped sesuai role.
// Dipakai bersama oleh /stats dan /bulk supaya isolasi multi-tenant konsisten.
function buildScopeWhere(req) {
  const where = {};
  if (req.user.role !== 'super_admin') {
    where.tenantId = req.user.tenantId;
  } else if (req.query.tenantId) {
    where.tenantId = req.query.tenantId;
  }
  if (req.user.role === 'kasir' && req.user.branchId) {
    where.branchId = req.user.branchId;
  } else if (req.query.branchId) {
    where.branchId = req.query.branchId;
  }
  if (req.user.role === 'barber') where.barberId = req.user.id;
  if (req.user.role === 'customer') where.customerId = req.user.id;
  return where;
}

// GET /api/bookings
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { branchId, status, date, dateFrom, dateTo, barberId, customerId, search, source, sortBy } = req.query;

    const where = {};

    if (req.user.role !== 'super_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    // Defensive: kasir hanya boleh melihat booking di cabang mereka sendiri.
    if (req.user.role === 'kasir' && req.user.branchId) {
      where.branchId = req.user.branchId;
    } else if (branchId) {
      where.branchId = branchId;
    }

    if (status) where.status = status;
    if (source) where.source = source;
    if (date) where.date = date;
    if (dateFrom || dateTo) {
      where.date = {
        ...(typeof where.date === 'string' ? {} : where.date),
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }
    if (barberId) where.barberId = barberId;
    if (customerId) where.customerId = customerId;

    // Barbers can only see their own bookings
    if (req.user.role === 'barber') {
      where.barberId = req.user.id;
    }
    // Customers can only see their own bookings
    if (req.user.role === 'customer') {
      where.customerId = req.user.id;
    }

    if (search) {
      const term = String(search).trim();
      if (term) {
        where.OR = [
          { customerName: { contains: term, mode: 'insensitive' } },
          { customerPhone: { contains: term } },
          { serviceName: { contains: term, mode: 'insensitive' } },
          { barberName: { contains: term, mode: 'insensitive' } },
        ];
      }
    }

    // sortBy: 'recent' (default) — booking yg baru disimpan paling atas.
    //         'schedule'         — urut jadwal datang (date asc, time asc).
    const orderBy = sortBy === 'schedule'
      ? [{ date: 'asc' },  { time: 'asc' },  { createdAt: 'desc' }]
      : [{ createdAt: 'desc' }, { date: 'asc' }, { time: 'asc' }];

    const [data, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          branch: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, phone: true, visitCount: true } },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/bookings/stats — agregat tenant+cabang yang AKURAT lintas halaman.
// Halaman daftar hanya punya satu page; kartu statistik butuh hitungan penuh.
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const { formatYmdInTz } = require('../utils/timezone');
    const tz = req.query.tz || 'Asia/Jakarta';
    const todayStr = formatYmdInTz(new Date(), tz);

    const base = buildScopeWhere(req);

    const [today, pending, total] = await Promise.all([
      prisma.booking.count({ where: { ...base, date: todayStr, status: { not: 'cancelled' } } }),
      prisma.booking.count({ where: { ...base, status: 'pending' } }),
      prisma.booking.count({ where: base }),
    ]);

    res.json({ success: true, data: { today, pending, total } });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/bulk — konfirmasi / batalkan banyak booking sekaligus.
// updateMany di-filter dengan where tenant+cabang → tidak bisa menyentuh
// booking tenant/cabang lain meski id-nya ditebak.
router.post('/bulk', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const { ids, action } = bulkBookingSchema.parse(req.body);

    const where = { ...buildScopeWhere(req), id: { in: ids } };
    // confirm: hanya yang masih pending; cancel: pending atau confirmed.
    where.status = action === 'confirm' ? 'pending' : { in: ['pending', 'confirmed'] };
    const newStatus = action === 'confirm' ? 'confirmed' : 'cancelled';

    const affected = await prisma.booking.findMany({ where, select: { id: true } });
    if (affected.length === 0) {
      return res.json({ success: true, data: { count: 0 } });
    }

    await prisma.booking.updateMany({
      where: { id: { in: affected.map((a) => a.id) } },
      data: { status: newStatus },
    });

    const updated = await prisma.booking.findMany({
      where: { id: { in: affected.map((a) => a.id) } },
      include: {
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });
    updated.forEach((b) => emitBookingEvent('booking:updated', b));

    res.json({ success: true, data: { count: updated.length } });
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
    if (req.user.role === 'kasir' && req.user.branchId && booking.branchId !== req.user.branchId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), requireLicensedBranch(), async (req, res, next) => {
  try {
    const body = createBookingSchema.parse(req.body);

    if (req.user.role !== 'super_admin') {
      body.tenantId = req.user.tenantId;
    }
    if (!body.tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });

    if (req.user.role === 'kasir' && req.user.branchId && body.branchId !== req.user.branchId) {
      return res.status(403).json({ success: false, error: 'Tidak dapat membuat booking untuk cabang lain' });
    }

    // Default source: kasir/admin yang input manual → walk_in. Customer yang
    // login & memesan via aplikasi → online.
    if (!body.source) {
      body.source = (req.user.role === 'customer') ? 'online' : 'walk_in';
    }

    // Auto-upsert pelanggan ke daftar admin agar setiap booking — baik online
    // maupun walk-in — terlihat di /admin/customers.
    if (!body.customerId && body.customerPhone && body.customerName) {
      const c = await upsertCustomerByPhone(prisma, {
        tenantId: body.tenantId,
        name: body.customerName,
        phone: body.customerPhone,
      });
      if (c?.id) body.customerId = c.id;
    }

    // Denormalisasi nama layanan & barber supaya BookingsPage tidak perlu join tambahan
    if (body.serviceId && !body.serviceName) {
      const svc = await prisma.service.findUnique({ where: { id: body.serviceId }, select: { name: true, tenantId: true } });
      if (!svc || svc.tenantId !== body.tenantId) {
        return res.status(400).json({ success: false, error: 'Layanan tidak ditemukan' });
      }
      body.serviceName = svc.name;
    }
    if (body.barberId && !body.barberName) {
      const barber = await prisma.user.findUnique({ where: { id: body.barberId }, select: { name: true, tenantId: true } });
      if (!barber || barber.tenantId !== body.tenantId) {
        return res.status(400).json({ success: false, error: 'Barber tidak ditemukan' });
      }
      body.barberName = barber.name;
    }

    const booking = await prisma.booking.create({
      data: body,
      include: {
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    emitBookingEvent('booking:created', booking);
    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

// PUT /api/bookings/:id
router.put('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), requireLicensedBranch({ lookupFromExistingRecord: lookupBookingBranchId }), async (req, res, next) => {
  try {
    const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Booking not found' });

    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    if (req.user.role === 'kasir' && req.user.branchId && existing.branchId !== req.user.branchId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const body = updateBookingSchema.parse(req.body);

    // Refresh denormalized name kalau serviceId/barberId berubah
    if (body.serviceId && body.serviceId !== existing.serviceId) {
      const svc = await prisma.service.findUnique({ where: { id: body.serviceId }, select: { name: true, tenantId: true } });
      if (!svc || svc.tenantId !== existing.tenantId) {
        return res.status(400).json({ success: false, error: 'Layanan tidak ditemukan' });
      }
      body.serviceName = svc.name;
    }
    if (body.barberId === null) {
      body.barberName = null;
    } else if (body.barberId && body.barberId !== existing.barberId) {
      const barber = await prisma.user.findUnique({ where: { id: body.barberId }, select: { name: true, tenantId: true } });
      if (!barber || barber.tenantId !== existing.tenantId) {
        return res.status(400).json({ success: false, error: 'Barber tidak ditemukan' });
      }
      body.barberName = barber.name;
    }

    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: body,
      include: {
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    emitBookingEvent('booking:updated', booking);
    res.json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/bookings/:id  (soft cancel)
router.delete('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Booking not found' });

    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    if (req.user.role === 'kasir' && req.user.branchId && existing.branchId !== req.user.branchId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
      include: {
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    emitBookingEvent('booking:updated', booking);
    res.json({ success: true, data: { message: 'Booking cancelled successfully', booking } });
  } catch (err) {
    next(err);
  }
});

// POST /api/bookings/:id/check-in
// Mengubah booking → entri Antrian (Queue) hari ini, sekaligus update status
// booking jadi `in_progress`. Notifikasi kasir+barber jalan via emit di kedua sisi.
router.post('/:id/check-in', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), requireLicensedBranch({ lookupFromExistingRecord: lookupBookingBranchId }), async (req, res, next) => {
  try {
    const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Booking not found' });

    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    if (req.user.role === 'kasir' && req.user.branchId && existing.branchId !== req.user.branchId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (existing.status === 'in_progress' || existing.status === 'done') {
      return res.status(400).json({ success: false, error: 'Booking sudah berjalan / selesai' });
    }
    if (existing.status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Booking sudah dibatalkan' });
    }

    // Pastikan customer record ada (booking lama mungkin belum di-upsert).
    let customerId = existing.customerId;
    if (!customerId && existing.customerPhone && existing.customerName) {
      const c = await upsertCustomerByPhone(prisma, {
        tenantId: existing.tenantId,
        name: existing.customerName,
        phone: existing.customerPhone,
      });
      if (c?.id) {
        customerId = c.id;
        // Persist ke booking supaya cascade & laporan tetap konsisten.
        await prisma.booking.update({
          where: { id: existing.id },
          data: { customerId },
        }).catch(() => {});
      }
    }

    // Hitung nomor antrian per cabang per hari
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const count = await prisma.queue.count({
      where: { branchId: existing.branchId, createdAt: { gte: todayStart } },
    });

    const queueNotes = JSON.stringify({
      services: existing.serviceName ? [existing.serviceName] : ['Layanan'],
      phone: existing.customerPhone,
      type: 'booking',
      staffName: existing.barberName || null,
      bookingId: existing.id,
    });

    const queue = await prisma.queue.create({
      data: {
        tenantId: existing.tenantId,
        branchId: existing.branchId,
        customerId: customerId || null,
        customerName: existing.customerName,
        customerPhone: existing.customerPhone,
        barberId: existing.barberId || null,
        barberName: existing.barberName || null,
        serviceNames: existing.serviceName || null,
        type: 'booking',
        notes: queueNotes,
        status: 'waiting',
        queueNumber: count + 1,
      },
      include: { branch: { select: { id: true, name: true } } },
    });

    const booking = await prisma.booking.update({
      where: { id: existing.id },
      data: { status: 'in_progress' },
      include: {
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    // Beri tahu kedua kanal — bookings page & queue page — sekaligus
    const { emitQueueEvent } = require('../config/socket');
    emitQueueEvent('queue:created', queue);
    emitBookingEvent('booking:updated', booking);

    res.status(201).json({ success: true, data: { booking, queue } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
