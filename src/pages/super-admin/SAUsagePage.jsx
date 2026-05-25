import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line,
} from 'recharts'
import {
  Activity, Users, Zap, TrendingUp, Eye, ShoppingCart, Download,
  RefreshCw, AlertTriangle,
} from 'lucide-react'
import { useSuperAdminUsage } from '../../hooks/useSuperAdminUsage.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import { Skeleton, SkeletonChart } from '../../components/ui/Skeleton.jsx'
import { formatDateInTz, formatDateTimeInTz } from '../../utils/timezone.js'

const RANGE_OPTIONS = [7, 14, 30]
const FLAG_CATEGORIES = ['Core', 'Analytics', 'Operations', 'UX', 'Enterprise']

// Render YYYY-MM-DD as a short locale-aware label (e.g. "Sen 03").
function formatBucketLabel(ymd, tz) {
  if (!ymd) return ''
  // ymd is already a calendar date in `tz` — show via Intl in that same tz so
  // weekday alignment matches what the backend computed.
  try {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: tz || 'Asia/Jakarta',
      weekday: 'short',
      day: '2-digit',
    }).format(new Date(`${ymd}T12:00:00.000Z`))
  } catch {
    return ymd
  }
}

const ChartTooltip = ({ active, payload, label, t, tz, mode }) => {
  if (!active || !payload?.length) return null
  const value = payload[0].value
  const labelKey = mode === 'tx' ? 'tooltipTransactions' : 'tooltipActiveUsers'
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="text-muted mb-1">{formatBucketLabel(label, tz)}</p>
      <p className="text-gold font-semibold">{t(`superAdmin.usage.${labelKey}`, { count: value })}</p>
    </div>
  )
}

function escapeCsvCell(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(rows) {
  return rows.map(r => r.map(escapeCsvCell).join(',')).join('\n')
}

function downloadCsv(filename, content) {
  const blob = new Blob(['﻿', content], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function KpiCard({ label, value, hint, icon: Icon, color, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className="p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted">{label}</p>
          <Icon size={16} className={color} />
        </div>
        <p className="text-2xl font-bold text-off-white">{value}</p>
        {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
      </Card>
    </motion.div>
  )
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-7 w-56 mb-2" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <SkeletonChart height={260} />
      <SkeletonChart height={300} />
    </div>
  )
}

function ErrorState({ onRetry, t }) {
  return (
    <Card className="p-8 flex flex-col items-center text-center">
      <AlertTriangle size={32} className="text-amber-400 mb-3" />
      <h3 className="font-semibold text-off-white mb-1">{t('superAdmin.usage.errorLoading')}</h3>
      <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry} className="mt-4">
        {t('superAdmin.usage.retry')}
      </Button>
    </Card>
  )
}

export default function SAUsagePage() {
  const { t } = useTranslation()
  const [days, setDays] = useState(7)
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [chartMode, setChartMode] = useState('dau') // 'dau' | 'tx'
  const [flagCategory, setFlagCategory] = useState('')

  const { data, isLoading, isError, refetch, isFetching } = useSuperAdminUsage(days)

  const meta = data?.meta
  const kpi = data?.kpi
  const tenants = data?.tenants || []
  const featureAdoption = data?.featureAdoption || []

  const selectedTenant = useMemo(() => {
    if (!tenants.length) return null
    return tenants.find(tt => tt.id === selectedTenantId) || tenants[0]
  }, [tenants, selectedTenantId])

  const filteredAdoption = useMemo(() => {
    if (!flagCategory) return featureAdoption
    return featureAdoption.filter(f => f.category === flagCategory)
  }, [featureAdoption, flagCategory])

  const handleExport = () => {
    if (!tenants.length) return
    const headers = ['Tenant', 'Slug', 'Package', 'Suspended', 'Timezone', 'UniqueUsers', 'Sessions', 'Transactions', 'Revenue', 'Bookings', 'ActiveFeatures', 'TopFeatures']
    const rows = [headers]
    tenants.forEach(tt => {
      rows.push([
        tt.name, tt.slug, tt.package || '', tt.suspended ? 'yes' : 'no', tt.timezone,
        tt.uniqueUsers, tt.sessions, tt.transactions, tt.revenue, tt.bookings,
        tt.activeFeatureCount, (tt.topFeatures || []).join('|'),
      ])
    })
    rows.push([])
    rows.push(['Feature', 'Category', 'EnabledTenants', 'TotalTenants', 'AdoptionPercent'])
    featureAdoption.forEach(f => {
      rows.push([f.label, f.category, f.enabledCount, f.tenantTotal, f.percent])
    })
    const today = new Date().toISOString().slice(0, 10)
    downloadCsv(`platform-usage-${today}.csv`, toCsv(rows))
  }

  if (isLoading) return <LoadingState />
  if (isError)   return <ErrorState onRetry={refetch} t={t} />

  if (!tenants.length) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold gold-text">{t('superAdmin.usage.pageTitle')}</h1>
          <p className="text-muted text-sm mt-1">{t('superAdmin.usage.pageSubtitle')}</p>
        </div>
        <Card className="p-10 text-center">
          <Users size={32} className="mx-auto text-muted mb-3" />
          <p className="text-muted text-sm">{t('superAdmin.usage.emptyTenants')}</p>
        </Card>
      </div>
    )
  }

  const tenantTz = selectedTenant?.timezone || meta?.tz
  const chartData = (selectedTenant?.dau || []).map(d => ({
    day: d.day,
    value: chartMode === 'tx' ? d.transactions : d.value,
  }))
  const hasActivity = chartData.some(d => d.value > 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold gold-text">{t('superAdmin.usage.pageTitle')}</h1>
          <p className="text-muted text-sm mt-1">{t('superAdmin.usage.pageSubtitle')}</p>
          {meta?.generatedAt && (
            <p className="text-[11px] text-muted mt-1">
              {t('superAdmin.usage.lastUpdated', { time: formatDateTimeInTz(meta.generatedAt, meta.tz) })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-dark-card border border-dark-border rounded-xl p-1">
            {RANGE_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all ${days === d ? 'bg-gold/15 text-gold border border-gold/40' : 'text-muted hover:text-off-white'}`}
              >
                {t('superAdmin.usage.windowDays', { count: d, defaultValue: `${d}d` })}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} loading={isFetching && !isLoading}>
            {t('superAdmin.usage.retry')}
          </Button>
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExport}>
            {t('superAdmin.usage.exportCsv')}
          </Button>
        </div>
      </div>

      {/* Platform KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard
          label={t('superAdmin.usage.kpiTenant')}
          value={kpi.tenantCount}
          hint={t('superAdmin.usage.kpiActiveTenants') + ` ${kpi.activeTenants}`}
          icon={Users}
          color="text-blue-400"
          delay={0}
        />
        <KpiCard
          label={t('superAdmin.usage.kpiDau')}
          value={kpi.dauToday}
          icon={Activity}
          color="text-gold"
          delay={0.05}
        />
        <KpiCard
          label={t('superAdmin.usage.kpiSessions')}
          value={kpi.sessions.toLocaleString('id-ID')}
          icon={Eye}
          color="text-purple-400"
          delay={0.1}
        />
        <KpiCard
          label={t('superAdmin.usage.kpiTransactions')}
          value={kpi.transactions.toLocaleString('id-ID')}
          icon={ShoppingCart}
          color="text-emerald-400"
          delay={0.15}
        />
        <KpiCard
          label={t('superAdmin.usage.kpiFeatures')}
          value={`${kpi.featuresHighAdoption}/${kpi.featuresTotal}`}
          icon={Zap}
          color="text-green-400"
          delay={0.2}
        />
      </div>

      {/* Tenant Selector + chart mode toggle */}
      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3 flex-wrap">
            <span className="text-sm text-muted shrink-0 mt-1.5">{t('superAdmin.usage.tenantLabel')}</span>
            <div className="flex flex-wrap gap-2 flex-1">
              {tenants.map(tt => (
                <button
                  key={tt.id}
                  onClick={() => setSelectedTenantId(tt.id)}
                  className={`px-3 py-1.5 rounded-xl border text-xs sm:text-sm transition-all ${selectedTenant?.id === tt.id ? 'border-gold bg-gold/10 text-off-white' : 'border-dark-border text-muted hover:border-gold/30'}`}
                >
                  <span>{tt.name}</span>
                  {tt.suspended && <span className="ml-1.5 text-[10px] text-amber-400">●</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Per-tenant chart + features */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp size={15} className="text-gold" />
                  <h3 className="font-semibold text-off-white">
                    {chartMode === 'tx' ? t('superAdmin.usage.txTitle') : t('superAdmin.usage.dauTitle')}
                  </h3>
                </div>
                <div className="flex items-center gap-1 bg-dark-surface border border-dark-border rounded-lg p-0.5">
                  <button
                    onClick={() => setChartMode('dau')}
                    className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${chartMode === 'dau' ? 'bg-gold/15 text-gold' : 'text-muted hover:text-off-white'}`}
                  >
                    {t('superAdmin.usage.kpiDau')}
                  </button>
                  <button
                    onClick={() => setChartMode('tx')}
                    className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${chartMode === 'tx' ? 'bg-gold/15 text-gold' : 'text-muted hover:text-off-white'}`}
                  >
                    {t('superAdmin.usage.kpiTransactions')}
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>{t('superAdmin.usage.uniqueUsers')} <span className="text-off-white font-semibold">{selectedTenant.uniqueUsers}</span></span>
                <span>{t('superAdmin.usage.totalSessions')} <span className="text-off-white font-semibold">{selectedTenant.sessions}</span></span>
                <span>{t('superAdmin.usage.totalTransactions')} <span className="text-off-white font-semibold">{selectedTenant.transactions}</span></span>
                <span>{t('superAdmin.usage.totalBookings')} <span className="text-off-white font-semibold">{selectedTenant.bookings}</span></span>
              </div>
            </CardHeader>
            <CardBody>
              {hasActivity ? (
                <ResponsiveContainer width="100%" height={240}>
                  {chartMode === 'tx' ? (
                    <LineChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
                      <XAxis
                        dataKey="day"
                        tick={{ fill: '#6B7280', fontSize: 11 }}
                        tickLine={false}
                        tickFormatter={(v) => formatBucketLabel(v, tenantTz)}
                      />
                      <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip t={t} tz={tenantTz} mode="tx" />} />
                      <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  ) : (
                    <BarChart data={chartData} barCategoryGap="30%" margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
                      <XAxis
                        dataKey="day"
                        tick={{ fill: '#6B7280', fontSize: 11 }}
                        tickLine={false}
                        tickFormatter={(v) => formatBucketLabel(v, tenantTz)}
                      />
                      <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip t={t} tz={tenantTz} mode="dau" />} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {chartData.map((_, index) => (
                          <Cell key={index} fill={index === chartData.length - 1 ? '#C9A84C' : '#C9A84C66'} />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex flex-col items-center justify-center text-muted text-sm">
                  <Activity size={28} className="mb-2 opacity-60" />
                  {t('superAdmin.usage.emptyActivity')}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Tenant active features */}
        <div>
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-off-white">{t('superAdmin.usage.tenantFeatures')}</h3>
            </CardHeader>
            <CardBody>
              <p className="text-3xl font-bold text-gold mb-1">{selectedTenant.activeFeatureCount}</p>
              <p className="text-xs text-muted mb-4">{t('superAdmin.usage.ofAvailable', { total: kpi.featuresTotal })}</p>
              {selectedTenant.topFeatures?.length ? (
                <div className="space-y-2">
                  {selectedTenant.topFeatures.map((flagId, i) => {
                    const adoption = featureAdoption.find(f => f.flagId === flagId)
                    const label = adoption?.label || flagId
                    return (
                      <div key={flagId} className="flex items-center gap-2">
                        <span className="text-xs text-muted w-4">{i + 1}.</span>
                        <div className="flex-1 h-1.5 bg-dark-surface rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${100 - i * 12}%` }}
                            transition={{ delay: i * 0.08, duration: 0.5 }}
                            className="h-full bg-gold rounded-full"
                          />
                        </div>
                        <span className="text-xs text-off-white w-28 truncate" title={label}>{label}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted">{t('superAdmin.usage.noFlagsEnabled')}</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Per-tenant activity table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users size={15} className="text-gold" />
            <h3 className="font-semibold text-off-white">{t('superAdmin.usage.perTenantTitle')}</h3>
          </div>
        </CardHeader>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border text-[11px] text-muted uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Tenant</th>
                <th className="px-4 py-3 text-left">Paket</th>
                <th className="px-4 py-3 text-right">{t('superAdmin.usage.uniqueUsers')}</th>
                <th className="px-4 py-3 text-right">{t('superAdmin.usage.totalSessions')}</th>
                <th className="px-4 py-3 text-right">{t('superAdmin.usage.totalTransactions')}</th>
                <th className="px-4 py-3 text-right">{t('superAdmin.usage.totalBookings')}</th>
                <th className="px-4 py-3 text-right">Fitur</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(tt => {
                const isSel = tt.id === selectedTenant?.id
                return (
                  <tr
                    key={tt.id}
                    onClick={() => setSelectedTenantId(tt.id)}
                    className={`border-b border-dark-border/40 cursor-pointer transition-colors ${isSel ? 'bg-gold/5' : 'hover:bg-dark-surface/40'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-off-white font-medium">{tt.name}</span>
                        {tt.suspended && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/30">
                            suspended
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted">{tt.slug} · {tt.timezone}</span>
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">{tt.package || '—'}</td>
                    <td className="px-4 py-3 text-right text-off-white">{tt.uniqueUsers}</td>
                    <td className="px-4 py-3 text-right text-off-white">{tt.sessions}</td>
                    <td className="px-4 py-3 text-right text-off-white">{tt.transactions}</td>
                    <td className="px-4 py-3 text-right text-off-white">{tt.bookings}</td>
                    <td className="px-4 py-3 text-right text-gold font-semibold">{tt.activeFeatureCount}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden space-y-2.5 px-3 pb-3">
          {tenants.map(tt => {
            const isSel = tt.id === selectedTenant?.id
            return (
              <button
                key={tt.id}
                type="button"
                onClick={() => setSelectedTenantId(tt.id)}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${isSel ? 'border-gold/40 bg-gold/5' : 'border-dark-border bg-dark-surface/40 hover:border-gold/20'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-off-white font-medium">{tt.name}</span>
                  {tt.suspended && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/30">
                      suspended
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted">{tt.slug} · {tt.timezone}</div>
                <div className="text-[11px] text-muted mt-0.5">Paket: {tt.package || '—'}</div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                  <div>
                    <div className="text-[10px] text-muted uppercase">{t('superAdmin.usage.uniqueUsers')}</div>
                    <div className="text-sm text-off-white">{tt.uniqueUsers}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted uppercase">{t('superAdmin.usage.totalSessions')}</div>
                    <div className="text-sm text-off-white">{tt.sessions}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted uppercase">{t('superAdmin.usage.totalTransactions')}</div>
                    <div className="text-sm text-off-white">{tt.transactions}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted uppercase">{t('superAdmin.usage.totalBookings')}</div>
                    <div className="text-sm text-off-white">{tt.bookings}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted uppercase">Fitur</div>
                    <div className="text-sm text-gold font-semibold">{tt.activeFeatureCount}</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      {/* Platform Feature Adoption */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-gold" />
              <h3 className="font-semibold text-off-white">{t('superAdmin.usage.adoptionTitle')}</h3>
            </div>
            <select
              value={flagCategory}
              onChange={(e) => setFlagCategory(e.target.value)}
              className="bg-dark-surface border border-dark-border text-off-white rounded-lg px-3 py-1.5 text-xs outline-none focus:border-gold/50"
            >
              <option value="">{t('superAdmin.usage.categoryAll')}</option>
              {FLAG_CATEGORIES.map(c => (
                <option key={c} value={c}>{t(`superAdmin.usage.category${c}`)}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardBody>
          {filteredAdoption.length === 0 ? (
            <p className="text-xs text-muted py-4 text-center">{t('superAdmin.usage.noFlagsEnabled')}</p>
          ) : (
            <div className="space-y-3">
              {filteredAdoption.map((f, i) => (
                <motion.div key={f.flagId} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-off-white w-36 truncate" title={f.label}>{f.label}</span>
                    <div className="flex-1 h-2 bg-dark-surface rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${f.percent}%` }}
                        transition={{ delay: i * 0.03, duration: 0.5 }}
                        className={`h-full rounded-full ${f.percent >= 75 ? 'bg-green-400' : f.percent >= 50 ? 'bg-gold' : f.percent >= 30 ? 'bg-amber-400' : 'bg-dark-border'}`}
                      />
                    </div>
                    <span className="text-xs text-muted w-20 text-right">
                      <span className="text-off-white">{f.enabledCount}</span>/{f.tenantTotal} · {f.percent}%
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
