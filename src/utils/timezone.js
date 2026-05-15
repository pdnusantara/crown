// Timezone helpers untuk frontend.
//
// Tujuan: semua tampilan tanggal/waktu di seluruh aplikasi harus konsisten
// memakai zona tenant — bukan zona browser lokal — supaya admin yang
// kebetulan akses dari luar negeri tetap melihat data dengan jam yang sama
// dengan kasir di lokasi.

import { useAuthStore } from '../store/authStore.js'

export const DEFAULT_TZ = 'Asia/Jakarta'

// Daftar fallback (sinkron dengan backend `SUPPORTED_TIMEZONES`).
// Kalau backend tidak menjawab, pilihan ini tetap tampil di selector.
export const FALLBACK_TIMEZONES = [
  { value: 'Asia/Jakarta',      label: 'WIB (Jakarta) — UTC+7',         offsetHours: 7 },
  { value: 'Asia/Pontianak',    label: 'WIB (Pontianak) — UTC+7',       offsetHours: 7 },
  { value: 'Asia/Makassar',     label: 'WITA (Bali, Makassar) — UTC+8', offsetHours: 8 },
  { value: 'Asia/Jayapura',     label: 'WIT (Jayapura, Papua) — UTC+9', offsetHours: 9 },
  { value: 'Asia/Singapore',    label: 'Singapore — UTC+8',             offsetHours: 8 },
  { value: 'Asia/Kuala_Lumpur', label: 'Kuala Lumpur — UTC+8',          offsetHours: 8 },
  { value: 'Asia/Tokyo',        label: 'Tokyo — UTC+9',                 offsetHours: 9 },
  { value: 'UTC',               label: 'UTC',                           offsetHours: 0 },
]

export function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function normalizeTimezone(tz) {
  return isValidTimezone(tz) ? tz : DEFAULT_TZ
}

// Ambil TZ tenant aktif dari authStore. Aman dipanggil di luar React component
// (misal dari util) karena Zustand store boleh dibaca langsung lewat .getState().
export function getTenantTimezone() {
  try {
    const user = useAuthStore.getState().user
    return normalizeTimezone(user?.tenant?.timezone)
  } catch {
    return DEFAULT_TZ
  }
}

// Format Date apa pun ke string sesuai TZ tenant.
// `opts` adalah Intl.DateTimeFormatOptions; default-nya rapi untuk display.
export function formatInTenantTz(date, opts = {}, tz) {
  if (!date) return ''
  const tzSafe = normalizeTimezone(tz || getTenantTimezone())
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: tzSafe,
      ...opts,
    }).format(new Date(date))
  } catch {
    return ''
  }
}

// Helper presets siap pakai.
export const formatDateInTz = (date, tz) =>
  formatInTenantTz(date, { day: '2-digit', month: 'short', year: 'numeric' }, tz)

export const formatDateTimeInTz = (date, tz) =>
  formatInTenantTz(date, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }, tz)

export const formatTimeInTz = (date, tz) =>
  formatInTenantTz(date, { hour: '2-digit', minute: '2-digit', hour12: false }, tz)

// Untuk grouping/key (mis. revenue per hari): "YYYY-MM-DD" di TZ tenant.
export const formatYmdInTz = (date, tz) => {
  if (!date) return ''
  const tzSafe = normalizeTimezone(tz || getTenantTimezone())
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tzSafe }).format(new Date(date))
  } catch {
    return ''
  }
}

// Label TZ singkat untuk ditampilkan ("WIB" / "WITA" / "WIT" / "UTC+8").
const ABBREV = {
  'Asia/Jakarta':      'WIB',
  'Asia/Pontianak':    'WIB',
  'Asia/Makassar':     'WITA',
  'Asia/Jayapura':     'WIT',
  'UTC':               'UTC',
}
export function tzAbbrev(tz) {
  const t = normalizeTimezone(tz || getTenantTimezone())
  if (ABBREV[t]) return ABBREV[t]
  // Fallback: ambil offset numerik dari Intl.
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone: t, timeZoneName: 'shortOffset' }).formatToParts(new Date())
    return parts.find(p => p.type === 'timeZoneName')?.value || t
  } catch {
    return t
  }
}
