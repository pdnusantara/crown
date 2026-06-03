const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { formatYmdInTz, normalizeTimezone, DEFAULT_TZ } = require('../utils/timezone');

// Single source of truth for available feature flags — kept in sync with
// `featureFlags.js` route. Keep the IDs identical so adoption calculation
// matches the toggle UI in /super-admin/feature-flags.
const AVAILABLE_FLAGS = [
  { id: 'pos',              label: 'POS Kasir',               category: 'Core' },
  { id: 'booking',          label: 'Booking Online',          category: 'Core' },
  { id: 'loyalty',          label: 'Loyalty Program',         category: 'Core' },
  { id: 'voucher',          label: 'Voucher & Promo',         category: 'Core' },
  { id: 'queue',            label: 'Manajemen Antrian',       category: 'Core' },
  { id: 'reports',          label: 'Laporan Lanjutan',        category: 'Analytics' },
  { id: 'heatmap',          label: 'Heatmap Jam Sibuk',       category: 'Analytics' },
  { id: 'clv',              label: 'Customer CLV',            category: 'Analytics' },
  { id: 'wilayah_report',   label: 'Laporan Wilayah',         category: 'Analytics' },
  { id: 'schedule',         label: 'Jadwal Shift',            category: 'Operations' },
  { id: 'multi_branch',     label: 'Multi-Cabang',            category: 'Operations' },
  { id: 'expense_tracking', label: 'Manajemen Pengeluaran',   category: 'Operations' },
  { id: 'pwa',              label: 'Install Aplikasi',        category: 'UX' },
  { id: 'whatsapp',         label: 'Struk WhatsApp',          category: 'UX' },
  { id: 'barber_rating',    label: 'Rating Barber',           category: 'UX' },
  { id: 'api_access',       label: 'API Access',              category: 'Enterprise' },
  { id: 'backup',           label: 'Backup & Restore',        category: 'Enterprise' },
];

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
  tz:   z.string().optional(),
});

// Build the chronological list of YYYY-MM-DD keys in the given timezone for
// the last N days (inclusive of today). Frontend uses these keys to render
// per-day bars even when no activity occurred on a given day.
function buildDayWindow(days, tz) {
  const out = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    out.push(formatYmdInTz(d, tz));
  }
  return out;
}

// GET /api/super-admin/usage — aggregated platform-wide analytics
router.get('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { days, tz: tzParam } = querySchema.parse(req.query);
    const tz = normalizeTimezone(tzParam || DEFAULT_TZ);

    const windowDays = buildDayWindow(days, tz);
    const windowStartYmd = windowDays[0];
    const windowEndYmd   = windowDays[windowDays.length - 1];
    // Use a generous UTC window that always covers the requested local-day
    // range regardless of TZ offset (±1 day padding).
    const windowStartUtc = new Date(`${windowStartYmd}T00:00:00.000Z`);
    windowStartUtc.setUTCDate(windowStartUtc.getUTCDate() - 1);
    const windowEndUtc = new Date(`${windowEndYmd}T23:59:59.999Z`);
    windowEndUtc.setUTCDate(windowEndUtc.getUTCDate() + 1);

    const [
      tenants,
      tenantFlagsRaw,
      refreshTokens,
      transactions,
      bookings,
    ] = await Promise.all([
      prisma.tenant.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          slug: true,
          timezone: true,
          isSuspended: true,
          subscription: { select: { package: true, status: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.tenantFeatureFlag.findMany({
        where: { enabled: true },
        select: { tenantId: true, flagId: true },
      }),
      // Each refresh token issuance == a session start (login or token refresh).
      prisma.refreshToken.findMany({
        where: { createdAt: { gte: windowStartUtc, lte: windowEndUtc } },
        select: { userId: true, createdAt: true, user: { select: { tenantId: true } } },
      }),
      prisma.transaction.findMany({
        where: {
          status: 'completed',
          createdAt: { gte: windowStartUtc, lte: windowEndUtc },
        },
        select: { tenantId: true, createdAt: true, total: true },
      }),
      prisma.booking.findMany({
        where: { createdAt: { gte: windowStartUtc, lte: windowEndUtc } },
        select: { tenantId: true, createdAt: true },
      }),
    ]);

    // ── Tenant index ─────────────────────────────────────────────────────────
    const tenantIds = tenants.map(t => t.id);
    const tenantById = new Map(tenants.map(t => [t.id, t]));

    // ── DAU per tenant per day (distinct userId) ────────────────────────────
    const dauSets = new Map();   // tenantId → Map<ymd, Set<userId>>
    const sessionCounts = new Map(); // tenantId → number
    for (const tok of refreshTokens) {
      const tenantId = tok.user?.tenantId;
      if (!tenantId || !tenantIds.includes(tenantId)) continue;
      const tenant = tenantById.get(tenantId);
      const ymd = formatYmdInTz(tok.createdAt, tenant.timezone || tz);
      if (!dauSets.has(tenantId)) dauSets.set(tenantId, new Map());
      const perDay = dauSets.get(tenantId);
      if (!perDay.has(ymd)) perDay.set(ymd, new Set());
      perDay.get(ymd).add(tok.userId);
      sessionCounts.set(tenantId, (sessionCounts.get(tenantId) || 0) + 1);
    }

    // ── Transactions / bookings per tenant per day (activity proxy) ─────────
    const txByTenantDay = new Map();    // tenantId → Map<ymd, count>
    const txTotalByTenant = new Map();
    const txRevenueByTenant = new Map();
    for (const tx of transactions) {
      const tenant = tenantById.get(tx.tenantId);
      if (!tenant) continue;
      const ymd = formatYmdInTz(tx.createdAt, tenant.timezone || tz);
      if (!txByTenantDay.has(tx.tenantId)) txByTenantDay.set(tx.tenantId, new Map());
      const perDay = txByTenantDay.get(tx.tenantId);
      perDay.set(ymd, (perDay.get(ymd) || 0) + 1);
      txTotalByTenant.set(tx.tenantId, (txTotalByTenant.get(tx.tenantId) || 0) + 1);
      txRevenueByTenant.set(tx.tenantId, (txRevenueByTenant.get(tx.tenantId) || 0) + (tx.total || 0));
    }

    const bookingsByTenant = new Map();
    for (const b of bookings) {
      const tenant = tenantById.get(b.tenantId);
      if (!tenant) continue;
      bookingsByTenant.set(b.tenantId, (bookingsByTenant.get(b.tenantId) || 0) + 1);
    }

    // ── Feature flags grouped per tenant (top features list) ────────────────
    const flagsByTenant = new Map();
    const flagAdoption = new Map(); // flagId → tenantCount enabled
    for (const tf of tenantFlagsRaw) {
      if (!flagsByTenant.has(tf.tenantId)) flagsByTenant.set(tf.tenantId, []);
      flagsByTenant.get(tf.tenantId).push(tf.flagId);
      flagAdoption.set(tf.flagId, (flagAdoption.get(tf.flagId) || 0) + 1);
    }

    // ── Per-tenant payload ──────────────────────────────────────────────────
    const tenantUsage = tenants.map(t => {
      const perDay = dauSets.get(t.id) || new Map();
      const txDay = txByTenantDay.get(t.id) || new Map();
      const tenantWindow = buildDayWindow(days, t.timezone || tz);
      const dau = tenantWindow.map(ymd => ({
        day: ymd,
        value: perDay.get(ymd)?.size || 0,
        transactions: txDay.get(ymd) || 0,
      }));
      const sessions = sessionCounts.get(t.id) || 0;
      const totalDauUnique = new Set();
      for (const set of perDay.values()) for (const id of set) totalDauUnique.add(id);
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        timezone: t.timezone || tz,
        package: t.subscription?.package || null,
        suspended: t.isSuspended,
        dau,
        uniqueUsers: totalDauUnique.size,
        sessions,
        transactions: txTotalByTenant.get(t.id) || 0,
        revenue: txRevenueByTenant.get(t.id) || 0,
        bookings: bookingsByTenant.get(t.id) || 0,
        topFeatures: (flagsByTenant.get(t.id) || []).slice(0, 6),
        activeFeatureCount: (flagsByTenant.get(t.id) || []).length,
      };
    });

    // ── Platform totals (today = last bucket of platform window) ────────────
    const todayYmd = windowDays[windowDays.length - 1];
    const dauTodaySet = new Set();
    for (const t of tenants) {
      const ymd = formatYmdInTz(new Date(), t.timezone || tz);
      const set = dauSets.get(t.id)?.get(ymd);
      if (set) for (const id of set) dauTodaySet.add(id);
    }
    const totalSessions = Array.from(sessionCounts.values()).reduce((s, n) => s + n, 0);
    const totalTransactions = transactions.length;

    // ── Feature adoption percentages ────────────────────────────────────────
    const tenantTotal = tenants.length || 1;
    const featureAdoption = AVAILABLE_FLAGS.map(f => ({
      flagId: f.id,
      label: f.label,
      category: f.category,
      enabledCount: flagAdoption.get(f.id) || 0,
      tenantTotal: tenants.length,
      percent: Math.round(((flagAdoption.get(f.id) || 0) / tenantTotal) * 100),
    })).sort((a, b) => b.percent - a.percent);

    res.json({
      success: true,
      data: {
        meta: {
          tz,
          days,
          windowStart: windowDays[0],
          windowEnd:   windowDays[windowDays.length - 1],
          generatedAt: new Date().toISOString(),
        },
        kpi: {
          tenantCount: tenants.length,
          activeTenants: tenants.filter(t => !t.isSuspended).length,
          dauToday: dauTodaySet.size,
          sessions: totalSessions,
          transactions: totalTransactions,
          featuresHighAdoption: featureAdoption.filter(f => f.percent >= 50).length,
          featuresTotal: AVAILABLE_FLAGS.length,
        },
        tenants: tenantUsage,
        featureAdoption,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
