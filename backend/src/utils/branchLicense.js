const prisma = require('../config/database');

/**
 * Mengembalikan status lisensi semua cabang aktif milik tenant.
 *
 * Aturan:
 * - Tanpa subscription → semua cabang dianggap licensed (tidak ada batas).
 * - Cabang diurutkan createdAt asc; `maxBranches` pertama selalu lisensi
 *   bawaan paket (gratis).
 * - Sisanya licensed sebanyak invoice `branch_addon` yang sudah `paid`;
 *   cabang yang belum tertutup invoice paid → unlicensed.
 * - Kalau paket menetapkan `branchAddonPrice = 0` (cabang ekstra gratis),
 *   tidak ada invoice yang dibuat di POST /branches → semua cabang licensed.
 *
 * @param {string} tenantId
 * @returns {Promise<{
 *   licensed: Set<string>,
 *   unlicensed: Set<string>,
 *   info: {
 *     hasSubscription: boolean,
 *     package: string|null,
 *     maxBranches: number|null,
 *     branchAddonPrice: number,
 *     branchAddonType: string|null,
 *     paidAddonCount: number,
 *     pendingAddonCount: number,
 *     totalBranches: number,
 *   }
 * }>}
 */
async function getBranchLicenseStatus(tenantId) {
  const empty = {
    licensed: new Set(),
    unlicensed: new Set(),
    info: {
      hasSubscription: false,
      package: null,
      maxBranches: null,
      branchAddonPrice: 0,
      branchAddonType: null,
      paidAddonCount: 0,
      pendingAddonCount: 0,
      totalBranches: 0,
    },
  };
  if (!tenantId) return empty;

  const [subscription, branches] = await Promise.all([
    prisma.subscription.findUnique({
      where: { tenantId },
      select: { id: true, package: true },
    }),
    prisma.branch.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  if (!subscription) {
    return {
      licensed: new Set(branches.map((b) => b.id)),
      unlicensed: new Set(),
      info: { ...empty.info, totalBranches: branches.length },
    };
  }

  const pkg = await prisma.package.findUnique({
    where: { name: subscription.package },
    select: { maxBranches: true, branchAddonPrice: true, branchAddonType: true },
  });

  const maxBranches = pkg?.maxBranches ?? 1;
  const branchAddonPrice = pkg?.branchAddonPrice ?? 0;

  if (!branchAddonPrice) {
    return {
      licensed: new Set(branches.map((b) => b.id)),
      unlicensed: new Set(),
      info: {
        hasSubscription: true,
        package: subscription.package,
        maxBranches,
        branchAddonPrice: 0,
        branchAddonType: pkg?.branchAddonType ?? null,
        paidAddonCount: 0,
        pendingAddonCount: 0,
        totalBranches: branches.length,
      },
    };
  }

  const [paidAddonCount, pendingAddonCount] = await Promise.all([
    prisma.invoice.count({
      where: { subscriptionId: subscription.id, type: 'branch_addon', status: 'paid' },
    }),
    prisma.invoice.count({
      where: {
        subscriptionId: subscription.id,
        type: 'branch_addon',
        status: { not: 'paid' },
      },
    }),
  ]);

  const licensedQuota = maxBranches + paidAddonCount;
  const licensed = new Set();
  const unlicensed = new Set();
  branches.forEach((branch, i) => {
    if (i < licensedQuota) licensed.add(branch.id);
    else unlicensed.add(branch.id);
  });

  return {
    licensed,
    unlicensed,
    info: {
      hasSubscription: true,
      package: subscription.package,
      maxBranches,
      branchAddonPrice,
      branchAddonType: pkg?.branchAddonType ?? 'monthly',
      paidAddonCount,
      pendingAddonCount,
      totalBranches: branches.length,
    },
  };
}

module.exports = { getBranchLicenseStatus };
