import React from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Building2, Users, TrendingUp, ShieldCheck, Flag, MessageSquare, ExternalLink } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { timeAgo, formatDateTime } from '../../utils/format.js'
import { useTenant } from '../../hooks/useTenants.js'
import { useFeatureFlags } from '../../hooks/useFeatureFlags.js'
import { useTickets } from '../../hooks/useTickets.js'
import { ALL_FEATURE_FLAGS } from '../../store/featureFlagStore.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import { formatRupiah } from '../../utils/format.js'

const PACKAGE_COLORS = {
  Basic:      'text-blue-400 bg-blue-400/10 border-blue-400/20',
  Pro:        'text-gold bg-gold/10 border-gold/20',
  Enterprise: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
}

export default function SATenantsDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: tenant, isLoading, isError } = useTenant(id)
  const { data: flags = [] }   = useFeatureFlags(id)
  const { data: tickets = [] } = useTickets(id)
  const { impersonate } = useAuthStore()
  const toast = useToast()

  const sub = tenant?.subscription

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-dark-card rounded-xl animate-pulse w-64" />
        <div className="h-32 bg-dark-card rounded-2xl animate-pulse" />
        <div className="h-64 bg-dark-card rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (isError || !tenant) {
    return (
      <div className="text-center py-20 text-muted">
        <p>{t('superAdmin.tenantDetail.notFound')}</p>
        <button onClick={() => navigate('/super-admin/tenants')} className="mt-4 text-gold hover:underline text-sm">
          {t('superAdmin.tenantDetail.backToList')}
        </button>
      </div>
    )
  }

  const daysLeft = sub ? differenceInDays(new Date(sub.endDate), new Date()) : null

  const handleImpersonate = () => {
    const virtualUser = {
      id: `impersonated-${id}`,
      role: 'tenant_admin',
      tenantId: id,
      name: `[Impersonate] ${tenant.name}`,
      email: tenant.email,
    }
    const path = impersonate(virtualUser)
    if (path) {
      toast.info(t('superAdmin.tenantDetail.impersonateToast', { name: tenant.name }))
      navigate(path)
    } else {
      toast.error(t('superAdmin.tenantDetail.impersonateFailed'))
    }
  }

  // Grouped flags by category
  const flagsByCategory = ALL_FEATURE_FLAGS.reduce((acc, f) => {
    if (!acc[f.category]) acc[f.category] = []
    acc[f.category].push({ ...f, enabled: flags.includes(f.id) })
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/super-admin/tenants')}
          className="p-2 rounded-xl border border-dark-border text-muted hover:text-off-white hover:border-gold/30 transition-all"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-bold text-off-white">{tenant.name}</h1>
          <p className="text-muted text-sm">/{tenant.slug}</p>
        </div>
        <Button icon={ExternalLink} onClick={handleImpersonate} size="sm">
          {t('superAdmin.tenantDetail.loginAsTenant')}
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('superAdmin.tenantDetail.branches'),     value: tenant.totalBranches, icon: Building2, color: 'text-blue-400' },
          { label: t('superAdmin.tenantDetail.staff'),        value: tenant.totalStaff, icon: Users, color: 'text-purple-400' },
          { label: t('superAdmin.tenantDetail.revenueMtd'),   value: formatRupiah(tenant.monthlyRevenue || 0), icon: TrendingUp, color: 'text-gold' },
          { label: t('superAdmin.tenantDetail.openTickets'),  value: tickets.filter(tk => tk.status === 'open').length, icon: MessageSquare, color: 'text-amber-400' },
        ].map((item, i) => (
          <motion.div key={item.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted">{item.label}</p>
                <item.icon size={15} className={item.color} />
              </div>
              <p className="text-xl font-bold text-off-white">{item.value}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Subscription Info */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck size={15} className="text-gold" />
                <h3 className="font-semibold text-off-white">{t('superAdmin.tenantDetail.subscription')}</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-3">
              {sub ? (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted">{t('superAdmin.tenantDetail.package')}</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full border ${PACKAGE_COLORS[sub.package]}`}>{sub.package}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted">{t('superAdmin.tenantDetail.status')}</span>
                    <Badge variant={sub.status === 'active' ? 'success' : sub.status === 'overdue' ? 'danger' : 'warning'}>
                      {sub.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted">{t('superAdmin.tenantDetail.endsAt')}</span>
                    <span className="text-sm text-off-white">{format(new Date(sub.endDate), 'dd MMM yyyy')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted">{t('superAdmin.tenantDetail.daysRemaining')}</span>
                    <span className={`text-sm font-semibold ${daysLeft < 0 ? 'text-red-400' : daysLeft <= 7 ? 'text-amber-400' : 'text-green-400'}`}>
                      {daysLeft < 0 ? t('superAdmin.tenantDetail.daysOverdue', { days: Math.abs(daysLeft) }) : t('superAdmin.tenantDetail.daysValue', { days: daysLeft })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted">{t('superAdmin.tenantDetail.pricePerMonth')}</span>
                    <span className="text-sm font-semibold text-gold">{formatRupiah(sub.price)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted">{t('superAdmin.tenantDetail.autoRenew')}</span>
                    <span className={`text-sm font-semibold ${sub.autoRenew ? 'text-green-400' : 'text-muted'}`}>
                      {sub.autoRenew ? t('superAdmin.tenantDetail.yes') : t('superAdmin.tenantDetail.no')}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted">{t('superAdmin.tenantDetail.subNotAvailable')}</p>
              )}
            </CardBody>
          </Card>
        </motion.div>

        {/* Recent Tickets */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare size={15} className="text-gold" />
                  <h3 className="font-semibold text-off-white">{t('superAdmin.tenantDetail.supportTickets')}</h3>
                </div>
                <button
                  onClick={() => navigate('/super-admin/tickets')}
                  className="text-xs text-gold hover:underline"
                >
                  {t('superAdmin.tenantDetail.seeAll')}
                </button>
              </div>
            </CardHeader>
            <CardBody className="space-y-2">
              {tickets.length === 0 && (
                <p className="text-sm text-muted py-4 text-center">{t('superAdmin.tenantDetail.noTickets')}</p>
              )}
              {tickets.slice(0, 4).map(ticket => (
                <div key={ticket.id} className="flex items-start justify-between gap-2 p-2.5 rounded-xl border border-dark-border hover:border-gold/20 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-off-white truncate">{ticket.subject}</p>
                    <p className="text-xs text-muted mt-0.5" title={formatDateTime(ticket.createdAt)}>{timeAgo(ticket.createdAt)}</p>
                  </div>
                  <Badge variant={ticket.status === 'open' ? 'danger' : ticket.status === 'in_progress' ? 'warning' : 'success'} className="flex-shrink-0 text-xs">
                    {ticket.status}
                  </Badge>
                </div>
              ))}
            </CardBody>
          </Card>
        </motion.div>
      </div>

      {/* Feature Flags */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flag size={15} className="text-gold" />
                <h3 className="font-semibold text-off-white">{t('superAdmin.tenantDetail.featureFlags')}</h3>
              </div>
              <button
                onClick={() => navigate('/super-admin/feature-flags')}
                className="text-xs text-gold hover:underline"
              >
                {t('superAdmin.tenantDetail.manage')}
              </button>
            </div>
          </CardHeader>
          <CardBody>
            <p className="text-xs text-muted mb-4">
              {t('superAdmin.tenantDetail.featuresActive', { active: flags.length, total: ALL_FEATURE_FLAGS.length })}
            </p>
            <div className="space-y-4">
              {Object.entries(flagsByCategory).map(([cat, catFlags]) => (
                <div key={cat}>
                  <p className="text-xs font-semibold text-muted uppercase mb-2">{cat}</p>
                  <div className="flex flex-wrap gap-2">
                    {catFlags.map(f => (
                      <span
                        key={f.id}
                        className={`text-xs px-2.5 py-1 rounded-full border font-medium ${f.enabled ? 'border-gold/30 bg-gold/10 text-gold' : 'border-dark-border text-muted opacity-50'}`}
                      >
                        {f.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </motion.div>
    </div>
  )
}
