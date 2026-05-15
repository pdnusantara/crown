// Backfill Branch.code untuk cabang yang belum punya code.
// Strategi: slugify dari name (lowercase, alfanumerik + dash), max 12 char.
// Kalau bentrok di tenant yg sama, suffix angka (-2, -3, ...).
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const slugify = (s) =>
  (s || 'cabang')
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 12) || 'cabang';

async function main() {
  const branches = await prisma.branch.findMany({
    where: { code: null },
    select: { id: true, tenantId: true, name: true },
  });

  console.log(`Found ${branches.length} branches without code`);
  if (!branches.length) return;

  // Index existing codes per tenant supaya bisa hindari bentrok dgn yg sudah ada
  const existing = await prisma.branch.findMany({
    where: { code: { not: null } },
    select: { tenantId: true, code: true },
  });
  const usedByTenant = new Map();
  for (const b of existing) {
    if (!usedByTenant.has(b.tenantId)) usedByTenant.set(b.tenantId, new Set());
    usedByTenant.get(b.tenantId).add(b.code);
  }

  for (const b of branches) {
    const base = slugify(b.name);
    const used = usedByTenant.get(b.tenantId) || new Set();
    let code = base;
    let n = 1;
    while (used.has(code)) {
      n += 1;
      code = `${base.slice(0, 12 - String(n).length - 1)}-${n}`;
    }
    used.add(code);
    usedByTenant.set(b.tenantId, used);

    await prisma.branch.update({ where: { id: b.id }, data: { code } });
    console.log(`✓ ${b.id} (${b.name}) → ${code}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
