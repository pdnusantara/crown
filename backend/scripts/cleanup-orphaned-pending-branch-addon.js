// One-time cleanup: hapus invoice branch_addon PENDING yang cabangnya sudah
// di-soft-delete (data lama dari penghapusan SEBELUM fitur auto-cancel di
// DELETE /branches:id live). Untuk penghapusan baru, pembersihan ini sudah
// otomatis di handler delete. Invoice LUNAS tidak disentuh (riwayat keuangan).
// Aman dijalankan berulang (idempotent).
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orphans = await prisma.invoice.findMany({
    where: { type: 'branch_addon', status: { not: 'paid' }, branch: { deletedAt: { not: null } } },
    select: { id: true, period: true, amount: true, subscription: { select: { tenant: { select: { slug: true } } } } },
  });

  console.log(`Found ${orphans.length} orphaned pending branch_addon invoices`);
  orphans.forEach((o) => console.log(`  [${o.subscription.tenant.slug}] Rp${o.amount} "${o.period}" id=${o.id}`));
  if (!orphans.length) return;

  const { count } = await prisma.invoice.deleteMany({
    where: { id: { in: orphans.map((o) => o.id) } },
  });
  console.log(`\nDeleted ${count} invoices.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
