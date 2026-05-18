import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarDays, Clock, User, Check, X as XIcon, Phone,
  Search, Filter as FilterIcon, MessageCircle, Copy, ChevronLeft, ChevronRight,
  Eye, LogIn, Inbox, Globe, Footprints, Sparkles, Zap, Plus, ArrowDownAZ, ArrowDownNarrowWide,
  Star, Download, RefreshCw, AlertTriangle, Loader2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore.js'
import {
  useBookings, useBookingStats, useUpdateBooking, useDeleteBooking,
  useCheckInBooking, useCreateBooking, useBulkBooking, fetchAllBookings,
} from '../../hooks/useBookings.js'
import { useServices } from '../../hooks/useServices.js'
import { useUsers } from '../../hooks/useUsers.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card from '../../components/ui/Card.jsx'
import Badge, { getStatusBadge } from '../../components/ui/Badge.jsx'
import Modal from '../../components/ui/Modal.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import LiveBadge from '../../components/ui/LiveBadge.jsx'
import { format, addDays } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { getBranchSlug } from '../../utils/branchSlug.js'
import { getTenantTimezone, formatYmdInTz } from '../../utils/timezone.js'

// ── constants ──────────────────────────────────────────────────────────────
const SEARCH_DEBOUNCE_MS = 350

// ── helpers ────────────────────────────────────────────────────────────────
function formatDateLabel(dateStr) {
  if (!dateStr) return '—'
  try {
    const [y, m, d] = String(dateStr).split('-').map(Number)
    return format(new Date(y, m - 1, d), 'd MMM yyyy', { locale: idLocale })
  } catch { return dateStr }
}
function formatDayLabel(dateStr) {
  if (!dateStr) return '—'
  try {
    const [y, m, d] = String(dateStr).split('-').map(Number)
    return format(new Date(y, m - 1, d), 'EEEE', { locale: idLocale })
  } catch { return '' }
}

const STATUS_LABEL = {
  pending:     'Menunggu',
  confirmed:   'Terkonfirmasi',
  in_progress: 'Berlangsung',
  done:        'Selesai',
  cancelled:   'Dibatalkan',
}

// Indonesia phone → WA wa.me link
function waLink(phone, message = '') {
  if (!phone) return null
  let p = String(phone).replace(/\D/g, '')
  if (p.startsWith('0')) p = '62' + p.slice(1)
  else if (!p.startsWith('62')) p = '62' + p
  const text = encodeURIComponent(message)
  return `https://wa.me/${p}${text ? `?text=${text}` : ''}`
}

// Booking baru saja dibuat (≤ 5 menit) — beri pulse "BARU" supaya kasir
// langsung melihat customer yang baru masuk. Pakai createdAt dari backend.
function isFreshBooking(b, freshMinutes = 5) {
  if (!b?.createdAt) return false
  const ageMs = Date.now() - new Date(b.createdAt).getTime()
  return ageMs >= 0 && ageMs <= freshMinutes * 60_000
}

// Booking yang waktu mulainya tinggal sebentar lagi (hari ini, ≤ 30 menit dari
// sekarang, masih pending/confirmed). Berguna untuk reminder kasir.
function isSoonBooking(b, todayStr, soonMinutes = 30) {
  if (!b || (b.status !== 'pending' && b.status !== 'confirmed')) return false
  if (b.date !== todayStr) return false
  if (!b.time) return false
  try {
    const [h, m] = b.time.split(':').map(Number)
    const t = new Date()
    t.setHours(h, m, 0, 0)
    const diffMin = (t.getTime() - Date.now()) / 60_000
    return diffMin >= -5 && diffMin <= soonMinutes
  } catch { return false }
}

// CSV cell escaper — bungkus tanda kutip jika ada koma / newline / kutip.
function escapeCsv(v) {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  )
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

// ── filter chips ──────────────────────────────────────────────────────────
const DATE_FILTERS = [
  { id: 'upcoming', label: 'Mendatang' },
  { id: 'today',    label: 'Hari Ini'   },
  { id: 'tomorrow', label: 'Besok'      },
  { id: 'past',     label: 'Lalu'       },
  { id: 'all',      label: 'Semua'      },
]

const STATUS_FILTERS = [
  { id: 'all',         label: 'Semua Status' },
  { id: 'pending',     label: 'Menunggu' },
  { id: 'confirmed',   label: 'Terkonfirmasi' },
  { id: 'in_progress', label: 'Berlangsung' },
  { id: 'done',        label: 'Selesai' },
  { id: 'cancelled',   label: 'Dibatalkan' },
]

// Subtle pulse — booking baru masuk dalam 5 menit terakhir.
function FreshBadge() {
  return (
    <span className="relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gold text-dark whitespace-nowrap shadow-gold">
      <Sparkles className="w-2.5 h-2.5" />
      BARU
      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-gold animate-ping" />
    </span>
  )
}

// Booking yang waktu mulainya tinggal sebentar — beri reminder pakai countdown.
function SoonBadge({ time }) {
  const minsAway = (() => {
    if (!time) return null
    try {
      const [h, m] = time.split(':').map(Number)
      const t = new Date()
      t.setHours(h, m, 0, 0)
      return Math.round((t.getTime() - Date.now()) / 60_000)
    } catch { return null }
  })()
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap"
      title="Waktu booking sudah dekat — segera siapkan"
    >
      <Zap className="w-2.5 h-2.5" />
      {minsAway != null && minsAway >= 0 ? `${minsAway}m lagi` : 'Segera'}
    </span>
  )
}

// Checkbox kecil reusable untuk seleksi bulk.
function SelectBox({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange() }}
      className={`flex-shrink-0 w-5 h-5 rounded-md border inline-flex items-center justify-center transition-colors ${
        checked
          ? 'bg-gold border-gold text-dark'
          : 'bg-dark-surface border-dark-border text-transparent hover:border-gold/50'
      }`}
    >
      <Check className="w-3.5 h-3.5" strokeWidth={3} />
    </button>
  )
}

// ── main component ─────────────────────────────────────────────────────────
export default function BookingsPage() {
  const { user } = useAuthStore()
  const toast = useToast()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const tz = useMemo(() => getTenantTimezone(), [])
  const today    = useMemo(() => formatYmdInTz(new Date(), tz), [tz])
  const tomorrow = useMemo(() => formatYmdInTz(new Date(Date.now() + 86_400_000), tz), [tz])

  const [dateFilter, setDateFilter]   = useState('upcoming')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [sortBy, setSortBy] = useState('recent') // 'recent' | 'schedule'
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = isMobile ? 10 : 20

  const [detailId, setDetailId] = useState(null)
  const [detailFallback, setDetailFallback] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [checkInTarget, setCheckInTarget] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Debounce pencarian — hindari request tiap keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [search])

  // Tick setiap 30 detik supaya badge "BARU" / "Segera" recompute
  // tanpa user harus refresh.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const updateBooking  = useUpdateBooking()
  const deleteBooking  = useDeleteBooking()
  const checkInBooking = useCheckInBooking()
  const createBooking  = useCreateBooking()
  const bulkBooking    = useBulkBooking()

  // Reset page + seleksi kalau filter berubah
  useEffect(() => {
    setPage(1)
    setSelectedIds(new Set())
  }, [dateFilter, statusFilter, sourceFilter, debouncedSearch, sortBy])

  // Build filter params for backend (kasir branchId is enforced server-side too)
  const apiFilters = useMemo(() => {
    const f = { branchId: user?.branchId, page, limit: PAGE_SIZE, sortBy }
    if (statusFilter !== 'all') f.status = statusFilter
    if (sourceFilter !== 'all') f.source = sourceFilter
    if (debouncedSearch) f.search = debouncedSearch
    if (dateFilter === 'today')    f.date = today
    if (dateFilter === 'tomorrow') f.date = tomorrow
    if (dateFilter === 'upcoming') f.dateFrom = today
    if (dateFilter === 'past')     f.dateTo   = today
    return f
  }, [user?.branchId, page, PAGE_SIZE, statusFilter, sourceFilter, debouncedSearch, dateFilter, sortBy, today, tomorrow])

  const {
    data: bookings = [], meta, isLoading, isFetching, isError, refetch,
  } = useBookings(apiFilters)

  const statFilters = useMemo(
    () => ({ branchId: user?.branchId, tz }),
    [user?.branchId, tz],
  )
  const { data: statData } = useBookingStats(statFilters)

  // ── stats ────────────────────────────────────────────────────────────────
  // Sumber kebenaran = endpoint /bookings/stats (akurat lintas halaman).
  // Fallback ke meta.total kalau stats belum sempat termuat.
  const stats = {
    today:   statData?.today,
    pending: statData?.pending,
    total:   statData?.total ?? meta?.total,
  }

  // sort — jaga-jaga kalau backend mengirim urutan berbeda.
  const sorted = useMemo(() => {
    const arr = [...bookings]
    if (sortBy === 'schedule') {
      arr.sort((a, b) =>
        (a.date || '').localeCompare(b.date || '') ||
        (a.time || '').localeCompare(b.time || '') ||
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      )
    } else {
      arr.sort((a, b) =>
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0) ||
        (a.date || '').localeCompare(b.date || '') ||
        (a.time || '').localeCompare(b.time || '')
      )
    }
    return arr
  }, [bookings, sortBy])

  const totalPages = meta?.totalPages || 1
  const activeFilters =
    (statusFilter !== 'all' ? 1 : 0) +
    (sourceFilter !== 'all' ? 1 : 0) +
    (debouncedSearch ? 1 : 0) +
    (dateFilter !== 'upcoming' ? 1 : 0)

  // Detail booking — selalu ambil versi terbaru dari list bila masih ada,
  // jatuh ke snapshot supaya modal tidak menutup mendadak saat data berubah.
  const detail = detailId
    ? (bookings.find(b => b.id === detailId) || detailFallback)
    : null
  const openDetail = useCallback((b) => { setDetailId(b.id); setDetailFallback(b) }, [])
  const closeDetail = useCallback(() => { setDetailId(null); setDetailFallback(null) }, [])

  // ── selection ────────────────────────────────────────────────────────────
  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])
  const selectableIds = useMemo(
    () => sorted.filter(b => b.status === 'pending' || b.status === 'confirmed').map(b => b.id),
    [sorted],
  )
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))
  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      const allOn = selectableIds.length > 0 && selectableIds.every(id => prev.has(id))
      return allOn ? new Set() : new Set(selectableIds)
    })
  }, [selectableIds])
  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  // ── actions ──────────────────────────────────────────────────────────────
  const doConfirm = async (booking) => {
    try {
      await updateBooking.mutateAsync({ id: booking.id, status: 'confirmed' })
      toast.success(`Booking ${booking.customerName} dikonfirmasi`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal mengkonfirmasi booking')
    }
  }

  const doCancel = async () => {
    if (!cancelTarget) return
    try {
      await deleteBooking.mutateAsync(cancelTarget.id)
      toast.success('Booking dibatalkan')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal membatalkan booking')
    }
  }

  const doCheckIn = async () => {
    if (!checkInTarget) return
    try {
      const res = await checkInBooking.mutateAsync(checkInTarget.id)
      toast.success(`${checkInTarget.customerName} masuk antrian`)
      closeDetail()
      // Navigate ke halaman antrian supaya kasir langsung melihat tiket baru
      const slug = getBranchSlug(user)
      navigate(`/${slug}/kasir/queue`)
      return res
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal check-in booking')
    }
  }

  const doBulkConfirm = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    try {
      const res = await bulkBooking.mutateAsync({ ids, action: 'confirm' })
      toast.success(`${res?.count || 0} booking dikonfirmasi`)
      clearSelection()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal konfirmasi massal')
    }
  }

  const doBulkCancel = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    try {
      const res = await bulkBooking.mutateAsync({ ids, action: 'cancel' })
      toast.success(`${res?.count || 0} booking dibatalkan`)
      clearSelection()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal pembatalan massal')
    }
  }

  const copyPhone = async (phone) => {
    if (!phone) return
    try {
      await navigator.clipboard.writeText(phone)
      toast.success('Nomor disalin')
    } catch {
      toast.error('Tidak bisa menyalin')
    }
  }

  const handleExport = async () => {
    if (!user?.tenantId) return
    setExporting(true)
    try {
      const { page: _p, limit: _l, ...exportFilters } = apiFilters
      const all = await fetchAllBookings({ tenantId: user.tenantId, ...exportFilters })
      if (!all.length) {
        toast.error('Tidak ada data untuk diekspor')
        return
      }
      const header = ['ID', 'Status', 'Sumber', 'Pelanggan', 'Telepon', 'Layanan', 'Barber', 'Tanggal', 'Hari', 'Waktu', 'Catatan', 'Dibuat']
      const rows = all.map(b => [
        b.id,
        STATUS_LABEL[b.status] || b.status,
        (b.source || 'online') === 'online' ? 'Online' : 'Walk-in',
        b.customerName || '',
        b.customerPhone || '',
        b.serviceName || '',
        b.barberName || '',
        b.date || '',
        formatDayLabel(b.date),
        b.time || '',
        b.notes || '',
        b.createdAt ? new Date(b.createdAt).toLocaleString('id-ID') : '',
      ])
      const csv = [header, ...rows].map(r => r.map(escapeCsv).join(',')).join('\r\n')
      const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `booking-${today}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Berhasil ekspor ${all.length} booking`)
    } catch (err) {
      toast.error('Gagal ekspor: ' + (err?.response?.data?.error || err.message))
    } finally {
      setExporting(false)
    }
  }

  // ── renderers ────────────────────────────────────────────────────────────
  const renderStatusBadge = (b) => (
    <Badge variant={getStatusBadge(b.status) || 'muted'} dot>
      {STATUS_LABEL[b.status] || b.status}
    </Badge>
  )

  // Beda warna & icon agar kasir sekilas bisa melihat mana booking online
  // (perlu konfirmasi/dihubungi) vs walk-in (kasir input langsung di counter).
  const renderSourceBadge = (b) => {
    const isOnline = (b.source || 'online') === 'online'
    return isOnline ? (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30 whitespace-nowrap"
        title="Booking dibuat oleh pelanggan dari aplikasi/halaman online"
      >
        <Globe className="w-2.5 h-2.5" /> Online
      </span>
    ) : (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap"
        title="Walk-in — booking diinput langsung oleh kasir di counter"
      >
        <Footprints className="w-2.5 h-2.5" /> Walk-in
      </span>
    )
  }

  const renderActions = (b, { compact = false } = {}) => (
    <div className={`flex items-center ${compact ? 'gap-1' : 'gap-1.5'} flex-wrap justify-end`}>
      {b.status === 'pending' && (
        <button
          onClick={() => doConfirm(b)}
          disabled={updateBooking.isPending}
          title="Konfirmasi" aria-label={`Konfirmasi booking ${b.customerName}`}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
        </button>
      )}
      {(b.status === 'pending' || b.status === 'confirmed') && (
        <button
          onClick={() => setCheckInTarget(b)}
          title="Masukkan ke Antrian" aria-label={`Masukkan ${b.customerName} ke antrian`}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gold/10 border border-gold/20 text-gold hover:bg-gold/20 transition"
        >
          <LogIn className="w-4 h-4" />
        </button>
      )}
      {b.customerPhone && (
        <a
          href={waLink(b.customerPhone, `Halo ${b.customerName}, ini konfirmasi booking Anda di ${b.branch?.name || ''} pada ${formatDateLabel(b.date)} pukul ${b.time}.`)}
          target="_blank" rel="noreferrer"
          title="Hubungi via WhatsApp" aria-label={`Hubungi ${b.customerName} via WhatsApp`}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition"
        >
          <MessageCircle className="w-4 h-4" />
        </a>
      )}
      <button
        onClick={() => openDetail(b)}
        title="Detail" aria-label={`Lihat detail booking ${b.customerName}`}
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-dark-card border border-dark-border text-muted hover:text-off-white hover:border-gold/40 transition"
      >
        <Eye className="w-4 h-4" />
      </button>
      {(b.status === 'pending' || b.status === 'confirmed') && (
        <button
          onClick={() => setCancelTarget(b)}
          disabled={deleteBooking.isPending}
          title="Batalkan" aria-label={`Batalkan booking ${b.customerName}`}
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
        >
          <XIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  )

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 sm:space-y-6 pb-24 sm:pb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white">Booking</h1>
            <LiveBadge />
            {isFetching && !isLoading && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                <Loader2 className="w-3 h-3 animate-spin" /> Memuat…
              </span>
            )}
          </div>
          <p className="text-muted text-xs sm:text-sm mt-1">
            {stats.today ?? '–'} hari ini · {stats.pending ?? '–'} menunggu konfirmasi · {stats.total ?? '–'} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sort toggle */}
          <button
            onClick={() => setSortBy(s => s === 'recent' ? 'schedule' : 'recent')}
            title={sortBy === 'recent' ? 'Urutkan berdasarkan jadwal' : 'Urutkan berdasarkan terbaru'}
            aria-label="Ubah urutan"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-dark-card border border-dark-border text-muted hover:text-off-white text-xs sm:text-sm transition-colors"
          >
            {sortBy === 'recent' ? <ArrowDownNarrowWide className="w-4 h-4" /> : <ArrowDownAZ className="w-4 h-4" />}
            <span className="hidden sm:inline">{sortBy === 'recent' ? 'Terbaru' : 'Jadwal'}</span>
          </button>
          {/* Export CSV */}
          <button
            onClick={handleExport}
            disabled={exporting}
            title="Ekspor CSV" aria-label="Ekspor booking ke CSV"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-dark-card border border-dark-border text-muted hover:text-off-white text-xs sm:text-sm transition-colors disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="hidden sm:inline">{exporting ? 'Mengekspor…' : 'Ekspor'}</span>
          </button>
          {/* Add booking */}
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-gold text-dark text-xs sm:text-sm font-semibold hover:bg-gold-light transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Tambah Booking</span>
            <span className="sm:hidden">Booking</span>
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: 'Hari Ini',            value: stats.today,   color: 'text-gold' },
          { label: 'Menunggu Konfirmasi', value: stats.pending, color: 'text-amber-400' },
          { label: 'Total',               value: stats.total,   color: 'text-off-white' },
        ].map(s => (
          <Card key={s.label} className="p-3 sm:p-4 text-center min-w-0">
            <p className={`text-lg sm:text-2xl font-bold ${s.color} truncate`}>{s.value ?? '–'}</p>
            <p className="text-muted text-[11px] sm:text-xs mt-0.5 leading-tight">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Search + status filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Cari booking"
            placeholder="Cari nama, nomor HP, layanan, barber…"
            className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-10 pr-9 py-2.5 text-sm outline-none focus:border-gold/60 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Hapus pencarian"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-md text-muted hover:text-off-white hover:bg-dark-card transition-colors"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="relative sm:w-56">
          <FilterIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            aria-label="Filter status"
            className="w-full appearance-none bg-dark-surface border border-dark-border text-off-white rounded-xl pl-9 pr-8 py-2.5 text-sm outline-none focus:border-gold/60 cursor-pointer"
          >
            {STATUS_FILTERS.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <ChevronRight className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted rotate-90 pointer-events-none" />
        </div>
        {activeFilters > 0 && (
          <button
            onClick={() => { setSearch(''); setStatusFilter('all'); setSourceFilter('all'); setDateFilter('upcoming') }}
            className="px-3 py-2.5 rounded-xl text-xs font-semibold text-muted hover:text-off-white hover:bg-dark-card transition-colors whitespace-nowrap"
          >
            Reset ({activeFilters})
          </button>
        )}
      </div>

      {/* Date pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {DATE_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setDateFilter(f.id)}
            aria-pressed={dateFilter === f.id}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
              dateFilter === f.id
                ? 'bg-gold text-dark border border-gold'
                : 'bg-dark-card border border-dark-border text-muted hover:text-off-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Source filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[
          { id: 'all',     label: 'Semua Sumber', icon: null },
          { id: 'online',  label: 'Online',       icon: Globe },
          { id: 'walk_in', label: 'Walk-in',      icon: Footprints },
        ].map(f => {
          const Icon = f.icon
          const isActive = sourceFilter === f.id
          return (
            <button
              key={f.id}
              onClick={() => setSourceFilter(f.id)}
              aria-pressed={isActive}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                isActive
                  ? f.id === 'online'  ? 'bg-blue-500/15 text-blue-400 border-blue-500/40'
                    : f.id === 'walk_in' ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                    : 'bg-gold/15 text-gold border-gold/40'
                  : 'bg-dark-card border-dark-border text-muted hover:text-off-white'
              }`}
            >
              {Icon && <Icon className="w-3 h-3" />}
              {f.label}
            </button>
          )
        })}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-dark-card animate-pulse" />
          ))}
        </div>
      )}

      {/* Error state */}
      {!isLoading && isError && (
        <Card className="p-10 sm:p-14 text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3 opacity-70" />
          <p className="text-off-white font-medium">Gagal memuat booking</p>
          <p className="text-muted text-sm mt-1">Periksa koneksi lalu coba lagi.</p>
          <button
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gold text-dark text-sm font-semibold hover:bg-gold-light transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Coba Lagi
          </button>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !isError && sorted.length === 0 && (
        <Card className="p-10 sm:p-14 text-center">
          <Inbox className="w-12 h-12 text-muted mx-auto mb-3 opacity-50" />
          <p className="text-off-white font-medium">Tidak ada booking</p>
          <p className="text-muted text-sm mt-1">Coba ubah filter atau kata pencarian.</p>
        </Card>
      )}

      {/* Desktop table */}
      {!isLoading && !isError && sorted.length > 0 && !isMobile && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-card/50 border-b border-dark-border">
                <tr className="text-left">
                  <th className="px-3 py-3 w-10">
                    {selectableIds.length > 0 && (
                      <SelectBox checked={allSelected} onChange={toggleSelectAll} label="Pilih semua booking di halaman ini" />
                    )}
                  </th>
                  <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wider">Sumber</th>
                  <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wider">ID</th>
                  <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wider">Pelanggan</th>
                  <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wider">Layanan</th>
                  <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wider">Barber</th>
                  <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wider whitespace-nowrap">Tanggal · Waktu</th>
                  <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wider text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border/60">
                <AnimatePresence initial={false}>
                  {sorted.map((b, i) => {
                    const selectable = b.status === 'pending' || b.status === 'confirmed'
                    const checked = selectedIds.has(b.id)
                    return (
                      <motion.tr
                        key={b.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: Math.min(i * 0.02, 0.2) }}
                        className={`transition-colors ${checked ? 'bg-gold/[0.06]' : 'hover:bg-dark-card/40'}`}
                      >
                        <td className="px-3 py-3 align-middle">
                          {selectable && (
                            <SelectBox checked={checked} onChange={() => toggleSelect(b.id)} label={`Pilih booking ${b.customerName}`} />
                          )}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {renderStatusBadge(b)}
                            {isFreshBooking(b) && <FreshBadge />}
                            {isSoonBooking(b, today) && <SoonBadge time={b.time} />}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle">{renderSourceBadge(b)}</td>
                        <td className="px-4 py-3 align-middle font-mono text-xs text-muted whitespace-nowrap">
                          #{b.id.slice(-6).toUpperCase()}
                        </td>
                        <td className="px-4 py-3 align-middle min-w-[180px]">
                          <p className="font-semibold text-off-white truncate max-w-[220px]" title={b.customerName}>
                            {b.customerName}
                          </p>
                          {b.customerPhone && (
                            <button
                              onClick={() => copyPhone(b.customerPhone)}
                              className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted hover:text-off-white transition-colors group"
                              title="Salin nomor" aria-label={`Salin nomor ${b.customerName}`}
                            >
                              <Phone className="w-3 h-3" />
                              <span className="font-mono">{b.customerPhone}</span>
                              <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <p className="text-off-white truncate max-w-[200px]" title={b.serviceName || ''}>
                            {b.serviceName || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <p className="text-off-white truncate max-w-[160px]" title={b.barberName || ''}>
                            {b.barberName || <span className="text-muted">—</span>}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-middle whitespace-nowrap">
                          <p className="text-off-white text-sm">{formatDateLabel(b.date)}</p>
                          <p className="text-muted text-xs">{formatDayLabel(b.date)} · {b.time}</p>
                        </td>
                        <td className="px-4 py-3 align-middle text-right">
                          {renderActions(b)}
                        </td>
                      </motion.tr>
                    )
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Mobile cards */}
      {!isLoading && !isError && sorted.length > 0 && isMobile && (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {sorted.map((b, i) => {
              const selectable = b.status === 'pending' || b.status === 'confirmed'
              const checked = selectedIds.has(b.id)
              return (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.2) }}
                >
                  <Card className={`p-3.5 active:bg-dark-card/60 transition-colors ${
                    checked ? 'border-gold/50' : isFreshBooking(b) ? 'border-gold/40 shadow-gold' : ''
                  }`}>
                    <div className="flex gap-2.5">
                      {selectable && (
                        <SelectBox checked={checked} onChange={() => toggleSelect(b.id)} label={`Pilih booking ${b.customerName}`} />
                      )}
                      <button
                        onClick={() => openDetail(b)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            {renderStatusBadge(b)}
                            {renderSourceBadge(b)}
                            {isFreshBooking(b) && <FreshBadge />}
                            {isSoonBooking(b, today) && <SoonBadge time={b.time} />}
                            <span className="text-[10px] text-muted font-mono">
                              #{b.id.slice(-6).toUpperCase()}
                            </span>
                          </div>
                          <span className="text-[11px] text-muted whitespace-nowrap flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            {formatDateLabel(b.date)}
                          </span>
                        </div>

                        <p className="font-semibold text-off-white text-base truncate">{b.customerName}</p>
                        {b.serviceName && (
                          <p className="text-sm text-muted mt-0.5 truncate">{b.serviceName}</p>
                        )}

                        <div className="flex items-center gap-3 mt-2 text-xs text-muted flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {b.time}
                          </span>
                          {b.barberName && (
                            <span className="flex items-center gap-1 truncate">
                              <User className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="truncate max-w-[100px]">{b.barberName}</span>
                            </span>
                          )}
                          {b.customerPhone && (
                            <span className="flex items-center gap-1 font-mono truncate">
                              <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                              <span className="truncate max-w-[110px]">{b.customerPhone}</span>
                            </span>
                          )}
                        </div>
                      </button>
                    </div>

                    <div className="mt-3 pt-3 border-t border-dark-border/60 flex items-center justify-end">
                      {renderActions(b, { compact: true })}
                    </div>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !isError && sorted.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted">
            Halaman <span className="text-off-white font-semibold">{meta?.page || page}</span> dari{' '}
            <span className="text-off-white font-semibold">{totalPages}</span>
            {meta?.total != null && (
              <> · <span className="text-off-white font-semibold">{meta.total}</span> booking</>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || isFetching}
              aria-label="Halaman sebelumnya"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm bg-dark-card border border-dark-border text-off-white hover:border-gold/40 transition disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" /> Sebelum
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isFetching}
              aria-label="Halaman berikutnya"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm bg-dark-card border border-dark-border text-off-white hover:border-gold/40 transition disabled:opacity-40"
            >
              Lanjut <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed left-3 right-3 bottom-[5.5rem] sm:left-auto sm:right-6 sm:bottom-6 z-40"
          >
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 rounded-2xl bg-dark-surface border border-gold/30 shadow-xl shadow-black/40">
              <span className="text-sm text-off-white font-semibold whitespace-nowrap">
                {selectedIds.size} dipilih
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={doBulkConfirm}
                  disabled={bulkBooking.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-sm font-semibold hover:bg-green-500/25 transition disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> Konfirmasi
                </button>
                <button
                  onClick={() => setBulkCancelOpen(true)}
                  disabled={bulkBooking.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition disabled:opacity-50"
                >
                  <XIcon className="w-4 h-4" /> Batalkan
                </button>
                <button
                  onClick={clearSelection}
                  aria-label="Bersihkan pilihan"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-dark-card border border-dark-border text-muted hover:text-off-white transition"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail modal */}
      <Modal isOpen={!!detail} onClose={closeDetail} title={detail ? `Detail Booking` : ''} size="md">
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {renderStatusBadge(detail)}
                {renderSourceBadge(detail)}
                {isFreshBooking(detail) && <FreshBadge />}
                {isSoonBooking(detail, today) && <SoonBadge time={detail.time} />}
                {detail.customer?.visitCount > 5 && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gold/15 text-gold border border-gold/30"
                    title={`Pelanggan tetap — ${detail.customer.visitCount} kunjungan`}
                  >
                    <Star className="w-2.5 h-2.5 fill-current" /> Pelanggan Tetap
                  </span>
                )}
              </div>
              <span className="text-xs text-muted font-mono">#{detail.id.slice(-6).toUpperCase()}</span>
            </div>

            <div>
              <p className="text-xs text-muted">Pelanggan</p>
              <p className="text-off-white font-semibold text-lg leading-tight">{detail.customerName}</p>
              {detail.customerPhone && (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="font-mono text-sm text-muted">{detail.customerPhone}</span>
                  <button
                    onClick={() => copyPhone(detail.customerPhone)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-dark-card text-muted hover:text-off-white border border-dark-border transition"
                  >
                    <Copy className="w-3 h-3" /> Salin
                  </button>
                  <a
                    href={waLink(detail.customerPhone, `Halo ${detail.customerName}, ini konfirmasi booking Anda di ${detail.branch?.name || ''} pada ${formatDateLabel(detail.date)} pukul ${detail.time}.`)}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition"
                  >
                    <MessageCircle className="w-3 h-3" /> WhatsApp
                  </a>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted mb-0.5">Tanggal</p>
                <p className="text-off-white">{formatDateLabel(detail.date)}</p>
                <p className="text-muted text-xs">{formatDayLabel(detail.date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted mb-0.5">Waktu</p>
                <p className="text-off-white">{detail.time}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted mb-0.5">Layanan</p>
                <p className="text-off-white">{detail.serviceName || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted mb-0.5">Barber</p>
                <p className="text-off-white">{detail.barberName || <span className="text-muted">Belum ditentukan</span>}</p>
              </div>
              {detail.branch?.name && (
                <div className="col-span-2">
                  <p className="text-xs text-muted mb-0.5">Cabang</p>
                  <p className="text-off-white">{detail.branch.name}</p>
                </div>
              )}
              {detail.notes && (
                <div className="col-span-2">
                  <p className="text-xs text-muted mb-0.5">Catatan</p>
                  <p className="text-off-white italic">"{detail.notes}"</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-dark-border">
              {detail.status === 'pending' && (
                <button
                  onClick={async () => { await doConfirm(detail); closeDetail() }}
                  disabled={updateBooking.isPending}
                  className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 font-semibold text-sm hover:bg-green-500/25 transition disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> Konfirmasi
                </button>
              )}
              {(detail.status === 'pending' || detail.status === 'confirmed') && (
                <button
                  onClick={() => setCheckInTarget(detail)}
                  className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gold/15 border border-gold/30 text-gold font-semibold text-sm hover:bg-gold/25 transition"
                >
                  <LogIn className="w-4 h-4" /> Masuk Antrian
                </button>
              )}
              {(detail.status === 'pending' || detail.status === 'confirmed') && (
                <button
                  onClick={() => setCancelTarget(detail)}
                  className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-semibold text-sm hover:bg-red-500/20 transition"
                >
                  <XIcon className="w-4 h-4" /> Batalkan
                </button>
              )}
              <button
                onClick={closeDetail}
                className="px-4 py-2.5 rounded-xl bg-dark-card border border-dark-border text-muted hover:text-off-white text-sm transition"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancel confirm */}
      <ConfirmDialog
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={doCancel}
        variant="danger"
        title="Batalkan booking?"
        description={cancelTarget ? `Booking #${cancelTarget.id.slice(-6).toUpperCase()} akan dibatalkan.` : ''}
        highlight={cancelTarget?.customerName}
        confirmText="Ya, Batalkan"
        cancelText="Tidak"
      />

      {/* Bulk cancel confirm */}
      <ConfirmDialog
        isOpen={bulkCancelOpen}
        onClose={() => setBulkCancelOpen(false)}
        onConfirm={doBulkCancel}
        variant="danger"
        title="Batalkan booking terpilih?"
        description={`${selectedIds.size} booking yang masih aktif akan dibatalkan.`}
        confirmText="Ya, Batalkan Semua"
        cancelText="Tidak"
      />

      {/* Check-in confirm */}
      <ConfirmDialog
        isOpen={!!checkInTarget}
        onClose={() => setCheckInTarget(null)}
        onConfirm={doCheckIn}
        variant="warning"
        title="Masukkan ke antrian?"
        description={
          checkInTarget
            ? `Pelanggan akan dibuatkan tiket antrian hari ini di cabang ${checkInTarget.branch?.name || ''}.`
            : ''
        }
        highlight={checkInTarget?.customerName}
        confirmText="Ya, Masuk Antrian"
        cancelText="Batal"
      />

      {/* Tambah booking modal */}
      <CreateBookingModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        branchId={user?.branchId}
        defaultDate={today}
        onCreated={() => { setShowCreate(false); setSortBy('recent'); setPage(1) }}
        onCheckedIn={() => {
          setShowCreate(false)
          navigate(`/${getBranchSlug(user)}/kasir/queue`)
        }}
        createBooking={createBooking}
        checkInBooking={checkInBooking}
      />
    </div>
  )
}

// ── Tambah booking (walk-in) modal ─────────────────────────────────────────
function CreateBookingModal({ isOpen, onClose, branchId, defaultDate, onCreated, onCheckedIn, createBooking, checkInBooking }) {
  const toast = useToast()
  // Fetch hanya saat modal terbuka — hindari request idle di background.
  const { data: services = [] } = useServices({ isActive: 'true', enabled: isOpen })
  const { data: barbers = [] } = useUsers({ role: 'barber', branchId, enabled: isOpen && !!branchId })

  const initialForm = () => ({
    customerName: '',
    customerPhone: '',
    serviceId: '',
    barberId: '',
    date: defaultDate,
    time: format(new Date(Date.now() + 30 * 60_000), 'HH:mm'),
    notes: '',
  })
  const [form, setForm] = useState(initialForm)

  useEffect(() => { if (isOpen) setForm(initialForm()) }, [isOpen, defaultDate])

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))

  // Booking untuk hari ini boleh "langsung masuk antrian" — pelanggan walk-in
  // umumnya sudah berdiri di counter. Booking tanggal lain tidak masuk akal
  // dibuatkan tiket antrian sekarang.
  const isToday = !!defaultDate && form.date === defaultDate
  const busy = createBooking.isPending || (checkInBooking?.isPending ?? false)

  // checkIn=true → buat booking lalu langsung check-in jadi tiket antrian.
  const submit = async (checkIn = false) => {
    if (busy) return
    if (!form.customerName.trim()) return toast.error('Nama pelanggan wajib diisi')
    if (!form.customerPhone.trim()) return toast.error('Nomor HP wajib diisi')
    if (!/\d{6,}/.test(form.customerPhone.replace(/\D/g, ''))) return toast.error('Nomor HP tidak valid')
    if (!form.serviceId) return toast.error('Pilih layanan')
    if (!form.date || !form.time) return toast.error('Tanggal dan waktu wajib diisi')

    const name = form.customerName.trim()
    let booking
    try {
      booking = await createBooking.mutateAsync({
        branchId,
        customerName: name,
        customerPhone: form.customerPhone.trim(),
        serviceId: form.serviceId,
        barberId: form.barberId || undefined,
        date: form.date,
        time: form.time,
        notes: form.notes.trim() || undefined,
        source: 'walk_in',
      })
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menambahkan booking')
      return
    }

    if (checkIn && booking?.id) {
      try {
        await checkInBooking.mutateAsync(booking.id)
      } catch (err) {
        // Booking sudah tersimpan — kasir tinggal check-in manual dari daftar.
        toast.error('Booking tersimpan, tapi gagal masuk antrian: ' +
          (err?.response?.data?.error || 'coba lagi dari daftar'))
        onCreated?.()
        return
      }
      toast.success(`${name} ditambahkan & masuk antrian`)
      onCheckedIn?.()
      return
    }

    toast.success(`Booking ${name} ditambahkan`)
    onCreated?.()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tambah Booking (Walk-in)" size="md">
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Nama Pelanggan *</label>
          <input
            value={form.customerName}
            onChange={e => set('customerName', e.target.value)}
            placeholder="Nama pelanggan"
            className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Nomor HP *</label>
          <input
            inputMode="tel"
            value={form.customerPhone}
            onChange={e => set('customerPhone', e.target.value)}
            placeholder="081234567890"
            className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60 transition-colors font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Layanan *</label>
          <select
            value={form.serviceId}
            onChange={e => set('serviceId', e.target.value)}
            className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60 cursor-pointer"
          >
            <option value="">Pilih layanan…</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} {s.duration ? `— ${s.duration}m` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Barber (opsional)</label>
          <select
            value={form.barberId}
            onChange={e => set('barberId', e.target.value)}
            className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60 cursor-pointer"
          >
            <option value="">Belum ditentukan</option>
            {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Tanggal</label>
            <input
              type="date"
              value={form.date}
              onChange={e => set('date', e.target.value)}
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/60"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Waktu</label>
            <input
              type="time"
              value={form.time}
              onChange={e => set('time', e.target.value)}
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/60"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1.5">Catatan (opsional)</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={2}
            placeholder="Permintaan khusus, dll."
            className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60 resize-none"
          />
        </div>
        <div className="flex flex-col gap-2 pt-2">
          {isToday && (
            <button
              onClick={() => submit(true)}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gold text-dark font-semibold text-sm hover:bg-gold-light transition disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              {busy ? 'Memproses…' : 'Simpan & Masuk Antrian'}
            </button>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="flex-1 px-4 py-2.5 rounded-xl bg-dark-card border border-dark-border text-off-white text-sm hover:border-gold/40 transition disabled:opacity-50"
            >
              Batal
            </button>
            <button
              onClick={() => submit(false)}
              disabled={busy}
              className={`flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm transition disabled:opacity-50 ${
                isToday
                  ? 'bg-dark-card border border-dark-border text-off-white hover:border-gold/40'
                  : 'bg-gold text-dark hover:bg-gold-light'
              }`}
            >
              {busy ? 'Menyimpan…' : 'Simpan Booking'}
            </button>
          </div>
          {isToday && (
            <p className="text-[11px] text-muted text-center leading-tight">
              "Masuk Antrian" membuat tiket antrian hari ini sekaligus.
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
