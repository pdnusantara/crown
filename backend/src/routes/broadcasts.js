const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { recordAudit } = require('../utils/auditLog');
const { getIO, tenantRoom } = require('../config/socket');

// Emit broadcast events to:
//   1. `support` room — every super-admin tab refreshes the broadcast list
//   2. each recipient `tenantRoom(tenantId)` — tenant-side notification drawer
//      / TopBar bell auto-updates without a manual refresh.
function emitBroadcastEvent(event, broadcast, recipientTenantIds = []) {
  try {
    const io = getIO();
    if (!io) return;
    io.to('support').emit(event, broadcast);
    for (const tid of recipientTenantIds) {
      io.to(tenantRoom(tid)).emit(event, broadcast);
    }
  } catch { /* observability — never throw */ }
}

const createBroadcastSchema = z.object({
  title: z.string().min(1).max(255),
  message: z.string().min(1),
  type: z.enum(['info', 'warning', 'error', 'success']).optional(),
  active: z.boolean().optional(),
  // Accept both shapes: `tenantIds: [..]` (canonical) and the legacy
  // `targetTenants: 'all' | [..]` that early frontend versions sent. Empty array
  // / 'all' / omitted → broadcast to every active tenant.
  tenantIds: z.array(z.string()).optional(),
  targetTenants: z.union([z.literal('all'), z.array(z.string())]).optional(),
});

// GET /api/broadcasts
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { active } = req.query;

    if (req.user.role === 'super_admin') {
      // SA sees all broadcasts
      const where = {};
      if (active !== undefined) where.active = active === 'true';

      const [data, total] = await Promise.all([
        prisma.broadcast.findMany({
          where,
          skip,
          take: limit,
          orderBy: { sentAt: 'desc' },
          include: {
            _count: { select: { recipients: true } },
          },
        }),
        prisma.broadcast.count({ where }),
      ]);

      // Expose read counts per broadcast so the SA list can show "X / Y read"
      // accurately. Single grouped query keeps this O(1) regardless of page size.
      const ids = data.map((b) => b.id);
      let readMap = {};
      if (ids.length > 0) {
        const readRows = await prisma.broadcastRecipient.groupBy({
          by: ['broadcastId'],
          where: { broadcastId: { in: ids }, isRead: true },
          _count: { _all: true },
        });
        readMap = Object.fromEntries(readRows.map((r) => [r.broadcastId, r._count._all]));
      }
      const enriched = data.map((b) => ({
        ...b,
        recipientsTotal: b._count?.recipients ?? 0,
        recipientsRead:  readMap[b.id] || 0,
      }));

      return res.json({ success: true, data: paginatedResponse(enriched, total, page, limit) });
    }

    // tenant_admin sees their received broadcasts
    const where = {
      tenantId: req.user.tenantId,
      broadcast: {},
    };
    if (active !== undefined) where.broadcast.active = active === 'true';

    const [recipientData, total] = await Promise.all([
      prisma.broadcastRecipient.findMany({
        where: {
          tenantId: req.user.tenantId,
          ...(active !== undefined ? { broadcast: { active: active === 'true' } } : {}),
        },
        skip,
        take: limit,
        orderBy: { broadcast: { sentAt: 'desc' } },
        include: {
          broadcast: true,
        },
      }),
      prisma.broadcastRecipient.count({
        where: {
          tenantId: req.user.tenantId,
          ...(active !== undefined ? { broadcast: { active: active === 'true' } } : {}),
        },
      }),
    ]);

    const data = recipientData.map((r) => ({
      ...r.broadcast,
      isRead: r.isRead,
      recipientId: r.id,
    }));

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/broadcasts/:id
router.get('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    if (req.user.role === 'super_admin') {
      const broadcast = await prisma.broadcast.findUnique({
        where: { id: req.params.id },
        include: { recipients: { include: { tenant: { select: { id: true, name: true } } } } },
      });
      if (!broadcast) return res.status(404).json({ success: false, error: 'Broadcast not found' });
      return res.json({ success: true, data: broadcast });
    }

    const recipient = await prisma.broadcastRecipient.findFirst({
      where: { broadcastId: req.params.id, tenantId: req.user.tenantId },
      include: { broadcast: true },
    });
    if (!recipient) return res.status(404).json({ success: false, error: 'Broadcast not found' });

    res.json({ success: true, data: { ...recipient.broadcast, isRead: recipient.isRead } });
  } catch (err) {
    next(err);
  }
});

// POST /api/broadcasts
router.post('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const parsed = createBroadcastSchema.parse(req.body);
    const { tenantIds, targetTenants, ...broadcastData } = parsed;

    // Resolve recipient list. Either `tenantIds: [..]`, `targetTenants: [..]`,
    // `targetTenants: 'all'`, or no field → broadcast to every active tenant.
    const explicitIds = (tenantIds && tenantIds.length > 0)
      ? tenantIds
      : (Array.isArray(targetTenants) ? targetTenants : null);

    const result = await prisma.$transaction(async (tx) => {
      const newBroadcast = await tx.broadcast.create({ data: broadcastData });

      let targetTenantIds = explicitIds;
      if (!targetTenantIds || targetTenantIds.length === 0) {
        const allTenants = await tx.tenant.findMany({
          where: { deletedAt: null },
          select: { id: true },
        });
        targetTenantIds = allTenants.map((t) => t.id);
      }

      if (targetTenantIds.length > 0) {
        await tx.broadcastRecipient.createMany({
          data: targetTenantIds.map((tenantId) => ({
            broadcastId: newBroadcast.id,
            tenantId,
          })),
          skipDuplicates: true,
        });
      }

      return { broadcast: newBroadcast, recipientIds: targetTenantIds };
    });

    const { broadcast, recipientIds } = result;

    await recordAudit(req, {
      action: 'broadcast.send',
      target: explicitIds ? `tenants:${recipientIds.length}` : 'tenants:all',
      detail: `"${broadcast.title}" — ${broadcast.type || 'info'} → ${recipientIds.length} tenant`,
      severity: 'info',
    });
    emitBroadcastEvent('broadcast:created', { ...broadcast, recipientsTotal: recipientIds.length, recipientsRead: 0 }, recipientIds);

    res.status(201).json({ success: true, data: { ...broadcast, recipientsTotal: recipientIds.length, recipientsRead: 0 } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/broadcasts/:id - update broadcast (SA)
router.patch('/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.broadcast.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Broadcast not found' });

    const body = z.object({
      title: z.string().optional(),
      message: z.string().optional(),
      active: z.boolean().optional(),
    }).parse(req.body);

    const broadcast = await prisma.broadcast.update({
      where: { id: req.params.id },
      data: body,
    });

    // Audit log: highlight active toggle since that's the most common operation.
    if (body.active !== undefined && body.active !== existing.active) {
      await recordAudit(req, {
        action: body.active ? 'broadcast.activate' : 'broadcast.deactivate',
        target: `broadcast:${broadcast.id}`,
        detail: `"${broadcast.title}"`,
        severity: 'info',
      });
    } else if (body.title || body.message) {
      await recordAudit(req, {
        action: 'broadcast.update',
        target: `broadcast:${broadcast.id}`,
        detail: `"${broadcast.title}"`,
        severity: 'info',
      });
    }
    // Notify recipient tenants so their notification drawer reflects the new
    // title / message / active state without a page refresh.
    const recipients = await prisma.broadcastRecipient.findMany({
      where: { broadcastId: broadcast.id },
      select: { tenantId: true },
    });
    emitBroadcastEvent('broadcast:updated', broadcast, recipients.map(r => r.tenantId));

    res.json({ success: true, data: broadcast });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/broadcasts/:id/read - mark as read (tenant_admin)
router.patch('/:id/read', authenticate, requireRole('tenant_admin'), async (req, res, next) => {
  try {
    const recipient = await prisma.broadcastRecipient.findFirst({
      where: { broadcastId: req.params.id, tenantId: req.user.tenantId },
    });
    if (!recipient) return res.status(404).json({ success: false, error: 'Broadcast not found' });

    await prisma.broadcastRecipient.update({
      where: { id: recipient.id },
      data: { isRead: true },
    });

    res.json({ success: true, data: { message: 'Broadcast marked as read' } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/broadcasts/:id (SA only)
router.delete('/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.broadcast.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Broadcast not found' });

    // Capture recipient list BEFORE delete cascade so we can broadcast the
    // removal event to each tenant's room.
    const recipients = await prisma.broadcastRecipient.findMany({
      where: { broadcastId: existing.id },
      select: { tenantId: true },
    });

    await prisma.broadcast.delete({ where: { id: req.params.id } });

    await recordAudit(req, {
      action: 'broadcast.delete',
      target: `broadcast:${existing.id}`,
      detail: `"${existing.title}"`,
      severity: 'warning',
    });
    emitBroadcastEvent('broadcast:deleted', { id: existing.id }, recipients.map(r => r.tenantId));

    res.json({ success: true, data: { message: 'Broadcast deleted successfully' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
