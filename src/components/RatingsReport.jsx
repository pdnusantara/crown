import React, { useState } from 'react'
import { Star, MessageSquare, Calendar, Store, User as UserIcon } from 'lucide-react'
import { useBarberRatings } from '../hooks/useBarberRatings.js'
import { useShopRatings, useShopRatingStats } from '../hooks/useShopRatings.js'
import { useTranslation } from 'react-i18next'

// Komponen laporan rating yang dipakai bersama oleh halaman kasir & barber.
// Tampilan: KPI tiles ringkas + dua tab (Toko / Per Barber) + daftar kartu.
// Role-scope ditangani backend (kasir=branch, barber=self).
//
// Props:
//   title       — judul halaman ("Rating Toko" / "Rating Saya")
//   showShopTab — tampilkan tab rating toko (default true). Barber view skip.
//   subtitle    — caption kecil di bawah judul (opsional)

function Stars({ value, size = 'sm' }) {
  const sz = size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${sz} ${
            n <= value ? 'fill-yellow-400 text-yellow-400' : 'text-muted/30'
          }`}
        />
      ))}
    </div>
  )
}

function KpiTile({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-2xl font-semibold text-off-white mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function ShopRatingList({ items, loading }) {
  if (loading && !items.length) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 animate-pulse h-20" />
        ))}
      </div>
    )
  }
  if (!items.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-muted text-sm">
        Belum ada rating dari pelanggan.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {items.map((r) => (
        <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Stars value={r.rating} />
                <span className="text-xs text-muted">
                  {r.transaction?.customerName || 'Pelanggan'}
                </span>
              </div>
              {r.comment && (
                <p className="text-sm text-off-white/90 mt-2 leading-relaxed">
                  <MessageSquare className="inline w-3.5 h-3.5 mr-1 text-muted" />
                  {r.comment}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2 text-[11px] text-muted">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {fmtDate(r.createdAt)}
                </span>
                {r.branch?.name && (
                  <span className="flex items-center gap-1">
                    <Store className="w-3 h-3" /> {r.branch.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function BarberRatingList({ items, loading }) {
  if (loading && !items.length) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 animate-pulse h-20" />
        ))}
      </div>
    )
  }
  if (!items.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-muted text-sm">
        Belum ada rating per barber.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {items.map((r) => (
        <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Stars value={r.rating} />
                {r.barber?.name && (
                  <span className="text-xs text-off-white">
                    <UserIcon className="inline w-3 h-3 mr-1 text-muted" />
                    {r.barber.name}
                  </span>
                )}
              </div>
              {r.comment && (
                <p className="text-sm text-off-white/90 mt-2 leading-relaxed">
                  <MessageSquare className="inline w-3.5 h-3.5 mr-1 text-muted" />
                  {r.comment}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2 text-[11px] text-muted">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {fmtDate(r.createdAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function RatingsReport({
  title = 'Rating',
  subtitle,
  showShopTab = true,
}) {
  const [tab, setTab] = useState(showShopTab ? 'shop' : 'barber')

  const shopStats = useShopRatingStats({})
  const shopRatings = useShopRatings({ limit: 50 })
  const barberRatings = useBarberRatings({ limit: 50, sortBy: 'createdAt', sortDir: 'desc' })

  const shopAvg = shopStats.data?.avg || 0
  const shopTotal = shopStats.data?.total || 0
  const barberTotal = barberRatings.data?.items?.length || 0
  const barberAvg = barberTotal
    ? Number(
        (barberRatings.data.items.reduce((s, r) => s + r.rating, 0) / barberTotal).toFixed(2)
      )
    : 0

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-off-white">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Rating Toko" value={shopAvg.toFixed(1)} sub={`${shopTotal} ulasan`} />
        <KpiTile label="Rating Barber" value={barberAvg.toFixed(1)} sub={`${barberTotal} penilaian`} />
        <KpiTile label="Ulasan Bintang 5" value={shopStats.data?.distribution?.[5] || 0} sub="Toko" />
        <KpiTile label="Bintang ≤ 2" value={(shopStats.data?.distribution?.[1] || 0) + (shopStats.data?.distribution?.[2] || 0)} sub="Perlu ditinjau" />
      </div>

      {showShopTab && (
        <div className="flex gap-2 border-b border-white/10">
          <button
            type="button"
            onClick={() => setTab('shop')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'shop'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-muted hover:text-off-white'
            }`}
          >
            Rating Toko
          </button>
          <button
            type="button"
            onClick={() => setTab('barber')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'barber'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-muted hover:text-off-white'
            }`}
          >
            Per Barber
          </button>
        </div>
      )}

      {tab === 'shop' && showShopTab ? (
        <ShopRatingList items={shopRatings.data?.items || []} loading={shopRatings.isLoading} />
      ) : (
        <BarberRatingList items={barberRatings.data?.items || []} loading={barberRatings.isLoading} />
      )}
    </div>
  )
}
