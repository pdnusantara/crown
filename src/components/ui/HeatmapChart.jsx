import { Fragment } from 'react'

const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const DAY_FULL = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

// Ramp sekuensial BRASS heritage untuk latar terang (area tenant = light-only):
// makin ramai makin pekat (krem → brass → brass tua). Selaras landing.
const STOPS = [
  [0, [246, 241, 231]],    // cream
  [0.25, [235, 217, 168]], // brass pucat
  [0.5, [235, 190, 90]],   // brass muda
  [0.75, [224, 168, 46]],  // brass (--accent)
  [1, [154, 123, 30]],     // brass tua
]

function rampColor(t) {
  const x = Math.max(0, Math.min(1, t))
  for (let i = 1; i < STOPS.length; i++) {
    const [t0, c0] = STOPS[i - 1]
    const [t1, c1] = STOPS[i]
    if (x <= t1) {
      const f = t1 === t0 ? 0 : (x - t0) / (t1 - t0)
      const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * f))
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
    }
  }
  const last = STOPS[STOPS.length - 1][1]
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`
}

export function HeatmapChart({ data = [], hoursStart = 9, hoursEnd = 20 }) {
  // Rentang jam mengikuti jam buka cabang (dari meta endpoint). Default 09–20.
  const start = Number.isFinite(hoursStart) ? hoursStart : 9
  const end = Number.isFinite(hoursEnd) && hoursEnd >= start ? hoursEnd : 20
  const count = end - start + 1
  const hours = Array.from({ length: count }, (_, i) => `${String(start + i).padStart(2, '0')}:00`)

  const grid = data || []
  // Cari max + sel paling ramai/sepi (di antara yang ada transaksinya) untuk insight & sorotan.
  let max = 0
  let peak = null
  let quiet = null
  for (let hi = 0; hi < count; hi++) {
    for (let di = 0; di < 7; di++) {
      const v = grid[hi]?.[di] || 0
      if (v > max) max = v
      if (v > 0 && (peak == null || v > peak.v)) peak = { hi, di, v }
      if (v > 0 && (quiet == null || v < quiet.v)) quiet = { hi, di, v }
    }
  }
  const samePeakQuiet = peak && quiet && peak.hi === quiet.hi && peak.di === quiet.di

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        {/* Grid mengisi penuh lebar kolom: sel melar rata mengikuti kartu.
            min-w kecil supaya muat di layar HP tanpa scroll horizontal. */}
        <div className="grid w-full min-w-[300px] gap-1 sm:gap-1.5" style={{ gridTemplateColumns: 'minmax(34px, auto) repeat(7, 1fr)' }}>
          {/* Header row */}
          <div />
          {DAYS.map((d) => (
            <div key={d} className="text-[11px] font-medium text-muted text-center px-1 py-1">{d}</div>
          ))}
          {/* Data rows */}
          {hours.map((hour, hi) => (
            <Fragment key={hour}>
              <div className="text-[10px] sm:text-[11px] text-muted pr-1.5 sm:pr-2 flex items-center justify-end whitespace-nowrap">{hour}</div>
              {DAYS.map((day, di) => {
                const val = grid[hi]?.[di] || 0
                const t = max > 0 ? val / max : 0
                const isPeak = peak && peak.hi === hi && peak.di === di
                // Sel kosong = netral lavender (mundur ke belakang); ada transaksi = ramp
                // dengan lantai 0.12 supaya aktivitas terkecil tetap terlihat.
                const bg = val === 0 ? '#F1F1F8' : rampColor(0.12 + t * 0.88)
                return (
                  <div
                    key={`${hour}-${day}`}
                    title={`${DAY_FULL[di]} ${hour} — ${val} transaksi`}
                    className={`relative h-8 sm:h-11 rounded-md sm:rounded-lg cursor-default transition-transform duration-150 hover:scale-[1.06] hover:z-10 hover:shadow-md ${isPeak ? 'ring-2 ring-offset-1 ring-brand' : ''}`}
                    style={{ backgroundColor: bg }}
                  >
                    {val > 0 && (
                      <span className={`absolute inset-0 items-center justify-center text-[10px] sm:text-[11px] font-semibold ${isPeak ? 'flex' : 'hidden sm:flex'} ${t > 0.55 ? 'text-white' : 'text-indigo-900/70'}`}>{val}</span>
                    )}
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Legenda skala + insight otomatis */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span>Sepi</span>
          <span
            className="h-2.5 w-28 rounded-full"
            style={{ background: 'linear-gradient(90deg, #F6F1E7, #EBD9A8, #EBBE5A, #E0A82E, #9A7B1E)' }}
          />
          <span>Ramai</span>
        </div>
        {peak && (
          <p className="text-xs text-off-white">
            🔥 Paling ramai{' '}
            <span className="font-semibold">{DAY_FULL[peak.di]} {hours[peak.hi]}</span> ({peak.v} transaksi)
            {quiet && !samePeakQuiet && (
              <span className="text-muted"> · paling sepi {DAY_FULL[quiet.di]} {hours[quiet.hi]}</span>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

export default HeatmapChart
