import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Building2, Users, TrendingUp, ShieldCheck, Flag, MessageSquare, ExternalLink, GitBranch, Gift, ArrowUpCircle, CreditCard, CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { timeAgo, formatDateTime } from '../../utils/format.js'
import { useTenant } from '../../hooks/useTenants.js'
import { useSubscription, usePayInvoice, useGrantBranchLicense, useUpgradePackage } from '../../hooks/useSubscription.js'
import { useBranches, useBranchLicenseSummary } from '../../hooks/useBranches.js'
import { useFeatureFlags } from '../../hooks/useFeatureFlags.js'
import { useTickets } from '../../hooks/useTickets.js'
import { ALL_FEATURE_FLAGS } from '../../store/featureFlagStore.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import { formatRupiah, formatRupiahShort } from '../../utils/format.js'

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
  const { data: ticketsResp } = useTickets(id)
  const tickets = ticketsResp?.data || []
  const { impersonate } = useAuthStore()
  const toast = useToast()

  const sub = tenant?.subscription
  const { data: fullSub } = useSubscription(id)
  const { data: branches = [] } = useBranches(id)
  const { data: licSummary } = useBranchLicenseSummary(id)

  const payInvoice = usePayInvoice()
  const grantLicense = useGrantBranchLicense()
  const upgradePkg = useUpgradePackage()

  const [showGrantModal, setShowGrantModal] = useState(false)
  const [grantNote, setGrantNote] = useState('')
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [upgradeTarget, setUpgradeTarget] = useState('Pro')
  const [payingId, setPayingId] = useState(null)

  const pendingBranchInvoices = (fullSub?.invoices || []).filter(
    inv => inv.type === 'branch_addon' && inv.status !== 'paid'
  )

  const handlePayInvoice = async (invoiceId) => {
    if (!fullSub?.id) return
    setPayingId(invoiceId)
    try {
      await payInvoice.mutateAsync({ subscriptionId: fullSub.id, invoiceId })
      toast.success('Invoice berhasil ditandai lunas')
    } catch {
      toast.error('Gagal menandai invoice')
    } finally {
      setPayingId(null)
    }
  }

  const handleGrant = async () => {
    if (!fullSub?.id) return
    try {
      await grantLicense.mutateAsync({ subscriptionId: fullSub.id, note: grantNote.trim() || undefined })
      toast.success('Lisensi cabang gratis berhasil diberikan')
      setShowGrantModal(false)
      setGrantNote('')
    } catch {
      toast.error('Gagal memberikan lisensi')
    }
  }

  const handleUpgrade = async () => {
    if (!fullSub?.id) return
    try {
      await upgradePkg.mutateAsync({ subscriptionId: fullSub.id, package: upgradeTarget })
      toast.success(`Paket berhasil diupgrade ke ${upgradeTarget}`)
      setShowUpgradeModal(false)
    } catch {
      toast.error('Gagal upgrade paket')
    }
  }

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
          { label: t('superAdmin.tenantDetail.revenueMtd'),   value: formatRupiah(tenant.monthlyRevenue || 0), valueShort: formatRupiahShort(tenant.monthlyRevenue || 0), icon: TrendingUp, color: 'text-gold' },
          { label: t('superAdmin.tenantDetail.openTickets'),  value: tickets.filter(tk => tk.status === 'open').length, icon: MessageSquare, color: 'text-amber-400' },
        ].map((item, i) => (
          <motion.div key={item.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs text-muted truncate">{item.label}</p>
                <item.icon size={15} className={`${item.color} flex-shrink-0`} />
              </div>
              <p className="text-lg sm:text-xl font-bold text-off-white whitespace-nowrap">
                {item.valueShort != null ? (
                  <>
                    <span className="sm:hidden">{item.valueShort}</span>
                    <span className="hidden sm:inline">{item.value}</span>
                  </>
                ) : item.value}
              </p>
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

      {/* Branch & Lisensi */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <GitBranch size={15} className="text-gold" />
                <h3 className="font-semibold text-off-white">Cabang &amp; Lisensi</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setUpgradeTarget(sub?.package === 'Basic' ? 'Pro' : 'Enterprise'); setShowUpgradeModal(true) }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-blue-400/30 text-blue-400 hover:bg-blue-400/10 transition-colors"
                >
                  <ArrowUpCircle size={13} />
                  Upgrade Paket
                </button>
                <button
                  onClick={() => setShowGrantModal(true)}
                  disabled={!fullSub?.id}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-green-500/30 text-green-400 hover:bg-green-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Gift size={13} />
                  Grant Lisensi Gratis
                </button>
              </div>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            {/* Quota summary */}
            {licSummary ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Kuota Paket', value: licSummary.maxBranches ?? '∞', color: 'text-blue-400' },
                  { label: 'Addon Dibayar', value: licSummary.paidAddonCount ?? 0, color: 'text-green-400' },
                  { label: 'Total Berlisensi', value: (licSummary.maxBranches ?? 0) + (licSummary.paidAddonCount ?? 0), color: 'text-gold' },
                  { label: 'Cabang Aktif', value: licSummary.totalBranches ?? branches.length, color: 'text-off-white' },
                ].map(item => (
                  <div key={item.label} className="bg-dark-bg/60 rounded-xl p-3 border border-dark-border">
                    <p className="text-xs text-muted mb-1">{item.label}</p>
                    <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {[0,1,2,3].map(i => <div key={i} className="h-14 bg-dark-bg/60 rounded-xl animate-pulse border border-dark-border" />)}
              </div>
            )}

            {/* Addon pricing info */}
            {licSummary?.branchAddonPrice > 0 && (
              <p className="text-xs text-muted">
                Biaya addon cabang:&nbsp;
                <span className="text-amber-400 font-semibold">{formatRupiah(licSummary.branchAddonPrice)}</span>
                {licSummary.branchAddonType === 'onetime' ? ' (sekali bayar)' : '/bulan'}
              </p>
            )}
            {licSummary && !licSummary.branchAddonPrice && licSummary.hasSubscription && (
              <p className="text-xs text-muted">Paket ini tidak mengenakan biaya addon cabang — semua cabang berlisensi otomatis.</p>
            )}

            {/* Pending branch invoices */}
            {pendingBranchInvoices.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-400 uppercase mb-2 flex items-center gap-1.5">
                  <AlertCircle size={12} />
                  Invoice Cabang Pending ({pendingBranchInvoices.length})
                </p>
                <div className="space-y-2">
                  {pendingBranchInvoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-off-white truncate">{inv.period}</p>
                        <p className="text-xs text-muted mt-0.5">{formatRupiah(inv.amount)}</p>
                      </div>
                      <Badge variant="warning" className="text-xs flex-shrink-0">{inv.status}</Badge>
                      <button
                        onClick={() => handlePayInvoice(inv.id)}
                        disabled={payingId === inv.id}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 disabled:opacity-50 transition-colors flex-shrink-0"
                      >
                        {payingId === inv.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        Tandai Lunas
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Branch list */}
            <div>
              <p className="text-xs font-semibold text-muted uppercase mb-2">Daftar Cabang ({branches.length})</p>
              {branches.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">Belum ada cabang</p>
              ) : (
                <div className="space-y-2">
                  {branches.map(branch => (
                    <div key={branch.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-dark-border hover:border-gold/20 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-off-white truncate">{branch.name}</p>
                        {branch.address && <p className="text-xs text-muted truncate mt-0.5">{branch.address}</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {branch.isActive ? (
                          <span className="text-xs text-green-400">Aktif</span>
                        ) : (
                          <span className="text-xs text-muted">Nonaktif</span>
                        )}
                        {branch.isLicensed ? (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">
                            <CheckCircle2 size={10} /> Berlisensi
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
                            <AlertCircle size={10} /> Belum Berlisensi
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      </motion.div>

      {/* Feature Flags */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
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

      {/* Grant Lisensi Modal */}
      {showGrantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-dark-card border border-dark-border rounded-2xl p-6 w-full max-w-md shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Gift size={18} className="text-green-400" />
                <h3 className="font-semibold text-off-white">Grant Lisensi Cabang Gratis</h3>
              </div>
              <button onClick={() => setShowGrantModal(false)} className="text-muted hover:text-off-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-muted mb-4">
              Menambah +1 kuota lisensi cabang untuk <span className="text-off-white font-semibold">{tenant.name}</span> tanpa biaya.
              Invoice branch_addon dengan jumlah Rp 0 akan dibuat sebagai bukti.
            </p>
            <div className="mb-4">
              <label className="block text-xs text-muted mb-1.5">Catatan (opsional)</label>
              <input
                type="text"
                value={grantNote}
                onChange={e => setGrantNote(e.target.value)}
                placeholder="Contoh: Program promosi Mei 2026"
                className="w-full bg-dark-bg border border-dark-border rounded-xl px-3 py-2 text-sm text-off-white placeholder-muted focus:outline-none focus:border-gold/50"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowGrantModal(false)} className="flex-1 py-2 rounded-xl border border-dark-border text-muted hover:text-off-white text-sm transition-colors">
                Batal
              </button>
              <button
                onClick={handleGrant}
                disabled={grantLicense.isPending}
                className="flex-1 py-2 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {grantLicense.isPending ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
                Grant Lisensi
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Upgrade Paket Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-dark-card border border-dark-border rounded-2xl p-6 w-full max-w-md shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ArrowUpCircle size={18} className="text-blue-400" />
                <h3 className="font-semibold text-off-white">Upgrade Paket</h3>
              </div>
              <button onClick={() => setShowUpgradeModal(false)} className="text-muted hover:text-off-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-muted mb-4">
              Pilih paket baru untuk <span className="text-off-white font-semibold">{tenant.name}</span>.
              Harga subscription akan disesuaikan otomatis.
            </p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {['Basic', 'Pro', 'Enterprise'].map(pkg => (
                <button
                  key={pkg}
                  onClick={() => setUpgradeTarget(pkg)}
                  className={`py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                    upgradeTarget === pkg
                      ? pkg === 'Basic' ? 'border-blue-400/60 bg-blue-400/10 text-blue-400'
                        : pkg === 'Pro' ? 'border-gold/60 bg-gold/10 text-gold'
                        : 'border-purple-400/60 bg-purple-400/10 text-purple-400'
                      : 'border-dark-border text-muted hover:border-gold/20'
                  }`}
                >
                  {pkg}
                </button>
              ))}
            </div>
            {sub?.package === upgradeTarget && (
              <p className="text-xs text-amber-400 mb-4 flex items-center gap-1.5">
                <AlertCircle size={12} /> Ini adalah paket yang sedang aktif.
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setShowUpgradeModal(false)} className="flex-1 py-2 rounded-xl border border-dark-border text-muted hover:text-off-white text-sm transition-colors">
                Batal
              </button>
              <button
                onClick={handleUpgrade}
                disabled={upgradePkg.isPending || !fullSub?.id}
                className="flex-1 py-2 rounded-xl bg-blue-400/10 border border-blue-400/30 text-blue-400 hover:bg-blue-400/20 text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {upgradePkg.isPending ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpCircle size={14} />}
                Terapkan
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
