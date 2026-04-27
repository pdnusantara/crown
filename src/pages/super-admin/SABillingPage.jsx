import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
  CreditCard, TrendingUp, AlertTriangle, CheckCircle, RefreshCw,
  ChevronDown, Receipt, ToggleLeft, ToggleRight, Clock, Filter, CheckSquare,
  Search, Plus, UserX,
} from 'lucide-react'
import { format, differenceInDays, addDays } from 'date-fns'
import { useTenants } from '../../hooks/useTenants.js'
import {
  useSubscriptions, useUpgradePackage, useRenewSubscription,
  useToggleAutoRenew, usePayInvoice, useCreateSubscription, computeMrr,
} from '../../hooks/useSubscription.js'
import { usePackages } from '../../hooks/usePackages.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import { formatRupiah, formatDate } from '../../utils/format.js'

const STATUS_VARIANTS = {
  active:  'success',
  overdue: 'danger',
  trial:   'warning',
  expired: 'muted',
}

const PACKAGE_COLORS = {
  Basic:      'text-blue-400 bg-blue-400/10 border-blue-400/20',
  Pro:        'text-gold bg-gold/10 border-gold/20',
  Enterprise: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
}

const STATUS_FILTERS = ['all', 'active', 'trial', 'overdue', 'expired']
const DURATION_OPTIONS = [{ label: '30 hari', days: 30 }, { label: '90 hari', days: 90 }, { label: '1 tahun', days: 365 }]

const DEFAULT_CREATE = { tenantId: '', package: 'Basic', status: 'active', days: 30, price: 0, autoRenew: true }

function DaysLeft({ endDate }) {
  const { t } = useTranslation()
  const days = differenceInDays(new Date(endDate), new Date())
  if (days < 0) return <span className="text-red-400 text-xs font-medium">{t('superAdmin.billing.overdueDays', { days: Math.abs(days) })}</span>
  if (days <= 7) return <span className="text-amber-400 text-xs font-medium">{t('superAdmin.billing.remainingDays', { days })}</span>
  return <span className="text-muted text-xs">{t('superAdmin.billing.remainingDays', { days })}</span>
}

export default function SABillingPage() {
  const { t } = useTranslation()
  const { data: tenants = [], isLoading: isLoadingTenants } = useTenants()
  const { data: subscriptions = [], isLoading: isLoadingSubs, isError: isSubError, error: subError, refetch: refetchSubs } = useSubscriptions({ limit: 100 })
  const { data: pkgData, isLoading: isLoadingPkgs } = usePackages()
  const upgradePkg  = useUpgradePackage()
  const renewSub    = useRenewSubscription()
  const toggleAuto  = useToggleAutoRenew()
  const payInvoice  = usePayInvoice()
  const createSub   = useCreateSubscription()
  const toast       = useToast()

  const [upgradeModal, setUpgradeModal] = useState(null)
  const [invoiceModal, setInvoiceModal] = useState(null)
  const [createModal, setCreateModal]   = useState(false)
  const [selectedPkg, setSelectedPkg]   = useState('')
  const [busyId, setBusyId]             = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [pkgFilter, setPkgFilter]       = useState('all')
  const [searchText, setSearchText]     = useState('')
  const [createForm, setCreateForm]     = useState(DEFAULT_CREATE)

  const packages    = pkgData?.map || {}
  const packageList = pkgData?.list || []
  const isLoading   = isLoadingTenants || isLoadingSubs || isLoadingPkgs

  const mrr          = useMemo(() => computeMrr(subscriptions), [subscriptions])
  const arr          = mrr * 12
  const overdueCount = subscriptions.filter(s => s.status === 'overdue').length
  const activeCount  = subscriptions.filter(s => s.status === 'active').length
  const trialCount   = subscriptions.filter(s => s.status === 'trial').length

  // Tenants that have no subscription yet
  const tenantsWithoutSub = useMemo(() => {
    const withSub = new Set(subscriptions.map(s => s.tenantId))
    return tenants.filter(t => !withSub.has(t.id))
  }, [tenants, subscriptions])

  const filteredSubs = useMemo(() => subscriptions.filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false
    if (pkgFilter !== 'all' && s.package !== pkgFilter) return false
    if (searchText) {
      const name = (s.tenant?.name || tenants.find(t => t.id === s.tenantId)?.name || '').toLowerCase()
      if (!name.includes(searchText.toLowerCase())) return false
    }
    return true
  }), [subscriptions, statusFilter, pkgFilter, searchText, tenants])

  const tenantName = (tenantId) => tenants.find(tt => tt.id === tenantId)?.name || tenantId

  const handleUpgrade = async () => {
    if (!selectedPkg || !upgradeModal || selectedPkg === upgradeModal.currentPackage) return
    try {
      await upgradePkg.mutateAsync({ subscriptionId: upgradeModal.subscriptionId, package: selectedPkg })
      toast.success(t('superAdmin.billing.toastUpgradeSuccess', { tenant: upgradeModal.tenantName, pkg: selectedPkg }))
      setUpgradeModal(null)
      setSelectedPkg('')
    } catch (err) {
      toast.error(err?.response?.data?.error || t('common.saveFailed'))
    }
  }

  const handleRenew = async (sub) => {
    if (busyId) return
    setBusyId(sub.id)
    try {
      await renewSub.mutateAsync({ subscriptionId: sub.id })
      toast.success(t('superAdmin.billing.toastRenewSuccess', { tenant: tenantName(sub.tenantId) }))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('common.saveFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const handleToggleAuto = async (sub) => {
    if (busyId) return
    setBusyId(sub.id)
    try {
      const updated = await toggleAuto.mutateAsync({ subscriptionId: sub.id })
      toast.info(t('superAdmin.billing.autoRenewToast', {
        state: updated?.autoRenew ? t('superAdmin.billing.autoRenewOn') : t('superAdmin.billing.autoRenewOff'),
      }))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('common.saveFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const handlePayInvoice = async (inv) => {
    if (!invoiceModal) return
    try {
      await payInvoice.mutateAsync({ subscriptionId: invoiceModal.id, invoiceId: inv.id })
      setInvoiceModal(prev => prev ? {
        ...prev,
        invoices: prev.invoices.map(i => i.id === inv.id ? { ...i, status: 'paid', paidAt: new Date().toISOString() } : i),
      } : null)
      toast.success('Invoice ditandai lunas')
    } catch (err) {
      toast.error(err?.response?.data?.error || t('common.saveFailed'))
    }
  }

  const handleCreateFormChange = (field, value) => {
    setCreateForm(prev => {
      const next = { ...prev, [field]: value }
      // Auto-fill price when package changes
      if (field === 'package') {
        const pkg = packages[value]
        next.price = pkg?.price ?? 0
      }
      return next
    })
  }

  const handleCreate = async () => {
    if (!createForm.tenantId) return
    const now = new Date()
    const startDate = now.toISOString()
    const endDate = addDays(now, createForm.days).toISOString()
    try {
      await createSub.mutateAsync({
        tenantId: createForm.tenantId,
        package: createForm.package,
        status: createForm.status,
        price: createForm.price,
        startDate,
        endDate,
        autoRenew: createForm.autoRenew,
      })
      const tName = tenants.find(t => t.id === createForm.tenantId)?.name || createForm.tenantId
      toast.success(`Subscription untuk ${tName} berhasil dibuat`)
      setCreateModal(false)
      setCreateForm(DEFAULT_CREATE)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('common.saveFailed'))
    }
  }

  const openCreateModal = (tenantId = '') => {
    const defaultPkg = packageList[0]
    setCreateForm({
      ...DEFAULT_CREATE,
      tenantId,
      package: defaultPkg?.name || 'Basic',
      price: defaultPkg?.price || 0,
    })
    setCreateModal(true)
  }

  const statusLabel = (status) => {
    if (status === 'active')  return t('superAdmin.billing.statusActive')
    if (status === 'overdue') return t('superAdmin.billing.statusOverdue')
    if (status === 'trial')   return t('superAdmin.billing.statusTrial')
    if (status === 'expired') return t('superAdmin.billing.statusExpired')
    return status
  }

  const rowHighlight = (status) => {
    if (status === 'overdue') return 'bg-red-500/5 border-l-2 border-l-red-500/50'
    if (status === 'expired') return 'bg-dark-surface/20 opacity-70'
    return ''
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold gold-text">{t('superAdmin.billing.pageTitle')}</h1>
          <p className="text-muted text-sm mt-1">{t('superAdmin.billing.pageSubtitle')}</p>
        </div>
        {!isLoading && (
          <Button onClick={() => openCreateModal()} size="sm">
            <Plus size={14} className="mr-1" />
            Buat Subscription
          </Button>
        )}
      </div>

      {/* Tenants without subscription warning */}
      {!isLoading && tenantsWithoutSub.length > 0 && (
        <Card className="p-4 border-amber-400/30 bg-amber-400/5">
          <div className="flex items-center gap-3">
            <UserX size={16} className="text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-300 flex-1">
              <span className="font-semibold">{tenantsWithoutSub.length} tenant</span> belum memiliki subscription:{' '}
              <span className="text-amber-400/80">{tenantsWithoutSub.slice(0, 3).map(t => t.name).join(', ')}{tenantsWithoutSub.length > 3 ? ` +${tenantsWithoutSub.length - 3} lainnya` : ''}</span>
            </p>
            <Button size="sm" variant="secondary" className="flex-shrink-0 border-amber-400/30 text-amber-400" onClick={() => openCreateModal()}>
              Buat Sekarang
            </Button>
          </div>
        </Card>
      )}

      {/* Error state */}
      {isSubError && !isLoading && (
        <Card className="p-6 border-red-400/30 bg-red-400/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-300">{t('common.saveFailed')}</p>
              <p className="text-xs text-muted mt-1">{subError?.response?.data?.error || subError?.message || ''}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetchSubs()}>
                {t('common.retry', 'Coba lagi')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0,1,2,3].map(i => <div key={i} className="h-28 rounded-2xl bg-dark-card animate-pulse" />)}
          </div>
          <div className="h-64 rounded-2xl bg-dark-card animate-pulse" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* KPI Row — 5 cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: t('superAdmin.billing.kpiMrr'),     value: formatRupiah(mrr),  icon: TrendingUp,    color: 'text-gold',        sub: t('superAdmin.billing.kpiMrrSub') },
              { label: t('superAdmin.billing.kpiArr'),     value: formatRupiah(arr),  icon: TrendingUp,    color: 'text-green-400',   sub: t('superAdmin.billing.kpiArrSub') },
              { label: t('superAdmin.billing.kpiActive'),  value: activeCount,        icon: CheckCircle,   color: 'text-green-400',   sub: t('superAdmin.billing.kpiActiveSub') },
              { label: 'Trial',                            value: trialCount,         icon: Clock,         color: 'text-amber-400',   sub: 'Masa percobaan' },
              { label: t('superAdmin.billing.kpiOverdue'), value: overdueCount,       icon: AlertTriangle, color: 'text-red-400',     sub: t('superAdmin.billing.kpiOverdueSub') },
            ].map((kpi, i) => (
              <motion.div key={kpi.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <Card className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-xs text-muted">{kpi.label}</p>
                    <kpi.icon size={16} className={kpi.color} />
                  </div>
                  <p className="text-2xl font-bold text-off-white">{kpi.value}</p>
                  <p className="text-xs text-muted mt-1">{kpi.sub}</p>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Packages Overview */}
          <div>
            <h2 className="text-lg font-semibold text-off-white mb-4">{t('superAdmin.billing.availablePackages')}</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {packageList.map(pkg => (
                <Card key={pkg.name} className={`p-5 border ${PACKAGE_COLORS[pkg.name]}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-off-white">{pkg.name}</h3>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full border ${PACKAGE_COLORS[pkg.name]}`}>{pkg.name}</span>
                  </div>
                  <p className="text-2xl font-bold text-off-white mb-1">
                    {formatRupiah(pkg.price)}<span className="text-sm text-muted font-normal">{t('superAdmin.billing.perMonth')}</span>
                  </p>
                  <div className="space-y-1 mt-3 text-xs text-muted">
                    <p>• {t('superAdmin.billing.maxBranches', { value: pkg.maxBranches })}</p>
                    <p>• {t('superAdmin.billing.maxStaff', { value: pkg.maxStaff })}</p>
                    <p>• {t('superAdmin.billing.featuresActive', { count: pkg.features?.length ?? 0 })}</p>
                  </div>
                  <p className="text-xs text-muted mt-3">
                    {t('superAdmin.billing.tenantsUsingPackage', { count: pkg.tenantCount ?? 0 })}
                  </p>
                </Card>
              ))}
            </div>
          </div>

          {/* Subscription List */}
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <h2 className="font-semibold text-off-white flex-1">{t('superAdmin.billing.tenantSubscriptions')}</h2>
                  {/* Search */}
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="text"
                      placeholder="Cari tenant..."
                      value={searchText}
                      onChange={e => setSearchText(e.target.value)}
                      className="bg-dark-card border border-dark-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-off-white placeholder-muted focus:outline-none focus:border-gold/50 w-44"
                    />
                  </div>
                </div>
                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter size={13} className="text-muted flex-shrink-0" />
                  <div className="flex gap-1 flex-wrap">
                    {STATUS_FILTERS.map(s => (
                      <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          statusFilter === s
                            ? 'bg-gold/15 text-gold border border-gold/30'
                            : 'text-muted hover:text-off-white border border-transparent'
                        }`}
                      >
                        {s === 'all' ? 'Semua' : statusLabel(s)}
                        {s !== 'all' && (
                          <span className="ml-1 opacity-60">
                            {subscriptions.filter(x => x.status === s).length}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <select
                    value={pkgFilter}
                    onChange={e => setPkgFilter(e.target.value)}
                    className="bg-dark-card border border-dark-border rounded-lg px-2 py-1 text-xs text-muted focus:outline-none focus:border-gold/50"
                  >
                    <option value="all">Semua Paket</option>
                    {packageList.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border text-xs text-muted uppercase">
                    <th className="px-4 py-3 text-left">{t('superAdmin.billing.colTenant')}</th>
                    <th className="px-4 py-3 text-left">{t('superAdmin.billing.colPackage')}</th>
                    <th className="px-4 py-3 text-left">{t('superAdmin.billing.colStatus')}</th>
                    <th className="px-4 py-3 text-left">{t('superAdmin.billing.colEnds')}</th>
                    <th className="px-4 py-3 text-left">{t('superAdmin.billing.colPrice')}</th>
                    <th className="px-4 py-3 text-left">{t('superAdmin.billing.colAutoRenew')}</th>
                    <th className="px-4 py-3 text-left">{t('superAdmin.billing.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted">
                        <CreditCard size={32} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">{t('superAdmin.billing.noSubscriptions')}</p>
                      </td>
                    </tr>
                  )}
                  {filteredSubs.map(sub => {
                    const variant = STATUS_VARIANTS[sub.status] || 'success'
                    return (
                      <tr key={sub.id} className={`border-b border-dark-border/50 hover:bg-dark-surface/40 transition-colors ${rowHighlight(sub.status)}`}>
                        <td className="px-4 py-3 font-medium text-off-white">{sub.tenant?.name || tenantName(sub.tenantId)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${PACKAGE_COLORS[sub.package]}`}>{sub.package}</span>
                        </td>
                        <td className="px-4 py-3"><Badge variant={variant}>{statusLabel(sub.status)}</Badge></td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-off-white text-xs">{format(new Date(sub.endDate), 'dd MMM yyyy')}</p>
                            <DaysLeft endDate={sub.endDate} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gold font-semibold">{formatRupiah(sub.price)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleAuto(sub)}
                            disabled={busyId === sub.id}
                            className="disabled:opacity-40"
                            title={sub.autoRenew ? t('superAdmin.billing.autoRenewOn') : t('superAdmin.billing.autoRenewOff')}
                          >
                            {sub.autoRenew
                              ? <ToggleRight size={22} className="text-green-400" />
                              : <ToggleLeft size={22} className="text-muted" />}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <Button size="sm" variant="secondary" onClick={() => setInvoiceModal(sub)}>
                              <Receipt size={13} className="mr-1" />{t('superAdmin.billing.invoiceBtn')}
                            </Button>
                            <Button size="sm" onClick={() => { setUpgradeModal({ subscriptionId: sub.id, tenantName: sub.tenant?.name || tenantName(sub.tenantId), currentPackage: sub.package }); setSelectedPkg(sub.package) }}>
                              <ChevronDown size={13} className="mr-1" />{t('superAdmin.billing.packageBtn')}
                            </Button>
                            {sub.status !== 'active' && (
                              <Button size="sm" variant="secondary" disabled={busyId === sub.id} onClick={() => handleRenew(sub)}>
                                <RefreshCw size={13} className="mr-1" />{t('superAdmin.billing.extendBtn')}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="text-xs text-muted text-center py-2 border-t border-dark-border/40">
                {filteredSubs.length === subscriptions.length
                  ? `${subscriptions.length} subscription`
                  : `Menampilkan ${filteredSubs.length} dari ${subscriptions.length} subscription`}
              </p>
            </div>
          </Card>
        </>
      )}

      {/* Upgrade Modal */}
      <Modal isOpen={!!upgradeModal} onClose={() => !upgradePkg.isPending && setUpgradeModal(null)} title={t('superAdmin.billing.modalChangePackage', { tenant: upgradeModal?.tenantName })}>
        <div className="space-y-4">
          <p className="text-sm text-muted">{t('superAdmin.billing.currentPackage')} <span className="text-off-white font-semibold">{upgradeModal?.currentPackage}</span></p>
          <div className="grid gap-3">
            {packageList.map(pkg => (
              <button
                key={pkg.name}
                onClick={() => setSelectedPkg(pkg.name)}
                className={`p-4 rounded-xl border text-left transition-all ${selectedPkg === pkg.name ? 'border-gold bg-gold/10' : 'border-dark-border hover:border-gold/30'}`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-off-white">{pkg.name}</p>
                    <p className="text-xs text-muted mt-0.5">{t('superAdmin.billing.branchesStaffLine', { branches: pkg.maxBranches, staff: pkg.maxStaff })}</p>
                  </div>
                  <p className="text-gold font-bold">{formatRupiah(pkg.price)}<span className="text-xs text-muted font-normal">{t('superAdmin.billing.perMonth')}</span></p>
                </div>
              </button>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" fullWidth onClick={() => setUpgradeModal(null)} disabled={upgradePkg.isPending}>{t('superAdmin.billing.cancel')}</Button>
            <Button fullWidth onClick={handleUpgrade} disabled={upgradePkg.isPending || selectedPkg === upgradeModal?.currentPackage}>
              {upgradePkg.isPending ? t('common.loading') : t('superAdmin.billing.saveChanges')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Invoice Modal */}
      <Modal
        isOpen={!!invoiceModal}
        onClose={() => !payInvoice.isPending && setInvoiceModal(null)}
        title={t('superAdmin.billing.modalInvoiceHistory', { tenant: invoiceModal ? (invoiceModal.tenant?.name || tenantName(invoiceModal.tenantId)) : '' })}
      >
        <div className="space-y-3">
          {!invoiceModal?.invoices?.length ? (
            <div className="text-center py-8 text-muted">
              <Receipt size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('superAdmin.billing.noInvoices')}</p>
            </div>
          ) : (
            invoiceModal.invoices.map(inv => (
              <div key={inv.id} className="flex items-center justify-between p-3 bg-dark-card rounded-xl border border-dark-border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-off-white font-medium">{inv.period}</p>
                    {inv.type === 'branch_addon' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-400/10 text-purple-400 border border-purple-400/20">
                        {t('superAdmin.billing.invoiceBranchAddon')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">{formatDate(inv.createdAt || inv.paidAt)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-gold font-semibold text-sm">{formatRupiah(inv.amount)}</span>
                  <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'danger' : 'warning'}>
                    {inv.status === 'paid' ? t('superAdmin.billing.invoicePaid') : inv.status === 'overdue' ? t('superAdmin.billing.invoiceOverdue') : t('superAdmin.billing.invoicePending')}
                  </Badge>
                  {inv.status !== 'paid' && (
                    <button
                      onClick={() => handlePayInvoice(inv)}
                      disabled={payInvoice.isPending}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium hover:bg-green-500/20 transition-all disabled:opacity-40"
                      title="Tandai lunas"
                    >
                      <CheckSquare size={12} />
                      Lunas
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* Create Subscription Modal */}
      <Modal
        isOpen={createModal}
        onClose={() => !createSub.isPending && setCreateModal(false)}
        title="Buat Subscription Baru"
      >
        <div className="space-y-4">
          {/* Tenant select */}
          <div>
            <label className="text-xs text-muted mb-1.5 block">Tenant</label>
            <select
              value={createForm.tenantId}
              onChange={e => handleCreateFormChange('tenantId', e.target.value)}
              className="w-full bg-dark-surface border border-dark-border rounded-xl px-3 py-2.5 text-sm text-off-white focus:outline-none focus:border-gold/50"
            >
              <option value="">— Pilih tenant —</option>
              {tenantsWithoutSub.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
              {tenantsWithoutSub.length === 0 && (
                <option disabled>Semua tenant sudah memiliki subscription</option>
              )}
            </select>
          </div>

          {/* Package select */}
          <div>
            <label className="text-xs text-muted mb-1.5 block">Paket</label>
            <div className="grid gap-2">
              {packageList.map(pkg => (
                <button
                  key={pkg.name}
                  onClick={() => handleCreateFormChange('package', pkg.name)}
                  className={`p-3 rounded-xl border text-left transition-all ${createForm.package === pkg.name ? 'border-gold bg-gold/10' : 'border-dark-border hover:border-gold/30'}`}
                >
                  <div className="flex justify-between items-center">
                    <p className="font-semibold text-off-white text-sm">{pkg.name}</p>
                    <p className="text-gold font-bold text-sm">{formatRupiah(pkg.price)}<span className="text-xs text-muted font-normal">/bln</span></p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-xs text-muted mb-1.5 block">Durasi</label>
            <div className="flex gap-2">
              {DURATION_OPTIONS.map(opt => (
                <button
                  key={opt.days}
                  onClick={() => handleCreateFormChange('days', opt.days)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${createForm.days === opt.days ? 'border-gold bg-gold/10 text-gold' : 'border-dark-border text-muted hover:text-off-white'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status + Price row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1.5 block">Status awal</label>
              <div className="flex gap-2">
                {['active', 'trial'].map(s => (
                  <button
                    key={s}
                    onClick={() => handleCreateFormChange('status', s)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${createForm.status === s ? 'border-gold bg-gold/10 text-gold' : 'border-dark-border text-muted hover:text-off-white'}`}
                  >
                    {s === 'active' ? 'Aktif' : 'Trial'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted mb-1.5 block">Harga (Rp)</label>
              <input
                type="number"
                min={0}
                value={createForm.price}
                onChange={e => handleCreateFormChange('price', parseInt(e.target.value) || 0)}
                className="w-full bg-dark-surface border border-dark-border rounded-xl px-3 py-2 text-sm text-off-white focus:outline-none focus:border-gold/50"
              />
            </div>
          </div>

          {/* Auto renew toggle */}
          <div className="flex items-center justify-between p-3 bg-dark-surface rounded-xl border border-dark-border">
            <span className="text-sm text-off-white">Auto Renew</span>
            <button onClick={() => handleCreateFormChange('autoRenew', !createForm.autoRenew)}>
              {createForm.autoRenew
                ? <ToggleRight size={24} className="text-green-400" />
                : <ToggleLeft size={24} className="text-muted" />}
            </button>
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setCreateModal(false)} disabled={createSub.isPending}>Batal</Button>
            <Button fullWidth onClick={handleCreate} disabled={createSub.isPending || !createForm.tenantId}>
              {createSub.isPending ? t('common.loading') : 'Buat Subscription'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
