import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Search, Receipt, Eye, Calendar, X as XIcon, User, Store, CreditCard,
  Printer, Download, Filter, ChevronLeft, ChevronRight, AlertTriangle,
  RefreshCcw, Ban, CheckCircle2, TrendingUp, BookmarkCheck, Footprints,
  Phone, Star, Clock,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import {
  useTransactions, useTransaction, useUpdateTransactionStatus, fetchAllTransactions,
} from '../../hooks/useTransactions.js'
import { useUsers } from '../../hooks/useUsers.js'
import { useBarberRatings } from '../../hooks/useBarberRatings.js'
import api from '../../lib/api.js'
import Card from '../../components/ui/Card.jsx'
import Badge, { getStatusBadge } from '../../components/ui/Badge.jsx'
import Modal from '../../components/ui/Modal.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { getSocket } from '../../lib/socket.js'
import { formatRupiah, formatRupiahShort } from '../../utils/format.js'
import { formatDateTimeInTz } from '../../utils/timezone.js'

const PAYMENT_LABELS = {
  cash:     'Tunai',
  transfer: 'Transfer',
  qris:     'QRIS',
  card:     'Kartu',
}

// Badge sumber: pelanggan booking vs walk-in. Diturunkan dari `tx.bookingId`
// — kalau ada, transaksi ini berasal dari booking yang sudah dipesan
// sebelumnya. Kalau null, walk-in langsung di counter.
function CustomerSourceBadge({ tx, size = 'sm' }) {
  const isBooking = !!tx?.bookingId
  const isCompact = size === 'xs'
  const cls = isCompact
    ? 'gap-0.5 px-1.5 py-0.5 text-[10px]'
    : 'gap-1 px-2 py-0.5 text-[11px]'
  return isBooking ? (
    <span
      className={`inline-flex items-center ${cls} rounded-full font-semibold whitespace-nowrap bg-gold/15 text-gold border border-gold/30`}
      title="Pelanggan booking — datang dari reservasi sebelumnya"
    >
      <BookmarkCheck className={isCompact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      Booking
    </span>
  ) : (
    <span
      className={`inline-flex items-center ${cls} rounded-full font-semibold whitespace-nowrap bg-dark-card text-muted border border-dark-border`}
      title="Pelanggan walk-in — bayar langsung tanpa booking"
    >
      <Footprints className={isCompact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      Walk-in
    </span>
  )
}

// Helper ambil display name yang lebih kaya dari berbagai sumber:
// customer → customerName snapshot → fallback "Walk-in".
function customerDisplayName(tx) {
  return tx?.customer?.name || tx?.customerName || 'Walk-in'
}
function customerDisplayPhone(tx) {
  return tx?.customer?.phone || tx?.customerPhone || ''
}

// Daftar nama barber unik dari item transaksi (transaksi multi-service bisa
// punya beberapa barber berbeda). Sumber prioritas:
//   1. item.barber.name (relasi User — pasti up-to-date),
//   2. item.barberName (denorm bila pernah disimpan),
//   3. booking.barberName (fallback bila transaksi dari booking & item tak
//      ber-barberId).
function transactionBarbers(tx) {
  const fromItems = (tx?.items || [])
    .map((i) => i?.barber?.name || i?.barberName)
    .filter(Boolean)
  if (fromItems.length) return [...new Set(fromItems)]
  if (tx?.booking?.barberName) return [tx.booking.barberName]
  return []
}

const STATUS_META = {
  completed: { label: 'Selesai',    variant: 'success', dot: 'bg-emerald-400' },
  cancelled: { label: 'Dibatalkan', variant: 'danger',  dot: 'bg-red-400' },
  refunded:  { label: 'Refund',     variant: 'warning', dot: 'bg-amber-400' },
}

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const shiftDate = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PRESETS = [
  { id: 'today',     label: 'Hari Ini', range: () => ({ start: todayISO(),    end: todayISO() }) },
  { id: 'yesterday', label: 'Kemarin',  range: () => ({ start: shiftDate(-1), end: shiftDate(-1) }) },
  { id: 'all',       label: 'Semua',    range: () => ({ start: '',            end: '' }) },
]
const presetIdFor = (start, end) => {
  for (const p of PRESETS) {
    const r = p.range()
    if (r.start === start && r.end === end) return p.id
  }
  return 'custom'
}

const PAGE_SIZE = 20

export default function TransactionsPage() {
  const { user } = useAuthStore()
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  const [search, setSearch] = useState(params.get('q') || '')
  const [pmFilter, setPmFilter] = useState(params.get('pm') || '')
  const [statusFilter, setStatusFilter] = useState(params.get('status') || '')
  const [barberFilter, setBarberFilter] = useState(params.get('barber') || '')
  const [sourceFilter, setSourceFilter] = useState(params.get('source') || '')
  const [dateRange, setDateRange] = useState(() => ({
    start: params.get('start') || todayISO(),
    end:   params.get('end')   || todayISO(),
  }))
  const [page, setPage] = useState(Number(params.get('page')) || 1)
  const [showFilters, setShowFilters] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Debounce search supaya tidak tiap keystroke ngirim ke server
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(id)
  }, [search])

  // Reset ke halaman 1 saat filter berubah
  useEffect(() => { setPage(1) }, [debouncedSearch, pmFilter, statusFilter, barberFilter, sourceFilter, dateRange.start, dateRange.end])

  const queryFilters = useMemo(() => {
    const f = { branchId: user?.branchId, page, limit: PAGE_SIZE }
    if (dateRange.start) f.startDate = dateRange.start
    if (dateRange.end)   f.endDate   = dateRange.end
    if (debouncedSearch) f.search    = debouncedSearch
    if (pmFilter)        f.paymentMethod = pmFilter
    if (statusFilter)    f.status   = statusFilter
    if (barberFilter)    f.barberId = barberFilter
    if (sourceFilter)    f.source   = sourceFilter
    return f
  }, [user?.branchId, page, dateRange.start, dateRange.end, debouncedSearch, pmFilter, statusFilter, barberFilter, sourceFilter])

  const { transactions, total, totalPages, isLoading, isFetching, refetch } = useTransactions(queryFilters)

  // Sync state utama ke URL agar bisa di-share/back-navigate
  useEffect(() => {
    const next = new URLSearchParams(params)
    const setOrDel = (k, v) => v ? next.set(k, v) : next.delete(k)
    setOrDel('q', debouncedSearch)
    setOrDel('pm', pmFilter)
    setOrDel('status', statusFilter)
    setOrDel('barber', barberFilter)
    setOrDel('source', sourceFilter)
    setOrDel('start', dateRange.start)
    setOrDel('end', dateRange.end)
    setOrDel('page', page > 1 ? String(page) : '')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, pmFilter, statusFilter, barberFilter, sourceFilter, dateRange.start, dateRange.end, page])

  // Stats — fetch summary aggregat (akurat untuk seluruh filter, tidak hanya page aktif)
  const summaryFilters = useMemo(() => {
    const { page: _p, limit: _l, ...rest } = queryFilters
    return rest
  }, [queryFilters])
  const [summary, setSummary] = useState(null)
  // Bumped saat status transaksi berubah / event realtime — memaksa summary
  // (yang bukan React Query) ikut refetch supaya angka omzet tetap akurat.
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0)
  useEffect(() => {
    let cancelled = false
    if (!user?.tenantId) return
    api.get('/transactions/summary', { params: { tenantId: user.tenantId, ...summaryFilters } })
      .then(r => { if (!cancelled) setSummary(r.data?.data || null) })
      .catch(() => { if (!cancelled) setSummary(null) })
    return () => { cancelled = true }
  }, [user?.tenantId, summaryFilters, summaryRefreshKey])

  // Realtime: transaksi baru / status berubah dari device lain → sinkron.
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const onChange = () => {
      qc.invalidateQueries({ queryKey: ['transactions', 'list'] })
      setSummaryRefreshKey(k => k + 1)
    }
    socket.on('transaction:created', onChange)
    socket.on('transaction:updated', onChange)
    return () => {
      socket.off('transaction:created', onChange)
      socket.off('transaction:updated', onChange)
    }
  }, [qc])

  // Staff list untuk filter
  const { data: barbers = [] } = useUsers({ branchId: user?.branchId, role: 'barber' })

  // Deep-link: ?tx=ID → buka detail modal
  const detailTxId = params.get('tx')
  const inListTx = useMemo(
    () => transactions.find(t => t.id === detailTxId) || null,
    [transactions, detailTxId],
  )
  const fallbackDetail = useTransaction(detailTxId && !inListTx ? detailTxId : null)
  const detailTx = inListTx || fallbackDetail.data || null

  const openDetail = (tx) => {
    const next = new URLSearchParams(params)
    next.set('tx', tx.id)
    setParams(next, { replace: true })
  }
  const closeDetail = () => {
    const next = new URLSearchParams(params)
    next.delete('tx')
    setParams(next, { replace: true })
  }

  const activePreset = presetIdFor(dateRange.start, dateRange.end)
  const activeFilterCount = (pmFilter ? 1 : 0) + (statusFilter ? 1 : 0) + (barberFilter ? 1 : 0) + (sourceFilter ? 1 : 0)

  const handleExport = async () => {
    if (!user?.tenantId) return
    setExporting(true)
    try {
      const all = await fetchAllTransactions({ tenantId: user.tenantId, ...summaryFilters })
      if (!all.length) {
        toast.error('Tidak ada data untuk diekspor')
        return
      }
      const header = ['Tanggal', 'ID', 'Sumber', 'Pelanggan', 'Telepon', 'Item', 'Barber', 'Subtotal', 'Diskon', 'Total', 'Pembayaran', 'Status']
      const rows = all.map((tx) => [
        formatDateTimeInTz(tx.createdAt),
        tx.id,
        tx.bookingId ? 'Booking' : 'Walk-in',
        customerDisplayName(tx),
        customerDisplayPhone(tx),
        (tx.items || []).map(i => i.name).join(' | '),
        transactionBarbers(tx).join(' | ') || '—',
        tx.subtotal || 0,
        tx.discountAmount || 0,
        tx.total || 0,
        PAYMENT_LABELS[tx.paymentMethod] || tx.paymentMethod || '',
        STATUS_META[tx.status]?.label || tx.status || 'Selesai',
      ])
      const escape = (v) => {
        const s = String(v ?? '')
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const csv = [header, ...rows].map(r => r.map(escape).join(',')).join('\r\n')
      // BOM agar Excel ID-Indonesia membaca UTF-8 dengan benar
      const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `transaksi-${dateRange.start || 'semua'}-${dateRange.end || todayISO()}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Berhasil ekspor ${all.length} transaksi`)
    } catch (err) {
      toast.error('Gagal ekspor: ' + (err?.response?.data?.error || err.message))
    } finally {
      setExporting(false)
    }
  }

  const resetFilters = () => {
    setSearch('')
    setPmFilter('')
    setStatusFilter('')
    setBarberFilter('')
    setSourceFilter('')
    setDateRange(PRESETS[0].range())
    setPage(1)
  }

  return (
    <div className="space-y-3 sm:space-y-5 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white">Transaksi</h1>
          <p className="text-muted text-xs sm:text-sm mt-1">
            {summary?.count ?? total} transaksi · {formatRupiah(summary?.totalRevenue || 0)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Muat ulang"
            aria-label="Muat ulang"
            className="hidden sm:inline-flex w-10 h-10 items-center justify-center rounded-xl border border-dark-border text-muted hover:text-off-white hover:border-gold/40 disabled:opacity-50 transition-colors"
          >
            <RefreshCcw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || !total}
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-gold/10 border border-gold/40 text-gold text-xs sm:text-sm font-semibold hover:bg-gold/20 disabled:opacity-50 transition-colors"
          >
            <Download className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">{exporting ? 'Mengekspor…' : 'Ekspor CSV'}</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <StatsGrid summary={summary} loading={!summary && isLoading} />

      {/* Sticky filter bar */}
      <div className="sticky top-0 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 py-2 bg-dark-bg/95 backdrop-blur-md sm:bg-transparent sm:backdrop-blur-none">
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden mb-2">
          {PRESETS.map(p => {
            const active = activePreset === p.id
            return (
              <button
                key={p.id}
                onClick={() => setDateRange(p.range())}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                  active
                    ? 'bg-gold text-dark-bg border-gold'
                    : 'text-muted bg-dark-surface border-dark-border hover:text-off-white hover:border-gold/40'
                }`}
              >
                {p.id === 'today' && <Calendar className="w-3.5 h-3.5" />}
                {p.label}
              </button>
            )
          })}

          {/* Quick source toggle */}
          {[
            { id: '',        label: 'Semua',   icon: null },
            { id: 'booking', label: 'Booking', icon: BookmarkCheck },
            { id: 'walk_in', label: 'Walk-in', icon: Footprints },
          ].map(opt => {
            const active = sourceFilter === opt.id
            const Icon = opt.icon
            const skip = opt.id === '' && sourceFilter === '' // hide "Semua" pill when nothing active to save space
            if (skip && sourceFilter === '') return null
            return (
              <button
                key={opt.id || 'all'}
                onClick={() => setSourceFilter(opt.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                  active
                    ? opt.id === 'booking' ? 'bg-gold/15 text-gold border-gold/40'
                      : opt.id === 'walk_in' ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                      : 'bg-dark-surface text-muted border-dark-border'
                    : 'text-muted bg-dark-surface border-dark-border hover:text-off-white hover:border-gold/40'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {opt.label}
              </button>
            )
          })}

          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`relative inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold border whitespace-nowrap transition-all ${
                showFilters || activeFilterCount
                  ? 'bg-gold/10 text-gold border-gold/40'
                  : 'text-muted bg-dark-surface border-dark-border hover:text-off-white'
              }`}
            >
              <Filter className="w-3.5 h-3.5" /> Filter
              {activeFilterCount > 0 && (
                <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-dark-bg text-[10px] font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Search bar (always visible) */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari ID, pelanggan, atau layanan…"
          className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-10 pr-9 py-2.5 text-sm outline-none focus:border-gold/60 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            aria-label="Kosongkan pencarian"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-md text-muted hover:text-off-white hover:bg-dark-card transition-colors"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter panel (collapsible) */}
      {showFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 p-3 sm:p-4 bg-dark-surface border border-dark-border rounded-2xl">
          <DateField
            label="Dari Tanggal"
            value={dateRange.start}
            max={dateRange.end || todayISO()}
            onChange={(v) => setDateRange(r => ({ ...r, start: v }))}
          />
          <DateField
            label="Sampai Tanggal"
            value={dateRange.end}
            min={dateRange.start || undefined}
            max={todayISO()}
            onChange={(v) => setDateRange(r => ({ ...r, end: v }))}
          />
          <SelectField label="Pembayaran" value={pmFilter} onChange={setPmFilter}
            options={[
              { value: '', label: 'Semua' },
              { value: 'cash', label: 'Tunai' },
              { value: 'transfer', label: 'Transfer' },
              { value: 'qris', label: 'QRIS' },
              { value: 'card', label: 'Kartu' },
            ]}
          />
          <SelectField label="Status" value={statusFilter} onChange={setStatusFilter}
            options={[
              { value: '', label: 'Semua status' },
              { value: 'completed', label: 'Selesai' },
              { value: 'cancelled', label: 'Dibatalkan' },
              { value: 'refunded', label: 'Refund' },
            ]}
          />
          {barbers.length > 0 && (
            <SelectField label="Barber" value={barberFilter} onChange={setBarberFilter}
              options={[{ value: '', label: 'Semua barber' }, ...barbers.map(b => ({ value: b.id, label: b.name }))]}
            />
          )}
          <SelectField label="Sumber Pelanggan" value={sourceFilter} onChange={setSourceFilter}
            options={[
              { value: '', label: 'Semua' },
              { value: 'booking', label: 'Booking' },
              { value: 'walk_in', label: 'Walk-in' },
            ]}
          />
          <div className="sm:col-span-2 flex items-end justify-end">
            <button
              onClick={resetFilters}
              className="text-xs font-medium text-muted hover:text-off-white px-3 py-2 transition-colors"
            >
              Reset filter
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-3 sm:p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-dark-card animate-pulse" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState onReset={resetFilters} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-dark-card/50">
                    <tr className="border-b border-dark-border">
                      <Th>Waktu</Th>
                      <Th>ID</Th>
                      <Th>Pelanggan</Th>
                      <Th>Barber</Th>
                      <Th>Bayar</Th>
                      <Th className="text-right">Total</Th>
                      <Th>Status</Th>
                      <Th className="text-right w-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map(tx => {
                      const barberNames = transactionBarbers(tx)
                      return (
                      <tr
                        key={tx.id}
                        onClick={() => openDetail(tx)}
                        className="border-b border-dark-border/50 hover:bg-dark-card/40 transition-colors cursor-pointer group"
                      >
                        <Td className="whitespace-nowrap text-muted text-xs">{formatDateTimeInTz(tx.createdAt)}</Td>
                        <Td className="font-mono text-xs text-muted">#{tx.id.slice(-6).toUpperCase()}</Td>
                        <Td>
                          <div className="max-w-[280px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-medium text-off-white truncate max-w-[180px]">
                                {customerDisplayName(tx)}
                              </p>
                              <CustomerSourceBadge tx={tx} size="xs" />
                            </div>
                            <p className="text-xs text-muted truncate">
                              {(tx.items || []).map(i => i.name).filter(Boolean).join(', ') || '—'}
                            </p>
                          </div>
                        </Td>
                        <Td>
                          {barberNames.length > 0 ? (
                            <div className="flex items-center gap-1 flex-wrap max-w-[160px]">
                              {barberNames.map(name => (
                                <span
                                  key={name}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[11px] font-medium whitespace-nowrap"
                                >
                                  <User className="w-2.5 h-2.5" /> {name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted text-xs italic">—</span>
                          )}
                        </Td>
                        <Td>
                          <Badge variant={getStatusBadge(tx.paymentMethod)}>
                            {PAYMENT_LABELS[tx.paymentMethod] || tx.paymentMethod || '—'}
                          </Badge>
                        </Td>
                        <Td className="text-right">
                          <span className="font-semibold text-gold tabular-nums whitespace-nowrap">
                            {formatRupiah(tx.total)}
                          </span>
                        </Td>
                        <Td>
                          <StatusPill status={tx.status} />
                        </Td>
                        <Td className="text-right">
                          <Eye className="w-4 h-4 text-muted group-hover:text-gold transition-colors" />
                        </Td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile card list */}
            <ul className="md:hidden divide-y divide-dark-border/60">
              {transactions.map(tx => {
                const meta = STATUS_META[tx.status] || STATUS_META.completed
                const barberNames = transactionBarbers(tx)
                return (
                  <li key={tx.id}>
                    <button
                      onClick={() => openDetail(tx)}
                      className="w-full text-left p-4 active:bg-dark-card/60 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          <span className="text-muted">{meta.label}</span>
                          <span className="text-muted">·</span>
                          <span className="text-muted font-mono">#{tx.id.slice(-6).toUpperCase()}</span>
                        </span>
                        <span className="font-bold text-gold tabular-nums whitespace-nowrap">
                          {formatRupiah(tx.total)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-semibold text-off-white text-sm truncate max-w-[180px]">
                          {customerDisplayName(tx)}
                        </p>
                        <CustomerSourceBadge tx={tx} size="xs" />
                      </div>
                      <p className="text-xs text-muted truncate mt-0.5">
                        {(tx.items || []).map(i => i.name).filter(Boolean).join(', ') || '—'}
                      </p>
                      {barberNames.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap mt-1.5">
                          {barberNames.map(name => (
                            <span
                              key={name}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[10px] font-medium"
                            >
                              <User className="w-2.5 h-2.5" /> {name}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <span className="text-[11px] text-muted">{formatDateTimeInTz(tx.createdAt)}</span>
                        <Badge variant={getStatusBadge(tx.paymentMethod)}>
                          {PAYMENT_LABELS[tx.paymentMethod] || tx.paymentMethod || '—'}
                        </Badge>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              onChange={setPage}
              loading={isFetching}
            />
          </>
        )}
      </Card>

      <TransactionDetailModal
        tx={detailTx}
        loading={!detailTx && fallbackDetail.isLoading}
        onClose={closeDetail}
        onChanged={() => setSummaryRefreshKey(k => k + 1)}
      />
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatsGrid({ summary, loading }) {
  const stats = [
    { label: 'Transaksi',   value: summary ? summary.count.toLocaleString('id-ID') : '—' },
    { label: 'Pendapatan',  value: summary ? formatRupiah(summary.totalRevenue) : '—',          valueShort: summary ? formatRupiahShort(summary.totalRevenue) : '—' },
    { label: 'Rata-rata',   value: summary ? formatRupiah(summary.avgTicket || 0) : '—',        valueShort: summary ? formatRupiahShort(summary.avgTicket || 0) : '—' },
    { label: 'Diskon',      value: summary ? formatRupiah(summary.totalDiscount || 0) : '—',    valueShort: summary ? formatRupiahShort(summary.totalDiscount || 0) : '—' },
  ]
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      {stats.map((s, i) => (
        <div key={i} className="p-3 sm:p-4 rounded-2xl bg-dark-surface border border-dark-border">
          <p className="text-[11px] sm:text-xs text-muted">{s.label}</p>
          <p className={`mt-1 text-base sm:text-lg font-bold tabular-nums truncate whitespace-nowrap ${loading ? 'text-muted' : 'text-off-white'}`}>
            {s.valueShort != null ? (
              <>
                <span className="sm:hidden">{s.valueShort}</span>
                <span className="hidden sm:inline">{s.value}</span>
              </>
            ) : s.value}
          </p>
        </div>
      ))}
    </div>
  )
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.completed
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-dark-card text-[11px] font-medium">
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      <span className="text-off-white">{meta.label}</span>
    </span>
  )
}

function Th({ children, className = '' }) {
  return (
    <th className={`px-4 py-3 text-left text-[11px] font-semibold text-muted uppercase tracking-wider ${className}`}>
      {children}
    </th>
  )
}
function Td({ children, className = '' }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>
}

function SelectField({ label, value, onChange, options, className = '' }) {
  return (
    <label className={`relative block w-full bg-dark-bg border border-dark-border rounded-xl px-3.5 py-2 ${className}`}>
      <span className="block text-[10px] font-medium text-muted uppercase tracking-wider">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-transparent text-off-white text-sm outline-none mt-0.5 pr-1 appearance-none cursor-pointer"
      >
        {options.map(o => <option key={o.value} value={o.value} className="bg-dark-surface text-off-white">{o.label}</option>)}
      </select>
    </label>
  )
}

function DateField({ label, value, min, max, onChange }) {
  const ref = useRef(null)
  const formatted = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Pilih tanggal'

  const openPicker = (e) => {
    const el = ref.current
    if (!el) return
    if (typeof el.showPicker === 'function') {
      try { e.preventDefault(); el.showPicker() } catch { /* noop */ }
    }
  }
  return (
    <label
      onClick={openPicker}
      className="relative block w-full bg-dark-bg border border-dark-border rounded-xl px-3.5 py-2 cursor-pointer hover:border-gold/40 focus-within:border-gold/60 transition-colors"
    >
      <span className="block text-[10px] font-medium text-muted uppercase tracking-wider">{label}</span>
      <span className="flex items-center justify-between gap-2 mt-0.5">
        <span className={`text-sm ${value ? 'text-off-white font-medium' : 'text-muted'}`}>{formatted}</span>
        {value ? (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange('') }}
            aria-label="Hapus tanggal"
            className="relative z-20 w-6 h-6 inline-flex items-center justify-center rounded-md text-muted hover:text-off-white hover:bg-dark-card transition-colors"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        ) : (
          <Calendar className="w-4 h-4 text-muted shrink-0" />
        )}
      </span>
      <input
        ref={ref}
        type="date"
        value={value || ''}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 z-10 w-full h-full opacity-0 cursor-pointer [color-scheme:dark]"
        aria-label={label}
      />
    </label>
  )
}

function Pagination({ page, totalPages, total, onChange, loading }) {
  if (totalPages <= 1) {
    return (
      <div className="px-4 py-3 border-t border-dark-border text-xs text-muted flex items-center justify-between">
        <span>{total} transaksi</span>
        {loading && <span className="text-muted/70">Memuat…</span>}
      </div>
    )
  }
  const max = Math.min(5, totalPages)
  const startBtn = Math.max(1, Math.min(page - 2, totalPages - max + 1))
  const buttons = Array.from({ length: max }, (_, i) => startBtn + i)
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-dark-border text-xs">
      <span className="text-muted">
        Halaman {page} dari {totalPages} · {total} transaksi
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page === 1 || loading}
          className="p-2 rounded-lg text-muted hover:text-off-white hover:bg-dark-card disabled:opacity-30 transition-colors"
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {buttons.map(p => (
          <button
            key={p}
            onClick={() => onChange(p)}
            disabled={loading}
            className={`min-w-8 h-8 px-2 rounded-lg text-xs font-semibold transition-colors ${
              p === page
                ? 'bg-gold text-dark-bg'
                : 'text-muted hover:text-off-white hover:bg-dark-card'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages || loading}
          className="p-2 rounded-lg text-muted hover:text-off-white hover:bg-dark-card disabled:opacity-30 transition-colors"
          aria-label="Halaman berikutnya"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function EmptyState({ onReset }) {
  return (
    <div className="text-center py-14 px-6">
      <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-dark-card border border-dark-border flex items-center justify-center">
        <Receipt className="w-6 h-6 text-muted" />
      </div>
      <p className="text-off-white font-semibold mb-1">Tidak ada transaksi</p>
      <p className="text-muted text-sm mb-4">Coba ubah rentang tanggal atau hapus filter aktif.</p>
      <button
        onClick={onReset}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-dark-card border border-dark-border text-sm text-off-white hover:border-gold/40 transition-colors"
      >
        Reset filter
      </button>
    </div>
  )
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function TransactionDetailModal({ tx, loading, onClose, onChanged }) {
  const isOpen = !!tx || loading
  const updateStatus = useUpdateTransactionStatus()
  const toast = useToast()
  const { user } = useAuthStore()
  const [confirmAction, setConfirmAction] = useState(null) // 'cancel' | 'refund' | null
  // Fetch ratings yang sudah diberikan untuk transaksi ini (max 20 — biasanya 1-3 barber)
  const { data: ratingsData } = useBarberRatings(tx?.id ? { transactionId: tx.id, limit: 20 } : {})
  const ratings = tx?.id ? (ratingsData?.items || []) : []

  const canManage = user?.role === 'super_admin' || user?.role === 'tenant_admin' || user?.role === 'kasir'

  if (!isOpen) return null
  if (loading && !tx) {
    return (
      <Modal isOpen onClose={onClose} size="md" showClose title={null}>
        <div className="space-y-3 py-6">
          <div className="h-6 w-48 bg-dark-card rounded animate-pulse" />
          <div className="h-4 w-32 bg-dark-card rounded animate-pulse" />
          <div className="h-32 w-full bg-dark-card rounded-xl animate-pulse" />
        </div>
      </Modal>
    )
  }

  const items = tx.items || []
  const subtotal = tx.subtotal ?? items.reduce((s, i) => s + (i.price || 0), 0)
  const discount = tx.discountAmount || 0
  const tax = tx.tax || 0
  const change = tx.change || 0
  const cashReceived = tx.cashReceived || 0
  const shortId = tx.id.slice(-6).toUpperCase()
  const meta = STATUS_META[tx.status] || STATUS_META.completed
  const isCompleted = tx.status === 'completed' || !tx.status

  const doStatusChange = async (status) => {
    try {
      await updateStatus.mutateAsync({ id: tx.id, status })
      toast.success(status === 'cancelled' ? 'Transaksi dibatalkan' : 'Transaksi di-refund')
      setConfirmAction(null)
      onChanged?.()
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal mengubah status')
    }
  }

  return (
    <>
      <Modal isOpen onClose={onClose} size="md" showClose={false} title={null}>
        <div className="-mx-6 -my-4">
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b border-dark-border flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] font-mono text-muted">#{shortId}</span>
                <StatusPill status={tx.status} />
                <CustomerSourceBadge tx={tx} />
                {tx.customer?.visitCount > 5 && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gold/15 text-gold border border-gold/30 whitespace-nowrap"
                    title={`Pelanggan tetap — ${tx.customer.visitCount} kunjungan`}
                  >
                    <Star className="w-3 h-3 fill-current" /> Pelanggan Tetap
                  </span>
                )}
              </div>
              <h3 className="font-display text-lg font-semibold text-off-white truncate">
                {customerDisplayName(tx)}
              </h3>
              <p className="text-xs text-muted">{formatDateTimeInTz(tx.createdAt)}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => window.print()}
                title="Cetak"
                aria-label="Cetak"
                className="hidden sm:inline-flex w-9 h-9 items-center justify-center rounded-lg text-muted hover:text-off-white hover:bg-dark-card transition-colors"
              >
                <Printer className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                aria-label="Tutup"
                className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-muted hover:text-off-white hover:bg-dark-card transition-colors"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Meta grid */}
          <div className="px-6 py-4 grid grid-cols-2 gap-3 text-xs border-b border-dark-border">
            <Meta icon={Store} label="Cabang" value={tx.branch?.name || '—'} />
            <Meta icon={CreditCard} label="Bayar"
              value={<Badge variant={getStatusBadge(tx.paymentMethod)}>{PAYMENT_LABELS[tx.paymentMethod] || tx.paymentMethod || '—'}</Badge>}
            />
            {customerDisplayPhone(tx) && (
              <Meta icon={Phone} label="Telepon" value={
                <span className="font-mono">{customerDisplayPhone(tx)}</span>
              } className="col-span-2" />
            )}
            {tx.customer?.visitCount != null && (
              <Meta icon={User} label="Kunjungan" value={`${tx.customer.visitCount}x`} />
            )}
            {tx.customer?.loyaltyPoints != null && (
              <Meta icon={Star} label="Poin Loyalty" value={tx.customer.loyaltyPoints.toLocaleString('id-ID')} />
            )}
          </div>

          {/* Booking source detail — kalau transaksi datang dari booking */}
          {tx.booking && (
            <div className="px-6 py-4 border-b border-dark-border bg-gold/5">
              <div className="flex items-center gap-2 mb-2">
                <BookmarkCheck className="w-4 h-4 text-gold" />
                <p className="text-[11px] font-semibold text-gold uppercase tracking-wider">
                  Asal Booking · {tx.booking.source === 'online' ? 'Online' : 'Walk-in'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <Meta icon={Calendar} label="Jadwal" value={
                  `${tx.booking.date || '—'}${tx.booking.time ? ` · ${tx.booking.time}` : ''}`
                } />
                <Meta icon={Clock} label="Dibuat" value={
                  tx.booking.createdAt ? formatDateTimeInTz(tx.booking.createdAt) : '—'
                } />
                {tx.booking.serviceName && (
                  <Meta icon={Receipt} label="Layanan" value={tx.booking.serviceName} className="col-span-2" />
                )}
                {tx.booking.barberName && (
                  <Meta icon={User} label="Barber" value={tx.booking.barberName} className="col-span-2" />
                )}
                {tx.booking.notes && (
                  <p className="col-span-2 text-muted italic">"{tx.booking.notes}"</p>
                )}
              </div>
            </div>
          )}

          {/* Items */}
          <div className="px-6 py-4 border-b border-dark-border max-h-72 overflow-y-auto">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-3">Item</p>
            <div className="space-y-2">
              {items.length === 0 && <p className="text-sm text-muted italic">Tidak ada item</p>}
              {items.map((it, idx) => (
                <div key={it.id || idx} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="text-off-white font-medium leading-tight">{it.name}</p>
                    {it.barberName && (
                      <p className="text-[11px] text-muted mt-0.5">Barber: {it.barberName}</p>
                    )}
                    {it.service?.category && (
                      <p className="text-[11px] text-muted">{it.service.category}</p>
                    )}
                  </div>
                  <span className="font-semibold text-off-white whitespace-nowrap tabular-nums">
                    {formatRupiah(it.price)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="px-6 py-4 space-y-1.5 text-sm">
            <Row label="Subtotal" value={formatRupiah(subtotal)} />
            {discount > 0 && (
              <Row
                label={`Diskon${tx.voucherCode ? ` (${tx.voucherCode})` : ''}`}
                value={`- ${formatRupiah(discount)}`}
                valueClass="text-red-400"
              />
            )}
            {tax > 0 && <Row label="Pajak" value={formatRupiah(tax)} />}
            <div className="border-t border-dark-border my-2" />
            <Row
              label={<span className="text-base font-semibold text-off-white">Total</span>}
              value={<span className="text-lg font-bold text-gold tabular-nums">{formatRupiah(tx.total)}</span>}
            />
            {tx.paymentMethod === 'cash' && cashReceived > 0 && (
              <>
                <div className="border-t border-dark-border my-2" />
                <Row label="Diterima" value={formatRupiah(cashReceived)} />
                <Row label="Kembalian" value={formatRupiah(change)} valueClass="text-emerald-400 font-semibold" />
              </>
            )}
            {tx.loyaltyPointsEarned > 0 && (
              <Row label="Poin loyalti" value={`+${tx.loyaltyPointsEarned}`} valueClass="text-blue-300" />
            )}
          </div>

          {/* Rating Barber untuk transaksi ini */}
          {ratings.length > 0 && (
            <div className="px-6 py-4 border-t border-dark-border bg-gold/[0.02]">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-3 inline-flex items-center gap-2">
                <Star className="w-3 h-3 text-gold fill-gold" /> Rating Barber
              </p>
              <div className="space-y-2">
                {ratings.map(r => {
                  const isLow  = r.rating <= 2
                  const isHigh = r.rating >= 4
                  return (
                    <div key={r.id} className={`p-2.5 rounded-lg border ${
                      isLow ? 'bg-red-500/5 border-red-500/30' :
                      isHigh ? 'bg-emerald-500/5 border-emerald-500/30' :
                      'bg-dark-card border-dark-border'
                    }`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm text-off-white font-medium truncate">
                          {r.barber?.name || '—'}
                        </span>
                        <span className={`text-sm tabular-nums whitespace-nowrap ${isLow ? 'text-red-400' : 'text-gold'}`}>
                          {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                        </span>
                      </div>
                      {r.comment && (
                        <p className="text-xs italic text-muted mt-1 leading-snug">"{r.comment}"</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted flex-wrap">
                        <span>{formatDateTimeInTz(r.createdAt)}</span>
                        {r.publishStatus === 'published' && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold uppercase tracking-wide">Live di /book</span>
                        )}
                        {r.ticketId && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold uppercase tracking-wide inline-flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" /> Tiket dibuat
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          {canManage && isCompleted && (
            <div className="px-6 pb-5 pt-1 border-t border-dark-border flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => setConfirmAction('refund')}
                disabled={updateStatus.isPending}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-400 text-sm font-semibold hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
              >
                <RefreshCcw className="w-4 h-4" /> Refund
              </button>
              <button
                onClick={() => setConfirmAction('cancel')}
                disabled={updateStatus.isPending}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/40 text-red-400 text-sm font-semibold hover:bg-red-500/20 disabled:opacity-50 transition-colors"
              >
                <Ban className="w-4 h-4" /> Batalkan
              </button>
            </div>
          )}
          {!isCompleted && (
            <div className="px-6 pb-5 pt-3 border-t border-dark-border flex items-center gap-2 text-xs text-muted">
              <CheckCircle2 className="w-4 h-4" />
              Transaksi ini sudah berstatus <span className="font-semibold">{meta.label}</span>.
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmAction === 'cancel'}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => doStatusChange('cancelled')}
        variant="danger"
        icon={AlertTriangle}
        title="Batalkan transaksi?"
        description="Transaksi ditandai DIBATALKAN dan dikeluarkan dari perhitungan omzet. Poin loyalti & kunjungan pelanggan, poin yang ditukar, serta kuota voucher otomatis dikembalikan. Tindakan ini final — tidak bisa diurungkan."
        highlight={`#${shortId}`}
        confirmText="Ya, Batalkan"
        cancelText="Tidak, Kembali"
      />
      <ConfirmDialog
        isOpen={confirmAction === 'refund'}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => doStatusChange('refunded')}
        variant="warning"
        icon={RefreshCcw}
        title="Refund transaksi?"
        description="Transaksi ditandai REFUND dan dikeluarkan dari perhitungan omzet. Poin loyalti & kunjungan pelanggan, poin yang ditukar, serta kuota voucher otomatis dikembalikan. Pastikan dana sudah dikembalikan ke pelanggan. Tindakan ini final."
        highlight={`#${shortId}`}
        confirmText="Ya, Refund"
        cancelText="Tidak, Kembali"
      />
    </>
  )
}

function Meta({ icon: Icon, label, value, className = '' }) {
  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      <Icon className="w-3.5 h-3.5 text-muted shrink-0" />
      <span className="text-muted shrink-0">{label}:</span>
      <span className="text-off-white font-medium truncate">{value}</span>
    </div>
  )
}

function Row({ label, value, valueClass = 'text-off-white' }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted text-sm">{label}</span>
      <span className={`text-sm tabular-nums ${valueClass}`}>{value}</span>
    </div>
  )
}
