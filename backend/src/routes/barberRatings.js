// =============================================================================
// Barber Ratings API — Audit production-ready v3 (2026-05-15)
//
// Security:
// - SEMUA endpoint authenticate + requireRole + enforce tenantId scope.
// - Non super_admin selalu di-scope `req.user.tenantId`.
// - Verify barber/transaction/customer belong to tenant sebelum insert.
// - Dedup unique constraint (transactionId, barberId).
//
// Endpoints:
//   POST   /                  — submit single rating (kasir/admin)
//   POST   /batch             — submit banyak sekaligus (kasir batch dari POS)
//   GET    /                  — list dengan filter lengkap + cursor pagination
//   GET    /stats             — aggregate untuk dashboard
//   GET    /export.csv        — server-side CSV stream (admin)
//   PATCH  /:id/publish       — moderasi publish/hide/pending
//   POST   /bulk-publish      — bulk moderation
//   POST   /bulk-hide
//   POST   /bulk-delete       — hard delete (super_admin only)
// =============================================================================
const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { recordAudit } = require('../utils/auditLog');
const { getIO, tenantRoom, userRoom } = require('../config/socket');

// ---- Constants --------------------------------------------------------------
const LOW_RATING_THRESHOLD = 2;
const PUBLISH_MIN_RATING   = 4;
const MAX_LIMIT            = 200;
const DEFAULT_LIMIT        = 50;
const BULK_MAX             = 500;

// ---- Helpers ----------------------------------------------------------------
/** Resolve tenantId from request. Non super_admin always uses own tenant. */
function resolveTenantId(req) {
  if (req.user.role === 'super_admin') {
    return req.body?.tenantId || req.query?.tenantId || null;
  }
  return req.user.tenantId;
}

/** Build `where` clause for list/stats/export — single source of truth. */
function buildWhereClause(req, tenantId) {
  const where = {};
  if (tenantId) where.tenantId = tenantId;
  if (req.query.barberId)      where.barberId  = String(req.query.barberId);
  if (req.query.branchId)      where.branchId  = String(req.query.branchId);
  if (req.query.transactionId) where.transactionId = String(req.query.transactionId);
  if (req.query.customerId)    where.customerId = String(req.query.customerId);
  if (req.query.publishStatus) where.publishStatus = String(req.query.publishStatus);
  if (req.query.hasTicket === 'true')  where.ticketId = { not: null };
  if (req.query.hasTicket === 'false') where.ticketId = null;
  if (req.query.hasComment === 'true')  where.comment = { not: null };
  if (req.query.hasComment === 'false') where.comment = null;

  // Rating range
  const ratingFilter = {};
  if (req.query.minRating) ratingFilter.gte = Number(req.query.minRating);
  if (req.query.maxRating) ratingFilter.lte = Number(req.query.maxRating);
  if (Object.keys(ratingFilter).length) where.rating = ratingFilter;

  // Date range
  const dateFilter = {};
  if (req.query.startDate) dateFilter.gte = new Date(req.query.startDate);
  if (req.query.endDate) {
    const d = new Date(req.query.endDate);
    d.setHours(23, 59, 59, 999);
    dateFilter.lte = d;
  }
  if (Object.keys(dateFilter).length) where.createdAt = dateFilter;

  // Search: case-insensitive partial match di comment + barber.name
  if (req.query.search) {
    const s = String(req.query.search).trim();
    if (s) {
      where.OR = [
        { comment: { contains: s, mode: 'insensitive' } },
        { barber: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }
  }

  // Role-based scoping. Barber hanya bisa lihat sendiri.
  if (req.user.role === 'barber') where.barberId = req.user.id;

  return where;
}

function emitRatingEvent(event, payload, tenantId, barberId) {
  try {
    const io = getIO();
    if (!io) return;
    if (tenantId) io.to(tenantRoom(tenantId)).emit(event, payload);
    if (barberId) io.to(userRoom(barberId)).emit(event, payload);
  } catch { /* observability */ }
}

function emitTicketEvent(event, payload, tenantId) {
  try {
    const io = getIO();
    if (!io) return;
    if (tenantId) io.to(tenantRoom(tenantId)).emit(event, payload);
    io.to('support').emit(event, payload);
  } catch { /* observability */ }
}

/** Auto-create ticket untuk rating ≤2. Idempotent — caller harus pastikan tidak double-call. */
async function autoCreateLowRatingTicket({ tenantId, rating, barberName, comment, transactionId, customerName, branchName, actorId }) {
  const priority = rating === 1 ? 'high' : 'medium';
  const subject  = `[Rating Rendah ★${rating}] ${barberName}`;
  const lines = [
    `Rating: ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} (${rating}/5)`,
    `Barber: ${barberName}`,
  ];
  if (branchName)    lines.push(`Cabang: ${branchName}`);
  if (customerName)  lines.push(`Pelanggan: ${customerName}`);
  if (transactionId) lines.push(`Transaksi: ${transactionId}`);
  lines.push('');
  lines.push(comment ? `Komentar pelanggan:\n"${comment}"` : '(Tanpa komentar)');
  lines.push('');
  lines.push('Auto-flagged dari rating rendah di POS. Mohon follow-up.');

  const ticket = await prisma.ticket.create({
    data: {
      tenantId,
      subject,
      description: lines.join('\n'),
      category:    'low_rating',
      priority,
      createdById: actorId,
    },
  });
  emitTicketEvent('ticket:created', ticket, tenantId);
  return ticket.id;
}

/** Verify barber belongs to tenant. Throws 404. */
async function verifyBarber(tenantId, barberId) {
  const barber = await prisma.user.findFirst({
    where: { id: barberId, tenantId, role: 'barber' },
    select: { id: true, name: true },
  });
  if (!barber) {
    const err = new Error('Barber tidak ditemukan');
    err.status = 404;
    throw err;
  }
  return barber;
}

/** Verify rating belongs to tenant. Throws 404/403. */
async function verifyRatingAccess(req, id, opts = {}) {
  const rating = await prisma.barberRating.findUnique({
    where: { id },
    include: opts.include || { barber: { select: { id: true, name: true } } },
  });
  if (!rating) {
    const err = new Error('Rating tidak ditemukan');
    err.status = 404;
    throw err;
  }
  if (req.user.role !== 'super_admin' && rating.tenantId !== req.user.tenantId) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
  return rating;
}

// ---- Validators -------------------------------------------------------------
const submitSchema = z.object({
  barberId:      z.string().min(1),
  rating:        z.number().int().min(1).max(5),
  transactionId: z.string().nullish(),
  customerId:    z.string().nullish(),
  branchId:      z.string().nullish(),
  comment:       z.string().trim().max(500).optional().nullable(),
});

const submitBatchSchema = z.object({
  transactionId: z.string().nullish(),
  customerId:    z.string().nullish(),
  branchId:      z.string().nullish(),
  ratings: z.array(z.object({
    barberId: z.string().min(1),
    rating:   z.number().int().min(1).max(5),
    comment:  z.string().trim().max(500).optional().nullable(),
  })).min(1).max(20),
});

const publishSchema = z.object({
  status: z.enum(['published', 'hidden', 'pending']),
});

const bulkIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(BULK_MAX),
});

// =============================================================================
// POST / — submit single
// =============================================================================
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const body = submitSchema.parse(req.body);
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId required' });

    const barber = await verifyBarber(tenantId, body.barberId);

    // Verify transaction & inherit branchId/customerId
    if (body.transactionId) {
      const tx = await prisma.transaction.findFirst({
        where: { id: body.transactionId, tenantId },
        select: { id: true, branchId: true, customerId: true },
      });
      if (!tx) return res.status(404).json({ success: false, error: 'Transaksi tidak ditemukan' });
      if (!body.branchId)   body.branchId   = tx.branchId;
      if (!body.customerId) body.customerId = tx.customerId;
    }

    // Verify branch belongs to tenant (defense in depth)
    if (body.branchId) {
      const br = await prisma.branch.findFirst({ where: { id: body.branchId, tenantId }, select: { id: true } });
      if (!br) return res.status(400).json({ success: false, error: 'Cabang tidak valid untuk tenant ini' });
    }
    // Verify customer belongs to tenant
    if (body.customerId) {
      const c = await prisma.customer.findFirst({ where: { id: body.customerId, tenantId }, select: { id: true } });
      if (!c) return res.status(400).json({ success: false, error: 'Customer tidak valid untuk tenant ini' });
    }

    try {
      let created = await prisma.barberRating.create({
        data: {
          tenantId,
          branchId:      body.branchId      || null,
          barberId:      body.barberId,
          transactionId: body.transactionId || null,
          customerId:    body.customerId    || null,
          rating:        body.rating,
          comment:       body.comment       || null,
          submittedById: req.user.id,
        },
      });

      if (body.rating <= LOW_RATING_THRESHOLD) {
        try {
          let branchName = null, customerName = null;
          if (body.branchId) {
            const br = await prisma.branch.findUnique({ where: { id: body.branchId }, select: { name: true } });
            branchName = br?.name || null;
          }
          if (body.customerId) {
            const c = await prisma.customer.findUnique({ where: { id: body.customerId }, select: { name: true } });
            customerName = c?.name || null;
          }
          const ticketId = await autoCreateLowRatingTicket({
            tenantId, rating: body.rating, barberName: barber.name, comment: body.comment,
            transactionId: body.transactionId, customerName, branchName, actorId: req.user.id,
          });
          created = await prisma.barberRating.update({
            where: { id: created.id },
            data:  { ticketId },
          });
        } catch (_) { /* never block on ticket fail */ }
      }
      emitRatingEvent('rating:created', created, tenantId, body.barberId);
      recordAudit(req, {
        action: 'rating.create',
        target: `barber:${body.barberId}`,
        detail: `★${body.rating} → ${barber.name}${body.comment ? ` — "${body.comment.slice(0, 60)}"` : ''}${created.ticketId ? ` (ticket:${created.ticketId})` : ''}`,
        severity: body.rating <= LOW_RATING_THRESHOLD ? 'warning' : 'info',
      });
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      if (err.code === 'P2002') {
        return res.status(409).json({ success: false, error: 'Rating untuk barber di transaksi ini sudah pernah diberikan' });
      }
      throw err;
    }
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
});

// =============================================================================
// POST /batch — submit banyak sekaligus
// =============================================================================
router.post('/batch', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const body = submitBatchSchema.parse(req.body);
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId required' });

    const barberIds = [...new Set(body.ratings.map(r => r.barberId))];
    const barbers = await prisma.user.findMany({
      where: { id: { in: barberIds }, tenantId, role: 'barber' },
      select: { id: true, name: true },
    });
    if (barbers.length !== barberIds.length) {
      return res.status(400).json({ success: false, error: 'Ada barber yang tidak valid untuk tenant ini' });
    }
    const barberNameMap = Object.fromEntries(barbers.map(b => [b.id, b.name]));

    let resolvedBranchId   = body.branchId   || null;
    let resolvedCustomerId = body.customerId || null;
    if (body.transactionId) {
      const tx = await prisma.transaction.findFirst({
        where: { id: body.transactionId, tenantId },
        select: { id: true, branchId: true, customerId: true },
      });
      if (!tx) return res.status(404).json({ success: false, error: 'Transaksi tidak ditemukan' });
      if (!resolvedBranchId)   resolvedBranchId   = tx.branchId;
      if (!resolvedCustomerId) resolvedCustomerId = tx.customerId;
    }
    // Defense in depth — branch & customer scope
    if (resolvedBranchId) {
      const br = await prisma.branch.findFirst({ where: { id: resolvedBranchId, tenantId }, select: { id: true } });
      if (!br) return res.status(400).json({ success: false, error: 'Cabang tidak valid untuk tenant ini' });
    }
    if (resolvedCustomerId) {
      const c = await prisma.customer.findFirst({ where: { id: resolvedCustomerId, tenantId }, select: { id: true } });
      if (!c) resolvedCustomerId = null; // diam-diam drop kalau invalid
    }

    const results = { created: 0, skipped: 0, errors: 0, ticketsCreated: 0 };
    const createdRows = [];

    // Pre-fetch branch + customer name 1x
    let branchName = null, customerName = null;
    if (resolvedBranchId) {
      const br = await prisma.branch.findUnique({ where: { id: resolvedBranchId }, select: { name: true } });
      branchName = br?.name || null;
    }
    if (resolvedCustomerId) {
      const c = await prisma.customer.findUnique({ where: { id: resolvedCustomerId }, select: { name: true } });
      customerName = c?.name || null;
    }

    for (const r of body.ratings) {
      try {
        let row = await prisma.barberRating.create({
          data: {
            tenantId,
            branchId:      resolvedBranchId,
            barberId:      r.barberId,
            transactionId: body.transactionId || null,
            customerId:    resolvedCustomerId,
            rating:        r.rating,
            comment:       r.comment || null,
            submittedById: req.user.id,
          },
        });
        if (r.rating <= LOW_RATING_THRESHOLD) {
          try {
            const ticketId = await autoCreateLowRatingTicket({
              tenantId, rating: r.rating, barberName: barberNameMap[r.barberId],
              comment: r.comment, transactionId: body.transactionId,
              customerName, branchName, actorId: req.user.id,
            });
            row = await prisma.barberRating.update({ where: { id: row.id }, data: { ticketId } });
            results.ticketsCreated++;
          } catch (_) { /* swallow */ }
        }
        createdRows.push(row);
        results.created++;
        emitRatingEvent('rating:created', row, tenantId, r.barberId);
        recordAudit(req, {
          action: 'rating.create',
          target: `barber:${r.barberId}`,
          detail: `★${r.rating} → ${barberNameMap[r.barberId]}${r.comment ? ` — "${r.comment.slice(0, 60)}"` : ''}${row.ticketId ? ` (ticket:${row.ticketId})` : ''}`,
          severity: r.rating <= LOW_RATING_THRESHOLD ? 'warning' : 'info',
        });
      } catch (err) {
        if (err.code === 'P2002') results.skipped++;
        else                       results.errors++;
      }
    }
    res.status(201).json({ success: true, data: createdRows, meta: results });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
});

// =============================================================================
// GET / — list dengan filter & pagination
// =============================================================================
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir', 'barber'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const where = buildWhereClause(req, tenantId);

    const limit  = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = req.query.cursor || undefined;

    // Sort whitelist
    const sortBy  = ['createdAt', 'rating'].includes(req.query.sortBy) ? req.query.sortBy : 'createdAt';
    const sortDir = req.query.sortDir === 'asc' ? 'asc' : 'desc';

    const [items, total] = await Promise.all([
      prisma.barberRating.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        include: {
          barber: { select: { id: true, name: true } },
        },
      }),
      // Total ringkas — hanya kalau client minta (mahal di tabel besar)
      req.query.withTotal === 'true'
        ? prisma.barberRating.count({ where })
        : Promise.resolve(null),
    ]);

    // Batch enrich (anti N+1)
    const customerIds    = [...new Set(items.filter(i => i.customerId).map(i => i.customerId))];
    const transactionIds = [...new Set(items.filter(i => i.transactionId).map(i => i.transactionId))];
    const branchIds      = [...new Set(items.filter(i => i.branchId).map(i => i.branchId))];

    const [customers, transactions, branches] = await Promise.all([
      customerIds.length
        ? prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } })
        : [],
      transactionIds.length
        ? prisma.transaction.findMany({ where: { id: { in: transactionIds } }, select: { id: true, total: true, createdAt: true } })
        : [],
      branchIds.length
        ? prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } })
        : [],
    ]);
    const customerMap    = Object.fromEntries(customers.map(c => [c.id, c.name]));
    const transactionMap = Object.fromEntries(transactions.map(t => [t.id, t]));
    const branchMap      = Object.fromEntries(branches.map(b => [b.id, b.name]));

    const hasMore = items.length > limit;
    const slice   = hasMore ? items.slice(0, limit) : items;
    const enriched = slice.map(i => ({
      ...i,
      customerName: i.customerId ? (customerMap[i.customerId] || null) : null,
      branchName:   i.branchId   ? (branchMap[i.branchId] || null)     : null,
      transaction:  i.transactionId ? (transactionMap[i.transactionId] || null) : null,
    }));

    res.json({
      success: true,
      data: enriched,
      meta: {
        hasMore,
        nextCursor: hasMore ? slice[slice.length - 1].id : null,
        total,
      },
    });
  } catch (err) { next(err); }
});

// =============================================================================
// GET /stats — aggregate
// =============================================================================
router.get('/stats', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId required' });

    const sinceDays = Math.min(Math.max(Number(req.query.days) || 7, 1), 365);
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

    const where = { tenantId, createdAt: { gte: since } };
    if (req.query.branchId) where.branchId = String(req.query.branchId);

    const [overall, perBarber, distribution, pendingPublish, lowCount, publishedCount] = await Promise.all([
      prisma.barberRating.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
      prisma.barberRating.groupBy({
        by: ['barberId'],
        where,
        _avg: { rating: true },
        _count: { _all: true },
        orderBy: { _count: { rating: 'desc' } },
        take: 10,
      }),
      prisma.barberRating.groupBy({
        by: ['rating'], where, _count: { _all: true }, orderBy: { rating: 'asc' },
      }),
      // KPI: berapa rating publishable yg belum di-moderasi
      prisma.barberRating.count({
        where: { tenantId, rating: { gte: PUBLISH_MIN_RATING }, comment: { not: null }, publishStatus: 'pending' },
      }),
      // KPI: berapa rating rendah dalam window
      prisma.barberRating.count({ where: { ...where, rating: { lte: LOW_RATING_THRESHOLD } } }),
      // KPI: berapa rating live di /book
      prisma.barberRating.count({ where: { tenantId, publishStatus: 'published' } }),
    ]);

    const barberIds = perBarber.map(b => b.barberId);
    const barbers = barberIds.length
      ? await prisma.user.findMany({ where: { id: { in: barberIds } }, select: { id: true, name: true } })
      : [];
    const nameMap = Object.fromEntries(barbers.map(b => [b.id, b.name]));

    res.json({
      success: true,
      data: {
        windowDays:    sinceDays,
        avgRating:     overall._avg.rating != null ? Math.round(overall._avg.rating * 10) / 10 : null,
        totalRatings:  overall._count._all,
        topBarbers: perBarber.map(b => ({
          barberId:  b.barberId,
          name:      nameMap[b.barberId] || 'Unknown',
          avgRating: Math.round(b._avg.rating * 10) / 10,
          count:     b._count._all,
        })),
        distribution: [1,2,3,4,5].map(r => ({
          rating: r,
          count:  distribution.find(d => d.rating === r)?._count?._all || 0,
        })),
        kpi: {
          pendingPublishCount: pendingPublish,
          lowRatingCount:      lowCount,
          publishedCount:      publishedCount,
        },
      },
    });
  } catch (err) { next(err); }
});

// =============================================================================
// GET /export.csv — server-side CSV
// =============================================================================
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
router.get('/export.csv', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).send('tenantId required');
    const where = buildWhereClause(req, tenantId);

    // Cap export ke 5000 row supaya tidak meledak memory
    const items = await prisma.barberRating.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: { barber: { select: { name: true } } },
    });
    const customerIds = [...new Set(items.filter(i => i.customerId).map(i => i.customerId))];
    const branchIds   = [...new Set(items.filter(i => i.branchId).map(i => i.branchId))];
    const [customers, branches] = await Promise.all([
      customerIds.length ? prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true } }) : [],
      branchIds.length   ? prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } })     : [],
    ]);
    const customerMap = Object.fromEntries(customers.map(c => [c.id, c.name]));
    const branchMap   = Object.fromEntries(branches.map(b => [b.id, b.name]));

    const headers = ['Tanggal', 'Rating', 'Barber', 'Cabang', 'Customer', 'Komentar', 'Transaksi', 'Publish', 'Tiket'];
    const rows = items.map(i => [
      new Date(i.createdAt).toISOString(),
      i.rating,
      i.barber?.name || '',
      i.branchId ? (branchMap[i.branchId] || '') : '',
      i.customerId ? (customerMap[i.customerId] || '') : '',
      i.comment || '',
      i.transactionId || '',
      i.publishStatus,
      i.ticketId || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
    const filename = `ratings-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv); // BOM untuk Excel
  } catch (err) { next(err); }
});

// =============================================================================
// PATCH /:id/publish — moderasi single
// =============================================================================
router.patch('/:id/publish', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const { status } = publishSchema.parse(req.body);
    const existing = await verifyRatingAccess(req, req.params.id);

    if (status === 'published' && existing.rating < PUBLISH_MIN_RATING) {
      return res.status(400).json({ success: false, error: `Hanya rating ≥${PUBLISH_MIN_RATING}★ yang boleh dipublikasi` });
    }
    if (status === 'published' && !existing.comment) {
      return res.status(400).json({ success: false, error: 'Rating tanpa komentar tidak bisa jadi testimoni' });
    }

    const updated = await prisma.barberRating.update({
      where: { id: req.params.id },
      data: {
        publishStatus: status,
        publishedAt:   status === 'published' ? new Date() : null,
        publishedById: status === 'published' ? req.user.id : null,
      },
    });
    emitRatingEvent('rating:updated', updated, existing.tenantId, existing.barberId);
    recordAudit(req, {
      action: 'rating.publish',
      target: `rating:${updated.id}`,
      detail: `${status} (★${existing.rating} ${existing.barber?.name || '—'})`,
      severity: 'info',
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
});

// =============================================================================
// POST /bulk-publish & /bulk-hide
// =============================================================================
async function bulkModerate(req, res, next, status) {
  try {
    const { ids } = bulkIdsSchema.parse(req.body);
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId required' });

    // Scope by tenant — TIDAK trust client ids
    const targets = await prisma.barberRating.findMany({
      where: {
        id: { in: ids },
        tenantId,
        ...(status === 'published' ? { rating: { gte: PUBLISH_MIN_RATING }, comment: { not: null } } : {}),
      },
      select: { id: true, barberId: true, rating: true, barber: { select: { name: true } } },
    });
    if (!targets.length) {
      return res.json({ success: true, data: { affected: 0, skipped: ids.length } });
    }
    const targetIds = targets.map(t => t.id);

    const result = await prisma.barberRating.updateMany({
      where: { id: { in: targetIds }, tenantId },
      data: {
        publishStatus: status,
        publishedAt:   status === 'published' ? new Date() : null,
        publishedById: status === 'published' ? req.user.id : null,
      },
    });

    // Emit per-row (klien butuh untuk realtime invalidate)
    for (const r of targets) {
      emitRatingEvent('rating:updated', { id: r.id, publishStatus: status, tenantId, barberId: r.barberId }, tenantId, r.barberId);
    }
    recordAudit(req, {
      action: 'rating.bulk_publish',
      target: `tenant:${tenantId}`,
      detail: `bulk ${status} → ${result.count} rating`,
      severity: 'info',
    });
    res.json({
      success: true,
      data: { affected: result.count, skipped: ids.length - result.count },
    });
  } catch (err) { next(err); }
}
router.post('/bulk-publish', authenticate, requireRole('super_admin', 'tenant_admin'), (req, res, next) => bulkModerate(req, res, next, 'published'));
router.post('/bulk-hide',    authenticate, requireRole('super_admin', 'tenant_admin'), (req, res, next) => bulkModerate(req, res, next, 'hidden'));

// =============================================================================
// POST /bulk-delete — super_admin only (audit purge)
// =============================================================================
router.post('/bulk-delete', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const { ids } = bulkIdsSchema.parse(req.body);
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId required' });

    const targets = await prisma.barberRating.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true, barberId: true, ticketId: true },
    });
    const targetIds = targets.map(t => t.id);
    if (!targetIds.length) return res.json({ success: true, data: { deleted: 0 } });

    const result = await prisma.barberRating.deleteMany({
      where: { id: { in: targetIds }, tenantId },
    });

    for (const r of targets) {
      emitRatingEvent('rating:deleted', { id: r.id, tenantId, barberId: r.barberId }, tenantId, r.barberId);
    }
    recordAudit(req, {
      action: 'rating.bulk_delete',
      target: `tenant:${tenantId}`,
      detail: `delete ${result.count} rating`,
      severity: 'warning',
    });
    res.json({ success: true, data: { deleted: result.count } });
  } catch (err) { next(err); }
});

module.exports = router;
