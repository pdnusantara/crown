const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { recordAudit } = require('../utils/auditLog');
const { getIO, tenantRoom } = require('../config/socket');

// Emit a flag-change notification to:
//   1. the super-admin `support` room → other admin tabs refresh feature-flags page
//   2. the affected tenant's room       → tenant UI refreshes feature gates live
function emitFlagChange(tenantId, flagId) {
  try {
    const io = getIO();
    if (!io) return;
    const payload = { tenantId, flagId };
    io.to('support').emit('featureFlag:changed', payload);
    io.to(tenantRoom(tenantId)).emit('featureFlag:changed', payload);
  } catch { /* observability — never throw */ }
}

// Available feature flags — kept in sync with frontend featureFlagStore.js
const AVAILABLE_FLAGS = [
  { id: 'pos',              label: 'POS Kasir',               category: 'Core' },
  { id: 'booking',          label: 'Booking Online',           category: 'Core' },
  { id: 'loyalty',          label: 'Loyalty Program',          category: 'Core' },
  { id: 'voucher',          label: 'Voucher & Promo',           category: 'Core' },
  { id: 'queue',            label: 'Manajemen Antrian',        category: 'Core' },
  { id: 'reports',          label: 'Laporan Lanjutan',         category: 'Analytics' },
  { id: 'heatmap',          label: 'Heatmap Jam Sibuk',        category: 'Analytics' },
  { id: 'clv',              label: 'Customer CLV',             category: 'Analytics' },
  { id: 'wilayah_report',   label: 'Laporan Wilayah',          category: 'Analytics' },
  { id: 'schedule',         label: 'Jadwal Shift',             category: 'Operations' },
  { id: 'multi_branch',     label: 'Multi-Cabang',             category: 'Operations' },
  { id: 'expense_tracking', label: 'Manajemen Pengeluaran',    category: 'Operations' },
  { id: 'pwa',              label: 'Install Aplikasi',         category: 'UX' },
  { id: 'whatsapp',         label: 'Struk WhatsApp',           category: 'UX' },
  { id: 'barber_rating',    label: 'Rating Barber',            category: 'UX' },
  { id: 'api_access',       label: 'API Access',               category: 'Enterprise' },
  { id: 'white_label',      label: 'White Label',              category: 'Enterprise' },
  { id: 'backup',           label: 'Backup & Restore',         category: 'Enterprise' },
];

const VALID_FLAG_IDS = new Set(AVAILABLE_FLAGS.map(f => f.id));

// ── Shared handler: fetch flags for a tenant ──────────────────────────────────
async function handleGetTenantFlags(req, res, next) {
  try {
    const { tenantId } = req.params;

    if (req.user.role !== 'super_admin' && req.user.tenantId !== tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const tenantFlags = await prisma.tenantFeatureFlag.findMany({ where: { tenantId } });
    const flagMap = {};
    tenantFlags.forEach((f) => { flagMap[f.flagId] = f.enabled; });

    const result = AVAILABLE_FLAGS.map((flag) => ({
      ...flag,
      enabled: flagMap[flag.id] ?? false,
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── Shared handler: update flags for a tenant ─────────────────────────────────
async function handlePutTenantFlags(req, res, next) {
  try {
    const { tenantId } = req.params;
    const { flags } = z.object({
      flags: z.array(z.object({
        flagId: z.string().min(1),
        enabled: z.boolean(),
      })),
    }).parse(req.body);

    for (const flag of flags) {
      if (!VALID_FLAG_IDS.has(flag.flagId)) {
        return res.status(400).json({ success: false, error: `Unknown flag: ${flag.flagId}` });
      }
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    await Promise.all(
      flags.map((flag) =>
        prisma.tenantFeatureFlag.upsert({
          where:  { tenantId_flagId: { tenantId, flagId: flag.flagId } },
          create: { tenantId, flagId: flag.flagId, enabled: flag.enabled },
          update: { enabled: flag.enabled },
        })
      )
    );

    const tenantFlags = await prisma.tenantFeatureFlag.findMany({ where: { tenantId } });
    const flagMap = {};
    tenantFlags.forEach((f) => { flagMap[f.flagId] = f.enabled; });

    const result = AVAILABLE_FLAGS.map((flag) => ({
      ...flag,
      enabled: flagMap[flag.id] ?? false,
    }));

    await recordAudit(req, {
      action: 'flag.bulk-update',
      target: `tenant:${tenantId}`,
      detail: `${tenant.name}: ${flags.length} flag(s) updated`,
      severity: 'info',
    });
    emitFlagChange(tenantId, null);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// GET /api/feature-flags — list all available flags
router.get('/', authenticate, (req, res) => {
  res.json({ success: true, data: AVAILABLE_FLAGS });
});

// GET /api/feature-flags/:tenantId  (short form used by frontend)
// GET /api/feature-flags/tenant/:tenantId  (long form)
router.get('/tenant/:tenantId', authenticate, handleGetTenantFlags);
router.get('/:tenantId',        authenticate, handleGetTenantFlags);

// PUT /api/feature-flags/:tenantId  (short form)
// PUT /api/feature-flags/tenant/:tenantId  (long form)
router.put('/tenant/:tenantId', authenticate, requireRole('super_admin'), handlePutTenantFlags);
router.put('/:tenantId',        authenticate, requireRole('super_admin'), handlePutTenantFlags);

// PATCH /api/feature-flags/tenant/:tenantId/:flagId — toggle single flag
router.patch('/tenant/:tenantId/:flagId', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { tenantId, flagId } = req.params;
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);

    if (!VALID_FLAG_IDS.has(flagId)) {
      return res.status(400).json({ success: false, error: `Unknown flag: ${flagId}` });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const flag = await prisma.tenantFeatureFlag.upsert({
      where:  { tenantId_flagId: { tenantId, flagId } },
      create: { tenantId, flagId, enabled },
      update: { enabled },
    });

    await recordAudit(req, {
      action: 'flag.toggle',
      target: `tenant:${tenantId}`,
      detail: `${tenant.name}: ${flagId} ${enabled ? 'enabled' : 'disabled'}`,
      severity: 'info',
    });
    emitFlagChange(tenantId, flagId);

    res.json({ success: true, data: flag });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
