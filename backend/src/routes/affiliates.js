// Super-admin endpoints untuk mengelola program affiliate:
//   GET    /api/affiliates                — list affiliate (+filter, search, sort, paginasi)
//   GET    /api/affiliates/stats          — KPI total/active/pending/dst utk dashboard SA
//   POST   /api/affiliates                — buat affiliate baru (User+Affiliate atomik)
//   GET    /api/affiliates/:id            — detail
//   PATCH  /api/affiliates/:id            — update profil + rate + status + catatan
//   POST   /api/affiliates/:id/approve    — set status=active, sinkron approvedAt
//   POST   /api/affiliates/:id/suspend    — set status=suspended
//   POST   /api/affiliates/:id/reactivate — kembalikan ke active
//   POST   /api/affiliates/:id/reject     — set status=rejected (utk pending)
//   POST   /api/affiliates/:id/reset-password — generate password baru
//   GET    /api/affiliates/:id/referrals  — daftar tenant rujukan
//   GET    /api/affiliates/:id/commissions— daftar commission record
//   GET    /api/affiliates/:id/payouts    — daftar payout request
//   POST   /api/affiliates/payouts/:pid/process — super-admin: bayarkan payout
//   POST   /api/affiliates/payouts/:pid/reject  — super-admin: tolak payout
//   POST   /api/affiliates/commissions/:cid/approve — set commission jadi 'approved'
//   POST   /api/affiliates/commissions/:cid/void    — batalkan commission (refund/fraud)
//   GET    /api/affiliates/claims         — antrean klaim manual (default status=pending)
//   POST   /api/affiliates/referrals/:rid/approve-claim — setujui klaim → status=active
//   POST   /api/affiliates/referrals/:rid/reject-claim  — tolak klaim → status=rejected

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { recordAudit } = require('../utils/auditLog');
const { getIO } = require('../config/socket');

// Realtime broadcast ke super-admin room — UI list/detail langsung refresh
// tanpa polling. Sama pola dengan promotions/audit.
const SUPPORT_ROOM = 'support';
function emit(event, payload) {
  try {
    const io = getIO();
    if (io) io.to(SUPPORT_ROOM).emit(event, payload);
  } catch { /* observability — never throw */ }
}
function emitToAffiliate(userId, event, payload) {
  try {
    const io = getIO();
    if (io) io.to(`user:${userId}`).emit(event, payload);
  } catch { /* noop */ }
}

// Generate 8-char alfanumerik uppercase, hindari karakter ambigu (0/O, 1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateReferralCode(len = 8) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}
async function uniqueReferralCode() {
  for (let i = 0; i < 8; i++) {
    const code = generateReferralCode();
    const exists = await prisma.affiliate.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  // Fallback yang teoritis tidak akan tercapai (chance ~1e-58).
  throw new Error('Failed to generate unique referral code');
}

// Selector standar — dipakai konsisten di semua endpoint agar respons stabil.
const affiliateSelect = {
  id: true, referralCode: true, commissionRate: true, status: true,
  displayName: true, bio: true,
  payoutMethod: true, payoutAccount: true, payoutHolder: true,
  internalNotes: true, totalEarned: true, totalPaid: true,
  approvedAt: true, suspendedAt: true, createdAt: true, updatedAt: true,
  user: {
    select: { id: true, email: true, name: true, phone: true, photo: true, isActive: true, createdAt: true },
  },
  // referrals: hanya hitung yang tenant-nya belum dihapus (soft delete) — konsisten
  // dengan daftar rujukan yang juga memfilter tenant.deletedAt.
  _count: { select: { referrals: { where: { tenant: { deletedAt: null } } }, commissions: true, payouts: true } },
};

const createSchema = z.object({
  name:           z.string().min(2).max(150),
  email:          z.string().email().transform(e => e.trim().toLowerCase()),
  phone:          z.string().min(8).max(20),
  password:       z.string().min(8).max(72),
  commissionRate: z.number().min(0).max(1).optional(), // 0..1 (mis. 0.10 = 10%)
  displayName:    z.string().max(150).optional(),
  bio:            z.string().max(500).optional(),
  payoutMethod:   z.string().max(40).optional(),
  payoutAccount:  z.string().max(80).optional(),
  payoutHolder:   z.string().max(150).optional(),
  status:         z.enum(['pending', 'active', 'suspended', 'rejected']).optional(),
  internalNotes:  z.string().max(2000).optional(),
});

const updateSchema = createSchema.partial().omit({ password: true });

// ── List & stats ───────────────────────────────────────────────────────────

router.get('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { status, search, page = '1', limit = '20', sort = 'createdAt:desc' } = req.query;
    const where = {};
    if (status && status !== 'all') where.status = status;
    if (search) {
      const q = String(search).trim();
      if (q) {
        where.OR = [
          { referralCode: { contains: q, mode: 'insensitive' } },
          { displayName:  { contains: q, mode: 'insensitive' } },
          { user: { name:  { contains: q, mode: 'insensitive' } } },
          { user: { email: { contains: q, mode: 'insensitive' } } },
          { user: { phone: { contains: q, mode: 'insensitive' } } },
        ];
      }
    }
    const [sortField, sortDir] = String(sort).split(':');
    const orderBy = { [sortField || 'createdAt']: sortDir === 'asc' ? 'asc' : 'desc' };

    const take = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (Math.max(1, Number(page) || 1) - 1) * take;

    const [data, total] = await Promise.all([
      prisma.affiliate.findMany({ where, orderBy, skip, take, select: affiliateSelect }),
      prisma.affiliate.count({ where }),
    ]);
    res.json({ success: true, data: { data, total, page: Number(page), limit: take } });
  } catch (err) { next(err); }
});

router.get('/stats', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const [total, active, pending, suspended, totalReferrals, totalCommissionAgg, paidCommissionAgg, pendingPayouts, pendingClaims] = await Promise.all([
      prisma.affiliate.count(),
      prisma.affiliate.count({ where: { status: 'active' } }),
      prisma.affiliate.count({ where: { status: 'pending' } }),
      prisma.affiliate.count({ where: { status: 'suspended' } }),
      prisma.affiliateReferral.count({ where: { tenant: { deletedAt: null } } }),
      prisma.affiliateCommission.aggregate({ _sum: { amount: true }, where: { status: { in: ['approved', 'paid'] } } }),
      prisma.affiliateCommission.aggregate({ _sum: { amount: true }, where: { status: 'paid' } }),
      prisma.affiliatePayout.aggregate({ _sum: { amount: true }, _count: true, where: { status: { in: ['requested', 'processing'] } } }),
      prisma.affiliateReferral.count({ where: { source: 'manual', status: 'pending', tenant: { deletedAt: null } } }),
    ]);
    res.json({
      success: true,
      data: {
        total, active, pending, suspended,
        totalReferrals,
        totalCommission: totalCommissionAgg._sum.amount || 0,
        paidCommission:  paidCommissionAgg._sum.amount || 0,
        owedCommission:  (totalCommissionAgg._sum.amount || 0) - (paidCommissionAgg._sum.amount || 0),
        pendingPayouts:  { amount: pendingPayouts._sum.amount || 0, count: pendingPayouts._count || 0 },
        pendingClaims,
      },
    });
  } catch (err) { next(err); }
});

// ── Klaim manual: antrean & review ──────────────────────────────────────────
// Didaftarkan SEBELUM route GET '/:id' supaya '/claims' tidak tertangkap sebagai id.

router.get('/claims', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const status = req.query.status && req.query.status !== 'all' ? String(req.query.status) : 'pending';
    const data = await prisma.affiliateReferral.findMany({
      where: { source: 'manual', status, tenant: { deletedAt: null } },
      orderBy: { createdAt: 'asc' }, // antrean: tertua dulu
      take: 200,
      include: {
        tenant:    { select: { id: true, name: true, slug: true, createdAt: true, isSuspended: true,
          subscription: { select: { package: true, status: true } } } },
        affiliate: { select: { id: true, referralCode: true, commissionRate: true, status: true,
          user: { select: { name: true, email: true } } } },
      },
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

async function reviewClaim(req, res, next, decision) {
  try {
    const ref = await prisma.affiliateReferral.findUnique({
      where: { id: req.params.rid },
      include: { affiliate: { select: { userId: true, referralCode: true } }, tenant: { select: { slug: true } } },
    });
    if (!ref) return res.status(404).json({ success: false, error: 'Klaim tidak ditemukan' });
    if (ref.source !== 'manual' || ref.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Klaim tidak dalam status menunggu.' });
    }
    const note = String(req.body?.note || '').slice(0, 500) || null;
    const newStatus = decision === 'approve' ? 'active' : 'rejected';

    const updated = await prisma.affiliateReferral.update({
      where: { id: ref.id },
      data: { status: newStatus, reviewNote: note, reviewedAt: new Date(), reviewedById: req.user.id },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });

    await recordAudit(req, {
      action: `affiliate.claim_${decision}`,
      target: `referral:${ref.id}`,
      detail: `${ref.affiliate.referralCode} klaim tenant ${ref.tenant?.slug} → ${newStatus}${note ? ` (${note})` : ''}`,
      severity: decision === 'approve' ? 'success' : 'warning',
    });
    emit('affiliate:referral_updated', { affiliateId: ref.affiliateId, referralId: ref.id });
    emitToAffiliate(ref.affiliate.userId, 'affiliate:referral_updated', { referralId: ref.id, status: newStatus });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

router.post('/referrals/:rid/approve-claim', authenticate, requireRole('super_admin'), (req, res, next) => reviewClaim(req, res, next, 'approve'));
router.post('/referrals/:rid/reject-claim',  authenticate, requireRole('super_admin'), (req, res, next) => reviewClaim(req, res, next, 'reject'));

// ── Create ────────────────────────────────────────────────────────────────

router.post('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const [emailUser, emailTenant] = await Promise.all([
      prisma.user.findFirst({ where: { email: { equals: body.email, mode: 'insensitive' } }, select: { id: true } }),
      prisma.tenant.findFirst({ where: { email: { equals: body.email, mode: 'insensitive' } }, select: { id: true } }),
    ]);
    if (emailUser || emailTenant) {
      return res.status(409).json({ success: false, error: 'Email sudah terdaftar' });
    }

    const referralCode = await uniqueReferralCode();
    const passwordHash = await bcrypt.hash(body.password, 10);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email:    body.email,
          password: passwordHash,
          name:     body.name,
          phone:    body.phone,
          role:     'affiliate',
          isActive: true,
        },
      });
      const aff = await tx.affiliate.create({
        data: {
          userId:         user.id,
          referralCode,
          commissionRate: body.commissionRate ?? 0.10,
          status:         body.status || 'active',
          displayName:    body.displayName || body.name,
          bio:            body.bio || null,
          payoutMethod:   body.payoutMethod || null,
          payoutAccount:  body.payoutAccount || null,
          payoutHolder:   body.payoutHolder || null,
          internalNotes:  body.internalNotes || null,
          approvedAt:     (body.status || 'active') === 'active' ? new Date() : null,
        },
        select: affiliateSelect,
      });
      return aff;
    });

    await recordAudit(req, {
      action: 'affiliate.create',
      target: `affiliate:${created.id}`,
      detail: `${created.referralCode} — ${created.user.email}`,
      severity: 'success',
    });
    emit('affiliate:created', created);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// ── Detail / update ───────────────────────────────────────────────────────

router.get('/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const a = await prisma.affiliate.findUnique({ where: { id: req.params.id }, select: affiliateSelect });
    if (!a) return res.status(404).json({ success: false, error: 'Affiliate tidak ditemukan' });
    res.json({ success: true, data: a });
  } catch (err) { next(err); }
});

router.patch('/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    const before = await prisma.affiliate.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!before) return res.status(404).json({ success: false, error: 'Affiliate tidak ditemukan' });

    // Pisahkan field user vs affiliate. Email & password TIDAK diizinkan via update —
    // gunakan endpoint reset-password / pembuatan ulang.
    const affData = {};
    const userData = {};
    if (body.name)          userData.name = body.name;
    if (body.phone)         userData.phone = body.phone;
    if (body.commissionRate !== undefined) affData.commissionRate = body.commissionRate;
    if (body.displayName !== undefined)   affData.displayName = body.displayName;
    if (body.bio !== undefined)            affData.bio = body.bio;
    if (body.payoutMethod !== undefined)   affData.payoutMethod = body.payoutMethod;
    if (body.payoutAccount !== undefined)  affData.payoutAccount = body.payoutAccount;
    if (body.payoutHolder !== undefined)   affData.payoutHolder = body.payoutHolder;
    if (body.internalNotes !== undefined)  affData.internalNotes = body.internalNotes;
    if (body.status && body.status !== before.status) {
      affData.status = body.status;
      if (body.status === 'active' && !before.approvedAt) affData.approvedAt = new Date();
      if (body.status === 'suspended') affData.suspendedAt = new Date();
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length) {
        await tx.user.update({ where: { id: before.userId }, data: userData });
      }
      return tx.affiliate.update({ where: { id: req.params.id }, data: affData, select: affiliateSelect });
    });

    await recordAudit(req, {
      action: 'affiliate.update',
      target: `affiliate:${updated.id}`,
      detail: `${updated.referralCode} — ${updated.user.email}${affData.status ? ` status=${affData.status}` : ''}`,
      severity: 'info',
    });
    emit('affiliate:updated', updated);
    emitToAffiliate(before.userId, 'affiliate:self_updated', updated);
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// ── Status transitions ────────────────────────────────────────────────────

async function setStatus(req, res, next, status) {
  try {
    const before = await prisma.affiliate.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ success: false, error: 'Affiliate tidak ditemukan' });

    const data = { status };
    if (status === 'active' && !before.approvedAt) data.approvedAt = new Date();
    if (status === 'suspended') data.suspendedAt = new Date();

    const updated = await prisma.affiliate.update({ where: { id: req.params.id }, data, select: affiliateSelect });

    await recordAudit(req, {
      action: `affiliate.${status === 'active' ? (before.status === 'pending' ? 'approve' : 'reactivate') : status}`,
      target: `affiliate:${updated.id}`,
      detail: `${updated.referralCode} → ${status}`,
      severity: status === 'suspended' || status === 'rejected' ? 'warning' : 'success',
    });
    emit('affiliate:updated', updated);
    emitToAffiliate(before.userId, 'affiliate:self_updated', updated);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

router.post('/:id/approve',    authenticate, requireRole('super_admin'), (req, res, next) => setStatus(req, res, next, 'active'));
router.post('/:id/reactivate', authenticate, requireRole('super_admin'), (req, res, next) => setStatus(req, res, next, 'active'));
router.post('/:id/suspend',    authenticate, requireRole('super_admin'), (req, res, next) => setStatus(req, res, next, 'suspended'));
router.post('/:id/reject',     authenticate, requireRole('super_admin'), (req, res, next) => setStatus(req, res, next, 'rejected'));

// ── Reset password ────────────────────────────────────────────────────────

router.post('/:id/reset-password', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const aff = await prisma.affiliate.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!aff) return res.status(404).json({ success: false, error: 'Affiliate tidak ditemukan' });

    const newPassword = req.body?.password || crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) + '!';
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'Password minimal 8 karakter' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: aff.userId }, data: { password: hash } });

    await recordAudit(req, {
      action: 'affiliate.password_reset',
      target: `affiliate:${aff.id}`,
      detail: `${aff.referralCode} — password reset`,
      severity: 'warning',
    });
    res.json({ success: true, data: { password: newPassword } });
  } catch (err) { next(err); }
});

// ── Nested resources ──────────────────────────────────────────────────────

router.get('/:id/referrals', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const data = await prisma.affiliateReferral.findMany({
      // Sembunyikan rujukan ke tenant yang sudah dihapus super-admin (konsisten
      // dengan _count.referrals & halaman affiliate). Baris tetap ada di DB.
      where: { affiliateId: req.params.id, tenant: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        tenant: {
          select: {
            id: true, name: true, slug: true, email: true, isSuspended: true, createdAt: true,
            subscription: { select: { package: true, status: true, endDate: true, billingCycle: true } },
          },
        },
      },
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/commissions', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const status = req.query.status && req.query.status !== 'all' ? String(req.query.status) : undefined;
    const where = { affiliateId: req.params.id };
    if (status) where.status = status;
    const data = await prisma.affiliateCommission.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 500,
      include: {
        referral: { include: { tenant: { select: { id: true, name: true, slug: true } } } },
      },
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/payouts', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const data = await prisma.affiliatePayout.findMany({
      where: { affiliateId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Commission actions ────────────────────────────────────────────────────

router.post('/commissions/:cid/approve', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const before = await prisma.affiliateCommission.findUnique({ where: { id: req.params.cid } });
    if (!before) return res.status(404).json({ success: false, error: 'Commission tidak ditemukan' });
    if (before.status !== 'pending') {
      return res.status(400).json({ success: false, error: `Commission tidak dalam status pending (status=${before.status})` });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const c = await tx.affiliateCommission.update({ where: { id: before.id }, data: { status: 'approved' } });
      await tx.affiliate.update({
        where: { id: before.affiliateId },
        data:  { totalEarned: { increment: c.amount } },
      });
      await tx.affiliateReferral.update({
        where: { id: before.referralId },
        data:  { totalCommission: { increment: c.amount } },
      });
      return c;
    });
    await recordAudit(req, {
      action: 'affiliate.commission_approve',
      target: `commission:${updated.id}`,
      detail: `Rp${updated.amount.toLocaleString('id-ID')}`,
      severity: 'success',
    });
    emit('affiliate:commission_updated', updated);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.post('/commissions/:cid/void', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const before = await prisma.affiliateCommission.findUnique({ where: { id: req.params.cid } });
    if (!before) return res.status(404).json({ success: false, error: 'Commission tidak ditemukan' });
    if (before.status === 'void' || before.status === 'paid') {
      return res.status(400).json({ success: false, error: 'Commission tak bisa di-void (sudah dibayar/dibatalkan)' });
    }
    const reason = String(req.body?.reason || 'Dibatalkan oleh admin').slice(0, 500);
    const updated = await prisma.$transaction(async (tx) => {
      const c = await tx.affiliateCommission.update({
        where: { id: before.id },
        data:  { status: 'void', voidReason: reason },
      });
      if (before.status === 'approved') {
        await tx.affiliate.update({
          where: { id: before.affiliateId },
          data:  { totalEarned: { decrement: c.amount } },
        });
        await tx.affiliateReferral.update({
          where: { id: before.referralId },
          data:  { totalCommission: { decrement: c.amount } },
        });
      }
      return c;
    });
    await recordAudit(req, {
      action: 'affiliate.commission_void',
      target: `commission:${updated.id}`,
      detail: `Rp${updated.amount.toLocaleString('id-ID')} — ${reason}`,
      severity: 'warning',
    });
    emit('affiliate:commission_updated', updated);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ── Payout actions ────────────────────────────────────────────────────────

router.post('/payouts/:pid/process', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const before = await prisma.affiliatePayout.findUnique({ where: { id: req.params.pid } });
    if (!before) return res.status(404).json({ success: false, error: 'Payout tidak ditemukan' });
    if (before.status === 'paid' || before.status === 'rejected') {
      return res.status(400).json({ success: false, error: `Payout sudah ${before.status}` });
    }
    const adminNote = String(req.body?.adminNote || '').slice(0, 500) || null;
    const proofUrl  = String(req.body?.proofUrl || '').slice(0, 1000) || null;

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.affiliatePayout.update({
        where: { id: before.id },
        data:  {
          status: 'paid',
          adminNote, proofUrl,
          processedById: req.user.id,
          processedAt:   new Date(),
        },
      });
      // Tandai semua commission yg tertaut payout ini menjadi 'paid'.
      await tx.affiliateCommission.updateMany({
        where: { payoutId: p.id, status: { not: 'paid' } },
        data:  { status: 'paid', paidAt: new Date() },
      });
      await tx.affiliate.update({
        where: { id: before.affiliateId },
        data:  { totalPaid: { increment: p.amount } },
      });
      return p;
    });
    await recordAudit(req, {
      action: 'affiliate.payout_paid',
      target: `payout:${updated.id}`,
      detail: `Rp${updated.amount.toLocaleString('id-ID')}`,
      severity: 'success',
    });
    emit('affiliate:payout_updated', updated);
    const aff = await prisma.affiliate.findUnique({ where: { id: updated.affiliateId }, select: { userId: true } });
    if (aff) emitToAffiliate(aff.userId, 'affiliate:payout_updated', updated);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

router.post('/payouts/:pid/reject', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const before = await prisma.affiliatePayout.findUnique({ where: { id: req.params.pid } });
    if (!before) return res.status(404).json({ success: false, error: 'Payout tidak ditemukan' });
    if (before.status === 'paid' || before.status === 'rejected') {
      return res.status(400).json({ success: false, error: `Payout sudah ${before.status}` });
    }
    const adminNote = String(req.body?.adminNote || 'Ditolak oleh admin').slice(0, 500);

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.affiliatePayout.update({
        where: { id: before.id },
        data:  {
          status: 'rejected',
          adminNote,
          processedById: req.user.id,
          processedAt:   new Date(),
        },
      });
      // Lepas commission dari payout — kembali ke pool 'approved' siap ditarik ulang.
      await tx.affiliateCommission.updateMany({
        where: { payoutId: p.id },
        data:  { payoutId: null },
      });
      return p;
    });
    await recordAudit(req, {
      action: 'affiliate.payout_reject',
      target: `payout:${updated.id}`,
      detail: `Rp${updated.amount.toLocaleString('id-ID')} — ${adminNote}`,
      severity: 'warning',
    });
    emit('affiliate:payout_updated', updated);
    const aff = await prisma.affiliate.findUnique({ where: { id: updated.affiliateId }, select: { userId: true } });
    if (aff) emitToAffiliate(aff.userId, 'affiliate:payout_updated', updated);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

module.exports = router;
