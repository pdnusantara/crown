const router = require('express').Router();
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const {
  buildTenantDateRange,
  tenantDayStart,
  tenantDayEnd,
  formatYmdInTz,
  normalizeTimezone,
  DEFAULT_TZ,
} = require('../utils/timezone');

// Helper kalender (berbasis YYYY-MM-DD di TZ tenant, supaya batas hari/minggu/
// bulan konsisten dengan tampilan).
function addDaysYmd(ymd, n) {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function ymdWeekday(ymd) {
  // 0=Min ... 6=Sab
  return new Date(`${ymd}T00:00:00.000Z`).getUTCDay();
}

// Bentuk where dasar: hanya tenant aktif (belum di-soft-delete).
function baseWhere() {
  return { deletedAt: null };
}

// GET /api/super-admin/tenant-registrations — daftar pendaftaran (paginated)
router.get('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { channel, search, from, to } = req.query;
    const tz = normalizeTimezone(req.query.tz || DEFAULT_TZ);

    const where = baseWhere();
    if (from || to) where.createdAt = buildTenantDateRange(from, to, tz);
    if (channel) {
      if (channel === 'affiliate')      where.affiliateReferral = { isNot: null };
      else if (channel === 'unknown')   where.signupChannel = null;
      else                              where.signupChannel = channel;
    }
    if (search) where.OR = [
      { name:  { contains: search, mode: 'insensitive' } },
      { slug:  { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];

    const [rows, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, slug: true, email: true, phone: true,
          createdAt: true, signupChannel: true, signupMeta: true,
          subscription: { select: { status: true, package: true, endDate: true } },
          affiliateReferral: {
            select: {
              referralCode: true, source: true, status: true,
              affiliate: { select: { displayName: true, referralCode: true } },
            },
          },
        },
      }),
      prisma.tenant.count({ where }),
    ]);

    const data = rows.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      email: t.email,
      phone: t.phone,
      createdAt: t.createdAt,
      channel: t.signupChannel || 'unknown',
      meta: t.signupMeta || null,
      package: t.subscription?.package || null,
      subscriptionStatus: t.subscription?.status || null,
      affiliate: t.affiliateReferral
        ? {
            name: t.affiliateReferral.affiliate?.displayName || null,
            code: t.affiliateReferral.referralCode,
            source: t.affiliateReferral.source,
          }
        : null,
    }));

    return res.json(paginatedResponse(data, total, page, limit));
  } catch (err) { next(err); }
});

// GET /api/super-admin/tenant-registrations/stats — KPI + breakdown (TZ-aware)
router.get('/stats', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const tz = normalizeTimezone(req.query.tz || DEFAULT_TZ);
    const todayYmd = formatYmdInTz(new Date(), tz);
    const yYmd     = addDaysYmd(todayYmd, -1);
    const monthStartYmd = `${todayYmd.slice(0, 7)}-01`;
    // Minggu berjalan dimulai Senin.
    const dow = ymdWeekday(todayYmd);              // 0=Min..6=Sab
    const weekStartYmd = addDaysYmd(todayYmd, -((dow + 6) % 7));

    const countSince = (startYmd) =>
      prisma.tenant.count({ where: { ...baseWhere(), createdAt: { gte: tenantDayStart(startYmd, tz) } } });

    const [today, yesterday, thisWeek, thisMonth, total, affiliateCount, byChannelRaw] = await Promise.all([
      countSince(todayYmd),
      prisma.tenant.count({
        where: { ...baseWhere(), createdAt: { gte: tenantDayStart(yYmd, tz), lte: tenantDayEnd(yYmd, tz) } },
      }),
      countSince(weekStartYmd),
      countSince(monthStartYmd),
      prisma.tenant.count({ where: baseWhere() }),
      prisma.tenant.count({ where: { ...baseWhere(), affiliateReferral: { isNot: null } } }),
      prisma.tenant.groupBy({
        by: ['signupChannel'],
        where: baseWhere(),
        _count: { _all: true },
      }),
    ]);

    const byChannel = {};
    for (const row of byChannelRaw) {
      byChannel[row.signupChannel || 'unknown'] = row._count._all;
    }

    return res.json({
      success: true,
      data: {
        today, yesterday, thisWeek, thisMonth, total,
        affiliateCount,
        byChannel,
        tz,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
