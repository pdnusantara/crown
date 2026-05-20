// Absensi Digital — kehadiran staf (kasir & barber) berbasis GPS geofence.
//
// Alur: staf check-in/out dari HP; lokasi divalidasi terhadap koordinat cabang
// (radius `attendanceRadius` meter). Status terlambat/pulang cepat diturunkan
// dari WorkSchedule staf pada hari itu. Admin tenant melihat rekap & laporan,
// mengatur jadwal kerja, dan koordinat cabang.
//
// Fitur di-gate flag `attendance` (paket Pro & Enterprise) — defense-in-depth.
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { recordAudit } = require('../utils/auditLog');
const { getIO, tenantRoom } = require('../config/socket');
const { tenantDayStart, formatYmdInTz, normalizeTimezone, buildTenantDateRange } = require('../utils/timezone');

// ── Konstanta & default ─────────────────────────────────────────────────────
const ATT_DEFAULTS = {
  enabled: true, lateToleranceMin: 10, autoCheckOut: true,
  maxAccuracyM: 75, requireSelfie: false,
};

// ── Upload foto selfie absensi ──────────────────────────────────────────────
const ATT_UPLOAD_DIR = path.join(__dirname, '../../uploads/attendance');
fs.mkdirSync(ATT_UPLOAD_DIR, { recursive: true });
const ALLOWED_IMG = ['image/jpeg', 'image/png', 'image/webp'];
const uploadSelfie = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ATT_UPLOAD_DIR),
    filename:    (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB
  fileFilter: (req, file, cb) =>
    ALLOWED_IMG.includes(file.mimetype) ? cb(null, true) : cb(new Error('Foto harus JPG, PNG, atau WebP')),
}).single('photo');

// Jalankan multer sebagai promise — multipart diparse, JSON dilewati apa adanya.
function runSelfieUpload(req, res) {
  return new Promise((resolve) => {
    uploadSelfie(req, res, (err) => resolve(err || null));
  });
}
const SCHEDULE_DEFAULT = { isDayOff: false, startTime: '09:00', endTime: '17:00' };
const STATUSES = ['present', 'late', 'absent', 'leave'];

const attendanceSelect = {
  id: true, tenantId: true, branchId: true, staffId: true,
  staffName: true, staffRole: true, date: true,
  checkInAt: true, checkOutAt: true,
  checkInLat: true, checkInLng: true, checkInDistance: true, checkInPhoto: true,
  checkOutLat: true, checkOutLng: true, checkOutDistance: true, checkOutPhoto: true,
  status: true, lateMinutes: true, earlyLeaveMinutes: true, workedMinutes: true,
  scheduleStart: true, scheduleEnd: true, note: true,
  createdAt: true, updatedAt: true,
  branch: { select: { id: true, name: true } },
  staff:  { select: { id: true, name: true, role: true } },
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const emitAttendance = (event, payload, tenantId) => {
  if (!tenantId) return;
  try {
    const io = getIO();
    if (io) io.to(tenantRoom(tenantId)).emit(event, payload);
  } catch { /* socket opsional */ }
};

// Jam dinding tenant: tanggal lokal + menit-sejak-tengah-malam + hari (0=Minggu).
function tenantClock(tz) {
  const safe = normalizeTimezone(tz);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safe, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const ymd = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = parseInt(get('hour'), 10) % 24;
  const minute = parseInt(get('minute'), 10);
  const wk = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { ymd, minutes: hour * 60 + minute, dayOfWeek: wk[get('weekday')] ?? 0 };
}

// "HH:MM" → menit sejak tengah malam. Fallback 0 bila tak valid.
function hmToMin(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
  if (!m) return 0;
  return Math.min(1439, Math.max(0, parseInt(m[1], 10) * 60 + parseInt(m[2], 10)));
}

// Jarak dua titik koordinat (meter) — formula haversine.
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function resolveConfig(raw) {
  const c = { ...ATT_DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  c.enabled = c.enabled !== false;
  c.autoCheckOut = c.autoCheckOut !== false;
  c.requireSelfie = c.requireSelfie === true;
  const tol = parseInt(c.lateToleranceMin, 10);
  c.lateToleranceMin = Number.isFinite(tol) ? Math.min(120, Math.max(0, tol)) : ATT_DEFAULTS.lateToleranceMin;
  const acc = parseInt(c.maxAccuracyM, 10);
  c.maxAccuracyM = Number.isFinite(acc) ? Math.min(500, Math.max(20, acc)) : ATT_DEFAULTS.maxAccuracyM;
  return c;
}

const calendarDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Tanggal tidak valid');

// Resolve tenantId — non-SA selalu dipin ke miliknya.
function resolveTenantId(req, fromBody = false) {
  if (req.user.role === 'super_admin') {
    return (fromBody ? req.body.tenantId : req.query.tenantId) || null;
  }
  return req.user.tenantId;
}

// Ambil timezone tenant; fallback Asia/Jakarta bila tak diset.
async function tenantTimezone(tenantId) {
  if (!tenantId) return 'Asia/Jakarta';
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
  return t?.timezone || 'Asia/Jakarta';
}

// Jadwal kerja efektif staf pada satu hari.
// Untuk barber: BarberSchedule tanggal-spesifik (mis. shift Pagi/Sore) menggantikan
// pola mingguan WorkSchedule. Fallback ke WorkSchedule, lalu default.
async function getScheduleForDay(staffId, role, ymd, dayOfWeek) {
  if (role === 'barber' && ymd) {
    const bs = await prisma.barberSchedule.findFirst({
      where: { staffId, date: ymd },
      select: { startTime: true, endTime: true, shift: true },
    });
    if (bs) {
      return { isDayOff: false, startTime: bs.startTime, endTime: bs.endTime, source: `barberSchedule:${bs.shift}` };
    }
  }
  const row = await prisma.workSchedule.findUnique({
    where: { staffId_dayOfWeek: { staffId, dayOfWeek } },
  });
  if (!row) return { ...SCHEDULE_DEFAULT, source: 'default' };
  return { isDayOff: row.isDayOff, startTime: row.startTime, endTime: row.endTime, source: 'workSchedule' };
}

// ── Feature gate ────────────────────────────────────────────────────────────
async function requireAttendanceFeature(req, res, next) {
  try {
    if (req.user.role === 'super_admin') return next();
    const tenantId = req.user.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });
    const flag = await prisma.tenantFeatureFlag.findUnique({
      where: { tenantId_flagId: { tenantId, flagId: 'attendance' } },
    });
    if (!flag?.enabled) {
      return res.status(403).json({
        success: false,
        error: 'Fitur Absensi Digital tidak tersedia di paket Anda',
        code: 'FEATURE_DISABLED',
      });
    }
    next();
  } catch (err) { next(err); }
}

router.use(authenticate, requireAttendanceFeature);

// ════════════════════════════════════════════════════════════════════════════
//  ENDPOINT STAF (kasir & barber) — absen diri sendiri
// ════════════════════════════════════════════════════════════════════════════

// GET /api/attendance/me/today — status absen staf hari ini + jadwal + geofence
router.get('/me/today', requireRole('kasir', 'barber'), async (req, res, next) => {
  try {
    const { id: staffId, tenantId, branchId, role } = req.user;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }, select: { timezone: true, attendanceConfig: true },
    });
    const tz = tenant?.timezone || 'Asia/Jakarta';
    const cfg = resolveConfig(tenant?.attendanceConfig);
    const clock = tenantClock(tz);
    const date = tenantDayStart(clock.ymd, tz);

    const branch = branchId
      ? await prisma.branch.findFirst({
          where: { id: branchId, deletedAt: null },
          select: { id: true, name: true, latitude: true, longitude: true, attendanceRadius: true },
        })
      : null;

    const [attendance, schedule] = await Promise.all([
      prisma.attendance.findUnique({
        where: { staffId_date: { staffId, date } }, select: attendanceSelect,
      }),
      getScheduleForDay(staffId, role, clock.ymd, clock.dayOfWeek),
    ]);

    res.json({
      success: true,
      data: {
        today: clock.ymd,
        config: cfg,
        branch,
        branchConfigured: !!(branch && branch.latitude != null && branch.longitude != null),
        schedule,
        attendance,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/attendance/me/history — 30 catatan absen terakhir staf
router.get('/me/history', requireRole('kasir', 'barber'), async (req, res, next) => {
  try {
    const data = await prisma.attendance.findMany({
      where: { staffId: req.user.id },
      select: attendanceSelect,
      orderBy: { date: 'desc' },
      take: 30,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// coerce — nilai bisa datang sebagai number (JSON) atau string (multipart form).
const geoSchema = z.object({
  latitude:  z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracy:  z.coerce.number().min(0).max(100000).optional(),
});

// Validasi geofence — kembalikan { ok, distance, error }.
function checkGeofence(branch, lat, lng) {
  if (!branch) {
    return { ok: false, error: 'Anda belum ditugaskan ke cabang. Hubungi admin.' };
  }
  if (branch.latitude == null || branch.longitude == null) {
    return { ok: false, error: `Koordinat cabang "${branch.name}" belum diatur. Hubungi admin.` };
  }
  const distance = haversineMeters(branch.latitude, branch.longitude, lat, lng);
  const radius = branch.attendanceRadius || 100;
  if (distance > radius) {
    return {
      ok: false, distance, radius,
      error: `Anda berada ${distance} m dari cabang (maks ${radius} m). Mendekatlah ke lokasi cabang.`,
    };
  }
  return { ok: true, distance, radius };
}

// Validasi akurasi GPS & kewajiban foto selfie. Kembalikan pesan error / null.
function checkAccuracyAndSelfie(cfg, accuracy, file) {
  if (accuracy != null && accuracy > cfg.maxAccuracyM) {
    return `Akurasi GPS terlalu rendah (±${Math.round(accuracy)} m, maks ${cfg.maxAccuracyM} m). `
      + 'Aktifkan GPS presisi tinggi dan coba lagi di area terbuka.';
  }
  if (cfg.requireSelfie && !file) return 'Foto selfie wajib diunggah untuk absen.';
  return null;
}

// POST /api/attendance/check-in
router.post('/check-in', requireRole('kasir', 'barber'), async (req, res, next) => {
  try {
    const upErr = await runSelfieUpload(req, res);
    if (upErr) {
      return res.status(400).json({
        success: false,
        error: upErr.code === 'LIMIT_FILE_SIZE' ? 'Ukuran foto maksimal 3 MB' : upErr.message,
      });
    }
    const { latitude, longitude, accuracy } = geoSchema.parse(req.body);
    const { id: staffId, tenantId, branchId, name, role } = req.user;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }, select: { timezone: true, attendanceConfig: true },
    });
    const cfg = resolveConfig(tenant?.attendanceConfig);
    if (!cfg.enabled) {
      return res.status(403).json({ success: false, error: 'Absensi sedang dinonaktifkan oleh admin.' });
    }
    const guard = checkAccuracyAndSelfie(cfg, accuracy, req.file);
    if (guard) return res.status(422).json({ success: false, error: guard, code: 'CHECK_FAILED' });

    const branch = branchId
      ? await prisma.branch.findFirst({
          where: { id: branchId, deletedAt: null },
          select: { id: true, name: true, latitude: true, longitude: true, attendanceRadius: true },
        })
      : null;
    const geo = checkGeofence(branch, latitude, longitude);
    if (!geo.ok) {
      return res.status(422).json({ success: false, error: geo.error, code: 'OUT_OF_RANGE', distance: geo.distance });
    }

    const tz = tenant?.timezone || 'Asia/Jakarta';
    const clock = tenantClock(tz);
    const date = tenantDayStart(clock.ymd, tz);

    const existing = await prisma.attendance.findUnique({ where: { staffId_date: { staffId, date } } });
    if (existing?.checkInAt) {
      return res.status(409).json({ success: false, error: 'Anda sudah check-in hari ini.' });
    }

    const schedule = await getScheduleForDay(staffId, role, clock.ymd, clock.dayOfWeek);
    const startMin = hmToMin(schedule.startTime);
    let status = 'present';
    let lateMinutes = 0;
    let note = null;
    if (schedule.isDayOff) {
      note = 'Check-in di hari libur';
    } else {
      const over = clock.minutes - (startMin + cfg.lateToleranceMin);
      if (over > 0) { status = 'late'; lateMinutes = over; }
    }

    const now = new Date();
    const checkInPhoto = req.file ? `/api/uploads/attendance/${req.file.filename}` : null;
    const data = {
      tenantId, branchId, staffId, staffName: name, staffRole: role, date,
      checkInAt: now, checkInLat: latitude, checkInLng: longitude, checkInDistance: geo.distance,
      checkInPhoto, status, lateMinutes, note,
      scheduleStart: schedule.startTime, scheduleEnd: schedule.endTime,
    };
    const record = await prisma.attendance.upsert({
      where: { staffId_date: { staffId, date } },
      create: data,
      update: data,
      select: attendanceSelect,
    });

    await recordAudit(req, {
      action: 'attendance.check_in',
      target: `attendance:${record.id}`,
      detail: `${name} check-in ${status === 'late' ? `(terlambat ${lateMinutes}m)` : 'tepat waktu'}`,
      severity: status === 'late' ? 'warning' : 'info',
    });
    emitAttendance('attendance:changed', { id: record.id, staffId }, tenantId);
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: 'Lokasi GPS tidak valid.' });
    next(err);
  }
});

// POST /api/attendance/check-out
router.post('/check-out', requireRole('kasir', 'barber'), async (req, res, next) => {
  try {
    const upErr = await runSelfieUpload(req, res);
    if (upErr) {
      return res.status(400).json({
        success: false,
        error: upErr.code === 'LIMIT_FILE_SIZE' ? 'Ukuran foto maksimal 3 MB' : upErr.message,
      });
    }
    const { latitude, longitude, accuracy } = geoSchema.parse(req.body);
    const { id: staffId, tenantId, branchId, name } = req.user;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }, select: { timezone: true, attendanceConfig: true },
    });
    const cfg = resolveConfig(tenant?.attendanceConfig);
    const guard = checkAccuracyAndSelfie(cfg, accuracy, req.file);
    if (guard) return res.status(422).json({ success: false, error: guard, code: 'CHECK_FAILED' });
    const tz = tenant?.timezone || 'Asia/Jakarta';
    const clock = tenantClock(tz);
    const date = tenantDayStart(clock.ymd, tz);

    const existing = await prisma.attendance.findUnique({ where: { staffId_date: { staffId, date } } });
    if (!existing?.checkInAt) {
      return res.status(409).json({ success: false, error: 'Anda belum check-in hari ini.' });
    }
    if (existing.checkOutAt) {
      return res.status(409).json({ success: false, error: 'Anda sudah check-out hari ini.' });
    }

    const branch = branchId
      ? await prisma.branch.findFirst({
          where: { id: branchId, deletedAt: null },
          select: { id: true, name: true, latitude: true, longitude: true, attendanceRadius: true },
        })
      : null;
    const geo = checkGeofence(branch, latitude, longitude);
    if (!geo.ok) {
      return res.status(422).json({ success: false, error: geo.error, code: 'OUT_OF_RANGE', distance: geo.distance });
    }

    const now = new Date();
    const workedMinutes = Math.max(0, Math.round((now - new Date(existing.checkInAt)) / 60000));
    // Pulang cepat hanya dihitung bila check-out di hari kalender yang sama.
    let earlyLeaveMinutes = 0;
    const sameDay = formatYmdInTz(now, tz) === clock.ymd;
    if (sameDay && existing.scheduleEnd && existing.status !== 'absent' && existing.status !== 'leave') {
      const endMin = hmToMin(existing.scheduleEnd);
      earlyLeaveMinutes = Math.max(0, endMin - clock.minutes);
    }

    const record = await prisma.attendance.update({
      where: { staffId_date: { staffId, date } },
      data: {
        checkOutAt: now, checkOutLat: latitude, checkOutLng: longitude,
        checkOutDistance: geo.distance, workedMinutes, earlyLeaveMinutes,
        checkOutPhoto: req.file ? `/api/uploads/attendance/${req.file.filename}` : undefined,
      },
      select: attendanceSelect,
    });

    await recordAudit(req, {
      action: 'attendance.check_out',
      target: `attendance:${record.id}`,
      detail: `${name} check-out — kerja ${Math.floor(workedMinutes / 60)}j ${workedMinutes % 60}m`,
      severity: 'info',
    });
    emitAttendance('attendance:changed', { id: record.id, staffId }, tenantId);
    res.json({ success: true, data: record });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: 'Lokasi GPS tidak valid.' });
    next(err);
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  ENDPOINT ADMIN — rekap, laporan, jadwal kerja
// ════════════════════════════════════════════════════════════════════════════

const requireAdmin = requireRole('super_admin', 'tenant_admin');

// GET /api/attendance — rekap kehadiran, tenant-scoped, paginated
router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { branchId, staffId, status, startDate, endDate, search } = req.query;
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const where = { tenantId };
    if (branchId) where.branchId = branchId;
    if (staffId) where.staffId = staffId;
    if (status && STATUSES.includes(status)) where.status = status;
    if (search) where.staffName = { contains: String(search).trim(), mode: 'insensitive' };
    if (startDate || endDate) {
      const tz = await tenantTimezone(tenantId);
      const range = buildTenantDateRange(startDate, endDate, tz);
      if (range.gte || range.lte) where.date = range;
    }

    const [data, total] = await Promise.all([
      prisma.attendance.findMany({
        where, select: attendanceSelect, skip, take: limit,
        orderBy: [{ date: 'desc' }, { checkInAt: 'desc' }],
      }),
      prisma.attendance.count({ where }),
    ]);
    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) { next(err); }
});

// GET /api/attendance/stats — KPI periode
router.get('/stats', requireAdmin, async (req, res, next) => {
  try {
    const { branchId, startDate, endDate } = req.query;
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const where = { tenantId };
    if (branchId) where.branchId = branchId;
    if (startDate || endDate) {
      const tz = await tenantTimezone(tenantId);
      const range = buildTenantDateRange(startDate, endDate, tz);
      if (range.gte || range.lte) where.date = range;
    }

    const [byStatus, agg] = await Promise.all([
      prisma.attendance.groupBy({ by: ['status'], where, _count: true }),
      prisma.attendance.aggregate({
        where, _sum: { lateMinutes: true, workedMinutes: true }, _count: true,
      }),
    ]);
    const statusCount = { present: 0, late: 0, absent: 0, leave: 0 };
    byStatus.forEach((r) => { statusCount[r.status] = r._count; });

    res.json({
      success: true,
      data: {
        totalRecords: agg._count || 0,
        ...statusCount,
        totalLateMinutes:   agg._sum.lateMinutes || 0,
        totalWorkedMinutes: agg._sum.workedMinutes || 0,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/attendance/today-summary — ringkasan kehadiran hari ini (widget dashboard)
router.get('/today-summary', requireAdmin, async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
    const tz = tenant?.timezone || 'Asia/Jakarta';
    const clock = tenantClock(tz);
    const date = tenantDayStart(clock.ymd, tz);

    const staff = await prisma.user.findMany({
      where: { tenantId, role: { in: ['kasir', 'barber'] }, deletedAt: null, isActive: true },
      select: { id: true, name: true, role: true, branch: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    const staffIds = staff.map((s) => s.id);

    const barberIds = staff.filter((s) => s.role === 'barber').map((s) => s.id);
    const [records, schedules, barberShifts] = await Promise.all([
      prisma.attendance.findMany({
        where: { tenantId, date },
        select: { staffId: true, status: true, checkInAt: true, checkOutAt: true, lateMinutes: true },
      }),
      prisma.workSchedule.findMany({ where: { staffId: { in: staffIds }, dayOfWeek: clock.dayOfWeek } }),
      barberIds.length
        ? prisma.barberSchedule.findMany({ where: { staffId: { in: barberIds }, date: clock.ymd }, select: { staffId: true } })
        : Promise.resolve([]),
    ]);
    const recMap = {};
    records.forEach((r) => { recMap[r.staffId] = r; });
    const offMap = {};
    schedules.forEach((s) => { offMap[s.staffId] = s.isDayOff; });
    const shiftedToday = new Set(barberShifts.map((b) => b.staffId));

    const counts = { present: 0, late: 0, leave: 0, absent: 0, pending: 0, dayoff: 0 };
    const rows = staff.map((s) => {
      const rec = recMap[s.id];
      let status;
      if (rec) status = rec.status;
      else if (shiftedToday.has(s.id)) status = 'pending';
      else if (offMap[s.id]) status = 'dayoff';
      else status = 'pending';
      counts[status] = (counts[status] || 0) + 1;
      return {
        id: s.id, name: s.name, role: s.role, branchName: s.branch?.name || null,
        status,
        checkInAt: rec?.checkInAt || null,
        checkOutAt: rec?.checkOutAt || null,
        working: !!(rec?.checkInAt && !rec?.checkOutAt),
        lateMinutes: rec?.lateMinutes || 0,
      };
    });

    res.json({ success: true, data: { date: clock.ymd, totalStaff: staff.length, counts, staff: rows } });
  } catch (err) { next(err); }
});

// GET /api/attendance/report — rekap per staf untuk satu periode
router.get('/report', requireAdmin, async (req, res, next) => {
  try {
    const { branchId } = req.query;
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
    const tz = tenant?.timezone || 'Asia/Jakarta';
    const todayYmd = formatYmdInTz(new Date(), tz);
    const fallbackStart = `${todayYmd.slice(0, 7)}-01`;
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate || '') ? req.query.startDate : fallbackStart;
    const endDate   = /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate || '')   ? req.query.endDate   : todayYmd;

    // Enumerasi tanggal periode (dibatasi 92 hari).
    const days = [];
    let d = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    while (d <= end && days.length < 92) {
      days.push({ ymd: d.toISOString().slice(0, 10), dow: d.getUTCDay() });
      d = new Date(d.getTime() + 86400000);
    }

    const staffWhere = { tenantId, role: { in: ['kasir', 'barber'] }, deletedAt: null };
    if (branchId) staffWhere.branchId = branchId;
    const staff = await prisma.user.findMany({
      where: staffWhere,
      select: { id: true, name: true, role: true, branch: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    const staffIds = staff.map((s) => s.id);
    if (staffIds.length === 0) {
      return res.json({ success: true, data: { period: { startDate, endDate }, rows: [] } });
    }

    const barberIds = staff.filter((s) => s.role === 'barber').map((s) => s.id);
    const [records, schedules, barberShifts] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          tenantId, staffId: { in: staffIds },
          date: buildTenantDateRange(startDate, endDate, tz),
        },
        select: { staffId: true, date: true, status: true, lateMinutes: true, workedMinutes: true },
      }),
      prisma.workSchedule.findMany({ where: { staffId: { in: staffIds } } }),
      barberIds.length
        ? prisma.barberSchedule.findMany({
            where: { staffId: { in: barberIds }, date: { gte: startDate, lte: endDate } },
            select: { staffId: true, date: true },
          })
        : Promise.resolve([]),
    ]);

    // Index jadwal per staf per hari & catatan per staf per ymd (TZ tenant).
    const schedMap = {};   // staffId → { dow → isDayOff }
    schedules.forEach((s) => {
      (schedMap[s.staffId] ||= {})[s.dayOfWeek] = s.isDayOff;
    });
    const recMap = {};     // staffId → { ymd → record }
    records.forEach((r) => {
      const ymd = formatYmdInTz(r.date, tz);
      (recMap[r.staffId] ||= {})[ymd] = r;
    });
    // BarberSchedule override per-tanggal: shift eksplisit → bukan hari libur.
    const shiftMap = {};   // staffId → Set(ymd)
    barberShifts.forEach((b) => {
      (shiftMap[b.staffId] ||= new Set()).add(b.date);
    });

    const rows = staff.map((s) => {
      let present = 0, late = 0, leave = 0, scheduledDays = 0, absent = 0;
      let totalLate = 0, totalWorked = 0;
      for (const day of days) {
        const hasShift = shiftMap[s.id]?.has(day.ymd) || false;
        const isDayOff = hasShift ? false : (schedMap[s.id]?.[day.dow] ?? false);
        if (!isDayOff) scheduledDays++;
        const rec = recMap[s.id]?.[day.ymd];
        if (rec) {
          if (rec.status === 'late') late++;
          else if (rec.status === 'leave') leave++;
          else if (rec.status === 'absent') absent++;
          else present++;
          totalLate += rec.lateMinutes || 0;
          totalWorked += rec.workedMinutes || 0;
        } else if (!isDayOff) {
          absent++;
        }
      }
      const attended = present + late;
      return {
        staffId: s.id, name: s.name, role: s.role,
        branchName: s.branch?.name || '-',
        scheduledDays, present, late, leave, absent,
        attendedDays: attended,
        totalLateMinutes: totalLate,
        totalWorkedMinutes: totalWorked,
        avgWorkedMinutes: attended > 0 ? Math.round(totalWorked / attended) : 0,
      };
    });

    res.json({ success: true, data: { period: { startDate, endDate }, rows } });
  } catch (err) { next(err); }
});

// GET /api/attendance/schedules — daftar staf + jadwal kerja mingguan
router.get('/schedules', requireAdmin, async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const staff = await prisma.user.findMany({
      where: { tenantId, role: { in: ['kasir', 'barber'] }, deletedAt: null },
      select: { id: true, name: true, role: true, branchId: true, branch: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    const schedules = await prisma.workSchedule.findMany({
      where: { staffId: { in: staff.map((s) => s.id) } },
    });
    const byStaff = {};
    schedules.forEach((s) => { (byStaff[s.staffId] ||= {})[s.dayOfWeek] = s; });

    const data = staff.map((s) => ({
      staffId: s.id, name: s.name, role: s.role,
      branchId: s.branchId, branchName: s.branch?.name || null,
      schedule: Array.from({ length: 7 }, (_, dow) => {
        const r = byStaff[s.id]?.[dow];
        return {
          dayOfWeek: dow,
          isDayOff:  r ? r.isDayOff : SCHEDULE_DEFAULT.isDayOff,
          startTime: r ? r.startTime : SCHEDULE_DEFAULT.startTime,
          endTime:   r ? r.endTime : SCHEDULE_DEFAULT.endTime,
        };
      }),
    }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

const scheduleSchema = z.object({
  days: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    isDayOff:  z.boolean(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Jam tidak valid'),
    endTime:   z.string().regex(/^\d{2}:\d{2}$/, 'Jam tidak valid'),
  })).min(1).max(7),
});

// POST /api/attendance/schedules/bulk — terapkan satu jadwal ke semua staf
router.post('/schedules/bulk', requireAdmin, async (req, res, next) => {
  try {
    const { days } = scheduleSchema.parse(req.body);
    const tenantId = resolveTenantId(req, true);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const staff = await prisma.user.findMany({
      where: { tenantId, role: { in: ['kasir', 'barber'] }, deletedAt: null },
      select: { id: true },
    });
    if (staff.length === 0) {
      return res.status(404).json({ success: false, error: 'Belum ada staf kasir/barber' });
    }

    await prisma.$transaction(
      staff.flatMap((s) =>
        days.map((d) =>
          prisma.workSchedule.upsert({
            where:  { staffId_dayOfWeek: { staffId: s.id, dayOfWeek: d.dayOfWeek } },
            create: { tenantId, staffId: s.id, dayOfWeek: d.dayOfWeek, isDayOff: d.isDayOff, startTime: d.startTime, endTime: d.endTime },
            update: { isDayOff: d.isDayOff, startTime: d.startTime, endTime: d.endTime },
          }),
        ),
      ),
    );

    await recordAudit(req, {
      action: 'attendance.schedule_bulk',
      target: `tenant:${tenantId}`,
      detail: `Jadwal kerja diterapkan ke ${staff.length} staf`,
      severity: 'info',
    });
    emitAttendance('attendance:schedule_changed', { staffId: null }, tenantId);
    res.json({ success: true, data: { staffCount: staff.length } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// PUT /api/attendance/schedules/:staffId — atur jadwal kerja mingguan satu staf
router.put('/schedules/:staffId', requireAdmin, async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const { days } = scheduleSchema.parse(req.body);
    const tenantId = resolveTenantId(req, true);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const staff = await prisma.user.findFirst({
      where: { id: staffId, tenantId, role: { in: ['kasir', 'barber'] } },
      select: { id: true, name: true },
    });
    if (!staff) return res.status(404).json({ success: false, error: 'Staf tidak ditemukan' });

    await prisma.$transaction(
      days.map((d) =>
        prisma.workSchedule.upsert({
          where:  { staffId_dayOfWeek: { staffId, dayOfWeek: d.dayOfWeek } },
          create: { tenantId, staffId, dayOfWeek: d.dayOfWeek, isDayOff: d.isDayOff, startTime: d.startTime, endTime: d.endTime },
          update: { isDayOff: d.isDayOff, startTime: d.startTime, endTime: d.endTime },
        }),
      ),
    );

    await recordAudit(req, {
      action: 'attendance.schedule_update',
      target: `user:${staffId}`,
      detail: `Jadwal kerja ${staff.name} diperbarui`,
      severity: 'info',
    });
    emitAttendance('attendance:schedule_changed', { staffId }, tenantId);
    res.json({ success: true, data: { staffId } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

const manualSchema = z.object({
  staffId: z.string().min(1),
  date:    calendarDate,
  status:  z.enum(['present', 'absent', 'leave']),
  note:    z.string().trim().max(300).nullable().optional(),
});

// POST /api/attendance/manual — admin catat izin/cuti/alpa secara manual
router.post('/manual', requireAdmin, async (req, res, next) => {
  try {
    const body = manualSchema.parse(req.body);
    const tenantId = resolveTenantId(req, true);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const staff = await prisma.user.findFirst({
      where: { id: body.staffId, tenantId, role: { in: ['kasir', 'barber'] } },
      select: { id: true, name: true, role: true, branchId: true },
    });
    if (!staff) return res.status(404).json({ success: false, error: 'Staf tidak ditemukan' });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { timezone: true } });
    const date = tenantDayStart(body.date, tenant?.timezone || 'Asia/Jakarta');

    const data = {
      tenantId, branchId: staff.branchId, staffId: staff.id,
      staffName: staff.name, staffRole: staff.role, date,
      status: body.status, note: body.note ?? null,
      lateMinutes: 0, earlyLeaveMinutes: 0,
    };
    const record = await prisma.attendance.upsert({
      where: { staffId_date: { staffId: staff.id, date } },
      create: data,
      update: { status: body.status, note: body.note ?? null },
      select: attendanceSelect,
    });

    await recordAudit(req, {
      action: 'attendance.manual',
      target: `attendance:${record.id}`,
      detail: `${staff.name}: tandai ${body.status} (${body.date})`,
      severity: 'info',
    });
    emitAttendance('attendance:changed', { id: record.id, staffId: staff.id }, tenantId);
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

const patchSchema = z.object({
  status: z.enum(STATUSES).optional(),
  note:   z.string().trim().max(300).nullable().optional(),
});

// PATCH /api/attendance/:id — admin koreksi status/catatan satu absen
router.patch('/:id', requireAdmin, async (req, res, next) => {
  try {
    const body = patchSchema.parse(req.body);
    const existing = await prisma.attendance.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Catatan absensi tidak ditemukan' });
    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Akses ditolak' });
    }
    const data = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.note !== undefined)   data.note = body.note ?? null;

    const record = await prisma.attendance.update({
      where: { id: req.params.id }, data, select: attendanceSelect,
    });
    await recordAudit(req, {
      action: 'attendance.update',
      target: `attendance:${record.id}`,
      detail: `Koreksi absensi ${record.staffName || ''} (${Object.keys(data).join(',')})`,
      severity: 'info',
    });
    emitAttendance('attendance:changed', { id: record.id, staffId: record.staffId }, record.tenantId);
    res.json({ success: true, data: record });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

module.exports = router;
