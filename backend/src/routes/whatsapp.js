const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const {
  connectTenant,
  disconnectTenant,
  getTenantStatus,
  updateTenantSettings,
  sendTestMessage,
  getConfigPublic,
  updateConfig,
  testConfig,
} = require('../services/whatsappService');

function resolveTenantId(req) {
  if (req.user.role === 'super_admin') {
    return req.body.tenantId || req.query.tenantId || null;
  }
  return req.user.tenantId || null;
}

// Gerbang fitur: WhatsApp Beta hanya untuk tenant yang paketnya mengaktifkan
// flag `whatsapp`. super_admin dikecualikan (bisa kelola tenant mana pun).
async function requireWhatsappFeature(req, res, next) {
  try {
    if (req.user.role === 'super_admin') return next();
    const tenantId = req.user.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });
    const flag = await prisma.tenantFeatureFlag.findUnique({
      where: { tenantId_flagId: { tenantId, flagId: 'whatsapp' } },
    });
    if (!flag?.enabled) {
      return res.status(403).json({
        success: false,
        error: 'Fitur WhatsApp tidak tersedia di paket Anda',
        code: 'FEATURE_DISABLED',
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Pemetaan kode error WA Gateway → status HTTP yang sesuai.
const GATEWAY_ERROR_STATUS = {
  NOT_CONFIGURED: 503,
  GATEWAY_UNREACHABLE: 502,
  TIMEOUT: 504,
  TENANT_NOT_FOUND: 404,
  PROVISION_FAILED: 502,
  INVALID_PHONE: 400,
  NOT_CONNECTED: 400,
  NEEDS_QR: 400,
  AUTH_FAILED: 400,
  WA_CAPACITY: 503,
};

function handleWhatsappError(err, res, next) {
  const httpStatus = GATEWAY_ERROR_STATUS[err.code];
  if (httpStatus) {
    return res.status(httpStatus).json({ success: false, code: err.code, error: err.message });
  }
  return next(err);
}

// ── Konfigurasi gateway (super-admin) ─────────────────────────────────────────

router.get('/config', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    res.json({ success: true, data: await getConfigPublic() });
  } catch (err) {
    next(err);
  }
});

router.put('/config', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const payload = z
      .object({
        apiKey: z.string().max(200).optional(),
        baseUrl: z.string().max(200).optional(),
        webhookSecret: z.string().max(200).optional(),
        enabled: z.boolean().optional(),
      })
      .parse(req.body);
    await updateConfig(payload);
    res.json({ success: true, data: await getConfigPublic() });
  } catch (err) {
    next(err);
  }
});

router.post('/config/test', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    res.json({ success: true, data: await testConfig() });
  } catch (err) {
    handleWhatsappError(err, res, next);
  }
});

// ── Operasi per-tenant (gated feature flag `whatsapp`) ────────────────────────

router.get('/status', authenticate, requireRole('super_admin', 'tenant_admin'), requireWhatsappFeature, async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });
    const status = await getTenantStatus(tenantId);
    res.json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
});

router.post('/connect', authenticate, requireRole('super_admin', 'tenant_admin'), requireWhatsappFeature, async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });
    try {
      await connectTenant(tenantId);
    } catch (err) {
      return handleWhatsappError(err, res, next);
    }
    const status = await getTenantStatus(tenantId);
    res.json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
});

router.post('/disconnect', authenticate, requireRole('super_admin', 'tenant_admin'), requireWhatsappFeature, async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });
    await disconnectTenant(tenantId);
    const status = await getTenantStatus(tenantId);
    res.json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
});

router.post('/test', authenticate, requireRole('super_admin', 'tenant_admin'), requireWhatsappFeature, async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });
    const result = await sendTestMessage(tenantId);
    res.json({ success: true, data: result });
  } catch (err) {
    handleWhatsappError(err, res, next);
  }
});

router.patch('/settings', authenticate, requireRole('super_admin', 'tenant_admin'), requireWhatsappFeature, async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });

    const payload = z.object({
      enabled: z.boolean().optional(),
      notifyAdminPhone: z.string().max(40).optional(),
      notifyCustomer: z.boolean().optional(),
    }).parse(req.body);

    const settings = await updateTenantSettings(tenantId, payload);
    const status = await getTenantStatus(tenantId);
    res.json({ success: true, data: { settings, status } });
  } catch (err) {
    next(err);
  }
});

// ── Monitoring pesan keluar (tenant) — sumber halaman /admin/whatsapp-logs ──

const MSG_CATEGORIES = ['transaction_admin', 'transaction_customer', 'rating', 'test', 'system'];
const MSG_STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed', 'skipped'];

function dateRangeFilter(from, to) {
  if (!from && !to) return undefined;
  const range = {};
  if (from) range.gte = new Date(`${from}T00:00:00`);
  if (to) range.lte = new Date(`${to}T23:59:59.999`);
  return range;
}

// GET /api/whatsapp/messages — daftar log pesan keluar, tenant-scoped + filter.
router.get('/messages', authenticate, requireRole('super_admin', 'tenant_admin'), requireWhatsappFeature, async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const { page, limit, skip } = parsePagination(req.query);
    const { status, category, search, from, to } = req.query;

    const where = { tenantId };
    if (status && MSG_STATUSES.includes(status)) where.status = status;
    if (category && MSG_CATEGORIES.includes(category)) where.category = category;
    if (search) where.recipient = { contains: String(search).replace(/[^0-9]/g, '') };
    const createdAt = dateRangeFilter(from, to);
    if (createdAt) where.createdAt = createdAt;

    const [data, total] = await Promise.all([
      prisma.whatsappMessageLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.whatsappMessageLog.count({ where }),
    ]);
    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) { next(err); }
});

// GET /api/whatsapp/messages/stats — agregat per-status untuk KPI (ikut rentang
// tanggal, tapi abaikan filter status/category supaya kartu KPI selalu utuh).
router.get('/messages/stats', authenticate, requireRole('super_admin', 'tenant_admin'), requireWhatsappFeature, async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const where = { tenantId };
    const createdAt = dateRangeFilter(req.query.from, req.query.to);
    if (createdAt) where.createdAt = createdAt;

    const grouped = await prisma.whatsappMessageLog.groupBy({ by: ['status'], where, _count: { _all: true } });
    const byStatus = {};
    for (const g of grouped) byStatus[g.status] = g._count._all;

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const delivered = (byStatus.delivered || 0) + (byStatus.read || 0);
    const success = (byStatus.sent || 0) + delivered; // diterima gateway / terkirim
    const failed = byStatus.failed || 0;

    res.json({
      success: true,
      data: {
        total,
        sent: byStatus.sent || 0,
        delivered,
        failed,
        queued: byStatus.queued || 0,
        skipped: byStatus.skipped || 0,
        success,
        successRate: total ? Math.round((success / total) * 100) : 0,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
