import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
  Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Building2, Users, TrendingUp,
  ExternalLink, Eye, ChevronRight, Check, AlertTriangle, Search,
  Clock, CheckCircle, XCircle, CreditCard, Calendar,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { differenceInDays, format } from 'date-fns'
import { useTenants, useCreateTenant, useUpdateTenant, useDeleteTenant } from '../../hooks/useTenants.js'
import { usePackages } from '../../hooks/usePackages.js'
import { useAuthStore } from '../../store/authStore.js'
import { useFeatureFlagStore } from '../../store/featureFlagStore.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import Select from '../../components/ui/Select.jsx'
import { formatRupiah } from '../../utils/format.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const PACKAGE_COLORS = {
  Basic:      'text-blue-400 bg-blue-400/10 border-blue-400/20',
  Pro:        'text-gold bg-gold/10 border-gold/20',
  Enterprise: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
}

const SUB_STATUS = {
  active:  { label: 'Aktif',   variant: 'success', icon: CheckCircle, color: 'text-green-400' },
  trial:   { label: 'Trial',   variant: 'info',    icon: Clock,        color: 'text-blue-400' },
  overdue: { label: 'Overdue', variant: 'danger',  icon: AlertTriangle, color: 'text-amber-400' },
  expired: { label: 'Expired', variant: 'muted',   icon: XCircle,       color: 'text-muted' },
}

const FILTER_PILLS = [
  { key: 'all',       label: 'Semua' },
  { key: 'active',    label: 'Sub Aktif' },
  { key: 'trial',     label: 'Trial' },
  { key: 'overdue',   label: 'Overdue' },
  { key: 'expired',   label: 'Expired' },
  { key: 'expiring',  label: 'Segera Habis' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'no_sub',    label: 'Tanpa Sub' },
]

const PACKAGES = [
  { value: 'Basic', label: 'Basic' },
  { value: 'Pro', label: 'Pro' },
  { value: 'Enterprise', label: 'Enterprise' },
]

function subDaysLeft(tenant) {
  if (!tenant.subscription?.endDate) return null
  return differenceInDays(new Date(tenant.subscription.endDate), new Date())
}

function matchFilter(tenant, key) {
  switch (key) {
    case 'active':    return tenant.subscriptionStatus === 'active' && !tenant.isSuspended
    case 'trial':     return tenant.subscriptionStatus === 'trial'
    case 'overdue':   return tenant.subscriptionStatus === 'overdue'
    case 'expired':   return tenant.subscriptionStatus === 'expired'
    case 'suspended': return tenant.isSuspended === true
    case 'no_sub':    return !tenant.subscriptionStatus
    case 'expiring': {
      if (tenant.subscriptionStatus !== 'active') return false
      const d = subDaysLeft(tenant)
      return d !== null && d >= 0 && d <= 7
    }
    default: return true
  }
}

function cardAccent(tenant) {
  if (tenant.isSuspended) return 'border-l-4 border-l-red-500/60'
  const d = subDaysLeft(tenant)
  if (tenant.subscriptionStatus === 'overdue') return 'border-l-4 border-l-amber-500/60'
  if (tenant.subscriptionStatus === 'expired') return 'border-l-4 border-l-zinc-600/50'
  if (d !== null && d <= 7 && tenant.subscriptionStatus === 'active') return 'border-l-4 border-l-amber-400/70'
  if (tenant.subscriptionStatus === 'trial') return 'border-l-4 border-l-blue-400/50'
  return ''
}

// ── Sub Info inline ───────────────────────────────────────────────────────────
function SubInfo({ tenant }) {
  const status = tenant.subscriptionStatus
  if (!status) return (
    <span className="text-xs text-muted/60 italic flex items-center gap-1">
      <CreditCard size={11} />Belum ada subscription
    </span>
  )
  const cfg = SUB_STATUS[status] || SUB_STATUS.active
  const d = subDaysLeft(tenant)
  const endDate = tenant.subscription?.endDate
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant={cfg.variant}>{cfg.label}</Badge>
      {endDate && (
        <>
          <span className={`text-xs font-medium ${d < 0 ? 'text-red-400' : d <= 7 ? 'text-amber-400' : 'text-muted'}`}>
            {d < 0
              ? `berakhir ${Math.abs(d)} hari lalu`
              : d === 0
                ? 'berakhir hari ini'
                : `${d} hari lagi`}
          </span>
          <span className="text-xs text-muted/50 flex items-center gap-1">
            <Calendar size={10} />
            {format(new Date(endDate), 'dd MMM yy')}
          </span>
        </>
      )}
    </div>
  )
}

// ── Onboarding Wizard ─────────────────────────────────────────────────────────
function OnboardingWizard({ onClose, onComplete, submitting, packageList = [] }) {
  const { t } = useTranslation()
  const WIZARD_STEPS = [t('superAdmin.tenants.wizardStepInfo'), t('superAdmin.tenants.wizardStepPackage'), t('superAdmin.tenants.wizardStepConfirm')]
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ name: '', slug: '', ownerEmail: '', ownerName: '', phone: '', package: packageList[0]?.name || 'Basic' })
  const [emailError, setEmailError] = useState('')

  const canNext = () => {
    if (step === 0) return form.name.trim() && form.slug.trim() && form.ownerEmail.trim() && EMAIL_RE.test(form.ownerEmail.trim())
    if (step === 1) return !!form.package
    return true
  }

  const handleEmailChange = (val) => {
    setForm(f => ({ ...f, ownerEmail: val }))
    setEmailError(val && !EMAIL_RE.test(val) ? t('superAdmin.tenants.invalidEmail') : '')
  }

  const pkgOptions = packageList.length > 0
    ? packageList
    : [
        { name: 'Basic',      price: 299000, maxBranches: 1,  maxStaff: 5,  features: [] },
        { name: 'Pro',        price: 599000, maxBranches: 5,  maxStaff: 25, features: [] },
        { name: 'Enterprise', price: 1299000, maxBranches: 99, maxStaff: 999, features: [] },
      ]

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {WIZARD_STEPS.map((label, i) => (
          <React.Fragment key={i}>
            <div className={`flex items-center gap-2 ${i <= step ? 'text-gold' : 'text-muted'}`}>
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${i < step ? 'border-gold bg-gold text-dark' : i === step ? 'border-gold text-gold' : 'border-dark-border text-muted'}`}>
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              <span className="text-xs font-medium hidden sm:block">{label}</span>
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <div className={`flex-1 h-px ${i < step ? 'bg-gold/50' : 'bg-dark-border'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step 0: Info Tenant */}
      {step === 0 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <Input label={t('superAdmin.tenants.wizardNameLabel')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('superAdmin.tenants.wizardNamePlaceholder')} />
          <Input
            label={t('superAdmin.tenants.wizardSlugLabel')}
            value={form.slug}
            onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') }))}
            placeholder={t('superAdmin.tenants.wizardSlugPlaceholder')}
            hint={form.slug ? `URL: ${form.slug}.barberos.com` : undefined}
          />
          <div>
            <Input label={t('superAdmin.tenants.wizardOwnerEmailLabel')} type="email" value={form.ownerEmail} onChange={e => handleEmailChange(e.target.value)} placeholder={t('superAdmin.tenants.wizardOwnerEmailPlaceholder')} />
            {emailError && <p className="text-xs text-red-400 mt-1">{emailError}</p>}
          </div>
          <Input label={t('superAdmin.tenants.wizardOwnerNameLabel')} value={form.ownerName} onChange={e => setForm(f => ({ ...f, ownerName: e.target.value }))} placeholder={t('superAdmin.tenants.wizardOwnerNamePlaceholder')} />
          <Input label={t('superAdmin.tenants.wizardPhoneLabel')} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder={t('superAdmin.tenants.wizardPhonePlaceholder')} />
        </motion.div>
      )}

      {/* Step 1: Pilih Paket */}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
          {pkgOptions.map(pkg => (
            <button
              key={pkg.name}
              onClick={() => setForm(f => ({ ...f, package: pkg.name }))}
              className={`w-full p-4 rounded-2xl border text-left transition-all ${form.package === pkg.name ? 'border-gold bg-gold/5' : 'border-dark-border hover:border-gold/30'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${PACKAGE_COLORS[pkg.name]}`}>{pkg.name}</span>
                  {form.package === pkg.name && <Check size={14} className="text-gold" />}
                </div>
                <span className="text-gold font-semibold text-sm">{formatRupiah(pkg.price)}<span className="text-xs text-muted font-normal">/bln</span></span>
              </div>
              <div className="flex gap-4 text-xs text-muted">
                <span>• Maks {pkg.maxBranches} cabang</span>
                <span>• Maks {pkg.maxStaff} staf</span>
                <span>• {pkg.features?.length || 0} fitur</span>
              </div>
            </button>
          ))}
          <p className="text-xs text-muted/60 text-center">Subscription dimulai sebagai <span className="text-amber-400">Trial 14 hari</span></p>
        </motion.div>
      )}

      {/* Step 2: Konfirmasi */}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
          <div className="p-4 bg-dark-card rounded-2xl border border-dark-border space-y-2.5">
            <p className="text-xs text-muted uppercase font-semibold mb-3">{t('superAdmin.tenants.wizardSummary')}</p>
            {[
              { label: 'Nama Barbershop', value: form.name },
              { label: 'URL Slug',        value: `${form.slug}.barberos.com` },
              { label: 'Email Owner',     value: form.ownerEmail },
              { label: 'Paket',           value: form.package },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center">
                <span className="text-sm text-muted">{row.label}</span>
                <span className="text-sm text-off-white font-medium">{row.value}</span>
              </div>
            ))}
          </div>
          <div className="p-3 bg-amber-400/5 border border-amber-400/20 rounded-xl">
            <p className="text-xs text-amber-300">
              Password default: <code className="font-mono bg-dark-card px-1.5 py-0.5 rounded text-amber-400">ChangeMe123!</code> — minta owner untuk mengubahnya saat login pertama.
            </p>
          </div>
        </motion.div>
      )}

      <div className="flex gap-3 pt-1">
        <Button variant="secondary" fullWidth onClick={step === 0 ? onClose : () => setStep(s => s - 1)} disabled={submitting}>
          {step === 0 ? t('common.cancel') : t('superAdmin.tenants.wizardBack')}
        </Button>
        <Button
          fullWidth
          disabled={!canNext() || submitting}
          onClick={() => step < WIZARD_STEPS.length - 1 ? setStep(s => s + 1) : onComplete(form)}
          icon={step === WIZARD_STEPS.length - 1 ? Check : ChevronRight}
        >
          {step === WIZARD_STEPS.length - 1
            ? (submitting ? t('common.loading') : t('superAdmin.tenants.wizardCreateTenant'))
            : t('superAdmin.tenants.wizardNext')}
        </Button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SATenantsPage() {
  const { t } = useTranslation()
  const { data: tenants = [], isLoading, isError, error, refetch } = useTenants({ limit: 100 })
  const { data: pkgData } = usePackages()
  const createTenant = useCreateTenant()
  const updateTenant = useUpdateTenant()
  const deleteTenant = useDeleteTenant()
  const { impersonate } = useAuthStore()
  const { setFromPackage } = useFeatureFlagStore()
  const toast = useToast()
  const navigate = useNavigate()

  const packageList = pkgData?.list || []

  const [showWizard, setShowWizard]       = useState(false)
  const [showEdit, setShowEdit]           = useState(false)
  const [editTenant, setEditTenant]       = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [statusFilter, setStatusFilter]   = useState('all')
  const [pkgFilter, setPkgFilter]         = useState('all')
  const [searchText, setSearchText]       = useState('')
  const [form, setForm]     = useState({ name: '', slug: '', email: '', package: 'Basic' })
  const [editEmailError, setEditEmailError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  const stats = useMemo(() => {
    const active    = tenants.filter(t => t.subscriptionStatus === 'active' && !t.isSuspended).length
    const trial     = tenants.filter(t => t.subscriptionStatus === 'trial').length
    const overdue   = tenants.filter(t => t.subscriptionStatus === 'overdue').length
    const suspended = tenants.filter(t => t.isSuspended).length
    const expiring  = tenants.filter(t => {
      if (t.subscriptionStatus !== 'active') return false
      const d = subDaysLeft(t)
      return d !== null && d >= 0 && d <= 7
    }).length
    return { total: tenants.length, active, trial, overdue, suspended, expiring }
  }, [tenants])

  const pillCount = (key) => {
    switch (key) {
      case 'active':    return stats.active
      case 'trial':     return stats.trial
      case 'overdue':   return stats.overdue
      case 'expired':   return tenants.filter(t => t.subscriptionStatus === 'expired').length
      case 'expiring':  return stats.expiring
      case 'suspended': return stats.suspended
      case 'no_sub':    return tenants.filter(t => !t.subscriptionStatus).length
      default:          return stats.total
    }
  }

  const filtered = useMemo(() => tenants.filter(tn => {
    if (!matchFilter(tn, statusFilter)) return false
    if (pkgFilter !== 'all' && tn.package !== pkgFilter) return false
    if (searchText) {
      const q = searchText.toLowerCase()
      if (!tn.name?.toLowerCase().includes(q) && !tn.slug?.toLowerCase().includes(q) && !tn.email?.toLowerCase().includes(q)) return false
    }
    return true
  }), [tenants, statusFilter, pkgFilter, searchText])

  const extractErr = (err, fallbackKey) =>
    err?.response?.data?.error || err?.response?.data?.message || t(fallbackKey)

  const handleWizardComplete = async (data) => {
    if (createTenant.isPending) return
    try {
      const newTenant = await createTenant.mutateAsync({
        name: data.name, slug: data.slug, ownerEmail: data.ownerEmail,
        ownerName: data.ownerName, phone: data.phone, package: data.package,
      })
      if (newTenant?.id) setFromPackage(newTenant.id, data.package)
      toast.success(t('superAdmin.tenants.toastCreatedSuccess', { name: data.name, pkg: data.package }))
      setShowWizard(false)
    } catch (err) {
      toast.error(extractErr(err, 'superAdmin.tenants.toastCreateFailed'))
    }
  }

  const openEdit = (tenant) => {
    setEditTenant(tenant)
    setForm({ name: tenant.name || '', slug: tenant.slug || '', email: tenant.email || '', package: tenant.package || 'Basic' })
    setEditEmailError('')
    setShowEdit(true)
  }

  const handleSaveEdit = async () => {
    if (updateTenant.isPending) return
    if (!form.name.trim() || !form.slug.trim()) return toast.error(t('superAdmin.tenants.toastNameSlugRequired'))
    if (form.email && !EMAIL_RE.test(form.email)) { setEditEmailError(t('superAdmin.tenants.invalidEmail')); return }
    try {
      const payload = { id: editTenant.id, name: form.name.trim(), slug: form.slug.trim(), package: form.package }
      if (form.email && form.email !== editTenant.email) payload.email = form.email.trim()
      await updateTenant.mutateAsync(payload)
      toast.success(t('superAdmin.tenants.toastUpdatedSuccess'))
      setShowEdit(false)
    } catch (err) {
      toast.error(extractErr(err, 'superAdmin.tenants.toastUpdateFailed'))
    }
  }

  const handleToggleStatus = async (tenant) => {
    if (updateTenant.isPending) return
    const willSuspend = !tenant.isSuspended
    try {
      await updateTenant.mutateAsync({ id: tenant.id, isSuspended: willSuspend })
      toast.info(willSuspend
        ? t('superAdmin.tenants.toastSuspended', { name: tenant.name })
        : t('superAdmin.tenants.toastActivated', { name: tenant.name }))
    } catch (err) {
      toast.error(extractErr(err, 'superAdmin.tenants.toastStatusFailed'))
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete || deletingId) return
    setDeletingId(confirmDelete.id)
    try {
      await deleteTenant.mutateAsync(confirmDelete.id)
      toast.success(t('superAdmin.tenants.toastDeleted'))
      setConfirmDelete(null)
    } catch (err) {
      toast.error(extractErr(err, 'superAdmin.tenants.toastDeleteFailed'))
    } finally {
      setDeletingId(null)
    }
  }

  const handleImpersonate = (tenant) => {
    const virtualUser = {
      id: `impersonated-${tenant.id}`,
      role: 'tenant_admin',
      tenantId: tenant.id,
      name: `[Impersonate] ${tenant.name}`,
      email: tenant.email,
    }
    const path = impersonate(virtualUser)
    if (path) { toast.info(t('superAdmin.tenants.toastImpersonate', { name: tenant.name })); navigate(path) }
    else toast.error(t('superAdmin.tenants.toastImpersonateFailed'))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">{t('superAdmin.tenants.pageTitle')}</h1>
          <p className="text-muted text-sm mt-1">
            {isLoading ? t('common.loading') : t('superAdmin.tenants.registeredCount', { count: tenants.length })}
          </p>
        </div>
        <Button icon={Plus} onClick={() => setShowWizard(true)}>{t('superAdmin.tenants.addTenant')}</Button>
      </div>

      {/* KPI Row */}
      {!isLoading && tenants.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total Tenant',  value: stats.total,     icon: Building2,     color: 'text-off-white' },
            { label: 'Sub Aktif',     value: stats.active,    icon: CheckCircle,   color: 'text-green-400' },
            { label: 'Trial',         value: stats.trial,     icon: Clock,         color: 'text-blue-400' },
            { label: 'Overdue',       value: stats.overdue,   icon: AlertTriangle, color: 'text-amber-400' },
            { label: 'Suspended',     value: stats.suspended, icon: XCircle,       color: 'text-red-400' },
          ].map((kpi, i) => (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <button
                onClick={() => setStatusFilter(
                  ['all', 'active', 'trial', 'overdue', 'suspended'][i]
                )}
                className="w-full text-left"
              >
                <Card className={`p-4 transition-all hover:border-gold/30 ${statusFilter === ['all','active','trial','overdue','suspended'][i] ? 'border-gold/40 bg-gold/3' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted">{kpi.label}</p>
                    <kpi.icon size={14} className={kpi.color} />
                  </div>
                  <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                </Card>
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Expiring soon banner */}
      {!isLoading && stats.expiring > 0 && (
        <Card className="p-3.5 border-amber-400/30 bg-amber-400/5">
          <div className="flex items-center gap-3">
            <Clock size={15} className="text-amber-400 flex-shrink-0" />
            <p className="text-sm text-amber-300 flex-1">
              <span className="font-semibold">{stats.expiring} tenant</span> subscription-nya habis dalam 7 hari ke depan
            </p>
            <button
              onClick={() => setStatusFilter('expiring')}
              className="text-xs text-amber-400 underline underline-offset-2 flex-shrink-0"
            >
              Lihat
            </button>
          </div>
        </Card>
      )}

      {/* Filter bar */}
      {!isLoading && (
        <div className="space-y-3">
          {/* Search + Package */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Cari nama, slug, atau email..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="w-full bg-dark-surface border border-dark-border rounded-xl pl-9 pr-4 py-2 text-sm text-off-white placeholder-muted focus:outline-none focus:border-gold/50"
              />
            </div>
            <select
              value={pkgFilter}
              onChange={e => setPkgFilter(e.target.value)}
              className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2 text-sm outline-none focus:border-gold/50"
            >
              <option value="all">Semua Paket</option>
              <option value="Basic">Basic</option>
              <option value="Pro">Pro</option>
              <option value="Enterprise">Enterprise</option>
            </select>
          </div>

          {/* Status pills */}
          <div className="flex gap-1.5 flex-wrap">
            {FILTER_PILLS.map(pill => {
              const count = pillCount(pill.key)
              const active = statusFilter === pill.key
              return (
                <button
                  key={pill.key}
                  onClick={() => setStatusFilter(pill.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                    active
                      ? 'bg-gold/15 text-gold border-gold/40'
                      : 'text-muted border-dark-border hover:text-off-white hover:border-dark-border/80'
                  }`}
                >
                  {pill.label}
                  <span className={`ml-1.5 ${active ? 'text-gold/70' : 'text-muted/60'}`}>{count}</span>
                </button>
              )
            })}
            {(statusFilter !== 'all' || pkgFilter !== 'all' || searchText) && (
              <button
                onClick={() => { setStatusFilter('all'); setPkgFilter('all'); setSearchText('') }}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-red-400/70 border border-red-400/20 hover:text-red-400 hover:border-red-400/40 transition-all"
              >
                Reset filter
              </button>
            )}
          </div>

          {/* Result count */}
          {filtered.length !== tenants.length && (
            <p className="text-xs text-muted">
              Menampilkan <span className="text-off-white font-medium">{filtered.length}</span> dari {tenants.length} tenant
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <Card className="p-6 border-red-400/30 bg-red-400/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-300">{t('superAdmin.tenants.errorLoad')}</p>
              <p className="text-xs text-muted mt-1">{error?.response?.data?.error || error?.message || ''}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>Coba lagi</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-64 rounded-2xl bg-dark-card animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && filtered.length === 0 && (
        <Card className="p-12 text-center">
          <Building2 className="w-12 h-12 text-muted mx-auto mb-3 opacity-30" />
          <p className="text-off-white font-medium">
            {tenants.length === 0 ? t('superAdmin.tenants.emptyTitle') : 'Tidak ada tenant yang cocok'}
          </p>
          <p className="text-muted text-sm mt-1">
            {tenants.length === 0 ? t('superAdmin.tenants.emptyDesc') : 'Coba ubah filter atau kata pencarian'}
          </p>
          {tenants.length > 0 && (
            <Button variant="secondary" size="sm" className="mt-4" onClick={() => { setStatusFilter('all'); setPkgFilter('all'); setSearchText('') }}>
              Hapus filter
            </Button>
          )}
        </Card>
      )}

      {/* Tenant Grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((tenant, i) => (
            <motion.div
              key={tenant.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.25) }}
              className={tenant.isSuspended ? 'opacity-65' : ''}
            >
              <Card className={`p-5 card-hover ${cardAccent(tenant)}`}>
                {/* Card header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-11 h-11 flex-shrink-0 rounded-2xl flex items-center justify-center border ${tenant.isSuspended ? 'bg-red-500/10 border-red-500/20' : 'bg-gold/10 border-gold/20'}`}>
                      {tenant.logo
                        ? <img src={tenant.logo} alt={tenant.name} className="w-full h-full object-cover rounded-2xl" />
                        : <span className={`font-display text-lg font-bold ${tenant.isSuspended ? 'text-red-400' : 'text-gold'}`}>{(tenant.name || '?')[0]}</span>
                      }
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-off-white truncate leading-tight">{tenant.name}</h3>
                      <p className="text-xs text-muted/70 truncate">
                        {tenant.slug ? `${tenant.slug}.barberos.com` : tenant.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
                    {tenant.package && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PACKAGE_COLORS[tenant.package] || 'text-muted border-dark-border'}`}>
                        {tenant.package}
                      </span>
                    )}
                    <Badge variant={tenant.isSuspended ? 'danger' : 'success'} dot size="xs">
                      {tenant.isSuspended ? 'Suspended' : 'Aktif'}
                    </Badge>
                  </div>
                </div>

                {/* Subscription info */}
                <div className="px-3 py-2.5 bg-dark-surface rounded-xl mb-3">
                  <SubInfo tenant={tenant} />
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-dark-surface rounded-xl p-2 text-center">
                    <Building2 className="w-3.5 h-3.5 text-muted mx-auto mb-1" />
                    <p className="text-base font-bold text-off-white">{tenant.totalBranches}</p>
                    <p className="text-[10px] text-muted">Cabang</p>
                  </div>
                  <div className="bg-dark-surface rounded-xl p-2 text-center">
                    <Users className="w-3.5 h-3.5 text-muted mx-auto mb-1" />
                    <p className="text-base font-bold text-off-white">{tenant.totalStaff}</p>
                    <p className="text-[10px] text-muted">Staf</p>
                  </div>
                  <div className="bg-dark-surface rounded-xl p-2 text-center">
                    <TrendingUp className="w-3.5 h-3.5 text-muted mx-auto mb-1" />
                    <p className="text-base font-bold text-gold">
                      {tenant.monthlyRevenue > 0 ? `${(tenant.monthlyRevenue / 1_000_000).toFixed(1)}M` : '—'}
                    </p>
                    <p className="text-[10px] text-muted">MTD</p>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-2.5 border-t border-dark-border/50">
                  <span className="text-[10px] text-muted/50">
                    Bergabung {tenant.createdAt ? format(new Date(tenant.createdAt), 'MMM yyyy') : '—'}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => handleImpersonate(tenant)}
                      className="p-1.5 rounded-lg text-muted hover:text-gold hover:bg-gold/10 transition-colors"
                      title="Login sebagai tenant"
                    >
                      <ExternalLink size={14} />
                    </button>
                    <button
                      onClick={() => navigate(`/super-admin/tenants/${tenant.id}`)}
                      className="p-1.5 rounded-lg text-muted hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
                      title="Lihat detail"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => openEdit(tenant)}
                      className="p-1.5 rounded-lg text-muted hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleToggleStatus(tenant)}
                      disabled={updateTenant.isPending}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                        tenant.isSuspended
                          ? 'text-red-400 hover:text-green-400 hover:bg-green-400/10'
                          : 'text-green-400 hover:text-amber-400 hover:bg-amber-400/10'
                      }`}
                      title={tenant.isSuspended ? 'Aktifkan kembali' : 'Suspend tenant'}
                    >
                      {tenant.isSuspended ? <ToggleLeft size={18} /> : <ToggleRight size={18} />}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(tenant)}
                      className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      title="Hapus tenant"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Wizard Modal */}
      <Modal isOpen={showWizard} onClose={() => !createTenant.isPending && setShowWizard(false)} title={t('superAdmin.tenants.modalOnboardingTitle')} size="md">
        <OnboardingWizard
          onClose={() => setShowWizard(false)}
          onComplete={handleWizardComplete}
          submitting={createTenant.isPending}
          packageList={packageList}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEdit} onClose={() => !updateTenant.isPending && setShowEdit(false)} title={t('superAdmin.tenants.modalEditTitle')}>
        <div className="space-y-4">
          <Input label={t('superAdmin.tenants.editNameLabel')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input
            label={t('superAdmin.tenants.editSlugLabel')}
            value={form.slug}
            onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') }))}
            hint={form.slug ? `${form.slug}.barberos.com` : undefined}
          />
          <div>
            <Input
              label={t('superAdmin.tenants.editOwnerEmailLabel')}
              type="email"
              value={form.email}
              onChange={e => {
                const v = e.target.value
                setForm(f => ({ ...f, email: v }))
                setEditEmailError(v && !EMAIL_RE.test(v) ? t('superAdmin.tenants.invalidEmail') : '')
              }}
            />
            {editEmailError && <p className="text-xs text-red-400 mt-1">{editEmailError}</p>}
          </div>
          <Select
            label={t('superAdmin.tenants.editPackageLabel')}
            value={form.package}
            onChange={e => setForm(f => ({ ...f, package: e.target.value }))}
            options={PACKAGES}
            placeholder=""
          />
          {/* Suspend toggle in edit modal */}
          {editTenant && (
            <div className="flex items-center justify-between p-3 bg-dark-surface rounded-xl border border-dark-border">
              <div>
                <p className="text-sm text-off-white">Status Tenant</p>
                <p className="text-xs text-muted mt-0.5">{editTenant.isSuspended ? 'Tenant sedang di-suspend' : 'Tenant aktif'}</p>
              </div>
              <Badge variant={editTenant.isSuspended ? 'danger' : 'success'} dot>
                {editTenant.isSuspended ? 'Suspended' : 'Aktif'}
              </Badge>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" fullWidth onClick={() => setShowEdit(false)} disabled={updateTenant.isPending}>{t('common.cancel')}</Button>
            <Button fullWidth onClick={handleSaveEdit} disabled={updateTenant.isPending}>
              {updateTenant.isPending ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={!!confirmDelete}
        onClose={() => !deletingId && setConfirmDelete(null)}
        title="Hapus Tenant"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
            <p className="text-sm text-red-300 font-medium">Tindakan ini tidak dapat dibatalkan</p>
            <p className="text-xs text-muted mt-1">
              Semua data tenant <span className="text-off-white font-semibold">{confirmDelete?.name}</span> akan dihapus permanen termasuk subscription, invoice, cabang, dan staf.
            </p>
          </div>
          <p className="text-sm text-muted">Ketik nama tenant untuk konfirmasi: <span className="text-off-white">{confirmDelete?.name}</span></p>
          <ConfirmDeleteInput
            expected={confirmDelete?.name || ''}
            onConfirm={handleDelete}
            onCancel={() => setConfirmDelete(null)}
            loading={!!deletingId}
          />
        </div>
      </Modal>
    </div>
  )
}

// Minimal confirm-by-typing component
function ConfirmDeleteInput({ expected, onConfirm, onCancel, loading }) {
  const [val, setVal] = useState('')
  const match = val === expected
  return (
    <div className="space-y-3">
      <input
        type="text"
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder={`Ketik "${expected}"`}
        className="w-full bg-dark-surface border border-dark-border rounded-xl px-3 py-2.5 text-sm text-off-white placeholder-muted focus:outline-none focus:border-red-400/50"
      />
      <div className="flex gap-3">
        <Button variant="secondary" fullWidth onClick={onCancel} disabled={loading}>Batal</Button>
        <Button
          variant="danger"
          fullWidth
          disabled={!match || loading}
          onClick={onConfirm}
        >
          {loading ? 'Menghapus...' : 'Hapus Permanen'}
        </Button>
      </div>
    </div>
  )
}
