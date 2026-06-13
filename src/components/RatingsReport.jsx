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
    <div className="rounded-xl border border-dark-border bg-dark-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-2xl font-semibold text-off-white mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

function fmtDate(d, locale = 'id-ID') {
  if (!d) return '—'
  return new Date(d).toLocaleString(locale, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function ShopRatingList({ items, loading }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'en' ? 'en-US' : 'id-ID'
  if (loading && !items.length) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-dark-border bg-dark-card p-4 animate-pulse h-20" />
        ))}
      </div>
    )
  }
  if (!items.length) {
    return (
      <div className="rounded-xl border border-dark-border bg-dark-card p-8 text-center text-muted text-sm">
        {t('ratingsReport.noShopRatings')}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {items.map((r) => (
        <div key={r.id} className="rounded-xl border border-dark-border bg-dark-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Stars value={r.rating} />
                <span className="text-xs text-muted">
                  {r.transaction?.customerName || t('ratingsReport.customerFallback')}
                </span>
              </div>
              {r.comment && (
                <p className="text-sm text-off-white mt-2 leading-relaxed">
                  <MessageSquare className="inline w-3.5 h-3.5 mr-1 text-muted" />
                  {r.comment}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-muted">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {fmtDate(r.createdAt, locale)}
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
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'en' ? 'en-US' : 'id-ID'
  if (loading && !items.length) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-dark-border bg-dark-card p-4 animate-pulse h-20" />
        ))}
      </div>
    )
  }
  if (!items.length) {
    return (
      <div className="rounded-xl border border-dark-border bg-dark-card p-8 text-center text-muted text-sm">
        {t('ratingsReport.noBarberRatings')}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {items.map((r) => (
        <div key={r.id} className="rounded-xl border border-dark-border bg-dark-card p-4">
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
                <p className="text-sm text-off-white mt-2 leading-relaxed">
                  <MessageSquare className="inline w-3.5 h-3.5 mr-1 text-muted" />
                  {r.comment}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-muted">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {fmtDate(r.createdAt, locale)}
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
  title,
  subtitle,
  showShopTab = true,
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState(showShopTab ? 'shop' : 'barber')
  const heading = title ?? t('ratingsReport.defaultTitle')

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
        <h1 className="text-xl font-semibold text-off-white">{heading}</h1>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>

      {(shopStats.isError || shopRatings.isError || barberRatings.isError) && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-red-400/30 bg-red-400/5">
          <p className="text-sm text-red-400">{t('ratingsReport.loadError')}</p>
          <button
            type="button"
            onClick={() => { shopStats.refetch?.(); shopRatings.refetch?.(); barberRatings.refetch?.() }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-dark-border text-off-white hover:bg-dark-card transition-colors whitespace-nowrap"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label={t('ratingsReport.kpiShopRating')} value={shopAvg.toFixed(1)} sub={t('ratingsReport.kpiReviewsCount', { count: shopTotal })} />
        <KpiTile label={t('ratingsReport.kpiBarberRating')} value={barberAvg.toFixed(1)} sub={t('ratingsReport.kpiRatingsCount', { count: barberTotal })} />
        <KpiTile label={t('ratingsReport.kpiFiveStar')} value={shopStats.data?.distribution?.[5] || 0} sub={t('ratingsReport.kpiShop')} />
        <KpiTile label={t('ratingsReport.kpiLowStar')} value={(shopStats.data?.distribution?.[1] || 0) + (shopStats.data?.distribution?.[2] || 0)} sub={t('ratingsReport.kpiNeedReview')} />
      </div>

      {showShopTab && (
        <div className="flex gap-2 border-b border-dark-border">
          <button
            type="button"
            onClick={() => setTab('shop')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'shop'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-muted hover:text-off-white'
            }`}
          >
            {t('ratingsReport.tabShop')}
          </button>
          <button
            type="button"
            onClick={() => setTab('barber')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'barber'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-muted hover:text-off-white'
            }`}
          >
            {t('ratingsReport.tabBarber')}
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
