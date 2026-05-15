import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, X, User, Printer, CheckCircle, ChevronDown, Tag, Trash2,
  MessageCircle, AlertCircle, Clock, Scissors, Star, ListOrdered, ShoppingCart,
  Banknote, RotateCcw, ArrowDown, Wallet,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { id as idLocale, enUS as enLocale } from 'date-fns/locale'
import { useAuthStore } from '../../store/authStore.js'
import { useTenantStore } from '../../store/tenantStore.js'
import { usePosStore } from '../../store/posStore.js'
import { useUpdateQueueStatus } from '../../hooks/useQueue.js'
import { useBranches } from '../../hooks/useBranches.js'
import { usePublicTenantStore } from '../../store/publicTenantStore.js'
import { useValidateVoucher, useRedeemVoucher } from '../../hooks/useVouchers.js'
import { useIsFeatureEnabled } from '../../hooks/useFeatureFlags.js'
import { getBranchSlug } from '../../utils/branchSlug.js'
import { useShiftStore } from '../../store/shiftStore.js'
import { useActiveShift } from '../../hooks/useShifts.js'
import { useServices } from '../../hooks/useServices.js'
import { useUsers } from '../../hooks/useUsers.js'
import { useCustomers, useCreateCustomer } from '../../hooks/useCustomers.js'
import { useToast } from '../../components/ui/Toast.jsx'
import { StarRating } from '../../components/ui/StarRating.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import Badge from '../../components/ui/Badge.jsx'
import ErrorBoundary from '../../components/ui/ErrorBoundary.jsx'
import { formatRupiah } from '../../utils/format.js'

function CustomerHistorySnippet({ customer }) {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language?.startsWith('en') ? enLocale : idLocale

  // Real data from /api/customers — no localStorage scan
  const visits = customer.visitCount || 0
  const points = customer.loyaltyPoints || 0
  const lastVisitLabel = customer.lastVisit
    ? formatDistanceToNow(new Date(customer.lastVisit), { addSuffix: true, locale: dateLocale })
    : null

  const segment = customer.segment || 'Regular'
  const segmentColor = segment === 'VIP' || segment === 'vip'
    ? 'text-gold bg-gold/10 border-gold/30'
    : segment === 'Regular' || segment === 'loyal'
      ? 'text-blue-400 bg-blue-400/10 border-blue-400/30'
      : 'text-muted bg-dark-surface border-dark-border'

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="px-3 py-2.5 bg-dark-surface/60 border border-dark-border rounded-xl border-l-2 border-l-gold/60 space-y-1.5">
        <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
          {lastVisitLabel && (
            <span className="flex items-center gap-1 truncate">
              <Clock size={11} className="text-gold/70 flex-shrink-0" />
              <span className="truncate">{lastVisitLabel}</span>
            </span>
          )}
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Scissors size={11} className="text-gold/70" />
            {t('pos.visitsCount', { count: visits })}
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <Star size={11} className="text-gold/70" />
            {t('pos.pointsShort', { count: points })}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted italic">{t('pos.noServiceHistory')}</span>
          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${segmentColor}`}>
            {segment}
          </span>
        </div>
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
        style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.18) 0%, rgba(201,168,76,0.06) 100%)', border: '1px solid rgba(201,168,76,0.30)' }}>
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted font-semibold">{t('pos.totalPayment')}</p>
        <p className="font-display text-4xl font-bold text-gold tabular-nums mt-1">{formatRupiah(total)}</p>
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
                style={{ color: cashReceived > 0 ? '#C9A84C' : 'var(--muted, #6b7280)' }}
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
                        ? 'border-gold/50 focus:border-gold'
                        : 'border-dark-border focus:border-gold/60'
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
                          ? 'bg-gold/15 border-gold text-gold shadow-[0_0_0_3px_rgba(201,168,76,0.15)]'
                          : isExact
                            ? 'bg-gold/5 border-gold/40 text-off-white hover:bg-gold/10'
                            : 'bg-dark-card border-dark-border text-off-white hover:border-gold/40'
                      }`}
                    >
                      {isExact && (
                        <span className="absolute top-1 right-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gold text-dark uppercase tracking-wider">
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
                  className="rounded-xl border border-dark-border bg-dark-card px-2 py-2 text-xs font-semibold text-off-white hover:border-gold/40 hover:bg-dark-surface transition-all active:scale-95 inline-flex items-center justify-center gap-1"
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

const CATEGORIES = [
  { id: 'All', labelKey: 'common.all' },
  { id: 'Potong Rambut', labelKey: 'pos.categoryHaircut' },
  { id: 'Perawatan', labelKey: 'pos.categoryTreatment' },
  { id: 'Warna', labelKey: 'pos.categoryColor' },
  { id: 'Combo', labelKey: 'pos.categoryCombo' },
]

function POSPageInner() {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language?.startsWith('en') ? enLocale : idLocale

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
  const { rateBarber } = useTenantStore()
  const posStore = usePosStore()
  const validateVoucherMut = useValidateVoucher()
  const redeemVoucherMut   = useRedeemVoucher()
  const { currentShift, addTransaction: addShiftTransaction } = useShiftStore()
  const { data: apiActiveShift } = useActiveShift(user?.branchId)
  const { data: services = [] } = useServices({ isActive: 'true' })
  const { data: barbers = [] } = useUsers({ branchId: user?.branchId, role: 'barber' })
  const { data: branches = [] } = useBranches(user?.tenantId)
  const createCustomer = useCreateCustomer()
  const updateQueueStatus = useUpdateQueueStatus()
  const toast = useToast()

  // Real tenant & branch info for receipt
  const { name: publicTenantName, logo: tenantLogo } = usePublicTenantStore()
  const currentBranch = branches.find(b => b.id === user?.branchId)
  const tenantName  = currentBranch?.tenant?.name || publicTenantName || 'Barbershop'
  const branchName  = currentBranch?.name  || ''
  const branchAddr  = currentBranch?.address || ''
  const branchPhone = currentBranch?.phone   || ''

  // Feature flag checks — backend-backed, realtime invalidate on `featureFlag:changed`.
  const voucherEnabled       = useIsFeatureEnabled(user?.tenantId, 'voucher')
  const barberRatingEnabled  = useIsFeatureEnabled(user?.tenantId, 'barber_rating')

  // Local UI state
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [showPayModal, setShowPayModal] = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerSearchDeb, setCustomerSearchDeb] = useState('')
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '' })
  const [showNewCustForm, setShowNewCustForm] = useState(false)
  const [discountInput, setDiscountInput] = useState({ type: 'percentage', value: '' })
  const [discountTab, setDiscountTab] = useState('manual')
  const [voucherCode, setVoucherCode] = useState('')
  const [appliedVoucher, setAppliedVoucher] = useState(null)
  const [pendingVoucherId, setPendingVoucherId] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [barberRatings, setBarberRatings] = useState({})
  const [showDraftBanner, setShowDraftBanner] = useState(false)
  const [draft, setDraft] = useState(null)
  const [showCartSheet, setShowCartSheet] = useState(false)
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  )

  const receipt = useRef(null)

  // Debounce customer search → server-side filter
  useEffect(() => {
    const id = setTimeout(() => setCustomerSearchDeb(customerSearch.trim()), 250)
    return () => clearTimeout(id)
  }, [customerSearch])

  // Server-side customer search; only fetch when modal is open (idle limit 1000 if closed default load)
  const { data: customerPage } = useCustomers({
    page: 1, limit: 20,
    ...(customerSearchDeb ? { search: customerSearchDeb } : {}),
  })
  const customers = customerPage?.data || customerPage || []

  // Viewport watcher
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const onChange = (e) => setIsMobile(e.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
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
    const draftData = { cartItems: posStore.cartItems, customer: posStore.selectedCustomer, discount: posStore.discount }
    const id = setTimeout(() => {
      try { localStorage.setItem('pos-draft', JSON.stringify(draftData)) } catch {}
    }, 400)
    return () => clearTimeout(id)
  }, [posStore.cartItems, posStore.selectedCustomer, posStore.discount])

  // Auto-pick: cabang punya 1 barber → set default. Barber inactive → reset (orphan id).
  useEffect(() => {
    if (!barbers.length) return
    if (posStore.defaultBarberId && !barbers.find(b => b.id === posStore.defaultBarberId)) {
      posStore.setDefaultBarber(null, null)
      return
    }
    if (!posStore.defaultBarberId && barbers.length === 1) {
      posStore.setDefaultBarber(barbers[0].id, barbers[0].name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barbers])

  const handleRestoreDraft = () => {
    if (!draft) return
    draft.cartItems.forEach(item => posStore.addToCart(item))
    if (draft.customer) posStore.setSelectedCustomer(draft.customer)
    setShowDraftBanner(false)
    setDraft(null)
    toast.success(t('pos.draftRestored'))
  }

  const handleDiscardDraft = () => {
    try { localStorage.removeItem('pos-draft') } catch {}
    setShowDraftBanner(false)
    setDraft(null)
  }

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
    posStore.setDiscount(discountInput.type, Number(discountInput.value))
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

      if (pendingVoucherId) {
        try { await redeemVoucherMut.mutateAsync(pendingVoucherId) } catch { /* non-fatal */ }
        setPendingVoucherId(null)
      }
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

      if (barberRatingEnabled) {
        const barberIds = [...new Set(posStore.cartItems.map(i => i.barberId).filter(Boolean))]
        const initRatings = {}
        barberIds.forEach(id => { initRatings[id] = 0 })
        setBarberRatings(initRatings)
      }
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
    setBarberRatings({})
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
      const newCust = await createCustomer.mutateAsync({ ...newCustomerForm })
      posStore.setSelectedCustomer(newCust)
      setShowCustomerModal(false)
      setShowNewCustForm(false)
      setNewCustomerForm({ name: '', phone: '' })
      toast.success(t('pos.newCustomerAdded'))
    } catch (err) {
      toast.error(err?.response?.data?.message || t('pos.addCustomerFailed'))
    }
  }

  const handleSubmitRatings = () => {
    let count = 0
    Object.entries(barberRatings).forEach(([barberId, rating]) => {
      if (rating > 0) { rateBarber(barberId, rating); count++ }
    })
    if (count > 0) toast.success(t('pos.ratingsSent', { count }))
    handleNewTransaction()
  }

  const lastTxn = posStore.lastTransaction

  // ─── Cart panel (extracted so we can reuse for desktop side + mobile sheet) ──
  const cartPanel = (
    <>
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

      <button
        onClick={() => setShowCustomerModal(true)}
        className="flex items-center gap-3 p-3 bg-dark-card border border-dark-border rounded-xl hover:border-gold/30 transition-all text-left w-full"
      >
        <User className="w-5 h-5 text-muted flex-shrink-0" />
        <div className="flex-1 min-w-0">
          {posStore.selectedCustomer ? (
            <>
              <p className="text-sm font-medium text-off-white truncate">{posStore.selectedCustomer.name}</p>
              <p className="text-xs text-muted truncate">{posStore.selectedCustomer.phone}</p>
            </>
          ) : (
            <p className="text-sm text-muted">{t('pos.selectCustomerOptional')}</p>
          )}
        </div>
        <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" />
      </button>

      <AnimatePresence>
        {posStore.selectedCustomer && (
          <CustomerHistorySnippet customer={posStore.selectedCustomer} />
        )}
      </AnimatePresence>

      {/* Barber selector */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-3">
        <label className="block text-[11px] uppercase tracking-wider text-off-white font-semibold mb-1.5 inline-flex items-center gap-1.5">
          <Scissors className="w-3 h-3 text-gold" /> {t('pos.barberServing')}
        </label>
        <select
          value={posStore.defaultBarberId || ''}
          onChange={e => {
            const b = barbers.find(x => x.id === e.target.value)
            posStore.setDefaultBarber(b?.id || null, b?.name || null)
          }}
          className="w-full bg-dark-surface border border-dark-border text-off-white rounded-lg px-3 py-2 text-sm outline-none focus:border-gold/60"
        >
          <option value="">{t('pos.pickBarber')}</option>
          {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {!posStore.defaultBarberId && posStore.cartItems.length > 0 && (
          <p className="text-[10px] text-amber-400 mt-1.5 flex items-center gap-1">
            <AlertCircle size={11} /> {t('pos.noBarberWarning')}
          </p>
        )}
      </div>

      <div className="flex-1 space-y-2 min-h-[80px]">
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
              <span className="text-sm font-semibold text-gold whitespace-nowrap tabular-nums">{formatRupiah(item.price)}</span>
              <button
                onClick={() => posStore.removeFromCart(item.id)}
                className="p-1 text-muted hover:text-red-400 transition-colors flex-shrink-0"
                aria-label={t('common.remove') || 'Remove'}
              >
                <X className="w-3.5 h-3.5" />
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
              discountTab === 'manual' ? 'bg-gold/10 text-gold border border-gold/30' : 'text-muted hover:text-off-white'
            }`}
          >
            {t('pos.manualDiscount')}
          </button>
          {voucherEnabled && (
            <button
              onClick={() => setDiscountTab('voucher')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                discountTab === 'voucher' ? 'bg-gold/10 text-gold border border-gold/30' : 'text-muted hover:text-off-white'
              }`}
            >
              <Tag size={12} /> {t('pos.voucher')}
            </button>
          )}
        </div>

        {discountTab === 'manual' ? (
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
                className="px-3 py-2 bg-gold/10 border border-gold/20 text-gold rounded-xl text-xs font-medium hover:bg-gold/20 transition-colors flex-shrink-0"
              >
                {t('pos.apply')}
              </button>
            </div>
          </div>
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
                  aria-label={t('pos.closeCart')}
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
                  className="px-3 py-2 bg-gold/10 border border-gold/20 text-gold rounded-xl text-xs font-medium hover:bg-gold/20 transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {t('pos.apply')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="border-t border-dark-border pt-3 space-y-2 text-sm">
        <div className="flex justify-between text-muted">
          <span>{t('pos.subtotal')}</span>
          <span className="tabular-nums">{formatRupiah(posStore.getSubtotal())}</span>
        </div>
        {posStore.getDiscountAmount() > 0 && (
          <div className="flex justify-between text-green-400">
            <span>{t('pos.discount')}</span>
            <span className="tabular-nums">-{formatRupiah(posStore.getDiscountAmount())}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base text-off-white border-t border-dark-border pt-2">
          <span>{t('pos.total')}</span>
          <span className="text-gold tabular-nums">{formatRupiah(posStore.getTotal())}</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {PAYMENT_METHODS.map(pm => (
          <button
            key={pm.id}
            onClick={() => posStore.setPaymentMethod(pm.id)}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-xs transition-all ${
              posStore.paymentMethod === pm.id ? 'bg-gold/10 border-gold text-gold' : 'bg-dark-card border-dark-border text-muted hover:border-gold/30'
            }`}
          >
            <span className="text-lg">{pm.icon}</span>
            <span>{t(pm.labelKey)}</span>
          </button>
        ))}
      </div>

      <Button
        fullWidth size="lg"
        disabled={posStore.cartItems.length === 0}
        onClick={() => setShowPayModal(true)}
        className="mt-2"
      >
        {t('pos.payAmount', { amount: formatRupiah(posStore.getTotal()) })}
      </Button>
    </>
  )

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-7rem)] gap-4">
      {/* Queue Context Banner */}
      {queueId && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-gold/95 px-4 py-2.5 flex items-center gap-3">
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
              className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-gold/60"
            />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 flex-shrink-0 snap-x">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`snap-start px-4 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                category === cat.id ? 'bg-gold text-dark' : 'bg-dark-card border border-dark-border text-muted hover:text-off-white'
              }`}
            >
              {t(cat.labelKey)}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-3">
            {filtered.map(svc => {
              const inCart = posStore.cartItems.some(item => item.serviceId === svc.id)
              return (
                <button
                  key={svc.id}
                  onClick={() => handleAddToCart(svc)}
                  className={`p-4 rounded-2xl border text-left transition-all ${
                    inCart ? 'bg-gold/10 border-gold/40' : 'bg-dark-card border-dark-border hover:border-gold/30 hover:bg-dark-surface'
                  }`}
                >
                  <div className="text-2xl mb-2">{svc.icon}</div>
                  <p className="font-medium text-sm text-off-white leading-tight mb-1 truncate">{svc.name}</p>
                  <p className="text-gold font-semibold text-sm tabular-nums">{formatRupiah(svc.price)}</p>
                  <p className="text-xs text-muted mt-0.5">{svc.duration} {t('pos.minutesShort')}</p>
                  {inCart && <span className="text-xs text-gold mt-1 block">✓ {t('pos.inCart')}</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* RIGHT: Cart — desktop sidebar */}
      <div className="hidden lg:flex w-full lg:w-[340px] xl:w-[380px] flex-shrink-0 flex-col gap-3 bg-dark-surface border border-dark-border rounded-2xl p-4 max-h-full overflow-y-auto">
        {cartPanel}
      </div>

      {/* Mobile floating cart button (FAB) */}
      <button
        onClick={() => setShowCartSheet(true)}
        className="lg:hidden fixed bottom-4 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-gold text-dark font-semibold shadow-xl hover:scale-105 transition-transform"
        aria-label={t('pos.openCart')}
      >
        <ShoppingCart size={18} />
        <span className="text-sm">{t('pos.viewCart', { count: posStore.cartItems.length })}</span>
        <span className="tabular-nums text-sm font-bold">{formatRupiah(posStore.getTotal())}</span>
      </button>

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
              className="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-dark-surface border-t border-dark-border rounded-t-3xl px-4 pt-3 pb-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-center pb-2">
                <div className="w-10 h-1 rounded-full bg-dark-border" />
              </div>
              <div className="space-y-3">
                {cartPanel}
              </div>
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
                  <span>{format(new Date(lastTxn.createdAt), 'dd/MM/yyyy HH:mm', { locale: dateLocale })}</span>
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
            </div>
          )}

          {/* Barber Rating */}
          {barberRatingEnabled && Object.keys(barberRatings).length > 0 && (
            <div className="p-4 bg-dark-card border border-dark-border rounded-xl">
              <p className="font-semibold text-off-white text-sm mb-3">{t('pos.rateBarber')}</p>
              <div className="space-y-3">
                {Object.keys(barberRatings).map(barberId => {
                  const barber = barbers.find(b => b.id === barberId)
                  if (!barber) return null
                  return (
                    <div key={barberId} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-off-white truncate">{barber.name}</span>
                      <StarRating
                        value={barberRatings[barberId]}
                        onChange={rating => setBarberRatings(r => ({ ...r, [barberId]: rating }))}
                        size={18}
                      />
                    </div>
                  )
                })}
              </div>
              <Button variant="secondary" fullWidth className="mt-3" onClick={handleSubmitRatings}>
                {t('pos.submitRating')}
              </Button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 no-print">
            <Button variant="secondary" icon={Printer} fullWidth onClick={() => window.print()}>
              {t('pos.print')}
            </Button>
            <button
              onClick={() => {
                if (!lastTxn) return
                const items = lastTxn.services
                  .map(s => `• ${s.name}${s.barberName ? ` (${s.barberName})` : ''} — ${formatRupiah(s.price)}`)
                  .join('\n')
                const headerLine = branchName ? `${tenantName} — ${branchName}` : tenantName
                const msg = `*${headerLine}*\n` +
                  (branchAddr ? `${branchAddr}\n` : '') +
                  `\n${t('pos.receiptNo')}: #${lastTxn.id.slice(-8).toUpperCase()}\n` +
                  `${t('pos.receiptDate')}: ${format(new Date(lastTxn.createdAt), 'dd MMM yyyy HH:mm', { locale: dateLocale })}\n\n` +
                  `*${t('pos.waItemsHeader')}*\n${items}\n\n` +
                  `${t('pos.receiptSubtotal')}: ${formatRupiah(lastTxn.subtotal)}\n` +
                  (lastTxn.discountAmount > 0 ? `${t('pos.receiptDiscount')}: -${formatRupiah(lastTxn.discountAmount)}\n` : '') +
                  `*TOTAL: ${formatRupiah(lastTxn.total)}*\n` +
                  `${t('pos.receiptPaymentRow')}: ${methodLabel(lastTxn.paymentMethod)}\n\n` +
                  `${t('pos.receiptThanksLong')} 🙏`
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
            {customers.length === 0 ? (
              <p className="text-center text-xs text-muted py-6">{t('pos.noCustomersFound')}</p>
            ) : (
              customers.map(c => (
                <button
                  key={c.id}
                  onClick={() => handleSelectCustomer(c)}
                  className="w-full flex items-center gap-3 p-3 bg-dark-card rounded-xl hover:bg-dark-surface border border-dark-border hover:border-gold/30 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center text-gold font-bold text-sm flex-shrink-0">
                    {c.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-off-white truncate">{c.name}</p>
                    <p className="text-xs text-muted truncate">{c.phone} · {t('pos.loyaltyPointsShort', { points: c.loyaltyPoints || 0 })}</p>
                  </div>
                  {c.segment && (
                    <Badge variant={c.segment === 'VIP' || c.segment === 'vip' ? 'gold' : 'muted'} className="ml-auto flex-shrink-0">
                      {c.segment}
                    </Badge>
                  )}
                </button>
              ))
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
