const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

const dateRangeSchema = z.object({
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  branchId: z.string().optional(),
  tenantId: z.string().optional(),
});

function buildDateRange(startDate, endDate) {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  return { gte: start, lte: end };
}

// GET /api/reports/summary - overall summary stats
router.get('/summary', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const parsed = dateRangeSchema.safeParse(req.query);
    const now = new Date();
    const startDate = parsed.success ? req.query.startDate : new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endDate = parsed.success ? req.query.endDate : now.toISOString();
    const branchId = req.query.branchId;

    const tenantId = req.user.role === 'super_admin' ? req.query.tenantId : req.user.tenantId;

    const txWhere = {
      status: 'completed',
      createdAt: buildDateRange(startDate, endDate),
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
          createdAt: buildDateRange(startDate, endDate),
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

// GET /api/reports/daily - daily revenue breakdown
router.get('/daily', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const branchId = req.query.branchId;
    const tenantId = req.user.role === 'super_admin' ? req.query.tenantId : req.user.tenantId;
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();

    const txWhere = {
      status: 'completed',
      createdAt: buildDateRange(startDate, endDate),
    };
    if (tenantId) txWhere.tenantId = tenantId;
    if (branchId) txWhere.branchId = branchId;

    const transactions = await prisma.transaction.findMany({
      where: txWhere,
      select: { total: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const dailyMap = {};
    transactions.forEach((tx) => {
      const date = tx.createdAt.toISOString().split('T')[0];
      if (!dailyMap[date]) {
        dailyMap[date] = { date, revenue: 0, transactions: 0 };
      }
      dailyMap[date].revenue += tx.total;
      dailyMap[date].transactions += 1;
    });

    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    res.json({ success: true, data: daily });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/barbers - barber performance report
router.get('/barbers', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const branchId = req.query.branchId;
    const tenantId = req.user.role === 'super_admin' ? req.query.tenantId : req.user.tenantId;
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();

    const txWhere = {
      status: 'completed',
      createdAt: buildDateRange(startDate, endDate),
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
      select: { id: true, name: true, phone: true },
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

    const result = barberStats.map((stat) => ({
      barberId: stat.barberId,
      barberName: barberMap[stat.barberId]?.name || 'Unknown',
      revenue: stat._sum.price || 0,
      servicesCount: stat._count.id,
      averageRating: ratingMap[stat.barberId]?._avg.rating || null,
      totalRatings: ratingMap[stat.barberId]?._count.id || 0,
    }));

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
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();

    const dateRange = buildDateRange(startDate, endDate);

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
router.get('/services', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = req.user.role === 'super_admin' ? req.query.tenantId : req.user.tenantId;
    const branchId = req.query.branchId;
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = req.query.endDate || new Date().toISOString();

    const txWhere = {
      status: 'completed',
      createdAt: buildDateRange(startDate, endDate),
    };
    if (tenantId) txWhere.tenantId = tenantId;
    if (branchId) txWhere.branchId = branchId;

    const serviceStats = await prisma.transactionItem.groupBy({
      by: ['serviceId', 'name'],
      where: { transaction: txWhere },
      _sum: { price: true },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
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
    const { kabupatenId, period = '30d' } = req.query;
    const tenantId = req.user.role === 'super_admin' ? req.query.tenantId : req.user.tenantId;

    if (!kabupatenId) {
      return res.status(400).json({ success: false, error: 'kabupatenId is required' });
    }

    const now = new Date();
    let curStart = null;
    let prevStart = null;
    let prevEnd = null;

    if (period === '30d') {
      curStart  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      prevStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      prevEnd   = curStart;
    } else if (period === '90d') {
      curStart  = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      prevStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      prevEnd   = curStart;
    } else if (period === '1y') {
      curStart  = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      prevStart = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
      prevEnd   = curStart;
    }

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
            ...(curStart ? { createdAt: { gte: curStart } } : {}),
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
          _count: { select: { branches: true, users: true, customers: true } },
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
