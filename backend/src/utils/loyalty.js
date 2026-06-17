// Konstanta & helper poin loyalti — config-aware per-tenant.
// Nilai DEFAULT di bawah dipakai bila tenant belum punya `loyaltyConfig`
// (kompatibel dgn perilaku lama saat angka masih hardcoded). Pasangan FE-nya
// di `src/utils/loyalty.js` HARUS sama persis logikanya.

// Default historis (sebelum config per-tenant).
const POINTS_PER_RUPIAH   = 10_000; // 1 poin diperoleh per Rp10.000 belanja (setelah diskon)
const RUPIAH_PER_POINT    = 100;    // 1 poin = Rp100 diskon saat redeem
const MIN_REDEEM_POINTS   = 10;     // minimal poin yang bisa ditukar (= Rp1.000)
const MAX_REDEEM_PERCENT  = 50;     // diskon poin max 50% dari subtotal — total tidak boleh 0

const LOYALTY_DEFAULTS = {
  enabled: true,
  earnRupiahPerPoint:   POINTS_PER_RUPIAH,
  redeemRupiahPerPoint: RUPIAH_PER_POINT,
  minRedeemPoints:      MIN_REDEEM_POINTS,
  maxRedeemPercent:     MAX_REDEEM_PERCENT,
};

// Normalisasi config tenant (apa pun bentuknya di DB) → objek lengkap & valid.
// Nilai non-positif / bukan angka jatuh ke default supaya rumus tak pernah pecah.
function resolveLoyaltyConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const posInt = (v, def) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) && n > 0 ? n : def;
  };
  return {
    enabled: c.enabled !== false,
    earnRupiahPerPoint:   posInt(c.earnRupiahPerPoint,   LOYALTY_DEFAULTS.earnRupiahPerPoint),
    redeemRupiahPerPoint: posInt(c.redeemRupiahPerPoint, LOYALTY_DEFAULTS.redeemRupiahPerPoint),
    minRedeemPoints:      posInt(c.minRedeemPoints,      LOYALTY_DEFAULTS.minRedeemPoints),
    maxRedeemPercent:     Math.min(100, posInt(c.maxRedeemPercent, LOYALTY_DEFAULTS.maxRedeemPercent)),
  };
}

/**
 * Hitung poin yang diperoleh dari nilai transaksi (sudah net setelah diskon).
 * @param {number} netTotal
 * @param {object} [config] — Tenant.loyaltyConfig (opsional)
 */
function calcPointsEarn(netTotal, config) {
  const c = resolveLoyaltyConfig(config);
  if (!c.enabled) return 0;
  const n = Number(netTotal) || 0;
  if (n <= 0) return 0;
  return Math.floor(n / c.earnRupiahPerPoint);
}

/**
 * Hitung nilai rupiah dari sejumlah poin yang ditukar.
 * @param {number} points
 * @param {object} [config]
 */
function calcRedeemValue(points, config) {
  const c = resolveLoyaltyConfig(config);
  const p = Math.max(0, Math.floor(Number(points) || 0));
  return p * c.redeemRupiahPerPoint;
}

/**
 * Maksimum poin yang bisa ditukar dengan saldo & subtotal saat ini.
 * @param {object} args { balance, subtotal, config }
 */
function maxRedeemablePoints({ balance, subtotal, config }) {
  const c = resolveLoyaltyConfig(config);
  if (!c.enabled) return 0;
  const b = Math.max(0, Math.floor(Number(balance) || 0));
  const s = Math.max(0, Number(subtotal) || 0);
  if (b < c.minRedeemPoints || s <= 0) return 0;
  const maxRupiah = Math.floor(s * c.maxRedeemPercent / 100);
  const maxByCart = Math.floor(maxRupiah / c.redeemRupiahPerPoint);
  return Math.max(0, Math.min(b, maxByCart));
}

/**
 * Validasi pemakaian poin di sisi server. Mengembalikan error string atau null.
 * @param {object} args { points, balance, subtotal, config }
 */
function validateRedeem({ points, balance, subtotal, config }) {
  if (!points || points <= 0) return null; // 0 poin selalu valid (tidak redeem)
  const c = resolveLoyaltyConfig(config);
  if (!c.enabled) return 'Sistem poin tidak aktif';
  if (!Number.isInteger(points)) return 'Poin yang ditukar harus bilangan bulat';
  if (points < c.minRedeemPoints) return `Minimum tukar ${c.minRedeemPoints} poin`;
  if (points > balance) return `Saldo poin tidak cukup (saldo: ${balance})`;
  const cap = maxRedeemablePoints({ balance, subtotal, config });
  if (points > cap) return `Maksimum ${cap} poin (≤${c.maxRedeemPercent}% subtotal)`;
  return null;
}

module.exports = {
  POINTS_PER_RUPIAH,
  RUPIAH_PER_POINT,
  MIN_REDEEM_POINTS,
  MAX_REDEEM_PERCENT,
  LOYALTY_DEFAULTS,
  resolveLoyaltyConfig,
  calcPointsEarn,
  calcRedeemValue,
  maxRedeemablePoints,
  validateRedeem,
};
