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
import { useTranslation } from 'react-i18next'
import { formatDateTimeInTz } from '../../utils/timezone.js'

// ── Konfigurasi tampilan ────────────────────────────────────────────────────
// Warna pakai shade -400 (punya light-mode override di index.css) supaya aman
// di tema terang & gelap.
const STATUS_CFG = {
  queued:    { labelKey: 'tenantAdmin.whatsappLogs.statusQueued',    icon: Clock,      cls: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  sent:      { labelKey: 'tenantAdmin.whatsappLogs.statusSent',      icon: Check,      cls: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  delivered: { labelKey: 'tenantAdmin.whatsappLogs.statusDelivered', icon: CheckCheck, cls: 'text-green-400 bg-green-400/10 border-green-400/20' },
  read:      { labelKey: 'tenantAdmin.whatsappLogs.statusRead',      icon: CheckCheck, cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
  failed:    { labelKey: 'tenantAdmin.whatsappLogs.statusFailed',    icon: XCircle,    cls: 'text-red-400 bg-red-400/10 border-red-400/20' },
  skipped:   { labelKey: 'tenantAdmin.whatsappLogs.statusSkipped',   icon: Ban,        cls: 'text-muted bg-dark-card border-dark-border' },
}
const CATEGORY_LABEL_KEY = {
  transaction_admin: 'tenantAdmin.whatsappLogs.categoryTransactionAdmin',
  transaction_customer: 'tenantAdmin.whatsappLogs.categoryTransactionCustomer',
  rating: 'tenantAdmin.whatsappLogs.categoryRating',
  test: 'tenantAdmin.whatsappLogs.categoryTest',
  system: 'tenantAdmin.whatsappLogs.categorySystem',
}
const REASON_LABEL_KEY = {
  not_connected: 'tenantAdmin.whatsappLogs.reasonNotConnected',
  invalid_phone: 'tenantAdmin.whatsappLogs.reasonInvalidPhone',
  disabled: 'tenantAdmin.whatsappLogs.reasonDisabled',
  gateway_error: 'tenantAdmin.whatsappLogs.reasonGatewayError',
}

const PAGE_LIMIT = 25
const csvEscape = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const reasonText = (r, t) => (r ? (REASON_LABEL_KEY[r] ? t(REASON_LABEL_KEY[r]) : r) : '')
const categoryLabel = (c, t) => (CATEGORY_LABEL_KEY[c] ? t(CATEGORY_LABEL_KEY[c]) : c)
const statusLabel = (st, t) => (STATUS_CFG[st]?.labelKey ? t(STATUS_CFG[st].labelKey) : st)

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
  const { t } = useTranslation()
  const cfg = STATUS_CFG[status] || STATUS_CFG.skipped
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      <Icon size={11} /> {statusLabel(status in STATUS_CFG ? status : 'skipped', t)}
    </span>
  )
}

export default function TAWhatsappLogsPage() {
  const { t } = useTranslation()
  const STATUS_OPTIONS = [
    { value: '', label: t('tenantAdmin.whatsappLogs.allStatuses') },
    { value: 'sent', label: t('tenantAdmin.whatsappLogs.statusSent') },
    { value: 'delivered', label: t('tenantAdmin.whatsappLogs.statusDelivered') },
    { value: 'read', label: t('tenantAdmin.whatsappLogs.statusRead') },
    { value: 'failed', label: t('tenantAdmin.whatsappLogs.statusFailed') },
    { value: 'queued', label: t('tenantAdmin.whatsappLogs.statusQueued') },
  ]
  const CATEGORY_OPTIONS = [
    { value: '', label: t('tenantAdmin.whatsappLogs.allCategories') },
    { value: 'transaction_admin', label: t('tenantAdmin.whatsappLogs.categoryTransactionAdmin') },
    { value: 'transaction_customer', label: t('tenantAdmin.whatsappLogs.categoryTransactionCustomer') },
    { value: 'rating', label: t('tenantAdmin.whatsappLogs.categoryRating') },
    { value: 'test', label: t('tenantAdmin.whatsappLogs.categoryTest') },
    { value: 'system', label: t('tenantAdmin.whatsappLogs.categorySystem') },
  ]
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
  const [resendMsg, setResendMsg] = useState('')
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
  const openResend = (m) => { setResendTarget(m); setResendPhone(m.recipient || ''); setResendMsg(m.body || m.preview || '') }
  const closeResend = () => { if (!resend.isPending) { setResendTarget(null); setResendPhone(''); setResendMsg('') } }
  const confirmResend = async () => {
    if (!resendTarget) return
    const phone = resendPhone.trim()
    const msg = resendMsg.trim()
    if (!msg) { toast.error(t('tenantAdmin.whatsappLogs.messageEmpty')); return }
    const phoneChanged = phone && phone !== resendTarget.recipient
    try {
      await resend.mutateAsync({ id: resendTarget.id, recipient: phoneChanged ? phone : undefined, message: msg })
      toast.success(t('tenantAdmin.whatsappLogs.resentSuccess'))
      setResendTarget(null); setResendPhone(''); setResendMsg('')
    } catch (e) {
      toast.error(e?.response?.data?.error || t('tenantAdmin.whatsappLogs.resendFailed'))
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await api.get('/whatsapp/messages', { params: { ...listParams, page: 1, limit: 1000 } })
      const rows = (res.data?.data?.data || []).map((m) => [
        formatDateTimeInTz(m.createdAt),
        categoryLabel(m.category, t),
        m.recipient,
        statusLabel(m.status, t),
        reasonText(m.reason, t),
        (m.preview || '').replace(/\s+/g, ' '),
      ])
      const header = [
        t('tenantAdmin.whatsappLogs.csvTime'),
        t('tenantAdmin.whatsappLogs.csvType'),
        t('tenantAdmin.whatsappLogs.csvNumber'),
        t('tenantAdmin.whatsappLogs.csvStatus'),
        t('tenantAdmin.whatsappLogs.csvReason'),
        t('tenantAdmin.whatsappLogs.csvMessage'),
      ]
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
            <h1 className="font-display text-2xl font-bold text-off-white">{t('tenantAdmin.whatsappLogs.title')}</h1>
            <LiveBadge className="hidden sm:inline-flex" />
          </div>
          <p className="text-muted text-sm mt-1">{t('tenantAdmin.whatsappLogs.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label={t('tenantAdmin.whatsappLogs.reload')}
            title={t('tenantAdmin.whatsappLogs.reload')}
            className="p-2 rounded-lg border border-dark-border text-muted hover:text-off-white hover:bg-dark-card transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExport} disabled={exporting || total === 0}>
            {exporting ? t('tenantAdmin.whatsappLogs.preparing') : t('tenantAdmin.whatsappLogs.exportCsv')}
          </Button>
        </div>
      </div>

      {/* Penjelasan status */}
      <div className="flex items-start gap-2 p-3 rounded-xl border border-blue-400/20 bg-blue-400/5">
        <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted leading-relaxed">
          <span className="text-off-white font-medium">{t('tenantAdmin.whatsappLogs.statusSent')}</span> = {t('tenantAdmin.whatsappLogs.explainSent')} ·{' '}
          <span className="text-off-white font-medium">{t('tenantAdmin.whatsappLogs.statusDelivered')}</span> = {t('tenantAdmin.whatsappLogs.explainDelivered')} ·{' '}
          <span className="text-off-white font-medium">{t('tenantAdmin.whatsappLogs.statusFailed')}</span> = {t('tenantAdmin.whatsappLogs.explainFailed')}
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label={t('tenantAdmin.whatsappLogs.kpiTotal')} value={s.total ?? 0} sub={t('tenantAdmin.whatsappLogs.kpiTotalSub')} />
        <KpiCard label={t('tenantAdmin.whatsappLogs.kpiSuccess')} value={s.success ?? 0} sub={t('tenantAdmin.whatsappLogs.kpiSuccessSub', { rate: s.successRate ?? 0 })} accent="text-green-400" />
        <KpiCard label={t('tenantAdmin.whatsappLogs.kpiDelivered')} value={s.delivered ?? 0} sub={t('tenantAdmin.whatsappLogs.kpiDeliveredSub')} accent="text-emerald-400" />
        <KpiCard label={t('tenantAdmin.whatsappLogs.kpiFailed')} value={s.failed ?? 0} sub={t('tenantAdmin.whatsappLogs.kpiFailedSub')} accent="text-red-400" />
      </div>

      {/* Filter */}
      <Card className="p-3">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
          <div className="relative col-span-2 sm:flex-1 sm:min-w-[180px]">
            <label className="block text-sm font-medium text-muted mb-1.5">{t('tenantAdmin.whatsappLogs.searchNumber')}</label>
            <Search size={15} className="absolute left-3 bottom-2.5 text-muted pointer-events-none" />
            <input
              type="text"
              inputMode="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="0812..."
              className="w-full appearance-none rounded-lg border border-dark-border bg-dark-surface pl-9 pr-3 py-2 text-sm text-off-white placeholder-muted focus:outline-none focus:border-brand/50"
            />
          </div>
          <div className="col-span-1 sm:w-[150px]">
            <Select label={t('common.status')} options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} placeholder={null} />
          </div>
          <div className="col-span-1 sm:w-[190px]">
            <Select label={t('tenantAdmin.whatsappLogs.type')} options={CATEGORY_OPTIONS} value={category} onChange={(e) => setCategory(e.target.value)} placeholder={null} />
          </div>
          <div className="col-span-1 sm:w-auto">
            <label className="block text-sm font-medium text-muted mb-1.5">{t('common.from')}</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to || undefined}
              className="w-full appearance-none rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-sm text-off-white focus:outline-none focus:border-brand/50" />
          </div>
          <div className="col-span-1 sm:w-auto">
            <label className="block text-sm font-medium text-muted mb-1.5">{t('common.to')}</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined}
              className="w-full appearance-none rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-sm text-off-white focus:outline-none focus:border-brand/50" />
          </div>
          {hasFilter && (
            <button type="button" onClick={resetFilters} className="col-span-2 sm:w-auto text-left text-xs text-muted hover:text-off-white underline py-1 sm:py-2">
              {t('tenantAdmin.whatsappLogs.resetFilter')}
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
          <p className="text-off-white font-medium">{t('tenantAdmin.whatsappLogs.loadFailed')}</p>
          <p className="text-muted text-sm mt-1">{t('tenantAdmin.whatsappLogs.loadFailedHint')}</p>
          <Button size="sm" className="mt-4" icon={RefreshCw} variant="secondary" onClick={() => refetch()}>{t('common.retry')}</Button>
        </Card>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <Card className="p-12 text-center">
          <MessageSquare className="w-10 h-10 text-muted/30 mx-auto mb-3" />
          <p className="text-off-white font-medium">{hasFilter ? t('tenantAdmin.whatsappLogs.emptyFiltered') : t('tenantAdmin.whatsappLogs.emptyNone')}</p>
          <p className="text-muted text-sm mt-1">
            {hasFilter ? t('tenantAdmin.whatsappLogs.emptyFilteredHint') : t('tenantAdmin.whatsappLogs.emptyNoneHint')}
          </p>
        </Card>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <div className="space-y-2">
          {items.map((m, i) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.2) }}>
              <div className="rounded-xl border border-dark-border bg-dark-card p-3.5">
                {/* Baris atas: status + waktu */}
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={m.status} />
                  <span className="text-[11px] text-muted whitespace-nowrap flex-shrink-0">{formatDateTimeInTz(m.createdAt)}</span>
                </div>
                {/* Nomor tujuan + jenis */}
                <p className="text-sm text-off-white font-semibold mt-2 font-mono truncate">{m.recipient}</p>
                <p className="text-[11px] text-muted mt-0.5">{categoryLabel(m.category, t)}</p>
                {m.preview && <p className="text-xs text-muted mt-1.5 line-clamp-2 leading-snug">{m.preview}</p>}
                {m.status === 'failed' && m.reason && (
                  <p className="text-[11px] text-red-400 mt-1.5 flex items-center gap-1">
                    <AlertTriangle size={11} className="flex-shrink-0" /> {reasonText(m.reason, t)}
                  </p>
                )}
                {(m.status === 'failed' || m.status === 'skipped') && (
                  <div className="mt-2.5 pt-2.5 border-t border-dark-border/60 flex justify-end">
                    <button
                      type="button"
                      onClick={() => openResend(m)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand hover:bg-brand/10 transition-colors"
                    >
                      <Send size={12} /> {t('tenantAdmin.whatsappLogs.resend')}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !isError && total > PAGE_LIMIT && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted">
            {t('tenantAdmin.whatsappLogs.pageInfo', { page, totalPages, total })}
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
      <Modal isOpen={!!resendTarget} onClose={closeResend} title={t('tenantAdmin.whatsappLogs.resendTitle')} size="md">
        {resendTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-400/20 bg-amber-400/5">
              <Info size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted leading-relaxed">
                {t('tenantAdmin.whatsappLogs.resendNotePre')}<span className="text-off-white font-medium">{t('tenantAdmin.whatsappLogs.resendNoteBold')}</span>{t('tenantAdmin.whatsappLogs.resendNotePost')}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">{t('tenantAdmin.whatsappLogs.recipientNumber')}</label>
              <input
                type="tel"
                inputMode="numeric"
                value={resendPhone}
                onChange={(e) => setResendPhone(e.target.value)}
                placeholder="08xxx / 62xxx"
                className="w-full appearance-none rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-sm text-off-white placeholder-muted focus:outline-none focus:border-brand/50 font-mono"
              />
              <p className="text-[11px] text-muted mt-1">{t('tenantAdmin.whatsappLogs.recipientHint')}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">{t('tenantAdmin.whatsappLogs.messageBody')}</label>
              <textarea
                value={resendMsg}
                onChange={(e) => setResendMsg(e.target.value)}
                rows={6}
                maxLength={4096}
                className="w-full appearance-none rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-xs text-off-white placeholder-muted focus:outline-none focus:border-brand/50 whitespace-pre-wrap leading-relaxed resize-y"
              />
              {!resendTarget.body && (
                <p className="text-[11px] text-amber-400 mt-1 flex items-start gap-1">
                  <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                  {t('tenantAdmin.whatsappLogs.legacyBodyWarning')}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={closeResend} disabled={resend.isPending}>{t('common.cancel')}</Button>
              <Button size="sm" icon={Send} onClick={confirmResend} disabled={resend.isPending || !resendPhone.trim() || !resendMsg.trim()}>
                {resend.isPending ? t('tenantAdmin.whatsappLogs.sending') : t('tenantAdmin.whatsappLogs.resend')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
