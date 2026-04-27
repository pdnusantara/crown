export function HeatmapChart({ data }) {
  const hours = Array.from({ length: 12 }, (_, i) => `${String(i + 9).padStart(2, '0')}:00`)
  const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
  const allValues = data.flat()
  const max = allValues.length > 0 ? Math.max(...allValues) : 1

  return (
    <div className="overflow-x-auto">
      <div className="inline-grid gap-1" style={{ gridTemplateColumns: `auto repeat(7, 1fr)` }}>
        {/* Header row */}
        <div />
        {days.map(d => (
          <div key={d} className="text-xs text-muted text-center px-2 py-1 min-w-[36px]">{d}</div>
        ))}
        {/* Data rows */}
        {hours.map((hour, hi) => (
          <>
            <div key={`label-${hour}`} className="text-xs text-muted pr-2 flex items-center whitespace-nowrap">{hour}</div>
            {days.map((day, di) => {
              const val = data[hi]?.[di] || 0
              const opacity = max > 0 ? val / max : 0
              return (
                <div
                  key={`${hour}-${day}`}
                  title={`${day} ${hour} — ${val} transaksi`}
                  className="w-8 h-8 rounded-md cursor-default transition-all hover:ring-1 hover:ring-gold"
                  style={{ backgroundColor: `rgba(201, 168, 76, ${opacity * 0.9 + 0.05})` }}
                />
              )
            })}
          </>
        ))}
      </div>
    </div>
  )
}

export default HeatmapChart
