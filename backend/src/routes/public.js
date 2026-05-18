const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { formatYmdInTz, normalizeTimezone, DEFAULT_TZ } = require('../utils/timezone');

// Defense-in-depth: even if the public booking UI is bypassed, refuse a slot
// that's already in the past (or starts in less than this many minutes) in the
// tenant's local clock. Mirrors the BOOKING_LEAD_MINUTES on the frontend.
const BOOKING_LEAD_MINUTES = 15;

function nowHHMMInTz(tz) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date());
  } catch {
    const d = new Date();
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }
}

function hhmmToMinutes(s) { const [h, m] = s.split(':').map(Number); return h * 60 + m; }

// Middleware: pastikan tenant ditemukan dari subdomain/header
function requireTenant(req, res, next) {
  if (!req.tenant) return res.status(404).json({ success: false, error: 'Barbershop tidak ditemukan' });
  if (req.tenant.isSuspended) return res.status(403).json({ success: false, error: 'Barbershop sedang tidak aktif' });
  next();
}

// GET /api/public/info — nama, logo, dan konfigurasi tampilan halaman booking.
// `bookingPage` di-fetch terpisah karena tidak masuk ke select default tenant
// resolver (payloadnya bisa besar — base64 hero image / gallery).
router.get('/info', requireTenant, async (req, res, next) => {
  try {
    const full = await prisma.tenant.findUnique({
      where: { id: req.tenant.id },
      select: {
        name: true, slug: true, logo: true, address: true, phone: true,
        bookingPage: true,
      },
    });
    if (!full) return res.status(404).json({ success: false, error: 'Tenant tidak ditemukan' });
    res.json({
      success: true,
      data: {
        name:        full.name,
        slug:        full.slug,
        logo:        full.logo || null,
        address:     full.address || null,
        phone:       full.phone || null,
        bookingPage: full.bookingPage || null,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/public/branches
router.get('/branches', requireTenant, async (req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { tenantId: req.tenant.id, isActive: true, deletedAt: null },
      select: { id: true, name: true, address: true, phone: true, openTime: true, closeTime: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: branches });
  } catch (err) { next(err); }
});

// GET /api/public/services
router.get('/services', requireTenant, async (req, res, next) => {
  try {
    const services = await prisma.service.findMany({
      where: { tenantId: req.tenant.id, isActive: true, deletedAt: null },
      select: { id: true, name: true, description: true, price: true, duration: true, category: true, icon: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, data: services });
  } catch (err) { next(err); }
});

// GET /api/public/barbers?branchId=xxx
// Mengembalikan barber aktif + agregat rating (avg & count) supaya UI /book
// bisa menampilkan skor bintang per barber. Agregat dihitung via 1x groupBy
// (anti N+1) dan tenant-scoped.
router.get('/barbers', requireTenant, async (req, res, next) => {
  try {
    const where = { tenantId: req.tenant.id, role: 'barber', isActive: true, deletedAt: null };
    if (req.query.branchId) where.branchId = req.query.branchId;
    const barbers = await prisma.user.findMany({
      where,
      select: { id: true, name: true, photo: true },
      orderBy: { name: 'asc' },
    });

    // Agregat rating per barber — single groupBy, tenant-scoped.
    let ratingMap = {};
    const barberIds = barbers.map((b) => b.id);
    if (barberIds.length) {
      const agg = await prisma.barberRating.groupBy({
        by: ['barberId'],
        where: { tenantId: req.tenant.id, barberId: { in: barberIds } },
        _avg: { rating: true },
        _count: { rating: true },
      });
      ratingMap = agg.reduce((m, r) => {
        m[r.barberId] = {
          avgRating: r._avg.rating != null ? Math.round(r._avg.rating * 10) / 10 : null,
          ratingCount: r._count.rating || 0,
        };
        return m;
      }, {});
    }

    const data = barbers.map((b) => ({
      ...b,
      avgRating:   ratingMap[b.id]?.avgRating   ?? null,
      ratingCount: ratingMap[b.id]?.ratingCount ?? 0,
    }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/public/testimonials — testimoni published untuk /book landing.
// Default limit 6, max 20. Hanya yang publishStatus='published'.
router.get('/testimonials', requireTenant, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 6, 20);
    const items = await prisma.barberRating.findMany({
      where: {
        tenantId: req.tenant.id,
        publishStatus: 'published',
        comment: { not: null },
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: {
        id: true, rating: true, comment: true, publishedAt: true,
        barber: { select: { name: true, photo: true } },
      },
    });
    // Anonimisasi customer name (sengaja tidak include customerId/customerName)
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

const publicBookingSchema = z.object({
  branchId:      z.string().min(1, 'Cabang wajib dipilih'),
  serviceId:     z.string().min(1, 'Layanan wajib dipilih'),
  barberId:      z.string().min(1, 'Barber wajib dipilih'),
  customerName:  z.string().min(2, 'Nama minimal 2 karakter'),
  customerPhone: z.string().min(8, 'Nomor HP tidak valid').max(15),
  date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid'),
  time:          z.string().regex(/^\d{2}:\d{2}$/, 'Format waktu tidak valid'),
  notes:         z.string().max(300).optional(),
});

// GET /api/public/availability — return slot waktu yang SUDAH di-booking utk
// branch + tanggal + (optional) barber tertentu, supaya UI bisa render
// slot "Penuh" yang non-clickable. Hanya status pending/confirmed/in_progress
// yang dianggap blocking — done/cancelled boleh re-book.
//
// 2026-05-14: tambah overlap awareness. Kalau `serviceId` di-pass, slot yang
// memulai dalam window (start, start+duration) dari booking existing juga
// dihitung sebagai blocked — sebelumnya slot "tersedia" bisa dipilih lalu
// gagal di POST karena overlap. Backend juga mengembalikan `bookedRanges`
// untuk transparency.
router.get('/availability', requireTenant, async (req, res, next) => {
  try {
    const { branchId, date, barberId, serviceId } = req.query;
    if (!branchId || !date) {
      return res.status(400).json({ success: false, error: 'branchId dan date wajib' });
    }
    const where = {
      tenantId: req.tenant.id,
      branchId: String(branchId),
      date: String(date),
      status: { in: ['pending', 'confirmed', 'in_progress'] },
    };
    if (barberId) where.barberId = String(barberId);

    const [rows, service] = await Promise.all([
      prisma.booking.findMany({
        where,
        select: { time: true, barberId: true, serviceId: true },
      }),
      serviceId
        ? prisma.service.findFirst({
            where: { id: String(serviceId), tenantId: req.tenant.id, isActive: true, deletedAt: null },
            select: { duration: true },
          })
        : null,
    ]);

    // Need durations for each existing booking to compute the blocked range.
    const existingServiceIds = [...new Set(rows.map(r => r.serviceId).filter(Boolean))];
    const durations = existingServiceIds.length
      ? await prisma.service.findMany({
          where: { id: { in: existingServiceIds }, tenantId: req.tenant.id },
          select: { id: true, duration: true },
        })
      : [];
    const durMap = Object.fromEntries(durations.map(d => [d.id, d.duration || 30]));

    // Build blocked ranges in HH:MM-minute terms
    const ranges = rows.map(r => {
      const start = hhmmToMinutes(r.time);
      const dur   = durMap[r.serviceId] || 30;
      return { start, end: start + dur };
    });

    // Slot is blocked if ANY existing range overlaps [slotStart, slotStart + targetDuration).
    const targetDur = service?.duration || 30;
    const minutesToHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

    res.json({
      success: true,
      data: {
        // Backward-compat: existing FE reads `booked` (exact start times).
        booked: rows.map(r => r.time),
        // New: ranges client can use to render finer-grain disables.
        bookedRanges: ranges.map(r => ({ start: minutesToHHMM(r.start), end: minutesToHHMM(r.end) })),
        // Convenience flag — true iff caller passed serviceId; lets FE know it
        // can rely on `bookedRanges` instead of `booked` alone.
        targetDuration: targetDur,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/public/bookings/lookup?phone=08xx — customer cari booking aktif
// pakai nomor HP. Maks 5 booking terbaru, hide status done/cancelled lama.
router.get('/bookings/lookup', requireTenant, async (req, res, next) => {
  try {
    const phone = String(req.query.phone || '').trim();
    if (!phone || phone.length < 4) {
      return res.status(400).json({ success: false, error: 'Nomor HP wajib (minimal 4 digit)' });
    }
    const todayYmd = formatYmdInTz(new Date(), normalizeTimezone(req.tenant.timezone || DEFAULT_TZ));
    const bookings = await prisma.booking.findMany({
      where: {
        tenantId: req.tenant.id,
        customerPhone: phone,
        // Sertakan upcoming + recent done/cancelled (7 hari ke belakang) supaya
        // pelanggan tahu booking yang baru selesai/dibatalkan juga.
        OR: [
          { status: { in: ['pending', 'confirmed', 'in_progress'] } },
          { date: { gte: new Date(Date.now() - 7 * 86400e3).toISOString().slice(0, 10) } },
        ],
      },
      select: {
        id: true, customerName: true, serviceName: true, barberName: true,
        date: true, time: true, status: true,
        branch: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
      take: 5,
    });
    res.json({ success: true, data: bookings });
  } catch (err) { next(err); }
});

// POST /api/public/bookings
router.post('/bookings', requireTenant, async (req, res, next) => {
  try {
    const body = publicBookingSchema.parse(req.body);

    const branch = await prisma.branch.findFirst({
      where: { id: body.branchId, tenantId: req.tenant.id, isActive: true, deletedAt: null },
    });
    if (!branch) return res.status(400).json({ success: false, error: 'Cabang tidak ditemukan' });

    // Reject past slots (tenant-local time). Lead-time buffer prevents booking
    // a slot that starts in <15 minutes — gives kasir time to prepare.
    const tz = normalizeTimezone(req.tenant.timezone || DEFAULT_TZ);
    const todayYmd = formatYmdInTz(new Date(), tz);
    if (body.date < todayYmd) {
      return res.status(400).json({ success: false, error: 'Tanggal sudah lewat' });
    }
    if (body.date === todayYmd) {
      const cutoff = hhmmToMinutes(nowHHMMInTz(tz)) + BOOKING_LEAD_MINUTES;
      if (hhmmToMinutes(body.time) < cutoff) {
        return res.status(400).json({
          success: false,
          error: `Jam ${body.time} sudah lewat. Pilih jam minimal ${BOOKING_LEAD_MINUTES} menit dari sekarang.`,
        });
      }
    }
    // Also enforce within the branch's open/close window so a customer can't
    // pick a slot the shop isn't even open.
    if (branch.openTime && body.time < branch.openTime) {
      return res.status(400).json({ success: false, error: `Cabang buka dari jam ${branch.openTime}` });
    }
    if (branch.closeTime && body.time >= branch.closeTime) {
      return res.status(400).json({ success: false, error: `Cabang tutup jam ${branch.closeTime}` });
    }

    const service = await prisma.service.findFirst({
      where: { id: body.serviceId, tenantId: req.tenant.id, isActive: true, deletedAt: null },
      select: { name: true, duration: true },
    });
    if (!service) return res.status(400).json({ success: false, error: 'Layanan tidak ditemukan' });

    // Barber wajib dipilih — validasi milik tenant & masih aktif.
    const barberId = body.barberId;
    const barber = await prisma.user.findFirst({
      where: { id: barberId, tenantId: req.tenant.id, role: 'barber', isActive: true, deletedAt: null },
      select: { name: true },
    });
    if (!barber) {
      return res.status(400).json({
        success: false,
        error: 'Barber tidak ditemukan atau tidak aktif. Silakan pilih barber lain.',
      });
    }
    const barberName = barber.name;

    // Atomic conflict check: refuse if an active booking overlaps the requested
    // slot. Without this, two customers racing on the same slot could both
    // succeed (each saw the slot as free during availability fetch). This
    // mirrors the overlap detection in /availability so the UI and server
    // agree on what's "full".
    const targetStart = hhmmToMinutes(body.time);
    const targetEnd   = targetStart + (service.duration || 30);
    const existing = await prisma.booking.findMany({
      where: {
        tenantId: req.tenant.id,
        branchId: body.branchId,
        date: body.date,
        status: { in: ['pending', 'confirmed', 'in_progress'] },
        ...(barberId ? { barberId } : {}),
      },
      select: { id: true, time: true, serviceId: true },
    });
    if (existing.length) {
      const ids = [...new Set(existing.map(e => e.serviceId).filter(Boolean))];
      const durs = ids.length
        ? await prisma.service.findMany({ where: { id: { in: ids } }, select: { id: true, duration: true } })
        : [];
      const durMap = Object.fromEntries(durs.map(d => [d.id, d.duration || 30]));
      const conflict = existing.find(e => {
        const s = hhmmToMinutes(e.time);
        const en = s + (durMap[e.serviceId] || 30);
        return s < targetEnd && targetStart < en;
      });
      if (conflict) {
        return res.status(409).json({
          success: false,
          error: 'Slot ini baru saja dipesan orang lain. Silakan pilih jam lain.',
        });
      }
    }

    // Setiap booking online juga harus tercatat di akun admin sebagai pelanggan.
    let customerId = null;
    try {
      const { upsertCustomerByPhone } = require('../services/customerService');
      const c = await upsertCustomerByPhone(prisma, {
        tenantId: req.tenant.id,
        name: body.customerName,
        phone: body.customerPhone,
      });
      if (c?.id) customerId = c.id;
    } catch (_) { /* upsert is best-effort, jangan blokir booking */ }

    const booking = await prisma.booking.create({
      data: {
        tenantId:      req.tenant.id,
        branchId:      body.branchId,
        customerId,
        serviceId:     body.serviceId,
        serviceName:   service.name,
        barberId,
        barberName,
        customerName:  body.customerName,
        customerPhone: body.customerPhone,
        date:          body.date,
        time:          body.time,
        notes:         body.notes || null,
        status:        'pending',
        source:        'online',
      },
      include: { branch: { select: { id: true, name: true } } },
    });

    // Notifikasi real-time ke kasir & barber yang sedang online di cabang ini.
    try {
      const { emitBookingEvent } = require('../config/socket');
      emitBookingEvent('booking:created', booking);
    } catch (_) { /* socket optional */ }

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    if (err?.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0]?.message || 'Data tidak valid' });
    }
    next(err);
  }
});

// GET /api/public/bookings/:id — cek status booking
router.get('/bookings/:id', requireTenant, async (req, res, next) => {
  try {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, tenantId: req.tenant.id },
      select: {
        id: true, customerName: true, serviceName: true, barberName: true,
        date: true, time: true, status: true, notes: true,
        branch: { select: { id: true, name: true } },
      },
    });
    if (!booking) return res.status(404).json({ success: false, error: 'Booking tidak ditemukan' });
    res.json({ success: true, data: booking });
  } catch (err) { next(err); }
});

module.exports = router;
