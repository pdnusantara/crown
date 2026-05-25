const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { emitTicketEvent } = require('../config/socket');
const { recordAudit } = require('../utils/auditLog');

const replySelect = {
  id: true,
  message: true,
  isAdmin: true,
  attachments: true,
  createdAt: true,
  author: { select: { id: true, name: true, role: true } },
};

const ticketSelect = {
  id: true,
  tenantId: true,
  subject: true,
  description: true,
  category: true,
  priority: true,
  status: true,
  attachments: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true, email: true } },
  tenant: { select: { id: true, name: true } },
  _count: { select: { replies: true } },
};

// Lampiran disimpan sebagai URL relatif file di disk (lihat POST /upload).
// Dibatasi ke path uploads kami sendiri supaya nilai ini aman dirender <img src>.
const MAX_ATTACHMENTS = 6;
const attachmentsSchema = z
  .array(z.string().regex(/^\/api\/uploads\/tickets\/[\w.-]+$/, 'URL lampiran tidak valid'))
  .max(MAX_ATTACHMENTS)
  .optional();

const createTicketSchema = z.object({
  subject: z.string().min(1).max(255),
  description: z.string().min(1),
  category: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  attachments: attachmentsSchema,
});

const updateTicketSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});

// ── Upload lampiran gambar tiket ───────────────────────────────────────────────
// Disimpan sebagai FILE di disk (bukan base64) supaya payload tiket tetap kecil.
// Disajikan via `app.use('/api/uploads', express.static(.../uploads))` di server.js.
const TICKET_UPLOAD_DIR = path.join(__dirname, '../../uploads/tickets');
fs.mkdirSync(TICKET_UPLOAD_DIR, { recursive: true });

const ALLOWED_IMG_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const uploadTicketImage = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TICKET_UPLOAD_DIR),
    filename:    (req, file, cb) => {
      // Ekstensi dari MIME tervalidasi, BUKAN nama file klien — cegah simpan
      // nama .html/.svg yang lalu disajikan inline (stored-XSS). fileFilter
      // di bawah sudah membatasi mimetype ke daftar gambar.
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[file.mimetype] || '.jpg';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMG_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format gambar harus JPG, PNG, WebP, atau GIF'));
  },
}).single('image');

// POST /api/tickets/upload — unggah satu gambar lampiran, balas URL publiknya.
router.post('/upload', authenticate, requireRole('super_admin', 'tenant_admin'), (req, res) => {
  uploadTicketImage(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran gambar maksimal 5 MB' : err.message;
      return res.status(400).json({ success: false, error: msg });
    }
    if (!req.file) return res.status(400).json({ success: false, error: 'File gambar wajib diunggah (field "image")' });
    res.json({ success: true, data: { url: `/api/uploads/tickets/${req.file.filename}` } });
  });
});

// GET /api/tickets
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status, priority, category, search } = req.query;

    const where = {};

    if (req.user.role === 'tenant_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (category) where.category = { contains: category, mode: 'insensitive' };
    if (search) {
      where.OR = [
        { subject:     { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

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

// GET /api/tickets/stats — counts per status (sidebar badge & header KPI)
router.get('/stats', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const where = {};
    if (req.user.role === 'tenant_admin') where.tenantId = req.user.tenantId;
    else if (req.query.tenantId)          where.tenantId = req.query.tenantId;

    const grouped = await prisma.ticket.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const counts = { open: 0, in_progress: 0, resolved: 0 };
    for (const g of grouped) counts[g.status] = g._count._all;
    const total = counts.open + counts.in_progress + counts.resolved;
    res.json({ success: true, data: { ...counts, total } });
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
          select: replySelect,
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
        attachments: body.attachments || [],
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

    if (body.status && body.status !== existing.status) {
      const sevMap = { open: 'warning', in_progress: 'info', resolved: 'success' };
      await recordAudit(req, {
        action: `ticket.status.${body.status}`,
        target: `ticket:${ticket.id}`,
        detail: `"${ticket.subject}" → ${body.status}`,
        severity: sevMap[body.status] || 'info',
      });
    }
    if (body.priority && body.priority !== existing.priority) {
      await recordAudit(req, {
        action: 'ticket.priority',
        target: `ticket:${ticket.id}`,
        detail: `"${ticket.subject}" priority → ${body.priority}`,
        severity: 'info',
      });
    }

    res.json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
});

// POST /api/tickets/:id/replies - add reply
router.post('/:id/replies', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const { message, attachments } = z.object({
      message: z.string().max(5000).optional().default(''),
      attachments: attachmentsSchema,
    }).refine(
      (d) => (d.message && d.message.trim().length > 0) || (d.attachments && d.attachments.length > 0),
      { message: 'Balasan harus berisi pesan atau lampiran' },
    ).parse(req.body);

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
          attachments: attachments || [],
          isAdmin,
        },
        select: replySelect,
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
      select: { ...ticketSelect, replies: { orderBy: { createdAt: 'asc' }, select: replySelect } },
    });
    emitTicketEvent('ticket:replied', fullTicket, { toUserId: ticket.createdById });

    if (isAdmin) {
      await recordAudit(req, {
        action: 'ticket.reply',
        target: `ticket:${req.params.id}`,
        detail: `Admin replied to "${ticket.subject}"`,
        severity: 'info',
      });
    }

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

    await recordAudit(req, {
      action: 'ticket.delete',
      target: `ticket:${existing.id}`,
      detail: `"${existing.subject}"`,
      severity: 'warning',
    });

    res.json({ success: true, data: { message: 'Ticket deleted successfully' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
