const prisma = require('../config/database');

/**
 * Menghitung cycle window untuk subscription (dipakai oleh license check
 * agar add-on yang lewat masa berlaku tidak terus diakui).
 *
 * Window: [endDate - cycleDuration - 7d buffer, +∞). Buffer 7 hari menutup
 * skenario "bayar duluan" — invoice utk cycle berikutnya kadang dibayar
 * sebelum cycle saat ini berakhir.
 *
 * Catatan: invoice tanpa `paidAt` (legacy / data lama) ikut dihitung supaya
 * tenant existing tidak tiba-tiba kehilangan lisensi.
 */
function buildAddonCycleFilter(subscription) {
  const cycleMonths = subscription.billingCycle === 'annual' ? 12 : 1;
  const windowStart = new Date(subscription.endDate);
  windowStart.setMonth(windowStart.getMonth() - cycleMonths);
  windowStart.setDate(windowStart.getDate() - 7);
  return {
    OR: [
      { paidAt: { gte: windowStart } },
      { paidAt: null },
    ],
  };
}

/**
 * Mengembalikan status lisensi semua cabang aktif milik tenant.
 *
 * Aturan:
 * - Tanpa subscription → semua cabang dianggap licensed (tidak ada batas).
 * - Cabang diurutkan createdAt asc; `maxBranches` pertama selalu lisensi
 *   bawaan paket (gratis).
 * - Sisanya licensed sebanyak SUM(quantity) invoice `branch_addon` paid yang
 *   masih dalam cycle window berjalan (lihat buildAddonCycleFilter). Quantity
 *   dipakai untuk invoice aggregate (1 invoice dapat menanggung N cabang).
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
      select: { id: true, package: true, billingCycle: true, endDate: true },
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

  const cycleFilter = buildAddonCycleFilter(subscription);
  const [paidAddonAgg, pendingAddonAgg] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        subscriptionId: subscription.id,
        type: 'branch_addon',
        status: 'paid',
        ...cycleFilter,
      },
      _sum: { quantity: true },
    }),
    prisma.invoice.aggregate({
      where: {
        subscriptionId: subscription.id,
        type: 'branch_addon',
        status: { not: 'paid' },
      },
      _sum: { quantity: true },
    }),
  ]);

  const paidAddonCount = paidAddonAgg._sum.quantity || 0;
  const pendingAddonCount = pendingAddonAgg._sum.quantity || 0;

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

/**
 * Apakah satu cabang berlisensi (kuota paket atau add-on yang sudah dibayar)?
 * Dipakai di jalur publik (booking pelanggan) yang tidak melewati
 * middleware `requireLicensedBranch` (tanpa auth). Cabang yang tidak dikenal
 * atau tenant tanpa subscription → dianggap licensed (fail-open).
 *
 * @param {string} tenantId
 * @param {string} branchId
 * @returns {Promise<boolean>}
 */
async function isBranchLicensed(tenantId, branchId) {
  if (!tenantId || !branchId) return true;
  const status = await getBranchLicenseStatus(tenantId);
  return !status.unlicensed.has(branchId);
}

module.exports = { getBranchLicenseStatus, isBranchLicensed, buildAddonCycleFilter };
