// Konstanta & helper poin loyalti — config-aware per-tenant.
// Nilai DEFAULT dipakai bila tenant belum punya `loyaltyConfig`. Logikanya
// HARUS sama persis dengan `backend/src/utils/loyalty.js` (sumber kebenaran).

export const POINTS_PER_RUPIAH  = 10_000  // 1 poin per Rp10.000 belanja
export const RUPIAH_PER_POINT   = 100     // 1 poin = Rp100 saat redeem
export const MIN_REDEEM_POINTS  = 10      // minimum tukar = Rp1.000
export const MAX_REDEEM_PERCENT = 50      // max 50% subtotal

export const LOYALTY_DEFAULTS = {
  enabled: true,
  earnRupiahPerPoint:   POINTS_PER_RUPIAH,
  redeemRupiahPerPoint: RUPIAH_PER_POINT,
  minRedeemPoints:      MIN_REDEEM_POINTS,
  maxRedeemPercent:     MAX_REDEEM_PERCENT,
}

// Normalisasi config tenant → objek lengkap & valid (fallback ke default).
export const resolveLoyaltyConfig = (raw) => {
  const c = raw && typeof raw === 'object' ? raw : {}
  const posInt = (v, def) => {
    const n = Math.floor(Number(v))
    return Number.isFinite(n) && n > 0 ? n : def
  }
  return {
    enabled: c.enabled !== false,
    earnRupiahPerPoint:   posInt(c.earnRupiahPerPoint,   LOYALTY_DEFAULTS.earnRupiahPerPoint),
    redeemRupiahPerPoint: posInt(c.redeemRupiahPerPoint, LOYALTY_DEFAULTS.redeemRupiahPerPoint),
    minRedeemPoints:      posInt(c.minRedeemPoints,      LOYALTY_DEFAULTS.minRedeemPoints),
    maxRedeemPercent:     Math.min(100, posInt(c.maxRedeemPercent, LOYALTY_DEFAULTS.maxRedeemPercent)),
  }
}

export const calcPointsEarn = (netTotal, config) => {
  const c = resolveLoyaltyConfig(config)
  if (!c.enabled) return 0
  const n = Number(netTotal) || 0
  return n <= 0 ? 0 : Math.floor(n / c.earnRupiahPerPoint)
}

export const calcRedeemValue = (points, config) => {
  const c = resolveLoyaltyConfig(config)
  const p = Math.max(0, Math.floor(Number(points) || 0))
  return p * c.redeemRupiahPerPoint
}

export const maxRedeemablePoints = ({ balance, subtotal, config }) => {
  const c = resolveLoyaltyConfig(config)
  if (!c.enabled) return 0
  const b = Math.max(0, Math.floor(Number(balance) || 0))
  const s = Math.max(0, Number(subtotal) || 0)
  if (b < c.minRedeemPoints || s <= 0) return 0
  const maxRupiah = Math.floor(s * c.maxRedeemPercent / 100)
  const maxByCart = Math.floor(maxRupiah / c.redeemRupiahPerPoint)
  return Math.max(0, Math.min(b, maxByCart))
}

export const validateRedeem = ({ points, balance, subtotal, config }) => {
  if (!points || points <= 0) return null
  const c = resolveLoyaltyConfig(config)
  if (!c.enabled) return 'Sistem poin tidak aktif'
  if (!Number.isInteger(points)) return 'Poin harus bilangan bulat'
  if (points < c.minRedeemPoints) return `Minimum tukar ${c.minRedeemPoints} poin`
  if (points > balance) return `Saldo tidak cukup (${balance})`
  const cap = maxRedeemablePoints({ balance, subtotal, config })
  if (points > cap) return `Maksimum ${cap} poin (≤${c.maxRedeemPercent}% subtotal)`
  return null
}
