import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search, RefreshCw, Download, X, Receipt, Gift, Wallet, Users,
  ChevronLeft, ChevronRight, Tag,
} from 'lucide-react'
import { usePromotionRedemptionHistory } from '../../hooks/usePromotions.js'
import Card, { CardHeader } from '../ui/Card.jsx'
import Button from '../ui/Button.jsx'
import { formatRupiah } from '../../utils/format.js'
import { formatDateTimeInTz, getTenantTimezone, DEFAULT_TZ } from '../../utils/timezone.js'

const PAGE_LIMIT = 25

const TYPE_I18N = {
  subscription: 'appliesSubscription',
  upgrade:      'appliesUpgrade',
  branch_addon: 'appliesBranchAddon',
}

function escapeCsv(v) {
  if (v == null) return ''
  const s = String(v)
  return s.includes(',') || s.includes('\n') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
}

function StatTile({ icon: Icon, label, value, tone = 'brand' }) {
  const toneCls = {
    brand:   'text-brand bg-brand/10',
    success: 'text-green-400 bg-green-400/10',
    blue:    'text-blue-400 bg-blue-400/10',
  }[tone]
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${toneCls}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="text-lg font-bold text-off-white truncate">{value}</p>
      </div>
    </Card>
  )
}

export default function PromotionRedemptionHistory({ promos = [], initialCode = '' }) {
  const { t } = useTranslation()
  const tz = getTenantTimezone() || DEFAULT_TZ
  const tp = (k, opts) => t(`superAdmin.promotions.${k}`, opts)

  // Map kode awal (dari tombol "Lihat penggunaan") ke promotionId.
  const initialPromoId = useMemo(
    () => promos.find(p => p.code === initialCode)?.id || '',
    [promos, initialCode],
  )

  const [promotionId, setPromotionId] = useState(initialPromoId)
  const [search, setSearch]           = useState('')
  const [debounced, setDebounced]     = useState('')
  const [from, setFrom]               = useState('')
  const [to, setTo]                   = useState('')
  const [page, setPage]               = useState(1)

  // Sinkronkan bila datang dari tombol kartu promo
  useEffect(() => { setPromotionId(initialPromoId) }, [initialPromoId])

  useEffect(() => {
    const id = setTimeout(() => { setDebounced(search.trim()); setPage(1) }, 300)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => { setPage(1) }, [promotionId, from, to])

  const filters = useMemo(() => ({
    page, limit: PAGE_LIMIT,
    ...(promotionId && { promotionId }),
    ...(debounced && { search: debounced }),
    ...(from && { from }),
    ...(to && { to }),
  }), [page, promotionId, debounced, from, to])

  const { data, isLoading, isError, refetch, isFetching } = usePromotionRedemptionHistory(filters)

  const rows       = data?.data || []
  const total      = data?.total || 0
  const summary    = data?.summary || {}
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT))

  const hasFilters = promotionId || debounced || from || to
  function resetFilters() { setPromotionId(''); setSearch(''); setDebounced(''); setFrom(''); setTo(''); setPage(1) }

  function typeLabel(type) { return TYPE_I18N[type] ? tp(TYPE_I18N[type]) : (type || '—') }

  function exportCSV() {
    const head = [tp('histColCode'), tp('histColTenant'), tp('histColType'), tp('histColDiscount'), tp('histColOrder'), tp('histColDate')]
    const body = rows.map(r => [
      r.promotionCode, r.tenantName, r.orderType, r.discountApplied, r.merchantOrderId,
      formatDateTimeInTz(r.redeemedAt, tz),
    ].map(escapeCsv).join(','))
    const csv = '﻿' + [head.join(','), ...body].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `riwayat-promo-${new Date().toISOString().slice(0, 10)}.csv` })
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile icon={Receipt} tone="brand"   label={tp('histKpiTotal')}    value={(summary.count ?? total).toLocaleString('id-ID')} />
        <StatTile icon={Wallet}  tone="success" label={tp('histKpiDiscount')} value={formatRupiah(summary.totalDiscount || 0)} />
        <StatTile icon={Users}   tone="blue"    label={tp('histKpiTenants')}  value={(summary.uniqueTenants || 0).toLocaleString('id-ID')} />
      </div>

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <select
            value={promotionId}
            onChange={e => setPromotionId(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40 md:w-52"
          >
            <option value="">{tp('histAllPromos')}</option>
            {promos.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tp('histSearchPlaceholder')}
              className="w-full bg-dark-surface border border-dark-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-off-white placeholder:text-muted focus:outline-none focus:border-brand/40"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted shrink-0">{tp('histFrom')}</span>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="bg-dark-surface border border-dark-border rounded-xl px-2 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40" />
            <span className="text-[11px] text-muted shrink-0">{tp('histTo')}</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="bg-dark-surface border border-dark-border rounded-xl px-2 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40" />
          </div>
          {hasFilters && (
            <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-muted hover:text-off-white shrink-0">
              <X size={12} /> {tp('resetFilter')}
            </button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gift size={15} className="text-muted" />
            <span className="font-semibold text-off-white">{tp('histCount', { count: total.toLocaleString('id-ID') })}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} loading={isFetching && !isLoading}>
              {t('superAdmin.promotions.retry')}
            </Button>
            <Button variant="outline" size="sm" icon={Download} onClick={exportCSV} disabled={!rows.length}>
              {tp('histExport')}
            </Button>
          </div>
        </CardHeader>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 bg-dark-bg rounded-lg animate-pulse" />)}
          </div>
        ) : isError ? (
          <div className="text-center py-12">
            <p className="text-muted text-sm mb-3">{tp('histError')}</p>
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()}>{t('superAdmin.promotions.retry')}</Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12">
            <Tag size={32} className="text-muted/40 mx-auto mb-3" />
            <p className="text-muted text-sm">{hasFilters ? tp('histNoResults') : tp('histEmpty')}</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border text-muted text-xs">
                    <th className="text-left p-3">{tp('histColCode')}</th>
                    <th className="text-left p-3">{tp('histColTenant')}</th>
                    <th className="text-left p-3">{tp('histColType')}</th>
                    <th className="text-right p-3">{tp('histColDiscount')}</th>
                    <th className="text-left p-3">{tp('histColOrder')}</th>
                    <th className="text-left p-3">{tp('histColDate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-b border-dark-border/50 hover:bg-dark-card/40 transition-colors">
                      <td className="p-3 font-mono text-xs font-bold text-brand">{r.promotionCode || '—'}</td>
                      <td className="p-3 text-off-white">{r.tenantName || <span className="text-muted">—</span>}</td>
                      <td className="p-3 text-muted">{typeLabel(r.orderType)}</td>
                      <td className="p-3 text-right font-medium text-green-400">−{formatRupiah(r.discountApplied)}</td>
                      <td className="p-3 font-mono text-xs text-muted">{r.merchantOrderId || '—'}</td>
                      <td className="p-3 text-muted text-xs">{formatDateTimeInTz(r.redeemedAt, tz)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-dark-border/50">
              {rows.map(r => (
                <div key={r.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-brand">{r.promotionCode || '—'}</span>
                    <span className="text-sm font-semibold text-green-400 shrink-0">−{formatRupiah(r.discountApplied)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-off-white truncate">{r.tenantName || '—'}</span>
                    <span className="text-xs text-muted shrink-0">{typeLabel(r.orderType)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span className="font-mono truncate">{r.merchantOrderId || '—'}</span>
                    <span className="shrink-0">{formatDateTimeInTz(r.redeemedAt, tz)}</span>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-dark-border">
                <span className="text-xs text-muted">{tp('histPagination', { page, total: totalPages })}</span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} icon={ChevronLeft}>
                    {tp('histPrev')}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                    {tp('histNext')} <ChevronRight size={15} />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
