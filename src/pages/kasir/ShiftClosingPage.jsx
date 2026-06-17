import React, { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
  LogOut, DollarSign, Receipt, TrendingUp, CheckCircle, Download, Clock,
  Wallet, AlertTriangle, Printer, Plus, Calendar, ChevronLeft, ChevronRight,
  Users, History, RefreshCw, Loader2, ArrowDownCircle, Trash2,
} from 'lucide-react'
import { format, differenceInMinutes } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore.js'
import {
  useActiveShift, useCloseShift, useOpenShift, useShiftSummary, useShifts, useShiftCashOut,
} from '../../hooks/useShifts.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import LiveBadge from '../../components/ui/LiveBadge.jsx'
import ErrorBoundary from '../../components/ui/ErrorBoundary.jsx'
import { formatRupiah, formatRupiahShort } from '../../utils/format.js'
import { getBranchSlug } from '../../utils/branchSlug.js'
import { formatInTenantTz, formatTimeInTz, formatDateTimeInTz, formatDateInTz } from '../../utils/timezone.js'

// ── helpers ────────────────────────────────────────────────────────────────
// label di-resolve via t() (pos.method*); icon tetap di sini.
const PAYMENT_LABEL = {
  cash:     { labelKey: 'pos.methodCash',     icon: '💵' },
  transfer: { labelKey: 'pos.methodTransfer', icon: '🏦' },
  qris:     { labelKey: 'pos.methodQris',     icon: '📱' },
  card:     { labelKey: 'pos.methodCard',     icon: '💳' },
}

function durationLabel(start, end, t) {
  if (!start) return '0m'
  const mins = Math.max(0, differenceInMinutes(end || new Date(), new Date(start)))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return t ? t('shift.durationMinShort', { minutes: m }) : `${m}m`
  return t ? t('shift.durationFormat', { hours: h, minutes: m }) : `${h}j ${m}m`
}

// Tanggal lengkap di TZ tenant — "Jumat, 16 Mei 2026".
function fullDateLabel(date) {
  return formatInTenantTz(date, { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })
}

// CSV cell escaper.
function escapeCsv(v) {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}


// ── Shift status pill — "Online" saat shift aktif, "Offline" saat tidak ─────
// Penanda cepat apakah cabang sedang siap menerima transaksi.
function ShiftStatusBadge({ active, className = '' }) {
  const { t } = useTranslation()
  return (
    <span
      role="status"
      title={active ? t('shift.statusActiveTitle') : t('shift.statusInactiveTitle')}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
        active
          ? 'border-green-400/30 bg-green-400/10 text-green-300'
          : 'border-slate-500/30 bg-slate-500/10 text-slate-400'
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`}
      />
      {active ? t('shift.online') : t('shift.offline')}
    </span>
  )
}

// ── No active shift screen ─────────────────────────────────────────────────
function OpenShiftScreen({ branchId, branchName }) {
  const { t } = useTranslation()
  const [openingCash, setOpeningCash] = useState('')
  const [notes, setNotes] = useState('')
  const openShift = useOpenShift()
  const toast = useToast()

  const submit = async () => {
    if (openShift.isPending) return
    try {
      await openShift.mutateAsync({
        branchId,
        openingCash: parseInt(openingCash || '0', 10) || 0,
        notes: notes.trim() || undefined,
      })
      toast.success(t('shift.shiftOpened'))
      setOpeningCash('')
      setNotes('')
    } catch (err) {
      toast.error(err?.response?.data?.error || t('shift.openFailed'))
    }
  }

  return (
    <div className="max-w-md mx-auto py-6 sm:py-12">
      <Card className="p-6 sm:p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-brand/10 border border-brand/30 flex items-center justify-center mx-auto mb-4">
          <Wallet className="w-7 h-7 text-brand" />
        </div>
        <div className="flex justify-center mb-3">
          <ShiftStatusBadge active={false} />
        </div>
        <h2 className="font-display text-xl sm:text-2xl font-bold text-off-white mb-1">
          {t('shift.noActiveShift')}
        </h2>
        <p className="text-muted text-sm mb-6">
          {t('shift.openShiftPrompt', { branch: branchName || t('shift.thisBranch') })}
        </p>

        <div className="space-y-3 text-left">
          <div>
            <label htmlFor="opening-cash" className="block text-xs font-medium text-muted mb-1.5">{t('shift.openingCashRp')}</label>
            <input
              id="opening-cash"
              inputMode="numeric"
              value={openingCash}
              onChange={e => setOpeningCash(e.target.value.replace(/\D/g, '').slice(0, 12))}
              placeholder="0"
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand/60 transition-colors font-mono"
            />
            {openingCash && (
              <p className="text-xs text-muted mt-1">
                {formatRupiah(parseInt(openingCash || '0', 10) || 0)}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="opening-notes" className="block text-xs font-medium text-muted mb-1.5">{t('shift.notesOptional')}</label>
            <textarea
              id="opening-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={t('shift.openNotesPlaceholder')}
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand/60 transition-colors resize-none"
            />
          </div>
        </div>

        <Button
          fullWidth
          icon={Plus}
          onClick={submit}
          disabled={openShift.isPending}
          className="mt-6"
        >
          {openShift.isPending ? t('shift.opening') : t('shift.openShiftNow')}
        </Button>
      </Card>
    </div>
  )
}

// ── KPI tile (responsive nominal) ──────────────────────────────────────────
function Kpi({ icon: Icon, label, value, valueShort, color = 'text-off-white' }) {
  return (
    <Card className="p-3 sm:p-4 min-w-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${color} flex-shrink-0`} />
        <span className="text-[10px] sm:text-xs text-muted truncate">{label}</span>
      </div>
      <p className="font-bold text-off-white text-base sm:text-lg lg:text-xl truncate" title={typeof value === 'string' ? value : ''}>
        {valueShort != null ? (
          <>
            <span className="sm:hidden">{valueShort}</span>
            <span className="hidden sm:inline">{value}</span>
          </>
        ) : value}
      </p>
    </Card>
  )
}

// ── error screen ───────────────────────────────────────────────────────────
function LoadErrorScreen({ onRetry }) {
  const { t } = useTranslation()
  return (
    <div className="max-w-md mx-auto py-10 sm:py-16">
      <Card className="p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <h2 className="font-display text-lg sm:text-xl font-bold text-off-white mb-1">
          {t('shift.loadErrorTitle')}
        </h2>
        <p className="text-muted text-sm mb-5">
          {t('shift.loadErrorHint')}
        </p>
        <Button icon={RefreshCw} onClick={onRetry}>{t('shift.retry')}</Button>
      </Card>
    </div>
  )
}

// ── main component ─────────────────────────────────────────────────────────
function ShiftClosingPageInner() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useTranslation()

  const {
    data: activeShift, isLoading: loadingActive, isError: activeError, refetch: refetchActive,
  } = useActiveShift(user?.branchId)
  const shiftId = activeShift?.id

  const {
    data: payload, isFetching, isError: summaryError,
  } = useShiftSummary(shiftId)

  const closeShift = useCloseShift()
  const cashOut = useShiftCashOut(shiftId)

  // Form state for closing
  const [closingCash, setClosingCash] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [closedShift, setClosedShift] = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  // Form state untuk "Kas Keluar" (pengeluaran tunai shift)
  const [showCashOut, setShowCashOut] = useState(false)
  const [coAmount, setCoAmount] = useState('')
  const [coDesc, setCoDesc] = useState('')
  const [coNote, setCoNote] = useState('')

  // Ticker 60s — durasi shift ikut hidup di antara refetch.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // Reset closed-screen state if user opens a new shift
  useEffect(() => { if (activeShift?.status === 'open') setClosedShift(null) }, [activeShift?.id, activeShift?.status])

  // ── derived values ───────────────────────────────────────────────────────
  const shift   = payload?.shift
  const summary = payload?.summary

  const totalRevenue      = summary?.totalRevenue ?? activeShift?.totalRevenue ?? 0
  const totalTransactions = summary?.totalTransactions ?? activeShift?.totalTransactions ?? 0
  const totalCash         = summary?.totalCash ?? 0
  const openingCash       = shift?.openingCash ?? activeShift?.openingCash ?? 0
  const cashOutRows       = summary?.cashOut || []
  const totalCashOut      = summary?.totalCashOut ?? 0
  const expectedCash      = (openingCash || 0) + (totalCash || 0) - (totalCashOut || 0)
  const closingCashNum    = parseInt(closingCash || '0', 10) || 0
  const avgPerTx          = totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0

  const paymentRows = useMemo(() => {
    const map = summary?.paymentBreakdown || {}
    return Object.values(map)
      .map(p => {
        const meta = PAYMENT_LABEL[p.method]
        return { ...p, label: meta ? t(meta.labelKey) : p.method, icon: meta?.icon || '•' }
      })
      .sort((a, b) => b.amount - a.amount)
  }, [summary, t])

  const topServices  = summary?.topServices  || []
  const barberRows   = summary?.barberSummary || []
  // summary gagal/belum dimuat → totalCash fallback ke 0, jadi "Kas Diharapkan"
  // & selisih TIDAK valid. Jangan hitung selisih dan jangan izinkan tutup shift
  // sampai ringkasan benar-benar siap.
  const summaryReady = !!summary && !summaryError
  const variance     = (summaryReady && closingCash !== '') ? closingCashNum - expectedCash : null

  // ── actions ──────────────────────────────────────────────────────────────
  const handleClose = async () => {
    if (!shiftId || closeShift.isPending) return
    try {
      const res = await closeShift.mutateAsync({
        id: shiftId,
        branchId: user?.branchId,
        closingCash: closingCash !== '' ? closingCashNum : undefined,
        notes: closeNotes.trim() || undefined,
      })
      setClosedShift({ ...res, summary })
      setShowConfirm(false)
      setClosingCash('')
      setCloseNotes('')
      toast.success(t('shift.closedSuccessToast'))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('shift.closeFailed'))
    }
  }

  // Kuick-pick keterangan umum kas keluar — isi cepat tanpa ngetik.
  const cashOutPresets = [t('shift.cashOutPresetBusker'), t('shift.cashOutPresetParking'), t('shift.cashOutPresetConsumption'), t('shift.cashOutPresetOther')]

  const resetCashOutForm = () => { setCoAmount(''); setCoDesc(''); setCoNote('') }

  const handleAddCashOut = async () => {
    const amount = parseInt(coAmount || '0', 10) || 0
    const description = coDesc.trim()
    if (amount <= 0) { toast.error(t('shift.cashOutAmountRequired')); return }
    if (!description) { toast.error(t('shift.cashOutDescRequired')); return }
    try {
      await cashOut.add.mutateAsync({ amount, description, note: coNote.trim() || undefined })
      resetCashOutForm()
      setShowCashOut(false)
      toast.success(t('shift.cashOutAdded'))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('shift.cashOutFailed'))
    }
  }

  const handleDeleteCashOut = async (id) => {
    try {
      await cashOut.remove.mutateAsync(id)
      toast.success(t('shift.cashOutDeleted'))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('shift.cashOutFailed'))
    }
  }

  const handlePrint = () => window.print()

  const handleExport = () => {
    if (!summaryReady || !shift) {
      toast.error(t('shift.dataNotReady'))
      return
    }
    const rows = [
      [t('shift.exportTitle')],
      [t('shift.tableBranch'), shift.branchName || ''],
      [t('shift.cashierLabel'), shift.kasirName || user?.name || ''],
      [t('shift.openedLabel'), formatDateTimeInTz(shift.openedAt)],
      [t('shift.closedLabel'), shift.closedAt ? formatDateTimeInTz(shift.closedAt) : '—'],
      [],
      [t('shift.exportSummaryHeaderPlain')],
      [t('shift.totalTransactions'), totalTransactions],
      [t('shift.totalRevenue'), totalRevenue],
      [t('shift.avgPerTransaction'), avgPerTx],
      [],
      [t('shift.cashHeader')],
      [t('shift.openCash'), openingCash],
      [t('shift.cashIn'), totalCash],
      [t('shift.cashOutTitle'), totalCashOut ? -totalCashOut : 0],
      ...cashOutRows.map(c => [`  • ${c.description}`, -c.amount]),
      [t('shift.expectedCash'), expectedCash],
      [t('shift.actualCash'), shift.closingCash != null ? shift.closingCash : ''],
      [t('shift.diff'), shift.cashDifference != null ? shift.cashDifference : ''],
      [],
      [t('shift.exportPaymentHeaderPlain'), t('common.amount'), t('common.transactions')],
      ...paymentRows.map(p => [p.label, p.amount, p.count]),
      [],
      [t('shift.exportTopServicesHeaderPlain'), t('shift.qty'), t('common.revenue')],
      ...topServices.map((s, i) => [`${i + 1}. ${s.name}`, s.count, s.revenue]),
      [],
      [t('shift.exportBarberHeaderPlain'), t('common.transactions'), t('common.revenue'), t('shift.ratePercent'), t('shift.commission')],
      ...barberRows.map(b => [
        b.name, b.transactions, b.revenue,
        Math.round((b.commissionRate || 0) * 100), b.commission,
      ]),
    ]
    if (shift.notes) rows.push([], [t('shift.notesLabel'), shift.notes])

    const csv = rows.map(r => r.map(escapeCsv).join(',')).join('\r\n')
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shift-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(t('shift.recapDownloadedToast'))
  }

  // ── render: loading ──────────────────────────────────────────────────────
  if (loadingActive) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-dark-card animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-dark-card animate-pulse" />)}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="h-64 rounded-2xl bg-dark-card animate-pulse" />
          <div className="h-64 rounded-2xl bg-dark-card animate-pulse" />
        </div>
      </div>
    )
  }

  // ── render: load error ───────────────────────────────────────────────────
  if (activeError && !activeShift) {
    return <LoadErrorScreen onRetry={() => refetchActive()} />
  }

  // ── render: no active shift ──────────────────────────────────────────────
  if (!activeShift) {
    if (closedShift) {
      return (
        <ClosedSuccess
          shift={closedShift}
          onOpenAgain={() => setClosedShift(null)}
          onBackToPos={() => navigate(`/${getBranchSlug(user)}/kasir/pos`)}
          onShowHistory={() => { setClosedShift(null); setShowHistory(true) }}
        />
      )
    }
    return (
      <>
        <OpenShiftScreen branchId={user?.branchId} branchName={user?.branch?.name} />
        <div className="mt-4 text-center">
          <button
            onClick={() => setShowHistory(true)}
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-off-white transition-colors"
          >
            <History className="w-4 h-4" /> {t('shift.viewHistory')}
          </button>
        </div>
        <ShiftHistoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} />
      </>
    )
  }

  // ── render: active shift dashboard ──────────────────────────────────────
  return (
    <div className="space-y-4 sm:space-y-6 pb-6 print:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap print:flex-col">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white">
              {t('shift.closingTitle')}
            </h1>
            <ShiftStatusBadge active />
            <LiveBadge />
            {isFetching && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                <Loader2 className="w-3 h-3 animate-spin" /> {t('shift.loading')}
              </span>
            )}
          </div>
          <p className="text-muted text-xs sm:text-sm mt-1">
            {fullDateLabel(activeShift.openedAt)}
            {' '}· {t('shift.cashierLabel')}: <span className="text-off-white">{activeShift.kasirName || user?.name}</span>
            {' '}· {t('shift.openedShort', { time: formatTimeInTz(activeShift.openedAt) })}
            {' '}· {t('shift.durationShort', { duration: durationLabel(activeShift.openedAt, null, t) })}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={() => setShowHistory(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-dark-card border border-dark-border text-muted hover:text-off-white text-sm transition-colors"
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">{t('shift.history')}</span>
          </button>
        </div>
      </div>

      {summaryError && (
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{t('shift.summaryPartialError')}</span>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
        <Kpi icon={Receipt}      label={t('shift.totalTransactions')}  value={totalTransactions} color="text-blue-400" />
        <Kpi icon={DollarSign}   label={t('shift.totalRevenue')} value={formatRupiah(totalRevenue)} valueShort={formatRupiahShort(totalRevenue)} color="text-brand" />
        <Kpi icon={TrendingUp}   label={t('shift.avg')}        value={formatRupiah(avgPerTx)} valueShort={formatRupiahShort(avgPerTx)} color="text-green-400" />
        <Kpi icon={Clock}        label={t('shift.shiftDuration')}     value={durationLabel(activeShift.openedAt, null, t)} color="text-purple-400" />
      </div>

      {/* Cash drawer */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-4 h-4 text-brand" />
          <h3 className="font-semibold text-off-white text-sm sm:text-base">{t('shift.cashReconciliation')}</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-dark-card/50 rounded-xl border border-dark-border p-3">
            <p className="text-[10px] sm:text-xs text-muted uppercase tracking-wider">{t('shift.openCash')}</p>
            <p className="text-base sm:text-lg font-bold text-off-white truncate" title={formatRupiah(openingCash)}>
              {formatRupiah(openingCash)}
            </p>
          </div>
          <div className="bg-dark-card/50 rounded-xl border border-dark-border p-3">
            <p className="text-[10px] sm:text-xs text-muted uppercase tracking-wider">{t('shift.cashInPlus')}</p>
            <p className="text-base sm:text-lg font-bold text-green-400 truncate" title={formatRupiah(totalCash)}>
              {formatRupiah(totalCash)}
            </p>
          </div>
          <div className="col-span-2 lg:col-span-1 bg-dark-card/50 rounded-xl border border-brand/30 p-3">
            <p className="text-[10px] sm:text-xs text-brand uppercase tracking-wider">{t('shift.expectedCash')}</p>
            <p className="text-base sm:text-lg font-bold text-brand truncate" title={formatRupiah(expectedCash)}>
              {formatRupiah(expectedCash)}
            </p>
          </div>
          <div className="col-span-2 lg:col-span-1">
            <label htmlFor="closing-cash" className="block text-[10px] sm:text-xs text-muted uppercase tracking-wider mb-1">{t('shift.actualCashManual')}</label>
            <input
              id="closing-cash"
              inputMode="numeric"
              value={closingCash}
              onChange={e => setClosingCash(e.target.value.replace(/\D/g, '').slice(0, 12))}
              placeholder="0"
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 sm:py-2 text-base outline-none focus:border-brand/60 transition-colors font-mono"
            />
            {closingCash && (
              <p className="text-[10px] sm:text-xs text-muted mt-1 truncate">
                {formatRupiah(closingCashNum)}
              </p>
            )}
          </div>
        </div>

        {/* Kas Keluar (pengeluaran tunai shift) — dikurangkan dari kas seharusnya */}
        <div className="mt-3 rounded-xl border border-dark-border bg-dark-card/50 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <ArrowDownCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-sm font-medium text-off-white truncate">{t('shift.cashOutTitle')}</span>
              {totalCashOut > 0 && (
                <span className="text-sm font-bold text-red-400 whitespace-nowrap">−{formatRupiah(totalCashOut)}</span>
              )}
            </div>
            <Button
              variant="outline"
              size="xs"
              icon={Plus}
              onClick={() => setShowCashOut(true)}
              disabled={!shiftId || shift?.status === 'closed'}
              className="flex-shrink-0"
            >
              {t('shift.cashOutAdd')}
            </Button>
          </div>
          {cashOutRows.length === 0 ? (
            <p className="text-xs text-muted">{t('shift.cashOutEmpty')}</p>
          ) : (
            <ul className="space-y-1.5">
              {cashOutRows.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm bg-dark-surface/60 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-off-white truncate">{c.description}</p>
                    {c.note && <p className="text-[11px] text-muted truncate">{c.note}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-semibold text-red-400 whitespace-nowrap">−{formatRupiah(c.amount)}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteCashOut(c.id)}
                      disabled={cashOut.remove.isPending || shift?.status === 'closed'}
                      className="text-muted hover:text-red-400 transition-colors disabled:opacity-40"
                      aria-label={t('shift.cashOutDelete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {variance !== null && (
          <div className={`mt-3 rounded-xl border p-3 flex items-center gap-2 text-sm ${
            variance === 0
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : variance > 0
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
            {variance === 0 ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
            <span className="flex-1 min-w-0">
              <span className="font-semibold">{t('shift.varianceLabel', { amount: formatRupiah(variance) })}</span>
              {variance === 0 ? ` — ${t('shift.varianceExact')}`
                : variance > 0 ? ` — ${t('shift.varianceOver')}`
                : ` — ${t('shift.varianceUnder')}`}
            </span>
          </div>
        )}
      </Card>

      {/* Two columns: payment + top services */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Payment breakdown */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-off-white text-sm sm:text-base">{t('shift.paymentBreakdown')}</h3>
          </CardHeader>
          <CardBody className="space-y-3">
            {paymentRows.length === 0 && (
              <p className="text-muted text-sm text-center py-3">{t('shift.noTransactionsYet')}</p>
            )}
            {paymentRows.map((p) => (
              <div key={p.method} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl flex-shrink-0">{p.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-off-white truncate">{p.label}</p>
                    <p className="text-xs text-muted">{t('shift.txCount', { count: p.count })}</p>
                  </div>
                </div>
                <span className="font-semibold text-brand text-sm sm:text-base whitespace-nowrap">
                  {formatRupiah(p.amount)}
                </span>
              </div>
            ))}
            <div className="border-t border-dark-border pt-3 flex items-center justify-between gap-3">
              <span className="font-semibold text-off-white text-sm">{t('common.total')}</span>
              <span className="font-bold text-brand text-base sm:text-lg whitespace-nowrap">
                {formatRupiah(totalRevenue)}
              </span>
            </div>
          </CardBody>
        </Card>

        {/* Top services */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-off-white text-sm sm:text-base">{t('shift.topServices')}</h3>
          </CardHeader>
          <CardBody className="space-y-3">
            {topServices.length === 0 && (
              <p className="text-muted text-sm text-center py-3">{t('shift.noServiceData')}</p>
            )}
            {topServices.slice(0, 5).map((s, i) => {
              const pct = topServices[0]?.count
                ? Math.max(8, (s.count / topServices[0].count) * 100)
                : 8
              return (
                <div key={s.name} className="flex items-center gap-3">
                  <span className={`w-6 text-center font-bold text-sm flex-shrink-0 ${
                    i === 0 ? 'text-brand' : 'text-muted'
                  }`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-off-white truncate" title={s.name}>{s.name}</p>
                    <div className="w-full bg-dark-card rounded-full h-1.5 mt-1 border border-dark-border">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-muted">{s.count}x</p>
                    <p className="text-xs font-medium text-brand whitespace-nowrap">{formatRupiah(s.revenue)}</p>
                  </div>
                </div>
              )
            })}
          </CardBody>
        </Card>
      </div>

      {/* Barber performance */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-brand" />
            <h3 className="font-semibold text-off-white text-sm sm:text-base">{t('shift.barberPerformance')}</h3>
          </div>
        </CardHeader>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-border text-xs uppercase tracking-wider text-muted">
                  <th className="px-4 py-3 text-left">{t('shift.tableBarber')}</th>
                  <th className="px-4 py-3 text-right">{t('common.transactions')}</th>
                  <th className="px-4 py-3 text-right">{t('common.revenue')}</th>
                  <th className="px-4 py-3 text-right">{t('shift.rate')}</th>
                  <th className="px-4 py-3 text-right">{t('shift.commission')}</th>
                </tr>
              </thead>
              <tbody>
                {barberRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted text-sm">
                      {t('shift.noBarberServed')}
                    </td>
                  </tr>
                )}
                {barberRows.map((b) => (
                  <tr key={b.id} className="border-b border-dark-border/50 hover:bg-dark-card/40 transition-colors">
                    <td className="px-4 py-3 align-middle font-medium text-off-white">
                      <span className="truncate max-w-[200px] inline-block" title={b.name}>{b.name}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-off-white whitespace-nowrap">{b.transactions}</td>
                    <td className="px-4 py-3 text-right text-brand whitespace-nowrap">{formatRupiah(b.revenue)}</td>
                    <td className="px-4 py-3 text-right text-muted text-xs whitespace-nowrap">
                      {Math.round((b.commissionRate || 0) * 100)}%
                    </td>
                    <td className="px-4 py-3 text-right text-green-400 font-medium whitespace-nowrap">
                      {formatRupiah(b.commission)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        {/* Mobile cards */}
        <div className="md:hidden px-3 pb-3 space-y-2">
            {barberRows.length === 0 && (
              <p className="text-center text-muted text-sm py-4">{t('shift.noBarberData')}</p>
            )}
            {barberRows.map((b) => (
              <div key={b.id} className="bg-dark-card/50 rounded-xl border border-dark-border p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="font-semibold text-off-white text-sm truncate">{b.name}</p>
                  <Badge variant="muted" className="text-[10px] flex-shrink-0">
                    {t('shift.txCount', { count: b.transactions })}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="min-w-0">
                    <p className="text-muted uppercase tracking-wide">{t('common.revenue')}</p>
                    <p className="text-brand font-semibold truncate">{formatRupiah(b.revenue)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-muted uppercase tracking-wide">{t('shift.rate')}</p>
                    <p className="text-off-white font-semibold">{Math.round((b.commissionRate || 0) * 100)}%</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-muted uppercase tracking-wide">{t('shift.commission')}</p>
                    <p className="text-green-400 font-semibold truncate">{formatRupiah(b.commission)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
      </Card>

      {/* Notes */}
      <Card className="p-4 sm:p-5">
        <label htmlFor="close-notes" className="block text-xs font-medium text-muted mb-1.5">{t('shift.closingNotesOptional')}</label>
        <textarea
          id="close-notes"
          value={closeNotes}
          onChange={e => setCloseNotes(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={t('shift.closeNotesPlaceholder')}
          className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand/60 transition-colors resize-none"
        />
      </Card>

      {/* Action bar (sticky on mobile) */}
      <div className="sticky bottom-2 z-20 print:hidden">
        <Card className="p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 sm:justify-end shadow-lg backdrop-blur">
          <Button variant="outline" icon={Download} onClick={handleExport} disabled={!summaryReady}>
            {t('shift.exportCsvBtn')}
          </Button>
          <Button variant="outline" icon={Printer} onClick={handlePrint}>
            {t('shift.print')}
          </Button>
          <Button
            icon={LogOut}
            onClick={() => setShowConfirm(true)}
            disabled={!summaryReady}
            title={!summaryReady ? t('shift.waitingSummary') : undefined}
            className="bg-red-600 hover:bg-red-500 text-white border-0"
          >
            {t('shift.closeShift')}
          </Button>
        </Card>
      </div>

      {/* Confirm */}
      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} title={t('shift.closeShift')} size="md">
        <div className="space-y-4">
          <p className="text-muted text-sm">
            {t('shift.confirmCloseDescShort')}
          </p>
          <div className="bg-dark-card rounded-xl border border-dark-border p-4 text-center">
            <p className="text-2xl sm:text-3xl font-bold text-brand truncate" title={formatRupiah(totalRevenue)}>
              {formatRupiah(totalRevenue)}
            </p>
            <p className="text-muted text-sm mt-1">{t('shift.transactionCount', { count: totalTransactions })}</p>
          </div>
          {variance !== null && (
            <div className={`rounded-xl border p-3 text-sm ${
              variance === 0
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : variance > 0
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              {t('shift.cashVariance')}: <span className="font-bold">{formatRupiah(variance)}</span>
            </div>
          )}
          <div className="flex gap-2 sm:gap-3">
            <Button variant="outline" fullWidth onClick={() => setShowConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              fullWidth
              onClick={handleClose}
              disabled={closeShift.isPending}
              className="bg-red-600 hover:bg-red-500 text-white border-0"
            >
              {closeShift.isPending ? t('shift.closing') : t('shift.confirmCloseButton')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Kas Keluar modal */}
      <Modal isOpen={showCashOut} onClose={() => { setShowCashOut(false); resetCashOutForm() }} title={t('shift.cashOutModalTitle')} size="md">
        <div className="space-y-4">
          <p className="text-muted text-sm">{t('shift.cashOutModalDesc')}</p>
          <div>
            <label htmlFor="co-amount" className="block text-xs font-medium text-muted mb-1.5">{t('shift.cashOutAmountLabel')}</label>
            <input
              id="co-amount"
              inputMode="numeric"
              value={coAmount}
              onChange={e => setCoAmount(e.target.value.replace(/\D/g, '').slice(0, 9))}
              placeholder="0"
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-base outline-none focus:border-brand/60 transition-colors font-mono"
            />
            {coAmount && <p className="text-xs text-muted mt-1">{formatRupiah(parseInt(coAmount || '0', 10) || 0)}</p>}
          </div>
          <div>
            <label htmlFor="co-desc" className="block text-xs font-medium text-muted mb-1.5">{t('shift.cashOutDescLabel')}</label>
            <input
              id="co-desc"
              value={coDesc}
              onChange={e => setCoDesc(e.target.value.slice(0, 200))}
              placeholder={t('shift.cashOutDescPlaceholder')}
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-base outline-none focus:border-brand/60 transition-colors"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {cashOutPresets.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCoDesc(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${coDesc === p ? 'bg-brand text-dark border-brand' : 'bg-dark-surface text-muted border-dark-border hover:text-off-white'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="co-note" className="block text-xs font-medium text-muted mb-1.5">{t('shift.cashOutNoteLabel')}</label>
            <input
              id="co-note"
              value={coNote}
              onChange={e => setCoNote(e.target.value.slice(0, 500))}
              placeholder={t('shift.cashOutNotePlaceholder')}
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-base outline-none focus:border-brand/60 transition-colors"
            />
          </div>
          <div className="flex gap-2 sm:gap-3">
            <Button variant="outline" fullWidth onClick={() => { setShowCashOut(false); resetCashOutForm() }}>
              {t('common.cancel')}
            </Button>
            <Button fullWidth icon={ArrowDownCircle} onClick={handleAddCashOut} disabled={cashOut.add.isPending}>
              {cashOut.add.isPending ? t('shift.cashOutSaving') : t('shift.cashOutSave')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* History modal */}
      <ShiftHistoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} />

      {/* Print-only footer */}
      <div className="hidden print:block">
        <hr className="my-4 border-dark-border" />
        <p className="text-xs text-muted">
          {t('shift.printedAt', { time: formatDateTimeInTz(new Date()) })}
        </p>
      </div>
    </div>
  )
}

// ── Closed success screen ──────────────────────────────────────────────────
function ClosedSuccess({ shift, onOpenAgain, onBackToPos, onShowHistory }) {
  const { t } = useTranslation()
  const total = shift?.totalRevenue || 0
  const variance = shift?.cashDifference

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-12 sm:py-20 text-center px-4"
    >
      <div className="w-20 h-20 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mb-4">
        <CheckCircle className="w-10 h-10 text-green-400" />
      </div>
      <ShiftStatusBadge active={false} className="mb-3" />
      <h2 className="font-display text-2xl font-bold text-off-white mb-2">{t('shift.shiftClosedHeading')}</h2>
      <p className="text-muted mb-1 text-sm">
        {shift?.kasirName
          ? t('shift.closedByAt', { time: shift?.closedAt ? formatTimeInTz(shift.closedAt) : '—', name: shift.kasirName })
          : t('shift.closedAt', { time: shift?.closedAt ? formatTimeInTz(shift.closedAt) : '—' })}
      </p>
      <p className="text-muted mb-6 text-sm">
        {t('shift.totalShiftRevenue')} <span className="text-brand font-semibold">{formatRupiah(total)}</span>
      </p>

      {variance != null && (
        <div className={`mb-6 px-4 py-2 rounded-xl text-sm font-medium ${
          variance === 0 ? 'bg-green-500/10 text-green-400 border border-green-500/30'
            : variance > 0 ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
            : 'bg-red-500/10 text-red-400 border border-red-500/30'
        }`}>
          {t('shift.cashVariance')}: {formatRupiah(variance)} {variance === 0 ? '✓' : variance > 0 ? `(${t('shift.over')})` : `(${t('shift.under')})`}
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-center">
        <Button onClick={onOpenAgain} icon={Plus}>{t('shift.openNewShift')}</Button>
        <Button variant="outline" onClick={onBackToPos}>{t('shift.backToPos')}</Button>
        <Button variant="outline" icon={History} onClick={onShowHistory}>{t('shift.history')}</Button>
      </div>
    </motion.div>
  )
}

// ── Shift history modal ────────────────────────────────────────────────────
function ShiftHistoryModal({ isOpen, onClose }) {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [page, setPage] = useState(1)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const PAGE_SIZE = 10

  // Reset saat dibuka & saat filter berubah.
  useEffect(() => { if (isOpen) setPage(1) }, [isOpen])
  useEffect(() => { setPage(1) }, [dateFrom, dateTo])

  const { data: result, isLoading, isError, refetch } = useShifts({
    enabled: isOpen,
    branchId: user?.branchId,
    page,
    limit: PAGE_SIZE,
    status: 'closed',
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  })

  const shifts = result?.data || []
  const meta = result?.meta
  const hasFilter = !!dateFrom || !!dateTo

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('shift.historyTitle')} size="lg">
      {/* Filter tanggal */}
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div>
          <label htmlFor="hist-from" className="block text-[10px] text-muted uppercase tracking-wide mb-1">{t('common.from')}</label>
          <input
            id="hist-from" type="date" value={dateFrom}
            max={dateTo || undefined}
            onChange={e => setDateFrom(e.target.value)}
            className="bg-dark-surface border border-dark-border text-off-white rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-brand/60"
          />
        </div>
        <div>
          <label htmlFor="hist-to" className="block text-[10px] text-muted uppercase tracking-wide mb-1">{t('common.to')}</label>
          <input
            id="hist-to" type="date" value={dateTo}
            min={dateFrom || undefined}
            onChange={e => setDateTo(e.target.value)}
            className="bg-dark-surface border border-dark-border text-off-white rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-brand/60"
          />
        </div>
        {hasFilter && (
          <button
            onClick={() => { setDateFrom(''); setDateTo('') }}
            className="px-2.5 py-1.5 rounded-lg text-xs text-muted hover:text-off-white hover:bg-dark-card transition-colors"
          >
            {t('shift.reset')}
          </button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-dark-card animate-pulse" />)}
        </div>
      )}

      {!isLoading && isError && (
        <div className="text-center py-8">
          <AlertTriangle className="w-10 h-10 text-red-400/70 mx-auto mb-2" />
          <p className="text-muted text-sm mb-3">{t('shift.historyLoadError')}</p>
          <Button variant="outline" icon={RefreshCw} onClick={() => refetch()}>{t('shift.retry')}</Button>
        </div>
      )}

      {!isLoading && !isError && shifts.length === 0 && (
        <div className="text-center py-8">
          <Calendar className="w-10 h-10 text-muted/50 mx-auto mb-2" />
          <p className="text-muted text-sm">
            {hasFilter ? t('shift.noShiftInRange') : t('shift.noShiftHistory')}
          </p>
        </div>
      )}

      {!isLoading && !isError && shifts.length > 0 && (
        <>
          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {shifts.map(s => (
              <div key={s.id} className="bg-dark-card/50 rounded-xl border border-dark-border p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={s.status === 'open' ? 'warning' : 'success'} dot>
                      {s.status === 'open' ? t('shift.statusOpen') : t('shift.statusClosed')}
                    </Badge>
                    <span className="text-xs text-muted">
                      {formatDateInTz(s.openedAt)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-off-white mt-1 truncate">
                    {s.kasirName || t('shift.cashierFallback')}
                  </p>
                  <p className="text-xs text-muted">
                    {formatTimeInTz(s.openedAt)} – {s.closedAt ? formatTimeInTz(s.closedAt) : t('shift.active')}
                    {' '}· {t('shift.txCount', { count: s.totalTransactions ?? s._count?.transactions ?? 0 })}
                    {s.cashDifference != null && s.cashDifference !== 0 && (
                      <> · {t('shift.diffLower')} <span className={s.cashDifference > 0 ? 'text-blue-400' : 'text-red-400'}>{formatRupiah(s.cashDifference)}</span></>
                    )}
                  </p>
                </div>
                <p className="text-brand font-bold text-sm whitespace-nowrap">
                  {formatRupiah(s.totalRevenue || 0)}
                </p>
              </div>
            ))}
          </div>

          {meta?.totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-dark-border">
              <p className="text-xs text-muted">
                {t('shift.pageOf', { page: meta.page, total: meta.totalPages })} · {t('shift.totalCount', { count: meta.total })}
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  aria-label={t('shift.prevPage')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-dark-card border border-dark-border text-sm text-off-white disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage(p => p + 1)}
                  aria-label={t('shift.nextPage')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-dark-card border border-dark-border text-sm text-off-white disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

// ── default export — dibungkus ErrorBoundary supaya error render tidak
//    membuat seluruh halaman kasir blank. ──────────────────────────────────
export default function ShiftClosingPage() {
  return (
    <ErrorBoundary>
      <ShiftClosingPageInner />
    </ErrorBoundary>
  )
}
