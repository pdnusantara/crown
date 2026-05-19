const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { recordAudit } = require('../utils/auditLog');
const { getIO, tenantRoom } = require('../config/socket');

// ── Constants ──────────────────────────────────────────────────────────────────
const VALID_CATEGORIES = ['gaji', 'supplies', 'utilitas', 'sewa', 'operasional', 'lainnya'];

const expenseSelect = {
  id: true,
  tenantId: true,
  branchId: true,
  category: true,
  description: true,
  amount: true,
  date: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { id: true, name: true } },
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const emitExpense = (event, payload, tenantId) => {
  if (!tenantId) return;
  try {
    const io = getIO();
    if (io) io.to(tenantRoom(tenantId)).emit(event, payload);
  } catch { /* socket optional */ }
};

// "YYYY-MM-DD" → Date di UTC-midnight. Konsisten lintas timezone karena tanggal
// pengeluaran adalah tanggal kalender, bukan timestamp.
const toDayStart = (ymd) => new Date(`${ymd}T00:00:00.000Z`);
const toDayEnd   = (ymd) => new Date(`${ymd}T23:59:59.999Z`);

// Default periode = bulan berjalan (UTC) bila query tak mengirim rentang.
function currentMonthRange() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const start = `${y}-${m}-01`;
  const end = new Date(Date.UTC(y, now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

// Rentang bulan TEPAT SEBELUM bulan dari `startYmd` — dipakai chip "vs bln lalu".
function prevMonthRange(startYmd) {
  const [y, m] = startYmd.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1)); // m-2: bulan 0-indexed, mundur 1 bulan
  const py = d.getUTCFullYear();
  const pm = d.getUTCMonth();
  const start = `${py}-${String(pm + 1).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(py, pm + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
}

// Resolve tenantId yang berlaku — tenant non-SA selalu dipin ke miliknya.
function resolveTenantId(req, fromBody = false) {
  if (req.user.role === 'super_admin') {
    return (fromBody ? req.body.tenantId : req.query.tenantId) || null;
  }
  return req.user.tenantId;
}

// ── Feature gate ────────────────────────────────────────────────────────────────
// Manajemen Pengeluaran adalah fitur paket Pro/Enterprise. Backend menolak akses
// tenant tanpa flag `expense_tracking` — defense-in-depth, tak hanya paywall UI.
async function requireExpenseFeature(req, res, next) {
  try {
    if (req.user.role === 'super_admin') return next();
    const tenantId = req.user.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });
    const flag = await prisma.tenantFeatureFlag.findUnique({
      where: { tenantId_flagId: { tenantId, flagId: 'expense_tracking' } },
    });
    if (!flag?.enabled) {
      return res.status(403).json({
        success: false,
        error: 'Fitur Manajemen Pengeluaran tidak tersedia di paket Anda',
        code: 'FEATURE_DISABLED',
      });
    }
    next();
  } catch (err) { next(err); }
}

// Pastikan branch (bila diisi) milik tenant — cegah assign ke cabang tenant lain.
async function assertBranchOwnership(branchId, tenantId) {
  if (!branchId) return true;
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId, deletedAt: null },
    select: { id: true },
  });
  return !!branch;
}

// Tanggal kalender valid — regex saja tak cukup: "2026-04-31" lolos regex tapi
// `new Date` menggulirkannya ke 1 Mei. Round-trip memastikan tanggal benar ada.
const calendarDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Tanggal tidak valid');

// ── Validation schemas ──────────────────────────────────────────────────────────
const createExpenseSchema = z.object({
  tenantId:    z.string().optional(),
  branchId:    z.string().min(1).nullable().optional(),
  category:    z.enum(VALID_CATEGORIES),
  description: z.string().trim().min(1, 'Deskripsi wajib diisi').max(200),
  amount:      z.number().int('Nominal harus bilangan bulat').min(1, 'Nominal harus lebih dari 0').max(100_000_000_000),
  date:        calendarDate,
  note:        z.string().trim().max(500).nullable().optional(),
});
const updateExpenseSchema = createExpenseSchema.partial().omit({ tenantId: true });

// Semua route butuh auth + role admin + fitur aktif.
router.use(authenticate, requireRole('super_admin', 'tenant_admin'), requireExpenseFeature);

// ── GET /api/expenses — list, tenant-scoped, paginated ──────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, category, branchId, startDate, endDate, sortBy } = req.query;

    const tenantId = resolveTenantId(req);
    const where = {};
    if (req.user.role !== 'super_admin') {
      where.tenantId = req.user.tenantId;
    } else if (tenantId) {
      where.tenantId = tenantId;
    }

    if (category && VALID_CATEGORIES.includes(category)) where.category = category;
    if (branchId) where.branchId = branchId;
    if (search) {
      where.OR = [
        { description: { contains: String(search).trim(), mode: 'insensitive' } },
        { note: { contains: String(search).trim(), mode: 'insensitive' } },
      ];
    }
    if (startDate || endDate) {
      where.date = {};
      if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) where.date.gte = toDayStart(startDate);
      if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate))   where.date.lte = toDayEnd(endDate);
    }

    const orderBy = (() => {
      switch (sortBy) {
        case 'date-asc':    return [{ date: 'asc' }, { createdAt: 'asc' }];
        case 'amount-desc': return [{ amount: 'desc' }];
        case 'amount-asc':  return [{ amount: 'asc' }];
        default:            return [{ date: 'desc' }, { createdAt: 'desc' }];
      }
    })();

    const [data, total] = await Promise.all([
      prisma.expense.findMany({ where, select: expenseSelect, skip, take: limit, orderBy }),
      prisma.expense.count({ where }),
    ]);

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) { next(err); }
});

// ── GET /api/expenses/stats — KPI periode (total, count, per kategori) ──────────
router.get('/stats', async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const fallback = currentMonthRange();
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate || '') ? req.query.startDate : fallback.start;
    const endDate   = /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate || '')   ? req.query.endDate   : fallback.end;

    const where = {
      tenantId,
      date: { gte: toDayStart(startDate), lte: toDayEnd(endDate) },
    };

    const prev = prevMonthRange(startDate);

    const [agg, byCat, prevAgg] = await Promise.all([
      prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
      prisma.expense.groupBy({ by: ['category'], where, _sum: { amount: true } }),
      prisma.expense.aggregate({
        where: { tenantId, date: { gte: toDayStart(prev.start), lte: toDayEnd(prev.end) } },
        _sum: { amount: true },
      }),
    ]);

    const byCategory = {};
    byCat.forEach(c => { byCategory[c.category] = c._sum.amount || 0; });

    res.json({
      success: true,
      data: {
        total: agg._sum.amount || 0,
        count: agg._count || 0,
        byCategory,
        prevTotal: prevAgg._sum.amount || 0,
        period: { startDate, endDate },
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/expenses/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const expense = await prisma.expense.findUnique({ where: { id: req.params.id }, select: expenseSelect });
    if (!expense) return res.status(404).json({ success: false, error: 'Pengeluaran tidak ditemukan' });
    if (req.user.role !== 'super_admin' && expense.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Akses ditolak' });
    }
    res.json({ success: true, data: expense });
  } catch (err) { next(err); }
});

// ── POST /api/expenses ──────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const body = createExpenseSchema.parse(req.body);
    const tenantId = req.user.role === 'super_admin' ? body.tenantId : req.user.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const branchId = body.branchId || null;
    if (!(await assertBranchOwnership(branchId, tenantId))) {
      return res.status(400).json({ success: false, error: 'Cabang tidak valid' });
    }

    const expense = await prisma.expense.create({
      data: {
        tenantId,
        branchId,
        category:    body.category,
        description: body.description,
        amount:      body.amount,
        date:        toDayStart(body.date),
        note:        body.note ?? null,
      },
      select: expenseSelect,
    });

    await recordAudit(req, {
      action: 'expense.create',
      target: `expense:${expense.id}`,
      detail: `${expense.category} ${expense.description} Rp${expense.amount}`,
      severity: 'info',
    });
    emitExpense('expense:created', expense, tenantId);
    res.status(201).json({ success: true, data: expense });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// ── PUT /api/expenses/:id ───────────────────────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Pengeluaran tidak ditemukan' });
    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Akses ditolak' });
    }

    const body = updateExpenseSchema.parse(req.body);

    if (body.branchId !== undefined && body.branchId) {
      if (!(await assertBranchOwnership(body.branchId, existing.tenantId))) {
        return res.status(400).json({ success: false, error: 'Cabang tidak valid' });
      }
    }

    const data = {};
    if (body.category !== undefined)    data.category = body.category;
    if (body.description !== undefined) data.description = body.description;
    if (body.amount !== undefined)      data.amount = body.amount;
    if (body.date !== undefined)        data.date = toDayStart(body.date);
    if (body.note !== undefined)        data.note = body.note ?? null;
    if (body.branchId !== undefined)    data.branchId = body.branchId || null;

    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data,
      select: expenseSelect,
    });

    await recordAudit(req, {
      action: 'expense.update',
      target: `expense:${expense.id}`,
      detail: `${expense.description} (${Object.keys(data).join(',')})`,
      severity: 'info',
    });
    emitExpense('expense:updated', expense, expense.tenantId);
    res.json({ success: true, data: expense });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// ── POST /api/expenses/copy-month — salin pengeluaran ke bulan lain ─────────────
// Dipakai tombol "Salin dari Bulan Lalu": menyalin baris terpilih ke `toMonth`
// dengan tanggal hari-yang-sama (di-clamp ke hari terakhir bila bulan lebih pendek).
router.post('/copy-month', async (req, res, next) => {
  try {
    const body = z.object({
      ids:     z.array(z.string().min(1)).min(1).max(500),
      toMonth: z.string()
        .regex(/^\d{4}-\d{2}$/, 'Bulan tujuan tidak valid')
        .refine((s) => { const m = Number(s.slice(5, 7)); return m >= 1 && m <= 12; }, 'Bulan tujuan tidak valid'),
    }).parse(req.body);

    const tenantId = resolveTenantId(req, true);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    // Tenant-scoped: hanya baris milik tenant ini yang bisa disalin.
    const sources = await prisma.expense.findMany({
      where: { id: { in: body.ids }, tenantId },
    });
    if (sources.length === 0) {
      return res.status(404).json({ success: false, error: 'Tidak ada pengeluaran untuk disalin' });
    }

    const [ty, tm] = body.toMonth.split('-').map(Number);
    const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();

    const rows = sources.map(s => {
      const srcDay = new Date(s.date).getUTCDate();
      const day = String(Math.min(srcDay, lastDay)).padStart(2, '0');
      return {
        tenantId,
        branchId:    s.branchId,
        category:    s.category,
        description: s.description,
        amount:      s.amount,
        date:        toDayStart(`${body.toMonth}-${day}`),
        note:        s.note,
      };
    });

    const result = await prisma.expense.createMany({ data: rows });

    await recordAudit(req, {
      action: 'expense.copy_month',
      target: `tenant:${tenantId}`,
      detail: `Salin ${result.count} pengeluaran ke ${body.toMonth}`,
      severity: 'info',
    });
    emitExpense('expense:bulk_changed', { tenantId, count: result.count }, tenantId);
    res.status(201).json({ success: true, data: { created: result.count } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// ── POST /api/expenses/bulk-delete ──────────────────────────────────────────────
router.post('/bulk-delete', async (req, res, next) => {
  try {
    const body = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }).parse(req.body);
    const tenantId = resolveTenantId(req, true);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    // Tenant-scoped: hanya hapus baris milik tenant ini.
    const result = await prisma.expense.deleteMany({
      where: { id: { in: body.ids }, tenantId },
    });

    await recordAudit(req, {
      action: 'expense.bulk_delete',
      target: `tenant:${tenantId}`,
      detail: `Hapus massal ${result.count} pengeluaran`,
      severity: 'warning',
    });
    emitExpense('expense:bulk_changed', { tenantId, count: result.count }, tenantId);
    res.json({ success: true, data: { deleted: result.count } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// ── DELETE /api/expenses/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Pengeluaran tidak ditemukan' });
    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Akses ditolak' });
    }

    await prisma.expense.delete({ where: { id: req.params.id } });
    await recordAudit(req, {
      action: 'expense.delete',
      target: `expense:${existing.id}`,
      detail: `${existing.category} ${existing.description}`,
      severity: 'info',
    });
    emitExpense('expense:deleted', { id: existing.id }, existing.tenantId);
    res.json({ success: true, data: { id: existing.id } });
  } catch (err) { next(err); }
});

module.exports = router;
