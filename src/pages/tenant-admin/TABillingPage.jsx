import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CreditCard, AlertTriangle, CheckCircle, Calendar, Building2, Zap, Receipt, ExternalLink, Plus,
  ArrowUpCircle, RefreshCw, ShieldCheck, Pause, Play, X, Send, Tag, Sparkles, Loader2, Printer, Info,
} from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { useAuthStore } from '../../store/authStore.js'
import {
  useSubscription, useToggleAutoRenew, usePauseSubscription, useResumeSubscription,
} from '../../hooks/useSubscription.js'
import { usePackages } from '../../hooks/usePackages.js'
import { useFeatureCatalog } from '../../hooks/useFeatureCatalog.js'
import { useFeatureFlags } from '../../hooks/useFeatureFlags.js'
import {
  useCreatePaymentOrder, usePaymentStatus, useMyPaymentOrders,
  useCancelPaymentOrder, useResendPaymentLink, useValidatePromo,
} from '../../hooks/usePayment.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import Modal from '../../components/ui/Modal.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { formatRupiah, formatDate } from '../../utils/format.js'

const PACKAGE_TIER = { Basic: 1, Pro: 2, Enterprise: 3 }
const PACKAGE_COLORS = {
  Basic:      { border: 'border-blue-400/30',   badge: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
  Pro:        { border: 'border-brand/30',        badge: 'text-brand bg-brand/10 border-brand/30' },
  Enterprise: { border: 'border-purple-400/30',  badge: 'text-purple-400 bg-purple-400/10 border-purple-400/30' },
}

// Hitung harga annual: 12 × monthly × (1 - discount%/100), bulatkan ke Rp 1.000.
function annualPrice(monthly, discountPct = 17) {
  return Math.round((monthly * 12 * (1 - discountPct / 100)) / 1000) * 1000
}

function genIdempotencyKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

export default function TABillingPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'en' ? 'en-US' : 'id-ID'
  const ALL_FEATURE_FLAGS = useFeatureCatalog()
  const { user } = useAuthStore()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const { data: sub, isLoading: isLoadingSub, error: subError, refetch: refetchSub } = useSubscription(user?.tenantId)
  const { data: pkgData, isLoading: isLoadingPkgs } = usePackages()
  const { data: featureFlags = [], isLoading: flagsLoading } = useFeatureFlags(user?.tenantId)
  const { data: paySettings } = usePaymentStatus()
  const { data: pendingOrders, refetch: refetchOrders } = useMyPaymentOrders()
  const createPayment = useCreatePaymentOrder()
  const cancelOrder   = useCancelPaymentOrder()
  const resendOrder   = useResendPaymentLink()
  const validatePromo = useValidatePromo()
  const toggleAutoRenew = useToggleAutoRenew()
  const pauseSub  = usePauseSubscription()
  const resumeSub = useResumeSubscription()

  const [payError, setPayError] = useState(null)
  const [pendingUpgrade, setPendingUpgrade] = useState(null)
  const [renewModalOpen, setRenewModalOpen] = useState(false)
  const [pauseModalOpen, setPauseModalOpen] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(null)

  // Form state for renew/upgrade — di-share via state object
  const [checkoutForm, setCheckoutForm] = useState({
    cycle: 'monthly',
    promoCode: '',
    promoResult: null, // { code, baseAmount, discount, finalAmount } | { error }
  })

  // Reset checkout form saat modal dibuka/tutup
  function openRenew() {
    setCheckoutForm({ cycle: sub?.billingCycle || 'monthly', promoCode: '', promoResult: null })
    setPayError(null)
    setRenewModalOpen(true)
  }
  function openUpgrade(pkg) {
    setCheckoutForm({ cycle: sub?.billingCycle || 'monthly', promoCode: '', promoResult: null })
    setPayError(null)
    setPendingUpgrade(pkg)
  }

  // Detect ?payment=done from Duitku return — auto refresh + success state
  useEffect(() => {
    if (searchParams.get('payment') === 'done') {
      const orderId = searchParams.get('order')
      setPaymentSuccess(orderId || true)
      // Refetch a few times: callback might lag a few seconds.
      refetchSub(); refetchOrders()
      const t1 = setTimeout(() => { refetchSub(); refetchOrders() }, 3000)
      const t2 = setTimeout(() => { refetchSub(); refetchOrders() }, 8000)
      // Bersihkan query string supaya tidak re-trigger saat user navigasi.
      const next = new URLSearchParams(searchParams)
      next.delete('payment'); next.delete('order')
      setSearchParams(next, { replace: true })
      return () => { clearTimeout(t1); clearTimeout(t2) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handlePayDuitku(type, { invoiceId = null, targetPackage = null, cycle, promotionCode } = {}) {
    if (!sub) return
    setPayError(null)
    try {
      const payload = {
        subscriptionId: sub.id,
        type,
        idempotencyKey: genIdempotencyKey(),
      }
      if (invoiceId) payload.invoiceId = invoiceId
      if (targetPackage) payload.targetPackage = targetPackage
      if (cycle) payload.billingCycle = cycle
      if (promotionCode) payload.promotionCode = promotionCode

      const result = await createPayment.mutateAsync(payload)
      window.open(result.paymentUrl, '_blank', 'noopener,noreferrer')
      return result
    } catch (err) {
      setPayError(err?.response?.data?.error || t('tenantAdmin.billing.createPaymentLinkFailed'))
      throw err
    }
  }

  async function handleApplyPromo(type, targetPackage) {
    if (!checkoutForm.promoCode.trim()) return
    try {
      const data = await validatePromo.mutateAsync({
        code: checkoutForm.promoCode.trim(),
        type,
        targetPackage: targetPackage || null,
        billingCycle: checkoutForm.cycle,
      })
      setCheckoutForm(f => ({ ...f, promoResult: data }))
    } catch (err) {
      setCheckoutForm(f => ({ ...f, promoResult: { error: err?.response?.data?.error || t('tenantAdmin.billing.promoInvalid') } }))
    }
  }

  async function handleConfirmRenew() {
    try {
      await handlePayDuitku('subscription', {
        cycle: checkoutForm.cycle,
        promotionCode: checkoutForm.promoResult?.code || null,
      })
      setRenewModalOpen(false)
    } catch { /* error shown in modal */ }
  }
  async function handleConfirmUpgrade() {
    if (!pendingUpgrade) return
    try {
      await handlePayDuitku('upgrade', {
        targetPackage: pendingUpgrade.name,
        cycle: checkoutForm.cycle,
        promotionCode: checkoutForm.promoResult?.code || null,
      })
      setPendingUpgrade(null)
    } catch { /* error shown in modal */ }
  }

  async function handleCancelOrder(merchantOrderId) {
    try {
      await cancelOrder.mutateAsync(merchantOrderId)
      toast.success(t('tenantAdmin.billing.orderCancelled'))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.billing.orderCancelFailed'))
    }
  }
  async function handleResendOrder(merchantOrderId) {
    try {
      await resendOrder.mutateAsync(merchantOrderId)
      toast.success(t('tenantAdmin.billing.paymentLinkResent'))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.billing.resendFailed'))
    }
  }
  async function handleToggleAutoRenew() {
    try {
      await toggleAutoRenew.mutateAsync({ subscriptionId: sub.id })
      toast.success(sub.autoRenew ? t('tenantAdmin.billing.autoRenewDisabled') : t('tenantAdmin.billing.autoRenewEnabled'))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('common.saveFailed'))
    }
  }
  async function handleResume() {
    try {
      await resumeSub.mutateAsync({ subscriptionId: sub.id })
      toast.success(t('tenantAdmin.billing.subscriptionResumed'))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.billing.resumeFailed'))
    }
  }

  const STATUS_LABEL = {
    active: t('tenantAdmin.billing.statusActive'),
    overdue: t('tenantAdmin.billing.statusOverdue'),
    trial: t('tenantAdmin.billing.statusTrial'),
    expired: t('tenantAdmin.billing.statusExpired'),
    paused: t('tenantAdmin.billing.statusPaused'),
  }

  const packageList = pkgData?.list || []
  const pkg = sub ? (pkgData?.map || {})[sub.package] : null
  // Daftar fitur aktif tenant dibaca dari backend (TenantFeatureFlag), bukan
  // default paket hardcoded — agar konsisten dengan fitur yang benar-benar aktif.
  const flags = featureFlags
  const isLoading = isLoadingSub || isLoadingPkgs || flagsLoading

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-dark-card rounded-xl animate-pulse w-64" />
        <div className="h-40 bg-dark-card rounded-2xl animate-pulse" />
        <div className="h-64 bg-dark-card rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (!sub) {
    const is404 = subError?.response?.status === 404
    return (
      <div className="text-center py-20 text-muted">
        <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
        <p>{is404 ? t('tenantAdmin.billing.subscriptionNotFound') : (subError?.response?.data?.error || t('common.saveFailed'))}</p>
      </div>
    )
  }

  const daysLeft = differenceInDays(new Date(sub.endDate), new Date())
  const style = PACKAGE_COLORS[sub.package] || PACKAGE_COLORS.Basic
  const isPaused = sub.status === 'paused'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-off-white">{t('tenantAdmin.billing.pageTitle')}</h1>
        <p className="text-muted text-sm mt-1">{t('tenantAdmin.billing.pageSubtitle')}</p>
      </div>

      {/* Akses terkunci — langganan berakhir, dialihkan paksa ke Billing */}
      {searchParams.get('locked') === '1' && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-300">{t('tenantAdmin.billing.lockedTitle')}</p>
            <p className="text-xs text-muted mt-0.5">
              {t('tenantAdmin.billing.lockedDesc')}
            </p>
          </div>
        </motion.div>
      )}

      {/* Payment success */}
      {paymentSuccess && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-2xl">
          <CheckCircle size={18} className="text-green-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-300">{t('tenantAdmin.billing.paymentProcessingTitle')}</p>
            <p className="text-xs text-muted mt-0.5">
              {t('tenantAdmin.billing.paymentProcessingDesc')}
            </p>
          </div>
          <button onClick={() => setPaymentSuccess(null)} className="text-muted hover:text-off-white">
            <X size={16} />
          </button>
        </motion.div>
      )}

      {/* Status alerts */}
      {sub.status === 'overdue' && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
          <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-300">{t('tenantAdmin.billing.paymentOverdueTitle')}</p>
            <p className="text-xs text-muted mt-0.5">{t('tenantAdmin.billing.paymentOverdueDesc')}</p>
            <p className="text-xs text-red-300/80 mt-2">
              {t('tenantAdmin.billing.gracePeriodNote')}
            </p>
          </div>
        </motion.div>
      )}

      {isPaused && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-slate-500/10 border border-slate-500/30 rounded-2xl">
          <Pause size={16} className="text-slate-300 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-200">{t('tenantAdmin.billing.subscriptionPausedTitle')}</p>
            <p className="text-xs text-muted mt-0.5">
              {t('tenantAdmin.billing.autoResumeOn', { date: sub.pauseUntil ? format(new Date(sub.pauseUntil), 'dd MMM yyyy') : '—' })}
              {sub.pauseReason && <> {t('tenantAdmin.billing.reasonLabel')} <span className="text-off-white">{sub.pauseReason}</span></>}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleResume} loading={resumeSub.isPending} icon={Play}>
            {t('tenantAdmin.billing.activateNow')}
          </Button>
        </motion.div>
      )}

      {sub.status === 'active' && daysLeft > 0 && daysLeft <= 7 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
          <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-300">
            {t('tenantAdmin.billing.expiresInPrefix')} <strong>{t('tenantAdmin.billing.daysValue', { count: daysLeft })}</strong> ({format(new Date(sub.endDate), 'dd MMM yyyy')}).
          </p>
        </motion.div>
      )}

      {/* Pending payment orders */}
      {pendingOrders?.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Loader2 size={14} className="text-blue-400 animate-spin" />
            <p className="text-sm font-semibold text-blue-300">{t('tenantAdmin.billing.pendingBillsTitle')}</p>
          </div>
          {pendingOrders.map(order => (
            <div key={order.id} className="flex flex-wrap items-center gap-2 justify-between bg-dark-card rounded-xl px-3 py-2 mt-1">
              <div className="min-w-0">
                <p className="text-xs text-off-white font-medium">
                  {order.type === 'subscription' && (order.billingCycle === 'annual' ? t('tenantAdmin.billing.renewAnnual') : t('tenantAdmin.billing.renewSubscription'))}
                  {order.type === 'upgrade' && t('tenantAdmin.billing.upgradeTo', { name: order.targetPackage })}
                  {order.type === 'branch_addon' && t('tenantAdmin.billing.addBranch')}
                </p>
                <p className="text-xs text-muted">
                  {formatRupiah(order.amount)}
                  {order.discountAmount > 0 && <> · {t('tenantAdmin.billing.discountInline', { amount: formatRupiah(order.discountAmount) })}</>}
                  {' · '}{new Date(order.createdAt).toLocaleString(locale)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {order.paymentUrl && (
                  <a
                    href={order.paymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-semibold hover:bg-blue-500/30 transition-all"
                  >
                    <ExternalLink size={11} /> {t('tenantAdmin.billing.pay')}
                  </a>
                )}
                <button
                  onClick={() => handleResendOrder(order.merchantOrderId)}
                  disabled={resendOrder.isPending}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dark-border text-xs text-muted hover:text-off-white hover:border-brand/30 transition-colors disabled:opacity-40"
                  title={t('tenantAdmin.billing.resendLinkTooltip')}
                >
                  <Send size={11} /> {t('tenantAdmin.billing.resend')}
                </button>
                <button
                  onClick={() => handleCancelOrder(order.merchantOrderId)}
                  disabled={cancelOrder.isPending}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/30 text-xs text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                >
                  <X size={11} /> {t('common.cancel')}
                </button>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Current Plan */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className={`p-6 border ${style.border}`}>
          <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
            <div>
              <p className="text-xs text-muted mb-1">{t('tenantAdmin.billing.currentPlan')}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-bold px-2.5 py-1 rounded-full border ${style.badge}`}>{sub.package}</span>
                <Badge variant={sub.status === 'active' ? 'success' : sub.status === 'overdue' ? 'danger' : sub.status === 'paused' ? 'muted' : 'warning'}>
                  {STATUS_LABEL[sub.status] || sub.status}
                </Badge>
                <span className="text-xs text-muted">
                  · {t('tenantAdmin.billing.cycleLabel')} {sub.billingCycle === 'annual' ? t('tenantAdmin.billing.annual') : t('tenantAdmin.billing.monthly')}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-brand">{formatRupiah(sub.price)}</p>
              <p className="text-xs text-muted">{t('tenantAdmin.billing.perMonth')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: t('tenantAdmin.billing.endDate'), value: format(new Date(sub.endDate), 'dd MMM yyyy'), icon: Calendar },
              { label: t('tenantAdmin.billing.daysRemaining'),    value: daysLeft < 0 ? t('tenantAdmin.billing.overdueDays', { count: Math.abs(daysLeft) }) : t('tenantAdmin.billing.daysValue', { count: daysLeft }),
                color: daysLeft < 0 ? 'text-red-400' : daysLeft <= 7 ? 'text-amber-400' : 'text-green-400', icon: AlertTriangle },
              { label: t('tenantAdmin.billing.maxBranches'),  value: pkg?.maxBranches ?? '-', icon: Building2 },
              { label: t('tenantAdmin.billing.autoRenew'),   value: sub.autoRenew ? t('tenantAdmin.billing.on') : t('tenantAdmin.billing.off'),
                color: sub.autoRenew ? 'text-green-400' : 'text-muted', icon: CheckCircle },
            ].map(item => (
              <div key={item.label} className="bg-dark-card rounded-xl p-3 text-center">
                <item.icon size={14} className="text-muted mx-auto mb-1" />
                <p className={`font-semibold text-sm ${item.color || 'text-off-white'}`}>{item.value}</p>
                <p className="text-xs text-muted">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Aksi cepat */}
          {paySettings?.active ? (
            <div className="flex flex-wrap gap-2 pt-4 border-t border-dark-border/60">
              <Button size="sm" className="gap-1.5" disabled={isPaused} onClick={openRenew}>
                <RefreshCw size={13} /> {t('tenantAdmin.billing.renew')}
              </Button>
              <a
                href="#available-packages"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-card border border-dark-border text-xs font-semibold text-off-white hover:border-brand/40 transition-colors"
              >
                <ArrowUpCircle size={13} /> {t('tenantAdmin.billing.upgradePackage')}
              </a>
              <button
                onClick={handleToggleAutoRenew}
                disabled={toggleAutoRenew.isPending || isPaused}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40 ${
                  sub.autoRenew
                    ? 'bg-green-500/10 border-green-500/30 text-green-300 hover:bg-green-500/20'
                    : 'bg-dark-card border-dark-border text-muted hover:border-brand/30 hover:text-off-white'
                }`}
              >
                <RefreshCw size={11} className={toggleAutoRenew.isPending ? 'animate-spin' : ''} />
                {t('tenantAdmin.billing.autoRenewLabel')} {sub.autoRenew ? t('tenantAdmin.billing.onCaps') : t('tenantAdmin.billing.off')}
              </button>
              {!isPaused && (
                <button
                  onClick={() => setPauseModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-card border border-dark-border text-xs text-muted hover:border-amber-500/40 hover:text-amber-300 transition-colors"
                >
                  <Pause size={11} /> {t('tenantAdmin.billing.pauseSubscription')}
                </button>
              )}
              {payError && <p className="text-xs text-red-400 w-full mt-1">{payError}</p>}
              <p className="text-xs text-muted w-full mt-1 flex items-center gap-1">
                <ShieldCheck size={12} className="text-green-400" />
                {t('tenantAdmin.billing.securePaymentNote')}
              </p>
            </div>
          ) : (
            <div className="pt-4 border-t border-dark-border/60">
              <p className="text-xs text-amber-300/80 flex items-start gap-1.5">
                <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                {t('tenantAdmin.billing.gatewayInactiveNote')}
              </p>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Available Packages */}
      <motion.div id="available-packages" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <h2 className="text-sm font-semibold text-muted uppercase mb-3">{t('tenantAdmin.billing.availablePackages')}</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {packageList.map(p => {
            const isCurrent = sub.package === p.name
            const pStyle    = PACKAGE_COLORS[p.name] || PACKAGE_COLORS.Basic
            const currentTier = PACKAGE_TIER[sub.package] || 0
            const targetTier  = PACKAGE_TIER[p.name] || 0
            const isUpgrade   = targetTier > currentTier
            const isDowngrade = targetTier < currentTier
            const annual = annualPrice(p.price, p.annualDiscountPercent ?? 17)
            return (
              <Card key={p.name} className={`p-4 border ${pStyle.border} ${isCurrent ? 'ring-1 ring-brand/40' : ''} flex flex-col`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${pStyle.badge}`}>{p.name}</span>
                  {isCurrent && <CheckCircle size={14} className="text-brand" />}
                </div>
                <p className="text-2xl font-bold text-off-white mb-1">
                  {formatRupiah(p.price)}<span className="text-xs text-muted font-normal">{t('tenantAdmin.billing.perMonthShort')}</span>
                </p>
                <p className="text-[11px] text-green-400 mb-2">
                  {t('tenantAdmin.billing.annualLabel')} {formatRupiah(annual)} <span className="text-muted">{t('tenantAdmin.billing.savePercent', { percent: p.annualDiscountPercent ?? 17 })}</span>
                </p>
                <div className="space-y-1 text-xs text-muted mt-1 flex-1">
                  <p>{t('tenantAdmin.billing.maxBranchesLine', { value: p.maxBranches })}</p>
                  <p>{t('tenantAdmin.billing.maxStaffLine', { value: p.maxStaff })}</p>
                  {p.branchAddonPrice > 0 && <p>{t('tenantAdmin.billing.addBranchLine', { price: formatRupiah(p.branchAddonPrice) })}</p>}
                </div>
                <div className="mt-3">
                  {isCurrent && <p className="text-xs text-green-400">{t('tenantAdmin.billing.yourActivePackage')}</p>}
                  {!isCurrent && isUpgrade && paySettings?.active && (
                    <Button size="sm" fullWidth className="gap-1.5" onClick={() => openUpgrade(p)} disabled={isPaused}>
                      <ArrowUpCircle size={13} /> {t('tenantAdmin.billing.upgradeTo', { name: p.name })}
                    </Button>
                  )}
                  {!isCurrent && isUpgrade && !paySettings?.active && (
                    <p className="text-xs text-amber-300/80">{t('tenantAdmin.billing.gatewayInactiveContactAdmin')}</p>
                  )}
                  {!isCurrent && isDowngrade && (
                    <p className="text-xs text-muted">{t('tenantAdmin.billing.downgradeContactAdmin')}</p>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      </motion.div>

      {/* Branch addon */}
      {paySettings?.active && pkg?.branchAddonPrice > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <Card className="p-5 border border-purple-400/20 bg-purple-400/5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Plus size={14} className="text-purple-400" />
                  <h3 className="font-semibold text-off-white text-sm">{t('tenantAdmin.billing.addBranchLicense')}</h3>
                </div>
                <p className="text-xs text-muted">
                  {t('tenantAdmin.billing.buyBranchLicensePrefix')}{' '}
                  <span className="text-purple-300 font-semibold">{formatRupiah(pkg.branchAddonPrice)}</span>
                  {pkg.branchAddonType === 'monthly' ? t('tenantAdmin.billing.perMonth') : t('tenantAdmin.billing.oneTimePayment')}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0 gap-1.5 border-purple-400/30 text-purple-300 hover:bg-purple-400/10"
                loading={createPayment.isPending}
                disabled={isPaused}
                onClick={() => handlePayDuitku('branch_addon')}
              >
                <ExternalLink size={13} /> {t('tenantAdmin.billing.buyViaDuitku')}
              </Button>
            </div>
            {payError && <p className="text-xs text-red-400 mt-2">{payError}</p>}
          </Card>
        </motion.div>
      )}

      {/* Active Feature Flags */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-brand" />
              <h3 className="font-semibold text-off-white">{t('tenantAdmin.billing.activeFeatures')}</h3>
              <span className="text-xs text-muted ml-1">{t('tenantAdmin.billing.featureCount', { active: flags.length, total: ALL_FEATURE_FLAGS.length })}</span>
            </div>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {ALL_FEATURE_FLAGS.map(f => {
                const active = flags.includes(f.id)
                return (
                  <span key={f.id} className={`px-2.5 py-1 rounded-full border text-xs font-medium ${active ? 'border-brand/30 bg-brand/10 text-brand' : 'border-dark-border text-muted opacity-40 line-through'}`}>
                    {f.label}
                  </span>
                )
              })}
            </div>
          </CardBody>
        </Card>
      </motion.div>

      {/* Invoice History */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Receipt size={15} className="text-brand" />
              <h3 className="font-semibold text-off-white">{t('tenantAdmin.billing.invoiceHistory')}</h3>
            </div>
          </CardHeader>
          <CardBody className="space-y-2">
            {!sub.invoices?.length ? (
              <p className="text-sm text-muted text-center py-4">{t('tenantAdmin.billing.noInvoicesYet')}</p>
            ) : (
              sub.invoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-3 bg-dark-card rounded-xl border border-dark-border">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-off-white font-medium">{inv.period}</p>
                      {inv.type === 'branch_addon' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-400/10 text-purple-400 border border-purple-400/20">{t('tenantAdmin.billing.branchAddon')}</span>
                      )}
                      {inv.billingCycle === 'annual' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-400/10 text-green-400 border border-green-400/20">{t('tenantAdmin.billing.annual')}</span>
                      )}
                      {inv.promotionCode && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300 border border-amber-400/20 inline-flex items-center gap-1">
                          <Tag size={9} /> {inv.promotionCode}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted">{formatDate(inv.createdAt || inv.paidAt)}</p>
                    {inv.discountAmount > 0 && (
                      <p className="text-xs text-green-400">{t('tenantAdmin.billing.discountLabel', { amount: formatRupiah(inv.discountAmount) })}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-brand">{formatRupiah(inv.amount)}</span>
                    <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'danger' : 'warning'}>
                      {inv.status === 'paid' ? t('tenantAdmin.billing.paid') : inv.status === 'overdue' ? t('tenantAdmin.billing.overdue') : t('tenantAdmin.billing.pending')}
                    </Badge>
                    {inv.status === 'paid' && (
                      <a
                        href={`/admin/billing/invoice/${inv.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-dark-surface border border-dark-border text-xs text-muted hover:text-off-white hover:border-brand/30 transition-all"
                        title={t('tenantAdmin.billing.printReceipt')}
                      >
                        <Printer size={11} />
                      </a>
                    )}
                    {inv.status !== 'paid' && paySettings?.active && (
                      <button
                        onClick={() => handlePayDuitku(inv.type || 'subscription', { invoiceId: inv.id, cycle: inv.billingCycle || 'monthly' })}
                        disabled={createPayment.isPending}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-all disabled:opacity-40"
                      >
                        <ExternalLink size={11} /> {t('tenantAdmin.billing.pay')}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </motion.div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <RenewModal
        isOpen={renewModalOpen}
        onClose={() => setRenewModalOpen(false)}
        sub={sub}
        pkg={pkg}
        form={checkoutForm}
        setForm={setCheckoutForm}
        onApplyPromo={() => handleApplyPromo('subscription', null)}
        promoLoading={validatePromo.isPending}
        onConfirm={handleConfirmRenew}
        loading={createPayment.isPending}
        payError={payError}
      />

      <UpgradeModal
        isOpen={!!pendingUpgrade}
        onClose={() => { setPendingUpgrade(null); setPayError(null) }}
        sub={sub}
        target={pendingUpgrade}
        form={checkoutForm}
        setForm={setCheckoutForm}
        onApplyPromo={() => pendingUpgrade && handleApplyPromo('upgrade', pendingUpgrade.name)}
        promoLoading={validatePromo.isPending}
        onConfirm={handleConfirmUpgrade}
        loading={createPayment.isPending}
        payError={payError}
      />

      <PauseModal
        isOpen={pauseModalOpen}
        onClose={() => setPauseModalOpen(false)}
        sub={sub}
        onConfirm={async (pauseUntilISO, reason) => {
          try {
            await pauseSub.mutateAsync({ subscriptionId: sub.id, pauseUntil: pauseUntilISO, reason })
            toast.success(t('tenantAdmin.billing.subscriptionPaused'))
            setPauseModalOpen(false)
          } catch (err) {
            toast.error(err?.response?.data?.error || t('tenantAdmin.billing.pauseFailed'))
          }
        }}
        loading={pauseSub.isPending}
      />
    </div>
  )
}

// ── Modals ────────────────────────────────────────────────────────────────

function CycleToggle({ value, onChange, monthlyPrice, annualDiscountPct = 17 }) {
  const { t } = useTranslation()
  const annual = annualPrice(monthlyPrice, annualDiscountPct)
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {[
        { id: 'monthly', label: t('tenantAdmin.billing.monthly'), price: monthlyPrice, hint: t('tenantAdmin.billing.monthlyHint') },
        { id: 'annual',  label: t('tenantAdmin.billing.annual'), price: annual,        hint: t('tenantAdmin.billing.annualHint', { percent: annualDiscountPct, months: (12 * (1 - annualDiscountPct / 100)).toFixed(0) }) },
      ].map(opt => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`text-left p-3 rounded-xl border transition-all ${
            value === opt.id ? 'border-brand/60 bg-brand/10' : 'border-dark-border bg-dark-card hover:border-brand/30'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`text-sm font-semibold ${value === opt.id ? 'text-brand' : 'text-off-white'}`}>{opt.label}</span>
            {value === opt.id && <CheckCircle size={14} className="text-brand" />}
          </div>
          <p className="text-base font-bold text-off-white">{formatRupiah(opt.price)}</p>
          <p className="text-[11px] text-muted">{opt.hint}</p>
        </button>
      ))}
    </div>
  )
}

function PromoInput({ form, setForm, onApply, loading }) {
  const { t } = useTranslation()
  const result = form.promoResult
  const hasError = result?.error
  const hasOk    = result && !result.error
  return (
    <div>
      <label className="text-xs text-muted block mb-1">{t('tenantAdmin.billing.promoCodeLabel')}</label>
      <div className="flex gap-2">
        <Input
          icon={Tag}
          placeholder={t('tenantAdmin.billing.promoCodePlaceholder')}
          value={form.promoCode}
          onChange={e => setForm(f => ({ ...f, promoCode: e.target.value, promoResult: null }))}
        />
        <Button size="sm" variant="secondary" onClick={onApply} loading={loading} disabled={!form.promoCode.trim()}>
          {t('tenantAdmin.billing.apply')}
        </Button>
      </div>
      {hasError && <p className="text-xs text-red-400 mt-1">{result.error}</p>}
      {hasOk && (
        <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
          <Sparkles size={11} /> {t('tenantAdmin.billing.promoApplied', { code: result.code, amount: formatRupiah(result.discount) })}
        </p>
      )}
    </div>
  )
}

function CheckoutSummary({ baseAmount, discount, finalAmount }) {
  const { t } = useTranslation()
  return (
    <div className="p-3 bg-dark-card rounded-xl border border-dark-border space-y-1.5 text-sm">
      <div className="flex justify-between text-muted">
        <span>{t('tenantAdmin.billing.subtotal')}</span>
        <span>{formatRupiah(baseAmount)}</span>
      </div>
      {discount > 0 && (
        <div className="flex justify-between text-green-400">
          <span>{t('tenantAdmin.billing.discount')}</span>
          <span>− {formatRupiah(discount)}</span>
        </div>
      )}
      <div className="flex justify-between text-off-white font-bold pt-1.5 border-t border-dark-border/60">
        <span>{t('tenantAdmin.billing.totalToPay')}</span>
        <span>{formatRupiah(finalAmount)}</span>
      </div>
    </div>
  )
}

function RenewModal({ isOpen, onClose, sub, pkg, form, setForm, onApplyPromo, promoLoading, onConfirm, loading, payError }) {
  const { t } = useTranslation()
  if (!sub || !pkg) return null
  const monthly = pkg.price
  const annualDiscPct = pkg.annualDiscountPercent ?? 17
  const baseAmount = form.cycle === 'annual' ? annualPrice(monthly, annualDiscPct) : monthly
  const discount = form.promoResult?.discount || 0
  const finalAmount = baseAmount - discount

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('tenantAdmin.billing.renewSubscription')}>
      <div className="space-y-4">
        <CycleToggle
          value={form.cycle}
          onChange={(c) => setForm(f => ({ ...f, cycle: c, promoResult: null }))}
          monthlyPrice={monthly}
          annualDiscountPct={annualDiscPct}
        />

        <PromoInput form={form} setForm={setForm} onApply={onApplyPromo} loading={promoLoading} />

        <CheckoutSummary baseAmount={baseAmount} discount={discount} finalAmount={finalAmount} />

        <p className="text-xs text-muted flex items-start gap-1.5">
          <Info size={11} className="mt-0.5 flex-shrink-0" />
          {t('tenantAdmin.billing.renewPeriodNote', { days: form.cycle === 'annual' ? t('tenantAdmin.billing.days365') : t('tenantAdmin.billing.days30') })}
        </p>

        {payError && <p className="text-xs text-red-400 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">{payError}</p>}

        <div className="flex gap-2">
          <Button variant="outline" fullWidth onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
          <Button fullWidth className="gap-1.5" loading={loading} onClick={onConfirm}>
            <ExternalLink size={13} /> {t('tenantAdmin.billing.payViaDuitku')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function UpgradeModal({ isOpen, onClose, sub, target, form, setForm, onApplyPromo, promoLoading, onConfirm, loading, payError }) {
  const { t } = useTranslation()
  if (!sub || !target) return null
  const monthly = target.price
  const annualDiscPct = target.annualDiscountPercent ?? 17
  const baseAmount = form.cycle === 'annual' ? annualPrice(monthly, annualDiscPct) : monthly
  const discount = form.promoResult?.discount || 0
  const finalAmount = baseAmount - discount

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('tenantAdmin.billing.upgradeTo', { name: target.name })}>
      <div className="space-y-4">
        <div className="p-3 bg-brand/10 border border-brand/20 rounded-xl space-y-1 text-sm">
          <div className="flex justify-between text-muted">
            <span>{t('tenantAdmin.billing.current')}</span>
            <span className="text-off-white">{sub.package} · {formatRupiah(sub.price)}{t('tenantAdmin.billing.perMonth')}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>{t('tenantAdmin.billing.target')}</span>
            <span className="text-brand font-semibold">{target.name} · {formatRupiah(target.price)}{t('tenantAdmin.billing.perMonth')}</span>
          </div>
        </div>

        <CycleToggle
          value={form.cycle}
          onChange={(c) => setForm(f => ({ ...f, cycle: c, promoResult: null }))}
          monthlyPrice={monthly}
          annualDiscountPct={annualDiscPct}
        />

        <PromoInput form={form} setForm={setForm} onApply={onApplyPromo} loading={promoLoading} />

        <CheckoutSummary baseAmount={baseAmount} discount={discount} finalAmount={finalAmount} />

        <ul className="text-xs text-muted space-y-1 list-disc list-inside">
          <li>{t('tenantAdmin.billing.upgradeNotePackagePrefix')} <span className="text-off-white">{target.name}</span> {t('tenantAdmin.billing.upgradeNotePackageSuffix')}</li>
          <li>{t('tenantAdmin.billing.upgradeNoteLimitsPrefix')} <span className="text-off-white">{target.maxBranches}</span>{t('tenantAdmin.billing.upgradeNoteLimitsMid')} <span className="text-off-white">{target.maxStaff}</span>.</li>
          <li>{t('tenantAdmin.billing.upgradeNotePeriod', { days: form.cycle === 'annual' ? '365' : '30' })}</li>
        </ul>

        {payError && <p className="text-xs text-red-400 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">{payError}</p>}

        <div className="flex gap-2">
          <Button variant="outline" fullWidth onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
          <Button fullWidth className="gap-1.5" loading={loading} onClick={onConfirm}>
            <ExternalLink size={13} /> {t('tenantAdmin.billing.continuePayViaDuitku')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function PauseModal({ isOpen, onClose, sub, onConfirm, loading }) {
  const { t } = useTranslation()
  const [until, setUntil] = useState('')
  const [reason, setReason] = useState('')
  const minDate = useMemo(() => format(new Date(Date.now() + 86400_000), 'yyyy-MM-dd'), [])
  const maxDate = useMemo(() => format(new Date(Date.now() + 30 * 86400_000), 'yyyy-MM-dd'), [])

  useEffect(() => {
    if (isOpen) { setUntil(''); setReason('') }
  }, [isOpen])

  function submit() {
    if (!until) return
    const d = new Date(`${until}T00:00:00`)
    onConfirm(d.toISOString(), reason || null)
  }

  if (!sub) return null
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('tenantAdmin.billing.pauseSubscription')}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {t('tenantAdmin.billing.pauseExplanation')}
        </p>

        <Input
          label={t('tenantAdmin.billing.pauseUntilLabel')}
          type="date"
          value={until}
          min={minDate}
          max={maxDate}
          onChange={e => setUntil(e.target.value)}
        />

        <Input
          label={t('tenantAdmin.billing.pauseReasonLabel')}
          placeholder={t('tenantAdmin.billing.pauseReasonPlaceholder')}
          value={reason}
          onChange={e => setReason(e.target.value)}
        />

        <p className="text-xs text-amber-300/80 flex items-start gap-1.5">
          <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
          {t('tenantAdmin.billing.pauseMaxNote')}
        </p>

        <div className="flex gap-2">
          <Button variant="outline" fullWidth onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
          <Button fullWidth className="gap-1.5" loading={loading} onClick={submit} disabled={!until}>
            <Pause size={13} /> {t('tenantAdmin.billing.pauseNow')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
