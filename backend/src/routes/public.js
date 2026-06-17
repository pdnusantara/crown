const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { formatYmdInTz, normalizeTimezone, DEFAULT_TZ, tenantDayStart } = require('../utils/timezone');
const { getBranchLicenseStatus, isBranchLicensed } = require('../utils/branchLicense');

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

// GET /api/public/affiliate-code/:code — lookup minimal info kode rujukan.
// Dipakai halaman /register untuk menampilkan "Direkrut oleh: …" agar pendaftar
// tahu kode validasi. Tidak mengembalikan PII (email/phone affiliate).
router.get('/affiliate-code/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').toUpperCase().slice(0, 32);
    if (!code) return res.json({ success: true, data: null });
    const aff = await require('../config/database').affiliate.findUnique({
      where: { referralCode: code },
      select: {
        referralCode: true, status: true,
        displayName: true,
        user: { select: { name: true } },
      },
    });
    if (!aff || aff.status !== 'active') {
      return res.json({ success: true, data: null });
    }
    res.json({
      success: true,
      data: {
        code: aff.referralCode,
        name: aff.displayName || aff.user.name,
      },
    });
  } catch { res.json({ success: true, data: null }); }
});

// POST /api/public/affiliate-register — pendaftaran mitra affiliate (status=pending).
// Berbeda dari pendaftaran tenant: tidak buat Tenant/Subscription, hanya User+Affiliate.
const _z = require('zod');
const affiliateRegisterSchema = _z.object({
  name:     _z.string().min(2).max(150),
  email:    _z.string().email().transform(e => e.trim().toLowerCase()),
  phone:    _z.string().min(8).max(20),
  password: _z.string().min(8).max(72),
  bio:      _z.string().max(500).optional(),
});

router.post('/affiliate-register', async (req, res, next) => {
  try {
    const body = affiliateRegisterSchema.parse(req.body);
    const prisma = require('../config/database');
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');

    const [emailUser, emailTenant] = await Promise.all([
      prisma.user.findFirst({ where: { email: { equals: body.email, mode: 'insensitive' } }, select: { id: true } }),
      prisma.tenant.findFirst({ where: { email: { equals: body.email, mode: 'insensitive' } }, select: { id: true } }),
    ]);
    if (emailUser || emailTenant) {
      return res.status(409).json({ success: false, error: 'Email sudah terdaftar' });
    }

    // Generate referral code unik (8 char) — pola sama dengan routes/affiliates.js.
    const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    async function uniqueCode() {
      for (let i = 0; i < 8; i++) {
        const b = crypto.randomBytes(8);
        let s = ''; for (let j = 0; j < 8; j++) s += ALPHA[b[j] % ALPHA.length];
        const exists = await prisma.affiliate.findUnique({ where: { referralCode: s }, select: { id: true } });
        if (!exists) return s;
      }
      throw new Error('Failed to generate referral code');
    }

    const referralCode = await uniqueCode();
    const passwordHash = await bcrypt.hash(body.password, 10);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email:    body.email,
          password: passwordHash,
          name:     body.name,
          phone:    body.phone,
          role:     'affiliate',
          isActive: true,
        },
      });
      return tx.affiliate.create({
        data: {
          userId:         user.id,
          referralCode,
          status:         'pending', // butuh approval SA
          displayName:    body.name,
          bio:            body.bio || null,
          commissionRate: 0.10,
        },
      });
    });

    // Audit + broadcast ke super-admin supaya bisa langsung approve.
    try {
      const { recordAudit } = require('../utils/auditLog');
      await recordAudit(null, {
        action: 'affiliate.self_register',
        target: `affiliate:${created.id}`,
        detail: `${created.referralCode} — ${body.email} (status=pending)`,
        severity: 'info',
        actorId: null,
        actorName: body.name,
      });
      const { getIO } = require('../config/socket');
      getIO()?.to('support').emit('affiliate:created', { id: created.id, status: 'pending' });
    } catch { /* noop */ }

    res.status(201).json({
      success: true,
      data: {
        referralCode: created.referralCode,
        email:        body.email,
        status:       'pending',
      },
    });
  } catch (err) {
    if (err?.name === 'ZodError') return res.status(400).json({ success: false, error: err.errors[0]?.message });
    if (err?.code === 'P2002') return res.status(409).json({ success: false, error: 'Email sudah terdaftar' });
    next(err);
  }
});

// GET /api/public/info — nama, logo, dan konfigurasi tampilan halaman booking.
// `bookingPage` di-fetch terpisah karena tidak masuk ke select default tenant
// resolver (payloadnya bisa besar — base64 hero image / gallery).
router.get('/info', requireTenant, async (req, res, next) => {
  try {
    const full = await prisma.tenant.findUnique({
      where: { id: req.tenant.id },
      select: {
        name: true, slug: true, logo: true, address: true, phone: true,
        bookingPage: true, wilayah: true, receiptSettings: true,
      },
    });
    if (!full) return res.status(404).json({ success: false, error: 'Tenant tidak ditemukan' });

    // Nama akun pemilik (tenant_admin tertua) — dipakai halaman /book sebagai
    // nama yang ditampilkan, sesuai preferensi tenant. Fallback ke nama bisnis.
    const owner = await prisma.user.findFirst({
      where: { tenantId: req.tenant.id, role: 'tenant_admin', deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { name: true },
    });
    res.json({
      success: true,
      data: {
        name:        full.name,
        ownerName:   owner?.name || null,
        slug:        full.slug,
        logo:        full.logo || null,
        address:     full.address || null,
        phone:       full.phone || null,
        bookingPage: full.bookingPage || null,
        wilayah:     full.wilayah || null,
        receiptSettings: full.receiptSettings || null,
        // Flag dev-login — frontend pakai ini untuk memunculkan tombol login
        // cepat tanpa password. Hanya true kalau env DEV_LOGIN=1 di backend.
        devLogin:    process.env.DEV_LOGIN === '1',
      },
    });
  } catch (err) { next(err); }
});

// GET /api/public/branches
router.get('/branches', requireTenant, async (req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { tenantId: req.tenant.id, isActive: true, deletedAt: null },
      select: { id: true, name: true, address: true, phone: true, openTime: true, closeTime: true, closedDates: true },
      orderBy: { name: 'asc' },
    });
    // Sembunyikan cabang yang belum berlisensi (cabang add-on yang belum dibayar)
    // dari halaman booking publik — pelanggan tak boleh memesan ke cabang yang
    // belum aktif. Penegakan tulis ada di POST /bookings.
    const license = await getBranchLicenseStatus(req.tenant.id);
    const visible = branches.filter((b) => !license.unlicensed.has(b.id));
    res.json({ success: true, data: visible });
  } catch (err) { next(err); }
});

// GET /api/public/queue-status — estimasi antrian per cabang untuk halaman /book.
// Heuristik: (jumlah antri / jumlah barber aktif) × durasi rata-rata layanan.
// Hanya untuk informasi pelanggan; tak menahan booking. Hitung antrian hari ini
// (TZ tenant) berstatus `waiting`. Tidak membongkar data pelanggan — hanya angka.
router.get('/queue-status', requireTenant, async (req, res, next) => {
  try {
    const tz = normalizeTimezone(req.tenant.timezone || DEFAULT_TZ);
    const todayStart = tenantDayStart(formatYmdInTz(new Date(), tz), tz);

    const [waitingByBranch, barbersByBranch, durAgg] = await Promise.all([
      prisma.queue.groupBy({
        by: ['branchId'],
        where: { tenantId: req.tenant.id, status: 'waiting', createdAt: { gte: todayStart } },
        _count: { _all: true },
      }),
      // Barber aktif per cabang (role barber atau kasir merangkap isBarber).
      prisma.user.groupBy({
        by: ['branchId'],
        where: {
          tenantId: req.tenant.id, isActive: true, deletedAt: null,
          branchId: { not: null }, OR: [{ role: 'barber' }, { isBarber: true }],
        },
        _count: { _all: true },
      }),
      prisma.service.aggregate({
        _avg: { duration: true },
        where: { tenantId: req.tenant.id, isActive: true, deletedAt: null },
      }),
    ]);

    const avgDuration = Math.round(durAgg._avg.duration || 30) || 30;
    const barberCount = barbersByBranch.reduce((m, r) => {
      if (r.branchId) m[r.branchId] = r._count._all;
      return m;
    }, {});

    const data = waitingByBranch.map((r) => {
      const waiting = r._count._all;
      const barbers = Math.max(barberCount[r.branchId] || 1, 1);
      // Pembulatan ke atas: pelanggan ke-(barbers+1) menunggu 1 giliran, dst.
      const estimatedMinutes = Math.ceil(waiting / barbers) * avgDuration;
      return { branchId: r.branchId, waiting, estimatedMinutes };
    });

    res.json({ success: true, data });
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
    // Barber-eligible = role barber ATAU kasir yang ditandai juga barber
    // (isBarber) — supaya staf merangkap ikut bisa dipilih pelanggan saat booking,
    // konsisten dengan POS. (Lihat barberEligible di routes/users.js.)
    const where = {
      tenantId: req.tenant.id,
      isActive: true,
      deletedAt: null,
      OR: [{ role: 'barber' }, { isBarber: true }],
    };
    if (req.query.branchId) {
      // Cabang belum berlisensi → tidak menerima booking online, jangan tampilkan barber.
      if (!(await isBranchLicensed(req.tenant.id, String(req.query.branchId)))) {
        return res.json({ success: true, data: [] });
      }
      where.branchId = req.query.branchId;
    }
    const barbers = await prisma.user.findMany({
      where,
      select: {
        id: true, name: true, photo: true,
        barberTitle: true, barberBio: true, barberExpYears: true,
        barberSpecialties: true, barberPortfolio: true,
      },
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

// GET /api/public/barbers/:id — profil lengkap satu barber untuk halaman
// detail di /book: bio, keahlian, portofolio, agregat rating + ulasan publish.
router.get('/barbers/:id', requireTenant, async (req, res, next) => {
  try {
    const barber = await prisma.user.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.tenant.id,
        isActive: true,
        deletedAt: null,
        OR: [{ role: 'barber' }, { isBarber: true }],
      },
      select: {
        id: true, name: true, photo: true,
        barberTitle: true, barberBio: true, barberExpYears: true,
        barberSpecialties: true, barberPortfolio: true,
      },
    });
    if (!barber) return res.status(404).json({ success: false, error: 'Barber tidak ditemukan' });

    const [agg, reviews] = await Promise.all([
      prisma.barberRating.aggregate({
        where: { tenantId: req.tenant.id, barberId: barber.id },
        _avg: { rating: true }, _count: { rating: true },
      }),
      // Ulasan publik (sudah di-publish admin) untuk barber ini — anonim.
      prisma.barberRating.findMany({
        where: { tenantId: req.tenant.id, barberId: barber.id, publishStatus: 'published', comment: { not: null } },
        orderBy: { publishedAt: 'desc' },
        take: 8,
        select: { id: true, rating: true, comment: true, publishedAt: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        ...barber,
        avgRating:   agg._avg.rating != null ? Math.round(agg._avg.rating * 10) / 10 : null,
        ratingCount: agg._count.rating || 0,
        reviews,
      },
    });
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
  // Booking bisa lebih dari satu layanan. `serviceIds` adalah sumber utama;
  // `serviceId` (tunggal) tetap diterima demi kompat klien lama.
  serviceId:     z.string().min(1).optional(),
  serviceIds:    z.array(z.string().min(1)).min(1, 'Pilih minimal satu layanan').max(15).optional(),
  barberId:      z.string().min(1, 'Barber wajib dipilih'),
  customerName:  z.string().min(2, 'Nama minimal 2 karakter'),
  customerPhone: z.string().min(8, 'Nomor HP tidak valid').max(15),
  date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid'),
  time:          z.string().regex(/^\d{2}:\d{2}$/, 'Format waktu tidak valid'),
  notes:         z.string().max(300).optional(),
  // Alamat wilayah pelanggan (opsional) — kecamatan & desa dalam kabupaten toko.
  address:       z.object({
    provinsiId:  z.string().max(10).optional(),
    provinsi:    z.string().max(100).optional(),
    kabupatenId: z.string().max(10).optional(),
    kabupaten:   z.string().max(120).optional(),
    kecamatanId: z.string().max(10).optional(),
    kecamatan:   z.string().max(120).optional(),
    kelurahanId: z.string().max(15).optional(),
    kelurahan:   z.string().max(120).optional(),
  }).optional(),
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
    // Multi-layanan: terima `serviceIds` (dipisah koma) atau `serviceId` tunggal.
    const targetServiceIds = req.query.serviceIds
      ? String(req.query.serviceIds).split(',').map(s => s.trim()).filter(Boolean)
      : (serviceId ? [String(serviceId)] : []);
    if (!branchId || !date) {
      return res.status(400).json({ success: false, error: 'branchId dan date wajib' });
    }
    // Cabang belum berlisensi (add-on belum dibayar) tidak menerima booking online.
    if (!(await isBranchLicensed(req.tenant.id, String(branchId)))) {
      return res.status(403).json({
        success: false,
        code: 'BRANCH_UNLICENSED',
        error: 'Cabang ini belum tersedia untuk booking online.',
      });
    }
    const where = {
      tenantId: req.tenant.id,
      branchId: String(branchId),
      date: String(date),
      status: { in: ['pending', 'confirmed', 'in_progress'] },
    };
    if (barberId) where.barberId = String(barberId);

    const [rows, targetServices, branch] = await Promise.all([
      prisma.booking.findMany({
        where,
        select: { time: true, barberId: true, serviceId: true },
      }),
      targetServiceIds.length
        ? prisma.service.findMany({
            where: { id: { in: targetServiceIds }, tenantId: req.tenant.id, isActive: true, deletedAt: null },
            select: { duration: true },
          })
        : [],
      prisma.branch.findFirst({
        where: { id: String(branchId), tenantId: req.tenant.id, deletedAt: null },
        select: { closedDates: true },
      }),
    ]);
    // Durasi total = jumlah durasi semua layanan terpilih (multi-layanan).
    const service = targetServices.length
      ? { duration: targetServices.reduce((sum, s) => sum + (s.duration || 30), 0) }
      : null;

    // Cabang ditutup admin pada tanggal ini → kembalikan flag eksplisit
    // supaya UI bisa tampil banner & sembunyikan slot.
    const closures = Array.isArray(branch?.closedDates) ? branch.closedDates : [];
    const closure = closures.find((c) => c?.date === String(date));
    if (closure) {
      return res.json({
        success: true,
        data: {
          closed: true,
          closureNote: closure.note || null,
          booked: [],
          bookedRanges: [],
          targetDuration: service?.duration || 30,
        },
      });
    }

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
        closed: false,
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

    // Cabang add-on yang belum dibayar tidak boleh menerima booking — penegakan
    // tulis (jalur publik tak melewati requireLicensedBranch yang butuh auth).
    if (!(await isBranchLicensed(req.tenant.id, branch.id))) {
      return res.status(403).json({
        success: false,
        code: 'BRANCH_UNLICENSED',
        error: 'Cabang ini belum tersedia untuk booking online.',
      });
    }

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
    // Cabang ditutup admin pada tanggal ini (libur khusus, Lebaran, dll).
    const closures = Array.isArray(branch.closedDates) ? branch.closedDates : [];
    const closure = closures.find((c) => c?.date === body.date);
    if (closure) {
      return res.status(422).json({
        success: false,
        error: `Maaf, cabang tutup pada tanggal ini${closure.note ? ` (${closure.note})` : ''}. Silakan pilih tanggal lain.`,
        code: 'BRANCH_CLOSED',
      });
    }

    // Normalisasi daftar layanan: utamakan serviceIds, fallback ke serviceId
    // tunggal (klien lama). Buang duplikat sambil pertahankan urutan pilih.
    const rawIds = (body.serviceIds && body.serviceIds.length) ? body.serviceIds : (body.serviceId ? [body.serviceId] : []);
    const serviceIds = [...new Set(rawIds)];
    if (serviceIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Pilih minimal satu layanan' });
    }
    const svcRows = await prisma.service.findMany({
      where: { id: { in: serviceIds }, tenantId: req.tenant.id, isActive: true, deletedAt: null },
      select: { id: true, name: true, duration: true },
    });
    if (svcRows.length !== serviceIds.length) {
      return res.status(400).json({ success: false, error: 'Sebagian layanan tidak ditemukan atau tidak aktif' });
    }
    // Urutkan sesuai urutan pilihan pelanggan & gabungkan nama + durasi.
    const svcById = Object.fromEntries(svcRows.map(s => [s.id, s]));
    const orderedServices = serviceIds.map(id => svcById[id]);
    const totalDuration = orderedServices.reduce((sum, s) => sum + (s.duration || 30), 0);
    const service = { name: orderedServices.map(s => s.name).join(' + '), duration: totalDuration };

    // Barber wajib dipilih — validasi milik tenant & masih aktif.
    const barberId = body.barberId;
    const barber = await prisma.user.findFirst({
      // Barber-eligible: role barber ATAU kasir merangkap barber (isBarber).
      where: { id: barberId, tenantId: req.tenant.id, isActive: true, deletedAt: null, OR: [{ role: 'barber' }, { isBarber: true }] },
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
        address: body.address,
      });
      if (c?.id) customerId = c.id;
    } catch (_) { /* upsert is best-effort, jangan blokir booking */ }

    const booking = await prisma.booking.create({
      data: {
        tenantId:      req.tenant.id,
        branchId:      body.branchId,
        customerId,
        serviceId:     serviceIds[0],
        serviceName:   service.name,
        serviceIds,
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

// ============================================================================
// PUBLIC RATING — pelanggan rate transaksi lewat link WA tanpa login
// ============================================================================

// Rate-limit kecil per IP (anti-spam) — toleran karena link sekali pakai
// per transaksi tapi tetap proteksi dari script kasar.
const ratingRateLimiter = require('express-rate-limit')({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Terlalu banyak request, coba lagi sebentar' },
});

const ratingSubmitSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional().nullable(),
  barberRatings: z.array(z.object({
    barberId: z.string(),
    rating: z.number().int().min(1).max(5),
  })).max(20).optional(),
});

// GET /api/public/rating/:transactionId — fetch ringkasan transaksi + status sudah rate
router.get('/rating/:transactionId', requireTenant, ratingRateLimiter, async (req, res, next) => {
  try {
    const tx = await prisma.transaction.findFirst({
      where: { id: req.params.transactionId, tenantId: req.tenant.id },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        customerId: true,
        customerName: true,
        total: true,
        createdAt: true,
        status: true,
        branch: { select: { id: true, name: true } },
        items: { select: { id: true, name: true, barberId: true } },
      },
    });
    if (!tx) return res.status(404).json({ success: false, error: 'Transaksi tidak ditemukan' });
    if (tx.status !== 'completed') {
      return res.status(400).json({ success: false, error: 'Transaksi belum selesai atau dibatalkan' });
    }

    const existing = await prisma.shopRating.findUnique({
      where: { transactionId: tx.id },
      select: { id: true, rating: true, comment: true, createdAt: true },
    });

    // TransactionItem hanya simpan `barberId` (tanpa relation di schema).
    // Fetch nama barber terpisah supaya bisa ditampilkan di form per-barber.
    const barberIds = [...new Set(tx.items.map(it => it.barberId).filter(Boolean))];
    let barbers = [];
    if (barberIds.length) {
      barbers = await prisma.user.findMany({
        where: { id: { in: barberIds } },
        select: { id: true, name: true },
      });
    }

    res.json({
      success: true,
      data: {
        transaction: {
          id: tx.id,
          customerName: tx.customerName,
          total: tx.total,
          createdAt: tx.createdAt,
          branchName: tx.branch?.name || null,
        },
        tenant: {
          name: req.tenant.name,
          logo: req.tenant.logo,
          slug: req.tenant.slug,
        },
        barbers,
        alreadyRated: !!existing,
        existing: existing ? { rating: existing.rating, comment: existing.comment, createdAt: existing.createdAt } : null,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/public/rating/:transactionId — submit rating dari pelanggan
router.post('/rating/:transactionId', requireTenant, ratingRateLimiter, async (req, res, next) => {
  try {
    const body = ratingSubmitSchema.parse(req.body);

    const tx = await prisma.transaction.findFirst({
      where: { id: req.params.transactionId, tenantId: req.tenant.id, status: 'completed' },
      select: {
        id: true, tenantId: true, branchId: true, customerId: true,
        items: { select: { barberId: true } },
      },
    });
    if (!tx) return res.status(404).json({ success: false, error: 'Transaksi tidak ditemukan' });

    const existing = await prisma.shopRating.findUnique({ where: { transactionId: tx.id } });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Transaksi ini sudah pernah dirating' });
    }

    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || '').trim().slice(0, 100);
    const ua = (req.headers['user-agent'] || '').toString().slice(0, 500);

    // Daftar barberId valid yang melayani transaksi ini — filter input client.
    const validBarberIds = new Set(tx.items.map(it => it.barberId).filter(Boolean));

    const shopRating = await prisma.$transaction(async (prismaTx) => {
      const shop = await prismaTx.shopRating.create({
        data: {
          tenantId: tx.tenantId,
          branchId: tx.branchId,
          transactionId: tx.id,
          customerId: tx.customerId,
          rating: body.rating,
          comment: body.comment?.trim() || null,
          ipAddress: ip || null,
          userAgent: ua || null,
        },
      });

      // Per-barber rating opsional — diabaikan kalau barberId tidak valid /
      // sudah pernah ada (unique transactionId+barberId).
      if (Array.isArray(body.barberRatings) && body.barberRatings.length) {
        for (const br of body.barberRatings) {
          if (!validBarberIds.has(br.barberId)) continue;
          try {
            await prismaTx.barberRating.create({
              data: {
                tenantId: tx.tenantId,
                branchId: tx.branchId,
                barberId: br.barberId,
                transactionId: tx.id,
                customerId: tx.customerId,
                rating: br.rating,
                comment: body.comment?.trim() || null,
                // Submitted dari public link (bukan kasir) — submittedById null.
              },
            });
          } catch (err) {
            // P2002: unique violation — sudah ada rating untuk transactionId+barberId
            if (err?.code !== 'P2002') throw err;
          }
        }
      }

      return shop;
    });

    // Emit realtime supaya halaman /admin/ratings, /kasir/ratings, /barber/ratings
    // langsung update tanpa polling.
    try {
      const { getIO, tenantRoom } = require('../config/socket');
      const io = getIO();
      if (io) io.to(tenantRoom(tx.tenantId)).emit('rating:created', { id: shopRating.id, tenantId: tx.tenantId });
    } catch { /* noop */ }

    res.status(201).json({
      success: true,
      data: {
        id: shopRating.id,
        rating: shopRating.rating,
        message: body.rating >= 4
          ? 'Terima kasih atas penilaiannya!'
          : 'Terima kasih, kami akan tingkatkan pelayanan kami.',
      },
    });
  } catch (err) {
    if (err?.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0]?.message || 'Data tidak valid' });
    }
    next(err);
  }
});

module.exports = router;
