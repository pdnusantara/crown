const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { emitQueueEvent, emitBookingEvent } = require('../config/socket');
const { requireLicensedBranch } = require('../middleware/requireLicensedBranch');
const { DEFAULT_TZ, normalizeTimezone, tenantDayStart, tenantDayEnd, formatYmdInTz } = require('../utils/timezone');

// Zona waktu tenant pemanggil — batas "hari" untuk filter antrian. Server jalan
// di UTC, jadi tanpa ini `?date=` memotong hari pada 07:00 WIB, bukan tengah malam.
async function resolveQueueTz(req) {
  const tid = req.user.role === 'super_admin' ? (req.query.tenantId || req.user.tenantId) : req.user.tenantId;
  if (!tid) return DEFAULT_TZ;
  const t = await prisma.tenant.findUnique({ where: { id: tid }, select: { timezone: true } });
  return normalizeTimezone(t?.timezone);
}

// Rentang satu hari kalender `ymd` pada zona tenant.
function tenantDayRange(ymd, tz) {
  return { gte: tenantDayStart(ymd, tz), lte: tenantDayEnd(ymd, tz) };
}

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
    // Kasir & barber terkunci ke cabangnya — cegah antrian tercampur antar-cabang
    // saat branchId tak terkirim (mutasi sudah dijaga queueBranchGuard). Samakan
    // dgn users.js / transactions / bookings / shifts.
    if ((req.user.role === 'kasir' || req.user.role === 'barber') && req.user.branchId) {
      where.branchId = req.user.branchId;
    }
    if (status) where.status = status;

    if (date) {
      // Batas hari mengikuti zona tenant, BUKAN zona server (UTC). Sebelumnya
      // `new Date(date).setHours(0,0,0,0)` memotong hari pada 07:00 WIB sehingga
      // antrian dini hari terhitung ke tanggal kemarin — dan GET /queue tidak
      // sepakat dengan GET /queue/summary maupun pendingQueue di shift summary.
      const tz = await resolveQueueTz(req);
      where.createdAt = tenantDayRange(date, tz);
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

// GET /api/queue/summary — jumlah antrian per status untuk satu hari.
//
// Menggantikan pola "tarik seluruh daftar lalu hitung di klien", yang selain
// boros juga DIAM-DIAM SALAH begitu volume harian melewati `limit` pagination.
// Harus terdaftar SEBELUM GET /:id, kalau tidak "summary" tertangkap sebagai id.
router.get('/summary', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir', 'barber'), async (req, res, next) => {
  try {
    const tz = await resolveQueueTz(req);
    const { date, branchId } = req.query;

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, error: 'Parameter date harus format YYYY-MM-DD' });
    }
    // Default: hari ini menurut zona tenant (bukan zona server).
    const ymd = date || formatYmdInTz(new Date(), tz);

    const where = { createdAt: tenantDayRange(ymd, tz) };
    if (req.user.role !== 'super_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    // Kasir & barber terkunci ke cabangnya — samakan dengan GET /.
    const staffLocked = (req.user.role === 'kasir' || req.user.role === 'barber') && req.user.branchId;
    if (staffLocked) {
      if (branchId && branchId !== req.user.branchId) {
        return res.status(403).json({ success: false, error: 'Tidak boleh melihat cabang lain' });
      }
      where.branchId = req.user.branchId;
    } else if (branchId) {
      // Cabang tak dikenal ditolak, BUKAN diabaikan diam-diam — kalau tidak,
      // angka se-tenant akan terbaca sebagai angka satu cabang.
      const owned = await prisma.branch.findFirst({
        where: { id: branchId, deletedAt: null, ...(where.tenantId ? { tenantId: where.tenantId } : {}) },
        select: { id: true },
      });
      if (!owned) {
        return res.status(400).json({ success: false, error: 'branchId tidak dikenal untuk tenant ini' });
      }
      where.branchId = branchId;
    }

    const rows = await prisma.queue.groupBy({ by: ['status'], where, _count: { _all: true } });

    // Semua status selalu hadir sebagai 0 supaya klien tak perlu null-check.
    const counts = { waiting: 0, in_progress: 0, done: 0, paid: 0, cancelled: 0 };
    let total = 0;
    for (const r of rows) {
      const n = r._count._all;
      total += n;
      if (r.status in counts) counts[r.status] = n;
    }

    res.json({
      success: true,
      data: {
        waiting: counts.waiting,
        // camelCase untuk klien; enum DB memakai snake_case `in_progress`.
        inProgress: counts.in_progress,
        done: counts.done,
        paid: counts.paid,
        cancelled: counts.cancelled,
        total,
      },
      meta: { timezone: tz, date: ymd, branchId: where.branchId || null },
    });
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

    // Kasir & barber terkunci ke cabangnya — selaras dgn list GET / & queueBranchGuard.
    // Tanpa ini, mereka bisa membaca antrian cabang lain via tebak :id (membingungkan
    // & bocor lintas-cabang dalam satu tenant).
    if (
      (req.user.role === 'kasir' || req.user.role === 'barber') &&
      req.user.branchId &&
      queue.branchId !== req.user.branchId
    ) {
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
    // Kasir/barber terikat cabang: hanya boleh mengubah antrian cabangnya sendiri.
    // queueBranchGuard hanya memastikan cabang ber-lisensi, bukan kecocokan cabang.
    if ((req.user.role === 'kasir' || req.user.role === 'barber') && req.user.branchId && existing.branchId !== req.user.branchId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const body = updateQueueSchema.parse(req.body);

    // Defense-in-depth: status 'paid' hanya boleh dari 'done' (alur lewat POS yg
    // membuat transaksi). Cegah tiket ditandai lunas tanpa transaksi/omzet
    // (mis. drag langsung ke kolom "Sudah Bayar"). 'paid'→'paid' diizinkan (idempoten).
    if (body.status === 'paid' && !['done', 'paid'].includes(existing.status)) {
      return res.status(400).json({
        success: false,
        error: 'Antrian harus berstatus "selesai" sebelum ditandai sudah bayar',
      });
    }

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
    // Kasir terikat cabang: hanya boleh menghapus antrian cabangnya sendiri.
    if (req.user.role === 'kasir' && req.user.branchId && existing.branchId !== req.user.branchId) {
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
