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

// GET /api/promotions/:id/redemptions — daftar pemakaian
router.get('/:id/redemptions', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const data = await prisma.promotionRedemption.findMany({
      where: { promotionId: req.params.id },
      orderBy: { redeemedAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
