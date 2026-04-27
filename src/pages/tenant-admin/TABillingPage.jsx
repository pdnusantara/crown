import React from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { CreditCard, AlertTriangle, CheckCircle, Calendar, Building2, Zap, Receipt } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { useAuthStore } from '../../store/authStore.js'
import { useSubscription } from '../../hooks/useSubscription.js'
import { usePackages } from '../../hooks/usePackages.js'
import { useFeatureFlagStore, ALL_FEATURE_FLAGS } from '../../store/featureFlagStore.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { formatRupiah, formatDate } from '../../utils/format.js'

const PACKAGE_COLORS = {
  Basic:      { border: 'border-blue-400/30',   badge: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
  Pro:        { border: 'border-gold/30',        badge: 'text-gold bg-gold/10 border-gold/30' },
  Enterprise: { border: 'border-purple-400/30',  badge: 'text-purple-400 bg-purple-400/10 border-purple-400/30' },
}

export default function TABillingPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()

  const { data: sub, isLoading: isLoadingSub, isError: isSubError, error: subError } = useSubscription(user?.tenantId)
  const { data: pkgData, isLoading: isLoadingPkgs } = usePackages()
  const { getTenantFlags } = useFeatureFlagStore()

  const STATUS_LABEL = {
    active: t('tenantAdmin.billing.statusActive'),
    overdue: t('tenantAdmin.billing.statusOverdue'),
    trial: t('tenantAdmin.billing.statusTrial'),
    expired: t('tenantAdmin.billing.statusExpired'),
  }

  const packages = pkgData?.map || {}
  const packageList = pkgData?.list || []
  const pkg = sub ? packages[sub.package] : null
  const flags = getTenantFlags(user?.tenantId, sub?.package)
  const isLoading = isLoadingSub || isLoadingPkgs

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-dark-card rounded-xl animate-pulse w-64" />
        <div className="h-40 bg-dark-card rounded-2xl animate-pulse" />
        <div className="h-64 bg-dark-card rounded-2xl animate-pulse" />
      </div>
    )
  }

  // Tenant baru (atau 404) — belum punya subscription
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-off-white">{t('tenantAdmin.billing.pageTitle')}</h1>
        <p className="text-muted text-sm mt-1">{t('tenantAdmin.billing.pageSubtitle')}</p>
      </div>

      {/* Alert banners */}
      {sub.status === 'overdue' && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
          <AlertTriangle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-300">{t('tenantAdmin.billing.paymentOverdueTitle')}</p>
            <p className="text-xs text-muted mt-0.5">
              {t('tenantAdmin.billing.paymentOverdueDesc')}
            </p>
          </div>
        </motion.div>
      )}
      {sub.status === 'active' && daysLeft > 0 && daysLeft <= 7 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
          <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-300">
            {t('tenantAdmin.billing.expiresInPrefix')} <strong>{t('tenantAdmin.billing.daysValue', { count: daysLeft })}</strong> ({format(new Date(sub.endDate), 'dd MMM yyyy')}). {t('tenantAdmin.billing.contactRenewal')}
          </p>
        </motion.div>
      )}

      {/* Current Plan */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className={`p-6 border ${style.border}`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-muted mb-1">{t('tenantAdmin.billing.currentPlan')}</p>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold px-2.5 py-1 rounded-full border ${style.badge}`}>{sub.package}</span>
                <Badge variant={sub.status === 'active' ? 'success' : sub.status === 'overdue' ? 'danger' : 'warning'}>
                  {STATUS_LABEL[sub.status] || sub.status}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-gold">{formatRupiah(sub.price)}</p>
              <p className="text-xs text-muted">{t('tenantAdmin.billing.perMonth')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        </Card>
      </motion.div>

      {/* Available Packages */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <h2 className="text-sm font-semibold text-muted uppercase mb-3">{t('tenantAdmin.billing.availablePackages')}</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {packageList.map(p => {
            const isCurrent = sub.package === p.name
            const pStyle    = PACKAGE_COLORS[p.name] || PACKAGE_COLORS.Basic
            return (
              <Card key={p.name} className={`p-4 border ${pStyle.border} ${isCurrent ? 'ring-1 ring-gold/40' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${pStyle.badge}`}>{p.name}</span>
                  {isCurrent && <CheckCircle size={14} className="text-gold" />}
                </div>
                <p className="text-2xl font-bold text-off-white mb-1">{formatRupiah(p.price)}<span className="text-xs text-muted font-normal">{t('tenantAdmin.billing.perMonthShort')}</span></p>
                <div className="space-y-1 text-xs text-muted mt-2">
                  <p>{t('tenantAdmin.billing.maxBranchesLine', { value: p.maxBranches })}</p>
                  <p>{t('tenantAdmin.billing.maxStaffLine', { value: p.maxStaff })}</p>
                  {p.branchAddonPrice > 0 && <p>{t('tenantAdmin.billing.addBranchLine', { price: formatRupiah(p.branchAddonPrice) })}</p>}
                </div>
                {!isCurrent && (
                  <p className="text-xs text-gold mt-3">
                    {t('tenantAdmin.billing.contactForUpgrade')}
                  </p>
                )}
                {isCurrent && <p className="text-xs text-green-400 mt-3">{t('tenantAdmin.billing.yourActivePackage')}</p>}
              </Card>
            )
          })}
        </div>
      </motion.div>

      {/* Active Feature Flags */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-gold" />
              <h3 className="font-semibold text-off-white">{t('tenantAdmin.billing.activeFeatures')}</h3>
              <span className="text-xs text-muted ml-1">{t('tenantAdmin.billing.featureCount', { active: flags.length, total: ALL_FEATURE_FLAGS.length })}</span>
            </div>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {ALL_FEATURE_FLAGS.map(f => {
                const active = flags.includes(f.id)
                return (
                  <span key={f.id} className={`px-2.5 py-1 rounded-full border text-xs font-medium ${active ? 'border-gold/30 bg-gold/10 text-gold' : 'border-dark-border text-muted opacity-40 line-through'}`}>
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
              <Receipt size={15} className="text-gold" />
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
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-off-white font-medium">{inv.period}</p>
                      {inv.type === 'branch_addon' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-400/10 text-purple-400 border border-purple-400/20">{t('tenantAdmin.billing.branchAddon')}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted">{formatDate(inv.createdAt || inv.paidAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gold">{formatRupiah(inv.amount)}</span>
                    <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'danger' : 'warning'}>
                      {inv.status === 'paid' ? t('tenantAdmin.billing.paid') : inv.status === 'overdue' ? t('tenantAdmin.billing.overdue') : t('tenantAdmin.billing.pending')}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </motion.div>
    </div>
  )
}
