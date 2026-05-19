// Helper bersama fitur Absensi Digital — dipakai halaman staf & admin.

export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
export const DAY_NAMES_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

export const ATT_STATUS = {
  present: { label: 'Hadir',      variant: 'success' },
  late:    { label: 'Terlambat', variant: 'warning' },
  absent:  { label: 'Alpa',      variant: 'danger'  },
  leave:   { label: 'Izin',      variant: 'info'    },
}

export function statusMeta(status) {
  return ATT_STATUS[status] || { label: status || '-', variant: 'muted' }
}

// Menit → "2j 15m" / "45m" / "-".
export function fmtDuration(min) {
  if (min == null || min < 0) return '-'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}j` : `${h}j ${m}m`
}

// ISO datetime → "HH:MM" pada zona waktu tertentu (default lokal perangkat).
export function fmtTime(iso, tz) {
  if (!iso) return '-'
  try {
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit', minute: '2-digit', hour12: false,
      ...(tz ? { timeZone: tz } : {}),
    }).format(new Date(iso))
  } catch {
    return '-'
  }
}

// "YYYY-MM-DD" atau ISO → "Sen, 19 Mei 2026".
export function fmtDateLong(value) {
  if (!value) return '-'
  try {
    const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00Z`)
      : new Date(value)
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      timeZone: 'UTC',
    }).format(d)
  } catch {
    return String(value)
  }
}
