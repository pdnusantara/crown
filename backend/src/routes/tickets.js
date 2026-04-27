const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { emitTicketEvent } = require('../config/socket');

const ticketSelect = {
  id: true,
  tenantId: true,
  subject: true,
  description: true,
  category: true,
  priority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true, email: true } },
  tenant: { select: { id: true, name: true } },
  _count: { select: { replies: true } },
};

const createTicketSchema = z.object({
  subject: z.string().min(1).max(255),
  description: z.string().min(1),
  category: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});

const updateTicketSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});

// GET /api/tickets
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status, priority, category } = req.query;

    const where = {};

    if (req.user.role === 'tenant_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (category) where.category = { contains: category, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        select: ticketSelect,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.ticket.count({ where }),
    ]);

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/tickets/:id
router.get('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      select: {
        ...ticketSelect,
        replies: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            message: true,
            isAdmin: true,
            createdAt: true,
            author: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });

    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });

    if (req.user.role === 'tenant_admin' && ticket.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
});

// POST /api/tickets
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const body = createTicketSchema.parse(req.body);

    const tenantId = req.user.role === 'super_admin'
      ? (req.body.tenantId || req.user.tenantId)
      : req.user.tenantId;

    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });

    const ticket = await prisma.ticket.create({
      data: {
        ...body,
        tenantId,
        createdById: req.user.id,
      },
      select: ticketSelect,
    });

    emitTicketEvent('ticket:created', ticket);
    res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/tickets/:id - update status/priority (SA only)
router.patch('/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Ticket not found' });

    const body = updateTicketSchema.parse(req.body);
    const ticket = await prisma.ticket.update({
      where: { id: req.params.id },
      data: body,
      select: ticketSelect,
    });

    emitTicketEvent('ticket:updated', ticket);
    res.json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
});

// POST /api/tickets/:id/replies - add reply
router.post('/:id/replies', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const { message } = z.object({ message: z.string().min(1) }).parse(req.body);

    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });

    if (req.user.role === 'tenant_admin' && ticket.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const isAdmin = req.user.role === 'super_admin';

    const reply = await prisma.$transaction(async (tx) => {
      const newReply = await tx.ticketReply.create({
        data: {
          ticketId: req.params.id,
          authorId: req.user.id,
          message,
          isAdmin,
        },
        select: {
          id: true,
          message: true,
          isAdmin: true,
          createdAt: true,
          author: { select: { id: true, name: true, role: true } },
        },
      });

      // If admin replies, move ticket to in_progress if still open
      if (isAdmin && ticket.status === 'open') {
        await tx.ticket.update({
          where: { id: req.params.id },
          data: { status: 'in_progress' },
        });
      }

      return newReply;
    });

    // Ambil snapshot ticket terbaru untuk emit event (replies array + count)
    const fullTicket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      select: { ...ticketSelect, replies: { orderBy: { createdAt: 'asc' }, select: { id: true, message: true, isAdmin: true, createdAt: true, author: { select: { id: true, name: true, role: true } } } } },
    });
    emitTicketEvent('ticket:replied', fullTicket, { toUserId: ticket.createdById });

    res.status(201).json({ success: true, data: reply });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tickets/:id (SA only)
router.delete('/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Ticket not found' });

    await prisma.ticket.delete({ where: { id: req.params.id } });

    res.json({ success: true, data: { message: 'Ticket deleted successfully' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
