'use strict';

// Backfill SATU KALI untuk flag baru `whatsapp_logs` (Laporan Pesan WhatsApp).
// Tujuan: tenant yang sudah punya fitur WhatsApp tetap bisa mengakses halaman
// laporan tanpa terputus saat gate dipindah ke flag baru ini.
//
// Yang dilakukan (idempotent — aman dijalankan ulang):
//   1. Tambahkan `whatsapp_logs` ke Package.features untuk paket yang sudah
//      punya `whatsapp` (supaya tampil tercentang di /super-admin/packages &
//      ikut ter-seed untuk tenant baru).
//   2. Aktifkan TenantFeatureFlag `whatsapp_logs` untuk tenant yang `whatsapp`-
//      nya aktif. Tidak menimpa baris yang sudah ada (hormati setelan manual).

const prisma = require('../src/config/database');

(async () => {
  // 1. Package.features
  let pkgUpdated = 0;
  const pkgs = await prisma.package.findMany({ select: { name: true, features: true } });
  for (const p of pkgs) {
    const feats = Array.isArray(p.features) ? p.features : [];
    if (feats.includes('whatsapp') && !feats.includes('whatsapp_logs')) {
      await prisma.package.update({ where: { name: p.name }, data: { features: [...feats, 'whatsapp_logs'] } });
      pkgUpdated++;
      console.log(`+ paket ${p.name}: tambah whatsapp_logs`);
    }
  }

  // 2. TenantFeatureFlag — hanya buat baris baru (create), jangan timpa yang ada.
  let created = 0;
  const waTenants = await prisma.tenantFeatureFlag.findMany({
    where: { flagId: 'whatsapp', enabled: true },
    select: { tenantId: true },
  });
  for (const { tenantId } of waTenants) {
    const existing = await prisma.tenantFeatureFlag.findUnique({
      where: { tenantId_flagId: { tenantId, flagId: 'whatsapp_logs' } },
      select: { tenantId: true },
    });
    if (!existing) {
      await prisma.tenantFeatureFlag.create({ data: { tenantId, flagId: 'whatsapp_logs', enabled: true } });
      created++;
    }
  }

  console.log(`Selesai. Paket diperbarui=${pkgUpdated}; tenant dgn whatsapp=${waTenants.length}; whatsapp_logs baru diaktifkan=${created}.`);
  process.exit(0);
})().catch((e) => { console.error('Backfill ERROR:', e.message); process.exit(1); });
