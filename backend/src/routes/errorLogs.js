const router = require('express').Router();
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const prisma = require('../config/database');
const { authenticate, optionalAuth, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { buildTenantDateRange, formatYmdInTz, normalizeTimezone, DEFAULT_TZ } = require('../utils/timezone');
const { getIO } = require('../config/socket');
const { notifyError } = require('../services/telegramService');
const { redactSensitive } = require('../middleware/errorHandler');

// POST /error-logs menerima laporan anonim (halaman publik / pra-login), jadi
// tak terlindungi `authenticate`. Cap per-IP terpisah agar tak bisa dipakai
// membanjiri tabel ErrorLog. generalLimiter /api tetap berlaku di atasnya.
const reportLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many error reports, slow down.' },
});

// Super-admins all join the 'support' room on connect (see config/socket.js).
// Reuse it for error-log notifications so the SAErrorLogPage can react live
// without standing up a dedicated room.
const SUPER_ADMIN_ROOM = 'support';

function emitErrorEvent(event, payload) {
  try {
    const io = getIO();
    if (!io) return;
    io.to(SUPER_ADMIN_ROOM).emit(event, payload);
  } catch {
    /* swallow — observability shouldn't break the request */
  }
}

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

    const tz = normalizeTimezone(req.query.tz || DEFAULT_TZ);
    const where = {};
    if (level)    where.level = level;
    if (type)     where.type  = type;
    if (tenantId) where.tenantId = tenantId;
    if (resolved !== undefined && resolved !== '') where.resolved = resolved === 'true';
    if (search)   where.message = { contains: search, mode: 'insensitive' };
    if (from || to) {
      // Accept YYYY-MM-DD as tenant-local boundaries; full ISO datetimes pass-through.
      where.createdAt = buildTenantDateRange(from, to, tz);
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
// Single-pass aggregation: fetch all rows once, bucket by tenant-day in JS.
// Cheaper than 3·N sequential count queries and respects tenant timezone.
router.get('/stats/trend', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 30);
    const tz = normalizeTimezone(req.query.tz || DEFAULT_TZ);

    const buckets = [];
    const byKey = new Map();
    const now = Date.now();
    for (let i = days - 1; i >= 0; i--) {
      const ts = new Date(now - i * 24 * 60 * 60 * 1000);
      const ymd = formatYmdInTz(ts, tz);
      const cell = { key: ymd, date: ymd, errors: 0, warnings: 0, info: 0, total: 0 };
      buckets.push(cell);
      byKey.set(ymd, cell);
    }

    const startUtc = new Date(`${buckets[0].key}T00:00:00.000Z`);
    startUtc.setUTCDate(startUtc.getUTCDate() - 1);
    const endUtc = new Date(`${buckets[buckets.length - 1].key}T23:59:59.999Z`);
    endUtc.setUTCDate(endUtc.getUTCDate() + 1);

    const rows = await prisma.errorLog.findMany({
      where: { createdAt: { gte: startUtc, lte: endUtc } },
      select: { level: true, createdAt: true },
    });

    for (const r of rows) {
      const ymd = formatYmdInTz(r.createdAt, tz);
      const cell = byKey.get(ymd);
      if (!cell) continue;
      if (r.level === 'error')   cell.errors++;
      else if (r.level === 'warning') cell.warnings++;
      else if (r.level === 'info') cell.info++;
      cell.total = cell.errors + cell.warnings + cell.info;
    }

    return res.json({ success: true, data: buckets });
  } catch (err) {
    next(err);
  }
});

// POST /api/error-logs — frontend JS error capture (anonymous-friendly).
// optionalAuth: attaches tenant/user when a token is present, but still records
// crashes on public pages and before login (where authenticate would 401 the
// report and we'd stay blind — exactly how a render bug can hide for days).
router.post('/', reportLimiter, optionalAuth, async (req, res, next) => {
  try {
    const body = createErrorSchema.parse(req.body);
    // Endpoint ini publik/anonim — `metadata` datang dari klien dan bisa tanpa
    // sengaja membawa token/PII. Redaksi field sensitif (pakai aturan yang sama
    // dengan errorHandler) sebelum disimpan ke tabel yang dibaca super-admin.
    if (body.metadata) body.metadata = redactSensitive(body.metadata);
    const log  = await prisma.errorLog.create({
      data: { ...body, tenantId: req.user?.tenantId || null, userId: req.user?.id || null },
    });
    // Live broadcast — SAErrorLogPage refetches on receipt.
    emitErrorEvent('errorLog:created', { id: log.id, level: log.level, type: log.type, tenantId: log.tenantId });
    // Push alert to the Telegram group — throttled/deduped inside the service so
    // a crash loop can't spam it. Fire-and-forget: never delay the response.
    notifyError({
      level:    log.level,
      type:     log.type,
      message:  log.message,
      path:     log.path,
      tenantId: log.tenantId,
    }).catch(() => {});
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
    emitErrorEvent('errorLog:resolved', { ids, count: result.count });
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
    emitErrorEvent('errorLog:resolved', { ids: [log.id], count: 1 });
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
    emitErrorEvent('errorLog:deleted', { deleted: result.count });
    return res.json({ success: true, data: { deleted: result.count } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
