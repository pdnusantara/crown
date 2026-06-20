// Backfill Invoice.branchId untuk invoice branch_addon PER-CABANG yang dibuat
// sebelum kolom branchId ada. Strategi: cocokkan teks `period` ke nama cabang
// dalam tenant yang sama.
//
// Format period per-cabang (dari POST /branches):
//   "Cabang: <nama> (one-time)"
//   "Cabang: <nama> — <Mon YYYY>"
//
// TIDAK menyentuh:
//   - "Cabang Tambahan (N) — ..."  (agregat renewal, sengaja branchId=null)
//   - "Tambah Cabang — ..."        (fallback fulfillment tanpa nama cabang)
//
// Cabang yang sudah di-soft-delete IKUT dicocokkan — supaya invoice lunas milik
// cabang yang sudah dihapus ter-link & berhenti memberi kredit lisensi.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// "Cabang: Pusat — Jun 2026" → "Pusat" ; "Cabang: Pusat (one-time)" → "Pusat"
function extractBranchName(period) {
  if (!period || !period.startsWith('Cabang: ')) return null;
  let name = period.slice('Cabang: '.length);
  const dash = name.indexOf(' — ');
  if (dash !== -1) name = name.slice(0, dash);
  name = name.replace(/\s*\(one-time\)\s*$/, '');
  return name.trim() || null;
}

async function main() {
  const invoices = await prisma.invoice.findMany({
    where: { type: 'branch_addon', branchId: null, period: { startsWith: 'Cabang: ' } },
    select: { id: true, period: true, subscription: { select: { tenantId: true } } },
  });

  console.log(`Found ${invoices.length} per-branch branch_addon invoices without branchId`);
  if (!invoices.length) return;

  // Index nama cabang per tenant (termasuk yang sudah dihapus).
  const branches = await prisma.branch.findMany({ select: { id: true, tenantId: true, name: true } });
  const byTenant = new Map();
  for (const b of branches) {
    if (!byTenant.has(b.tenantId)) byTenant.set(b.tenantId, new Map());
    const m = byTenant.get(b.tenantId);
    if (!m.has(b.name)) m.set(b.name, []);
    m.get(b.name).push(b.id);
  }

  let linked = 0, skippedNoMatch = 0, skippedAmbiguous = 0;
  for (const inv of invoices) {
    const tenantId = inv.subscription?.tenantId;
    const name = extractBranchName(inv.period);
    if (!tenantId || !name) { skippedNoMatch++; continue; }
    const ids = byTenant.get(tenantId)?.get(name);
    if (!ids || ids.length === 0) { skippedNoMatch++; continue; }
    if (ids.length > 1) {
      console.log(`? ${inv.id} period="${inv.period}" → ${ids.length} cabang bernama "${name}" (ambigu, dilewati)`);
      skippedAmbiguous++;
      continue;
    }
    await prisma.invoice.update({ where: { id: inv.id }, data: { branchId: ids[0] } });
    console.log(`✓ ${inv.id} period="${inv.period}" → branch ${ids[0]}`);
    linked++;
  }

  console.log(`\nDone. linked=${linked} skippedNoMatch=${skippedNoMatch} skippedAmbiguous=${skippedAmbiguous}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
