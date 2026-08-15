const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { getIO, tenantRoom } = require('../config/socket');
const { recordAudit } = require('../utils/auditLog');

// Broadcast perubahan layanan ke seluruh klien tenant (kasir, booking, queue,
// admin) supaya POS & halaman lain ikut tersinkron otomatis tanpa reload.
const emitService = (event, payload, tenantId) => {
  if (!tenantId) return;
  try {
    const io = getIO();
    if (io) io.to(tenantRoom(tenantId)).emit(event, payload);
  } catch { /* socket optional */ }
};

const serviceSelect = {
  id: true,
  tenantId: true,
  name: true,
  description: true,
  price: true,
  duration: true,
  category: true,
  icon: true,
  isActive: true,
  createdAt: true,
};

const createServiceSchema = z.object({
  tenantId: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().int().min(0),
  duration: z.number().int().min(1),
  category: z.string().min(1),
  icon: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updateServiceSchema = createServiceSchema.partial().omit({ tenantId: true });

// GET /api/services
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, category, isActive, sortBy, sortDir } = req.query;

    const where = { deletedAt: null };

    if (req.user.role !== 'super_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    // Sort whitelist: name | price | duration | createdAt | category
    const allowedSort = new Set(['name', 'price', 'duration', 'createdAt', 'category']);
    const dir = sortDir === 'asc' ? 'asc' : 'desc';
    const orderBy = allowedSort.has(sortBy)
      ? { [sortBy]: dir }
      : { createdAt: 'desc' };

    // Harga efektif per cabang: bila `branchId` dikirim (mis. dari POS kasir),
    // sertakan override harga cabang tsb supaya frontend pakai harga yang benar.
    // Tanpa branchId, effectivePrice = harga dasar.
    const branchId = req.query.branchId || null;
    const select = { ...serviceSelect };
    if (branchId) {
      select.branchPrices = { where: { branchId }, select: { price: true } };
    }

    const [rawData, total] = await Promise.all([
      prisma.service.findMany({ where, select, skip, take: limit, orderBy }),
      prisma.service.count({ where }),
    ]);

    const data = rawData.map((s) => {
      const { branchPrices, ...rest } = s;
      const override = branchPrices && branchPrices[0];
      return {
        ...rest,
        effectivePrice: override ? override.price : s.price,
        hasBranchOverride: !!override,
      };
    });

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/services/categories — list distinct categories with counts (active only)
router.get('/categories', authenticate, async (req, res, next) => {
  try {
    const tenantId = req.user.role === 'super_admin'
      ? (req.query.tenantId || null)
      : req.user.tenantId;
    if (!tenantId) return res.json({ success: true, data: [] });

    const groups = await prisma.service.groupBy({
      by: ['category'],
      where: { tenantId, deletedAt: null },
      _count: { _all: true },
      _sum: { price: true },
      orderBy: { _count: { category: 'desc' } },
    });
    const data = groups
      .filter(g => g.category && g.category.trim())
      .map(g => ({
        category: g.category,
        count: g._count?._all || 0,
        revenuePotential: g._sum?.price || 0,
      }));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/services/stats — quick overview for header tiles
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const tenantId = req.user.role === 'super_admin'
      ? (req.query.tenantId || null)
      : req.user.tenantId;
    if (!tenantId) return res.json({ success: true, data: { total: 0, active: 0, inactive: 0, avgPrice: 0, avgDuration: 0, categories: 0 } });

    const where = { tenantId, deletedAt: null };
    const [total, active, agg, distinctCats] = await Promise.all([
      prisma.service.count({ where }),
      prisma.service.count({ where: { ...where, isActive: true } }),
      prisma.service.aggregate({ where, _avg: { price: true, duration: true } }),
      prisma.service.findMany({ where, distinct: ['category'], select: { category: true } }),
    ]);

    res.json({
      success: true,
      data: {
        total,
        active,
        inactive: total - active,
        avgPrice: Math.round(agg._avg?.price || 0),
        avgDuration: Math.round(agg._avg?.duration || 0),
        categories: distinctCats.filter(c => c.category && c.category.trim()).length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/services/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const service = await prisma.service.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: serviceSelect,
    });
    if (!service) return res.status(404).json({ success: false, error: 'Service not found' });

    if (req.user.role !== 'super_admin' && service.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
});

// POST /api/services
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const body = createServiceSchema.parse(req.body);
    if (req.user.role === 'tenant_admin') {
      body.tenantId = req.user.tenantId;
    }
    if (!body.tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });

    const service = await prisma.service.create({
      data: body,
      select: serviceSelect,
    });

    emitService('service:created', service, service.tenantId);
    await recordAudit(req, {
      action: 'service.create',
      target: `service:${service.id}`,
      detail: `Layanan baru: ${service.name} (Rp ${service.price.toLocaleString('id-ID')}, ${service.duration} mnt)`,
      severity: 'info',
      tenantId: service.tenantId,
    });
    res.status(201).json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
});

// PUT /api/services/:id
router.put('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.service.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Service not found' });

    if (req.user.role === 'tenant_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const body = updateServiceSchema.parse(req.body);
    const service = await prisma.service.update({
      where: { id: req.params.id },
      data: body,
      select: serviceSelect,
    });

    emitService('service:updated', service, service.tenantId);
    const changedKeys = Object.keys(body);
    await recordAudit(req, {
      action: 'service.update',
      target: `service:${service.id}`,
      detail: `Edit layanan: ${service.name}${changedKeys.length ? ` (${changedKeys.join(', ')})` : ''}`,
      severity: 'info',
      tenantId: service.tenantId,
    });
    res.json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/services/:id (soft delete)
router.delete('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.service.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Service not found' });

    if (req.user.role === 'tenant_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await prisma.service.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    emitService('service:deleted', { id: req.params.id }, existing.tenantId);
    await recordAudit(req, {
      action: 'service.delete',
      target: `service:${existing.id}`,
      detail: `Hapus layanan: ${existing.name}`,
      severity: 'warning',
      tenantId: existing.tenantId,
    });
    res.json({ success: true, data: { message: 'Service deleted successfully' } });
  } catch (err) {
    next(err);
  }
});

// --- Harga per cabang (override) ---------------------------------------------

// Pastikan layanan ada + caller berhak (tenant sama). Return service atau null.
const resolveOwnedService = async (req) => {
  const service = await prisma.service.findFirst({
    where: { id: req.params.id, deletedAt: null },
    select: { id: true, tenantId: true, name: true, price: true },
  });
  if (!service) return { error: 404 };
  if (req.user.role !== 'super_admin' && service.tenantId !== req.user.tenantId) {
    return { error: 403 };
  }
  return { service };
};

// GET /api/services/:id/branch-prices — daftar override harga per cabang.
// Mengembalikan harga dasar + array {branchId, price} untuk cabang yang dioverride.
router.get('/:id/branch-prices', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const { service, error } = await resolveOwnedService(req);
    if (error) return res.status(error).json({ success: false, error: error === 404 ? 'Service not found' : 'Access denied' });

    const overrides = await prisma.serviceBranchPrice.findMany({
      where: { serviceId: service.id },
      select: { branchId: true, price: true },
    });

    res.json({ success: true, data: { basePrice: service.price, overrides } });
  } catch (err) {
    next(err);
  }
});

const branchPriceItemSchema = z.object({
  branchId: z.string().min(1),
  // null = hapus override (cabang ikut harga dasar). Angka = set harga khusus.
  price: z.number().int().min(0).nullable(),
});
const branchPricesSchema = z.object({
  prices: z.array(branchPriceItemSchema).max(500),
});

// PUT /api/services/:id/branch-prices — simpan override harga per cabang.
// Body: { prices: [{ branchId, price|null }] }. price null → hapus override.
router.put('/:id/branch-prices', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const { service, error } = await resolveOwnedService(req);
    if (error) return res.status(error).json({ success: false, error: error === 404 ? 'Service not found' : 'Access denied' });

    const { prices } = branchPricesSchema.parse(req.body);

    // Hanya izinkan cabang milik tenant layanan ini.
    const validBranches = await prisma.branch.findMany({
      where: { tenantId: service.tenantId, deletedAt: null },
      select: { id: true },
    });
    const validIds = new Set(validBranches.map(b => b.id));
    const invalid = prices.find(p => !validIds.has(p.branchId));
    if (invalid) return res.status(400).json({ success: false, error: `Cabang tidak valid: ${invalid.branchId}` });

    const toRemove = prices.filter(p => p.price === null).map(p => p.branchId);
    const toUpsert = prices.filter(p => p.price !== null);

    await prisma.$transaction([
      ...(toRemove.length
        ? [prisma.serviceBranchPrice.deleteMany({ where: { serviceId: service.id, branchId: { in: toRemove } } })]
        : []),
      ...toUpsert.map(p =>
        prisma.serviceBranchPrice.upsert({
          where: { serviceId_branchId: { serviceId: service.id, branchId: p.branchId } },
          create: { serviceId: service.id, branchId: p.branchId, price: p.price },
          update: { price: p.price },
        })
      ),
    ]);

    const overrides = await prisma.serviceBranchPrice.findMany({
      where: { serviceId: service.id },
      select: { branchId: true, price: true },
    });

    // Sinkronkan POS/booking: harga cabang berubah → klien refetch layanan.
    emitService('service:updated', { id: service.id }, service.tenantId);
    await recordAudit(req, {
      action: 'service.branch_prices.update',
      target: `service:${service.id}`,
      detail: `Harga per cabang ${service.name}: ${overrides.length} cabang khusus`,
      severity: 'info',
      tenantId: service.tenantId,
    });

    res.json({ success: true, data: { basePrice: service.price, overrides } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
