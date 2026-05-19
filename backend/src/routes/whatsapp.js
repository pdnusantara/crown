const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
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

module.exports = router;
