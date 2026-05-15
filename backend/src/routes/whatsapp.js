const router = require('express').Router();
const { z } = require('zod');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  connectTenant,
  disconnectTenant,
  getTenantStatus,
  updateTenantSettings,
  sendTestMessage,
} = require('../services/whatsappService');

function resolveTenantId(req) {
  if (req.user.role === 'super_admin') {
    return req.body.tenantId || req.query.tenantId || null;
  }
  return req.user.tenantId || null;
}

router.get('/status', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });
    const status = await getTenantStatus(tenantId);
    res.json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
});

router.post('/connect', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });
    try {
      await connectTenant(tenantId);
    } catch (err) {
      if (err.code === 'WA_CAPACITY') {
        return res.status(503).json({ success: false, code: err.code, error: err.message });
      }
      throw err;
    }
    const status = await getTenantStatus(tenantId);
    res.json({ success: true, data: status });
  } catch (err) {
    next(err);
  }
});

router.post('/disconnect', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
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

router.post('/test', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });
    const result = await sendTestMessage(tenantId);
    res.json({ success: true, data: result });
  } catch (err) {
    const knownCodes = new Set(['NOT_CONNECTED', 'INVALID_PHONE', 'NEEDS_QR', 'AUTH_FAILED', 'TIMEOUT']);
    if (knownCodes.has(err.code)) {
      return res.status(400).json({ success: false, error: err.message, code: err.code });
    }
    if (err.code === 'WA_CAPACITY') {
      return res.status(503).json({ success: false, error: err.message, code: err.code });
    }
    next(err);
  }
});

router.patch('/settings', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
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
