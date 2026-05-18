// Konstanta & helper poin loyalti — sumber kebenaran tunggal di sisi frontend.
// HARUS identik nilainya dengan `backend/src/utils/loyalty.js`.

export const POINTS_PER_RUPIAH  = 10_000  // 1 poin diperoleh per Rp10.000 belanja
export const RUPIAH_PER_POINT   = 100     // 1 poin = Rp100 saat redeem
export const MIN_REDEEM_POINTS  = 10      // minimum tukar = Rp1.000
export const MAX_REDEEM_PERCENT = 50      // max 50% subtotal

export const calcPointsEarn = (netTotal) => {
  const n = Number(netTotal) || 0
  return n <= 0 ? 0 : Math.floor(n / POINTS_PER_RUPIAH)
}

export const calcRedeemValue = (points) => {
  const p = Math.max(0, Math.floor(Number(points) || 0))
  return p * RUPIAH_PER_POINT
}

export const maxRedeemablePoints = ({ balance, subtotal }) => {
  const b = Math.max(0, Math.floor(Number(balance) || 0))
  const s = Math.max(0, Number(subtotal) || 0)
  if (b < MIN_REDEEM_POINTS || s <= 0) return 0
  const maxRupiah = Math.floor(s * MAX_REDEEM_PERCENT / 100)
  const maxByCart = Math.floor(maxRupiah / RUPIAH_PER_POINT)
  return Math.max(0, Math.min(b, maxByCart))
}

export const validateRedeem = ({ points, balance, subtotal }) => {
  if (!points || points <= 0) return null
  if (!Number.isInteger(points)) return 'Poin harus bilangan bulat'
  if (points < MIN_REDEEM_POINTS) return `Minimum tukar ${MIN_REDEEM_POINTS} poin`
  if (points > balance) return `Saldo tidak cukup (${balance})`
  const cap = maxRedeemablePoints({ balance, subtotal })
  if (points > cap) return `Maksimum ${cap} poin (≤${MAX_REDEEM_PERCENT}% subtotal)`
  return null
}
