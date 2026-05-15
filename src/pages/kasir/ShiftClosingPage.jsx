import React, { useState, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  LogOut, DollarSign, Receipt, TrendingUp, CheckCircle, Download, Clock,
  Wallet, AlertTriangle, Printer, Plus, Calendar, ChevronLeft, ChevronRight,
  Users, History,
} from 'lucide-react'
import { format, differenceInMinutes } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore.js'
import {
  useActiveShift, useCloseShift, useOpenShift, useShiftSummary, useShifts,
} from '../../hooks/useShifts.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import LiveBadge from '../../components/ui/LiveBadge.jsx'
import { formatRupiah } from '../../utils/format.js'
import { getBranchSlug } from '../../utils/branchSlug.js'

// ── helpers ────────────────────────────────────────────────────────────────
const PAYMENT_LABEL = {
  cash:     { label: 'Tunai',        icon: '💵' },
  transfer: { label: 'Transfer',     icon: '🏦' },
  qris:     { label: 'QRIS',         icon: '📱' },
  card:     { label: 'Kartu',        icon: '💳' },
}

function durationLabel(start, end) {
  if (!start) return '0m'
  const mins = Math.max(0, differenceInMinutes(end || new Date(), new Date(start)))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return `${h}j ${m}m`
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

// ── No active shift screen ─────────────────────────────────────────────────
function OpenShiftScreen({ branchId, branchName }) {
  const [openingCash, setOpeningCash] = useState('')
  const [notes, setNotes] = useState('')
  const openShift = useOpenShift()
  const toast = useToast()

  const submit = async () => {
    try {
      await openShift.mutateAsync({
        branchId,
        openingCash: parseInt(openingCash || '0', 10) || 0,
        notes: notes.trim() || undefined,
      })
      toast.success('Shift dibuka')
      setOpeningCash('')
      setNotes('')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal membuka shift')
    }
  }

  return (
    <div className="max-w-md mx-auto py-6 sm:py-12">
      <Card className="p-6 sm:p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center mx-auto mb-4">
          <Wallet className="w-7 h-7 text-gold" />
        </div>
        <h2 className="font-display text-xl sm:text-2xl font-bold text-off-white mb-1">
          Belum Ada Shift Aktif
        </h2>
        <p className="text-muted text-sm mb-6">
          Buka shift terlebih dahulu untuk mulai menerima transaksi di {branchName || 'cabang ini'}.
        </p>

        <div className="space-y-3 text-left">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Kas Awal (Rp)</label>
            <input
              inputMode="numeric"
              value={openingCash}
              onChange={e => setOpeningCash(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60 transition-colors font-mono"
            />
            {openingCash && (
              <p className="text-xs text-muted mt-1">
                {formatRupiah(parseInt(openingCash || '0', 10) || 0)}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Catatan (opsional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Misal: kondisi kas drawer, modal awal, dst."
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60 transition-colors resize-none"
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
          {openShift.isPending ? 'Membuka…' : 'Buka Shift Sekarang'}
        </Button>
      </Card>
    </div>
  )
}

// ── KPI tile (responsive nominal) ──────────────────────────────────────────
function Kpi({ icon: Icon, label, value, color = 'text-off-white' }) {
  return (
    <Card className="p-3 sm:p-4 min-w-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${color} flex-shrink-0`} />
        <span className="text-[10px] sm:text-xs text-muted truncate">{label}</span>
      </div>
      <p className={`font-bold text-off-white text-base sm:text-lg lg:text-xl truncate`} title={typeof value === 'string' ? value : ''}>
        {value}
      </p>
    </Card>
  )
}

// ── main component ─────────────────────────────────────────────────────────
export default function ShiftClosingPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const toast = useToast()
  const isMobile = useIsMobile()

  const { data: activeShift, isLoading: loadingActive } = useActiveShift(user?.branchId)
  const shiftId = activeShift?.id

  const {
    data: payload, isLoading: loadingSummary, isFetching,
  } = useShiftSummary(shiftId)

  const closeShift = useCloseShift()

  // Form state for closing
  const [closingCash, setClosingCash] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [closedShift, setClosedShift] = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  // Reset closed-screen state if user opens a new shift
  useEffect(() => { if (activeShift?.status === 'open') setClosedShift(null) }, [activeShift?.id, activeShift?.status])

  // ── derived values ───────────────────────────────────────────────────────
  const shift   = payload?.shift
  const summary = payload?.summary

  const totalRevenue      = summary?.totalRevenue ?? activeShift?.totalRevenue ?? 0
  const totalTransactions = summary?.totalTransactions ?? activeShift?.totalTransactions ?? 0
  const totalCash         = summary?.totalCash ?? 0
  const openingCash       = shift?.openingCash ?? activeShift?.openingCash ?? 0
  const expectedCash      = (openingCash || 0) + (totalCash || 0)
  const closingCashNum    = parseInt(closingCash || '0', 10) || 0
  const variance          = closingCash !== '' ? closingCashNum - expectedCash : null
  const avgPerTx          = totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0

  const paymentRows = useMemo(() => {
    const map = summary?.paymentBreakdown || {}
    return Object.values(map)
      .map(p => ({
        ...p,
        ...(PAYMENT_LABEL[p.method] || { label: p.method, icon: '•' }),
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [summary])

  const topServices  = summary?.topServices  || []
  const barberRows   = summary?.barberSummary || []

  // ── actions ──────────────────────────────────────────────────────────────
  const handleClose = async () => {
    if (!shiftId) return
    try {
      const res = await closeShift.mutateAsync({
        id: shiftId,
        branchId: user?.branchId,
        closingCash: closingCash !== '' ? closingCashNum : undefined,
        notes: closeNotes.trim() || undefined,
      })
      setClosedShift({ ...res, summary, _closingCashEntered: closingCash !== '' })
      setShowConfirm(false)
      setClosingCash('')
      setCloseNotes('')
      toast.success('Shift berhasil ditutup')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menutup shift')
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExport = () => {
    if (!shift) return
    const lines = [
      'REKAP PENUTUPAN SHIFT',
      `Cabang: ${shift.branchName || ''}`,
      `Kasir: ${shift.kasirName || user?.name || ''}`,
      `Dibuka: ${format(new Date(shift.openedAt), 'dd MMM yyyy HH:mm', { locale: idLocale })}`,
      shift.closedAt ? `Ditutup: ${format(new Date(shift.closedAt), 'dd MMM yyyy HH:mm', { locale: idLocale })}` : '',
      '',
      '── RINGKASAN ──',
      `Total Transaksi: ${totalTransactions}`,
      `Total Pendapatan: ${formatRupiah(totalRevenue)}`,
      `Rata-rata: ${formatRupiah(avgPerTx)}`,
      '',
      '── KAS ──',
      `Kas Awal     : ${formatRupiah(openingCash)}`,
      `Kas Tunai    : ${formatRupiah(totalCash)}`,
      `Kas Diharapkan: ${formatRupiah(expectedCash)}`,
      shift.closingCash != null ? `Kas Aktual   : ${formatRupiah(shift.closingCash)}` : '',
      shift.cashDifference != null ? `Selisih      : ${formatRupiah(shift.cashDifference)} ${shift.cashDifference === 0 ? '✓' : shift.cashDifference > 0 ? '(lebih)' : '(kurang)'}` : '',
      '',
      '── PEMBAYARAN ──',
      ...paymentRows.map(p => `${p.label}: ${formatRupiah(p.amount)} (${p.count} tx)`),
      '',
      '── LAYANAN TERLARIS ──',
      ...topServices.map((s, i) => `${i + 1}. ${s.name} — ${s.count}x — ${formatRupiah(s.revenue)}`),
      '',
      '── PERFORMA BARBER ──',
      ...barberRows.map(b =>
        `${b.name}: ${b.transactions} tx — Revenue ${formatRupiah(b.revenue)} — Komisi ${formatRupiah(b.commission)} (${Math.round((b.commissionRate || 0) * 100)}%)`
      ),
      shift.notes ? '\nCatatan: ' + shift.notes : '',
    ].filter(Boolean)

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shift-${format(new Date(), 'yyyy-MM-dd-HHmm')}.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Rekap shift didownload')
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

  // ── render: no active shift ──────────────────────────────────────────────
  if (!activeShift) {
    if (closedShift) {
      // Just closed — show success then offer reopening
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
            <History className="w-4 h-4" /> Lihat riwayat shift
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
              Penutupan Shift
            </h1>
            <Badge variant="warning" dot>Shift Aktif</Badge>
            <LiveBadge />
          </div>
          <p className="text-muted text-xs sm:text-sm mt-1">
            {format(new Date(activeShift.openedAt), 'EEEE, dd MMM yyyy', { locale: idLocale })}
            {' '}· Kasir: <span className="text-off-white">{activeShift.kasirName || user?.name}</span>
            {' '}· Dibuka {format(new Date(activeShift.openedAt), 'HH:mm')}
            {' '}· Durasi {durationLabel(activeShift.openedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button
            onClick={() => setShowHistory(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-dark-card border border-dark-border text-muted hover:text-off-white text-sm transition-colors"
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">Riwayat</span>
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
        <Kpi icon={Receipt}      label="Total Transaksi"  value={totalTransactions} color="text-blue-400" />
        <Kpi icon={DollarSign}   label="Total Pendapatan" value={formatRupiah(totalRevenue)} color="text-gold" />
        <Kpi icon={TrendingUp}   label="Rata-rata"        value={formatRupiah(avgPerTx)} color="text-green-400" />
        <Kpi icon={Clock}        label="Durasi Shift"     value={durationLabel(activeShift.openedAt)} color="text-purple-400" />
      </div>

      {/* Cash drawer */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-4 h-4 text-gold" />
          <h3 className="font-semibold text-off-white text-sm sm:text-base">Rekonsiliasi Kas Drawer</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-dark-bg/40 rounded-xl border border-dark-border p-3">
            <p className="text-[10px] sm:text-xs text-muted uppercase tracking-wider">Kas Awal</p>
            <p className="text-base sm:text-lg font-bold text-off-white truncate" title={formatRupiah(openingCash)}>
              {formatRupiah(openingCash)}
            </p>
          </div>
          <div className="bg-dark-bg/40 rounded-xl border border-dark-border p-3">
            <p className="text-[10px] sm:text-xs text-muted uppercase tracking-wider">+ Tunai Masuk</p>
            <p className="text-base sm:text-lg font-bold text-green-400 truncate" title={formatRupiah(totalCash)}>
              {formatRupiah(totalCash)}
            </p>
          </div>
          <div className="bg-dark-bg/40 rounded-xl border border-gold/30 p-3">
            <p className="text-[10px] sm:text-xs text-gold uppercase tracking-wider">Kas Diharapkan</p>
            <p className="text-base sm:text-lg font-bold text-gold truncate" title={formatRupiah(expectedCash)}>
              {formatRupiah(expectedCash)}
            </p>
          </div>
          <div>
            <label className="block text-[10px] sm:text-xs text-muted uppercase tracking-wider mb-1">Kas Aktual (Hitung Manual)</label>
            <input
              inputMode="numeric"
              value={closingCash}
              onChange={e => setClosingCash(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm sm:text-base outline-none focus:border-gold/60 transition-colors font-mono"
            />
            {closingCash && (
              <p className="text-[10px] sm:text-xs text-muted mt-1 truncate">
                {formatRupiah(closingCashNum)}
              </p>
            )}
          </div>
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
            <span className="flex-1 min-w-0 truncate">
              <span className="font-semibold">Selisih: {formatRupiah(variance)}</span>
              {variance === 0 ? ' — Kas pas, lengkap.'
                : variance > 0 ? ' — Kas lebih dari ekspektasi.'
                : ' — Kas kurang. Tinjau kembali sebelum tutup.'}
            </span>
          </div>
        )}
      </Card>

      {/* Two columns: payment + top services */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Payment breakdown */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-off-white text-sm sm:text-base">Rekap Pembayaran</h3>
          </CardHeader>
          <CardBody className="space-y-3">
            {paymentRows.length === 0 && (
              <p className="text-muted text-sm text-center py-3">Belum ada transaksi</p>
            )}
            {paymentRows.map((p) => (
              <div key={p.method} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl flex-shrink-0">{p.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-off-white truncate">{p.label}</p>
                    <p className="text-xs text-muted">{p.count} tx</p>
                  </div>
                </div>
                <span className="font-semibold text-gold text-sm sm:text-base whitespace-nowrap">
                  {formatRupiah(p.amount)}
                </span>
              </div>
            ))}
            <div className="border-t border-dark-border pt-3 flex items-center justify-between gap-3">
              <span className="font-semibold text-off-white text-sm">Total</span>
              <span className="font-bold text-gold text-base sm:text-lg whitespace-nowrap">
                {formatRupiah(totalRevenue)}
              </span>
            </div>
          </CardBody>
        </Card>

        {/* Top services */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-off-white text-sm sm:text-base">Layanan Terlaris</h3>
          </CardHeader>
          <CardBody className="space-y-3">
            {topServices.length === 0 && (
              <p className="text-muted text-sm text-center py-3">Belum ada data layanan</p>
            )}
            {topServices.slice(0, 5).map((s, i) => {
              const pct = topServices[0]?.count
                ? Math.max(8, (s.count / topServices[0].count) * 100)
                : 8
              return (
                <div key={s.name} className="flex items-center gap-3">
                  <span className={`w-6 text-center font-bold text-sm flex-shrink-0 ${
                    i === 0 ? 'text-gold'
                      : i === 1 ? 'text-off-white/70'
                      : 'text-muted'
                  }`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-off-white truncate" title={s.name}>{s.name}</p>
                    <div className="w-full bg-dark-bg rounded-full h-1.5 mt-1 border border-dark-border">
                      <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-muted">{s.count}x</p>
                    <p className="text-xs font-medium text-gold whitespace-nowrap">{formatRupiah(s.revenue)}</p>
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
            <Users className="w-4 h-4 text-gold" />
            <h3 className="font-semibold text-off-white text-sm sm:text-base">Performa Barber</h3>
          </div>
        </CardHeader>

        {/* Desktop table */}
        {!isMobile && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-border text-xs uppercase tracking-wider text-muted">
                  <th className="px-4 py-3 text-left">Barber</th>
                  <th className="px-4 py-3 text-right">Transaksi</th>
                  <th className="px-4 py-3 text-right">Pendapatan</th>
                  <th className="px-4 py-3 text-right">Rate</th>
                  <th className="px-4 py-3 text-right">Komisi</th>
                </tr>
              </thead>
              <tbody>
                {barberRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted text-sm">
                      Belum ada barber yang melayani transaksi
                    </td>
                  </tr>
                )}
                {barberRows.map((b) => (
                  <tr key={b.id} className="border-b border-dark-border/50 hover:bg-dark-card/40 transition-colors">
                    <td className="px-4 py-3 align-middle font-medium text-off-white">
                      <span className="truncate max-w-[200px] inline-block" title={b.name}>{b.name}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-off-white whitespace-nowrap">{b.transactions}</td>
                    <td className="px-4 py-3 text-right text-gold whitespace-nowrap">{formatRupiah(b.revenue)}</td>
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
        )}

        {/* Mobile cards */}
        {isMobile && (
          <div className="px-3 pb-3 space-y-2">
            {barberRows.length === 0 && (
              <p className="text-center text-muted text-sm py-4">Belum ada data barber</p>
            )}
            {barberRows.map((b) => (
              <div key={b.id} className="bg-dark-bg/40 rounded-xl border border-dark-border p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="font-semibold text-off-white text-sm truncate">{b.name}</p>
                  <Badge variant="muted" className="text-[10px] flex-shrink-0">
                    {b.transactions} tx
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <p className="text-muted uppercase tracking-wide">Pendapatan</p>
                    <p className="text-gold font-semibold truncate">{formatRupiah(b.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-muted uppercase tracking-wide">Rate</p>
                    <p className="text-off-white font-semibold">{Math.round((b.commissionRate || 0) * 100)}%</p>
                  </div>
                  <div>
                    <p className="text-muted uppercase tracking-wide">Komisi</p>
                    <p className="text-green-400 font-semibold truncate">{formatRupiah(b.commission)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Notes */}
      <Card className="p-4 sm:p-5">
        <label className="block text-xs font-medium text-muted mb-1.5">Catatan Penutupan (opsional)</label>
        <textarea
          value={closeNotes}
          onChange={e => setCloseNotes(e.target.value)}
          rows={2}
          placeholder="Misal: insiden kas, pelanggan komplain, voucher khusus, dll."
          className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60 transition-colors resize-none"
        />
      </Card>

      {/* Action bar (sticky on mobile) */}
      <div className="sticky bottom-2 z-20 print:hidden">
        <Card className="p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 sm:justify-end shadow-lg backdrop-blur">
          <Button variant="outline" icon={Download} onClick={handleExport}>
            Unduh Rekap
          </Button>
          <Button variant="outline" icon={Printer} onClick={handlePrint}>
            Cetak
          </Button>
          <Button
            icon={LogOut}
            onClick={() => setShowConfirm(true)}
            className="bg-red-600 hover:bg-red-500 text-white border-0"
          >
            Tutup Shift
          </Button>
        </Card>
      </div>

      {/* Confirm */}
      <Modal isOpen={showConfirm} onClose={() => setShowConfirm(false)} title="Tutup Shift" size="md">
        <div className="space-y-4">
          <p className="text-muted text-sm">
            Shift akan ditutup. Setelah ditutup, transaksi baru tidak dapat ditambahkan ke shift ini.
          </p>
          <div className="bg-dark-card rounded-xl border border-dark-border p-4 text-center">
            <p className="text-2xl sm:text-3xl font-bold text-gold truncate" title={formatRupiah(totalRevenue)}>
              {formatRupiah(totalRevenue)}
            </p>
            <p className="text-muted text-sm mt-1">{totalTransactions} transaksi</p>
          </div>
          {variance !== null && (
            <div className={`rounded-xl border p-3 text-sm ${
              variance === 0
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : variance > 0
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              Selisih kas: <span className="font-bold">{formatRupiah(variance)}</span>
            </div>
          )}
          <div className="flex gap-2 sm:gap-3">
            <Button variant="outline" fullWidth onClick={() => setShowConfirm(false)}>
              Batal
            </Button>
            <Button
              fullWidth
              onClick={handleClose}
              disabled={closeShift.isPending}
              className="bg-red-600 hover:bg-red-500 text-white border-0"
            >
              {closeShift.isPending ? 'Menutup…' : 'Ya, Tutup Shift'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* History modal */}
      <ShiftHistoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} />

      {/* Print-only header */}
      <div className="hidden print:block">
        <hr className="my-4 border-dark-border" />
        <p className="text-xs text-muted">
          Dicetak {format(new Date(), 'dd MMM yyyy HH:mm', { locale: idLocale })}
        </p>
      </div>
    </div>
  )
}

// ── Closed success screen ──────────────────────────────────────────────────
function ClosedSuccess({ shift, onOpenAgain, onBackToPos, onShowHistory }) {
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
      <h2 className="font-display text-2xl font-bold text-off-white mb-2">Shift Ditutup</h2>
      <p className="text-muted mb-1 text-sm">
        Ditutup {shift?.closedAt ? format(new Date(shift.closedAt), 'HH:mm') : '-'}
        {shift?.kasirName ? ` oleh ${shift.kasirName}` : ''}
      </p>
      <p className="text-muted mb-6 text-sm">
        Total pendapatan shift: <span className="text-gold font-semibold">{formatRupiah(total)}</span>
      </p>

      {variance != null && (
        <div className={`mb-6 px-4 py-2 rounded-xl text-sm font-medium ${
          variance === 0 ? 'bg-green-500/10 text-green-400 border border-green-500/30'
            : variance > 0 ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
            : 'bg-red-500/10 text-red-400 border border-red-500/30'
        }`}>
          Selisih kas: {formatRupiah(variance)} {variance === 0 ? '✓' : variance > 0 ? '(lebih)' : '(kurang)'}
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-center">
        <Button onClick={onOpenAgain} icon={Plus}>Buka Shift Baru</Button>
        <Button variant="outline" onClick={onBackToPos}>Kembali ke POS</Button>
        <Button variant="outline" icon={History} onClick={onShowHistory}>Riwayat</Button>
      </div>
    </motion.div>
  )
}

// ── Shift history modal ────────────────────────────────────────────────────
function ShiftHistoryModal({ isOpen, onClose }) {
  const { user } = useAuthStore()
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 10

  const { data: result, isLoading } = useShifts(
    isOpen
      ? {
          branchId: user?.branchId,
          page,
          limit: PAGE_SIZE,
          status: 'closed',
        }
      : {}
  )

  useEffect(() => { if (isOpen) setPage(1) }, [isOpen])

  const shifts = result?.data || []
  const meta = result?.meta

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Riwayat Shift" size="lg">
      {isLoading && <p className="text-center text-muted text-sm py-8">Memuat…</p>}

      {!isLoading && shifts.length === 0 && (
        <div className="text-center py-8">
          <Calendar className="w-10 h-10 text-muted/50 mx-auto mb-2" />
          <p className="text-muted text-sm">Belum ada riwayat shift</p>
        </div>
      )}

      {!isLoading && shifts.length > 0 && (
        <>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {shifts.map(s => (
              <div key={s.id} className="bg-dark-bg/40 rounded-xl border border-dark-border p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={s.status === 'open' ? 'warning' : 'success'} dot>
                      {s.status === 'open' ? 'Aktif' : 'Ditutup'}
                    </Badge>
                    <span className="text-xs text-muted">
                      {format(new Date(s.openedAt), 'dd MMM yyyy', { locale: idLocale })}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-off-white mt-1 truncate">
                    {s.kasirName || 'Kasir'}
                  </p>
                  <p className="text-xs text-muted">
                    {format(new Date(s.openedAt), 'HH:mm')} – {s.closedAt ? format(new Date(s.closedAt), 'HH:mm') : 'aktif'}
                    {' '}· {s.totalTransactions ?? s._count?.transactions ?? 0} tx
                    {s.cashDifference != null && s.cashDifference !== 0 && (
                      <> · selisih <span className={s.cashDifference > 0 ? 'text-blue-400' : 'text-red-400'}>{formatRupiah(s.cashDifference)}</span></>
                    )}
                  </p>
                </div>
                <p className="text-gold font-bold text-sm whitespace-nowrap">
                  {formatRupiah(s.totalRevenue || 0)}
                </p>
              </div>
            ))}
          </div>

          {meta?.totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-dark-border">
              <p className="text-xs text-muted">
                Halaman {meta.page} dari {meta.totalPages} · {meta.total} total
              </p>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-dark-card border border-dark-border text-sm text-off-white disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage(p => p + 1)}
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
