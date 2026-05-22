// Self-service endpoints untuk role=affiliate:
//   GET   /api/affiliate/me              — profil + status + saldo (live)
//   PATCH /api/affiliate/me              — update profil & metode pencairan
//   GET   /api/affiliate/stats           — KPI dashboard (referrals/commission/payouts)
//   GET   /api/affiliate/chart?days=30   — time-series earnings utk grafik dashboard
//   GET   /api/affiliate/referrals       — tenant yang direkrut
//   GET   /api/affiliate/commissions     — semua commission record (filter status)
//   GET   /api/affiliate/payouts         — riwayat payout
//   POST  /api/affiliate/payouts         — ajukan payout (klaim semua approved commission)
//   POST  /api/affiliate/referrals/claim — klaim manual tenant yg daftar tanpa link (status=pending)
//   DELETE /api/affiliate/referrals/:id  — batalkan klaim manual sendiri yg masih pending

const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { recordAudit } = require('../utils/auditLog');
const { getIO } = require('../config/socket');

const SUPPORT_ROOM = 'support';
const MIN_PAYOUT = Number(process.env.AFFILIATE_MIN_PAYOUT || 100000); // Rp 100rb default

function emitSA(event, payload) {
  try {
    const io = getIO();
    if (io) io.to(SUPPORT_ROOM).emit(event, payload);
  } catch { /* noop */ }
}

// Resolver — ambil Affiliate berdasarkan req.user.id. Membatasi semua endpoint
// di file ini ke affiliate yang ter-otentikasi saja.
async function loadAffiliate(req, res, next) {
  try {
    const aff = await prisma.affiliate.findUnique({
      where: { userId: req.user.id },
      include: { user: { select: { id: true, email: true, name: true, phone: true, photo: true } } },
    });
    if (!aff) return res.status(404).json({ success: false, error: 'Profil affiliate belum dibuat' });
    req.affiliate = aff;
    next();
  } catch (err) { next(err); }
}

// Saldo siap-tarik = SUM(approved & belum tertaut payout). Komisi 'paid'/'pending'/'void'
// tidak ikut.
async function computeBalance(affiliateId) {
  const agg = await prisma.affiliateCommission.aggregate({
    _sum: { amount: true },
    where: { affiliateId, status: 'approved', payoutId: null },
  });
  return agg._sum.amount || 0;
}

router.use(authenticate, requireRole('affiliate'), loadAffiliate);

// ── Profile ───────────────────────────────────────────────────────────────

router.get('/me', async (req, res, next) => {
  try {
    const balance = await computeBalance(req.affiliate.id);
    const { user, ...rest } = req.affiliate;
    res.json({
      success: true,
      data: {
        ...rest,
        user,
        balance,
      },
    });
  } catch (err) { next(err); }
});

const updateMeSchema = z.object({
  displayName:   z.string().max(150).optional(),
  bio:           z.string().max(500).optional(),
  phone:         z.string().min(8).max(20).optional(),
  payoutMethod:  z.enum(['bank_transfer', 'gopay', 'ovo', 'dana']).optional(),
  payoutAccount: z.string().min(3).max(80).optional(),
  payoutHolder:  z.string().min(2).max(150).optional(),
});

router.patch('/me', async (req, res, next) => {
  try {
    const body = updateMeSchema.parse(req.body);
    const affData = {};
    const userData = {};
    if (body.displayName !== undefined)   affData.displayName = body.displayName;
    if (body.bio !== undefined)            affData.bio = body.bio;
    if (body.payoutMethod !== undefined)   affData.payoutMethod = body.payoutMethod;
    if (body.payoutAccount !== undefined)  affData.payoutAccount = body.payoutAccount;
    if (body.payoutHolder !== undefined)   affData.payoutHolder = body.payoutHolder;
    if (body.phone)                        userData.phone = body.phone;

    const updated = await prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length) {
        await tx.user.update({ where: { id: req.user.id }, data: userData });
      }
      return tx.affiliate.update({
        where: { id: req.affiliate.id },
        data: affData,
        include: { user: { select: { id: true, email: true, name: true, phone: true, photo: true } } },
      });
    });
    const balance = await computeBalance(req.affiliate.id);
    res.json({ success: true, data: { ...updated, balance } });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// ── Dashboard stats & chart ───────────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    const affiliateId = req.affiliate.id;
    const now = new Date();
    const last30 = new Date(now.getTime() - 30 * 86400 * 1000);

    const [refCount, refLast30, commActive, commPending, commPaid, commAll, payoutPending, payoutPaid, balance] = await Promise.all([
      prisma.affiliateReferral.count({ where: { affiliateId } }),
      prisma.affiliateReferral.count({ where: { affiliateId, createdAt: { gte: last30 } } }),
      prisma.affiliateCommission.aggregate({
        _sum: { amount: true }, _count: true,
        where: { affiliateId, status: { in: ['approved', 'pending'] } },
      }),
      prisma.affiliateCommission.aggregate({
        _sum: { amount: true }, _count: true,
        where: { affiliateId, status: 'pending' },
      }),
      prisma.affiliateCommission.aggregate({
        _sum: { amount: true }, _count: true,
        where: { affiliateId, status: 'paid' },
      }),
      prisma.affiliateCommission.aggregate({
        _sum: { amount: true }, _count: true,
        where: { affiliateId, status: { not: 'void' } },
      }),
      prisma.affiliatePayout.aggregate({
        _sum: { amount: true }, _count: true,
        where: { affiliateId, status: { in: ['requested', 'processing'] } },
      }),
      prisma.affiliatePayout.aggregate({
        _sum: { amount: true }, _count: true,
        where: { affiliateId, status: 'paid' },
      }),
      computeBalance(affiliateId),
    ]);

    res.json({
      success: true,
      data: {
        referrals:          { total: refCount, last30: refLast30 },
        commissionPending:  { amount: commPending._sum.amount || 0, count: commPending._count },
        commissionApproved: { amount: commActive._sum.amount || 0,  count: commActive._count },
        commissionPaid:     { amount: commPaid._sum.amount || 0,    count: commPaid._count },
        commissionLifetime: { amount: commAll._sum.amount || 0,     count: commAll._count },
        payoutPending:      { amount: payoutPending._sum.amount || 0, count: payoutPending._count },
        payoutPaid:         { amount: payoutPaid._sum.amount || 0,    count: payoutPaid._count },
        balance, // saldo siap-tarik
        minPayout: MIN_PAYOUT,
      },
    });
  } catch (err) { next(err); }
});

router.get('/chart', async (req, res, next) => {
  try {
    const days = Math.min(180, Math.max(7, Number(req.query.days) || 30));
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - days + 1);

    const commissions = await prisma.affiliateCommission.findMany({
      where: { affiliateId: req.affiliate.id, createdAt: { gte: since }, status: { not: 'void' } },
      select: { amount: true, createdAt: true },
    });
    const referrals = await prisma.affiliateReferral.findMany({
      where: { affiliateId: req.affiliate.id, createdAt: { gte: since } },
      select: { createdAt: true },
    });

    // Bucket by YYYY-MM-DD.
    const buckets = new Map();
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 86400 * 1000);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { date: key, commission: 0, referrals: 0 });
    }
    for (const c of commissions) {
      const k = c.createdAt.toISOString().slice(0, 10);
      if (buckets.has(k)) buckets.get(k).commission += c.amount;
    }
    for (const r of referrals) {
      const k = r.createdAt.toISOString().slice(0, 10);
      if (buckets.has(k)) buckets.get(k).referrals += 1;
    }
    res.json({ success: true, data: Array.from(buckets.values()) });
  } catch (err) { next(err); }
});

// ── Lists ─────────────────────────────────────────────────────────────────

router.get('/referrals', async (req, res, next) => {
  try {
    const data = await prisma.affiliateReferral.findMany({
      where: { affiliateId: req.affiliate.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        tenant: {
          select: {
            id: true, name: true, slug: true, createdAt: true, isSuspended: true,
            subscription: { select: { package: true, status: true, endDate: true, billingCycle: true } },
          },
        },
      },
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/commissions', async (req, res, next) => {
  try {
    const status = req.query.status && req.query.status !== 'all' ? String(req.query.status) : undefined;
    const where = { affiliateId: req.affiliate.id };
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

router.get('/payouts', async (req, res, next) => {
  try {
    const data = await prisma.affiliatePayout.findMany({
      where: { affiliateId: req.affiliate.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Request payout ────────────────────────────────────────────────────────

const requestPayoutSchema = z.object({
  note: z.string().max(500).optional(),
});

router.post('/payouts', async (req, res, next) => {
  try {
    const aff = req.affiliate;
    if (aff.status !== 'active') {
      return res.status(403).json({ success: false, error: 'Akun affiliate Anda belum aktif' });
    }
    if (!aff.payoutMethod || !aff.payoutAccount) {
      return res.status(400).json({ success: false, error: 'Lengkapi metode pencairan dulu di profil.' });
    }

    const body = requestPayoutSchema.parse(req.body);
    const balance = await computeBalance(aff.id);

    if (balance < MIN_PAYOUT) {
      return res.status(400).json({
        success: false,
        error: `Saldo siap-tarik (Rp${balance.toLocaleString('id-ID')}) belum mencapai minimum Rp${MIN_PAYOUT.toLocaleString('id-ID')}.`,
      });
    }

    // Cek tidak ada payout berjalan dulu — cegah multi-request bersamaan.
    const inFlight = await prisma.affiliatePayout.findFirst({
      where: { affiliateId: aff.id, status: { in: ['requested', 'processing'] } },
    });
    if (inFlight) {
      return res.status(400).json({ success: false, error: 'Sudah ada permintaan pencairan yang sedang diproses.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const payout = await tx.affiliatePayout.create({
        data: {
          affiliateId:   aff.id,
          amount:        balance,
          method:        aff.payoutMethod,
          account:       aff.payoutAccount,
          holder:        aff.payoutHolder,
          status:        'requested',
          affiliateNote: body.note || null,
        },
      });
      // Tag semua commission approved + belum-terklaim ke payout ini.
      await tx.affiliateCommission.updateMany({
        where: { affiliateId: aff.id, status: 'approved', payoutId: null },
        data:  { payoutId: payout.id },
      });
      return payout;
    });

    await recordAudit(req, {
      action: 'affiliate.payout_request',
      target: `payout:${result.id}`,
      detail: `${aff.referralCode} — Rp${result.amount.toLocaleString('id-ID')}`,
      severity: 'info',
      actorId: req.user.id,
      actorName: req.user.name,
    });
    emitSA('affiliate:payout_requested', result);

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// ── Klaim manual rujukan ────────────────────────────────────────────────────
// Affiliate mengajukan klaim atas tenant yang sudah daftar TANPA memakai link
// rujukannya. Klaim dibuat berstatus 'pending' dan TIDAK menghasilkan komisi
// sampai super-admin menyetujui — mencegah affiliate mengklaim sembarang tenant.

const claimSchema = z.object({
  // Subdomain tenant (slug). Boleh menerima URL lengkap; kita ekstrak slug-nya.
  subdomain: z.string().min(2).max(120),
  note:      z.string().max(500).optional(),
});

// "budi.sembapos.com" / "https://budi.sembapos.com/.." / "Budi" → "budi"
function normalizeSlug(raw) {
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').split('/')[0]; // buang protokol & path
  s = s.split('.')[0];                              // ambil subdomain pertama
  return s.replace(/[^a-z0-9-]/g, '');
}

router.post('/referrals/claim', async (req, res, next) => {
  try {
    const aff = req.affiliate;
    if (aff.status !== 'active') {
      return res.status(403).json({ success: false, error: 'Akun affiliate Anda belum aktif.' });
    }
    const body = claimSchema.parse(req.body);
    const slug = normalizeSlug(body.subdomain);
    if (slug.length < 2) {
      return res.status(400).json({ success: false, error: 'Subdomain tenant tidak valid.' });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, deletedAt: true },
    });
    if (!tenant || tenant.deletedAt) {
      return res.status(404).json({ success: false, error: `Tenant "${slug}" tidak ditemukan.` });
    }

    // Tenant hanya boleh tertaut ke SATU affiliate (tenantId unik).
    const existing = await prisma.affiliateReferral.findUnique({
      where: { tenantId: tenant.id },
      select: { affiliateId: true, status: true },
    });
    if (existing) {
      if (existing.affiliateId === aff.id) {
        const label = existing.status === 'pending' ? 'sedang Anda klaim (menunggu persetujuan)'
          : existing.status === 'rejected' ? 'pernah Anda klaim namun ditolak admin'
          : 'sudah menjadi rujukan Anda';
        return res.status(409).json({ success: false, error: `Tenant ini ${label}.` });
      }
      return res.status(409).json({ success: false, error: 'Tenant ini sudah tertaut ke affiliate lain.' });
    }

    const created = await prisma.affiliateReferral.create({
      data: {
        affiliateId:  aff.id,
        tenantId:     tenant.id,
        referralCode: aff.referralCode,
        status:       'pending',
        source:       'manual',
        claimNote:    body.note?.trim() || null,
      },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });

    await recordAudit(req, {
      action: 'affiliate.claim_request',
      target: `referral:${created.id}`,
      detail: `${aff.referralCode} klaim tenant ${tenant.slug} (pending)`,
      severity: 'info',
      actorId: req.user.id,
      actorName: req.user.name,
    });
    emitSA('affiliate:claim_requested', { affiliateId: aff.id, referralId: created.id });

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    if (err?.code === 'P2002') return res.status(409).json({ success: false, error: 'Tenant ini sudah tertaut affiliate.' });
    next(err);
  }
});

router.delete('/referrals/:id', async (req, res, next) => {
  try {
    const ref = await prisma.affiliateReferral.findUnique({ where: { id: req.params.id } });
    if (!ref || ref.affiliateId !== req.affiliate.id) {
      return res.status(404).json({ success: false, error: 'Klaim tidak ditemukan.' });
    }
    // Hanya klaim manual yang masih menunggu / ditolak yang boleh ditarik.
    // Rujukan 'active'/'churned' (komisi nyata) tidak boleh dihapus affiliate.
    if (!(ref.source === 'manual' && (ref.status === 'pending' || ref.status === 'rejected'))) {
      return res.status(400).json({ success: false, error: 'Hanya klaim yang menunggu/ditolak yang bisa dibatalkan.' });
    }
    await prisma.affiliateReferral.delete({ where: { id: ref.id } });
    res.json({ success: true, data: { id: ref.id } });
  } catch (err) { next(err); }
});

module.exports = router;
