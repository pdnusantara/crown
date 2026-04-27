import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, Minus, X, User, Printer, CheckCircle, ChevronDown, Tag, Trash2, MessageCircle, AlertCircle, Clock, Scissors, Star } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { useAuthStore } from '../../store/authStore.js'
import { useTenantStore } from '../../store/tenantStore.js'
import { usePosStore } from '../../store/posStore.js'
import seedData from '../../data/seed.js'
import { useVoucherStore } from '../../store/voucherStore.js'
import { useFeatureFlagStore } from '../../store/featureFlagStore.js'
import { useShiftStore } from '../../store/shiftStore.js'
import { useServices } from '../../hooks/useServices.js'
import { useUsers } from '../../hooks/useUsers.js'
import { useCustomers, useCreateCustomer } from '../../hooks/useCustomers.js'
import { useToast } from '../../components/ui/Toast.jsx'
import { StarRating } from '../../components/ui/StarRating.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { formatRupiah, formatDateTime } from '../../utils/format.js'

function CustomerHistorySnippet({ customer, tenantId }) {
  const allTxns = usePosStore(s => s.transactions)

  const history = useMemo(() => {
    const combined = [
      ...(allTxns ?? []),
      ...(seedData.transactions ?? []),
    ].filter(t => t.customerId === customer.id && t.tenantId === tenantId && t.status === 'completed')

    // Favorite service by frequency
    const freq = {}
    combined.forEach(t => {
      t.services?.forEach(s => { freq[s.name] = (freq[s.name] || 0) + 1 })
    })
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1])
    const topServices = sorted.slice(0, 2).map(([name]) => name)

    return { topServices, txCount: combined.length }
  }, [customer.id, tenantId, allTxns?.length])

  const lastVisitLabel = customer.lastVisit
    ? formatDistanceToNow(new Date(customer.lastVisit), { addSuffix: true, locale: idLocale })
    : null

  const segmentColor = customer.segment === 'VIP' ? 'text-gold bg-gold/10 border-gold/30'
    : customer.segment === 'Regular' ? 'text-blue-400 bg-blue-400/10 border-blue-400/30'
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
        {/* Row 1: last visit + total visits */}
        <div className="flex items-center gap-3 text-xs text-muted">
          {lastVisitLabel && (
            <span className="flex items-center gap-1">
              <Clock size={11} className="text-gold/70" />
              {lastVisitLabel}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Scissors size={11} className="text-gold/70" />
            {customer.totalVisits || history.txCount} kunjungan
          </span>
          <span className="flex items-center gap-1">
            <Star size={11} className="text-gold/70" />
            {customer.loyaltyPoints || 0} pts
          </span>
        </div>
        {/* Row 2: favorite services + segment */}
        <div className="flex items-center gap-2 flex-wrap">
          {history.topServices.length > 0 ? (
            history.topServices.map(name => (
              <span key={name} className="text-[10px] px-1.5 py-0.5 rounded-md bg-dark-card border border-dark-border text-off-white/80">
                {name}
              </span>
            ))
          ) : (
            <span className="text-[10px] text-muted italic">Belum ada riwayat layanan</span>
          )}
          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${segmentColor}`}>
            {customer.segment}
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

const CATEGORIES = [
  { id: 'All', labelKey: 'common.all' },
  { id: 'Potong Rambut', labelKey: 'pos.categoryHaircut' },
  { id: 'Perawatan', labelKey: 'pos.categoryTreatment' },
  { id: 'Warna', labelKey: 'pos.categoryColor' },
  { id: 'Combo', labelKey: 'pos.categoryCombo' },
]

export default function POSPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const { rateBarber } = useTenantStore()
  const posStore = usePosStore()
  const { validateVoucher, useVoucher: applyVoucherUse } = useVoucherStore()
  const { isEnabled } = useFeatureFlagStore()
  const { currentShift, addTransaction: addShiftTransaction } = useShiftStore()
  const { data: services = [] } = useServices()
  const { data: barbers = [] } = useUsers({ branchId: user?.branchId, role: 'barber' })
  const { data: customers = [] } = useCustomers()
  const createCustomer = useCreateCustomer()
  const toast = useToast()

  // Feature flag checks
  const voucherEnabled     = isEnabled(user?.tenantId, 'voucher')
  const loyaltyEnabled     = isEnabled(user?.tenantId, 'loyalty')
  const barberRatingEnabled = isEnabled(user?.tenantId, 'barber_rating')

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [showPayModal, setShowPayModal] = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [newCustomerForm, setNewCustomerForm] = useState({ name: '', phone: '' })
  const [showNewCustForm, setShowNewCustForm] = useState(false)
  const [discountInput, setDiscountInput] = useState({ type: 'percentage', value: '' })
  const [discountTab, setDiscountTab] = useState('manual') // 'manual' | 'voucher'
  const [voucherCode, setVoucherCode] = useState('')
  const [appliedVoucher, setAppliedVoucher] = useState(null)
  const [pendingVoucherId, setPendingVoucherId] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [barberRatings, setBarberRatings] = useState({})
  const [showDraftBanner, setShowDraftBanner] = useState(false)
  const [draft, setDraft] = useState(null)

  const receipt = useRef(null)

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
  }, [])

  // Autosave draft
  useEffect(() => {
    const draftData = { cartItems: posStore.cartItems, customer: posStore.selectedCustomer, discount: posStore.discount }
    localStorage.setItem('pos-draft', JSON.stringify(draftData))
  }, [posStore.cartItems, posStore.selectedCustomer, posStore.discount])

  const handleRestoreDraft = () => {
    if (!draft) return
    draft.cartItems.forEach(item => posStore.addToCart(item))
    if (draft.customer) posStore.setSelectedCustomer(draft.customer)
    setShowDraftBanner(false)
    setDraft(null)
    toast.success(t('pos.draftRestored'))
  }

  const handleDiscardDraft = () => {
    localStorage.removeItem('pos-draft')
    setShowDraftBanner(false)
    setDraft(null)
  }

  const filtered = services.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = category === 'All' || s.category === category
    return matchSearch && matchCat
  })

  const handleAddToCart = (service) => {
    const existing = posStore.cartItems.find(item => item.serviceId === service.id)
    if (existing) { toast.info(t('pos.serviceAlreadyInCart')); return }
    posStore.addToCart(service)
    toast.success(t('pos.serviceAdded', { name: service.name }))
  }

  const handleApplyDiscount = () => {
    posStore.setDiscount(discountInput.type, Number(discountInput.value))
    toast.success(t('pos.discountApplied'))
  }

  const handleApplyVoucher = () => {
    if (!voucherCode.trim()) return toast.error(t('pos.enterVoucherCode'))
    const subtotal = posStore.getSubtotal()
    const result = validateVoucher(voucherCode.trim(), user.tenantId, subtotal)
    if (!result.valid) {
      toast.error(result.error)
      return
    }
    const v = result.voucher
    setAppliedVoucher(v)
    setPendingVoucherId(v.id)
    if (v.type === 'percentage') {
      posStore.setDiscount('percentage', v.value)
    } else {
      posStore.setDiscount('flat', v.value)
    }
    toast.success(t('pos.voucherAppliedSuccess', { code: v.code, discount: v.type === 'percentage' ? v.value + '%' : formatRupiah(v.value) }))
  }

  const handlePay = async () => {
    if (posStore.cartItems.length === 0) return toast.error(t('pos.cartIsEmpty'))
    setProcessing(true)
    await new Promise(r => setTimeout(r, 1000))
    const txn = posStore.completeTransaction(user.tenantId, user.branchId)
    if (pendingVoucherId) {
      applyVoucherUse(pendingVoucherId)
      setPendingVoucherId(null)
    }
    // Record in active shift
    if (currentShift && txn) {
      addShiftTransaction(txn)
    }
    localStorage.removeItem('pos-draft')
    setProcessing(false)
    setShowPayModal(false)
    setShowReceiptModal(true)
    setAppliedVoucher(null)
    setVoucherCode('')
    // Initialize ratings for barbers who served (only if flag enabled)
    if (barberRatingEnabled) {
      const barberIds = [...new Set(posStore.cartItems.map(i => i.barberId).filter(Boolean))]
      const initRatings = {}
      barberIds.forEach(id => { initRatings[id] = 0 })
      setBarberRatings(initRatings)
    }
    toast.success(t('pos.transactionSuccess'))
  }

  const handleNewTransaction = () => {
    posStore.clearCart()
    setShowReceiptModal(false)
    setDiscountInput({ type: 'percentage', value: '' })
    setBarberRatings({})
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
      if (rating > 0) {
        rateBarber(barberId, rating)
        count++
      }
    })
    if (count > 0) toast.success(t('pos.ratingsSent', { count }))
    handleNewTransaction()
  }

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone.includes(customerSearch)
  )

  const lastTxn = posStore.lastTransaction
  const ratedBarbers = lastTxn?.services?.map(s => s.barberId).filter(Boolean) || Object.keys(barberRatings)

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-7rem)] gap-4">
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
            <p className="text-amber-200 text-sm flex-1">{t('pos.draftMessage')}</p>
            <button onClick={handleRestoreDraft} className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-500 transition-colors">
              {t('pos.continue')}
            </button>
            <button onClick={handleDiscardDraft} className="px-3 py-1.5 bg-dark-card/60 text-amber-300 rounded-lg text-xs font-semibold hover:bg-dark-card transition-colors">
              {t('pos.discard')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LEFT: Services */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 lg:max-h-full">
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

        <div className="flex gap-2 overflow-x-auto pb-1 flex-shrink-0">
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setCategory(cat.id)}
              className={`px-4 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${category === cat.id ? 'bg-gold text-dark' : 'bg-dark-card border border-dark-border text-muted hover:text-off-white'}`}
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
                  className={`p-4 rounded-2xl border text-left transition-all ${inCart ? 'bg-gold/10 border-gold/40' : 'bg-dark-card border-dark-border hover:border-gold/30 hover:bg-dark-surface'}`}
                >
                  <div className="text-2xl mb-2">{svc.icon}</div>
                  <p className="font-medium text-sm text-off-white leading-tight mb-1">{svc.name}</p>
                  <p className="text-gold font-semibold text-sm">{formatRupiah(svc.price)}</p>
                  <p className="text-xs text-muted mt-0.5">{svc.duration} {t('pos.minutesShort')}</p>
                  {inCart && <span className="text-xs text-gold mt-1 block">✓ {t('pos.inCart')}</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* RIGHT: Cart */}
      <div className="w-full lg:w-[340px] xl:w-[380px] flex-shrink-0 flex flex-col gap-3 bg-dark-surface border border-dark-border rounded-2xl p-4 max-h-full overflow-y-auto">
        <h3 className="font-semibold text-off-white">{t('pos.cart')}</h3>

        <button
          onClick={() => setShowCustomerModal(true)}
          className="flex items-center gap-3 p-3 bg-dark-card border border-dark-border rounded-xl hover:border-gold/30 transition-all text-left"
        >
          <User className="w-5 h-5 text-muted" />
          <div className="flex-1 min-w-0">
            {posStore.selectedCustomer ? (
              <>
                <p className="text-sm font-medium text-off-white">{posStore.selectedCustomer.name}</p>
                <p className="text-xs text-muted">{posStore.selectedCustomer.phone}</p>
              </>
            ) : (
              <p className="text-sm text-muted">{t('pos.selectCustomerOptional')}</p>
            )}
          </div>
          <ChevronDown className="w-4 h-4 text-muted" />
        </button>

        <AnimatePresence>
          {posStore.selectedCustomer && (
            <CustomerHistorySnippet
              customer={posStore.selectedCustomer}
              tenantId={user?.tenantId}
            />
          )}
        </AnimatePresence>

        <div className="flex-1 space-y-2">
          {posStore.cartItems.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <div className="text-4xl mb-2">🛒</div>
              <p className="text-sm">{t('pos.cartIsEmpty')}</p>
              <p className="text-xs mt-1">{t('pos.cartEmptyHint')}</p>
            </div>
          ) : (
            posStore.cartItems.map(item => (
              <div key={item.id} className="p-3 bg-dark-card rounded-xl border border-dark-border">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-medium text-off-white leading-tight">{item.name}</p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-sm font-semibold text-gold">{formatRupiah(item.price)}</span>
                    <button onClick={() => posStore.removeFromCart(item.id)} className="p-1 text-muted hover:text-red-400 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <select
                  value={item.barberId || ''}
                  onChange={e => {
                    const barber = barbers.find(b => b.id === e.target.value)
                    posStore.updateCartItemBarber(item.id, barber?.id || null, barber?.name || null)
                  }}
                  className="w-full bg-dark-surface border border-dark-border text-off-white rounded-lg px-3 py-1.5 text-xs outline-none"
                >
                  <option value="">{t('pos.selectBarberOption')}</option>
                  {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            ))
          )}
        </div>

        {/* Discount / Voucher */}
        <div className="border-t border-dark-border pt-3">
          <div className="flex gap-1 mb-2">
            <button onClick={() => setDiscountTab('manual')} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${discountTab === 'manual' ? 'bg-gold/10 text-gold border border-gold/30' : 'text-muted hover:text-off-white'}`}>
              {t('pos.manualDiscount')}
            </button>
            {voucherEnabled && (
              <button onClick={() => setDiscountTab('voucher')} className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${discountTab === 'voucher' ? 'bg-gold/10 text-gold border border-gold/30' : 'text-muted hover:text-off-white'}`}>
                <Tag size={12} />
                {t('pos.voucher')}
              </button>
            )}
          </div>

          {discountTab === 'manual' ? (
            <div className="flex gap-2">
              <select
                value={discountInput.type}
                onChange={e => setDiscountInput(d => ({ ...d, type: e.target.value }))}
                className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-xs outline-none w-28"
              >
                <option value="percentage">{t('pos.percentDiscount')}</option>
                <option value="flat">{t('pos.flatDiscount')}</option>
              </select>
              <div className="flex-1 flex gap-2">
                <input
                  type="number"
                  value={discountInput.value}
                  onChange={e => setDiscountInput(d => ({ ...d, value: e.target.value }))}
                  placeholder={discountInput.type === 'percentage' ? '10' : '50000'}
                  className="flex-1 bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-3 py-2 text-xs outline-none"
                />
                <button onClick={handleApplyDiscount} className="px-3 py-2 bg-gold/10 border border-gold/20 text-gold rounded-xl text-xs font-medium hover:bg-gold/20 transition-colors">
                  {t('pos.apply')}
                </button>
              </div>
            </div>
          ) : (
            <div>
              {appliedVoucher ? (
                <div className="flex items-center gap-2 p-2.5 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <Tag size={14} className="text-green-400" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-green-400">{appliedVoucher.code}</p>
                    <p className="text-xs text-green-300/70">{appliedVoucher.description}</p>
                  </div>
                  <button onClick={() => { setAppliedVoucher(null); setPendingVoucherId(null); posStore.setDiscount('percentage', 0); setVoucherCode('') }} className="text-muted hover:text-red-400">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={voucherCode}
                    onChange={e => setVoucherCode(e.target.value.toUpperCase())}
                    placeholder={t('pos.voucherPlaceholder')}
                    className="flex-1 bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-3 py-2 text-xs outline-none font-mono"
                  />
                  <button onClick={handleApplyVoucher} className="px-3 py-2 bg-gold/10 border border-gold/20 text-gold rounded-xl text-xs font-medium hover:bg-gold/20 transition-colors whitespace-nowrap">
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
            <span>{formatRupiah(posStore.getSubtotal())}</span>
          </div>
          {posStore.getDiscountAmount() > 0 && (
            <div className="flex justify-between text-green-400">
              <span>{t('pos.discount')}</span>
              <span>-{formatRupiah(posStore.getDiscountAmount())}</span>
            </div>
          )}
          <div className="flex justify-between text-muted">
            <span>{t('pos.tax')}</span>
            <span>{formatRupiah(posStore.getTax())}</span>
          </div>
          <div className="flex justify-between font-bold text-base text-off-white border-t border-dark-border pt-2">
            <span>{t('pos.total')}</span>
            <span className="text-gold">{formatRupiah(posStore.getTotal())}</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {PAYMENT_METHODS.map(pm => (
            <button
              key={pm.id}
              onClick={() => posStore.setPaymentMethod(pm.id)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-xs transition-all ${posStore.paymentMethod === pm.id ? 'bg-gold/10 border-gold text-gold' : 'bg-dark-card border-dark-border text-muted hover:border-gold/30'}`}
            >
              <span className="text-lg">{pm.icon}</span>
              <span>{t(pm.labelKey)}</span>
            </button>
          ))}
        </div>

        <Button fullWidth size="lg" disabled={posStore.cartItems.length === 0} onClick={() => setShowPayModal(true)} className="mt-2">
          {t('pos.payAmount', { amount: formatRupiah(posStore.getTotal()) })}
        </Button>
      </div>

      {/* Payment Modal */}
      <Modal isOpen={showPayModal} onClose={() => setShowPayModal(false)} title={t('pos.confirmPayment')}>
        <div className="space-y-4">
          <div className="p-4 bg-dark-surface rounded-xl">
            <div className="text-center mb-3">
              <p className="text-muted text-sm mb-1">{t('pos.totalPayment')}</p>
              <p className="text-3xl font-bold text-gold">{formatRupiah(posStore.getTotal())}</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted">
                <span>{t('pos.method')}</span>
                <span className="text-off-white capitalize">{posStore.paymentMethod}</span>
              </div>
              {posStore.selectedCustomer && (
                <div className="flex justify-between text-muted">
                  <span>{t('pos.customerLabel')}</span>
                  <span className="text-off-white">{posStore.selectedCustomer.name}</span>
                </div>
              )}
              {appliedVoucher && (
                <div className="flex justify-between text-green-400">
                  <span>{t('pos.voucherLabel')}</span>
                  <span>{appliedVoucher.code}</span>
                </div>
              )}
            </div>
          </div>

          {posStore.paymentMethod === 'cash' && (
            <div className="space-y-3">
              <Input
                label={t('pos.cashReceivedLabel')}
                type="number"
                value={posStore.cashReceived || ''}
                onChange={e => posStore.setCashReceived(Number(e.target.value))}
                placeholder={posStore.getTotal()}
              />
              {posStore.cashReceived >= posStore.getTotal() && (
                <div className="flex justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                  <span className="text-sm text-green-400">{t('pos.change')}</span>
                  <span className="text-sm font-bold text-green-400">{formatRupiah(posStore.getChange())}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" fullWidth onClick={() => setShowPayModal(false)}>{t('common.cancel')}</Button>
            <Button fullWidth loading={processing} onClick={handlePay}>{t('pos.confirmPayButton')}</Button>
          </div>
        </div>
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
            <div className="receipt-content bg-dark-surface border border-dark-border rounded-xl p-4 font-mono text-sm">
              <div className="text-center mb-3">
                <p className="font-bold text-off-white text-lg">BARBER KING</p>
                <p className="text-muted text-xs">{user.branchId?.replace('bk-', t('pos.receiptBranchPrefix')).toUpperCase()}</p>
                <p className="text-muted text-xs">{formatDateTime(lastTxn.createdAt)}</p>
                <p className="text-muted text-xs">#{lastTxn.id}</p>
              </div>
              <div className="border-t border-dashed border-dark-border my-2" />
              {lastTxn.services.map((s, i) => (
                <div key={i} className="flex justify-between text-off-white">
                  <span className="truncate mr-2">{s.name}</span>
                  <span className="flex-shrink-0">{formatRupiah(s.price)}</span>
                </div>
              ))}
              <div className="border-t border-dashed border-dark-border my-2" />
              <div className="space-y-1">
                <div className="flex justify-between text-muted">
                  <span>{t('pos.subtotal')}</span><span>{formatRupiah(lastTxn.subtotal)}</span>
                </div>
                {lastTxn.discountAmount > 0 && (
                  <div className="flex justify-between text-green-400">
                    <span>{t('pos.discount')}</span><span>-{formatRupiah(lastTxn.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted">
                  <span>{t('pos.receiptTaxLabel')}</span><span>{formatRupiah(lastTxn.tax)}</span>
                </div>
                <div className="flex justify-between font-bold text-off-white">
                  <span>{t('pos.receiptTotalUpper')}</span><span>{formatRupiah(lastTxn.total)}</span>
                </div>
                <div className="flex justify-between text-muted capitalize">
                  <span>{t('pos.receiptPay')}</span><span>{lastTxn.paymentMethod}</span>
                </div>
                {lastTxn.change > 0 && (
                  <div className="flex justify-between text-green-400">
                    <span>{t('pos.receiptReturn')}</span><span>{formatRupiah(lastTxn.change)}</span>
                  </div>
                )}
              </div>
              <div className="border-t border-dashed border-dark-border my-2" />
              <p className="text-center text-xs text-muted">{t('pos.thankYouVisit')}</p>
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
                    <div key={barberId} className="flex items-center justify-between">
                      <span className="text-sm text-off-white">{barber.name}</span>
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

          <div className="flex gap-3 no-print">
            <Button variant="secondary" icon={Printer} fullWidth onClick={() => window.print()}>{t('pos.print')}</Button>
            <button
              onClick={() => {
                if (!lastTxn) return
                const items = lastTxn.services.map(s => `• ${s.name} — ${formatRupiah(s.price)}`).join('\n')
                const msg = `${t('pos.receiptHeader')}\n` +
                  `${t('pos.receiptNoLine', { id: lastTxn.id })}\n` +
                  `${t('pos.receiptDateLine', { date: format(new Date(lastTxn.createdAt), 'dd MMM yyyy HH:mm') })}\n\n` +
                  `${t('pos.receiptServicesLine')}\n${items}\n\n` +
                  `${t('pos.receiptSubtotalLine', { amount: formatRupiah(lastTxn.subtotal) })}\n` +
                  (lastTxn.discountAmount > 0 ? `${t('pos.receiptDiscountLine', { amount: formatRupiah(lastTxn.discountAmount) })}\n` : '') +
                  `${t('pos.receiptTaxLine', { amount: formatRupiah(lastTxn.tax) })}\n` +
                  `${t('pos.receiptTotalLine', { amount: formatRupiah(lastTxn.total) })}\n` +
                  `${t('pos.receiptPayLine', { method: lastTxn.paymentMethod })}\n\n` +
                  `${t('pos.receiptThanks')}`
                const phone = lastTxn.customer?.phone?.replace(/\D/g, '') || ''
                const intlPhone = phone.startsWith('0') ? '62' + phone.slice(1) : phone
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
          <Input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder={t('pos.customerSearchPlaceholder')} icon={Search} />
          <div className="max-h-60 overflow-y-auto space-y-2">
            {filteredCustomers.slice(0, 10).map(c => (
              <button key={c.id} onClick={() => handleSelectCustomer(c)}
                className="w-full flex items-center gap-3 p-3 bg-dark-card rounded-xl hover:bg-dark-surface border border-dark-border hover:border-gold/30 transition-all text-left"
              >
                <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center text-gold font-bold text-sm">
                  {c.name[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-off-white">{c.name}</p>
                  <p className="text-xs text-muted">{c.phone} • {t('pos.loyaltyPointsShort', { points: c.loyaltyPoints })}</p>
                </div>
                <Badge variant={c.segment === 'VIP' ? 'gold' : 'muted'} className="ml-auto">{c.segment}</Badge>
              </button>
            ))}
          </div>
          <div className="border-t border-dark-border pt-3">
            {!showNewCustForm ? (
              <Button variant="secondary" fullWidth icon={Plus} onClick={() => setShowNewCustForm(true)}>{t('pos.newCustomer')}</Button>
            ) : (
              <div className="space-y-3">
                <Input value={newCustomerForm.name} onChange={e => setNewCustomerForm(f => ({ ...f, name: e.target.value }))} placeholder={t('pos.customerNamePlaceholder')} />
                <Input value={newCustomerForm.phone} onChange={e => setNewCustomerForm(f => ({ ...f, phone: e.target.value }))} placeholder={t('pos.customerPhonePlaceholder')} />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" fullWidth onClick={() => setShowNewCustForm(false)}>{t('common.cancel')}</Button>
                  <Button size="sm" fullWidth onClick={handleAddNewCustomer}>{t('common.save')}</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
