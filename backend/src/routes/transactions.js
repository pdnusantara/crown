const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const transactionItemSchema = z.object({
  serviceId: z.string().min(1),
  barberId: z.string().optional(),
  name: z.string().min(1),
  price: z.number().int().min(0),
});

const createTransactionSchema = z.object({
  tenantId: z.string().optional(),
  branchId: z.string().min(1),
  customerId: z.string().optional(),
  shiftId: z.string().optional(),
  subtotal: z.number().int().min(0),
  discountType: z.string().optional(),
  discountValue: z.number().int().min(0).optional(),
  discountAmount: z.number().int().min(0).optional(),
  tax: z.number().int().min(0).optional(),
  total: z.number().int().min(0),
  paymentMethod: z.enum(['cash', 'transfer', 'qris', 'card']).optional(),
  cashReceived: z.number().int().min(0).optional(),
  change: z.number().int().optional(),
  items: z.array(transactionItemSchema).min(1),
  loyaltyPointsEarned: z.number().int().min(0).optional(),
  voucherCode: z.string().optional(),
});

// GET /api/transactions
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { branchId, customerId, status, startDate, endDate, shiftId } = req.query;

    const where = {};

    if (req.user.role !== 'super_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    if (branchId) where.branchId = branchId;
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (shiftId) where.shiftId = shiftId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
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

// GET /api/transactions/:id
router.get('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: req.params.id },
      include: {
        items: { include: { service: { select: { id: true, name: true, category: true } } } },
        customer: { select: { id: true, name: true, phone: true, loyaltyPoints: true } },
        branch: { select: { id: true, name: true } },
        shift: { select: { id: true, kasirId: true, openedAt: true } },
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
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
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

    const { items, loyaltyPointsEarned = 0, voucherCode, ...txData } = body;

    // Use Prisma transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Create transaction
      const transaction = await tx.transaction.create({
        data: {
          ...txData,
          items: {
            create: items,
          },
        },
        include: {
          items: { include: { service: { select: { id: true, name: true } } } },
          customer: { select: { id: true, name: true, phone: true } },
          branch: { select: { id: true, name: true } },
        },
      });

      // Update customer loyalty & visit count if customer provided
      if (txData.customerId) {
        await tx.customer.update({
          where: { id: txData.customerId },
          data: {
            loyaltyPoints: { increment: loyaltyPointsEarned },
            visitCount: { increment: 1 },
          },
        });
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
  } catch (err) {
    next(err);
  }
});

// PATCH /api/transactions/:id/status
router.patch('/:id/status', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const { status } = z.object({
      status: z.enum(['completed', 'cancelled', 'refunded']),
    }).parse(req.body);

    const existing = await prisma.transaction.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Transaction not found' });

    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const transaction = await prisma.transaction.update({
      where: { id: req.params.id },
      data: { status },
    });

    res.json({ success: true, data: transaction });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
