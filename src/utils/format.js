import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import {
  formatDateInTz,
  formatDateTimeInTz,
  formatTimeInTz,
} from './timezone.js'

export const formatRupiah = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount)
}

// Versi ringkas untuk space sempit (kartu mobile, tooltip): Rp1,2jt / Rp250rb / Rp1,5M.
// Threshold dipilih supaya angka <10rb tetap utuh agar tidak kehilangan presisi pada
// nilai komisi kecil.
export const formatRupiahShort = (amount) => {
  const n = Number(amount)
  if (!Number.isFinite(n)) return formatRupiah(0)
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  const trim = (v, digits = 1) => {
    const s = v.toFixed(digits)
    return s.endsWith('.0') ? s.slice(0, -2) : s.replace('.', ',')
  }
  if (abs >= 1_000_000_000) return `${sign}Rp${trim(abs / 1_000_000_000, abs >= 10_000_000_000 ? 0 : 1)}M`
  if (abs >= 1_000_000)     return `${sign}Rp${trim(abs / 1_000_000, abs >= 10_000_000 ? 0 : 1)}jt`
  if (abs >= 10_000)        return `${sign}Rp${Math.round(abs / 1000)}rb`
  return formatRupiah(n)
}

// formatDate / formatDateTime / formatTime defaultnya pakai TZ tenant aktif —
// pass `tz` eksplisit kalau perlu override (mis. saat super-admin meninjau
// data tenant lain). Kalau date string tidak valid, kembalikan apa adanya.
export const formatDate = (dateStr, tz) => {
  if (!dateStr) return ''
  try {
    return formatDateInTz(dateStr, tz)
  } catch {
    return dateStr
  }
}

export const formatDateTime = (dateStr, tz) => {
  if (!dateStr) return ''
  try {
    return formatDateTimeInTz(dateStr, tz)
  } catch {
    return dateStr
  }
}

export const formatTime = (dateStr, tz) => {
  if (!dateStr) return ''
  try {
    return formatTimeInTz(dateStr, tz)
  } catch {
    return dateStr
  }
}

export const timeAgo = (dateStr) => {
  try {
    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr
    return formatDistanceToNow(date, { addSuffix: true, locale: idLocale })
  } catch {
    return dateStr
  }
}

export const cn = (...classes) => {
  return classes.filter(Boolean).join(' ')
}
