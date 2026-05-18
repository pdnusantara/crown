// Konstanta & helper poin loyalti — sumber kebenaran tunggal di sisi backend.
// Pasangan FE-nya di `src/utils/loyalty.js` HARUS sama persis nilainya.
//
// Future: pindah ke `Tenant.loyaltyConfig` JSON untuk per-tenant override.

const POINTS_PER_RUPIAH   = 10_000; // 1 poin diperoleh per Rp10.000 belanja (setelah diskon)
const RUPIAH_PER_POINT    = 100;    // 1 poin = Rp100 diskon saat redeem
const MIN_REDEEM_POINTS   = 10;     // minimal poin yang bisa ditukar (= Rp1.000)
const MAX_REDEEM_PERCENT  = 50;     // diskon poin max 50% dari subtotal — total tidak boleh 0

/**
 * Hitung poin yang diperoleh dari nilai transaksi (sudah net setelah semua diskon).
 * @param {number} netTotal — total bersih dalam rupiah
 * @returns {number} poin yang didapat (floor)
 */
function calcPointsEarn(netTotal) {
  const n = Number(netTotal) || 0;
  if (n <= 0) return 0;
  return Math.floor(n / POINTS_PER_RUPIAH);
}

/**
 * Hitung nilai rupiah dari sejumlah poin yang ditukar.
 * @param {number} points
 * @returns {number} rupiah
 */
function calcRedeemValue(points) {
  const p = Math.max(0, Math.floor(Number(points) || 0));
  return p * RUPIAH_PER_POINT;
}

/**
 * Maksimum poin yang bisa ditukar dengan saldo & subtotal saat ini.
 * Mengikat ke kelipatan poin terkecil, tidak melebihi saldo, dan tidak
 * melebihi MAX_REDEEM_PERCENT dari subtotal.
 * @param {object} args
 * @param {number} args.balance — saldo poin customer
 * @param {number} args.subtotal — subtotal transaksi (sebelum semua diskon)
 * @returns {number} poin maksimum yang dibolehkan
 */
function maxRedeemablePoints({ balance, subtotal }) {
  const b = Math.max(0, Math.floor(Number(balance) || 0));
  const s = Math.max(0, Number(subtotal) || 0);
  if (b < MIN_REDEEM_POINTS || s <= 0) return 0;
  const maxRupiah = Math.floor(s * MAX_REDEEM_PERCENT / 100);
  const maxByCart = Math.floor(maxRupiah / RUPIAH_PER_POINT);
  return Math.max(0, Math.min(b, maxByCart));
}

/**
 * Validasi pemakaian poin di sisi server. Mengembalikan error string atau null.
 * @returns {string|null}
 */
function validateRedeem({ points, balance, subtotal }) {
  if (!points || points <= 0) return null; // 0 poin selalu valid (tidak redeem)
  if (!Number.isInteger(points)) return 'Poin yang ditukar harus bilangan bulat';
  if (points < MIN_REDEEM_POINTS) return `Minimum tukar ${MIN_REDEEM_POINTS} poin`;
  if (points > balance) return `Saldo poin tidak cukup (saldo: ${balance})`;
  const cap = maxRedeemablePoints({ balance, subtotal });
  if (points > cap) return `Maksimum ${cap} poin (≤${MAX_REDEEM_PERCENT}% subtotal)`;
  return null;
}

module.exports = {
  POINTS_PER_RUPIAH,
  RUPIAH_PER_POINT,
  MIN_REDEEM_POINTS,
  MAX_REDEEM_PERCENT,
  calcPointsEarn,
  calcRedeemValue,
  maxRedeemablePoints,
  validateRedeem,
};
