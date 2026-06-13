import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  TrendingUp, Wallet, Receipt, Scissors, Star, Users, Calendar,
  Download, ChevronLeft, ChevronRight, ArrowRight, ArrowUp, ArrowDown,
  RefreshCw, Filter, X, Trophy,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useThemeStore } from '../../store/themeStore.js'
import { getBranchSlug } from '../../utils/branchSlug.js'
import { useTransactions, fetchAllTransactions } from '../../hooks/useTransactions.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card from '../../components/ui/Card.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import { formatRupiah, formatRupiahShort, formatDateTime } from '../../utils/format.js'
import { format, subDays, parseISO, differenceInDays } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

const PAGE_SIZE = 8

// ── helpers ─────────────────────────────────────────────────────────────────
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayISO = () => isoDay(new Date())

const PRESETS = [
  { id: 'today',     label: 'Hari Ini',     range: () => ({ start: todayISO(),               end: todayISO() }) },
  { id: 'yesterday', label: 'Kemarin',      range: () => ({ start: isoDay(subDays(new Date(), 1)), end: isoDay(subDays(new Date(), 1)) }) },
  { id: 'week',      label: '7 Hari',       range: () => ({ start: isoDay(subDays(new Date(), 6)),  end: todayISO() }) },
  { id: '30d',       label: '30 Hari',      range: () => ({ start: isoDay(subDays(new Date(), 29)), end: todayISO() }) },
]

const presetIdFor = (start, end) => {
  for (const p of PRESETS) {
    const r = p.range()
    if (r.start === start && r.end === end) return p.id
  }
  return 'custom'
}

const csvEscape = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const downloadCSV = (filename, header, rows) => {
  const csv = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n')
  // BOM agar Excel ID baca UTF-8
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const initialsOf = (n = '') =>
  n.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?'

// ── Subcomponents ───────────────────────────────────────────────────────────

const ACCENTS = {
  gold:  { icon: 'text-brand',         iconBg: 'bg-brand/15 border-brand/30' },
  blue:  { icon: 'text-blue-300',     iconBg: 'bg-blue-500/15 border-blue-500/30' },
  green: { icon: 'text-emerald-300',  iconBg: 'bg-emerald-500/15 border-emerald-500/30' },
  amber: { icon: 'text-amber-300',    iconBg: 'bg-amber-500/15 border-amber-500/30' },
}

function SummaryCard({ icon: Icon, label, value, valueShort, accent = 'gold', delta, deltaShort, deltaPositive, hint, hintShort, delay = 0 }) {
  const a = ACCENTS[accent] || ACCENTS.gold
  const showDelta = delta != null
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className="p-2.5 sm:p-4 min-w-0 overflow-hidden">
        <div className="flex items-start gap-2 sm:gap-3 min-w-0">
          <div className={`shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center ${a.iconBg}`}>
            <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${a.icon}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-xs text-muted leading-tight truncate">{label}</p>
            <p className="text-sm sm:text-lg lg:text-xl font-bold text-off-white mt-0.5 leading-tight tabular-nums truncate">
              {valueShort != null ? (
                <>
                  <span className="sm:hidden">{valueShort}</span>
                  <span className="hidden sm:inline">{value}</span>
                </>
              ) : value}
            </p>
            {(showDelta || hint) && (
              <div className={`text-[10px] sm:text-[11px] mt-0.5 flex items-center gap-1 min-w-0 ${
                !showDelta ? 'text-muted' : deltaPositive ? 'text-emerald-300' : 'text-red-400'
              }`}>
                {showDelta && (deltaPositive
                  ? <ArrowUp className="w-3 h-3 shrink-0" />
                  : <ArrowDown className="w-3 h-3 shrink-0" />)}
                <span className="truncate">
                  {showDelta ? (
                    deltaShort != null ? (
                      <>
                        <span className="sm:hidden">{deltaShort}</span>
                        <span className="hidden sm:inline">{delta}</span>
                      </>
                    ) : delta
                  ) : (hintShort != null ? (
                    <>
                      <span className="sm:hidden">{hintShort}</span>
                      <span className="hidden sm:inline">{hint}</span>
                    </>
                  ) : hint)}
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

function ChartTooltip({ active, payload, label, theme }) {
  if (!active || !payload || !payload.length) return null
  const isLight = theme === 'light'
  return (
    <div
      className="rounded-xl border px-3 py-2 text-xs shadow-card"
      style={{
        background: isLight ? '#FFFFFF' : '#1A1A1A',
        borderColor: isLight ? '#DDDBD0' : '#2A2A2A',
        color: isLight ? '#111111' : '#F5F5F0',
      }}
    >
      <p className="font-semibold mb-0.5">{label}</p>
      <p className="tabular-nums" style={{ color: '#E0A82E' }}>
        {formatRupiah(payload[0]?.value || 0)}
      </p>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function BarberCommission() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { theme } = useThemeStore()
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  const myId = user?.id
  const tenantId = user?.tenantId
  const branchId = user?.branchId
  const commissionRate = user?.commissionRate ?? 0.35

  // ── Date range from URL ───────────────────────────────────────────────────
  // Default = TODAY supaya angka di "Riwayat" konsisten dengan tile
  // "Selesai Hari Ini" di dashboard. User bebas ganti preset (Hari Ini /
  // Kemarin / 7 Hari / Bulan Ini / 30 Hari) atau custom range.
  const [dateRange, setDateRange] = useState(() => ({
    start: params.get('start') || todayISO(),
    end:   params.get('end')   || todayISO(),
  }))
  const [page, setPage] = useState(Number(params.get('page')) || 1)
  const [showCustom, setShowCustom] = useState(presetIdFor(dateRange.start, dateRange.end) === 'custom')
  const [exporting, setExporting] = useState(false)

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [dateRange.start, dateRange.end])

  // Sync URL
  useEffect(() => {
    const next = new URLSearchParams(params)
    const setOrDel = (k, v) => v ? next.set(k, v) : next.delete(k)
    setOrDel('start', dateRange.start)
    setOrDel('end', dateRange.end)
    setOrDel('page', page > 1 ? String(page) : '')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.start, dateRange.end, page])

  // ── Server queries (already filtered to barber.items) ─────────────────────
  // Page-current transactions for the history list
  const pageQuery = useTransactions({
    branchId,
    startDate: dateRange.start,
    endDate: dateRange.end,
    status: 'completed',
    page,
    limit: PAGE_SIZE,
  })

  // Aggregate window — pull all matching txns for charts/breakdown.
  // Capped via fetchAllTransactions safety (page <= 50, limit 200 per page).
  const [aggLoading, setAggLoading] = useState(false)
  const [aggregate, setAggregate] = useState({ all: [], capped: false })
  useEffect(() => {
    if (!tenantId || !branchId) return
    let cancelled = false
    setAggLoading(true)
    fetchAllTransactions({
      tenantId,
      branchId,
      startDate: dateRange.start,
      endDate: dateRange.end,
      status: 'completed',
    }).then(all => {
      if (cancelled) return
      setAggregate({ all, capped: all.length >= 50 * 200 })
    }).catch(() => {
      if (!cancelled) setAggregate({ all: [], capped: false })
    }).finally(() => {
      if (!cancelled) setAggLoading(false)
    })
    return () => { cancelled = true }
  }, [tenantId, branchId, dateRange.start, dateRange.end])

  // Previous-period comparison (same length window before current)
  const [prevTotal, setPrevTotal] = useState(null)
  useEffect(() => {
    if (!tenantId || !branchId || !dateRange.start || !dateRange.end) {
      setPrevTotal(null); return
    }
    const start = parseISO(dateRange.start)
    const end   = parseISO(dateRange.end)
    const lenDays = Math.max(0, differenceInDays(end, start)) + 1
    const prevEnd   = subDays(start, 1)
    const prevStart = subDays(prevEnd, lenDays - 1)
    let cancelled = false
    fetchAllTransactions({
      tenantId,
      branchId,
      startDate: isoDay(prevStart),
      endDate:   isoDay(prevEnd),
      status: 'completed',
    }).then(all => {
      if (cancelled) return
      const rev = all.reduce((sum, tx) => sum + (tx.items || [])
        .filter(i => i.barberId === myId)
        .reduce((s, i) => s + (i.price || 0), 0), 0)
      setPrevTotal(Math.round(rev * commissionRate))
    }).catch(() => { if (!cancelled) setPrevTotal(null) })
    return () => { cancelled = true }
  }, [tenantId, branchId, dateRange.start, dateRange.end, myId, commissionRate])

  // ── Derived: aggregate stats ──────────────────────────────────────────────
  const myItemsRevenue = (txList) => txList.reduce((sum, tx) => {
    const mine = (tx.items || []).filter(i => i.barberId === myId)
    return sum + mine.reduce((s, i) => s + (i.price || 0), 0)
  }, 0)
  const myItemsCount = (txList) => txList.reduce((sum, tx) => {
    return sum + (tx.items || []).filter(i => i.barberId === myId).length
  }, 0)

  const totalRevenue   = myItemsRevenue(aggregate.all)
  const totalCommission = Math.round(totalRevenue * commissionRate)
  const totalServices = myItemsCount(aggregate.all)
  const txCount       = aggregate.all.filter(tx => (tx.items || []).some(i => i.barberId === myId)).length
  const avgPerTx      = txCount > 0 ? Math.round(totalCommission / txCount) : 0

  const deltaPct = useMemo(() => {
    if (prevTotal == null) return null
    if (prevTotal === 0) return totalCommission > 0 ? 100 : 0
    const d = ((totalCommission - prevTotal) / prevTotal) * 100
    return Math.round(d)
  }, [prevTotal, totalCommission])

  // ── Daily chart (auto bucket) ─────────────────────────────────────────────
  const chart = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return { days: [], max: 0 }
    const start = parseISO(dateRange.start)
    const end   = parseISO(dateRange.end)
    const lenDays = Math.max(1, differenceInDays(end, start) + 1)
    const cap = Math.min(lenDays, 31)
    const days = Array.from({ length: cap }, (_, i) => {
      const d = subDays(end, cap - 1 - i)
      const ds = d.toDateString()
      const dayTxns = aggregate.all.filter(tx => new Date(tx.createdAt).toDateString() === ds)
      const dayRevenue = myItemsRevenue(dayTxns)
      return {
        date: format(d, 'd/M'),
        full: format(d, 'EEE, d MMM', { locale: idLocale }),
        commission: Math.round(dayRevenue * commissionRate),
      }
    })
    const max = days.reduce((m, d) => Math.max(m, d.commission), 0)
    return { days, max }
  }, [aggregate.all, dateRange.start, dateRange.end, commissionRate, myId])

  // ── Service breakdown ─────────────────────────────────────────────────────
  const serviceBreakdown = useMemo(() => {
    const map = new Map()
    aggregate.all.forEach(tx => {
      (tx.items || []).filter(i => i.barberId === myId).forEach(it => {
        const key = it.serviceId || it.name || 'unknown'
        const cur = map.get(key) || { name: it.name || it.service?.name || 'Layanan', count: 0, revenue: 0 }
        cur.count += 1
        cur.revenue += it.price || 0
        map.set(key, cur)
      })
    })
    return Array.from(map.values())
      .map(s => ({ ...s, commission: Math.round(s.revenue * commissionRate) }))
      .sort((a, b) => b.commission - a.commission)
      .slice(0, 6)
  }, [aggregate.all, myId, commissionRate])

  // ── Top customers ─────────────────────────────────────────────────────────
  const topCustomers = useMemo(() => {
    const map = new Map()
    aggregate.all.forEach(tx => {
      const mine = (tx.items || []).filter(i => i.barberId === myId)
      if (!mine.length) return
      const key = tx.customerId || tx.customerPhone || tx.customer?.phone || tx.customerName || 'unknown'
      const cur = map.get(key) || {
        name: tx.customer?.name || tx.customerName || 'Walk-in',
        phone: tx.customer?.phone || tx.customerPhone || null,
        visits: 0,
        revenue: 0,
      }
      cur.visits += 1
      cur.revenue += mine.reduce((s, i) => s + (i.price || 0), 0)
      map.set(key, cur)
    })
    return Array.from(map.values())
      .map(c => ({ ...c, commission: Math.round(c.revenue * commissionRate) }))
      .sort((a, b) => b.commission - a.commission)
      .slice(0, 5)
  }, [aggregate.all, myId, commissionRate])

  // ── Pagination over current page (server-side) ────────────────────────────
  const pageTransactions = pageQuery.transactions || []
  const totalTxPages = pageQuery.totalPages || Math.max(1, Math.ceil((pageQuery.total || 0) / PAGE_SIZE))
  useEffect(() => { if (page > totalTxPages) setPage(1) }, [totalTxPages, page])

  // ── Actions ───────────────────────────────────────────────────────────────
  const setPreset = (id) => {
    const p = PRESETS.find(x => x.id === id)
    if (!p) return
    setShowCustom(false)
    setDateRange(p.range())
  }

  const handleExportCSV = async () => {
    if (!aggregate.all.length) {
      toast.error('Tidak ada data untuk diekspor')
      return
    }
    setExporting(true)
    try {
      const header = ['Tanggal', 'ID Transaksi', 'Pelanggan', 'Telepon', 'Layanan', 'Harga', `Komisi (${(commissionRate * 100).toFixed(0)}%)`]
      const rows = []
      aggregate.all.forEach(tx => {
        (tx.items || []).filter(i => i.barberId === myId).forEach(it => {
          rows.push([
            formatDateTime(tx.createdAt),
            tx.id,
            tx.customer?.name || tx.customerName || 'Walk-in',
            tx.customer?.phone || tx.customerPhone || '',
            it.name || it.service?.name || 'Layanan',
            it.price || 0,
            Math.round((it.price || 0) * commissionRate),
          ])
        })
      })
      // Footer summary
      rows.push([])
      rows.push(['TOTAL', '', '', '', `${rows.length - 1} item`, totalRevenue, totalCommission])
      const fname = `komisi-${dateRange.start}_sd_${dateRange.end}.csv`
      downloadCSV(fname, header, rows)
      toast.success(`Berhasil ekspor ${rows.length - 2} item`)
    } catch (err) {
      toast.error('Gagal ekspor: ' + (err?.message || 'Unknown'))
    } finally {
      setExporting(false)
    }
  }

  const activePreset = presetIdFor(dateRange.start, dateRange.end)
  const isLight = theme === 'light'
  const gridStroke = isLight ? '#DDDBD0' : '#2A2A2A'
  const axisColor  = isLight ? '#555555' : '#6B7280'

  // ── Multi-tenant safety guard ─────────────────────────────────────────────
  if (!tenantId || !branchId) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="p-8 text-center">
          <Trophy className="w-10 h-10 text-brand/60 mx-auto mb-3" />
          <h2 className="font-display text-xl font-bold text-off-white">Cabang belum ditentukan</h2>
          <p className="text-muted text-sm mt-2">
            Akun Anda belum dipasang ke cabang. Hubungi admin untuk pengaturan.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-6 pb-24 sm:pb-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white inline-flex items-center gap-2">
            <Trophy className="w-5 h-5 text-brand" /> {t('barber.myCommission')}
          </h1>
          <p className="text-muted text-xs sm:text-sm mt-1">
            Rate komisi <span className="text-brand font-semibold">{(commissionRate * 100).toFixed(0)}%</span>
            {' · '}
            {dateRange.start === dateRange.end
              ? format(parseISO(dateRange.start), 'EEEE, d MMM yyyy', { locale: idLocale })
              : `${format(parseISO(dateRange.start), 'd MMM', { locale: idLocale })} – ${format(parseISO(dateRange.end), 'd MMM yyyy', { locale: idLocale })}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={exporting || !aggregate.all.length}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand/10 border border-brand/30 text-brand text-xs font-semibold hover:bg-brand/20 disabled:opacity-50 transition-colors"
          >
            {exporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">{exporting ? 'Mengekspor…' : 'Ekspor CSV'}</span>
          </button>
          <button
            type="button"
            onClick={() => navigate(
              user?.role === 'barber'
                ? '/barber/dashboard'
                : `/${getBranchSlug(user)}/kasir/pos`
            )}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-dark-card/60 border border-dark-border text-muted text-xs font-medium hover:text-off-white hover:border-brand/40 transition-colors"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            <span className="hidden sm:inline">{user?.role === 'barber' ? 'Dashboard' : 'Kasir'}</span>
          </button>
        </div>
      </div>

      {/* ── Period selector ────────────────────────────────────────────────── */}
      <Card className="p-3 sm:p-4 overflow-visible">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                activePreset === p.id
                  ? 'bg-brand text-dark'
                  : 'bg-dark-card/60 border border-dark-border text-muted hover:text-off-white'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowCustom(s => !s)}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors inline-flex items-center gap-1 ${
              activePreset === 'custom' || showCustom
                ? 'bg-brand text-dark'
                : 'bg-dark-card/60 border border-dark-border text-muted hover:text-off-white'
            }`}
          >
            <Filter className="w-3.5 h-3.5" /> Kustom
          </button>
        </div>
        {(showCustom || activePreset === 'custom') && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] text-muted">Mulai</span>
              <input
                type="date"
                value={dateRange.start}
                max={dateRange.end || todayISO()}
                onChange={e => setDateRange(r => ({ ...r, start: e.target.value }))}
                className="mt-1 w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-brand/60"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-muted">Selesai</span>
              <input
                type="date"
                value={dateRange.end}
                min={dateRange.start || ''}
                max={todayISO()}
                onChange={e => setDateRange(r => ({ ...r, end: e.target.value }))}
                className="mt-1 w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-brand/60"
              />
            </label>
          </div>
        )}
      </Card>

      {/* ── Summary cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <SummaryCard
          icon={Wallet}
          label="Komisi Total"
          value={aggLoading ? '…' : formatRupiah(totalCommission)}
          valueShort={aggLoading ? '…' : formatRupiahShort(totalCommission)}
          accent="gold"
          delta={deltaPct == null ? null : `${deltaPct >= 0 ? '+' : ''}${deltaPct}% vs periode lalu`}
          deltaShort={deltaPct == null ? null : `${deltaPct >= 0 ? '+' : ''}${deltaPct}% vs lalu`}
          deltaPositive={deltaPct == null ? null : deltaPct >= 0}
          delay={0.02}
        />
        <SummaryCard
          icon={Receipt}
          label="Transaksi"
          value={aggLoading ? '…' : txCount}
          accent="blue"
          hint={txCount > 0 ? `Avg ${formatRupiah(avgPerTx)}/tx` : 'Belum ada transaksi'}
          hintShort={txCount > 0 ? `Avg ${formatRupiahShort(avgPerTx)}/tx` : '—'}
          delay={0.04}
        />
        <SummaryCard
          icon={Scissors}
          label="Layanan"
          value={aggLoading ? '…' : totalServices}
          accent="green"
          hint={totalServices > 0 ? `${(totalServices / Math.max(1, txCount)).toFixed(1)} layanan/tx` : '—'}
          hintShort={totalServices > 0 ? `${(totalServices / Math.max(1, txCount)).toFixed(1)}/tx` : '—'}
          delay={0.06}
        />
        <SummaryCard
          icon={TrendingUp}
          label="Revenue"
          value={aggLoading ? '…' : formatRupiah(totalRevenue)}
          valueShort={aggLoading ? '…' : formatRupiahShort(totalRevenue)}
          accent="amber"
          hint={`Rate ${(commissionRate * 100).toFixed(0)}%`}
          delay={0.08}
        />
      </div>

      {/* ── Chart + breakdown ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Chart */}
        <Card className="p-4 sm:p-5 lg:col-span-2">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-off-white inline-flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand" /> {t('barber.dailyCommission')}
            </h3>
            <span className="text-[11px] text-muted">{chart.days.length} hari</span>
          </div>
          {aggLoading ? (
            <div className="h-[220px] rounded-lg bg-dark-card/60 animate-pulse" />
          ) : chart.days.every(d => d.commission === 0) ? (
            <div className="h-[220px] flex flex-col items-center justify-center text-center">
              <Wallet className="w-10 h-10 text-muted opacity-40 mb-2" />
              <p className="text-sm text-muted">Belum ada komisi pada periode ini</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chart.days} margin={{ top: 6, right: 6, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: axisColor, fontSize: 11 }}
                  tickLine={false}
                  interval={chart.days.length > 14 ? 'preserveStartEnd' : 0}
                />
                <YAxis
                  width={42}
                  tick={{ fill: axisColor, fontSize: 11 }}
                  tickLine={false}
                  tickFormatter={v => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}jt` : v >= 1000 ? `${Math.round(v/1000)}k` : v}
                />
                <Tooltip
                  cursor={{ fill: isLight ? 'rgba(224, 168, 46,0.08)' : 'rgba(224, 168, 46,0.06)' }}
                  content={(p) => <ChartTooltip {...p} theme={theme} />}
                />
                <Bar dataKey="commission" radius={[6, 6, 0, 0]} maxBarSize={28}>
                  {chart.days.map((entry, i) => (
                    <Cell key={i} fill={entry.commission === chart.max && chart.max > 0 ? '#EBC877' : '#E0A82E'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Service breakdown */}
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-off-white inline-flex items-center gap-2">
              <Scissors className="w-4 h-4 text-brand" /> Top Layanan
            </h3>
            <span className="text-[11px] text-muted">{serviceBreakdown.length}</span>
          </div>
          {aggLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-dark-card/60 animate-pulse" />)}
            </div>
          ) : serviceBreakdown.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">Belum ada layanan</p>
          ) : (
            <ul className="space-y-2">
              {serviceBreakdown.map((s, i) => {
                const top = serviceBreakdown[0]?.commission || 1
                const pct = Math.round((s.commission / top) * 100)
                return (
                  <li key={i} className="min-w-0">
                    <div className="flex items-center justify-between gap-2 text-xs mb-1 min-w-0">
                      <span className="text-off-white font-medium truncate">{s.name}</span>
                      <span className="text-brand tabular-nums whitespace-nowrap shrink-0">
                        {formatRupiah(s.commission)}
                      </span>
                    </div>
                    <div className="relative h-2 bg-dark-card/60 rounded-full overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand to-brand-light rounded-full"
                        style={{ width: `${Math.max(6, pct)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted mt-0.5 tabular-nums">
                      {s.count}× · {formatRupiah(s.revenue)} revenue
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* ── Top customers ──────────────────────────────────────────────────── */}
      {topCustomers.length > 0 && (
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-off-white inline-flex items-center gap-2">
              <Users className="w-4 h-4 text-brand" /> Pelanggan Paling Sering
            </h3>
            <span className="text-[11px] text-muted">{topCustomers.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {topCustomers.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-dark-card/40 border border-dark-border/60 min-w-0"
              >
                <Avatar name={c.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-off-white truncate">{c.name}</p>
                  <p className="text-[11px] text-muted tabular-nums truncate">
                    {c.visits}× · {formatRupiah(c.commission)}
                  </p>
                </div>
                {i === 0 && (
                  <Star className="w-3.5 h-3.5 text-brand fill-brand shrink-0" />
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Transaction history (paginated) ────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-off-white inline-flex items-center gap-2">
            <Receipt className="w-4 h-4 text-brand" /> {t('barber.transactionHistory')}
            <span className="text-xs text-muted font-normal">({pageQuery.total || 0})</span>
          </h3>
          {totalTxPages > 1 && (
            <div className="flex items-center gap-1 text-xs text-muted">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="p-1.5 rounded-md hover:bg-dark-card/60 disabled:opacity-40"
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="tabular-nums">{page}/{totalTxPages}</span>
              <button
                type="button"
                disabled={page >= totalTxPages}
                onClick={() => setPage(p => Math.min(totalTxPages, p + 1))}
                className="p-1.5 rounded-md hover:bg-dark-card/60 disabled:opacity-40"
                aria-label="Halaman berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {pageQuery.isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-dark-card/60 animate-pulse" />)}
          </div>
        ) : pageTransactions.length === 0 ? (
          <Card className="p-8 text-center">
            <Receipt className="w-10 h-10 text-muted mx-auto mb-2 opacity-40" />
            <p className="text-muted text-sm">{t('barber.noTransactionsInPeriod')}</p>
            <p className="text-xs text-muted/70 mt-1">Coba ubah rentang tanggal di atas.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {pageTransactions.map(txn => {
              const myItems = (txn.items || []).filter(i => i.barberId === myId)
              if (!myItems.length) return null
              const myRevenue = myItems.reduce((s, i) => s + (i.price || 0), 0)
              const myCommission = Math.round(myRevenue * commissionRate)
              const customer = txn.customer?.name || txn.customerName || 'Walk-in'
              return (
                <Card key={txn.id} className="p-3 sm:p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-brand/10 border border-brand/30 flex items-center justify-center text-[11px] font-bold text-brand">
                      {initialsOf(customer)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-off-white truncate">
                        {myItems.map(i => i.name).join(', ')}
                      </p>
                      <p className="text-[11px] text-muted truncate">
                        {customer} · {formatDateTime(txn.createdAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-brand tabular-nums whitespace-nowrap">
                        {formatRupiah(myCommission)}
                      </p>
                      <p className="text-[10px] text-muted tabular-nums whitespace-nowrap">
                        dari {formatRupiah(myRevenue)}
                      </p>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {totalTxPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(1)}
              className="px-2.5 py-1.5 rounded-md text-xs text-muted border border-dark-border bg-dark-card/40 disabled:opacity-40 hover:text-off-white"
            >
              «
            </button>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-2.5 py-1.5 rounded-md text-xs text-muted border border-dark-border bg-dark-card/40 disabled:opacity-40 hover:text-off-white"
            >
              Sebelumnya
            </button>
            <span className="px-3 py-1.5 text-xs text-off-white tabular-nums">
              Halaman {page} dari {totalTxPages}
            </span>
            <button
              type="button"
              disabled={page >= totalTxPages}
              onClick={() => setPage(p => Math.min(totalTxPages, p + 1))}
              className="px-2.5 py-1.5 rounded-md text-xs text-muted border border-dark-border bg-dark-card/40 disabled:opacity-40 hover:text-off-white"
            >
              Berikutnya
            </button>
            <button
              type="button"
              disabled={page >= totalTxPages}
              onClick={() => setPage(totalTxPages)}
              className="px-2.5 py-1.5 rounded-md text-xs text-muted border border-dark-border bg-dark-card/40 disabled:opacity-40 hover:text-off-white"
            >
              »
            </button>
          </div>
        )}
      </div>

      {/* Refresh hint when fetching */}
      {(pageQuery.isFetching || aggLoading) && (
        <div className="fixed bottom-20 sm:bottom-6 right-4 z-30 inline-flex items-center gap-2 px-3 py-2 rounded-full bg-dark-card/90 border border-dark-border text-xs text-muted shadow-card backdrop-blur">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Sinkronisasi…
        </div>
      )}
    </div>
  )
}
