const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { sendTransactionNotification } = require('../services/whatsappService');
const { requireLicensedBranch } = require('../middleware/requireLicensedBranch');
const { getIO, branchRoom, tenantRoom, userRoom } = require('../config/socket');
const { upsertCustomerByPhone } = require('../services/customerService');
const { buildTenantDateRange, normalizeTimezone, DEFAULT_TZ } = require('../utils/timezone');
const {
  POINTS_PER_RUPIAH,
  calcPointsEarn,
  calcRedeemValue,
  validateRedeem,
} = require('../utils/loyalty');
const { recordAudit } = require('../utils/auditLog');

// Resolve TZ untuk filter tanggal: super_admin pakai tenant target (kalau ada),
// non-super pakai tenant sendiri. Default Asia/Jakarta saat tidak tersedia.
async function resolveTxTz(req) {
  const tid = req.user.role === 'super_admin' ? req.query.tenantId : req.user.tenantId;
  if (!tid) return DEFAULT_TZ;
  const t = await prisma.tenant.findUnique({ where: { id: tid }, select: { timezone: true } });
  return normalizeTimezone(t?.timezone);
}

// Catatan Zod: `.optional()` saja TIDAK menerima `null` dari client — hanya
// `undefined`. Frontend POS mengirim `null` untuk field yang kosong (customerId,
// shiftId, barberId), jadi semua field opsional di-`nullish()` agar `null`
// juga diterima dan diperlakukan sama dengan tidak diisi.
const transactionItemSchema = z.object({
  serviceId: z.string().min(1),
  barberId: z.string().nullish(),
  name: z.string().min(1),
  price: z.number().int().min(0),
});

const createTransactionSchema = z.object({
  tenantId: z.string().nullish(),
  branchId: z.string().min(1),
  customerId: z.string().nullish(),
  // Snapshot identitas pelanggan — supaya struk dan laporan tetap utuh
  // bahkan untuk walk-in tanpa registrasi.
  customerName: z.string().nullish(),
  customerPhone: z.string().nullish(),
  shiftId: z.string().nullish(),
  // Optional: kalau transaksi ini hasil dari pembayaran tiket antrian, kasir
  // mengirim queueId. Backend akan resolve bookingId dari queue.notes.
  queueId: z.string().nullish(),
  bookingId: z.string().nullish(),
  subtotal: z.number().int().min(0),
  discountType: z.string().nullish(),
  discountValue: z.number().int().min(0).nullish(),
  discountAmount: z.number().int().min(0).nullish(),
  tax: z.number().int().min(0).nullish(),
  total: z.number().int().min(0),
  paymentMethod: z.enum(['cash', 'transfer', 'qris', 'card']).nullish(),
  cashReceived: z.number().int().min(0).nullish(),
  change: z.number().int().nullish(),
  items: z.array(transactionItemSchema).min(1),
  loyaltyPointsEarned: z.number().int().min(0).nullish(),
  pointsRedeemed: z.number().int().min(0).nullish(),
  voucherCode: z.string().nullish(),
});

// GET /api/transactions
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir', 'barber', 'customer'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { branchId, customerId, status, startDate, endDate, shiftId, paymentMethod, barberId, search } = req.query;

    const where = {};

    if (req.user.role !== 'super_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    // Barbers only see transactions containing their own items
    if (req.user.role === 'barber') {
      where.items = { some: { barberId: req.user.id } };
    }

    // Customers only see their own transactions
    if (req.user.role === 'customer') {
      where.customerId = req.user.id;
    }

    if (branchId) where.branchId = branchId;
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (shiftId) where.shiftId = shiftId;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    // Filter berdasarkan barber (admin view): override req.user.role==='barber' yang sudah di-set
    if (barberId) where.items = { some: { barberId } };
    if (search) {
      const s = String(search).trim();
      where.OR = [
        { id: { contains: s, mode: 'insensitive' } },
        { customer: { name: { contains: s, mode: 'insensitive' } } },
        { customerName: { contains: s, mode: 'insensitive' } },
        { customerPhone: { contains: s } },
        { items: { some: { name: { contains: s, mode: 'insensitive' } } } },
      ];
    }

    // Filter sumber: 'booking' (transaksi yang berasal dari booking) atau
    // 'walk_in' (transaksi langsung tanpa booking).
    const { source } = req.query;
    if (source === 'booking') where.bookingId = { not: null };
    else if (source === 'walk_in') where.bookingId = null;

    if (startDate || endDate) {
      const tz = await resolveTxTz(req);
      where.createdAt = buildTenantDateRange(startDate, endDate, tz);
    }

    const [data, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: { include: { service: { select: { id: true, name: true } } } },
          customer: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/transactions/summary — agregat sesuai filter (tidak terpengaruh pagination).
// Berguna agar kartu statistik di halaman tetap akurat saat tabel paginated.
router.get('/summary', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir', 'barber'), async (req, res, next) => {
  try {
    const { branchId, startDate, endDate, status, paymentMethod, barberId } = req.query;
    const where = {};
    if (req.user.role !== 'super_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }
    if (req.user.role === 'barber') {
      where.items = { some: { barberId: req.user.id } };
    }
    if (req.user.role === 'customer') where.customerId = req.user.id;
    if (branchId) where.branchId = branchId;
    if (paymentMethod) where.paymentMethod = paymentMethod;
    if (barberId) where.items = { some: { barberId } };

    if (startDate || endDate) {
      const tz = await resolveTxTz(req);
      where.createdAt = buildTenantDateRange(startDate, endDate, tz);
    }

    // Angka pendapatan HANYA dari transaksi 'completed' — transaksi yang
    // dibatalkan / refund tidak boleh ikut dihitung sebagai omzet. Kalau user
    // memfilter status tertentu secara eksplisit, hormati filter itu.
    const whereRevenue = { ...where, status: status || 'completed' };

    const [count, totals, byPayment, byStatus] = await Promise.all([
      prisma.transaction.count({ where: whereRevenue }),
      prisma.transaction.aggregate({
        where: whereRevenue,
        _sum: { total: true, subtotal: true, discountAmount: true },
        _avg: { total: true },
      }),
      prisma.transaction.groupBy({
        by: ['paymentMethod'],
        where: whereRevenue,
        _count: { _all: true },
        _sum: { total: true },
      }),
      // statusBreakdown tetap melihat SEMUA status (untuk badge jumlah batal).
      prisma.transaction.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
    ]);

    const paymentBreakdown = byPayment.reduce((acc, row) => {
      const key = row.paymentMethod || 'unknown';
      acc[key] = { count: row._count._all, total: row._sum.total || 0 };
      return acc;
    }, {});
    const statusBreakdown = byStatus.reduce((acc, row) => {
      const key = row.status || 'completed';
      acc[key] = row._count._all;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        count,
        totalRevenue: totals._sum.total || 0,
        totalSubtotal: totals._sum.subtotal || 0,
        totalDiscount: totals._sum.discountAmount || 0,
        avgTicket: Math.round(totals._avg.total || 0),
        paymentBreakdown,
        statusBreakdown,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/transactions/:id
router.get('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: req.params.id },
      include: {
        items: { include: { service: { select: { id: true, name: true, category: true } } } },
        customer: { select: { id: true, name: true, phone: true, loyaltyPoints: true, visitCount: true } },
        branch: { select: { id: true, name: true } },
        shift: { select: { id: true, kasirId: true, openedAt: true } },
        booking: {
          select: {
            id: true, date: true, time: true, source: true, status: true,
            serviceName: true, barberName: true, notes: true, createdAt: true,
          },
        },
      },
    });

    if (!transaction) return res.status(404).json({ success: false, error: 'Transaction not found' });

    if (req.user.role !== 'super_admin' && transaction.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: transaction });
  } catch (err) {
    next(err);
  }
});

// POST /api/transactions
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), requireLicensedBranch(), async (req, res, next) => {
  try {
    const body = createTransactionSchema.parse(req.body);

    if (req.user.role !== 'super_admin') {
      body.tenantId = req.user.tenantId;
    }
    if (!body.tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });

    // Validate voucherCode if provided
    if (body.voucherCode) {
      const voucher = await prisma.voucher.findFirst({
        where: {
          tenantId: body.tenantId,
          code: body.voucherCode,
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
      });
      if (!voucher) {
        return res.status(400).json({ success: false, error: 'Invalid or expired voucher code' });
      }
      if (voucher.maxUses !== null && voucher.usedCount >= voucher.maxUses) {
        return res.status(400).json({ success: false, error: 'Voucher usage limit reached' });
      }
    }

    let { items, loyaltyPointsEarned = 0, pointsRedeemed = 0, voucherCode, queueId, ...txData } = body;
    pointsRedeemed = Math.max(0, Math.floor(Number(pointsRedeemed) || 0));

    // === REDEMPTION VALIDATION ===
    // Validasi poin yang akan dipakai sebelum buat transaksi. Server adalah
    // pemegang kebenaran — frontend hanya boleh menyarankan, BE harus verify.
    if (pointsRedeemed > 0) {
      if (!txData.customerId && !(txData.customerName && txData.customerPhone)) {
        return res.status(400).json({ success: false, error: 'Tukar poin butuh customer terdaftar' });
      }
      // Cari customer untuk cek saldo. Kalau customerId belum di-set tapi ada
      // nama+telp, resolve via phone (upsert dilakukan di bawah).
      let customerRecord = null;
      if (txData.customerId) {
        customerRecord = await prisma.customer.findFirst({
          where: { id: txData.customerId, tenantId: txData.tenantId, deletedAt: null },
          select: { id: true, loyaltyPoints: true },
        });
      } else if (txData.customerPhone) {
        customerRecord = await prisma.customer.findFirst({
          where: { tenantId: txData.tenantId, phone: txData.customerPhone, deletedAt: null },
          select: { id: true, loyaltyPoints: true },
        });
      }
      if (!customerRecord) {
        return res.status(400).json({ success: false, error: 'Customer tidak ditemukan untuk tukar poin' });
      }
      const err = validateRedeem({
        points: pointsRedeemed,
        balance: customerRecord.loyaltyPoints,
        subtotal: Number(txData.subtotal) || 0,
      });
      if (err) {
        return res.status(400).json({ success: false, error: err });
      }
      // Untuk konsistensi total: pastikan diskon dari poin yang dihitung BE = FE
      const expectedPointDiscount = calcRedeemValue(pointsRedeemed);
      const submittedDiscount = Math.max(0, Number(txData.discountAmount) || 0);
      const submittedTotal    = Math.max(0, Number(txData.total) || 0);
      const submittedSubtotal = Math.max(0, Number(txData.subtotal) || 0);
      const submittedTax      = Math.max(0, Number(txData.tax) || 0);
      const expectedTotal     = Math.max(0, submittedSubtotal - submittedDiscount + submittedTax);
      // Toleransi 1 rupiah untuk pembulatan. Frontend harus include point
      // discount di `discountAmount` SEBELUM submit — backend cuma sanity-check.
      if (Math.abs(submittedTotal - expectedTotal) > 1) {
        return res.status(400).json({
          success: false,
          error: `Total tidak konsisten (expected ${expectedTotal}, got ${submittedTotal})`,
        });
      }
      // Pastikan discountAmount mengandung minimal nilai redeem
      if (submittedDiscount < expectedPointDiscount) {
        return res.status(400).json({
          success: false,
          error: 'discountAmount harus sudah termasuk diskon poin',
        });
      }
    }

    // Auto-calc loyalty points bila frontend tidak mengirim eksplisit.
    // Default: 1 poin per Rp10.000 net (setelah diskon). Hanya berlaku saat
    // transaksi punya customerId — walk-in tanpa nomor telepon tidak terhitung.
    // Bisa di-override per-transaksi dengan kirim `loyaltyPointsEarned`.
    if ((loyaltyPointsEarned == null || loyaltyPointsEarned === 0) && txData.customerId) {
      loyaltyPointsEarned = calcPointsEarn(txData.total);
    }
    // Persist pointsRedeemed, loyaltyPointsEarned & voucherCode ke kolom
    // transaksi — dipakai laporan DAN reversal saat transaksi dibatalkan.
    txData.pointsRedeemed = pointsRedeemed;
    txData.loyaltyPointsEarned = loyaltyPointsEarned || 0;
    if (voucherCode) txData.voucherCode = voucherCode;

    // Frontend POS mengirim `null` untuk field yang kosong. Setelah Zod
    // (.nullish()) field-field itu sudah lolos validasi, tapi Prisma menolak
    // `null` pada kolom non-nullable yang punya default (paymentMethod,
    // discountValue, dll). Hapus key yang bernilai null supaya Prisma jatuh
    // ke default kolom.
    for (const k of Object.keys(txData)) {
      if (txData[k] === null) delete txData[k];
    }

    // Kasir WAJIB punya shift terbuka sebelum membuat transaksi — setiap
    // transaksi harus tercatat dalam satu sesi kas yang bisa direkonsiliasi
    // di halaman Penutupan Shift. shiftId yang dikirim frontend diabaikan;
    // backend selalu memakai shift terbuka milik kasir tsb (anti-spoof).
    if (req.user.role === 'kasir') {
      const openShift = await prisma.shift.findFirst({
        where: { branchId: txData.branchId, kasirId: req.user.id, status: 'open' },
        select: { id: true },
        orderBy: { openedAt: 'desc' },
      });
      if (!openShift) {
        return res.status(409).json({
          success: false,
          error: 'Belum ada shift aktif. Buka shift terlebih dahulu sebelum melakukan transaksi.',
          code: 'NO_ACTIVE_SHIFT',
        });
      }
      txData.shiftId = openShift.id;
    }

    // Resolve bookingId & customer dari queue kalau transaksi datang dari
    // pembayaran tiket antrian. Berguna agar halaman Transaksi bisa
    // membedakan pelanggan booking vs walk-in.
    if (queueId) {
      try {
        const q = await prisma.queue.findUnique({
          where: { id: queueId },
          select: { customerId: true, customerName: true, customerPhone: true, notes: true, tenantId: true, branchId: true },
        });
        if (q && q.tenantId === txData.tenantId) {
          // Inherit customer info dari queue kalau frontend belum kirim
          if (!txData.customerId && q.customerId) txData.customerId = q.customerId;
          if (!txData.customerName && q.customerName) txData.customerName = q.customerName;
          if (!txData.customerPhone && q.customerPhone) txData.customerPhone = q.customerPhone;
          // Parse bookingId dari queue.notes (ditanam saat /bookings/:id/check-in)
          if (!txData.bookingId && q.notes) {
            try {
              const meta = JSON.parse(q.notes);
              if (meta?.bookingId) txData.bookingId = meta.bookingId;
            } catch { /* notes mungkin format lama, abaikan */ }
          }
        }
      } catch (_) { /* defensive */ }
    }

    // Auto-upsert customer agar walk-in tanpa registrasi tetap masuk daftar
    // pelanggan admin. Hanya jalan kalau ada nama+telp tapi belum ada customerId.
    if (!txData.customerId && txData.customerName && txData.customerPhone) {
      try {
        const c = await upsertCustomerByPhone(prisma, {
          tenantId: txData.tenantId,
          name: txData.customerName,
          phone: txData.customerPhone,
        });
        if (c?.id) txData.customerId = c.id;
      } catch (_) { /* never block transaction on customer upsert */ }
    }
    const cleanedItems = items.map((it) => {
      const next = { ...it };
      for (const k of Object.keys(next)) {
        if (next[k] === null) delete next[k];
      }
      return next;
    });

    // Use Prisma transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Create transaction
      const transaction = await tx.transaction.create({
        data: {
          ...txData,
          items: {
            create: cleanedItems,
          },
        },
        include: {
          items: { include: { service: { select: { id: true, name: true } } } },
          customer: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
        },
      });

      // Update customer loyalty & visit count if customer provided.
      // Logika: net delta = earned - redeemed. Tapi kita TULIS dua ledger entry
      // terpisah (redeem dulu, lalu earn) supaya riwayat tetap granular &
      // bisa di-audit per kategori.
      if (txData.customerId) {
        // 1) REDEEM: kurangi saldo dulu (kalau ada)
        if (pointsRedeemed > 0) {
          const afterRedeem = await tx.customer.update({
            where: { id: txData.customerId },
            data: { loyaltyPoints: { decrement: pointsRedeemed } },
            select: { loyaltyPoints: true },
          });
          // Defensive: kalau race condition bikin saldo < 0, abort transaksi
          if (afterRedeem.loyaltyPoints < 0) {
            throw new Error('Saldo poin tidak cukup saat finalisasi (race)');
          }
          await tx.pointHistory.create({
            data: {
              tenantId: txData.tenantId,
              customerId: txData.customerId,
              delta: -pointsRedeemed,
              balanceAfter: afterRedeem.loyaltyPoints,
              type: 'redeem',
              refType: 'transaction',
              refId: transaction.id,
              reason: `Tukar ${pointsRedeemed} pt → Rp${calcRedeemValue(pointsRedeemed).toLocaleString('id-ID')} diskon`,
              actorId: req.user.id,
            },
          });
        }

        // 2) EARN: tambah poin dari nilai transaksi + visit count
        const updatedCustomer = await tx.customer.update({
          where: { id: txData.customerId },
          data: {
            loyaltyPoints: { increment: loyaltyPointsEarned },
            visitCount: { increment: 1 },
          },
          select: { loyaltyPoints: true },
        });
        if (loyaltyPointsEarned > 0) {
          await tx.pointHistory.create({
            data: {
              tenantId: txData.tenantId,
              customerId: txData.customerId,
              delta: loyaltyPointsEarned,
              balanceAfter: updatedCustomer.loyaltyPoints,
              type: 'earn',
              refType: 'transaction',
              refId: transaction.id,
              reason: null,
              actorId: null,
            },
          });
        }
      }

      // Increment voucher usage count
      if (voucherCode) {
        await tx.voucher.update({
          where: { tenantId_code: { tenantId: txData.tenantId, code: voucherCode } },
          data: { usedCount: { increment: 1 } },
        });
      }

      return transaction;
    });

    res.status(201).json({ success: true, data: result });

    // Emit real-time notification to relevant rooms
    const io = getIO();
    if (io) {
      const barberIds = [...new Set(result.items.map(i => i.barberId).filter(Boolean))];
      const payload = {
        id: result.id,
        tenantId: result.tenantId,
        branchId: result.branchId,
        branchName: result.branch?.name || '',
        total: result.total,
        paymentMethod: result.paymentMethod,
        customerName: result.customer?.name || 'Walk-in',
        itemCount: result.items?.length || 0,
        barberIds,
        // Pembuat transaksi — frontend memakai ini agar tak menotifikasi
        // diri sendiri (notifikasi ditujukan ke admin tenant & barber).
        cashierId: req.user.id,
        createdAt: result.createdAt,
      };
      // All users in this tenant (admin, kasir, barber) are auto-joined to tenant room;
      // frontend filters by role/barberId before showing the notification.
      io.to(tenantRoom(result.tenantId)).emit('transaction:created', payload);
    }

    // Fire-and-forget WhatsApp notification (MVP Beta).
    sendTransactionNotification(body.tenantId, result).catch((err) => {
      console.error('WhatsApp transaction notification failed:', err?.message || err);
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/transactions/:id/status — membatalkan / refund transaksi.
// Membalik SEMUA efek samping pembuatan transaksi secara atomik:
//   - poin loyalti yang diperoleh ditarik kembali
//   - poin yang ditukar dikembalikan ke saldo pelanggan
//   - visitCount pelanggan dikurangi
//   - usedCount voucher dikembalikan
// Transaksi yang sudah cancelled/refunded bersifat FINAL — cegah reversal ganda.
router.patch('/:id/status', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const { status, reason } = z.object({
      status: z.enum(['cancelled', 'refunded']),
      reason: z.string().trim().max(300).optional(),
    }).parse(req.body);

    const existing = await prisma.transaction.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Transaction not found' });

    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // State guard: hanya transaksi 'completed' yang bisa dibatalkan/refund.
    // Sekali final, tidak bisa diubah lagi — mencegah reversal poin/voucher ganda.
    if (existing.status !== 'completed') {
      return res.status(409).json({
        success: false,
        error: `Transaksi sudah berstatus ${existing.status} — tidak bisa diubah lagi.`,
        code: 'TX_NOT_REVERSIBLE',
      });
    }

    const shortId = existing.id.slice(-6).toUpperCase();
    const actionLabel = status === 'cancelled' ? 'pembatalan' : 'refund';

    const transaction = await prisma.$transaction(async (tx) => {
      // 1) Balikkan efek loyalti pelanggan (kalau transaksi punya customer).
      if (existing.customerId) {
        const cur = await tx.customer.findUnique({
          where: { id: existing.customerId },
          select: { loyaltyPoints: true, visitCount: true },
        });
        if (cur) {
          // Net: tarik poin yang DIPEROLEH, kembalikan poin yang DITUKAR.
          const delta = (existing.pointsRedeemed || 0) - (existing.loyaltyPointsEarned || 0);
          // Lantai 0 — saldo poin tidak boleh negatif (pelanggan mungkin sudah
          // memakai poinnya di transaksi lain).
          const newBalance = Math.max(0, cur.loyaltyPoints + delta);
          const actualDelta = newBalance - cur.loyaltyPoints;

          const data = {};
          if (actualDelta !== 0) data.loyaltyPoints = newBalance;
          if (cur.visitCount > 0) data.visitCount = { decrement: 1 };
          if (Object.keys(data).length > 0) {
            await tx.customer.update({ where: { id: existing.customerId }, data });
          }
          if (actualDelta !== 0) {
            await tx.pointHistory.create({
              data: {
                tenantId: existing.tenantId,
                customerId: existing.customerId,
                delta: actualDelta,
                balanceAfter: newBalance,
                type: 'adjust',
                refType: 'transaction',
                refId: existing.id,
                reason: `Reversal ${actionLabel} transaksi #${shortId}`,
                actorId: req.user.id,
              },
            });
          }
        }
      }

      // 2) Kembalikan kuota voucher (kalau transaksi memakai voucher).
      if (existing.voucherCode) {
        const v = await tx.voucher.findUnique({
          where: { tenantId_code: { tenantId: existing.tenantId, code: existing.voucherCode } },
          select: { usedCount: true },
        });
        if (v && v.usedCount > 0) {
          await tx.voucher.update({
            where: { tenantId_code: { tenantId: existing.tenantId, code: existing.voucherCode } },
            data: { usedCount: { decrement: 1 } },
          });
        }
      }

      // 3) Ubah status transaksi.
      return tx.transaction.update({
        where: { id: existing.id },
        data: { status },
      });
    });

    res.json({ success: true, data: transaction });

    // Audit + realtime — non-blocking untuk respons.
    recordAudit(req, {
      action: `transaction.${status}`,
      target: `transaction:${existing.id}`,
      detail: `${actionLabel} transaksi #${shortId} (Rp${existing.total.toLocaleString('id-ID')})${reason ? ` — ${reason}` : ''}`,
      severity: 'warning',
    }).catch(() => {});

    const io = getIO();
    if (io) {
      io.to(tenantRoom(existing.tenantId)).emit('transaction:updated', {
        id: existing.id,
        tenantId: existing.tenantId,
        branchId: existing.branchId,
        status,
      });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
