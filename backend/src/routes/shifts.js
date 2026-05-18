const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { requireLicensedBranch } = require('../middleware/requireLicensedBranch');

const shiftSelect = {
  id: true,
  branchId: true,
  kasirId: true,
  kasirName: true,
  status: true,
  openedAt: true,
  closedAt: true,
  openingCash: true,
  closingCash: true,
  expectedCash: true,
  cashDifference: true,
  notes: true,
  totalRevenue: true,
  totalTransactions: true,
  branch: { select: { id: true, name: true } },
};

const openShiftSchema = z.object({
  branchId: z.string().min(1),
  openingCash: z.number().int().min(0).optional(),
  notes: z.string().max(500).optional(),
});

const closeShiftSchema = z.object({
  closingCash: z.number().int().min(0).optional(),
  notes: z.string().max(500).optional(),
});

// GET /api/shifts
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { branchId, status, kasirId, dateFrom, dateTo } = req.query;

    const where = {};

    if (req.user.role !== 'super_admin') {
      where.branch = { tenantId: req.user.tenantId };
    } else if (req.query.tenantId) {
      where.branch = { tenantId: req.query.tenantId };
    }

    // Kasir hanya bisa lihat shift miliknya. Tenant admin & super admin bisa lihat semua kasir.
    if (req.user.role === 'kasir') {
      where.kasirId = req.user.id;
      if (req.user.branchId) where.branchId = req.user.branchId;
    } else if (kasirId) {
      where.kasirId = kasirId;
    }

    if (branchId && req.user.role !== 'kasir') where.branchId = branchId;
    if (status) where.status = status;

    if (dateFrom || dateTo) {
      where.openedAt = {};
      if (dateFrom) where.openedAt.gte = new Date(`${dateFrom}T00:00:00`);
      if (dateTo) where.openedAt.lte = new Date(`${dateTo}T23:59:59`);
    }

    const [data, total] = await Promise.all([
      prisma.shift.findMany({
        where,
        select: {
          ...shiftSelect,
          _count: { select: { transactions: true } },
        },
        skip,
        take: limit,
        orderBy: { openedAt: 'desc' },
      }),
      prisma.shift.count({ where }),
    ]);

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// Pastikan branchId milik tenant pemanggil — defense-in-depth selain cek lisensi.
async function assertBranchOwnership(req, branchId) {
  if (req.user.role === 'super_admin') return true;
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { tenantId: true },
  });
  if (!branch || branch.tenantId !== req.user.tenantId) return false;
  if (req.user.role === 'kasir' && req.user.branchId && branchId !== req.user.branchId) return false;
  return true;
}

// GET /api/shifts/active - shift terbuka untuk kasir + branch saat ini
router.get('/active', authenticate, requireRole('kasir', 'tenant_admin', 'super_admin'), async (req, res, next) => {
  try {
    const where = { status: 'open' };
    // Tenant scope WAJIB — tanpa ini tenant_admin bisa query cabang tenant lain
    // dengan menebak ?branchId=.
    if (req.user.role !== 'super_admin') {
      where.branch = { tenantId: req.user.tenantId };
    } else if (req.query.tenantId) {
      where.branch = { tenantId: req.query.tenantId };
    }
    if (req.user.role === 'kasir') {
      where.kasirId = req.user.id;
      if (req.user.branchId) where.branchId = req.user.branchId;
    }
    if (req.query.branchId) where.branchId = req.query.branchId;

    const shift = await prisma.shift.findFirst({
      where,
      orderBy: { openedAt: 'desc' },
      select: {
        ...shiftSelect,
        _count: { select: { transactions: true } },
      },
    });

    res.json({ success: true, data: shift });
  } catch (err) {
    next(err);
  }
});

// Helper: hitung summary lengkap (payment breakdown, top services, barber performance) dari real transactions
async function buildShiftSummary(shiftId, tenantId) {
  const txns = await prisma.transaction.findMany({
    where: { shiftId, status: 'completed' },
    include: {
      items: {
        select: {
          id: true, name: true, price: true, barberId: true,
          service: { select: { id: true, name: true } },
        },
      },
      customer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Kumpulkan barber sekali untuk dapatkan commissionRate aktual per barber
  const barberIds = [...new Set(txns.flatMap(t => t.items.map(i => i.barberId).filter(Boolean)))];
  const barbers = barberIds.length
    ? await prisma.user.findMany({
        where: { id: { in: barberIds }, tenantId },
        select: { id: true, name: true, commissionRate: true },
      })
    : [];
  const barberMeta = Object.fromEntries(barbers.map(b => [b.id, b]));

  const paymentBreakdown = {
    cash:     { method: 'cash',     amount: 0, count: 0 },
    transfer: { method: 'transfer', amount: 0, count: 0 },
    qris:     { method: 'qris',     amount: 0, count: 0 },
    card:     { method: 'card',     amount: 0, count: 0 },
  };
  let totalRevenue = 0;
  let totalCash = 0;
  let totalDiscount = 0;
  let totalRefund = 0;

  const serviceMap = {};
  const barberMap = {};

  for (const t of txns) {
    const method = t.paymentMethod || 'cash';
    if (!paymentBreakdown[method]) {
      paymentBreakdown[method] = { method, amount: 0, count: 0 };
    }
    paymentBreakdown[method].amount += t.total || 0;
    paymentBreakdown[method].count += 1;
    totalRevenue += t.total || 0;
    totalDiscount += t.discountAmount || 0;
    if (method === 'cash') totalCash += t.total || 0;

    for (const it of t.items || []) {
      const sname = it.name || it.service?.name || 'Layanan';
      if (!serviceMap[sname]) serviceMap[sname] = { name: sname, count: 0, revenue: 0 };
      serviceMap[sname].count += 1;
      serviceMap[sname].revenue += it.price || 0;

      if (it.barberId) {
        const meta = barberMeta[it.barberId];
        if (meta) {
          if (!barberMap[it.barberId]) {
            barberMap[it.barberId] = {
              id: it.barberId,
              name: meta.name,
              commissionRate: meta.commissionRate ?? 0.35,
              transactions: 0,
              revenue: 0,
              commission: 0,
            };
          }
          barberMap[it.barberId].transactions += 1;
          barberMap[it.barberId].revenue += it.price || 0;
          barberMap[it.barberId].commission += Math.round((it.price || 0) * (meta.commissionRate ?? 0.35));
        }
      }
    }
  }

  // Refunded transactions (jangan ikut totalRevenue tapi tetap dilaporkan)
  const refunds = await prisma.transaction.aggregate({
    where: { shiftId, status: 'refunded' },
    _sum: { total: true },
    _count: true,
  });
  totalRefund = refunds._sum.total || 0;

  const topServices = Object.values(serviceMap).sort((a, b) => b.count - a.count).slice(0, 10);
  const barberSummary = Object.values(barberMap).sort((a, b) => b.revenue - a.revenue);

  return {
    paymentBreakdown,
    totalRevenue,
    totalTransactions: txns.length,
    totalCash,
    totalDiscount,
    totalRefund,
    refundCount: refunds._count || 0,
    topServices,
    barberSummary,
  };
}

// GET /api/shifts/:id/summary - rincian penuh untuk halaman closing
router.get('/:id/summary', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const shift = await prisma.shift.findUnique({
      where: { id: req.params.id },
      include: { branch: { select: { id: true, name: true, tenantId: true } } },
    });
    if (!shift) return res.status(404).json({ success: false, error: 'Shift not found' });

    if (req.user.role !== 'super_admin' && shift.branch.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    if (req.user.role === 'kasir' && shift.kasirId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const summary = await buildShiftSummary(shift.id, shift.branch.tenantId);
    const expectedCash = (shift.openingCash || 0) + summary.totalCash;

    res.json({
      success: true,
      data: {
        shift: {
          id: shift.id,
          branchId: shift.branchId,
          branchName: shift.branch.name,
          kasirId: shift.kasirId,
          kasirName: shift.kasirName,
          status: shift.status,
          openedAt: shift.openedAt,
          closedAt: shift.closedAt,
          openingCash: shift.openingCash || 0,
          closingCash: shift.closingCash,
          expectedCash: shift.expectedCash ?? expectedCash,
          cashDifference: shift.cashDifference,
          notes: shift.notes,
        },
        summary: {
          ...summary,
          expectedCash,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/shifts/:id
router.get('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const shift = await prisma.shift.findUnique({
      where: { id: req.params.id },
      include: {
        branch: { select: { id: true, name: true, tenantId: true } },
        transactions: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            total: true,
            paymentMethod: true,
            status: true,
            createdAt: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!shift) return res.status(404).json({ success: false, error: 'Shift not found' });

    if (req.user.role !== 'super_admin' && shift.branch.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (req.user.role === 'kasir' && shift.kasirId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: shift });
  } catch (err) {
    next(err);
  }
});

// POST /api/shifts/open - buka shift baru atau kembalikan yang sudah terbuka (idempotent)
router.post('/open', authenticate, requireRole('kasir', 'tenant_admin', 'super_admin'), requireLicensedBranch(), async (req, res, next) => {
  try {
    const body = openShiftSchema.parse(req.body);

    if (!(await assertBranchOwnership(req, body.branchId))) {
      return res.status(403).json({ success: false, error: 'Cabang tidak valid untuk akun ini' });
    }

    const existing = await prisma.shift.findFirst({
      where: { branchId: body.branchId, kasirId: req.user.id, status: 'open' },
      include: { branch: { select: { id: true, name: true } } },
    });

    if (existing) {
      return res.json({ success: true, data: existing, alreadyOpen: true });
    }

    const shift = await prisma.shift.create({
      data: {
        branchId: body.branchId,
        kasirId: req.user.id,
        kasirName: req.user.name || null,
        status: 'open',
        openingCash: body.openingCash ?? 0,
        notes: body.notes || null,
      },
      include: { branch: { select: { id: true, name: true } } },
    });

    res.status(201).json({ success: true, data: shift });
  } catch (err) {
    next(err);
  }
});

// Backwards-compat: front-end lama memakai POST /api/shifts (tanpa /open).
router.post('/', authenticate, requireRole('kasir', 'tenant_admin', 'super_admin'), requireLicensedBranch(), async (req, res, next) => {
  try {
    const body = openShiftSchema.parse(req.body);

    if (!(await assertBranchOwnership(req, body.branchId))) {
      return res.status(403).json({ success: false, error: 'Cabang tidak valid untuk akun ini' });
    }

    const existing = await prisma.shift.findFirst({
      where: { branchId: body.branchId, kasirId: req.user.id, status: 'open' },
      include: { branch: { select: { id: true, name: true } } },
    });
    if (existing) return res.json({ success: true, data: existing, alreadyOpen: true });

    const shift = await prisma.shift.create({
      data: {
        branchId: body.branchId,
        kasirId: req.user.id,
        kasirName: req.user.name || null,
        status: 'open',
        openingCash: body.openingCash ?? 0,
        notes: body.notes || null,
      },
      include: { branch: { select: { id: true, name: true } } },
    });
    res.status(201).json({ success: true, data: shift });
  } catch (err) {
    next(err);
  }
});

// Close handler — dipakai oleh POST /:id/close dan PATCH /:id/close (alias untuk klien lama)
async function closeShiftHandler(req, res, next) {
  try {
    const shift = await prisma.shift.findUnique({
      where: { id: req.params.id },
      include: { branch: { select: { id: true, name: true, tenantId: true } } },
    });

    if (!shift) return res.status(404).json({ success: false, error: 'Shift not found' });

    if (req.user.role !== 'super_admin' && shift.branch.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    if (req.user.role === 'kasir' && shift.kasirId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You can only close your own shifts' });
    }
    if (shift.status === 'closed') {
      return res.status(400).json({ success: false, error: 'Shift sudah ditutup' });
    }

    const body = closeShiftSchema.parse(req.body || {});

    // Hitung totals dari transaksi terkait shift
    const txns = await prisma.transaction.findMany({
      where: { shiftId: shift.id, status: 'completed' },
      select: { total: true, paymentMethod: true },
    });
    const totalRevenue = txns.reduce((s, t) => s + (t.total || 0), 0);
    const totalTransactions = txns.length;
    const totalCash = txns.filter(t => t.paymentMethod === 'cash').reduce((s, t) => s + (t.total || 0), 0);

    const expectedCash = (shift.openingCash || 0) + totalCash;
    const closingCash = body.closingCash != null ? body.closingCash : null;
    const cashDifference = closingCash != null ? closingCash - expectedCash : null;

    const closedShift = await prisma.shift.update({
      where: { id: req.params.id },
      data: {
        status: 'closed',
        closedAt: new Date(),
        totalRevenue,
        totalTransactions,
        closingCash,
        expectedCash,
        cashDifference,
        notes: body.notes != null ? body.notes : shift.notes,
      },
      include: { branch: { select: { id: true, name: true } } },
    });

    // Real-time: kabari tenant + branch room kalau shift ditutup, supaya admin
    // dashboard yang sedang terbuka langsung refresh.
    try {
      const { getIO, branchRoom, tenantRoom } = require('../config/socket');
      const io = getIO();
      if (io) {
        const payload = {
          id: closedShift.id,
          branchId: closedShift.branchId,
          tenantId: shift.branch.tenantId,
          status: closedShift.status,
          totalRevenue: closedShift.totalRevenue,
          totalTransactions: closedShift.totalTransactions,
          closedAt: closedShift.closedAt,
          kasirName: closedShift.kasirName,
        };
        io.to(branchRoom(closedShift.branchId)).emit('shift:closed', payload);
        io.to(tenantRoom(shift.branch.tenantId)).emit('shift:closed', payload);
      }
    } catch (_) { /* socket optional */ }

    res.json({ success: true, data: closedShift });
  } catch (err) {
    next(err);
  }
}

router.post('/:id/close', authenticate, requireRole('kasir', 'tenant_admin', 'super_admin'), closeShiftHandler);
// PATCH alias supaya klien lama (yang memanggil PATCH /:id/close) tetap bekerja
router.patch('/:id/close', authenticate, requireRole('kasir', 'tenant_admin', 'super_admin'), closeShiftHandler);

module.exports = router;
