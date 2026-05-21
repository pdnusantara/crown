const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { recordAudit } = require('../utils/auditLog');
const { getIO, tenantRoom } = require('../config/socket');
const { syncTenantFlagsToPackage, KNOWN_FLAG_IDS } = require('../services/featureFlagSync');

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

// Katalog fitur dari sumber tunggal (config/featureCatalog.js). GET / di bawah
// mengembalikannya apa adanya → frontend (useFeatureCatalog) membacanya, jadi
// menambah fitur cukup di featureCatalog.js dan otomatis muncul di mana-mana.
const { FEATURE_CATALOG } = require('../config/featureCatalog');
const AVAILABLE_FLAGS = FEATURE_CATALOG;

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

// POST /api/feature-flags/:tenantId/sync-package — reset flag tenant ke
// Package.features (DB). Idempotent. Membersihkan override manual.
router.post('/:tenantId/sync-package', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, subscription: { select: { package: true } } },
    });
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
    const pkg = tenant.subscription?.package;
    if (!pkg) return res.status(400).json({ success: false, error: 'Tenant tak punya langganan aktif' });

    await syncTenantFlagsToPackage(tenantId, pkg);

    await recordAudit(req, {
      action: 'flag.sync-package',
      target: `tenant:${tenantId}`,
      detail: `${tenant.name}: sinkronisasi flag → paket ${pkg}`,
      severity: 'info',
    });

    res.json({ success: true, data: { tenantId, package: pkg } });
  } catch (err) { next(err); }
});

// GET /api/feature-flags/audit — drift report semua tenant aktif.
// Membandingkan TenantFeatureFlag dengan Package.features paketnya.
// Termasuk orphan flag (flagId tidak ada di KNOWN_FLAG_IDS).
router.get('/audit', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const known = new Set(KNOWN_FLAG_IDS);
    const [packages, subs] = await Promise.all([
      prisma.package.findMany({ select: { name: true, features: true } }),
      prisma.subscription.findMany({
        where: { tenant: { deletedAt: null } },
        select: {
          tenantId: true, package: true, status: true,
          tenant: { select: { id: true, name: true, slug: true, isSuspended: true } },
        },
      }),
    ]);
    const pkgMap = {};
    for (const p of packages) pkgMap[p.name] = new Set((p.features || []).filter((f) => known.has(f)));

    const driftRows = [];
    for (const sub of subs) {
      const flags = await prisma.tenantFeatureFlag.findMany({ where: { tenantId: sub.tenantId } });
      const enabledKnown = new Set(flags.filter((f) => f.enabled && known.has(f.flagId)).map((f) => f.flagId));
      const orphans = flags.filter((f) => !known.has(f.flagId)).map((f) => ({ flagId: f.flagId, enabled: f.enabled }));
      const expected = pkgMap[sub.package] || new Set();
      const missing = [...expected].filter((f) => !enabledKnown.has(f));
      const extra   = [...enabledKnown].filter((f) => !expected.has(f));
      if (missing.length || extra.length || orphans.length) {
        driftRows.push({
          tenantId: sub.tenantId, slug: sub.tenant.slug, name: sub.tenant.name,
          package: sub.package, status: sub.status,
          isSuspended: sub.tenant.isSuspended,
          missing, extra, orphans,
        });
      }
    }

    res.json({ success: true, data: { totalActive: subs.length, driftCount: driftRows.length, rows: driftRows } });
  } catch (err) { next(err); }
});

// POST /api/feature-flags/sync-all — sinkronisasi flag SEMUA tenant aktif ke
// Package.features-nya masing-masing. Sekaligus membersihkan orphan flag.
router.post('/sync-all', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const known = new Set(KNOWN_FLAG_IDS);
    const subs = await prisma.subscription.findMany({
      where: { tenant: { deletedAt: null } },
      select: { tenantId: true, package: true, tenant: { select: { name: true } } },
    });
    let synced = 0;
    let orphansRemoved = 0;
    for (const sub of subs) {
      // Hapus orphan flag (id tak dikenal) lebih dulu.
      const orphans = await prisma.tenantFeatureFlag.findMany({
        where: { tenantId: sub.tenantId, flagId: { notIn: KNOWN_FLAG_IDS } },
        select: { id: true },
      });
      if (orphans.length) {
        await prisma.tenantFeatureFlag.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
        orphansRemoved += orphans.length;
      }
      await syncTenantFlagsToPackage(sub.tenantId, sub.package);
      synced++;
    }
    await recordAudit(req, {
      action: 'flag.sync-all',
      target: 'system',
      detail: `Bulk sync ${synced} tenant; hapus ${orphansRemoved} orphan flag`,
      severity: 'info',
    });
    res.json({ success: true, data: { synced, orphansRemoved } });
  } catch (err) { next(err); }
});

module.exports = router;
