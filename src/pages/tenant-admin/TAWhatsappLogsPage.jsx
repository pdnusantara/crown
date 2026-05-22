import React, { useState, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  MessageSquare, RefreshCw, Download, Search, Check, CheckCheck, Clock,
  XCircle, AlertTriangle, Ban, ChevronLeft, ChevronRight, Info, Send,
} from 'lucide-react'
import { useWhatsappMessages, useWhatsappMessageStats, useResendWhatsappMessage } from '../../hooks/useWhatsappMessages.js'
import api from '../../lib/api.js'
import Card from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import { Select } from '../../components/ui/Select.jsx'
import { Modal } from '../../components/ui/Modal.jsx'
import LiveBadge from '../../components/ui/LiveBadge.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { formatDateTimeInTz } from '../../utils/timezone.js'

// ── Konfigurasi tampilan ────────────────────────────────────────────────────
// Warna pakai shade -400 (punya light-mode override di index.css) supaya aman
// di tema terang & gelap.
const STATUS_CFG = {
  queued:    { label: 'Antre',    icon: Clock,      cls: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  sent:      { label: 'Terkirim', icon: Check,      cls: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  delivered: { label: 'Sampai',   icon: CheckCheck, cls: 'text-green-400 bg-green-400/10 border-green-400/20' },
  read:      { label: 'Dibaca',   icon: CheckCheck, cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  failed:    { label: 'Gagal',    icon: XCircle,    cls: 'text-red-400 bg-red-400/10 border-red-400/20' },
  skipped:   { label: 'Dilewati', icon: Ban,        cls: 'text-muted bg-dark-card border-dark-border' },
}
const CATEGORY_LABEL = {
  transaction_admin: 'Notif transaksi · admin',
  transaction_customer: 'Notif transaksi · pelanggan',
  rating: 'Link rating',
  test: 'Pesan tes',
  system: 'Sistem',
}
const REASON_LABEL = {
  not_connected: 'WhatsApp tidak tersambung',
  invalid_phone: 'Nomor tidak valid',
  disabled: 'Notifikasi dimatikan',
  gateway_error: 'Gateway gagal merespons',
}

const STATUS_OPTIONS = [
  { value: '', label: 'Semua status' },
  { value: 'sent', label: 'Terkirim' },
  { value: 'delivered', label: 'Sampai' },
  { value: 'read', label: 'Dibaca' },
  { value: 'failed', label: 'Gagal' },
  { value: 'queued', label: 'Antre' },
]
const CATEGORY_OPTIONS = [
  { value: '', label: 'Semua jenis' },
  { value: 'transaction_admin', label: 'Notif transaksi · admin' },
  { value: 'transaction_customer', label: 'Notif transaksi · pelanggan' },
  { value: 'rating', label: 'Link rating' },
  { value: 'test', label: 'Pesan tes' },
  { value: 'system', label: 'Sistem' },
]

const PAGE_LIMIT = 25
const csvEscape = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const reasonText = (r) => (r ? (REASON_LABEL[r] || r) : '')

function KpiCard({ label, value, sub, accent = 'text-off-white' }) {
  return (
    <div className="rounded-xl border border-dark-border bg-dark-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accent}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.skipped
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      <Icon size={11} /> {cfg.label}
    </span>
  )
}

export default function TAWhatsappLogsPage() {
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [resendTarget, setResendTarget] = useState(null)
  const [resendPhone, setResendPhone] = useState('')
  const toast = useToast()
  const resend = useResendWhatsappMessage()

  // Debounce kotak cari nomor.
  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput.trim()); setPage(1) }, 400)
    return () => clearTimeout(id)
  }, [searchInput])

  // Filter berubah → kembali ke halaman 1.
  useEffect(() => { setPage(1) }, [status, category, from, to])

  const listParams = useMemo(() => ({
    status: status || undefined,
    category: category || undefined,
    search: search || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    limit: PAGE_LIMIT,
  }), [status, category, search, from, to, page])

  const statsRange = useMemo(() => ({ from: from || undefined, to: to || undefined }), [from, to])

  const { data, isLoading, isError, refetch, isFetching } = useWhatsappMessages(listParams)
  const stats = useWhatsappMessageStats(statsRange)

  const items = data?.data || []
  const total = data?.total || 0
  const totalPages = data?.totalPages || 1
  const s = stats.data || {}

  const hasFilter = !!(status || category || search || from || to)
  const resetFilters = () => { setStatus(''); setCategory(''); setSearchInput(''); setSearch(''); setFrom(''); setTo('') }

  // ── Kirim ulang ───────────────────────────────────────────────────────────
  const openResend = (m) => { setResendTarget(m); setResendPhone(m.recipient || '') }
  const closeResend = () => { if (!resend.isPending) { setResendTarget(null); setResendPhone('') } }
  const confirmResend = async () => {
    if (!resendTarget) return
    const phone = resendPhone.trim()
    const changed = phone && phone !== resendTarget.recipient
    try {
      await resend.mutateAsync({ id: resendTarget.id, recipient: changed ? phone : undefined })
      toast.success('Pesan dikirim ulang')
      setResendTarget(null); setResendPhone('')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Gagal mengirim ulang pesan')
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await api.get('/whatsapp/messages', { params: { ...listParams, page: 1, limit: 1000 } })
      const rows = (res.data?.data?.data || []).map((m) => [
        formatDateTimeInTz(m.createdAt),
        CATEGORY_LABEL[m.category] || m.category,
        m.recipient,
        STATUS_CFG[m.status]?.label || m.status,
        reasonText(m.reason),
        (m.preview || '').replace(/\s+/g, ' '),
      ])
      const header = ['Waktu', 'Jenis', 'Nomor', 'Status', 'Keterangan', 'Pesan']
      const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n')
      const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pesan-wa-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* abaikan */ } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-off-white">Pesan WhatsApp</h1>
            <LiveBadge className="hidden sm:inline-flex" />
          </div>
          <p className="text-muted text-sm mt-1">Pantau status pengiriman notifikasi WhatsApp ke admin & pelanggan.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Muat ulang"
            title="Muat ulang"
            className="p-2 rounded-lg border border-dark-border text-muted hover:text-off-white hover:bg-dark-card transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExport} disabled={exporting || total === 0}>
            {exporting ? 'Menyiapkan...' : 'Ekspor CSV'}
          </Button>
        </div>
      </div>

      {/* Penjelasan status */}
      <div className="flex items-start gap-2 p-3 rounded-xl border border-blue-400/20 bg-blue-400/5">
        <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted leading-relaxed">
          <span className="text-off-white font-medium">Terkirim</span> = diterima server WhatsApp ·{' '}
          <span className="text-off-white font-medium">Sampai</span> = masuk ke HP pelanggan ·{' '}
          <span className="text-off-white font-medium">Gagal</span> = tidak terkirim (cek keterangannya).
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Pesan" value={s.total ?? 0} sub="pada rentang dipilih" />
        <KpiCard label="Berhasil" value={s.success ?? 0} sub={`${s.successRate ?? 0}% tingkat sukses`} accent="text-green-400" />
        <KpiCard label="Sampai ke HP" value={s.delivered ?? 0} sub="delivered / dibaca" accent="text-emerald-400" />
        <KpiCard label="Gagal" value={s.failed ?? 0} sub="perlu ditinjau" accent="text-red-400" />
      </div>

      {/* Filter */}
      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <label className="block text-sm font-medium text-muted mb-1.5">Cari nomor</label>
            <Search size={15} className="absolute left-3 bottom-2.5 text-muted pointer-events-none" />
            <input
              type="text"
              inputMode="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="0812..."
              className="w-full appearance-none rounded-lg border border-dark-border bg-dark-surface pl-9 pr-3 py-2 text-sm text-off-white placeholder-muted focus:outline-none focus:border-gold/50"
            />
          </div>
          <div className="w-[150px]">
            <Select label="Status" options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} placeholder={null} />
          </div>
          <div className="w-[190px]">
            <Select label="Jenis" options={CATEGORY_OPTIONS} value={category} onChange={(e) => setCategory(e.target.value)} placeholder={null} />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">Dari</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to || undefined}
              className="appearance-none rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-sm text-off-white focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">Sampai</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined}
              className="appearance-none rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-sm text-off-white focus:outline-none focus:border-gold/50" />
          </div>
          {hasFilter && (
            <button type="button" onClick={resetFilters} className="text-xs text-muted hover:text-off-white underline py-2">
              Reset filter
            </button>
          )}
        </div>
      </Card>

      {/* List */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-dark-card animate-pulse" />)}
        </div>
      )}

      {!isLoading && isError && (
        <Card className="p-10 text-center border-red-400/30 bg-red-400/5">
          <AlertTriangle className="w-9 h-9 text-red-400 mx-auto mb-3" />
          <p className="text-off-white font-medium">Gagal memuat log pesan</p>
          <p className="text-muted text-sm mt-1">Periksa koneksi lalu coba lagi.</p>
          <Button size="sm" className="mt-4" icon={RefreshCw} variant="secondary" onClick={() => refetch()}>Coba Lagi</Button>
        </Card>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <Card className="p-12 text-center">
          <MessageSquare className="w-10 h-10 text-muted/30 mx-auto mb-3" />
          <p className="text-off-white font-medium">{hasFilter ? 'Tidak ada pesan sesuai filter' : 'Belum ada pesan terkirim'}</p>
          <p className="text-muted text-sm mt-1">
            {hasFilter ? 'Coba ubah atau reset filter.' : 'Pesan WhatsApp yang dikirim sistem akan muncul di sini.'}
          </p>
        </Card>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <div className="space-y-2">
          {items.map((m, i) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.2) }}>
              <div className="rounded-xl border border-dark-border bg-dark-card p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={m.status} />
                      <span className="text-xs text-muted">{CATEGORY_LABEL[m.category] || m.category}</span>
                    </div>
                    <p className="text-sm text-off-white font-medium mt-1.5 font-mono">{m.recipient}</p>
                    {m.preview && <p className="text-xs text-muted mt-1 line-clamp-2 leading-snug">{m.preview}</p>}
                    {m.status === 'failed' && m.reason && (
                      <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
                        <AlertTriangle size={11} className="flex-shrink-0" /> {reasonText(m.reason)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="text-[11px] text-muted whitespace-nowrap">{formatDateTimeInTz(m.createdAt)}</span>
                    {(m.status === 'failed' || m.status === 'skipped') && m.body && (
                      <button
                        type="button"
                        onClick={() => openResend(m)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg border border-gold/30 text-gold hover:bg-gold/10 transition-colors"
                      >
                        <Send size={11} /> Kirim ulang
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !isError && total > PAGE_LIMIT && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted">
            Halaman {page} dari {totalPages} · {total} pesan
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isFetching}
              className="p-2 rounded-lg border border-dark-border text-muted hover:text-off-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isFetching}
              className="p-2 rounded-lg border border-dark-border text-muted hover:text-off-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modal kirim ulang */}
      <Modal isOpen={!!resendTarget} onClose={closeResend} title="Kirim ulang pesan" size="md">
        {resendTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-400/20 bg-amber-400/5">
              <Info size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted leading-relaxed">
                Pesan dikirim ulang dengan isi yang sama. Pastikan WhatsApp toko <span className="text-off-white font-medium">tersambung</span> (tab WhatsApp Beta) — bila putus, pengiriman akan gagal lagi.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">Nomor tujuan</label>
              <input
                type="tel"
                inputMode="numeric"
                value={resendPhone}
                onChange={(e) => setResendPhone(e.target.value)}
                placeholder="08xxx / 62xxx"
                className="w-full appearance-none rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-sm text-off-white placeholder-muted focus:outline-none focus:border-gold/50 font-mono"
              />
              <p className="text-[11px] text-muted mt-1">Bisa diubah bila nomor sebelumnya keliru.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">Isi pesan</label>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-xs text-off-white whitespace-pre-wrap leading-relaxed">
                {resendTarget.body || resendTarget.preview}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={closeResend} disabled={resend.isPending}>Batal</Button>
              <Button size="sm" icon={Send} onClick={confirmResend} disabled={resend.isPending || !resendPhone.trim()}>
                {resend.isPending ? 'Mengirim...' : 'Kirim ulang'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
