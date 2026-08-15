const router = require('express').Router();
const { z }  = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { recordAudit } = require('../utils/auditLog');
const { getIO } = require('../config/socket');

function emitPromoEvent(event, promo) {
  try {
    const io = getIO();
    if (io) io.to('support').emit(event, promo);
  } catch { /* observability — never throw */ }
}

const promoSchema = z.object({
  code:          z.string().min(3).max(40).transform(s => s.toUpperCase()),
  description:   z.string().max(500).nullish(),
  discountType:  z.enum(['percent', 'flat']),
  discountValue: z.number().int().min(1),
  validFrom:     z.string().datetime().nullish(),
  validUntil:    z.string().datetime().nullish(),
  maxUses:       z.number().int().min(1).nullish(),
  appliesTo:     z.array(z.enum(['subscription', 'upgrade', 'branch_addon'])).default([]),
  packageScope:  z.array(z.enum(['Basic', 'Pro', 'Enterprise'])).default([]),
  cycleScope:    z.array(z.enum(['monthly', 'annual'])).default([]),
  isActive:      z.boolean().default(true),
});

const promoSelect = {
  id: true, code: true, description: true,
  discountType: true, discountValue: true,
  validFrom: true, validUntil: true,
  maxUses: true, usedCount: true,
  appliesTo: true, packageScope: true, cycleScope: true,
  isActive: true, createdAt: true, updatedAt: true,
  _count: { select: { redemptions: true } },
};

// GET /api/promotions — super_admin
router.get('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const data = await prisma.promotion.findMany({
      orderBy: { createdAt: 'desc' },
      select: promoSelect,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /api/promotions — super_admin: buat promo baru
router.post('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const body = promoSchema.parse(req.body);

    if (body.discountType === 'percent' && body.discountValue > 100) {
      return res.status(400).json({ success: false, error: 'Diskon persen maksimum 100' });
    }

    const exists = await prisma.promotion.findUnique({ where: { code: body.code } });
    if (exists) return res.status(409).json({ success: false, error: 'Kode promo sudah ada' });

    const promo = await prisma.promotion.create({
      data: {
        ...body,
        validFrom:  body.validFrom  ? new Date(body.validFrom)  : null,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
      },
      select: promoSelect,
    });
    await recordAudit(req, {
      action: 'promotion.create',
      target: `promotion:${promo.id}`,
      detail: `${promo.code} — ${promo.discountType === 'percent' ? `${promo.discountValue}%` : `Rp${promo.discountValue.toLocaleString('id-ID')}`}`,
      severity: 'success',
    });
    emitPromoEvent('promotion:created', promo);
    res.status(201).json({ success: true, data: promo });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// PUT /api/promotions/:id — update
router.put('/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const before = await prisma.promotion.findUnique({ where: { id: req.params.id }, select: { isActive: true, code: true } });
    if (!before) return res.status(404).json({ success: false, error: 'Promo tidak ditemukan' });

    const body = promoSchema.partial().parse(req.body);
    const updated = await prisma.promotion.update({
      where: { id: req.params.id },
      data: {
        ...body,
        validFrom:  body.validFrom  ? new Date(body.validFrom)  : undefined,
        validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
      },
      select: promoSelect,
    });

    // Highlight isActive transitions in the audit trail; treat all other field
    // changes as a generic update.
    if (body.isActive !== undefined && body.isActive !== before.isActive) {
      await recordAudit(req, {
        action: body.isActive ? 'promotion.activate' : 'promotion.deactivate',
        target: `promotion:${updated.id}`,
        detail: updated.code,
        severity: 'info',
      });
    } else {
      await recordAudit(req, {
        action: 'promotion.update',
        target: `promotion:${updated.id}`,
        detail: updated.code,
        severity: 'info',
      });
    }
    emitPromoEvent('promotion:updated', updated);
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// DELETE /api/promotions/:id — soft via isActive=false agar redemption history tetap ada
router.delete('/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const updated = await prisma.promotion.update({
      where: { id: req.params.id },
      data: { isActive: false },
      select: promoSelect,
    });
    await recordAudit(req, {
      action: 'promotion.deactivate',
      target: `promotion:${updated.id}`,
      detail: updated.code,
      severity: 'warning',
    });
    emitPromoEvent('promotion:updated', updated);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// Enrich daftar redemption dengan nama tenant, kode promo, dan order id.
// PromotionRedemption hanya punya relasi Prisma ke Promotion — tenant &
// paymentOrder di-lookup manual lalu di-map.
async function enrichRedemptions(rows) {
  if (!rows.length) return [];
  const tenantIds = [...new Set(rows.map(r => r.tenantId).filter(Boolean))];
  const promoIds  = [...new Set(rows.map(r => r.promotionId).filter(Boolean))];
  const orderIds  = [...new Set(rows.map(r => r.paymentOrderId).filter(Boolean))];

  const [tenants, promos, orders] = await Promise.all([
    tenantIds.length ? prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true } }) : [],
    promoIds.length  ? prisma.promotion.findMany({ where: { id: { in: promoIds } }, select: { id: true, code: true, discountType: true } }) : [],
    orderIds.length  ? prisma.paymentOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, merchantOrderId: true, type: true, amount: true } }) : [],
  ]);
  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t]));
  const promoMap  = Object.fromEntries(promos.map(p => [p.id, p]));
  const orderMap  = Object.fromEntries(orders.map(o => [o.id, o]));

  return rows.map(r => ({
    ...r,
    tenantName:      tenantMap[r.tenantId]?.name || null,
    tenantSlug:      tenantMap[r.tenantId]?.slug || null,
    promotionCode:   promoMap[r.promotionId]?.code || null,
    merchantOrderId: orderMap[r.paymentOrderId]?.merchantOrderId || null,
    orderType:       orderMap[r.paymentOrderId]?.type || null,
    orderAmount:     orderMap[r.paymentOrderId]?.amount ?? null,
  }));
}

// GET /api/promotions/redemptions — riwayat pemakaian GLOBAL semua promo,
// dengan filter (kode/promo, tenant, rentang tanggal, pencarian) + ringkasan.
router.get('/redemptions', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { promotionId, code, tenantId, search, from, to, page = 1, limit = 25 } = req.query;
    const where = {};
    if (promotionId) where.promotionId = promotionId;
    if (tenantId)    where.tenantId    = tenantId;
    if (code) {
      const promo = await prisma.promotion.findUnique({ where: { code: String(code).toUpperCase() }, select: { id: true } });
      where.promotionId = promo?.id || '__none__';
    }
    if (from || to) {
      where.redeemedAt = {};
      if (from) where.redeemedAt.gte = new Date(from);
      if (to) { const end = new Date(to); end.setHours(23, 59, 59, 999); where.redeemedAt.lte = end; }
    }

    // Pencarian teks: tenant name / kode promo / order id bukan kolom redemption,
    // jadi resolve dulu ke daftar id agar count & pagination tetap konsisten.
    if (search) {
      const q = String(search).trim();
      const [matchTenants, matchPromos, matchOrders] = await Promise.all([
        prisma.tenant.findMany({ where: { name: { contains: q, mode: 'insensitive' } }, select: { id: true } }),
        prisma.promotion.findMany({ where: { code: { contains: q, mode: 'insensitive' } }, select: { id: true } }),
        prisma.paymentOrder.findMany({ where: { merchantOrderId: { contains: q, mode: 'insensitive' } }, select: { id: true } }),
      ]);
      where.OR = [
        { tenantId:       { in: matchTenants.map(t => t.id) } },
        { promotionId:    { in: matchPromos.map(p => p.id) } },
        { paymentOrderId: { in: matchOrders.map(o => o.id) } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [rows, total, agg, distinctTenants] = await Promise.all([
      prisma.promotionRedemption.findMany({ where, orderBy: { redeemedAt: 'desc' }, skip, take: Number(limit) }),
      prisma.promotionRedemption.count({ where }),
      prisma.promotionRedemption.aggregate({ where, _sum: { discountApplied: true } }),
      prisma.promotionRedemption.findMany({ where, select: { tenantId: true }, distinct: ['tenantId'] }),
    ]);

    const enriched = await enrichRedemptions(rows);

    const summary = {
      count: total,
      totalDiscount: agg._sum.discountApplied || 0,
      uniqueTenants: distinctTenants.length,
    };
    res.json({ success: true, data: { data: enriched, total, page: Number(page), limit: Number(limit), summary } });
  } catch (err) { next(err); }
});

// GET /api/promotions/:id/redemptions — daftar pemakaian satu promo (ter-enrich)
router.get('/:id/redemptions', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const rows = await prisma.promotionRedemption.findMany({
      where: { promotionId: req.params.id },
      orderBy: { redeemedAt: 'desc' },
      take: 200,
    });
    const data = await enrichRedemptions(rows);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
