// featureFlagSync — menjembatani Package.features (katalog paket yang diedit
// super-admin) dengan TenantFeatureFlag (gate fitur nyata per-tenant).
//
// Tanpa modul ini keduanya terputus: mengubah daftar fitur sebuah paket TIDAK
// pernah sampai ke tenant yang memakai paket itu, karena TenantFeatureFlag
// hanya di-seed sekali saat tenant dibuat.

const prisma = require('../config/database');
const { getIO, tenantRoom } = require('../config/socket');

// Katalog flag valid — sumber tunggal di config/featureCatalog.js. Menambah
// fitur baru cukup di sana; modul ini (seed + propagasi tenant) otomatis ikut.
// Flag default per paket kini berasal dari config/featureCatalog.js (sumber
// tunggal). Frontend featureFlagStore.js menyimpan salinan fallback sendiri yang
// harus dijaga sinkron.
const { FEATURE_FLAG_IDS, PACKAGE_FLAG_DEFAULTS } = require('../config/featureCatalog');
const KNOWN_FLAG_IDS = FEATURE_FLAG_IDS;
const KNOWN = new Set(KNOWN_FLAG_IDS);

// Seed seluruh flag untuk satu tenant baru sesuai paketnya. `client` boleh
// prisma transaction (tx) maupun instance prisma global. Idempotent
// (skipDuplicates) sehingga aman dipanggil ulang.
//
// PRIMARY SOURCE: Package.features di DB (yang diedit super-admin via
// /super-admin/packages). PACKAGE_FLAG_DEFAULTS hanya fallback bila row
// Package belum ada (mis. seed awal). Ini menghindari drift "akun pro
// tapi fiturnya tidak ada".
async function seedTenantFlags(client, tenantId, packageName) {
  const pkg = await client.package.findUnique({
    where: { name: packageName },
    select: { features: true },
  });
  const source = (pkg?.features?.length ? pkg.features : null)
    ?? PACKAGE_FLAG_DEFAULTS[packageName]
    ?? PACKAGE_FLAG_DEFAULTS.Basic;
  const enabled = new Set(source.filter((f) => KNOWN.has(f)));
  await client.tenantFeatureFlag.createMany({
    data: KNOWN_FLAG_IDS.map((flagId) => ({ tenantId, flagId, enabled: enabled.has(flagId) })),
    skipDuplicates: true,
  });
}

function emitTenantFlagChange(tenantId) {
  try {
    const io = getIO();
    if (!io) return;
    io.to(tenantRoom(tenantId)).emit('featureFlag:changed', { tenantId, flagId: null });
  } catch { /* observability only — jangan pernah throw */ }
}

function emitSupportFlagChange() {
  try {
    const io = getIO();
    if (!io) return;
    io.to('support').emit('featureFlag:changed', { tenantId: null, flagId: null });
  } catch { /* observability only */ }
}

// Set sekumpulan flag ke satu nilai enabled untuk banyak tenant sekaligus.
// createMany mengisi baris yang belum ada (tenant lama), updateMany memperbaiki
// baris yang sudah ada. Keduanya idempotent.
async function applyFlags(tenantIds, flagIds, enabled) {
  for (const flagId of flagIds) {
    if (!KNOWN.has(flagId)) continue;
    await prisma.tenantFeatureFlag.createMany({
      data: tenantIds.map((tenantId) => ({ tenantId, flagId, enabled })),
      skipDuplicates: true,
    });
    await prisma.tenantFeatureFlag.updateMany({
      where: { tenantId: { in: tenantIds }, flagId },
      data: { enabled },
    });
  }
}

/**
 * Propagasikan perubahan daftar fitur sebuah paket ke SEMUA tenant yang
 * sedang memakai paket itu. Hanya flag yang BERUBAH yang disentuh:
 *   - fitur ditambahkan ke paket → di-enable untuk tenant
 *   - fitur dihapus dari paket   → di-disable untuk tenant
 * Flag yang tidak berubah dibiarkan — override manual per-tenant tetap aman.
 *
 * @returns {Promise<{affectedTenants:number, added:string[], removed:string[]}>}
 */
async function propagatePackageFeatureChange(packageName, oldFeatures, newFeatures) {
  const oldSet = new Set((oldFeatures || []).filter((f) => KNOWN.has(f)));
  const newSet = new Set((newFeatures || []).filter((f) => KNOWN.has(f)));
  const added   = [...newSet].filter((f) => !oldSet.has(f));
  const removed = [...oldSet].filter((f) => !newSet.has(f));

  if (added.length === 0 && removed.length === 0) {
    return { affectedTenants: 0, added, removed };
  }

  const subs = await prisma.subscription.findMany({
    where: { package: packageName, tenant: { deletedAt: null } },
    select: { tenantId: true },
  });
  const tenantIds = subs.map((s) => s.tenantId);
  if (tenantIds.length === 0) {
    return { affectedTenants: 0, added, removed };
  }

  if (added.length)   await applyFlags(tenantIds, added, true);
  if (removed.length) await applyFlags(tenantIds, removed, false);

  tenantIds.forEach(emitTenantFlagChange);
  emitSupportFlagChange();

  return { affectedTenants: tenantIds.length, added, removed };
}

/**
 * Sinkronkan flag SATU tenant ke seluruh feature-set sebuah paket — dipakai
 * saat tenant pindah paket (upgrade/downgrade). Fitur di paket → enabled,
 * sisanya → disabled. Override manual untuk tenant ini di-reset karena tier
 * langganannya memang berubah.
 */
async function syncTenantFlagsToPackage(tenantId, packageName) {
  const pkg = await prisma.package.findUnique({
    where: { name: packageName },
    select: { features: true },
  });
  const enabled = new Set((pkg?.features || []).filter((f) => KNOWN.has(f)));

  await Promise.all(
    KNOWN_FLAG_IDS.map((flagId) =>
      prisma.tenantFeatureFlag.upsert({
        where:  { tenantId_flagId: { tenantId, flagId } },
        create: { tenantId, flagId, enabled: enabled.has(flagId) },
        update: { enabled: enabled.has(flagId) },
      })
    )
  );

  emitTenantFlagChange(tenantId);
  emitSupportFlagChange();
}

module.exports = {
  KNOWN_FLAG_IDS,
  PACKAGE_FLAG_DEFAULTS,
  seedTenantFlags,
  propagatePackageFeatureChange,
  syncTenantFlagsToPackage,
};
