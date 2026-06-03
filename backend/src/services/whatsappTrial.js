'use strict';

// Trial WhatsApp untuk paket yang tidak menyertakan fitur `whatsapp` (mis.
// Basic). Tujuannya "corong ke Pro": tenant boleh mencicipi WA gratis sekali
// selama TRIAL_DAYS hari, lalu fitur dikunci otomatis + device dilepas (revoke)
// sambil menawarkan upgrade. Bila tenant upgrade ke paket yang menyertakan
// WhatsApp di tengah trial, fitur tetap menyala (paket yang memberikannya).
//
// MEKANIK: trial = meng-enable flag `whatsapp` + `whatsapp_logs` SEMENTARA.
// Dengan begitu seluruh gating yang sudah ada (tenantHasFeature, requireFeature)
// otomatis berlaku tanpa jalur khusus. Cron `whatsappTrialExpiry` mematikan
// flag saat window habis.

const prisma = require('../config/database');
const { packageGrantsFlag, setTenantFlags } = require('./featureFlagSync');
const { revokeWhatsappAccess } = require('./whatsappService');

const TRIAL_DAYS = 14;
const TRIAL_FLAGS = ['whatsapp', 'whatsapp_logs'];
const DAY_MS = 24 * 60 * 60 * 1000;

function daysLeft(endsAt, now = Date.now()) {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / DAY_MS));
}

// Status trial satu tenant:
//   'unavailable' → paket sudah menyertakan WhatsApp (trial tak relevan)
//   'available'   → belum pernah trial, boleh mulai
//   'active'      → trial sedang berjalan
//   'expired'     → trial sudah dipakai & habis, tidak upgrade
async function getTrialStatus(tenantId) {
  const base = { durationDays: TRIAL_DAYS, endsAt: null, daysLeft: null };

  if (await packageGrantsFlag(tenantId, 'whatsapp')) {
    return { ...base, status: 'unavailable' };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { whatsappTrialStartedAt: true, whatsappTrialEndsAt: true },
  });
  if (!tenant) return { ...base, status: 'unavailable' };

  if (!tenant.whatsappTrialStartedAt || !tenant.whatsappTrialEndsAt) {
    return { ...base, status: 'available' };
  }

  const now = Date.now();
  if (new Date(tenant.whatsappTrialEndsAt).getTime() > now) {
    return {
      ...base,
      status: 'active',
      endsAt: tenant.whatsappTrialEndsAt,
      daysLeft: daysLeft(tenant.whatsappTrialEndsAt, now),
    };
  }
  return { ...base, status: 'expired', endsAt: tenant.whatsappTrialEndsAt };
}

// Mulai trial. Sekali pakai per tenant. Melempar error ber-`code` agar route
// bisa memetakan status HTTP yang sesuai.
async function startTrial(tenantId) {
  if (await packageGrantsFlag(tenantId, 'whatsapp')) {
    const e = new Error('Paket Anda sudah termasuk WhatsApp.');
    e.code = 'ALREADY_OWNED';
    throw e;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { whatsappTrialStartedAt: true },
  });
  if (!tenant) {
    const e = new Error('Tenant tidak ditemukan.');
    e.code = 'TENANT_NOT_FOUND';
    throw e;
  }
  if (tenant.whatsappTrialStartedAt) {
    const e = new Error('Trial WhatsApp sudah pernah digunakan.');
    e.code = 'ALREADY_USED';
    throw e;
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + TRIAL_DAYS * DAY_MS);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { whatsappTrialStartedAt: now, whatsappTrialEndsAt: endsAt },
  });

  // Enable flag sementara → seluruh fitur WA terbuka selama window trial.
  await setTenantFlags(tenantId, TRIAL_FLAGS, true);

  return getTrialStatus(tenantId);
}

// Dipanggil cron: kunci semua trial yang sudah habis & tenant-nya TIDAK upgrade.
// Query lewat TenantFeatureFlag (flag `whatsapp` masih enabled + trial lewat
// tanggal) supaya himpunan mengecil sendiri tiap run (begitu di-disable, keluar
// dari hasil). Tenant yang upgrade tetap muncul tapi disaring packageGrantsFlag.
async function expireDueTrials() {
  const now = new Date();
  const rows = await prisma.tenantFeatureFlag.findMany({
    where: {
      flagId: 'whatsapp',
      enabled: true,
      tenant: { whatsappTrialEndsAt: { lte: now }, deletedAt: null },
    },
    select: { tenantId: true },
  });

  let expired = 0;
  for (const { tenantId } of rows) {
    // Tenant sudah upgrade ke paket ber-WhatsApp → biarkan menyala.
    if (await packageGrantsFlag(tenantId, 'whatsapp')) continue;
    try {
      await setTenantFlags(tenantId, TRIAL_FLAGS, false);
      await revokeWhatsappAccess(tenantId);
      expired++;
      console.log(`[WATrial] tenant=${tenantId} → trial habis, WA dikunci & device dilepas`);
    } catch (err) {
      console.error(`[WATrial] gagal expire tenant=${tenantId}:`, err.message);
    }
  }
  if (expired > 0) console.log(`[WATrial] run selesai — ${expired} trial dikunci`);
  return { expired };
}

module.exports = { getTrialStatus, startTrial, expireDueTrials, TRIAL_DAYS };
