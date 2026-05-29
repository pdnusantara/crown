import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams, useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, X, User, Printer, CheckCircle, Check, Tag, Trash2,
  MessageCircle, AlertCircle, Clock, Scissors, Star, ListOrdered, ShoppingCart,
  Banknote, RotateCcw, ArrowDown, Wallet, Crown, Copy, Bluetooth,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { id as idLocale, enUS as enLocale } from 'date-fns/locale'
import { useAuthStore } from '../../store/authStore.js'
import { useTenantStore } from '../../store/tenantStore.js'
import { usePosStore } from '../../store/posStore.js'
import { useUpdateQueueStatus } from '../../hooks/useQueue.js'
import { useBranches } from '../../hooks/useBranches.js'
import { usePublicTenantStore } from '../../store/publicTenantStore.js'
import { useValidateVoucher } from '../../hooks/useVouchers.js'
import { useIsFeatureEnabled } from '../../hooks/useFeatureFlags.js'
import { getBranchSlug, matchesBranch } from '../../utils/branchSlug.js'
import { MIN_REDEEM_POINTS, MAX_REDEEM_PERCENT, RUPIAH_PER_POINT, maxRedeemablePoints, calcRedeemValue, validateRedeem } from '../../utils/loyalty.js'
import { formatDateTimeInTz, formatInTenantTz } from '../../utils/timezone.js'
import { useShiftStore } from '../../store/shiftStore.js'
import { useActiveShift } from '../../hooks/useShifts.js'
import { useServices } from '../../hooks/useServices.js'
import { useUsers } from '../../hooks/useUsers.js'
import { useCustomers, useCreateCustomer } from '../../hooks/useCustomers.js'
import { useToast } from '../../components/ui/Toast.jsx'
import WilayahPicker from '../../components/WilayahPicker.jsx'
import Button from '../../components/ui/Button.jsx'
import api from '../../lib/api.js'
import { useBtPrinter } from '../../lib/btPrinter.js'
import { buildReceipt } from '../../utils/escpos.js'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import ErrorBoundary from '../../components/ui/ErrorBoundary.jsx'
import { formatRupiah } from '../../utils/format.js'
import { QRCodeSVG } from 'qrcode.react'

// Rumus earn sama dengan backend (`backend/src/routes/transactions.js`):
// 1 poin per Rp10.000 dari `total` (setelah diskon).
const POINTS_PER_RUPIAH = 10_000
const calcPointsEarn = (total) => Math.max(0, Math.floor((Number(total) || 0) / POINTS_PER_RUPIAH))

// Segmen RFM time-aware — mirror `classifySegment` di backend (customers.js).
const SEGMENT_THRESHOLDS = { vipMinVisits: 10, loyalMinVisits: 3, atRiskMinDays: 90, lostMinDays: 180 }
const classifyCustomerSegment = (visitCount = 0, lastVisitAt = null) => {
  if (!visitCount || visitCount <= 0) return 'never'
  if (!lastVisitAt) return 'never'
  const daysSince = (Date.now() - new Date(lastVisitAt).getTime()) / 86_400_000
  if (daysSince > SEGMENT_THRESHOLDS.lostMinDays)   return 'lost'
  if (daysSince > SEGMENT_THRESHOLDS.atRiskMinDays) return 'atRisk'
  if (visitCount >= SEGMENT_THRESHOLDS.vipMinVisits)   return 'vip'
  if (visitCount >= SEGMENT_THRESHOLDS.loyalMinVisits) return 'loyal'
  return 'new'
}
// Skema warna badge per-segmen untuk loyalty card.
const SEGMENT_META = {
  vip:    { key: 'pos.segVip',    cls: 'text-brand bg-brand/15 border-brand/40' },
  loyal:  { key: 'pos.segLoyal',  cls: 'text-blue-300 bg-blue-400/10 border-blue-400/30' },
  new:    { key: 'pos.segNew',    cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  atRisk: { key: 'pos.segAtRisk', cls: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  lost:   { key: 'pos.segLost',   cls: 'text-red-300 bg-red-500/10 border-red-500/30' },
  never:  { key: 'pos.segNever',  cls: 'text-muted bg-dark-surface border-dark-border' },
}

function CustomerHistorySnippet({ customer, transactionTotal = 0 }) {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language?.startsWith('en') ? enLocale : idLocale

  // Real data from /api/customers — no localStorage scan
  const visits      = customer.visitCount || 0
  const points      = customer.loyaltyPoints || 0
  const lastVisitAt = customer.lastVisitAt || customer.lastVisit || null
  const lastVisitLabel = lastVisitAt
    ? formatDistanceToNow(new Date(lastVisitAt), { addSuffix: true, locale: dateLocale })
    : null
  const memberSinceLabel = customer.createdAt
    ? formatInTenantTz(customer.createdAt, { month: 'short', year: 'numeric' })
    : null

  const pointsToEarn = calcPointsEarn(transactionTotal)

  const segment = classifyCustomerSegment(visits, lastVisitAt)
  const segMeta = SEGMENT_META[segment] || SEGMENT_META.never

  const metaLabel = lastVisitLabel || (memberSinceLabel ? t('pos.memberSince', { date: memberSinceLabel }) : null)

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      {/* Kartu member digital — kompak: tinggi ~2 baris (+1 baris preview poin) */}
      <div className="relative overflow-hidden rounded-xl border border-brand/30 bg-dark-card px-3 py-2 lg:py-2.5">
        {/* Aksen emas — pakai overlay transparan, bukan gradient warna-dark
            (gradient stop `to-dark-card` tidak ikut light-mode override). */}
        <div className="pointer-events-none absolute inset-0 bg-brand/[0.06]" />
        <div className="pointer-events-none absolute -right-5 -top-8 h-20 w-20 rounded-full bg-brand/15 blur-2xl" />

        {/* Baris 1: label kartu + badge segmen */}
        <div className="relative flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand">
            <Star size={10} className="fill-brand text-brand flex-shrink-0" />
            {t('pos.loyaltyCardLabel')}
          </span>
          <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-semibold uppercase tracking-wide flex-shrink-0 ${segMeta.cls}`}>
            {segment === 'vip' && <Crown size={9} className="fill-current" />}
            {t(segMeta.key)}
          </span>
        </div>

        {/* Baris 2: saldo poin (fokus) + meta kunjungan inline */}
        <div className="relative mt-1 flex items-baseline gap-x-2.5 gap-y-0.5 flex-wrap">
          <span className="text-lg font-bold text-brand leading-none tabular-nums">
            {points.toLocaleString('id-ID')}
            <span className="text-[10px] font-medium text-muted ml-1">{t('pos.pointsUnit')}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted whitespace-nowrap">
            <Scissors size={10} className="text-brand/70 flex-shrink-0" />
            {t('pos.visitsCount', { count: visits })}
          </span>
          {metaLabel && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted min-w-0">
              <Clock size={10} className="text-brand/70 flex-shrink-0" />
              <span className="truncate">{metaLabel}</span>
            </span>
          )}
        </div>

        {/* Baris 3 (opsional): preview poin transaksi berjalan — disembunyikan
            di mobile demi menghemat ruang zona atas. */}
        {pointsToEarn > 0 && (
          <div className="relative mt-2 hidden lg:flex items-center justify-between gap-2 text-[10px] px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30">
            <span className="text-emerald-300 inline-flex items-center gap-1 font-medium">
              <Star size={9} className="fill-emerald-300 flex-shrink-0" />
              {t('pos.pointsEarnPreview', { points: pointsToEarn })}
            </span>
            <span className="text-emerald-300 whitespace-nowrap">{t('pos.pointsEarnRule')}</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

const PAYMENT_METHODS = [
  { id: 'cash', labelKey: 'pos.cash', icon: '💵' },
  { id: 'transfer', labelKey: 'pos.transfer', icon: '🏦' },
  { id: 'qris', labelKey: 'pos.qris', icon: '📱' },
  { id: 'card', labelKey: 'pos.card', icon: '💳' },
]

// ── Cash payment helpers ─────────────────────────────────────────────────────
// Suggest up to 4 buttons for kasir: the exact amount + round-ups to the
// nearest common Indonesian denominations (5k/10k/20k/50k/100k). Total is
// always the first option and labelled "Pas". Set dedup avoids identical
// neighbours (e.g. when total is already a round 50k).
function suggestCashOptions(total) {
  if (total <= 0) return []
  const DENOMS = [5000, 10000, 20000, 50000, 100000]
  const set = new Set([total])
  for (const d of DENOMS) {
    const rounded = Math.ceil(total / d) * d
    if (rounded > total) set.add(rounded)
  }
  return [...set].sort((a, b) => a - b).slice(0, 5)
}

// Standard "tambah cepat" denomination chips so kasir can stack received bills.
const QUICK_ADD_DENOMS = [10000, 20000, 50000, 100000]

function PaymentModalBody({ posStore, appliedVoucher, methodLabel, processing, onCancel, onConfirm, t }) {
  const total = posStore.getTotal()
  const cashReceived = posStore.cashReceived || 0
  const change = Math.max(0, cashReceived - total)
  const shortage = Math.max(0, total - cashReceived)
  const isCash = posStore.paymentMethod === 'cash'
  const exactMatch = isCash && cashReceived === total && total > 0
  const enough = !isCash || cashReceived >= total
  const cashOptions = isCash ? suggestCashOptions(total) : []

  // Auto-focus the cash input when modal opens with cash method active.
  const inputRef = React.useRef(null)
  React.useEffect(() => {
    if (isCash && inputRef.current) {
      // Defer so the modal mount animation doesn't fight the focus call.
      const id = setTimeout(() => inputRef.current?.focus(), 60)
      return () => clearTimeout(id)
    }
  }, [isCash])

  const addAmount = (delta) => posStore.setCashReceived(cashReceived + delta)
  const setAmount = (amount) => posStore.setCashReceived(amount)

  return (
    <div className="space-y-4">
      {/* HERO: Total */}
      <div className="rounded-2xl p-5 text-center"
        style={{ background: 'linear-gradient(135deg, rgba(99, 102, 241,0.18) 0%, rgba(99, 102, 241,0.06) 100%)', border: '1px solid rgba(99, 102, 241,0.30)' }}>
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted font-semibold">{t('pos.totalPayment')}</p>
        <p className="font-display text-4xl font-bold text-brand tabular-nums mt-1">{formatRupiah(total)}</p>
        <div className="flex items-center justify-center gap-2 mt-2 flex-wrap text-xs text-muted">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-dark-card border border-dark-border">
            <Wallet size={11} /> {methodLabel(posStore.paymentMethod)}
          </span>
          {posStore.selectedCustomer && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-dark-card border border-dark-border truncate max-w-[140px]">
              <User size={11} /> {posStore.selectedCustomer.name}
            </span>
          )}
          {appliedVoucher && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">
              <Tag size={11} /> {appliedVoucher.code}
            </span>
          )}
        </div>
      </div>

      {/* CASH INPUT + QUICK-PAY + QUICK-ADD */}
      {isCash && (
        <div className="space-y-4">
          {/* Amount input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted font-semibold">
                {t('pos.cashAmountLabel')}
              </label>
              {cashReceived > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(0)}
                  className="text-[11px] inline-flex items-center gap-1 text-muted hover:text-off-white transition-colors"
                >
                  <RotateCcw size={11} /> {t('pos.cashReset')}
                </button>
              )}
            </div>
            <div className="relative">
              <span
                className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold pointer-events-none"
                style={{ color: cashReceived > 0 ? '#6366F1' : 'var(--muted, #6b7280)' }}
              >
                Rp
              </span>
              <input
                ref={inputRef}
                type="number" inputMode="numeric" min="0"
                value={cashReceived || ''}
                onChange={e => setAmount(Number(e.target.value) || 0)}
                placeholder={String(total)}
                className={`w-full bg-dark-surface border text-off-white placeholder-muted rounded-2xl pl-12 pr-4 py-4 text-2xl font-bold tabular-nums outline-none transition-colors ${
                  shortage > 0 && cashReceived > 0
                    ? 'border-red-500/50 focus:border-red-500'
                    : exactMatch
                      ? 'border-green-500/60 focus:border-green-500'
                      : enough && cashReceived > 0
                        ? 'border-brand/50 focus:border-brand'
                        : 'border-dark-border focus:border-brand/60'
                }`}
              />
            </div>
          </div>

          {/* Quick-Pay grid */}
          {cashOptions.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] uppercase tracking-wider text-muted font-semibold">
                  {t('pos.quickPayTitle')}
                </p>
                <p className="text-[10px] text-muted">{t('pos.cashSuggestionHint')}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {cashOptions.map((amt, i) => {
                  const isExact = amt === total
                  const isSelected = cashReceived === amt
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setAmount(amt)}
                      className={`relative rounded-xl border px-3 py-3 text-center transition-all active:scale-95 ${
                        isSelected
                          ? 'bg-brand/15 border-brand text-brand shadow-[0_0_0_3px_rgba(99, 102, 241,0.15)]'
                          : isExact
                            ? 'bg-brand/5 border-brand/40 text-off-white hover:bg-brand/10'
                            : 'bg-dark-card border-dark-border text-off-white hover:border-brand/40'
                      }`}
                    >
                      {isExact && (
                        <span className="absolute top-1 right-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand text-dark uppercase tracking-wider">
                          {t('pos.quickCashExact')}
                        </span>
                      )}
                      <span className="block text-sm font-bold tabular-nums">{formatRupiah(amt)}</span>
                      {amt > total && (
                        <span className="block text-[10px] mt-0.5 text-muted">
                          +{formatRupiah(amt - total)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quick-Add chips — stack on top of typed value */}
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-2">
              {t('pos.quickAddTitle')}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {QUICK_ADD_DENOMS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => addAmount(d)}
                  className="rounded-xl border border-dark-border bg-dark-card px-2 py-2 text-xs font-semibold text-off-white hover:border-brand/40 hover:bg-dark-surface transition-all active:scale-95 inline-flex items-center justify-center gap-1"
                >
                  <Plus size={12} />
                  <span className="tabular-nums">
                    {d >= 1000 ? `${d / 1000}k` : d}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* CHANGE / SHORTAGE HERO */}
          {cashReceived > 0 && (
            exactMatch ? (
              <div className="flex items-center justify-center gap-2 p-4 rounded-2xl bg-green-500/10 border border-green-500/30 text-green-400">
                <CheckCircle size={18} />
                <p className="text-sm font-semibold">{t('pos.cashExactMatch')}</p>
              </div>
            ) : enough ? (
              <div className="rounded-2xl p-4 bg-green-500/10 border border-green-500/30">
                <p className="text-[10px] uppercase tracking-[0.2em] text-green-400/80 font-semibold">
                  {t('pos.cashChange')}
                </p>
                <p className="text-2xl font-bold text-green-400 tabular-nums mt-1">
                  {formatRupiah(change)}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl p-4 bg-red-500/10 border border-red-500/30">
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-red-400" />
                  <p className="text-[10px] uppercase tracking-[0.2em] text-red-400/80 font-semibold">
                    {t('pos.cashShortageLabel')}
                  </p>
                </div>
                <p className="text-2xl font-bold text-red-400 tabular-nums mt-1">
                  {formatRupiah(shortage)}
                </p>
              </div>
            )
          )}
        </div>
      )}

      {/* ACTION BUTTONS */}
      <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
        <Button variant="outline" fullWidth onClick={onCancel} disabled={processing}>
          {t('common.cancel')}
        </Button>
        <Button
          fullWidth
          loading={processing}
          disabled={!enough || total <= 0}
          onClick={onConfirm}
          icon={CheckCircle}
        >
          {t('pos.confirmPayButton')}
        </Button>
      </div>
    </div>
  )
}

function POSPageInner() {
  const { t } = useTranslation()

  const methodLabel = (m) => {
    switch (m) {
      case 'cash':     return t('pos.methodCash')
      case 'transfer': return t('pos.methodTransfer')
      case 'qris':     return t('pos.methodQris')
      case 'card':     return t('pos.methodCard')
      default:         return m
    }
  }

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queueId = searchParams.get('queueId')
  const { user } = useAuthStore()
  const posStore = usePosStore()
  const validateVoucherMut = useValidateVoucher()
  const { currentShift, addTransaction: addShiftTransaction } = useShiftStore()
  const { data: apiActiveShift, isLoading: shiftLoading } = useActiveShift(user?.branchId)
  const {
    data: services = [],
    isLoading: servicesLoading,
    isError: servicesError,
    refetch: refetchServices,
  } = useServices({ isActive: 'true' })
  const { data: barbers = [] } = useUsers({ branchId: user?.branchId, role: 'barber' })
  const { data: branches = [] } = useBranches(user?.tenantId)
  const createCustomer = useCreateCustomer()
  const updateQueueStatus = useUpdateQueueStatus()
  const toast = useToast()

  // Real tenant & branch info for receipt.
  // Bug fix 2026-05-28: resolve current branch dari URL slug (`/:branchId/kasir/...`,
  // misal `/kuningan/kasir/pos`) lebih dulu — BUKAN dari user.branchId yang
  // mungkin tidak match (kasir akun tanpa branch tertentu, atau tenant_admin
  // yang akses kasir multi-cabang). URL adalah single-source-of-truth untuk
  // konteks cabang aktif. `matchesBranch` cocokkan slug ke branch.code maupun
  // branch.id (kompatibel dengan account lama yang slug-nya = CUID).
  const { branchId: urlBranchSlug } = useParams()
  const { name: publicTenantName, logo: tenantLogo } = usePublicTenantStore()
  const currentBranch =
    branches.find(b => matchesBranch(urlBranchSlug, b))
    || branches.find(b => b.id === user?.branchId)
    || null
  const tenantName  = currentBranch?.tenant?.name || publicTenantName || 'Barbershop'
  const branchName  = currentBranch?.name  || ''
  const branchAddr  = currentBranch?.address || ''
  const branchPhone = currentBranch?.phone   || ''

  // Feature flag checks — backend-backed, realtime invalidate on `featureFlag:changed`.
  const voucherEnabled       = useIsFeatureEnabled(user?.tenantId, 'voucher')
  // Rating via QR: kanal mandiri tanpa WhatsApp. Endpoint publik /rating/:txId
  // tidak butuh ratingConfig.enabled, jadi QR cukup digate flag fitur ini.
  const ratingEnabled        = useIsFeatureEnabled(user?.tenantId, 'barber_rating')

  // Transaksi hanya boleh saat shift terbuka. `noActiveShift` baru true setelah
  // query selesai (hindari flash blokir saat masih memuat). Backend tetap jadi
  // penjaga utama — frontend ini sekadar UX & cegah submit sia-sia.
  const noActiveShift = !shiftLoading && !apiActiveShift

  // Transaksi tidak boleh diproses kalau ada layanan di keranjang yang belum
  // punya barber — komisi & laporan barber harus tercatat.
  const missingBarber = posStore.cartItems.length > 0 && posStore.cartItems.some(it => !it.barberId)
  // Kasir yang login juga barber (muncul di daftar barber-eligible cabang ini).
  const selfIsBarber = !!user?.id && barbers.some(b => b.id === user.id)
  // Dia satu-satunya barber → tak ada yang perlu dipilih; sembunyikan dropdown
  // dan tampilkan label ringkas "Dilayani: Anda" saja.
  const soloSelfBarber = selfIsBarber && barbers.length === 1
  // Pelanggan wajib dipilih sebelum bayar — tidak boleh transaksi tanpa identitas.
  const missingCustomer = posStore.cartItems.length > 0 && !posStore.selectedCustomer

  // Local UI state
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [showPayModal, setShowPayModal] = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerSearchDeb, setCustomerSearchDeb] = useState('')
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '' })
  // Wilayah pelanggan baru (kecamatan + desa) — opsional, dalam kabupaten toko.
  const [newCustWilayah, setNewCustWilayah] = useState({})
  const [showNewCustForm, setShowNewCustForm] = useState(false)
  const [discountInput, setDiscountInput] = useState({ type: 'percentage', value: '' })
  const [discountTab, setDiscountTab] = useState('manual')
  const [voucherCode, setVoucherCode] = useState('')
  const [appliedVoucher, setAppliedVoucher] = useState(null)
  const [pendingVoucherId, setPendingVoucherId] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [showDraftBanner, setShowDraftBanner] = useState(false)
  const [draft, setDraft] = useState(null)
  const [showCartSheet, setShowCartSheet] = useState(false)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  )
  // Tinggi keyboard on-screen (mobile). Dipakai mengangkat bottom-sheet keranjang
  // supaya tombol "Bayar" tidak ketutup keyboard saat input voucher/diskon/poin.
  const [kbInset, setKbInset] = useState(0)
  // Feedback tombol "Salin link" rating (centang sesaat setelah disalin).
  const [ratingCopied, setRatingCopied] = useState(false)

  // Cetak struk Bluetooth (Web Bluetooth + ESC/POS).
  const bt = useBtPrinter()
  const [paperWidth, setPaperWidth] = useState(() => {
    try { return Number(localStorage.getItem('btPaperWidth')) || 58 } catch { return 58 }
  })
  const [btBusy, setBtBusy] = useState(false)

  const receipt = useRef(null)

  // Debounce customer search → server-side filter
  useEffect(() => {
    const id = setTimeout(() => setCustomerSearchDeb(customerSearch.trim()), 250)
    return () => clearTimeout(id)
  }, [customerSearch])

  // Server-side customer search — hanya fetch saat modal pelanggan terbuka
  // supaya tidak ada request idle yang sia-sia di latar belakang.
  // Default: filter ke pelanggan yg pernah transaksi DI CABANG INI (cabang baru
  // tidak lihat pelanggan cabang lama sebagai noise). Saat kasir ketik nama,
  // search tenant-wide supaya pelanggan loyal lintas-cabang tetap ketemu.
  const { data: customerPage, isFetching: customersFetching } = useCustomers({
    page: 1, limit: 20,
    enabled: showCustomerModal,
    ...(customerSearchDeb
      ? { search: customerSearchDeb }
      : (currentBranch?.id ? { branchId: currentBranch.id } : {})),
  })
  const customers = customerPage?.data || customerPage || []

  // Viewport watcher
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const onChange = (e) => setIsMobile(e.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  // Keyboard watcher — visualViewport menyusut saat keyboard muncul.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      // < 80px dianggap noise (bukan keyboard, mis. toolbar browser)
      setKbInset(inset > 80 ? inset : 0)
    }
    vv.addEventListener('resize', onResize)
    vv.addEventListener('scroll', onResize)
    return () => {
      vv.removeEventListener('resize', onResize)
      vv.removeEventListener('scroll', onResize)
    }
  }, [])

  // Draft protection: load on mount
  useEffect(() => {
    const saved = localStorage.getItem('pos-draft')
    if (saved && posStore.cartItems.length === 0) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.cartItems?.length > 0) {
          setDraft(parsed)
          setShowDraftBanner(true)
        }
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autosave draft (debounced 400ms to avoid localStorage spam on every keystroke)
  useEffect(() => {
    const draftData = {
      cartItems: posStore.cartItems,
      customer: posStore.selectedCustomer,
      discount: { type: posStore.discountType, value: posStore.discountValue },
    }
    const id = setTimeout(() => {
      try { localStorage.setItem('pos-draft', JSON.stringify(draftData)) } catch {}
    }, 400)
    return () => clearTimeout(id)
  }, [posStore.cartItems, posStore.selectedCustomer, posStore.discountType, posStore.discountValue])

  // Auto-pick barber default:
  //  - reset kalau id default sudah tak valid (barber dinonaktifkan → orphan id)
  //  - kalau kasir yang login JUGA barber → default ke DIRINYA (paling sering
  //    melayani); tetap bisa diganti bila ternyata barber lain yang mengerjakan
  //  - selain itu, kalau cabang cuma punya 1 barber → pakai itu
  useEffect(() => {
    if (!barbers.length) return
    if (posStore.defaultBarberId && !barbers.find(b => b.id === posStore.defaultBarberId)) {
      posStore.setDefaultBarber(null, null)
      return
    }
    if (!posStore.defaultBarberId) {
      const self = user?.id ? barbers.find(b => b.id === user.id) : null
      if (self) {
        posStore.setDefaultBarber(self.id, self.name)
      } else if (barbers.length === 1) {
        posStore.setDefaultBarber(barbers[0].id, barbers[0].name)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barbers, user?.id])

  // Pelanggan yang dimuat dari antrian hanya membawa {id,name,phone} tanpa
  // loyaltyPoints → panel tukar poin nonaktif. Ambil data lengkap sekali agar
  // saldo poin terbaca & bisa ditukar.
  useEffect(() => {
    const c = posStore.selectedCustomer
    if (!c?.id || c.loyaltyPoints != null) return
    let cancelled = false
    api.get(`/customers/${c.id}`)
      .then(res => {
        const full = res.data?.data
        if (!cancelled && full && usePosStore.getState().selectedCustomer?.id === full.id) {
          posStore.setSelectedCustomer(full)
        }
      })
      .catch(() => { /* walk-in tanpa akun / 404 → abaikan */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posStore.selectedCustomer?.id])

  const handleRestoreDraft = () => {
    if (!draft) return
    // Pulihkan utuh (cartItems + customer + diskon) tanpa merusak serviceId.
    posStore.restoreDraft(draft)
    setShowDraftBanner(false)
    setDraft(null)
    toast.success(t('pos.draftRestored'))
  }

  const handleDiscardDraft = () => {
    try { localStorage.removeItem('pos-draft') } catch {}
    setShowDraftBanner(false)
    setDraft(null)
  }

  // Kategori chip dibuat dinamis dari layanan tenant — kategori apa pun yang
  // ditambahkan admin di /admin/services otomatis muncul sebagai pill di sini
  // (services di-refetch realtime lewat event service:created/updated/deleted).
  const categories = useMemo(() => {
    const set = new Set()
    for (const svc of services) {
      const c = (svc.category || '').trim()
      if (c) set.add(c)
    }
    return ['All', ...[...set].sort((a, b) => a.localeCompare(b, 'id'))]
  }, [services])

  // Bila kategori terpilih hilang (semua layanannya dihapus admin), kembali ke "Semua".
  useEffect(() => {
    if (category !== 'All' && !categories.includes(category)) setCategory('All')
  }, [categories, category])

  // Memoize service filter to avoid re-running on every render (e.g. cart updates)
  const filtered = useMemo(() => {
    const s = search.toLowerCase()
    return services.filter(svc => {
      const matchSearch = !s || svc.name.toLowerCase().includes(s)
      const matchCat = category === 'All' || svc.category === category
      return matchSearch && matchCat
    })
  }, [services, search, category])

  const handleAddToCart = useCallback((service) => {
    const existing = posStore.cartItems.find(item => item.serviceId === service.id)
    if (existing) { toast.info(t('pos.serviceAlreadyInCart')); return }
    posStore.addToCart(service)
    toast.success(t('pos.serviceAdded', { name: service.name }))
  }, [posStore, t, toast])

  const handleApplyDiscount = () => {
    const raw = Number(discountInput.value)
    if (!Number.isFinite(raw) || raw < 0) {
      return toast.error('Nilai diskon tidak valid')
    }
    const subtotal = posStore.getSubtotal()
    // Clamp: persentase 0–100, nominal 0–subtotal.
    const value = discountInput.type === 'percentage'
      ? Math.min(100, Math.round(raw))
      : Math.min(Math.round(raw), subtotal)
    posStore.setDiscount(discountInput.type, value)
    // Diskon manual & voucher berbagi SATU slot diskon → manual menggantikan
    // voucher. Bersihkan state voucher supaya kodenya tidak ikut terkirim &
    // "termakan" (usedCount naik di backend) padahal diskon yang dipakai manual.
    if (appliedVoucher || posStore.voucherCode) {
      setAppliedVoucher(null)
      setPendingVoucherId(null)
      posStore.setVoucherCode(null)
    }
    setDiscountInput(prev => ({ ...prev, value: String(value) }))
    toast.success(t('pos.discountApplied'))
  }

  const handleApplyVoucher = async () => {
    if (!voucherCode.trim()) return toast.error(t('pos.enterVoucherCode'))
    const subtotal = posStore.getSubtotal()
    try {
      const result = await validateVoucherMut.mutateAsync({ code: voucherCode.trim(), subtotal })
      const v = result.voucher
      setAppliedVoucher(v)
      setPendingVoucherId(v.id)
      // Simpan kode ke store → ikut terkirim di payload transaksi supaya backend
      // yang menaikkan usedCount (atomik) & membalikkannya saat refund.
      posStore.setVoucherCode(v.code)
      if (v.type === 'percentage') posStore.setDiscount('percentage', v.value)
      else                          posStore.setDiscount('flat', v.value)
      toast.success(t('pos.voucherAppliedSuccess', {
        code: v.code,
        discount: v.type === 'percentage' ? v.value + '%' : formatRupiah(v.value),
      }))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('pos.voucherInvalid'))
    }
  }

  const handlePay = async () => {
    if (posStore.cartItems.length === 0) return toast.error(t('pos.cartIsEmpty'))
    if (noActiveShift) {
      setShowPayModal(false)
      return toast.error('Belum ada shift aktif. Buka shift terlebih dahulu sebelum transaksi.')
    }
    if (missingBarber) {
      setShowPayModal(false)
      return toast.error(t('pos.barberRequired'))
    }
    if (missingCustomer) {
      setShowPayModal(false)
      return toast.error('Pilih pelanggan terlebih dahulu')
    }
    // Validasi tukar poin SEBELUM bayar — kalau di bawah minimum/over-cap, backend
    // akan menolak (400) setelah uang diterima. Blokir di sini supaya tak terjadi.
    const redeemErr = posStore.getRedeemError()
    if (redeemErr) {
      setShowPayModal(false)
      return toast.error(redeemErr)
    }
    if (posStore.paymentMethod === 'cash' && posStore.cashReceived < posStore.getTotal()) {
      return toast.error(t('pos.cashNotEnough'))
    }

    setProcessing(true)
    try {
      // AWAIT — sebelumnya race-bug: receipt modal terbuka sebelum txn dibuat
      const txn = await posStore.completeTransaction(
        user.tenantId,
        user.branchId,
        apiActiveShift?.id || null,
        { queueId: queueId || null },
      )

      // usedCount voucher dinaikkan backend (lewat voucherCode di payload), bukan
      // dari klien → tak ada hitung ganda & otomatis balik saat refund.
      setPendingVoucherId(null)
      if (currentShift && txn) addShiftTransaction(txn)
      if (queueId) {
        updateQueueStatus.mutate({ id: queueId, branchId: user.branchId, status: 'paid' })
      }
      try { localStorage.removeItem('pos-draft') } catch {}

      setShowPayModal(false)
      setShowReceiptModal(true)
      setShowCartSheet(false)
      setAppliedVoucher(null)
      setVoucherCode('')

      toast.success(t('pos.transactionSuccess'))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('pos.transactionFailed') || 'Gagal memproses transaksi')
    } finally {
      setProcessing(false)
    }
  }

  const handleNewTransaction = () => {
    posStore.clearCart()
    setShowReceiptModal(false)
    setDiscountInput({ type: 'percentage', value: '' })
    // Bersihkan state voucher React supaya tak bocor ke transaksi berikutnya
    // (mis. setelah pembayaran sebelumnya gagal lalu mulai transaksi baru).
    setAppliedVoucher(null)
    setVoucherCode('')
    setPendingVoucherId(null)
    if (queueId) navigate(`/${getBranchSlug(user)}/kasir/queue`)
  }

  const handleSelectCustomer = (customer) => {
    posStore.setSelectedCustomer(customer)
    setShowCustomerModal(false)
    setCustomerSearch('')
  }

  const handleAddNewCustomer = async () => {
    if (!newCustomerForm.name || !newCustomerForm.phone) return toast.error(t('pos.fillNameAndPhone'))
    try {
      // Gabung wilayah cabang (atau fallback tenant) + pilihan kasir
      // (kecamatan+desa) jadi address lengkap. Hanya disertakan kalau
      // kecamatan dipilih.
      const bw = currentBranch?.wilayah
      const tw = user?.tenant?.wilayah
      const parent = (bw?.kabupatenId ? bw : tw) || null
      const address = (parent?.kabupatenId && newCustWilayah.kecamatanId)
        ? {
            provinsiId: parent.provinsiId, provinsi: parent.provinsi,
            kabupatenId: parent.kabupatenId, kabupaten: parent.kabupaten,
            ...newCustWilayah,
          }
        : undefined
      const newCust = await createCustomer.mutateAsync({
        ...newCustomerForm,
        ...(address ? { address } : {}),
      })
      posStore.setSelectedCustomer(newCust)
      setShowCustomerModal(false)
      setShowNewCustForm(false)
      setNewCustomerForm({ name: '', phone: '' })
      setNewCustWilayah({})
      toast.success(t('pos.newCustomerAdded'))
    } catch (err) {
      toast.error(err?.response?.data?.message || t('pos.addCustomerFailed'))
    }
  }

  const lastTxn = posStore.lastTransaction

  // Link halaman rating publik. Kasir sudah berada di subdomain tenant, jadi
  // origin-nya sudah benar (tenant resolver backend baca dari host header).
  const ratingUrl = lastTxn ? `${window.location.origin}/rating/${lastTxn.id}` : ''
  const showRatingQr = ratingEnabled && !!lastTxn

  const copyRatingLink = async () => {
    if (!ratingUrl) return
    try {
      await navigator.clipboard.writeText(ratingUrl)
      setRatingCopied(true)
      setTimeout(() => setRatingCopied(false), 2000)
    } catch {
      toast.error(t('pos.copyFailed'))
    }
  }

  // Susun data struk → kirim ke printer thermal Bluetooth (ESC/POS).
  const buildReceiptData = () => {
    const meta = [
      { label: t('pos.receiptNo'),   value: `#${lastTxn.id.slice(-8).toUpperCase()}` },
      { label: t('pos.receiptDate'), value: formatDateTimeInTz(lastTxn.createdAt) },
    ]
    if (lastTxn.customerName && lastTxn.customerName !== 'Walk-in Customer')
      meta.push({ label: t('pos.receiptCustomer'), value: lastTxn.customerName })
    const items = lastTxn.services.map((s) => ({ name: s.name, price: formatRupiah(s.price), barber: s.barberName || '' }))
    const rows = [{ label: t('pos.receiptSubtotal'), value: formatRupiah(lastTxn.subtotal) }]
    if (lastTxn.discountAmount > 0) rows.push({ label: t('pos.receiptDiscount'), value: `-${formatRupiah(lastTxn.discountAmount)}` })
    if (lastTxn.pointsRedeemed > 0) rows.push({ label: t('pos.receiptPointsRedeemed', { points: lastTxn.pointsRedeemed }), value: `-${formatRupiah(calcRedeemValue(lastTxn.pointsRedeemed))}` })
    rows.push({ label: t('pos.receiptTotalUpper'), value: formatRupiah(lastTxn.total), bold: true })
    rows.push({ label: t('pos.receiptPaymentRow'), value: methodLabel(lastTxn.paymentMethod) })
    if (lastTxn.cashReceived > 0) rows.push({ label: t('pos.receiptReceived'), value: formatRupiah(lastTxn.cashReceived) })
    if (lastTxn.change > 0)       rows.push({ label: t('pos.receiptChange'),   value: formatRupiah(lastTxn.change) })
    return {
      shopName: tenantName, branchName, branchAddr,
      branchPhone: branchPhone ? `${t('pos.receiptPhonePrefix')}: ${branchPhone}` : '',
      meta, items, rows,
      thanks: t('pos.receiptThanksLong'),
      poweredBy: t('pos.poweredBy'),
      rating: (showRatingQr && ratingUrl) ? { title: t('pos.ratingQrTitle'), url: ratingUrl } : null,
    }
  }

  const handleBtPrint = async () => {
    if (!lastTxn) return
    if (!bt.supported) { toast.error('Browser ini tidak mendukung Bluetooth. Gunakan Chrome di Android.'); return }
    setBtBusy(true)
    try {
      if (!bt.connected) await bt.connect()        // tampilkan pemilih perangkat (butuh klik)
      await bt.write(buildReceipt(buildReceiptData(), paperWidth >= 80 ? 42 : 32))
      toast.success('Struk terkirim ke printer')
    } catch (err) {
      // NotFoundError = pengguna menutup dialog pemilih perangkat → diam saja.
      if (err?.name !== 'NotFoundError') toast.error(err?.message || 'Gagal mencetak via Bluetooth')
    } finally {
      setBtBusy(false)
    }
  }

  // ─── Cart panel (extracted so we can reuse for desktop side + mobile sheet) ──
  const cartPanel = (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── FIXED TOP: pelanggan & barber — selalu terlihat, tidak ikut ter-scroll.
          Lebih ringkas di mobile supaya area keranjang tidak ketutup. ── */}
      <div className="flex-shrink-0 space-y-2 lg:space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-off-white">{t('pos.cart')}</h3>
        {isMobile && (
          <button
            onClick={() => setShowCartSheet(false)}
            className="p-1.5 rounded-lg text-muted hover:text-off-white hover:bg-dark-card"
            aria-label={t('pos.closeCart')}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Pelanggan — di MOBILE jadi satu baris ringkas (hemat tempat); di
          desktop tetap kartu berlabel sejajar dengan kartu barber. */}
      {isMobile ? (
        posStore.selectedCustomer ? (
          <div className="flex items-center gap-2 px-1">
            <User className="w-3.5 h-3.5 text-brand flex-shrink-0" />
            <button onClick={() => setShowCustomerModal(true)} className="flex-1 min-w-0 text-left truncate">
              <span className="text-sm font-medium text-off-white">{posStore.selectedCustomer.name}</span>
              {posStore.selectedCustomer.phone && (
                <span className="text-xs text-muted"> · {posStore.selectedCustomer.phone}</span>
              )}
            </button>
            <button
              onClick={() => posStore.setSelectedCustomer(null)}
              aria-label={t('pos.removeCustomer')}
              className="flex-shrink-0 p-2.5 -m-1 rounded-lg text-muted hover:text-red-400 active:text-red-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowCustomerModal(true)}
            className="w-full flex items-center gap-2 px-1 py-1 text-sm text-muted hover:text-off-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-brand" /> {t('pos.selectCustomerOptional')}
          </button>
        )
      ) : (
        <div className="bg-dark-card border border-dark-border rounded-xl p-3">
          <label className="inline-flex text-[11px] uppercase tracking-wider text-off-white font-semibold mb-2 items-center gap-1.5">
            <User className="w-3 h-3 text-brand" /> {t('pos.customerLabel')}
          </label>
          {posStore.selectedCustomer ? (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand to-amber-600 flex items-center justify-center text-dark font-bold text-sm flex-shrink-0">
                {posStore.selectedCustomer.name?.[0]?.toUpperCase() || '?'}
              </div>
              <button onClick={() => setShowCustomerModal(true)} className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-off-white truncate">{posStore.selectedCustomer.name}</p>
                <p className="text-xs text-muted truncate">{posStore.selectedCustomer.phone || t('pos.noPhone')}</p>
              </button>
              <button
                onClick={() => setShowCustomerModal(true)}
                className="flex-shrink-0 px-2 py-1 rounded-lg text-xs font-medium text-brand hover:bg-brand/10 transition-colors"
              >
                {t('pos.changeCustomer')}
              </button>
              <button
                onClick={() => posStore.setSelectedCustomer(null)}
                aria-label={t('pos.removeCustomer')}
                className="flex-shrink-0 p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-dark-surface transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCustomerModal(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-dark-border text-muted hover:border-brand/40 hover:text-off-white transition-all text-sm"
            >
              <Plus className="w-4 h-4" /> {t('pos.selectCustomerOptional')}
            </button>
          )}
        </div>
      )}

      {/* Kartu member loyalti — hanya di desktop. Di mobile disembunyikan demi
          ruang; saldo poin tetap tampil di bagian "tukar poin" bila diperlukan. */}
      <AnimatePresence>
        {posStore.selectedCustomer && !isMobile && (
          <CustomerHistorySnippet
            customer={posStore.selectedCustomer}
            transactionTotal={posStore.getTotal()}
          />
        )}
      </AnimatePresence>

      {/* Barber selector. Kalau kasir yang login adalah satu-satunya barber di
          cabang ini, tak ada yang perlu dipilih → tampilkan label ringkas
          (otomatis ke dirinya), bukan dropdown. */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-2.5 lg:p-3">
        <label className="hidden lg:inline-flex text-[11px] uppercase tracking-wider text-off-white font-semibold mb-1.5 items-center gap-1.5">
          <Scissors className="w-3 h-3 text-brand" /> {t('pos.barberServing')}
        </label>
        {soloSelfBarber ? (
          <div className="flex items-center gap-2 bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-off-white">
            <Scissors className="w-3.5 h-3.5 text-brand flex-shrink-0" />
            <span className="truncate">{posStore.defaultBarberName || barbers[0]?.name || user?.name}</span>
            <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/30 flex-shrink-0">Anda</span>
          </div>
        ) : (
          <>
            <select
              value={posStore.defaultBarberId || ''}
              onChange={e => {
                const b = barbers.find(x => x.id === e.target.value)
                posStore.setDefaultBarber(b?.id || null, b?.name || null)
              }}
              className={`w-full bg-dark-surface border text-off-white rounded-lg px-3 py-2 text-sm outline-none transition-colors ${
                missingBarber ? 'border-amber-500/60 focus:border-amber-500' : 'border-dark-border focus:border-brand/60'
              }`}
            >
              <option value="">{t('pos.pickBarber')}</option>
              {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {missingBarber && (
              <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1">
                <AlertCircle size={12} /> {t('pos.noBarberWarning')}
              </p>
            )}
          </>
        )}
      </div>
      </div>

      {/* ── SCROLLABLE MIDDLE: keranjang, diskon, poin, ringkasan, metode bayar ── */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 mt-3">
      <div className="space-y-2 min-h-[80px]">
        {posStore.cartItems.length === 0 ? (
          <div className="text-center py-8 text-muted">
            <ShoppingCart size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('pos.cartIsEmpty')}</p>
            <p className="text-xs mt-1">{t('pos.cartEmptyHint')}</p>
          </div>
        ) : (
          posStore.cartItems.map(item => (
            <div key={item.id} className="p-3 bg-dark-card rounded-xl border border-dark-border flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-off-white leading-tight flex-1 min-w-0 truncate">{item.name}</p>
              <span className="text-sm font-semibold text-brand whitespace-nowrap tabular-nums">{formatRupiah(item.price)}</span>
              <button
                onClick={() => posStore.removeFromCart(item.id)}
                className="p-2.5 -m-1 text-muted hover:text-red-400 active:text-red-400 transition-colors flex-shrink-0"
                aria-label={t('common.remove') || 'Remove'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Discount / Voucher */}
      <div className="border-t border-dark-border pt-3">
        <div className="flex gap-1 mb-2">
          <button
            onClick={() => setDiscountTab('manual')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
              discountTab === 'manual' ? 'bg-brand/10 text-brand border border-brand/30' : 'text-muted hover:text-off-white'
            }`}
          >
            {t('pos.manualDiscount')}
          </button>
          {voucherEnabled && (
            <button
              onClick={() => setDiscountTab('voucher')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                discountTab === 'voucher' ? 'bg-brand/10 text-brand border border-brand/30' : 'text-muted hover:text-off-white'
              }`}
            >
              <Tag size={12} /> {t('pos.voucher')}
            </button>
          )}
        </div>

        {discountTab === 'manual' ? (
          <>
          <div className="flex gap-2 flex-wrap">
            <select
              value={discountInput.type}
              onChange={e => setDiscountInput(d => ({ ...d, type: e.target.value }))}
              className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-xs outline-none w-28"
            >
              <option value="percentage">{t('pos.percentDiscount')}</option>
              <option value="flat">{t('pos.flatDiscount')}</option>
            </select>
            <div className="flex-1 flex gap-2 min-w-[140px]">
              <input
                type="number" inputMode="numeric" min="0"
                value={discountInput.value}
                onChange={e => setDiscountInput(d => ({ ...d, value: e.target.value }))}
                placeholder={discountInput.type === 'percentage' ? '10' : '50000'}
                className="flex-1 min-w-0 bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-3 py-2 text-xs outline-none"
              />
              <button
                onClick={handleApplyDiscount}
                className="px-3 py-2 bg-brand/10 border border-brand/20 text-brand rounded-xl text-xs font-medium hover:bg-brand/20 transition-colors flex-shrink-0"
              >
                {t('pos.apply')}
              </button>
            </div>
          </div>
          {!appliedVoucher && posStore.discountValue > 0 && (
            <div className="flex items-center justify-between mt-2 px-2.5 py-1.5 bg-brand/5 border border-brand/20 rounded-lg text-xs">
              <span className="text-muted">
                {t('pos.discountActive', 'Diskon aktif')}:{' '}
                <span className="font-semibold text-brand">
                  {posStore.discountType === 'percentage' ? `${posStore.discountValue}%` : formatRupiah(posStore.discountValue)}
                </span>
              </span>
              <button
                onClick={() => { posStore.setDiscount('percentage', 0); setDiscountInput({ type: 'percentage', value: '' }) }}
                className="text-muted hover:text-red-400 inline-flex items-center gap-1 flex-shrink-0"
                aria-label={t('pos.removeDiscount', 'Hapus diskon')}
              >
                <X size={12} /> {t('common.remove', 'Hapus')}
              </button>
            </div>
          )}
          </>
        ) : (
          <div>
            {appliedVoucher ? (
              <div className="flex items-center gap-2 p-2.5 bg-green-500/10 border border-green-500/20 rounded-xl">
                <Tag size={14} className="text-green-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-green-400 truncate">{appliedVoucher.code}</p>
                  {appliedVoucher.description && (
                    <p className="text-xs text-green-300/70 truncate">{appliedVoucher.description}</p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setAppliedVoucher(null); setPendingVoucherId(null);
                    posStore.setDiscount('percentage', 0); setVoucherCode('')
                  }}
                  className="text-muted hover:text-red-400 flex-shrink-0"
                  aria-label="Hapus voucher"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={voucherCode}
                  onChange={e => setVoucherCode(e.target.value.toUpperCase())}
                  placeholder={t('pos.voucherPlaceholder')}
                  className="flex-1 min-w-0 bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-3 py-2 text-xs outline-none font-mono"
                />
                <button
                  onClick={handleApplyVoucher}
                  disabled={validateVoucherMut.isPending}
                  className="px-3 py-2 bg-brand/10 border border-brand/20 text-brand rounded-xl text-xs font-medium hover:bg-brand/20 transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {t('pos.apply')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Redeem Points — hanya muncul saat customer dipilih + punya saldo cukup + ada item di cart */}
      {posStore.selectedCustomer && (posStore.selectedCustomer.loyaltyPoints || 0) >= MIN_REDEEM_POINTS && posStore.getSubtotal() > 0 && (
        <div className="border-t border-dark-border pt-3">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <span className="text-xs font-semibold text-off-white inline-flex items-center gap-1.5">
              <Star size={12} className="text-brand fill-brand" />
              {t('pos.redeemPointsTitle')}
            </span>
            <span className="text-[10px] text-muted tabular-nums">
              {t('pos.balanceLabel', { balance: (posStore.selectedCustomer.loyaltyPoints || 0).toLocaleString('id-ID') })}
            </span>
          </div>
          {(() => {
            const balance  = posStore.selectedCustomer.loyaltyPoints || 0
            const subtotal = posStore.getSubtotal()
            const cap      = maxRedeemablePoints({ balance, subtotal })
            const current  = posStore.pointsToRedeem || 0
            const discount = calcRedeemValue(current)
            const redeemErr = validateRedeem({ points: current, balance, subtotal })
            return (
              <div className="space-y-2">
                <div className="flex gap-2 items-center flex-wrap">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={cap}
                    step={1}
                    value={current || ''}
                    onChange={e => posStore.setPointsToRedeem(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="flex-1 min-w-0 bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-3 py-2 text-xs outline-none focus:border-brand/60 tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => posStore.setPointsToRedeem(cap)}
                    disabled={cap === 0}
                    className="px-2.5 py-2 bg-brand/10 border border-brand/20 text-brand rounded-xl text-[11px] font-medium hover:bg-brand/20 disabled:opacity-40 whitespace-nowrap"
                  >
                    {t('pos.redeemMax', { max: cap })}
                  </button>
                  {current > 0 && (
                    <button
                      type="button"
                      onClick={() => posStore.setPointsToRedeem(0)}
                      className="px-2 py-2 bg-dark-card border border-dark-border text-muted rounded-xl text-[11px] hover:text-off-white"
                      aria-label={t('pos.redeemClear')}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="flex gap-1 flex-wrap">
                  {[10, 25, 50, 100].filter(n => n <= cap).map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => posStore.setPointsToRedeem(n)}
                      className={`px-2 py-0.5 rounded-md text-[11px] tabular-nums border transition-colors ${
                        current === n
                          ? 'bg-brand/30 border-brand text-brand'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                      }`}
                    >
                      {n} pt
                    </button>
                  ))}
                </div>
                {redeemErr && (
                  <p className="text-[11px] text-red-400 px-1">{redeemErr}</p>
                )}
                {current > 0 ? (
                  <div className="flex justify-between items-center text-[11px] px-2 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30">
                    <span className="text-emerald-300">
                      {t('pos.redeemActive', { points: current })}
                    </span>
                    <span className="text-emerald-300 font-semibold tabular-nums">
                      −{formatRupiah(discount)}
                    </span>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted leading-relaxed">
                    {t('pos.redeemHint', { rate: RUPIAH_PER_POINT.toLocaleString('id-ID'), max: MAX_REDEEM_PERCENT })}
                  </p>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Summary */}
      <div className="border-t border-dark-border pt-3 space-y-2 text-sm">
        <div className="flex justify-between text-muted">
          <span>{t('pos.subtotal')}</span>
          <span className="tabular-nums">{formatRupiah(posStore.getSubtotal())}</span>
        </div>
        {posStore.getManualDiscountAmount() > 0 && (
          <div className="flex justify-between text-green-400">
            <span>{t('pos.discount')}</span>
            <span className="tabular-nums">-{formatRupiah(posStore.getManualDiscountAmount())}</span>
          </div>
        )}
        {posStore.getPointsDiscountAmount() > 0 && (
          <div className="flex justify-between text-emerald-300">
            <span className="inline-flex items-center gap-1">
              <Star size={11} className="fill-emerald-300" />
              {t('pos.pointsDiscount', { points: posStore.pointsToRedeem })}
            </span>
            <span className="tabular-nums">-{formatRupiah(posStore.getPointsDiscountAmount())}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base text-off-white border-t border-dark-border pt-2">
          <span>{t('pos.total')}</span>
          <span className="text-brand tabular-nums">{formatRupiah(posStore.getTotal())}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PAYMENT_METHODS.map(pm => (
          <button
            key={pm.id}
            onClick={() => posStore.setPaymentMethod(pm.id)}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-xs transition-all active:scale-95 ${
              posStore.paymentMethod === pm.id ? 'bg-brand/10 border-brand text-brand' : 'bg-dark-card border-dark-border text-muted hover:border-brand/30'
            }`}
          >
            <span className="text-lg">{pm.icon}</span>
            <span>{t(pm.labelKey)}</span>
          </button>
        ))}
      </div>
      </div>

      {/* ── FIXED BOTTOM: tombol bayar — selalu terlihat tanpa perlu scroll ── */}
      <div className="flex-shrink-0 pt-3 mt-1 border-t border-dark-border">
      {noActiveShift && (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2.5">
          <Clock size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-300">Belum ada shift aktif</p>
            <p className="text-xs text-muted mt-0.5">Buka shift dulu untuk mulai menerima transaksi.</p>
          </div>
          <button
            onClick={() => navigate(`/${getBranchSlug(user)}/kasir/shift-closing`)}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-dark text-xs font-bold hover:bg-amber-400 transition-colors"
          >
            Buka Shift
          </button>
        </div>
      )}
      {!noActiveShift && missingBarber && (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2.5">
          <Scissors size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-300">Barber belum dipilih</p>
            <p className="text-xs text-muted mt-0.5">Pilih barber yang melayani dulu untuk memproses transaksi.</p>
          </div>
        </div>
      )}
      {!noActiveShift && !missingBarber && missingCustomer && (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2.5">
          <User size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-300">Pelanggan belum dipilih</p>
            <p className="text-xs text-muted mt-0.5">Pilih atau tambahkan pelanggan dulu untuk memproses transaksi.</p>
          </div>
        </div>
      )}
      <Button
        fullWidth size="lg"
        disabled={posStore.cartItems.length === 0 || noActiveShift || missingBarber || missingCustomer}
        onClick={() => setShowPayModal(true)}
      >
        {t('pos.payAmount', { amount: formatRupiah(posStore.getTotal()) })}
      </Button>
      </div>
    </div>
  )

  return (
    <div className={`flex flex-col lg:flex-row h-[calc(100dvh-7rem)] gap-4 transition-[padding] ${(queueId || showDraftBanner) ? 'pt-14' : ''}`}>
      {/* Queue Context Banner */}
      {queueId && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-brand/95 px-4 py-2.5 flex items-center gap-3">
          <ListOrdered size={16} className="text-dark flex-shrink-0" />
          <p className="text-dark text-sm font-semibold flex-1 truncate">{t('pos.queueBannerMsg')}</p>
          <button
            onClick={() => navigate(`/${getBranchSlug(user)}/kasir/queue`)}
            className="px-3 py-1 bg-dark/20 text-dark rounded-lg text-xs font-semibold hover:bg-dark/30 transition-colors whitespace-nowrap flex-shrink-0"
          >
            {t('pos.backToQueue')}
          </button>
        </div>
      )}

      {/* Draft Banner */}
      <AnimatePresence>
        {showDraftBanner && (
          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -40, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-50 bg-amber-900/95 border-b border-amber-600/50 px-4 py-3 flex items-center gap-3"
          >
            <AlertCircle size={18} className="text-amber-400 flex-shrink-0" />
            <p className="text-amber-200 text-sm flex-1 truncate">{t('pos.draftMessage')}</p>
            <button onClick={handleRestoreDraft} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-500 transition-colors flex-shrink-0">
              {t('pos.continue')}
            </button>
            <button onClick={handleDiscardDraft} className="px-3 py-1.5 bg-dark-card/60 text-amber-300 rounded-lg text-xs font-semibold hover:bg-dark-card transition-colors flex-shrink-0">
              {t('pos.discard')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LEFT: Services */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 lg:max-h-full pb-20 lg:pb-0">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('pos.searchServicePlaceholder')}
              className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-brand/60"
            />
          </div>
        </div>

        {/* flex-wrap: semua chip kategori terlihat penuh di mobile tanpa
            terpotong/geser-horizontal; di desktop tetap muat satu baris. */}
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 active:scale-95 ${
                category === cat ? 'bg-brand text-dark' : 'bg-dark-card border border-dark-border text-muted hover:text-off-white'
              }`}
            >
              {cat === 'All' ? t('common.all') : cat}
            </button>
          ))}
        </div>

        {/* pb besar di mobile supaya kartu terakhir tidak ketutup bar keranjang mengambang */}
        <div className="flex-1 overflow-y-auto pb-28 lg:pb-0">
          {servicesLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5" aria-hidden="true">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="p-3 rounded-xl border border-dark-border bg-dark-card animate-pulse">
                  <div className="w-7 h-7 rounded-lg bg-dark-surface mb-1.5" />
                  <div className="h-3 w-3/4 rounded bg-dark-surface mb-1.5" />
                  <div className="h-3 w-1/2 rounded bg-dark-surface" />
                </div>
              ))}
            </div>
          ) : servicesError ? (
            <div className="flex flex-col items-center justify-center text-center py-16 text-muted">
              <AlertCircle size={32} className="mb-2 text-red-400" />
              <p className="text-sm">{t('pos.servicesError')}</p>
              <button
                onClick={() => refetchServices()}
                className="mt-3 px-4 py-1.5 rounded-lg bg-brand/10 border border-brand/30 text-brand text-xs font-medium hover:bg-brand/20 transition-colors inline-flex items-center gap-1.5"
              >
                <RotateCcw size={12} /> {t('common.retry')}
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16 text-muted">
              <Search size={32} className="mb-2 opacity-50" />
              <p className="text-sm font-medium text-off-white">{t('pos.servicesEmpty')}</p>
              <p className="text-xs mt-1">{t('pos.servicesEmptyHint')}</p>
            </div>
          ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {filtered.map(svc => {
              const inCart = posStore.cartItems.some(item => item.serviceId === svc.id)
              return (
                <button
                  key={svc.id}
                  onClick={() => handleAddToCart(svc)}
                  className={`relative p-3 rounded-xl border text-left transition-all active:scale-[0.97] ${
                    inCart ? 'bg-brand/10 border-brand/40' : 'bg-dark-card border-dark-border hover:border-brand/30 hover:bg-dark-surface'
                  }`}
                >
                  {inCart && (
                    <span className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-brand text-dark">
                      <Check size={11} strokeWidth={3} />
                    </span>
                  )}
                  <div className="text-xl mb-1.5 leading-none">{svc.icon}</div>
                  <p className="font-medium text-[13px] text-off-white leading-tight mb-0.5 line-clamp-2 min-h-[2.2em]">{svc.name}</p>
                  <p className="text-brand font-semibold text-sm tabular-nums">{formatRupiah(svc.price)}</p>
                  <p className="text-[11px] text-muted mt-0.5">{svc.duration} {t('pos.minutesShort')}</p>
                </button>
              )
            })}
          </div>
          )}
        </div>
      </div>

      {/* RIGHT: Cart — desktop sidebar (lebih lebar agar tidak sesak) */}
      <div className="hidden lg:flex w-full lg:w-[400px] xl:w-[440px] flex-shrink-0 flex-col bg-dark-surface border border-dark-border rounded-2xl p-5 h-full overflow-hidden">
        {cartPanel}
      </div>

      {/* Mobile cart bar — mengambang DI ATAS BottomNav (nav ~80px), full-width */}
      {!showCartSheet && (
        <button
          onClick={() => setShowCartSheet(true)}
          className="lg:hidden fixed left-3 right-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-3 px-4 py-3 rounded-2xl bg-brand text-dark font-semibold shadow-2xl active:scale-[0.98] transition-transform"
          aria-label={t('pos.openCart')}
        >
          <span className="relative flex-shrink-0">
            <ShoppingCart size={20} />
            {posStore.cartItems.length > 0 && (
              <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-dark text-brand text-[10px] font-bold flex items-center justify-center tabular-nums">
                {posStore.cartItems.length}
              </span>
            )}
          </span>
          <span className="text-sm flex-1 text-left truncate">{t('pos.viewCart', { count: posStore.cartItems.length })}</span>
          <span className="tabular-nums text-sm font-bold flex-shrink-0">{formatRupiah(posStore.getTotal())}</span>
        </button>
      )}

      {/* Mobile cart bottom sheet */}
      <AnimatePresence>
        {showCartSheet && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCartSheet(false)}
            />
            <motion.div
              key="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              style={{
                bottom: kbInset,
                maxHeight: kbInset > 0 ? `calc(100dvh - ${kbInset}px)` : undefined,
              }}
              className="lg:hidden fixed inset-x-0 z-50 flex flex-col bg-dark-surface border-t border-dark-border rounded-t-3xl px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] h-[85dvh]"
            >
              <div className="flex justify-center pb-2 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-dark-border" />
              </div>
              {cartPanel}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <Modal isOpen={showPayModal} onClose={() => setShowPayModal(false)} title={t('pos.confirmPayment')}>
        <PaymentModalBody
          posStore={posStore}
          appliedVoucher={appliedVoucher}
          methodLabel={methodLabel}
          processing={processing}
          onCancel={() => setShowPayModal(false)}
          onConfirm={handlePay}
          t={t}
        />
      </Modal>

      {/* Receipt Modal */}
      <Modal isOpen={showReceiptModal} onClose={handleNewTransaction} title={t('pos.paymentSuccess')} size="md">
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <p className="text-lg font-semibold text-off-white">{t('pos.paymentReceived')}</p>
          </div>

          {lastTxn && (
            <div ref={receipt} className="receipt-content bg-white text-gray-900 rounded-xl p-4 font-mono text-sm">
              <div className="text-center mb-3">
                {tenantLogo && (
                  <img src={tenantLogo} alt={tenantName} className="w-14 h-14 rounded-xl object-cover mx-auto mb-2" />
                )}
                <p className="font-bold text-gray-900 text-base leading-tight">{tenantName}</p>
                {branchName && <p className="text-gray-600 text-xs mt-0.5">{branchName}</p>}
                {branchAddr && <p className="text-gray-500 text-xs">{branchAddr}</p>}
                {branchPhone && <p className="text-gray-500 text-xs">{t('pos.receiptPhonePrefix')}: {branchPhone}</p>}
              </div>

              <div className="border-t border-dashed border-gray-300 my-2" />

              <div className="text-xs text-gray-500 space-y-0.5 mb-2">
                <div className="flex justify-between">
                  <span>{t('pos.receiptNo')}</span>
                  <span className="font-medium text-gray-700">#{lastTxn.id.slice(-8).toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('pos.receiptDate')}</span>
                  <span>{formatDateTimeInTz(lastTxn.createdAt)}</span>
                </div>
                {lastTxn.customerName && lastTxn.customerName !== 'Walk-in Customer' && (
                  <div className="flex justify-between gap-3">
                    <span>{t('pos.receiptCustomer')}</span>
                    <span className="text-gray-700 text-right truncate">{lastTxn.customerName}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-gray-300 my-2" />

              <div className="space-y-1.5">
                {lastTxn.services.map((s, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-gray-800 gap-2">
                      <span className="truncate font-medium">{s.name}</span>
                      <span className="flex-shrink-0 tabular-nums">{formatRupiah(s.price)}</span>
                    </div>
                    {s.barberName && (
                      <p className="text-xs text-gray-400 ml-1 truncate">↳ {s.barberName}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed border-gray-300 my-2" />

              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>{t('pos.receiptSubtotal')}</span>
                  <span className="tabular-nums">{formatRupiah(lastTxn.subtotal)}</span>
                </div>
                {lastTxn.discountAmount > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>{t('pos.receiptDiscount')}</span>
                    <span className="tabular-nums">-{formatRupiah(lastTxn.discountAmount)}</span>
                  </div>
                )}
                {lastTxn.pointsRedeemed > 0 && (
                  <div className="flex justify-between text-gray-600 italic text-[10px]">
                    <span>{t('pos.receiptPointsRedeemed', { points: lastTxn.pointsRedeemed })}</span>
                    <span className="tabular-nums">-{formatRupiah(calcRedeemValue(lastTxn.pointsRedeemed))}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm text-gray-900 border-t border-gray-200 pt-1 mt-1">
                  <span>{t('pos.receiptTotalUpper')}</span>
                  <span className="tabular-nums">{formatRupiah(lastTxn.total)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>{t('pos.receiptPaymentRow')}</span>
                  <span>{methodLabel(lastTxn.paymentMethod)}</span>
                </div>
                {lastTxn.cashReceived > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>{t('pos.receiptReceived')}</span>
                    <span className="tabular-nums">{formatRupiah(lastTxn.cashReceived)}</span>
                  </div>
                )}
                {lastTxn.change > 0 && (
                  <div className="flex justify-between font-semibold text-gray-800">
                    <span>{t('pos.receiptChange')}</span>
                    <span className="tabular-nums">{formatRupiah(lastTxn.change)}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-gray-300 my-2" />
              <p className="text-center text-xs text-gray-400">{t('pos.receiptThanksLong')}</p>
              <p className="text-center text-xs text-gray-300 mt-0.5">{t('pos.poweredBy')}</p>

              {/* QR rating — tampil di layar (dalam preview struk) & ikut tercetak.
                  Kanal mandiri tanpa WhatsApp; berguna juga untuk walk-in tanpa HP. */}
              {showRatingQr && (
                <>
                  <div className="border-t border-dashed border-gray-300 my-2" />
                  <div className="flex flex-col items-center gap-1.5 pt-0.5">
                    <p className="text-center text-[11px] font-semibold text-gray-700">{t('pos.ratingQrTitle')}</p>
                    <div className="bg-white p-1.5 rounded-lg">
                      <QRCodeSVG value={ratingUrl} size={104} level="M" marginSize={2} />
                    </div>
                    <p className="text-center text-[10px] text-gray-400 leading-tight">{t('pos.ratingQrCaption')}</p>
                  </div>
                </>
              )}
            </div>
          )}

          {bt.supported && (
            <div className="no-print flex items-center justify-between gap-2 text-xs">
              <span className="text-muted truncate min-w-0">
                {bt.connected
                  ? <>Printer: <b className="text-off-white">{bt.deviceName}</b> · <button type="button" onClick={bt.disconnect} className="text-brand hover:underline">putuskan</button></>
                  : 'Printer Bluetooth belum tersambung'}
              </span>
              <select
                value={paperWidth}
                onChange={(e) => { const v = Number(e.target.value); setPaperWidth(v); try { localStorage.setItem('btPaperWidth', String(v)) } catch { /* noop */ } }}
                className="bg-dark-surface border border-dark-border rounded-lg px-2 py-1 text-xs text-off-white shrink-0"
                aria-label="Lebar kertas struk"
              >
                <option value={58}>58mm</option>
                <option value={80}>80mm</option>
              </select>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 no-print">
            {bt.supported && (
              <Button icon={Bluetooth} fullWidth loading={btBusy} onClick={handleBtPrint}>
                {bt.connected ? 'Cetak Bluetooth' : 'Hubungkan & Cetak'}
              </Button>
            )}
            <Button variant="secondary" icon={Printer} fullWidth onClick={() => window.print()}>
              {t('pos.print')}
            </Button>
            {/* Tombol share WA manual disembunyikan bila notifikasi WA otomatis
                ke pelanggan sudah dikirim server — agar pelanggan tak dapat
                dua pesan untuk transaksi yang sama. */}
            {!lastTxn?.customerWhatsappQueued && (
            <button
              onClick={() => {
                if (!lastTxn) return
                const items = lastTxn.services
                  .map(s => `• ${s.name}${s.barberName ? ` (${s.barberName})` : ''} — ${formatRupiah(s.price)}`)
                  .join('\n')
                const headerLine = branchName ? `${tenantName} — ${branchName}` : tenantName
                // Penutup pesan: pakai teks kustom tenant bila ada (placeholder
                // {nama}/{toko} dirender), jika tidak pakai teks default.
                const shareClosing = lastTxn.waShareMessage
                  ? String(lastTxn.waShareMessage).replace(/\{(\w+)\}/g, (m, k) =>
                      k === 'nama' ? (lastTxn.customer?.name || '')
                      : k === 'toko' ? tenantName
                      : m)
                  : `${t('pos.receiptThanksLong')} 🙏`
                const msg = `*${headerLine}*\n` +
                  (branchAddr ? `${branchAddr}\n` : '') +
                  `\n${t('pos.receiptNo')}: #${lastTxn.id.slice(-8).toUpperCase()}\n` +
                  `${t('pos.receiptDate')}: ${formatDateTimeInTz(lastTxn.createdAt)}\n\n` +
                  `*${t('pos.waItemsHeader')}*\n${items}\n\n` +
                  `${t('pos.receiptSubtotal')}: ${formatRupiah(lastTxn.subtotal)}\n` +
                  (lastTxn.discountAmount > 0 ? `${t('pos.receiptDiscount')}: -${formatRupiah(lastTxn.discountAmount)}\n` : '') +
                  (lastTxn.pointsRedeemed > 0 ? `${t('pos.receiptPointsRedeemed', { points: lastTxn.pointsRedeemed })}: -${formatRupiah(calcRedeemValue(lastTxn.pointsRedeemed))}\n` : '') +
                  `*TOTAL: ${formatRupiah(lastTxn.total)}*\n` +
                  `${t('pos.receiptPaymentRow')}: ${methodLabel(lastTxn.paymentMethod)}\n\n` +
                  shareClosing
                const phone = lastTxn.customer?.phone?.replace(/\D/g, '') || ''
                const intlPhone = phone.startsWith('0') ? '62' + phone.slice(1) : phone
                if (!intlPhone) {
                  toast.error(t('pos.fillNameAndPhone'))
                  return
                }
                window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`, '_blank')
                toast.success(t('pos.openingWhatsapp'))
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm text-white transition-colors"
              style={{ backgroundColor: '#25D366' }}
            >
              <MessageCircle size={16} />
              {t('pos.whatsapp')}
            </button>
            )}
            {showRatingQr && (
              <Button
                variant="secondary"
                icon={ratingCopied ? Check : Copy}
                fullWidth
                onClick={copyRatingLink}
              >
                {ratingCopied ? t('pos.ratingLinkCopied') : t('pos.copyRatingLink')}
              </Button>
            )}
            <Button fullWidth onClick={handleNewTransaction}>{t('pos.newTransaction')}</Button>
          </div>
        </div>
      </Modal>

      {/* Customer Search Modal */}
      <Modal isOpen={showCustomerModal} onClose={() => setShowCustomerModal(false)} title={t('pos.selectCustomer')}>
        <div className="space-y-3">
          <Input
            value={customerSearch}
            onChange={e => setCustomerSearch(e.target.value)}
            placeholder={t('pos.customerSearchPlaceholder')}
            icon={Search}
          />
          <div className="max-h-60 overflow-y-auto space-y-2">
            {customersFetching && customers.length === 0 ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-dark-card rounded-xl border border-dark-border animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-dark-surface flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="h-3.5 w-1/3 rounded bg-dark-surface" />
                    <div className="h-3 w-2/3 rounded bg-dark-surface" />
                  </div>
                </div>
              ))
            ) : customers.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-8 text-muted">
                <User size={28} className="mb-2 opacity-50" />
                <p className="text-xs">
                  {customerSearchDeb
                    ? t('pos.noCustomersFound')
                    : t('pos.noCustomersAtBranch')}
                </p>
                {!customerSearchDeb && (
                  <p className="text-[11px] mt-1 max-w-[18rem] leading-snug">
                    {t('pos.searchAcrossBranches')}
                  </p>
                )}
              </div>
            ) : (
              customers.map(c => {
                const seg = classifyCustomerSegment(c.visitCount, c.lastVisitAt)
                const segMeta = SEGMENT_META[seg]
                return (
                <button
                  key={c.id}
                  onClick={() => handleSelectCustomer(c)}
                  className="w-full flex items-center gap-3 p-3 bg-dark-card rounded-xl hover:bg-dark-surface border border-dark-border hover:border-brand/30 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold text-sm flex-shrink-0">
                    {c.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-off-white truncate">{c.name}</p>
                    <p className="text-xs text-muted truncate">{c.phone} · {t('pos.loyaltyPointsShort', { points: c.loyaltyPoints || 0 })}</p>
                  </div>
                  {seg !== 'never' && (
                    <span className={`ml-auto flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border font-semibold uppercase tracking-wide ${segMeta.cls}`}>
                      {t(segMeta.key)}
                    </span>
                  )}
                </button>
                )
              })
            )}
          </div>
          <div className="border-t border-dark-border pt-3">
            {!showNewCustForm ? (
              <Button variant="secondary" fullWidth icon={Plus} onClick={() => setShowNewCustForm(true)}>
                {t('pos.newCustomer')}
              </Button>
            ) : (
              <div className="space-y-3">
                <Input
                  value={newCustomerForm.name}
                  onChange={e => setNewCustomerForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={t('pos.customerNamePlaceholder')}
                />
                <Input
                  value={newCustomerForm.phone}
                  onChange={e => setNewCustomerForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder={t('pos.customerPhonePlaceholder')}
                />
                {(currentBranch?.wilayah?.kabupatenId || user?.tenant?.wilayah?.kabupatenId) && (
                  <WilayahPicker
                    kabupatenId={currentBranch?.wilayah?.kabupatenId || user.tenant.wilayah.kabupatenId}
                    value={newCustWilayah}
                    onChange={setNewCustWilayah}
                  />
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" fullWidth onClick={() => setShowNewCustForm(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button size="sm" fullWidth loading={createCustomer.isPending} onClick={handleAddNewCustomer}>
                    {t('common.save')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default function POSPage() {
  return (
    <ErrorBoundary>
      <POSPageInner />
    </ErrorBoundary>
  )
}
