// Backfill fitur 'attendance' (Absensi Digital) ke katalog paket & tenant.
//
// Idempotent — aman dijalankan ulang. Dua langkah:
//   1. Tambahkan 'attendance' ke Package.features untuk paket Pro & Enterprise
//      (Basic tidak dapat fitur ini).
//   2. Upsert TenantFeatureFlag 'attendance' untuk SEMUA tenant non-deleted —
//      enabled mengikuti paket langganannya (Pro/Enterprise → true, lainnya
//      → false). Override manual per-tenant flag lain tidak disentuh.
//
// Jalankan: node scripts/seed-attendance-flag.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const FLAG = 'attendance';
const PACKAGES_WITH_FLAG = ['Pro', 'Enterprise'];

async function main() {
  // ── Langkah 1: katalog paket ──────────────────────────────────────────────
  const packages = await prisma.package.findMany({ select: { name: true, features: true } });
  for (const pkg of packages) {
    const has = (pkg.features || []).includes(FLAG);
    const shouldHave = PACKAGES_WITH_FLAG.includes(pkg.name);
    if (shouldHave && !has) {
      await prisma.package.update({
        where: { name: pkg.name },
        data: { features: { set: [...(pkg.features || []), FLAG] } },
      });
      console.log(`  Package ${pkg.name}: + ${FLAG}`);
    } else {
      console.log(`  Package ${pkg.name}: tidak diubah`);
    }
  }

  // ── Langkah 2: flag per-tenant ────────────────────────────────────────────
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, subscription: { select: { package: true } } },
  });

  let enabled = 0;
  let disabled = 0;
  for (const t of tenants) {
    const pkg = t.subscription?.package || 'Basic';
    const on = PACKAGES_WITH_FLAG.includes(pkg);
    await prisma.tenantFeatureFlag.upsert({
      where:  { tenantId_flagId: { tenantId: t.id, flagId: FLAG } },
      create: { tenantId: t.id, flagId: FLAG, enabled: on },
      update: { enabled: on },
    });
    if (on) enabled++; else disabled++;
  }

  console.log(`\nSelesai: ${tenants.length} tenant — ${enabled} aktif, ${disabled} nonaktif.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
