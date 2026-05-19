const router = require('express').Router();
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

// AuditLog tidak punya kolom tenantId — log "milik" tenant = log yang aktornya
// salah satu user tenant tsb. Resolve daftar userId per tenant.
async function tenantActorIds(tenantId) {
  const users = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true },
  });
  return users.map(u => u.id);
}

// Tenant non-SA dipin ke tenant-nya sendiri; SA boleh override lewat ?tenantId.
function resolveTenantId(req) {
  return req.user.role === 'super_admin' ? (req.query.tenantId || null) : req.user.tenantId;
}

// GET /api/audit-logs — log aktivitas tenant (paginated, terbaru dulu)
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { action, search, severity } = req.query;

    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const actorIds = await tenantActorIds(tenantId);
    if (actorIds.length === 0) {
      return res.json({ success: true, data: paginatedResponse([], 0, page, limit) });
    }

    const where = { actorId: { in: actorIds } };
    if (action)   where.action = { startsWith: String(action) };
    if (severity) where.severity = String(severity);
    if (search) {
      const s = String(search).trim();
      where.OR = [
        { detail:    { contains: s, mode: 'insensitive' } },
        { actorName: { contains: s, mode: 'insensitive' } },
        { action:    { contains: s, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) { next(err); }
});

// GET /api/audit-logs/actions — daftar action unik milik tenant (dropdown filter)
router.get('/actions', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const actorIds = await tenantActorIds(tenantId);
    if (actorIds.length === 0) return res.json({ success: true, data: [] });

    const rows = await prisma.auditLog.findMany({
      where: { actorId: { in: actorIds } },
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    });
    res.json({ success: true, data: rows.map(r => r.action) });
  } catch (err) { next(err); }
});

module.exports = router;
