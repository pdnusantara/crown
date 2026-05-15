const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { buildTenantDateRange, formatYmdInTz, normalizeTimezone, DEFAULT_TZ } = require('../utils/timezone');

// GET /api/super-admin/audit-log — paginated list
router.get('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { severity, action, actor, target, search, from, to } = req.query;
    const tz = normalizeTimezone(req.query.tz || DEFAULT_TZ);

    const where = {};
    if (severity) where.severity = severity;
    if (action)   where.action = { startsWith: action }; // namespace prefix match
    if (actor)    where.actorName = { contains: actor,  mode: 'insensitive' };
    if (target)   where.target = { contains: target, mode: 'insensitive' };
    if (search)   where.OR = [
      { detail: { contains: search, mode: 'insensitive' } },
      { target: { contains: search, mode: 'insensitive' } },
      { actorName: { contains: search, mode: 'insensitive' } },
    ];
    if (from || to) where.createdAt = buildTenantDateRange(from, to, tz);

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.count({ where }),
    ]);

    const enriched = await enrichLogTargets(data);
    return res.json(paginatedResponse(enriched, total, page, limit));
  } catch (err) {
    next(err);
  }
});

// Resolve target IDs (`tenant:cmoxx`, `user:cmoxx`, `order:CROWN-xxx`,
// `subscription:cmoxx`, `broadcast:cmoxx`, `ticket:cmoxx`) into human names so
// the frontend can render "Barber Kingdom" instead of an opaque ID.
async function enrichLogTargets(rows) {
  const buckets = { tenant: new Set(), user: new Set(), order: new Set(),
                    subscription: new Set(), broadcast: new Set(), ticket: new Set() };
  const parsed = rows.map((log) => {
    const t = parseTargetRef(log.target);
    if (t.type && buckets[t.type]) buckets[t.type].add(t.id);
    return { log, ref: t };
  });

  const [tenants, users, orders, subs, broadcasts, tickets] = await Promise.all([
    buckets.tenant.size       ? prisma.tenant.findMany({ where: { id: { in: [...buckets.tenant] } },       select: { id: true, name: true, slug: true } }) : [],
    buckets.user.size         ? prisma.user.findMany({ where: { id: { in: [...buckets.user] } },           select: { id: true, name: true, email: true, tenantId: true } }) : [],
    buckets.order.size        ? prisma.paymentOrder.findMany({ where: { merchantOrderId: { in: [...buckets.order] } }, select: { merchantOrderId: true, tenantId: true, amount: true, type: true } }) : [],
    buckets.subscription.size ? prisma.subscription.findMany({ where: { id: { in: [...buckets.subscription] } }, select: { id: true, tenantId: true, package: true } }) : [],
    buckets.broadcast.size    ? prisma.broadcast.findMany({ where: { id: { in: [...buckets.broadcast] } }, select: { id: true, title: true } }) : [],
    buckets.ticket.size       ? prisma.ticket.findMany({ where: { id: { in: [...buckets.ticket] } },       select: { id: true, subject: true, tenantId: true } }) : [],
  ]);

  const tenantMap    = Object.fromEntries(tenants.map(t => [t.id, t]));
  const userMap      = Object.fromEntries(users.map(u => [u.id, u]));
  const orderMap     = Object.fromEntries(orders.map(o => [o.merchantOrderId, o]));
  const subMap       = Object.fromEntries(subs.map(s => [s.id, s]));
  const broadcastMap = Object.fromEntries(broadcasts.map(b => [b.id, b]));
  const ticketMap    = Object.fromEntries(tickets.map(t => [t.id, t]));

  // Pull in tenant names for tenant IDs referenced indirectly (via order /
  // subscription / ticket / user).
  const indirect = new Set();
  for (const o of orders)     if (o.tenantId)   indirect.add(o.tenantId);
  for (const s of subs)       if (s.tenantId)   indirect.add(s.tenantId);
  for (const t of tickets)    if (t.tenantId)   indirect.add(t.tenantId);
  for (const u of users)      if (u.tenantId)   indirect.add(u.tenantId);
  const missing = [...indirect].filter(id => !tenantMap[id]);
  if (missing.length) {
    const more = await prisma.tenant.findMany({ where: { id: { in: missing } }, select: { id: true, name: true, slug: true } });
    for (const t of more) tenantMap[t.id] = t;
  }

  return parsed.map(({ log, ref }) => {
    let targetName = null;
    let targetTenantId = null;
    if (ref.type === 'tenant') {
      const t = tenantMap[ref.id];
      targetName = t?.name || null;
      targetTenantId = t?.id || null;
    } else if (ref.type === 'user') {
      const u = userMap[ref.id];
      targetName = u?.name || u?.email || null;
      targetTenantId = u?.tenantId || null;
    } else if (ref.type === 'order') {
      const o = orderMap[ref.id];
      targetTenantId = o?.tenantId || null;
      targetName = tenantMap[targetTenantId]?.name || null;
    } else if (ref.type === 'subscription') {
      const s = subMap[ref.id];
      targetTenantId = s?.tenantId || null;
      targetName = tenantMap[targetTenantId]?.name || null;
    } else if (ref.type === 'broadcast') {
      const b = broadcastMap[ref.id];
      targetName = b?.title || null;
    } else if (ref.type === 'ticket') {
      const tk = ticketMap[ref.id];
      targetName = tk?.subject || null;
      targetTenantId = tk?.tenantId || null;
    } else if (ref.type === 'tenants' && ref.id) {
      // `tenants:all` or `tenants:N`
      targetName = ref.id === 'all' ? 'Semua tenant' : `${ref.id} tenant`;
    }
    return { ...log, targetType: ref.type, targetId: ref.id, targetName, targetTenantId };
  });
}

function parseTargetRef(target) {
  if (!target || typeof target !== 'string') return { type: null, id: null };
  const i = target.indexOf(':');
  if (i <= 0) return { type: null, id: null };
  return { type: target.slice(0, i), id: target.slice(i + 1) };
}

// GET /api/super-admin/audit-log/actions — distinct action codes for filter dropdown
router.get('/actions', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const rows = await prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    });
    return res.json({ success: true, data: rows.map(r => r.action) });
  } catch (err) {
    next(err);
  }
});

// GET /api/super-admin/audit-log/stats — counts by severity (last N days)
router.get('/stats', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const tz = normalizeTimezone(req.query.tz || DEFAULT_TZ);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [bySeverity, total, todayCount] = await Promise.all([
      prisma.auditLog.groupBy({
        by: ['severity'],
        where: { createdAt: { gte: cutoff } },
        _count: { _all: true },
      }),
      prisma.auditLog.count({ where: { createdAt: { gte: cutoff } } }),
      // "Today" in tenant TZ — fetch a tight window then count via formatYmdInTz
      // for accuracy across DST-free zones we currently support (WIB/WITA/WIT).
      (async () => {
        const todayYmd = formatYmdInTz(new Date(), tz);
        const startUtc = new Date(`${todayYmd}T00:00:00.000Z`);
        startUtc.setUTCDate(startUtc.getUTCDate() - 1);
        const endUtc = new Date(`${todayYmd}T23:59:59.999Z`);
        endUtc.setUTCDate(endUtc.getUTCDate() + 1);
        const candidates = await prisma.auditLog.findMany({
          where: { createdAt: { gte: startUtc, lte: endUtc } },
          select: { createdAt: true },
        });
        return candidates.filter(c => formatYmdInTz(c.createdAt, tz) === todayYmd).length;
      })(),
    ]);

    const counts = { info: 0, success: 0, warning: 0, error: 0 };
    for (const row of bySeverity) {
      counts[row.severity] = row._count._all;
    }
    return res.json({
      success: true,
      data: { total, todayCount, bySeverity: counts, days, tz },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/super-admin/audit-log — purge old logs
const purgeSchema = z.object({
  olderThanDays: z.coerce.number().int().min(1).max(3650).optional(),
  severity:      z.string().optional(),
});
router.delete('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { olderThanDays, severity } = purgeSchema.parse(req.query);
    const where = {};
    if (olderThanDays) {
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      where.createdAt = { lte: cutoff };
    }
    if (severity) where.severity = severity;
    const result = await prisma.auditLog.deleteMany({ where });
    return res.json({ success: true, data: { deleted: result.count } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
