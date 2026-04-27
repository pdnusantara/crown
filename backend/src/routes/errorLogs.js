const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const createErrorSchema = z.object({
  level:      z.enum(['error', 'warning', 'info']).default('error'),
  type:       z.enum(['api_error', 'js_error', 'payment_error', 'system_error', 'auth_error']).default('js_error'),
  message:    z.string().min(1).max(2000),
  stack:      z.string().max(10000).optional(),
  path:       z.string().max(500).optional(),
  method:     z.string().max(10).optional(),
  statusCode: z.number().int().optional(),
  metadata:   z.record(z.unknown()).optional(),
});

const resolveSchema = z.object({
  resolvedBy: z.string().optional(),
});

// GET /api/error-logs — list with tenant name enrichment
router.get('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { level, type, resolved, tenantId, search, from, to } = req.query;

    const where = {};
    if (level)    where.level = level;
    if (type)     where.type  = type;
    if (tenantId) where.tenantId = tenantId;
    if (resolved !== undefined && resolved !== '') where.resolved = resolved === 'true';
    if (search)   where.message = { contains: search, mode: 'insensitive' };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to)   where.createdAt.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      prisma.errorLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.errorLog.count({ where }),
    ]);

    // Batch-enrich with tenant names
    const tenantIds = [...new Set(data.filter(l => l.tenantId).map(l => l.tenantId))];
    let tenantMap = {};
    if (tenantIds.length > 0) {
      const tenants = await prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true },
      });
      tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]));
    }
    const enriched = data.map(l => ({
      ...l,
      tenantName: l.tenantId ? (tenantMap[l.tenantId] || null) : null,
    }));

    return res.json(paginatedResponse(enriched, total, page, limit));
  } catch (err) {
    next(err);
  }
});

// GET /api/error-logs/stats — KPI counts
router.get('/stats', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [total, unresolved, warnings, todayCount, byType, byLevel] = await Promise.all([
      prisma.errorLog.count(),
      prisma.errorLog.count({ where: { resolved: false } }),
      prisma.errorLog.count({ where: { level: 'warning', resolved: false } }),
      prisma.errorLog.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.errorLog.groupBy({ by: ['type'],  _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
      prisma.errorLog.groupBy({ by: ['level'], _count: { id: true } }),
    ]);

    return res.json({ success: true, data: { total, unresolved, warnings, todayCount, byType, byLevel } });
  } catch (err) {
    next(err);
  }
});

// GET /api/error-logs/stats/trend — error counts per day (last N days)
router.get('/stats/trend', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 30);
    const result = [];

    for (let i = days - 1; i >= 0; i--) {
      const d     = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d); start.setHours(0, 0, 0, 0);
      const end   = new Date(d); end.setHours(23, 59, 59, 999);

      const [errors, warnings, info] = await Promise.all([
        prisma.errorLog.count({ where: { createdAt: { gte: start, lte: end }, level: 'error' } }),
        prisma.errorLog.count({ where: { createdAt: { gte: start, lte: end }, level: 'warning' } }),
        prisma.errorLog.count({ where: { createdAt: { gte: start, lte: end }, level: 'info' } }),
      ]);

      result.push({
        date:  d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        errors,
        warnings,
        info,
        total: errors + warnings + info,
      });
    }

    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/error-logs — frontend JS error capture
router.post('/', authenticate, async (req, res, next) => {
  try {
    const body = createErrorSchema.parse(req.body);
    const log  = await prisma.errorLog.create({
      data: { ...body, tenantId: req.user?.tenantId || null, userId: req.user?.id || null },
    });
    return res.status(201).json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/error-logs/bulk-resolve — MUST be before /:id routes
router.patch('/bulk-resolve', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string()).min(1) }).parse(req.body);
    const result  = await prisma.errorLog.updateMany({
      where: { id: { in: ids } },
      data:  { resolved: true, resolvedAt: new Date(), resolvedBy: req.user?.name || 'super_admin' },
    });
    return res.json({ success: true, data: { count: result.count } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/error-logs/:id/resolve
router.patch('/:id/resolve', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { resolvedBy } = resolveSchema.parse(req.body);
    const log = await prisma.errorLog.update({
      where: { id: req.params.id },
      data: {
        resolved:   true,
        resolvedAt: new Date(),
        resolvedBy: resolvedBy || req.user?.name || 'super_admin',
      },
    });
    return res.json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/error-logs — bulk delete
router.delete('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { olderThanDays, onlyResolved } = req.query;
    const where = {};
    if (onlyResolved === 'true') where.resolved = true;
    if (olderThanDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - Number(olderThanDays));
      where.createdAt = { lte: cutoff };
    }
    const result = await prisma.errorLog.deleteMany({ where });
    return res.json({ success: true, data: { deleted: result.count } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
