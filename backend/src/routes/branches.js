const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { getBranchLicenseStatus } = require('../utils/branchLicense');
const { invalidateBranchCache, resolveBranchId, isCuid } = require('../utils/branchResolver');
const { recordAudit } = require('../utils/auditLog');

const branchSelect = {
  id: true,
  tenantId: true,
  code: true,
  name: true,
  address: true,
  phone: true,
  openTime: true,
  closeTime: true,
  latitude: true,
  longitude: true,
  attendanceRadius: true,
  closedDates: true,
  isActive: true,
  createdAt: true,
  tenant: { select: { id: true, name: true } },
  _count: { select: { users: true } },
};

// Kode cabang: huruf kecil/angka/tanda hubung, 2-24 char. Tidak boleh berupa
// CUID (20+ char alfanumerik tanpa dash) supaya tidak ambigu dengan id.
const branchCodeSchema = z.string()
  .min(2, 'Kode minimal 2 karakter')
  .max(24, 'Kode maksimal 24 karakter')
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Hanya huruf kecil, angka, dan tanda hubung')
  .refine((v) => v.includes('-') || v.length < 20 || /[^a-z0-9]/.test(v), {
    message: 'Hindari format yang menyerupai ID otomatis',
  });

const createBranchSchema = z.object({
  tenantId: z.string().min(1),
  code: branchCodeSchema.optional(),
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  openTime: z.string().optional(),
  closeTime: z.string().optional(),
  // Koordinat geofence absensi — boleh null untuk mengosongkan konfigurasi.
  latitude:  z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  attendanceRadius: z.number().int().min(10).max(5000).optional(),
  isActive: z.boolean().optional(),
});

const updateBranchSchema = createBranchSchema.partial().omit({ tenantId: true });

// Resolve `:id` ke real Branch.id sebelum sampai ke handler GET/PUT/DELETE.
// Kalau bukan CUID, anggap kode cabang dan lookup dengan tenant context.
async function resolveIdParam(req, _res, next) {
  try {
    const v = req.params.id;
    if (!v || isCuid(v)) return next();
    const tenantId = req.user?.tenantId || req.tenant?.id || null;
    const id = await resolveBranchId(v, tenantId);
    if (id) req.params.id = id;
    next();
  } catch (err) { next(err); }
}

function resolveTenantId(req) {
  if (req.user.role === 'super_admin') return req.body.tenantId || req.query.tenantId;
  return req.user.tenantId;
}

// GET /api/branches
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir', 'barber'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, isActive } = req.query;

    const where = { deletedAt: null };

    if (req.user.role !== 'super_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [data, total] = await Promise.all([
      prisma.branch.findMany({ where, select: branchSelect, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.branch.count({ where }),
    ]);

    // Annotate each branch dengan status lisensi. Status dihitung per tenant,
    // jadi super_admin yang melihat semua cabang lintas tenant tetap akurat.
    const tenantIds = [...new Set(data.map((b) => b.tenantId).filter(Boolean))];
    const licenseByTenant = new Map();
    await Promise.all(
      tenantIds.map(async (tid) => {
        licenseByTenant.set(tid, await getBranchLicenseStatus(tid));
      }),
    );
    const annotated = data.map((b) => {
      const lic = licenseByTenant.get(b.tenantId);
      return { ...b, isLicensed: lic ? !lic.unlicensed.has(b.id) : true };
    });

    res.json({ success: true, data: paginatedResponse(annotated, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/branches/:id
router.get('/:id', authenticate, resolveIdParam, async (req, res, next) => {
  try {
    const branch = await prisma.branch.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: branchSelect,
    });
    if (!branch) return res.status(404).json({ success: false, error: 'Branch not found' });

    if (req.user.role !== 'super_admin' && branch.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const license = await getBranchLicenseStatus(branch.tenantId);
    res.json({
      success: true,
      data: { ...branch, isLicensed: !license.unlicensed.has(branch.id) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/branches/license/summary — info kuota & jumlah cabang berlisensi
// untuk tenant yang sedang login (super_admin bisa pass ?tenantId=)
router.get('/license/summary', authenticate, async (req, res, next) => {
  try {
    const tenantId =
      req.user.role === 'super_admin'
        ? (req.query.tenantId || req.user.tenantId)
        : req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'tenantId is required' });
    }
    const license = await getBranchLicenseStatus(tenantId);
    res.json({
      success: true,
      data: {
        ...license.info,
        unlicensedBranchIds: [...license.unlicensed],
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/branches
// Ketika branch baru melewati kuota paket (maxBranches), otomatis buat invoice
// branch_addon di subscription tenant. Semua dalam satu transaksi supaya konsisten.
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const body = createBranchSchema.parse(req.body);

    if (req.user.role === 'tenant_admin') {
      body.tenantId = req.user.tenantId;
    }
    if (!body.tenantId) {
      return res.status(400).json({ success: false, error: 'tenantId is required' });
    }

    // ── Pre-flight checks (outside transaction, fail-fast) ────────────────
    const [tenant, preFlight] = await Promise.all([
      prisma.tenant.findFirst({ where: { id: body.tenantId }, select: { isSuspended: true } }),
      (async () => {
        const sub = await prisma.subscription.findUnique({
          where: { tenantId: body.tenantId },
          select: { id: true, status: true, package: true },
        });
        if (!sub) return { ok: true };
        const pkg = await prisma.package.findUnique({
          where: { name: sub.package },
          select: { maxBranches: true, branchAddonPrice: true },
        });
        const count = await prisma.branch.count({ where: { tenantId: body.tenantId, deletedAt: null } });
        return { ok: true, sub, pkg, count };
      })(),
    ]);

    if (tenant?.isSuspended) {
      return res.status(403).json({ success: false, error: 'Tenant is suspended', code: 'SUSPENDED' });
    }

    const { sub, pkg, count } = preFlight;
    if (sub && pkg && count >= pkg.maxBranches && pkg.branchAddonPrice === 0) {
      return res.status(402).json({
        success: false,
        error: `Kuota cabang paket ${sub.package} sudah penuh (maks ${pkg.maxBranches}). Upgrade paket untuk menambah cabang.`,
        code: 'QUOTA_EXCEEDED_UPGRADE_REQUIRED',
        maxBranches: pkg.maxBranches,
        currentPackage: sub.package,
      });
    }
    // ─────────────────────────────────────────────────────────────────────

    const { branch, addonInvoice } = await prisma.$transaction(async (tx) => {
      // Count cabang aktif tenant (soft-deleted tidak dihitung)
      const existingBranchCount = await tx.branch.count({
        where: { tenantId: body.tenantId, deletedAt: null },
      });

      const createdBranch = await tx.branch.create({
        data: body,
        select: branchSelect,
      });

      // Cek paket & kuota
      const subscription = await tx.subscription.findUnique({
        where: { tenantId: body.tenantId },
        select: { id: true, package: true },
      });

      let invoice = null;
      if (subscription) {
        const pkg = await tx.package.findUnique({
          where: { name: subscription.package },
          select: { maxBranches: true, branchAddonPrice: true, branchAddonType: true },
        });

        // Kuota terpakai setelah create = existingBranchCount + 1
        // Branch ini melebihi kuota? (1-indexed: kuota 1 → cabang ke-2 kena addon)
        const overQuota = pkg && pkg.branchAddonPrice > 0 && (existingBranchCount + 1) > pkg.maxBranches;
        if (overQuota) {
          const now = new Date();
          const period = pkg.branchAddonType === 'onetime'
            ? `Cabang: ${createdBranch.name} (one-time)`
            : `Cabang: ${createdBranch.name} — ${now.toLocaleString('en-US', { month: 'short', year: 'numeric' })}`;

          invoice = await tx.invoice.create({
            data: {
              subscriptionId: subscription.id,
              period,
              amount: pkg.branchAddonPrice,
              type: 'branch_addon',
              status: 'pending',
            },
          });
        }
      }

      return { branch: createdBranch, addonInvoice: invoice };
    });

    invalidateBranchCache();
    await recordAudit(req, {
      action: 'branch.create',
      target: `branch:${branch.id}`,
      detail: `Cabang baru: ${branch.name}${branch.code ? ` (${branch.code})` : ''}`,
      severity: 'info',
      tenantId: branch.tenantId,
    });
    res.status(201).json({
      success: true,
      data: branch,
      meta: addonInvoice ? { addonInvoice } : undefined,
    });
  } catch (err) {
    if (err?.code === 'P2002' && Array.isArray(err.meta?.target) && err.meta.target.includes('code')) {
      return res.status(409).json({ success: false, error: 'Kode cabang sudah dipakai di tenant ini', code: 'BRANCH_CODE_TAKEN' });
    }
    next(err);
  }
});

// PUT /api/branches/:id
router.put('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), resolveIdParam, async (req, res, next) => {
  try {
    const existing = await prisma.branch.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Branch not found' });

    if (req.user.role === 'tenant_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const body = updateBranchSchema.parse(req.body);
    const branch = await prisma.branch.update({
      where: { id: req.params.id },
      data: body,
      select: branchSelect,
    });

    if (body.code !== undefined && body.code !== existing.code) {
      invalidateBranchCache();
    }
    const changedKeys = Object.keys(body);
    await recordAudit(req, {
      action: 'branch.update',
      target: `branch:${branch.id}`,
      detail: `Edit cabang: ${branch.name}${changedKeys.length ? ` (${changedKeys.join(', ')})` : ''}`,
      severity: 'info',
      tenantId: branch.tenantId,
    });
    res.json({ success: true, data: branch });
  } catch (err) {
    if (err?.code === 'P2002' && Array.isArray(err.meta?.target) && err.meta.target.includes('code')) {
      return res.status(409).json({ success: false, error: 'Kode cabang sudah dipakai di tenant ini', code: 'BRANCH_CODE_TAKEN' });
    }
    next(err);
  }
});

// ── Penutupan cabang per-tanggal (libur Lebaran, cuti bersama, dll) ─────────
const calDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus YYYY-MM-DD');
const closureBodySchema = z.object({
  date: calDate,
  note: z.string().trim().max(200).optional().nullable(),
});

function sanitizeClosedDates(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const date = String(e.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || seen.has(date)) continue;
    seen.add(date);
    out.push({ date, ...(e.note ? { note: String(e.note).slice(0, 200) } : {}) });
    if (out.length >= 365) break;
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// POST /api/branches/:id/closures — tambahkan/timpa tanggal tutup. Hapus
// BarberSchedule untuk tanggal+cabang sekalian.
router.post('/:id/closures', authenticate, requireRole('super_admin', 'tenant_admin'), resolveIdParam, async (req, res, next) => {
  try {
    const body = closureBodySchema.parse(req.body);
    const existing = await prisma.branch.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Branch not found' });
    if (req.user.role === 'tenant_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const current = sanitizeClosedDates(existing.closedDates);
    const filtered = current.filter((e) => e.date !== body.date);
    filtered.push({ date: body.date, ...(body.note ? { note: body.note } : {}) });
    const next = sanitizeClosedDates(filtered);

    const [updated, cleared] = await prisma.$transaction([
      prisma.branch.update({
        where: { id: existing.id },
        data: { closedDates: next },
        select: branchSelect,
      }),
      prisma.barberSchedule.deleteMany({
        where: { tenantId: existing.tenantId, branchId: existing.id, date: body.date },
      }),
    ]);

    await recordAudit(req, {
      action: 'branch.closure_set',
      target: `branch:${existing.id}`,
      detail: `Tutup cabang ${updated.name} pada ${body.date}${body.note ? ` — ${body.note}` : ''}`,
      severity: 'info',
      tenantId: updated.tenantId,
    });
    res.json({ success: true, data: { branch: updated, clearedSchedules: cleared.count } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// DELETE /api/branches/:id/closures?date=YYYY-MM-DD — buka kembali tanggal.
router.delete('/:id/closures', authenticate, requireRole('super_admin', 'tenant_admin'), resolveIdParam, async (req, res, next) => {
  try {
    const date = String(req.query.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, error: 'Param ?date=YYYY-MM-DD wajib' });
    }
    const existing = await prisma.branch.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Branch not found' });
    if (req.user.role === 'tenant_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    const current = sanitizeClosedDates(existing.closedDates);
    const next = current.filter((e) => e.date !== date);
    const updated = await prisma.branch.update({
      where: { id: existing.id },
      data: { closedDates: next },
      select: branchSelect,
    });
    await recordAudit(req, {
      action: 'branch.closure_remove',
      target: `branch:${existing.id}`,
      detail: `Buka kembali cabang ${updated.name} pada ${date}`,
      severity: 'info',
      tenantId: updated.tenantId,
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// DELETE /api/branches/:id (soft delete)
router.delete('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), resolveIdParam, async (req, res, next) => {
  try {
    const existing = await prisma.branch.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Branch not found' });

    if (req.user.role === 'tenant_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await prisma.branch.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    invalidateBranchCache();
    await recordAudit(req, {
      action: 'branch.delete',
      target: `branch:${existing.id}`,
      detail: `Hapus cabang: ${existing.name}`,
      severity: 'warning',
      tenantId: existing.tenantId,
    });
    res.json({ success: true, data: { message: 'Branch deleted successfully' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
