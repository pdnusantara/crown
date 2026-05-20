// =============================================================================
// Shop Ratings API — rating "barbershop" overall yang diisi pelanggan via
// halaman publik /rating/:transactionId. Read-only untuk admin/kasir/barber
// (tidak ada submit dari sini — submit hanya via public route).
//
// Role scoping:
// - tenant_admin / super_admin → semua data tenant
// - kasir                       → hanya branch milik kasir (req.user.branchId)
// - barber                      → hanya rating dari transaksi yang barbernya
//                                 melayani (gabung lewat TransactionItem)
// =============================================================================

const router = require('express').Router();
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

const MAX_LIMIT     = 200;
const DEFAULT_LIMIT = 50;

function resolveTenantId(req) {
  if (req.user.role === 'super_admin') {
    return req.query?.tenantId || null;
  }
  return req.user.tenantId;
}

function parseLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, n);
}

async function buildWhere(req, tenantId) {
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  if (req.query.branchId) where.branchId = String(req.query.branchId);
  if (req.query.minRating) where.rating = { ...(where.rating || {}), gte: Number(req.query.minRating) };
  if (req.query.maxRating) where.rating = { ...(where.rating || {}), lte: Number(req.query.maxRating) };
  if (req.query.hasComment === 'true')  where.comment = { not: null };
  if (req.query.hasComment === 'false') where.comment = null;

  const dateFilter = {};
  if (req.query.startDate) dateFilter.gte = new Date(req.query.startDate);
  if (req.query.endDate) {
    const d = new Date(req.query.endDate);
    d.setHours(23, 59, 59, 999);
    dateFilter.lte = d;
  }
  if (Object.keys(dateFilter).length) where.createdAt = dateFilter;

  // Role-based scoping
  if (req.user.role === 'kasir') {
    // Kasir hanya boleh lihat rating cabang dia.
    if (!req.user.branchId) return null;
    where.branchId = req.user.branchId;
  } else if (req.user.role === 'barber') {
    // Barber hanya boleh lihat rating dari transaksi di mana dia melayani.
    // Cari transactionId yang itemnya punya barberId = req.user.id.
    const txs = await prisma.transactionItem.findMany({
      where: { barberId: req.user.id },
      select: { transactionId: true },
      distinct: ['transactionId'],
      take: 5000,
    });
    const txIds = txs.map(t => t.transactionId);
    if (txIds.length === 0) return { _empty: true };
    where.transactionId = { in: txIds };
  }
  return where;
}

// GET /api/shop-ratings — list dengan cursor pagination
router.get('/', authenticate, async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const where = await buildWhere(req, tenantId);
    if (where?._empty) {
      return res.json({ success: true, data: [], meta: { hasMore: false, nextCursor: null, total: 0 } });
    }
    if (!where) return res.status(400).json({ success: false, error: 'Branch tidak tersedia' });

    const limit = parseLimit(req.query.limit);
    const cursor = req.query.cursor ? { id: String(req.query.cursor) } : undefined;

    const items = await prisma.shopRating.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        transactionId: true,
        customerId: true,
        rating: true,
        comment: true,
        createdAt: true,
      },
    });

    const hasMore = items.length > limit;
    const slice   = hasMore ? items.slice(0, limit) : items;

    // Enrich dengan info branch + transaksi (tanggal, customerName).
    const branchIds = [...new Set(slice.map(r => r.branchId).filter(Boolean))];
    const txIds     = [...new Set(slice.map(r => r.transactionId).filter(Boolean))];
    const [branches, transactions] = await Promise.all([
      branchIds.length
        ? prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } })
        : [],
      txIds.length
        ? prisma.transaction.findMany({
            where: { id: { in: txIds } },
            select: { id: true, customerName: true, total: true, createdAt: true },
          })
        : [],
    ]);
    const branchMap = Object.fromEntries(branches.map(b => [b.id, b]));
    const txMap     = Object.fromEntries(transactions.map(t => [t.id, t]));

    const enriched = slice.map(r => ({
      ...r,
      branch: branchMap[r.branchId] || null,
      transaction: txMap[r.transactionId] || null,
    }));

    res.json({
      success: true,
      data: enriched,
      meta: { hasMore, nextCursor: hasMore ? slice[slice.length - 1].id : null },
    });
  } catch (err) { next(err); }
});

// GET /api/shop-ratings/stats — KPI aggregat (avg, total, distribution)
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const where = await buildWhere(req, tenantId);
    if (where?._empty) {
      return res.json({ success: true, data: { total: 0, avg: 0, distribution: {}, withComment: 0 } });
    }
    if (!where) return res.status(400).json({ success: false, error: 'Branch tidak tersedia' });

    const [total, agg, distribution, withComment] = await Promise.all([
      prisma.shopRating.count({ where }),
      prisma.shopRating.aggregate({ where, _avg: { rating: true } }),
      prisma.shopRating.groupBy({ by: ['rating'], where, _count: { id: true } }),
      prisma.shopRating.count({ where: { ...where, comment: { not: null } } }),
    ]);

    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of distribution) dist[row.rating] = row._count.id;

    res.json({
      success: true,
      data: {
        total,
        avg: Number((agg._avg.rating || 0).toFixed(2)),
        distribution: dist,
        withComment,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
