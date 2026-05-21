const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { buildTenantDateRange, formatYmdInTz, normalizeTimezone, tenantDayStart, DEFAULT_TZ } = require('../utils/timezone');

const dateRangeSchema = z.object({
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  branchId: z.string().optional(),
  tenantId: z.string().optional(),
});

// Resolve TZ for the query — if tenantId is provided, look up tenant's timezone.
async function resolveTenantTz(tenantId) {
  if (!tenantId) return DEFAULT_TZ;
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { timezone: true },
  });
  return normalizeTimezone(t?.timezone);
}

function buildDateRange(startDate, endDate, tz = DEFAULT_TZ) {
  return buildTenantDateRange(startDate, endDate, tz);
}

// ── Calendar-period helpers (laporan wilayah) ──────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');

// Geser string "YYYY-MM-DD" sebanyak N hari (N bisa negatif).
function shiftYmd(ymd, days) {
  const dt = new Date(`${ymd}T00:00:00.000Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Tanggal-1 dari bulan (year, month 1-12) yang digeser N bulan.
function firstOfMonthShifted(year, month, deltaMonths) {
  const idx = year * 12 + (month - 1) + deltaMonths;
  return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}-01`;
}

const WILAYAH_PERIODS = ['yesterday', 'today', 'month', 'year', 'all'];

// Resolve periode kalender (TZ tenant) → { curStart, curEnd, prevStart, prevEnd }.
// Range half-open [start, end). Untuk 'all' semua null (tanpa filter & pembanding).
function resolveWilayahPeriod(period, tz) {
  const todayYmd = formatYmdInTz(new Date(), tz);
  const [y, m] = todayYmd.split('-').map(Number);
  const ds = (ymd) => tenantDayStart(ymd, tz);
  let curStart = null, curEnd = null, prevStart = null, prevEnd = null;

  if (period === 'today') {
    curStart  = ds(todayYmd);
    curEnd    = ds(shiftYmd(todayYmd, 1));
    prevStart = ds(shiftYmd(todayYmd, -1));
    prevEnd   = curStart;
  } else if (period === 'yesterday') {
    curStart  = ds(shiftYmd(todayYmd, -1));
    curEnd    = ds(todayYmd);
    prevStart = ds(shiftYmd(todayYmd, -2));
    prevEnd   = curStart;
  } else if (period === 'month') {
    curStart  = ds(firstOfMonthShifted(y, m, 0));
    curEnd    = ds(firstOfMonthShifted(y, m, 1));
    prevStart = ds(firstOfMonthShifted(y, m, -1));
    prevEnd   = curStart;
  } else if (period === 'year') {
    curStart  = ds(`${y}-01-01`);
    curEnd    = ds(`${y + 1}-01-01`);
    prevStart = ds(`${y - 1}-01-01`);
    prevEnd   = curStart;
  }
  return { curStart, curEnd, prevStart, prevEnd };
}

// Resolve branchId aman: kalau dipassing tapi bukan milik tenant ybs → ignore
// (return null) supaya query tidak nge-leak data lintas tenant.
async function resolveBranchId(branchId, tenantId) {
  if (!branchId || !tenantId) return branchId || null;
  const b = await prisma.branch.findFirst({
    where: { id: branchId, tenantId, deletedAt: null },
    select: { id: true },
  });
  return b ? branchId : null;
}

// GET /api/reports/summary - overall summary stats
router.get('/summary', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const parsed = dateRangeSchema.safeParse(req.query);
    const now = new Date();
    const startDate = parsed.success ? req.query.startDate : new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endDate = parsed.success ? req.query.endDate : now.toISOString();
    const tenantId = req.user.role === 'super_admin' ? req.query.tenantId : req.user.tenantId;
    const branchId = await resolveBranchId(req.query.branchId, tenantId);
    const tz = await resolveTenantTz(tenantId);

    const txWhere = {
      status: 'completed',
      createdAt: buildDateRange(startDate, endDate, tz),
    };
    if (tenantId) txWhere.tenantId = tenantId;
    if (branchId) txWhere.branchId = branchId;

    const [
      totalRevenue,
      totalTransactions,
      totalCustomers,
      totalNewCustomers,
      topServices,
      revenueByBranch,
      revenueByPaymentMethod,
    ] = await Promise.all([
      // Total revenue
      prisma.transaction.aggregate({
        where: txWhere,
        _sum: { total: true },
      }),
      // Total transactions
      prisma.transaction.count({ where: txWhere }),
      // Total customers
      prisma.customer.count({
        where: {
          deletedAt: null,
          ...(tenantId ? { tenantId } : {}),
        },
      }),
      // New customers in period
      prisma.customer.count({
        where: {
          deletedAt: null,
          createdAt: buildDateRange(startDate, endDate, tz),
          ...(tenantId ? { tenantId } : {}),
        },
      }),
      // Top services by revenue
      prisma.transactionItem.groupBy({
        by: ['serviceId', 'name'],
        where: {
          transaction: txWhere,
        },
        _sum: { price: true },
        _count: { id: true },
        orderBy: { _sum: { price: 'desc' } },
        take: 10,
      }),
      // Revenue by branch
      prisma.transaction.groupBy({
        by: ['branchId'],
        where: txWhere,
        _sum: { total: true },
        _count: { id: true },
        orderBy: { _sum: { total: 'desc' } },
      }),
      // Revenue by payment method
      prisma.transaction.groupBy({
        by: ['paymentMethod'],
        where: txWhere,
        _sum: { total: true },
        _count: { id: true },
      }),
    ]);

    // Enrich branch data with names
    const branchIds = revenueByBranch.map((b) => b.branchId);
    const branches = await prisma.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true },
    });
    const branchMap = {};
    branches.forEach((b) => { branchMap[b.id] = b.name; });

    res.json({
      success: true,
      data: {
        period: { startDate, endDate },
        summary: {
          totalRevenue: totalRevenue._sum.total || 0,
          totalTransactions,
          totalCustomers,
          totalNewCustomers,
          averageTransactionValue:
            totalTransactions > 0
              ? Math.floor((totalRevenue._sum.total || 0) / totalTransactions)
              : 0,
        },
        topServices: topServices.map((s) => ({
          serviceId: s.serviceId,
          name: s.name,
          revenue: s._sum.price || 0,
          count: s._count.id,
        })),
        revenueByBranch: revenueByBranch.map((b) => ({
          branchId: b.branchId,
          branchName: branchMap[b.branchId] || 'Unknown',
          revenue: b._sum.total || 0,
          transactions: b._count.id,
        })),
        revenueByPaymentMethod: revenueByPaymentMethod.map((p) => ({
          method: p.paymentMethod,
          revenue: p._sum.total || 0,
          count: p._count.id,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/daily - daily revenue breakdown (grouped by tenant-local day)
router.get('/daily', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = req.user.role === 'super_admin' ? req.query.tenantId : req.user.tenantId;
    const branchId = await resolveBranchId(req.query.branchId, tenantId);
    const tz = await resolveTenantTz(tenantId);
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();

    const txWhere = {
      status: 'completed',
      createdAt: buildDateRange(startDate, endDate, tz),
    };
    if (tenantId) txWhere.tenantId = tenantId;
    if (branchId) txWhere.branchId = branchId;

    const transactions = await prisma.transaction.findMany({
      where: txWhere,
      select: { total: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by tenant-local YYYY-MM-DD (bukan UTC) supaya transaksi jam 23:30
    // Asia/Jakarta tidak nyebrang ke "hari berikutnya" UTC.
    const dailyMap = {};
    transactions.forEach((tx) => {
      const date = formatYmdInTz(tx.createdAt, tz);
      if (!dailyMap[date]) {
        dailyMap[date] = { date, revenue: 0, transactions: 0 };
      }
      dailyMap[date].revenue += tx.total;
      dailyMap[date].transactions += 1;
    });

    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    res.json({ success: true, data: daily, meta: { timezone: tz } });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/barbers - barber performance report
router.get('/barbers', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = req.user.role === 'super_admin' ? req.query.tenantId : req.user.tenantId;
    const branchId = await resolveBranchId(req.query.branchId, tenantId);
    const tz = await resolveTenantTz(tenantId);
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();

    const txWhere = {
      status: 'completed',
      createdAt: buildDateRange(startDate, endDate, tz),
    };
    if (tenantId) txWhere.tenantId = tenantId;
    if (branchId) txWhere.branchId = branchId;

    // Group transaction items by barber
    const barberStats = await prisma.transactionItem.groupBy({
      by: ['barberId'],
      where: {
        barberId: { not: null },
        transaction: txWhere,
      },
      _sum: { price: true },
      _count: { id: true },
    });

    // Get barber details
    const barberIds = barberStats.map((b) => b.barberId).filter(Boolean);
    const barbers = await prisma.user.findMany({
      where: { id: { in: barberIds } },
      select: { id: true, name: true, phone: true, commissionRate: true, salaryType: true, baseSalary: true },
    });
    const barberMap = {};
    barbers.forEach((b) => { barberMap[b.id] = b; });

    // Get ratings per barber
    const ratings = await prisma.barberRating.groupBy({
      by: ['barberId'],
      where: { barberId: { in: barberIds } },
      _avg: { rating: true },
      _count: { id: true },
    });
    const ratingMap = {};
    ratings.forEach((r) => { ratingMap[r.barberId] = r; });

    const result = barberStats.map((stat) => {
      const b = barberMap[stat.barberId] || {};
      const rate = b.commissionRate ?? 0.35;
      const salaryType = b.salaryType || 'commission';
      const revenue = stat._sum.price || 0;
      return {
        barberId: stat.barberId,
        barberName: b.name || 'Unknown',
        revenue,
        servicesCount: stat._count.id,
        // Rate, skema & komisi per barber — dipakai laporan & fitur "Gaji Barber".
        commissionRate: rate,
        salaryType,
        baseSalary: b.baseSalary || 0,
        // Barber skema 'fixed' (gaji pokok) tak memperoleh komisi → 0.
        commission: salaryType === 'fixed' ? 0 : Math.round(revenue * rate),
        averageRating: ratingMap[stat.barberId]?._avg.rating || null,
        totalRatings: ratingMap[stat.barberId]?._count.id || 0,
      };
    });

    result.sort((a, b) => b.revenue - a.revenue);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/customers - customer analytics
router.get('/customers', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = req.user.role === 'super_admin' ? req.query.tenantId : req.user.tenantId;
    const tz = await resolveTenantTz(tenantId);
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();

    const dateRange = buildDateRange(startDate, endDate, tz);

    const [
      topCustomers,
      newCustomersByPeriod,
      loyaltyDistribution,
    ] = await Promise.all([
      // Top customers by spend
      prisma.transaction.groupBy({
        by: ['customerId'],
        where: {
          status: 'completed',
          customerId: { not: null },
          createdAt: dateRange,
          ...(tenantId ? { tenantId } : {}),
        },
        _sum: { total: true },
        _count: { id: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 20,
      }),
      // New customers in period
      prisma.customer.findMany({
        where: {
          deletedAt: null,
          createdAt: dateRange,
          ...(tenantId ? { tenantId } : {}),
        },
        select: { id: true, name: true, createdAt: true, loyaltyPoints: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      // Loyalty point distribution buckets
      prisma.customer.groupBy({
        by: ['tenantId'],
        where: {
          deletedAt: null,
          ...(tenantId ? { tenantId } : {}),
        },
        _avg: { loyaltyPoints: true },
        _sum: { loyaltyPoints: true },
        _count: { id: true },
      }),
    ]);

    // Enrich top customers with names
    const customerIds = topCustomers.map((c) => c.customerId).filter(Boolean);
    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true, phone: true },
    });
    const customerMap = {};
    customers.forEach((c) => { customerMap[c.id] = c; });

    res.json({
      success: true,
      data: {
        topCustomers: topCustomers.map((c) => ({
          customerId: c.customerId,
          name: customerMap[c.customerId]?.name || 'Unknown',
          phone: customerMap[c.customerId]?.phone,
          totalSpend: c._sum.total || 0,
          visitCount: c._count.id,
        })),
        newCustomers: newCustomersByPeriod,
        loyaltyStats: loyaltyDistribution.map((l) => ({
          totalCustomers: l._count.id,
          averageLoyaltyPoints: Math.floor(l._avg.loyaltyPoints || 0),
          totalLoyaltyPoints: l._sum.loyaltyPoints || 0,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/services - service popularity report
// GET /api/reports/staff-payroll — daftar gaji staf (barber + kasir) periode
// untuk semua skema. Menyertakan staf TANPA transaksi (gaji pokok tetap
// dibayar). Kasir realistis hanya skema 'fixed' (tak punya omzet pribadi).
router.get('/staff-payroll', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = req.user.role === 'super_admin' ? req.query.tenantId : req.user.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const branchId = await resolveBranchId(req.query.branchId, tenantId);
    const tz = await resolveTenantTz(tenantId);
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();

    // Semua staf aktif (barber + kasir) — termasuk yang nol transaksi.
    const staff = await prisma.user.findMany({
      where: { tenantId, role: { in: ['barber', 'kasir'] }, deletedAt: null, isActive: true },
      select: { id: true, name: true, role: true, commissionRate: true, salaryType: true, baseSalary: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    if (staff.length === 0) return res.json({ success: true, data: [] });

    const txWhere = {
      status: 'completed',
      tenantId,
      createdAt: buildDateRange(startDate, endDate, tz),
    };
    if (branchId) txWhere.branchId = branchId;

    const stats = await prisma.transactionItem.groupBy({
      by: ['barberId'],
      where: { barberId: { in: staff.map(s => s.id) }, transaction: txWhere },
      _sum: { price: true },
      _count: { id: true },
    });
    const statMap = {};
    stats.forEach((s) => { statMap[s.barberId] = s; });

    // ── Integrasi absensi — rekap kehadiran periode per staf ────────────────
    // date Attendance bergranularitas hari; konversi rentang payroll ke hari.
    const attStartYmd = String(startDate).slice(0, 10);
    const attEndYmd   = String(endDate).slice(0, 10);
    const attRecords = await prisma.attendance.findMany({
      where: {
        tenantId,
        staffId: { in: staff.map((s) => s.id) },
        date: {
          gte: new Date(`${attStartYmd}T00:00:00.000Z`),
          lte: new Date(`${attEndYmd}T23:59:59.999Z`),
        },
      },
      select: { staffId: true, status: true, workedMinutes: true },
    });
    const attMap = {};
    attRecords.forEach((r) => {
      const a = (attMap[r.staffId] ||= { present: 0, late: 0, absent: 0, leave: 0, workedMinutes: 0 });
      if (r.status === 'late') a.late++;
      else if (r.status === 'absent') a.absent++;
      else if (r.status === 'leave') a.leave++;
      else a.present++;
      a.workedMinutes += r.workedMinutes || 0;
    });

    const data = staff.map((s) => {
      const revenue = statMap[s.id]?._sum.price || 0;
      const servicesCount = statMap[s.id]?._count.id || 0;
      const rate = s.commissionRate ?? 0.35;
      // Kasir tak punya omzet pribadi → selalu skema 'fixed'.
      const salaryType = s.role === 'kasir' ? 'fixed' : (s.salaryType || 'commission');
      // Komisi-only → baseSalary tak relevan; fixed → tak ada komisi.
      const baseSalary = salaryType === 'commission' ? 0 : (s.baseSalary || 0);
      const commission = salaryType === 'fixed' ? 0 : Math.round(revenue * rate);
      return {
        barberId: s.id,
        barberName: s.name,
        role: s.role,
        salaryType,
        revenue,
        servicesCount,
        commissionRate: rate,
        baseSalary,
        commission,
        pay: baseSalary + commission,
        attendance: attMap[s.id] || { present: 0, late: 0, absent: 0, leave: 0, workedMinutes: 0 },
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/services', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = req.user.role === 'super_admin' ? req.query.tenantId : req.user.tenantId;
    const branchId = await resolveBranchId(req.query.branchId, tenantId);
    const tz = await resolveTenantTz(tenantId);
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();

    const txWhere = {
      status: 'completed',
      createdAt: buildDateRange(startDate, endDate, tz),
    };
    if (tenantId) txWhere.tenantId = tenantId;
    if (branchId) txWhere.branchId = branchId;

    const serviceStats = await prisma.transactionItem.groupBy({
      by: ['serviceId', 'name'],
      where: { transaction: txWhere },
      _sum: { price: true },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 100,
    });

    res.json({
      success: true,
      data: serviceStats.map((s) => ({
        serviceId: s.serviceId,
        name: s.name,
        revenue: s._sum.price || 0,
        count: s._count.id,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/wilayah - kunjungan per kecamatan & kelurahan
router.get('/wilayah', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const { kabupatenId } = req.query;
    const period = WILAYAH_PERIODS.includes(req.query.period) ? req.query.period : 'month';
    const tenantId = req.user.role === 'super_admin' ? req.query.tenantId : req.user.tenantId;

    if (!kabupatenId) {
      return res.status(400).json({ success: false, error: 'kabupatenId is required' });
    }

    // Periode kalender dihitung di TZ tenant (Hari Ini / Kemarin / Bulan Ini / Tahun Ini).
    const tz = await resolveTenantTz(tenantId);
    const { curStart, curEnd, prevStart, prevEnd } = resolveWilayahPeriod(period, tz);

    const customerWhere = {
      deletedAt: null,
      address: { path: ['kabupatenId'], equals: kabupatenId },
      ...(tenantId ? { tenantId } : {}),
    };

    // Fetch customers + current-period transactions in one query
    const customers = await prisma.customer.findMany({
      where: customerWhere,
      select: {
        id: true,
        address: true,
        loyaltyPoints: true,
        transactions: {
          where: {
            status: 'completed',
            ...(curStart ? { createdAt: { gte: curStart, lt: curEnd } } : {}),
          },
          select: { id: true, total: true },
        },
      },
    });

    const customerIds = customers.map(c => c.id);

    // Fetch prev-period transaction totals grouped by customer (separate query, cleaner)
    let prevByCustomer = {};
    if (curStart && customerIds.length > 0) {
      const prevTxs = await prisma.transaction.findMany({
        where: {
          status: 'completed',
          customerId: { in: customerIds },
          createdAt: { gte: prevStart, lt: prevEnd },
        },
        select: { customerId: true, total: true },
      });
      prevTxs.forEach(t => {
        if (!prevByCustomer[t.customerId]) prevByCustomer[t.customerId] = { count: 0, revenue: 0 };
        prevByCustomer[t.customerId].count++;
        prevByCustomer[t.customerId].revenue += t.total;
      });
    }

    // Group by kecamatan → kelurahan
    const kecMap = {};

    customers.forEach(c => {
      const addr    = (c.address && typeof c.address === 'object') ? c.address : {};
      const kecId   = addr.kecamatanId || '__unknown__';
      const kecName = addr.kecamatan   || 'Tidak Diketahui';
      const kelId   = addr.kelurahanId || '__unknown__';
      const kelName = addr.kelurahan   || 'Tidak Diketahui';
      const txCount = c.transactions.length;
      const revenue = c.transactions.reduce((s, t) => s + t.total, 0);
      const prev    = prevByCustomer[c.id] || { count: 0, revenue: 0 };

      if (!kecMap[kecId]) {
        kecMap[kecId] = {
          kecamatanId: kecId,
          kecamatan: kecName,
          customerCount: 0,
          visitCount: 0,
          revenue: 0,
          prevVisitCount: 0,
          prevRevenue: 0,
          kelurahan: {},
        };
      }
      const kec = kecMap[kecId];
      kec.customerCount++;
      kec.visitCount     += txCount;
      kec.revenue        += revenue;
      kec.prevVisitCount += prev.count;
      kec.prevRevenue    += prev.revenue;

      if (!kec.kelurahan[kelId]) {
        kec.kelurahan[kelId] = { kelurahanId: kelId, kelurahan: kelName, customerCount: 0, visitCount: 0, revenue: 0 };
      }
      kec.kelurahan[kelId].customerCount++;
      kec.kelurahan[kelId].visitCount += txCount;
      kec.kelurahan[kelId].revenue    += revenue;
    });

    const totalCustomers = customers.length;
    const totalVisits    = customers.reduce((s, c) => s + c.transactions.length, 0);
    const totalRevenue   = customers.reduce((s, c) => s + c.transactions.reduce((ss, t) => ss + t.total, 0), 0);
    const prevVisits     = Object.values(prevByCustomer).reduce((s, v) => s + v.count, 0);
    const prevRevenue    = Object.values(prevByCustomer).reduce((s, v) => s + v.revenue, 0);

    const byKecamatan = Object.values(kecMap)
      .map(k => ({
        kecamatanId:         k.kecamatanId,
        kecamatan:           k.kecamatan,
        customerCount:       k.customerCount,
        visitCount:          k.visitCount,
        revenue:             k.revenue,
        prevVisitCount:      k.prevVisitCount,
        prevRevenue:         k.prevRevenue,
        avgVisitPerCustomer: k.customerCount > 0 ? +(k.visitCount / k.customerCount).toFixed(1) : 0,
        kelurahan: Object.values(k.kelurahan)
          .sort((a, b) => b.visitCount - a.visitCount)
          .map(kel => ({
            ...kel,
            avgVisitPerCustomer: kel.customerCount > 0 ? +(kel.visitCount / kel.customerCount).toFixed(1) : 0,
          })),
      }))
      .sort((a, b) => b.visitCount - a.visitCount);

    res.json({
      success: true,
      data: {
        period,
        timezone: tz,
        summary: {
          totalCustomers,
          totalVisits,
          totalRevenue,
          prevVisits,
          prevRevenue,
          kecamatanCount:      byKecamatan.length,
          avgVisitPerCustomer: totalCustomers > 0 ? +(totalVisits / totalCustomers).toFixed(1) : 0,
        },
        byKecamatan,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/tenants - SA only, overview of all tenants
router.get('/tenants', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();

    const [tenants, revenueByTenant] = await Promise.all([
      prisma.tenant.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          isSuspended: true,
          createdAt: true,
          subscription: { select: { package: true, status: true, endDate: true } },
          // Hanya hitung yang belum di-soft-delete agar konsisten dengan daftar.
          _count: { select: { branches: { where: { deletedAt: null } }, users: { where: { deletedAt: null } }, customers: { where: { deletedAt: null } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.transaction.groupBy({
        by: ['tenantId'],
        where: {
          status: 'completed',
          createdAt: buildDateRange(startDate, endDate),
        },
        _sum: { total: true },
        _count: { id: true },
      }),
    ]);

    const revenueMap = {};
    revenueByTenant.forEach((r) => {
      revenueMap[r.tenantId] = { revenue: r._sum.total || 0, transactions: r._count.id };
    });

    const result = tenants.map((t) => ({
      ...t,
      periodRevenue: revenueMap[t.id]?.revenue || 0,
      periodTransactions: revenueMap[t.id]?.transactions || 0,
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
