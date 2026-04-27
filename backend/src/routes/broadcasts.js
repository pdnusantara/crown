const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const createBroadcastSchema = z.object({
  title: z.string().min(1).max(255),
  message: z.string().min(1),
  type: z.enum(['info', 'warning', 'error', 'success']).optional(),
  active: z.boolean().optional(),
  tenantIds: z.array(z.string()).optional(), // specific tenants, empty = all
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

      return res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
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
    const { tenantIds, ...broadcastData } = createBroadcastSchema.parse(req.body);

    const broadcast = await prisma.$transaction(async (tx) => {
      const newBroadcast = await tx.broadcast.create({ data: broadcastData });

      // Determine recipients
      let targetTenantIds = tenantIds;
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

      return newBroadcast;
    });

    res.status(201).json({ success: true, data: broadcast });
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

    await prisma.broadcast.delete({ where: { id: req.params.id } });

    res.json({ success: true, data: { message: 'Broadcast deleted successfully' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
