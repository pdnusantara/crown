import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Building2, DollarSign, Users, TrendingUp, AlertTriangle, Heart,
  ExternalLink, Clock, CheckCircle, XCircle, CreditCard, Plus,
  ChevronRight, Activity, MessageSquare, GitBranch, ArrowUpRight,
  ArrowDownRight, Eye,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  differenceInDays, format, startOfMonth, endOfMonth, subMonths,
} from 'date-fns'
import { useTenants } from '../../hooks/useTenants.js'
import { usePackages } from '../../hooks/usePackages.js'
import { useAuthStore } from '../../store/authStore.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import { formatRupiah, formatDate } from '../../utils/format.js'

// ── Constants ─────────────────────────────────────────────────────────────────
const PKG_COLOR  = { Basic: '#3B82F6', Pro: '#C9A84C', Enterprise: '#8B5CF6' }
const SUB_COLORS = { active: '#4ADE80', trial: '#60A5FA', overdue: '#F59E0B', expired: '#6B7280' }

// ── Health score ──────────────────────────────────────────────────────────────
function calcHealthScore(tenant) {
  const sub = tenant.subscription
  let score = 100
  if (!sub) return 25
  if (sub.status === 'overdue') score -= 40
  if (sub.status === 'expired') score -= 60
  if (sub.status === 'trial')   score -= 10
  if (sub.endDate) {
    const d = differenceInDays(new Date(sub.endDate), new Date())
    if (d < 0)   score -= 20
    else if (d < 7)  score -= 15
    else if (d < 30) score -= 5
  }
  if (sub.autoRenew === false) score -= 10
  if (tenant.isSuspended) score -= 30
  return Math.max(0, Math.min(100, score))
}

function HealthBar({ score }) {
  const color = score >= 75 ? 'bg-green-400' : score >= 50 ? 'bg-amber-400' : score >= 25 ? 'bg-orange-400' : 'bg-red-400'
  const text  = color.replace('bg-', 'text-')
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-dark-surface rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className={`text-xs font-bold w-7 text-right tabular-nums ${text}`}>{score}</span>
    </div>
  )
}

// ── Custom tooltip for recharts ───────────────────────────────────────────────
function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass rounded-xl px-3 py-2.5 text-xs">
      <p className="text-muted mb-1.5 font-medium">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-off-white">{p.name}: {formatter ? formatter(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, iconColor = 'text-gold', delta, delay = 0, onClick }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className={`p-4 ${onClick ? 'cursor-pointer hover:border-gold/30 transition-colors' : ''}`} onClick={onClick}>
        <div className="flex items-start justify-between mb-2">
          <p className="text-xs text-muted leading-tight">{label}</p>
          <Icon size={15} className={iconColor} />
        </div>
        <p className="text-2xl font-bold text-off-white tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
        {delta != null && (
          <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {delta >= 0 ? '+' : ''}{delta} bulan ini
          </div>
        )}
      </Card>
    </motion.div>
  )
}

// ── Quick Action Button ───────────────────────────────────────────────────────
function QuickAction({ icon: Icon, label, sub, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3.5 bg-dark-card border border-dark-border rounded-2xl hover:border-gold/30 hover:bg-dark-surface transition-all text-left group w-full"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={16} className="text-off-white" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-off-white group-hover:text-gold transition-colors">{label}</p>
        {sub && <p className="text-xs text-muted truncate">{sub}</p>}
      </div>
      <ChevronRight size={14} className="text-muted ml-auto flex-shrink-0 group-hover:text-gold transition-colors" />
    </button>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function SADashboard() {
  const { t } = useTranslation()
  const { data: tenants = [], isLoading: loadingTenants } = useTenants({ limit: 100 })
  const { data: pkgData,  isLoading: loadingPkgs }        = usePackages()
  const { impersonate } = useAuthStore()
  const toast    = useToast()
  const navigate = useNavigate()

  const packageList = pkgData?.list || []
  const isLoading   = loadingTenants || loadingPkgs

  // ── Derived metrics (all from real data) ─────────────────────────────────
  const metrics = useMemo(() => {
    const thisMonthStart = startOfMonth(new Date())

    const active   = tenants.filter(t => t.subscriptionStatus === 'active' && !t.isSuspended)
    const trial    = tenants.filter(t => t.subscriptionStatus === 'trial')
    const overdue  = tenants.filter(t => t.subscriptionStatus === 'overdue')
    const expired  = tenants.filter(t => t.subscriptionStatus === 'expired')
    const suspended = tenants.filter(t => t.isSuspended)
    const newThisMonth = tenants.filter(t => t.createdAt && new Date(t.createdAt) >= thisMonthStart)

    const mrr = tenants
      .filter(t => t.subscriptionStatus === 'active' || t.subscriptionStatus === 'overdue')
      .reduce((sum, t) => sum + (t.subscription?.price || 0), 0)

    const totalBranches = tenants.reduce((s, t) => s + (t.totalBranches || 0), 0)
    const totalStaff    = tenants.reduce((s, t) => s + (t.totalStaff || 0), 0)
    const totalRevenue  = tenants.reduce((s, t) => s + (t.monthlyRevenue || 0), 0)

    return {
      total: tenants.length,
      activeCount: active.length,
      trialCount: trial.length,
      overdueCount: overdue.length,
      expiredCount: expired.length,
      suspendedCount: suspended.length,
      newThisMonth: newThisMonth.length,
      mrr, arr: mrr * 12,
      totalBranches, totalStaff, totalRevenue,
    }
  }, [tenants])

  // ── Churn risk ────────────────────────────────────────────────────────────
  const churnRisk = useMemo(() =>
    tenants.filter(t => {
      if (t.subscriptionStatus === 'overdue') return true
      if (t.subscription?.endDate && t.subscriptionStatus === 'active') {
        const d = differenceInDays(new Date(t.subscription.endDate), new Date())
        return d >= 0 && d < 14
      }
      return false
    }),
    [tenants]
  )

  // ── Health scores (sorted worst first) ───────────────────────────────────
  const healthScores = useMemo(() =>
    tenants
      .map(t => ({ ...t, score: calcHealthScore(t) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 8),
    [tenants]
  )

  // ── Tenant growth chart (last 6 months, real createdAt) ───────────────────
  const growthData = useMemo(() => {
    const result = []
    for (let i = 5; i >= 0; i--) {
      const d     = subMonths(new Date(), i)
      const start = startOfMonth(d)
      const end   = endOfMonth(d)
      result.push({
        month: format(d, 'MMM'),
        total: tenants.filter(t => t.createdAt && new Date(t.createdAt) <= end).length,
        baru:  tenants.filter(t => t.createdAt && new Date(t.createdAt) >= start && new Date(t.createdAt) <= end).length,
      })
    }
    return result
  }, [tenants])

  // ── Top tenants by MTD revenue ────────────────────────────────────────────
  const revenueChartData = useMemo(() =>
    [...tenants]
      .filter(t => t.monthlyRevenue > 0)
      .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue)
      .slice(0, 8)
      .map(t => ({
        name: t.name.length > 14 ? t.name.slice(0, 14) + '…' : t.name,
        revenue: t.monthlyRevenue,
        pkg: t.package,
      })),
    [tenants]
  )

  // ── Recently joined tenants ───────────────────────────────────────────────
  const recentTenants = useMemo(() =>
    [...tenants]
      .filter(t => t.createdAt)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5),
    [tenants]
  )

  // ── Subscription status for pie/bar ──────────────────────────────────────
  const statusDist = useMemo(() => [
    { key: 'active',  label: 'Aktif',   count: metrics.activeCount,  color: SUB_COLORS.active },
    { key: 'trial',   label: 'Trial',   count: metrics.trialCount,   color: SUB_COLORS.trial },
    { key: 'overdue', label: 'Overdue', count: metrics.overdueCount, color: SUB_COLORS.overdue },
    { key: 'expired', label: 'Expired', count: metrics.expiredCount, color: SUB_COLORS.expired },
  ].filter(s => s.count > 0), [metrics])

  const handleImpersonate = (tenant) => {
    const path = impersonate({
      id: `impersonated-${tenant.id}`,
      role: 'tenant_admin',
      tenantId: tenant.id,
      name: `[Impersonate] ${tenant.name}`,
      email: tenant.email,
    })
    if (path) { toast.info(t('superAdmin.dashboard.impersonateToast', { name: tenant.name })); navigate(path) }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-7 w-48 bg-dark-card animate-pulse rounded-lg mb-2" />
          <div className="h-4 w-72 bg-dark-card animate-pulse rounded-lg" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 bg-dark-card animate-pulse rounded-2xl" />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="h-64 bg-dark-card animate-pulse rounded-2xl" />
          <div className="h-64 bg-dark-card animate-pulse rounded-2xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">{t('superAdmin.dashboard.title')}</h1>
          <p className="text-muted text-sm mt-1">{t('superAdmin.dashboard.subtitle')}</p>
        </div>
        <div className="flex gap-4 sm:gap-6">
          {[
            { icon: Building2, label: 'Cabang',    value: metrics.totalBranches },
            { icon: Users,     label: 'Total Staf', value: metrics.totalStaff },
            { icon: TrendingUp,label: 'Rev MTD',    value: `${(metrics.totalRevenue / 1_000_000).toFixed(1)}M` },
          ].map(s => (
            <div key={s.label} className="text-right">
              <p className="text-xs text-muted flex items-center gap-1 justify-end">
                <s.icon size={11} />{s.label}
              </p>
              <p className="text-base font-bold text-off-white">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Tenant"   value={metrics.total}        icon={Building2}    iconColor="text-off-white" delta={metrics.newThisMonth} delay={0}    onClick={() => navigate('/super-admin/tenants')} />
        <KpiCard label="MRR"            value={formatRupiah(metrics.mrr)}  icon={DollarSign}   iconColor="text-gold"    sub={`${formatRupiah(metrics.arr)}/tahun`} delay={0.04} />
        <KpiCard label="Sub Aktif"      value={metrics.activeCount}   icon={CheckCircle}  iconColor="text-green-400" delay={0.08} onClick={() => navigate('/super-admin/billing')} />
        <KpiCard label="Trial"          value={metrics.trialCount}    icon={Clock}        iconColor="text-blue-400"  delay={0.12} onClick={() => navigate('/super-admin/billing')} />
        <KpiCard label="Overdue"        value={metrics.overdueCount}  icon={AlertTriangle} iconColor="text-amber-400" delay={0.16} onClick={() => navigate('/super-admin/billing')} />
        <KpiCard label="Suspended"      value={metrics.suspendedCount} icon={XCircle}     iconColor="text-red-400"   delay={0.2}  onClick={() => navigate('/super-admin/tenants')} />
      </div>

      {/* Churn Risk Panel */}
      {churnRisk.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
          <Card className="border-amber-400/30 bg-amber-400/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} className="text-amber-400" />
                  <h3 className="font-semibold text-amber-300">{t('superAdmin.dashboard.churnAlert')}</h3>
                  <span className="text-xs bg-amber-400/20 text-amber-400 px-2 py-0.5 rounded-full font-semibold">
                    {churnRisk.length}
                  </span>
                </div>
                <button onClick={() => navigate('/super-admin/billing')} className="text-xs text-gold hover:underline flex items-center gap-1">
                  Kelola Billing <ChevronRight size={12} />
                </button>
              </div>
            </CardHeader>
            <CardBody>
              <div className="space-y-2">
                {churnRisk.slice(0, 5).map(tenant => {
                  const sub  = tenant.subscription
                  const days = sub?.endDate ? differenceInDays(new Date(sub.endDate), new Date()) : null
                  return (
                    <div key={tenant.id} className="flex items-center justify-between p-3 bg-dark-card rounded-xl border border-amber-400/20">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-400/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-amber-400 font-bold text-xs">{tenant.name[0]}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-off-white">{tenant.name}</p>
                          <p className="text-xs text-muted">
                            {sub?.status === 'overdue'
                              ? t('superAdmin.dashboard.subscriptionOverdue')
                              : days !== null ? t('superAdmin.dashboard.endsInDays', { days }) : '—'
                            }
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {tenant.package && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border"
                            style={{ color: PKG_COLOR[tenant.package], borderColor: PKG_COLOR[tenant.package] + '40', background: PKG_COLOR[tenant.package] + '15' }}>
                            {tenant.package}
                          </span>
                        )}
                        <button onClick={() => navigate(`/super-admin/tenants/${tenant.id}`)}
                          className="text-xs text-gold hover:underline">{t('superAdmin.dashboard.detailArrow')}</button>
                      </div>
                    </div>
                  )
                })}
                {churnRisk.length > 5 && (
                  <p className="text-xs text-muted text-center py-1">+{churnRisk.length - 5} tenant lainnya</p>
                )}
              </div>
            </CardBody>
          </Card>
        </motion.div>
      )}

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Tenant Growth */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
          <Card className="flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-off-white">Pertumbuhan Tenant</h3>
                  <p className="text-xs text-muted mt-0.5">6 bulan terakhir</p>
                </div>
                <div className="flex gap-3 text-xs text-muted">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gold inline-block" />Kumulatif</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />Baru</span>
                </div>
              </div>
            </CardHeader>
            <CardBody>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={growthData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C9A84C" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#C9A84C" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradNew" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60A5FA" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#60A5FA" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
                  <XAxis dataKey="month" tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="total" name="Kumulatif" stroke="#C9A84C" strokeWidth={2} fill="url(#gradTotal)" dot={false} />
                  <Area type="monotone" dataKey="baru"  name="Baru"      stroke="#60A5FA" strokeWidth={2} fill="url(#gradNew)"  dot={{ fill: '#60A5FA', r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        </motion.div>

        {/* Top Tenants by Revenue */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
          <Card className="flex flex-col">
            <CardHeader>
              <h3 className="font-semibold text-off-white">Top Tenant by Revenue</h3>
              <p className="text-xs text-muted mt-0.5">Pendapatan bulan ini (MTD)</p>
            </CardHeader>
            <CardBody>
              {revenueChartData.length === 0 ? (
                <div className="flex items-center justify-center h-[220px] text-muted text-sm">
                  Belum ada data pendapatan bulan ini
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={revenueChartData} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 10 }} tickLine={false}
                      tickFormatter={v => `${(v / 1_000_000).toFixed(0)}M`} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 11 }} tickLine={false} width={90} />
                    <Tooltip content={<ChartTooltip formatter={formatRupiah} />} />
                    <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                      {revenueChartData.map((entry, i) => (
                        <Cell key={i} fill={PKG_COLOR[entry.pkg] || '#C9A84C'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardBody>
          </Card>
        </motion.div>
      </div>

      {/* Package Distribution + Status Distribution */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Package Distribution */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-off-white">Distribusi Paket</h3>
              <p className="text-xs text-muted mt-0.5">Tenant aktif per tier</p>
            </CardHeader>
            <CardBody className="space-y-3">
              {packageList.map(pkg => {
                const count   = pkg.tenantCount || 0
                const pct     = metrics.total > 0 ? (count / metrics.total) * 100 : 0
                const pkgMrr  = pkg.price * count
                const color   = PKG_COLOR[pkg.name] || '#C9A84C'
                return (
                  <div key={pkg.name}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                        <span className="font-medium text-off-white">{pkg.name}</span>
                        <span className="text-xs text-muted">{count} tenant</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-off-white">{pct.toFixed(0)}%</span>
                        {pkgMrr > 0 && (
                          <span className="text-xs text-muted ml-2">{formatRupiah(pkgMrr)}/bln</span>
                        )}
                      </div>
                    </div>
                    <div className="h-2 bg-dark-surface rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                        className="h-full rounded-full"
                        style={{ background: color }}
                      />
                    </div>
                  </div>
                )
              })}
              {metrics.total > 0 && (
                <p className="text-xs text-muted pt-1 border-t border-dark-border/40">
                  Total MRR: <span className="text-gold font-semibold">{formatRupiah(metrics.mrr)}</span>
                  <span className="ml-2 text-muted/60">({formatRupiah(metrics.arr)}/tahun)</span>
                </p>
              )}
            </CardBody>
          </Card>
        </motion.div>

        {/* Subscription Status Distribution */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}>
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-off-white">Status Subscription</h3>
              <p className="text-xs text-muted mt-0.5">Distribusi status saat ini</p>
            </CardHeader>
            <CardBody className="space-y-3">
              {statusDist.length === 0 ? (
                <p className="text-sm text-muted text-center py-4">Belum ada subscription</p>
              ) : statusDist.map(s => {
                const pct = metrics.total > 0 ? (s.count / metrics.total) * 100 : 0
                return (
                  <div key={s.key}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                        <span className="text-off-white">{s.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-off-white">{s.count}</span>
                        <span className="text-xs text-muted w-8 text-right">{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-dark-surface rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.8, delay: 0.35 }}
                        className="h-full rounded-full"
                        style={{ background: s.color }}
                      />
                    </div>
                  </div>
                )
              })}
              {metrics.suspendedCount > 0 && (
                <div className="pt-2 border-t border-dark-border/40">
                  <div className="flex items-center gap-2 text-xs text-red-400">
                    <XCircle size={12} />
                    {metrics.suspendedCount} tenant di-suspend
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </motion.div>
      </div>

      {/* Health Scores + Tenant Table */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Health Scores */}
        <motion.div className="lg:col-span-2" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34 }}>
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Heart size={14} className="text-gold" />
                <h3 className="font-semibold text-off-white">{t('superAdmin.dashboard.healthScoreTitle')}</h3>
              </div>
              <p className="text-xs text-muted mt-0.5">Tenant dengan skor terendah lebih dulu</p>
            </CardHeader>
            <CardBody className="space-y-3.5">
              {healthScores.map(tenant => (
                <div key={tenant.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-dark-surface flex items-center justify-center flex-shrink-0">
                        <span className="text-gold font-bold text-[10px]">{tenant.name[0]}</span>
                      </div>
                      <span className="text-xs text-off-white truncate">{tenant.name}</span>
                    </div>
                    <Badge variant={tenant.subscriptionStatus === 'active' ? 'success' : tenant.subscriptionStatus === 'overdue' ? 'danger' : 'warning'} className="text-[10px] flex-shrink-0 ml-1">
                      {tenant.subscriptionStatus || 'no sub'}
                    </Badge>
                  </div>
                  <HealthBar score={tenant.score} />
                </div>
              ))}
              <p className="text-[10px] text-muted pt-1 border-t border-dark-border/40">
                {t('superAdmin.dashboard.healthScoreNote')}
              </p>
            </CardBody>
          </Card>
        </motion.div>

        {/* Tenant Comparison Table */}
        <motion.div className="lg:col-span-3" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}>
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-off-white">{t('superAdmin.dashboard.comparisonTitle')}</h3>
                <button onClick={() => navigate('/super-admin/tenants')} className="text-xs text-gold hover:underline flex items-center gap-1">
                  Semua <ChevronRight size={12} />
                </button>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border text-[10px] text-muted uppercase">
                    <th className="px-3 py-2.5 text-left">Tenant</th>
                    <th className="px-3 py-2.5 text-center">Paket</th>
                    <th className="px-3 py-2.5 text-center">Status Sub</th>
                    <th className="px-3 py-2.5 text-right">MTD</th>
                    <th className="px-3 py-2.5 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {[...tenants]
                    .sort((a, b) => (b.monthlyRevenue || 0) - (a.monthlyRevenue || 0))
                    .slice(0, 8)
                    .map(tenant => (
                    <tr key={tenant.id} className="border-b border-dark-border/40 hover:bg-dark-surface/40 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${tenant.isSuspended ? 'bg-red-500/10' : 'bg-gold/10'}`}>
                            <span className={`font-bold text-[10px] ${tenant.isSuspended ? 'text-red-400' : 'text-gold'}`}>{tenant.name[0]}</span>
                          </div>
                          <span className="text-xs font-medium text-off-white truncate max-w-[90px]">{tenant.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {tenant.package ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ color: PKG_COLOR[tenant.package], background: PKG_COLOR[tenant.package] + '20' }}>
                            {tenant.package}
                          </span>
                        ) : <span className="text-muted text-[10px]">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge
                          variant={
                            tenant.subscriptionStatus === 'active'  ? 'success' :
                            tenant.subscriptionStatus === 'trial'   ? 'info' :
                            tenant.subscriptionStatus === 'overdue' ? 'danger' : 'muted'
                          }
                          className="text-[10px]"
                        >
                          {tenant.subscriptionStatus || 'no sub'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs font-semibold text-gold tabular-nums">
                        {tenant.monthlyRevenue > 0 ? `${(tenant.monthlyRevenue / 1_000_000).toFixed(1)}M` : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 justify-center">
                          <button onClick={() => navigate(`/super-admin/tenants/${tenant.id}`)}
                            className="p-1 rounded text-muted hover:text-blue-400 transition-colors" title="Detail">
                            <Eye size={12} />
                          </button>
                          <button onClick={() => handleImpersonate(tenant)}
                            className="p-1 rounded text-muted hover:text-gold transition-colors" title="Login sebagai tenant">
                            <ExternalLink size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Recently Joined + Quick Actions */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recently Joined */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-off-white">Baru Bergabung</h3>
                <span className="text-xs text-muted">{metrics.newThisMonth} bulan ini</span>
              </div>
            </CardHeader>
            <CardBody className="space-y-2.5">
              {recentTenants.length === 0 ? (
                <p className="text-sm text-muted text-center py-4">Belum ada tenant</p>
              ) : recentTenants.map(tenant => {
                const daysAgo = tenant.createdAt ? differenceInDays(new Date(), new Date(tenant.createdAt)) : null
                return (
                  <div key={tenant.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-dark-surface transition-colors">
                    <div className="w-8 h-8 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-gold font-bold text-xs">{tenant.name[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-off-white truncate">{tenant.name}</p>
                      <p className="text-xs text-muted">
                        {daysAgo === 0 ? 'Hari ini' : daysAgo === 1 ? 'Kemarin' : `${daysAgo} hari lalu`}
                        {tenant.package && <> · <span style={{ color: PKG_COLOR[tenant.package] }}>{tenant.package}</span></>}
                      </p>
                    </div>
                    <Badge variant={tenant.subscriptionStatus === 'active' ? 'success' : 'info'} className="text-[10px] flex-shrink-0">
                      {tenant.subscriptionStatus || 'no sub'}
                    </Badge>
                  </div>
                )
              })}
            </CardBody>
          </Card>
        </motion.div>

        {/* Quick Actions */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-off-white">Aksi Cepat</h3>
            </CardHeader>
            <CardBody className="space-y-2">
              {[
                { icon: Plus,        label: 'Tambah Tenant Baru',    sub: 'Onboard barbershop baru',           color: 'bg-gold/20',        path: '/super-admin/tenants' },
                { icon: CreditCard,  label: 'Kelola Billing',        sub: `${metrics.overdueCount} overdue menunggu`, color: 'bg-amber-500/20', path: '/super-admin/billing' },
                { icon: TrendingUp,  label: 'Atur Paket & Harga',    sub: `${packageList.length} paket aktif`, color: 'bg-green-500/20',    path: '/super-admin/packages' },
                { icon: MessageSquare, label: 'Broadcast Pesan',     sub: 'Kirim notifikasi ke semua tenant',  color: 'bg-blue-500/20',     path: '/super-admin/broadcast' },
                { icon: Activity,    label: 'Log Aktivitas',         sub: 'Pantau aktivitas sistem',            color: 'bg-purple-500/20',   path: '/super-admin/activity-log' },
              ].map(a => (
                <QuickAction key={a.label} icon={a.icon} label={a.label} sub={a.sub} color={a.color} onClick={() => navigate(a.path)} />
              ))}
            </CardBody>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
