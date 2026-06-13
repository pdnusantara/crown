// =============================================================================
// TARatingsPage — Dedicated rating moderation page (production-ready)
// =============================================================================
// Fitur:
//  - KPI tiles (avg, total, pending publish, low rating, published)
//  - Search debounced 400ms
//  - Filter: status moderasi, rating range, branch, barber, period, has-comment, has-ticket
//  - Sort by createdAt / rating asc/desc
//  - Table desktop + card mobile (sama-sama responsive)
//  - Bulk action (publish, hide, delete) dengan ConfirmDialog
//  - Per-row quick action: publish/hide, view ticket, view tx, view in detail modal
//  - Detail modal: full info + comment, link tiket, link transaksi
//  - Pagination cursor-based ("Muat lebih")
//  - Skeleton loading + empty state + error retry
//  - Export CSV (server-side)
//  - Realtime auto-update dengan throttle anti-spam
//  - Optimistic UI di publish single
//  - Dark mode safe (semua warna pakai design token)
//  - Multi-tenant: API auto-scope ke tenant aktif (backend re-validate)
//  - ErrorBoundary wrapper
// =============================================================================
import React, { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Star, Search, X, AlertTriangle, Eye, EyeOff, Trash2, ExternalLink,
  Filter, Download, RefreshCw, ChevronDown, CheckSquare, Square,
  MessageSquare, Ticket, Calendar as CalIcon, CheckCircle, AlertCircle,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore.js'
import {
  useBarberRatings, useBarberRatingStats,
  usePublishRating, useBulkPublishRatings, useBulkHideRatings, useBulkDeleteRatings,
} from '../../hooks/useBarberRatings.js'
import { useBranches } from '../../hooks/useBranches.js'
import { useUsers } from '../../hooks/useUsers.js'
import { useIsFeatureEnabled } from '../../hooks/useFeatureFlags.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import LiveBadge from '../../components/ui/LiveBadge.jsx'
import ErrorBoundary from '../../components/ui/ErrorBoundary.jsx'
import { SkeletonRow } from '../../components/ui/Skeleton.jsx'
import { formatDateTime, formatRupiah } from '../../utils/format.js'
import api from '../../lib/api.js'

// ---- helpers ---------------------------------------------------------------
function useDebounced(value, ms = 400) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

function StarsRow({ value, size = 'sm' }) {
  const { t } = useTranslation()
  const isLow = value <= 2
  const isHigh = value >= 4
  const cls = size === 'lg' ? 'text-lg' : size === 'md' ? 'text-base' : 'text-sm'
  const color = isLow ? 'text-red-400' : isHigh ? 'text-brand' : 'text-amber-400'
  return (
    <span
      role="img"
      aria-label={t('tenantAdmin.ratings.starsAria', { value })}
      className={`tabular-nums whitespace-nowrap ${cls} ${color}`}
    >
      {'★'.repeat(value)}{'☆'.repeat(5 - value)}
    </span>
  )
}

function StatusBadge({ status }) {
  const { t } = useTranslation()
  if (status === 'published') return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 font-semibold uppercase tracking-wide">
      <CheckCircle className="w-2.5 h-2.5" /> {t('tenantAdmin.ratings.statusLive')}
    </span>
  )
  if (status === 'hidden') return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-dark-card text-muted border border-dark-border font-semibold uppercase tracking-wide">
      <EyeOff className="w-2.5 h-2.5" /> {t('tenantAdmin.ratings.statusHidden')}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40 font-semibold uppercase tracking-wide">
      {t('tenantAdmin.ratings.statusPending')}
    </span>
  )
}

function KpiTile({ icon: Icon, label, value, accent = 'gold', loading, onClick, active }) {
  const { t } = useTranslation()
  const accents = {
    gold:    'bg-brand/10 border-brand/30 text-brand',
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    amber:   'bg-amber-500/10 border-amber-500/30 text-amber-300',
    red:     'bg-red-500/10 border-red-500/30 text-red-400',
    blue:    'bg-blue-500/10 border-blue-500/30 text-blue-300',
  }
  const inner = (
    <div className="flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${accents[accent]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-muted truncate">{label}</p>
        {loading ? (
          <div className="h-5 mt-1 w-12 bg-dark-card animate-pulse rounded" />
        ) : (
          <p className="text-base sm:text-lg font-bold text-off-white tabular-nums truncate">{value}</p>
        )}
      </div>
    </div>
  )
  // Tile yang bisa diklik = quick-filter (pending/published/low rating).
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        title={active ? t('tenantAdmin.ratings.clickToClearFilter') : t('tenantAdmin.ratings.clickToFilter')}
        className={`bg-dark-card rounded-2xl border p-3 sm:p-4 min-w-0 overflow-hidden text-left w-full transition-all hover:border-brand/40 hover:bg-dark-surface active:scale-[0.98] ${
          active ? 'border-brand/60 ring-2 ring-brand/30' : 'border-dark-border'
        }`}
      >
        {inner}
      </button>
    )
  }
  return (
    <Card className="p-3 sm:p-4 min-w-0 overflow-hidden">{inner}</Card>
  )
}

// ---- Main ------------------------------------------------------------------
function TARatingsPageInner() {
  const { t, i18n } = useTranslation()
  const numLocale = i18n.language === 'en' ? 'en-US' : 'id-ID'
  const { user } = useAuthStore()
  const tenantId = user?.tenantId
  const navigate = useNavigate()
  const toast = useToast()
  const featureEnabled = useIsFeatureEnabled(tenantId, 'barber_rating')

  // ── Filter state ─────────────────────────────────────────────────────────
  const [search, setSearch]     = useState('')
  const searchDeb = useDebounced(search, 400)
  const [status, setStatus]     = useState('all')   // 'all'|'pending'|'published'|'hidden'
  const [ratingTab, setRatingTab] = useState('all') // 'all'|'low' (≤2)|'mid' (3)|'high' (≥4)
  const [branchId, setBranchId] = useState('all')
  const [barberId, setBarberId] = useState('all')
  const [period, setPeriod]     = useState('30d')   // '7d'|'30d'|'90d'|'all'
  const [hasComment, setHasComment] = useState('any') // 'any'|'true'|'false'
  const [hasTicket, setHasTicket]   = useState('any')
  const [sortBy, setSortBy]     = useState('createdAt') // 'createdAt'|'rating'
  const [sortDir, setSortDir]   = useState('desc')
  const [cursor, setCursor]     = useState(null)
  const [showFilters, setShowFilters] = useState(false)

  // ── Selection state ──────────────────────────────────────────────────────
  const [selected, setSelected] = useState(new Set())
  const [detailRating, setDetailRating] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null) // 'bulk-publish'|'bulk-hide'|'bulk-delete'

  const { data: branches = [] } = useBranches(tenantId)
  const { data: allBarbers = [] } = useUsers({ role: 'barber' })

  // Build filter object yang dikirim ke hook
  const filters = useMemo(() => {
    const f = { limit: 50, sortBy, sortDir }
    if (cursor) f.cursor = cursor
    if (searchDeb.trim()) f.search = searchDeb.trim()
    if (status !== 'all') f.publishStatus = status
    if (ratingTab === 'low')  { f.minRating = 1; f.maxRating = 2 }
    if (ratingTab === 'mid')  { f.minRating = 3; f.maxRating = 3 }
    if (ratingTab === 'high') { f.minRating = 4; f.maxRating = 5 }
    if (branchId !== 'all') f.branchId = branchId
    if (barberId !== 'all') f.barberId = barberId
    if (hasComment !== 'any') f.hasComment = hasComment
    if (hasTicket !== 'any')  f.hasTicket  = hasTicket
    if (period !== 'all') {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
      const start = new Date(Date.now() - days * 86400000)
      f.startDate = start.toISOString()
    }
    return f
  }, [cursor, searchDeb, status, ratingTab, branchId, barberId, period, hasComment, hasTicket, sortBy, sortDir])

  // Reset cursor when filters change (kecuali cursor itu sendiri)
  useEffect(() => { setCursor(null); setSelected(new Set()) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchDeb, status, ratingTab, branchId, barberId, period, hasComment, hasTicket, sortBy, sortDir]
  )

  const { data, isLoading, isError, isFetching, refetch } = useBarberRatings(filters)
  const items = data?.items || []
  const meta  = data?.meta || {}

  const { data: stats } = useBarberRatingStats({ days: 30, branchId: branchId !== 'all' ? branchId : undefined })

  // ── Mutations ────────────────────────────────────────────────────────────
  const publishMut = usePublishRating()
  const bulkPubMut = useBulkPublishRatings()
  const bulkHideMut = useBulkHideRatings()
  const bulkDelMut = useBulkDeleteRatings()

  const handlePublish = async (id, newStatus) => {
    try {
      await publishMut.mutateAsync({ id, status: newStatus })
      toast.success(newStatus === 'published' ? t('tenantAdmin.ratings.testimonialPublished') : newStatus === 'hidden' ? t('tenantAdmin.ratings.testimonialHidden') : t('tenantAdmin.ratings.statusChanged'))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.ratings.statusChangeFailed'))
    }
  }

  const performBulk = async () => {
    const ids = [...selected]
    if (!ids.length) { setConfirmAction(null); return }
    try {
      if (confirmAction === 'bulk-publish') {
        const r = await bulkPubMut.mutateAsync(ids)
        toast.success(t('tenantAdmin.ratings.bulkPublished', { count: r.affected }) + (r.skipped ? t('tenantAdmin.ratings.bulkSkippedSuffix', { count: r.skipped }) : ''))
      } else if (confirmAction === 'bulk-hide') {
        const r = await bulkHideMut.mutateAsync(ids)
        toast.success(t('tenantAdmin.ratings.bulkHidden', { count: r.affected }))
      } else if (confirmAction === 'bulk-delete') {
        const r = await bulkDelMut.mutateAsync(ids)
        toast.success(t('tenantAdmin.ratings.bulkDeleted', { count: r.deleted }))
      }
      setSelected(new Set())
      setConfirmAction(null)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.ratings.operationFailed'))
    }
  }

  // ── Export CSV ───────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const params = { ...filters }
      delete params.cursor; delete params.limit
      const res = await api.get('/barber-ratings/export.csv', { params, responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `ratings-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      toast.success(t('tenantAdmin.ratings.exportDownloaded'))
    } catch {
      toast.error(t('tenantAdmin.ratings.exportFailed'))
    }
  }

  // ── Selection helpers ────────────────────────────────────────────────────
  const toggleSel = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const selectAllOnPage = () => {
    setSelected(new Set(items.map(i => i.id)))
  }
  const clearSel = () => setSelected(new Set())

  // ── Reset filter ─────────────────────────────────────────────────────────
  const resetFilters = () => {
    setSearch(''); setStatus('all'); setRatingTab('all'); setBranchId('all'); setBarberId('all')
    setPeriod('30d'); setHasComment('any'); setHasTicket('any'); setSortBy('createdAt'); setSortDir('desc')
    setCursor(null); setSelected(new Set())
  }

  const hasActiveFilter = search || status !== 'all' || ratingTab !== 'all' ||
    branchId !== 'all' || barberId !== 'all' || period !== '30d' ||
    hasComment !== 'any' || hasTicket !== 'any'

  // ── Feature flag check ───────────────────────────────────────────────────
  if (!featureEnabled) {
    return (
      <div className="space-y-5">
        <Card className="p-6 sm:p-10 text-center">
          <Star className="w-12 h-12 text-muted mx-auto mb-3 opacity-40" />
          <h2 className="font-display text-lg font-bold text-off-white">{t('tenantAdmin.ratings.featureOffTitle')}</h2>
          <p className="text-sm text-muted mt-1.5 max-w-md mx-auto">
            {t('tenantAdmin.ratings.featureOffDesc')}
          </p>
        </Card>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white inline-flex items-center gap-2">
            <Star className="w-5 h-5 sm:w-6 sm:h-6 text-brand fill-brand" />
            {t('tenantAdmin.ratings.pageTitle')}
          </h1>
          <p className="text-muted text-xs sm:text-sm mt-1">
            {t('tenantAdmin.ratings.pageSubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <LiveBadge className="hidden sm:inline-flex" />
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} loading={isFetching && !isLoading} aria-label={t('tenantAdmin.ratings.refresh')} />
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExport} disabled={items.length === 0}>
            <span className="hidden md:inline">{t('tenantAdmin.ratings.exportCsv')}</span>
          </Button>
        </div>
      </div>

      {/* KPI strip — 5 tiles, 2-cols mobile, 5-cols desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
        <KpiTile
          icon={Star}
          label={t('tenantAdmin.ratings.kpiAvg')}
          value={stats?.avgRating != null ? `${stats.avgRating.toFixed(1)} ★` : '—'}
          accent="gold"
          loading={!stats}
        />
        <KpiTile
          icon={MessageSquare}
          label={t('tenantAdmin.ratings.kpiTotalReviews')}
          value={stats?.totalRatings != null ? stats.totalRatings.toLocaleString(numLocale) : '—'}
          accent="blue"
          loading={!stats}
        />
        <KpiTile
          icon={Eye}
          label={t('tenantAdmin.ratings.kpiLiveTestimonials')}
          value={stats?.kpi?.publishedCount?.toLocaleString(numLocale) || '0'}
          accent="emerald"
          loading={!stats}
          active={status === 'published'}
          onClick={() => setStatus(s => s === 'published' ? 'all' : 'published')}
        />
        <KpiTile
          icon={AlertCircle}
          label={t('tenantAdmin.ratings.kpiPendingModeration')}
          value={stats?.kpi?.pendingPublishCount?.toLocaleString(numLocale) || '0'}
          accent="amber"
          loading={!stats}
          active={status === 'pending'}
          onClick={() => setStatus(s => s === 'pending' ? 'all' : 'pending')}
        />
        <KpiTile
          icon={AlertTriangle}
          label={t('tenantAdmin.ratings.kpiLowRating')}
          value={stats?.kpi?.lowRatingCount?.toLocaleString(numLocale) || '0'}
          accent="red"
          loading={!stats}
          active={ratingTab === 'low'}
          onClick={() => setRatingTab(rt => rt === 'low' ? 'all' : 'low')}
        />
      </div>

      {/* Search + filter toggle */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex-1 min-w-[200px] flex items-center gap-2 bg-dark-surface border border-dark-border rounded-xl px-3 py-2 focus-within:border-brand/60 transition-colors">
            <Search aria-hidden className="w-4 h-4 text-muted flex-shrink-0" />
            <input
              type="text"
              inputMode="search"
              role="searchbox"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('tenantAdmin.ratings.searchPlaceholder')}
              aria-label={t('tenantAdmin.ratings.searchAria')}
              className="flex-1 min-w-0 appearance-none bg-transparent border-0 text-off-white placeholder-muted text-sm outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={t('tenantAdmin.ratings.clearSearch')}
                className="flex-shrink-0 -mr-1 p-1 rounded-md text-muted hover:text-off-white hover:bg-dark-card transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setShowFilters(v => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
              showFilters || hasActiveFilter
                ? 'bg-brand/10 border-brand/40 text-brand'
                : 'bg-dark-card border-dark-border text-muted hover:text-off-white'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            {t('common.filter')}
            {hasActiveFilter && (
              <span className="ml-1 w-4 h-4 rounded-full bg-brand text-dark text-[9px] font-bold flex items-center justify-center">
                !
              </span>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Rating tabs — grid 2 kolom di mobile (4 tab tampil penuh & rata,
            tak ada yang kepotong); satu baris di desktop. */}
        <div className="grid grid-cols-2 gap-1.5 mt-3 sm:flex sm:items-center">
          {[
            { id: 'all',  label: t('tenantAdmin.ratings.tabAll'),      color: 'bg-dark-card text-off-white' },
            { id: 'high', label: t('tenantAdmin.ratings.tabPositive'), color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
            { id: 'mid',  label: t('tenantAdmin.ratings.tabNeutral'),  color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
            { id: 'low',  label: t('tenantAdmin.ratings.tabComplaint'), color: 'bg-red-500/15 text-red-400 border-red-500/30' },
          ].map(tab => {
            const isActive = ratingTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRatingTab(tab.id)}
                className={`w-full sm:w-auto sm:flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-center border transition-all ${
                  isActive
                    ? `${tab.color} border-current`
                    : 'bg-dark-surface border-dark-border text-muted hover:text-off-white'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Status pills — always visible */}
        <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-0.5">
          {[
            { id: 'all',       label: t('tenantAdmin.ratings.statusAll') },
            { id: 'pending',   label: t('tenantAdmin.ratings.statusPending') },
            { id: 'published', label: t('tenantAdmin.ratings.statusPublished') },
            { id: 'hidden',    label: t('tenantAdmin.ratings.statusHiddenLabel') },
          ].map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStatus(s.id)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                status === s.id
                  ? 'bg-brand/15 border-brand/40 text-brand'
                  : 'bg-dark-surface border-dark-border text-muted hover:text-off-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Advanced filters — collapsible */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 pt-3 border-t border-dark-border">
                <FilterSelect label={t('tenantAdmin.ratings.filterPeriod')} value={period} onChange={setPeriod} options={[
                  ['7d', t('tenantAdmin.ratings.days7')], ['30d', t('tenantAdmin.ratings.days30')], ['90d', t('tenantAdmin.ratings.days90')], ['all', t('tenantAdmin.ratings.optAll')],
                ]} />
                {branches.length > 1 && (
                  <FilterSelect label={t('tenantAdmin.ratings.filterBranch')} value={branchId} onChange={setBranchId} options={[
                    ['all', t('tenantAdmin.ratings.allBranches')],
                    ...branches.map(b => [b.id, b.name]),
                  ]} />
                )}
                <FilterSelect label={t('tenantAdmin.ratings.filterBarber')} value={barberId} onChange={setBarberId} options={[
                  ['all', t('tenantAdmin.ratings.allBarbers')],
                  ...allBarbers.map(b => [b.id, b.name]),
                ]} />
                <FilterSelect label={t('tenantAdmin.ratings.filterComment')} value={hasComment} onChange={setHasComment} options={[
                  ['any', t('tenantAdmin.ratings.optAll')], ['true', t('tenantAdmin.ratings.hasComment')], ['false', t('tenantAdmin.ratings.noComment')],
                ]} />
                <FilterSelect label={t('tenantAdmin.ratings.filterTicket')} value={hasTicket} onChange={setHasTicket} options={[
                  ['any', t('tenantAdmin.ratings.optAll')], ['true', t('tenantAdmin.ratings.hasTicket')], ['false', t('tenantAdmin.ratings.noTicket')],
                ]} />
                <FilterSelect label={t('tenantAdmin.ratings.filterSort')} value={`${sortBy}-${sortDir}`}
                  onChange={(v) => { const [b, d] = v.split('-'); setSortBy(b); setSortDir(d) }}
                  options={[
                    ['createdAt-desc', t('tenantAdmin.ratings.sortNewest')],
                    ['createdAt-asc',  t('tenantAdmin.ratings.sortOldest')],
                    ['rating-desc',    t('tenantAdmin.ratings.sortRatingHigh')],
                    ['rating-asc',     t('tenantAdmin.ratings.sortRatingLow')],
                  ]}
                />
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={resetFilters}
                    disabled={!hasActiveFilter}
                    className="w-full px-3 py-2 rounded-xl bg-dark-card border border-dark-border text-xs text-muted hover:text-off-white disabled:opacity-50 transition-colors"
                  >
                    {t('tenantAdmin.ratings.resetFilter')}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="sticky top-3 z-20 p-3 rounded-2xl bg-dark-card border border-brand/40 shadow-lg flex flex-wrap items-center justify-between gap-2"
          >
            <div className="text-sm text-off-white inline-flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-brand" />
              <span className="font-medium">{t('tenantAdmin.ratings.selectedCount', { count: selected.size })}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={selectAllOnPage}>{t('tenantAdmin.ratings.selectAllPage')}</Button>
              <Button size="sm" variant="outline" onClick={clearSel}>{t('tenantAdmin.ratings.deselect')}</Button>
              <Button size="sm" variant="secondary" icon={Eye} onClick={() => setConfirmAction('bulk-publish')} loading={bulkPubMut.isPending}>
                <span className="hidden sm:inline">{t('tenantAdmin.ratings.publish')}</span>
              </Button>
              <Button size="sm" variant="secondary" icon={EyeOff} onClick={() => setConfirmAction('bulk-hide')} loading={bulkHideMut.isPending}>
                <span className="hidden sm:inline">{t('tenantAdmin.ratings.hide')}</span>
              </Button>
              <Button size="sm" variant="danger" icon={Trash2} onClick={() => setConfirmAction('bulk-delete')} loading={bulkDelMut.isPending}>
                <span className="hidden sm:inline">{t('common.delete')}</span>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List — desktop table & mobile cards */}
      {isError ? (
        <Card className="p-6 sm:p-8 flex flex-col items-center text-center">
          <AlertTriangle size={32} className="text-amber-400 mb-3" />
          <h3 className="font-semibold text-off-white mb-1">{t('tenantAdmin.ratings.loadFailed')}</h3>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} className="mt-4">
            {t('common.retry')}
          </Button>
        </Card>
      ) : isLoading ? (
        <Card className="p-3 sm:p-4">
          <div className="space-y-2">
            {[0,1,2,3,4].map(i => <SkeletonRow key={i} cols={5} />)}
          </div>
        </Card>
      ) : items.length === 0 ? (
        <Card className="p-6 sm:p-10 text-center">
          <MessageSquare className="w-12 h-12 text-muted/40 mx-auto mb-3" />
          <h3 className="font-semibold text-off-white mb-1">
            {hasActiveFilter ? t('tenantAdmin.ratings.noMatch') : t('tenantAdmin.ratings.noRatings')}
          </h3>
          <p className="text-xs text-muted max-w-md mx-auto">
            {hasActiveFilter
              ? t('tenantAdmin.ratings.noMatchHint')
              : t('tenantAdmin.ratings.noRatingsHint')}
          </p>
          {hasActiveFilter && (
            <Button variant="outline" size="sm" onClick={resetFilters} className="mt-4">{t('tenantAdmin.ratings.resetFilter')}</Button>
          )}
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-dark-card border-b border-dark-border">
                  <tr>
                    <th className="px-3 py-2.5 w-10">
                      <button
                        onClick={() => selected.size === items.length ? clearSel() : selectAllOnPage()}
                        aria-label={t('tenantAdmin.ratings.selectAllAria')}
                        className="text-muted hover:text-brand"
                      >
                        {selected.size === items.length && items.length > 0
                          ? <CheckSquare className="w-4 h-4 text-brand" />
                          : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                    <th className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wide text-muted font-medium">{t('tenantAdmin.ratings.colRatingBarber')}</th>
                    <th className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wide text-muted font-medium">{t('tenantAdmin.ratings.colComment')}</th>
                    <th className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wide text-muted font-medium whitespace-nowrap">{t('tenantAdmin.ratings.colInfo')}</th>
                    <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wide text-muted font-medium">{t('tenantAdmin.ratings.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border">
                  {items.map(r => (
                    <RatingTableRow
                      key={r.id}
                      rating={r}
                      checked={selected.has(r.id)}
                      onToggle={() => toggleSel(r.id)}
                      onDetail={() => setDetailRating(r)}
                      onPublish={(status) => handlePublish(r.id, status)}
                      onViewTicket={() => navigate('/admin/tickets')}
                      publishing={publishMut.isPending}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {items.map(r => (
              <RatingMobileCard
                key={r.id}
                rating={r}
                checked={selected.has(r.id)}
                onToggle={() => toggleSel(r.id)}
                onDetail={() => setDetailRating(r)}
                onPublish={(status) => handlePublish(r.id, status)}
                onViewTicket={() => navigate('/admin/tickets')}
                publishing={publishMut.isPending}
              />
            ))}
          </div>

          {/* Pagination */}
          {meta.hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="secondary" size="sm" onClick={() => setCursor(meta.nextCursor)} loading={isFetching}>
                {t('tenantAdmin.ratings.loadMore')}
              </Button>
            </div>
          )}
          {!meta.hasMore && items.length >= 50 && (
            <p className="text-center text-xs text-muted py-2">{t('tenantAdmin.ratings.allLoaded')}</p>
          )}
        </>
      )}

      {/* Detail modal */}
      <RatingDetailModal
        rating={detailRating}
        onClose={() => setDetailRating(null)}
        onPublish={(status) => { handlePublish(detailRating.id, status); setDetailRating(null) }}
        onViewTicket={() => { navigate('/admin/tickets'); setDetailRating(null) }}
        publishing={publishMut.isPending}
      />

      {/* Bulk confirm */}
      <ConfirmDialog
        isOpen={confirmAction === 'bulk-publish'}
        onClose={() => setConfirmAction(null)}
        onConfirm={performBulk}
        title={t('tenantAdmin.ratings.bulkPublishTitle')}
        description={t('tenantAdmin.ratings.bulkPublishDesc', { count: selected.size })}
        confirmText={t('tenantAdmin.ratings.confirmPublish')}
        variant="primary"
      />
      <ConfirmDialog
        isOpen={confirmAction === 'bulk-hide'}
        onClose={() => setConfirmAction(null)}
        onConfirm={performBulk}
        title={t('tenantAdmin.ratings.bulkHideTitle')}
        description={t('tenantAdmin.ratings.bulkHideDesc', { count: selected.size })}
        confirmText={t('tenantAdmin.ratings.confirmHide')}
        variant="warning"
      />
      <ConfirmDialog
        isOpen={confirmAction === 'bulk-delete'}
        onClose={() => setConfirmAction(null)}
        onConfirm={performBulk}
        title={t('tenantAdmin.ratings.bulkDeleteTitle')}
        description={t('tenantAdmin.ratings.bulkDeleteDesc', { count: selected.size })}
        confirmText={t('tenantAdmin.ratings.confirmDelete')}
        variant="danger"
      />
    </div>
  )
}

// ---- Helpers components ----------------------------------------------------
function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-muted font-medium mb-1.5">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-brand/60 cursor-pointer"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

function RatingTableRow({ rating: r, checked, onToggle, onDetail, onPublish, onViewTicket, publishing }) {
  const { t } = useTranslation()
  const isPublishable = r.rating >= 4 && !!r.comment
  const published = r.publishStatus === 'published'
  return (
    <tr className={`group hover:bg-dark-card/50 transition-colors ${
      r.rating <= 2 ? 'bg-red-500/[0.03]' :
      published ? 'bg-emerald-500/[0.03]' : ''
    }`}>
      <td className="px-3 py-2.5">
        <button onClick={onToggle} aria-label={t('tenantAdmin.ratings.selectAria')} className="text-muted hover:text-brand">
          {checked ? <CheckSquare className="w-4 h-4 text-brand" /> : <Square className="w-4 h-4" />}
        </button>
      </td>
      <td className="px-3 py-2.5 max-w-[180px]">
        <div className="flex flex-col gap-0.5 min-w-0">
          <StarsRow value={r.rating} size="md" />
          <span className="text-xs text-off-white font-medium truncate">{r.barber?.name || '—'}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 max-w-[320px]">
        {r.comment ? (
          <p className="text-xs italic text-off-white line-clamp-2 leading-snug">"{r.comment}"</p>
        ) : (
          <span className="text-xs text-muted italic">{t('tenantAdmin.ratings.noCommentDash')}</span>
        )}
        {r.customerName && (
          <p className="text-[10px] text-muted mt-0.5 truncate">— {r.customerName}</p>
        )}
      </td>
      <td className="px-3 py-2.5 align-top">
        <div className="flex flex-col gap-1 items-start">
          <span className="text-[10px] text-muted whitespace-nowrap">{formatDateTime(r.createdAt)}</span>
          {r.branchName && (
            <span className="text-[10px] text-muted truncate max-w-[120px]">{r.branchName}</span>
          )}
          <div className="flex items-center gap-1 flex-wrap">
            <StatusBadge status={r.publishStatus} />
            {r.ticketId && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40 font-semibold uppercase tracking-wide">
                <Ticket className="w-2.5 h-2.5" /> {t('tenantAdmin.ratings.ticket')}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        <div className="inline-flex items-center gap-1">
          {r.ticketId && (
            <button
              onClick={onViewTicket}
              title={t('tenantAdmin.ratings.viewTicket')}
              aria-label={t('tenantAdmin.ratings.viewRelatedTicket')}
              className="p-1.5 rounded-lg text-amber-300 hover:bg-amber-500/10 transition-colors"
            >
              <Ticket className="w-3.5 h-3.5" />
            </button>
          )}
          {isPublishable && !published && (
            <button
              onClick={() => onPublish('published')}
              disabled={publishing}
              title={t('tenantAdmin.ratings.publish')}
              aria-label={t('tenantAdmin.ratings.publishTestimonial')}
              className="p-1.5 rounded-lg text-emerald-300 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
          {published && (
            <button
              onClick={() => onPublish('hidden')}
              disabled={publishing}
              title={t('tenantAdmin.ratings.hide')}
              aria-label={t('tenantAdmin.ratings.hideTestimonial')}
              className="p-1.5 rounded-lg text-muted hover:text-off-white hover:bg-dark-card transition-colors disabled:opacity-50"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onDetail}
            title={t('common.details')}
            aria-label={t('tenantAdmin.ratings.viewDetail')}
            className="p-1.5 rounded-lg text-muted hover:text-off-white hover:bg-dark-card transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function RatingMobileCard({ rating: r, checked, onToggle, onDetail, onPublish, onViewTicket, publishing }) {
  const { t } = useTranslation()
  const isPublishable = r.rating >= 4 && !!r.comment
  const published = r.publishStatus === 'published'
  const isLow = r.rating <= 2
  return (
    <Card className={`p-3 ${
      isLow ? 'bg-red-500/[0.05] border-red-500/30' :
      published ? 'bg-emerald-500/[0.05] border-emerald-500/30' : ''
    }`}>
      <div className="flex items-start gap-2.5">
        <button onClick={onToggle} aria-label={t('tenantAdmin.ratings.selectAria')} className="flex-shrink-0 mt-0.5 text-muted hover:text-brand">
          {checked ? <CheckSquare className="w-4 h-4 text-brand" /> : <Square className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-off-white font-medium truncate">{r.barber?.name || '—'}</p>
              {r.customerName && (
                <p className="text-[10px] text-muted truncate">{t('tenantAdmin.ratings.byCustomer', { name: r.customerName })}</p>
              )}
            </div>
            <StarsRow value={r.rating} size="md" />
          </div>
          {r.comment && (
            <p className="text-xs italic text-off-white leading-snug">"{r.comment}"</p>
          )}
          <div className="flex items-center gap-1 flex-wrap pt-0.5">
            <StatusBadge status={r.publishStatus} />
            {r.ticketId && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40 font-semibold uppercase tracking-wide">
                <Ticket className="w-2.5 h-2.5" /> {t('tenantAdmin.ratings.ticket')}
              </span>
            )}
            <span className="text-[10px] text-muted ml-auto">{formatDateTime(r.createdAt)}</span>
          </div>
          {/* Mobile actions row */}
          <div className="flex items-center gap-1.5 pt-1 flex-wrap">
            {r.ticketId && (
              <button onClick={onViewTicket} className="flex-1 min-w-0 text-[11px] px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 inline-flex items-center justify-center gap-1">
                <Ticket className="w-3 h-3" /> {t('tenantAdmin.ratings.ticket')}
              </button>
            )}
            {isPublishable && !published && (
              <button onClick={() => onPublish('published')} disabled={publishing} className="flex-1 min-w-0 text-[11px] px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 inline-flex items-center justify-center gap-1 disabled:opacity-50">
                <Eye className="w-3 h-3" /> {t('tenantAdmin.ratings.publish')}
              </button>
            )}
            {published && (
              <button onClick={() => onPublish('hidden')} disabled={publishing} className="flex-1 min-w-0 text-[11px] px-2 py-1 rounded bg-dark-card border border-dark-border text-muted inline-flex items-center justify-center gap-1 disabled:opacity-50">
                <EyeOff className="w-3 h-3" /> {t('tenantAdmin.ratings.hide')}
              </button>
            )}
            <button onClick={onDetail} aria-label={t('tenantAdmin.ratings.viewDetail')} className="flex-shrink-0 text-[11px] px-2 py-1 rounded bg-dark-card border border-dark-border text-muted inline-flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}

function RatingDetailModal({ rating: r, onClose, onPublish, onViewTicket, publishing }) {
  const { t } = useTranslation()
  if (!r) return null
  const isPublishable = r.rating >= 4 && !!r.comment
  const published = r.publishStatus === 'published'
  return (
    <Modal isOpen={!!r} onClose={onClose} title={t('tenantAdmin.ratings.detailTitle')} size="md">
      <div className="space-y-4">
        {/* Hero */}
        <div className="p-4 rounded-xl bg-dark-card border border-dark-border">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted">{t('tenantAdmin.ratings.barber')}</p>
              <p className="text-lg font-bold text-off-white truncate">{r.barber?.name || '—'}</p>
            </div>
            <StarsRow value={r.rating} size="lg" />
          </div>
          <div className="mt-3 pt-3 border-t border-dark-border space-y-1.5 text-sm">
            {r.customerName && <Row label={t('tenantAdmin.ratings.customer')} value={r.customerName} />}
            {r.branchName   && <Row label={t('tenantAdmin.ratings.branch')}    value={r.branchName} />}
            {r.transaction  && <Row label={t('tenantAdmin.ratings.transaction')} value={`#${r.transactionId?.slice(-8).toUpperCase()} · ${formatRupiah(r.transaction.total)}`} />}
            <Row label={t('tenantAdmin.ratings.givenAt')} value={formatDateTime(r.createdAt)} />
            {r.publishedAt && <Row label={t('tenantAdmin.ratings.publishedAt')} value={formatDateTime(r.publishedAt)} />}
          </div>
        </div>

        {/* Comment */}
        {r.comment ? (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">{t('tenantAdmin.ratings.customerComment')}</p>
            <div className="p-3 rounded-xl bg-dark-surface border border-dark-border italic text-sm text-off-white leading-relaxed">
              "{r.comment}"
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted text-center py-2">{t('tenantAdmin.ratings.noCommentDash')}</p>
        )}

        {/* Status & flags */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={r.publishStatus} />
          {r.ticketId && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40 font-semibold uppercase tracking-wide">
              <Ticket className="w-2.5 h-2.5" /> {t('tenantAdmin.ratings.ticketCreated')}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button variant="outline" fullWidth onClick={onClose}>{t('common.close')}</Button>
          {r.ticketId && (
            <Button variant="secondary" fullWidth icon={Ticket} onClick={onViewTicket}>
              {t('tenantAdmin.ratings.viewTicket')}
            </Button>
          )}
          {published ? (
            <Button variant="secondary" fullWidth icon={EyeOff} onClick={() => onPublish('hidden')} loading={publishing}>
              {t('tenantAdmin.ratings.hide')}
            </Button>
          ) : isPublishable ? (
            <Button variant="primary" fullWidth icon={Eye} onClick={() => onPublish('published')} loading={publishing}>
              {t('tenantAdmin.ratings.publish')}
            </Button>
          ) : null}
        </div>

        {!isPublishable && r.publishStatus !== 'published' && (
          <p className="text-[11px] text-muted text-center">
            {t('tenantAdmin.ratings.publishableHint')}
          </p>
        )}
      </div>
    </Modal>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className="text-[11px] text-muted whitespace-nowrap">{label}</span>
      <span className="text-sm text-off-white text-right truncate">{value}</span>
    </div>
  )
}

// ── Default export wrapped in ErrorBoundary ─────────────────────────────────
export default function TARatingsPage() {
  return (
    <ErrorBoundary>
      <TARatingsPageInner />
    </ErrorBoundary>
  )
}
