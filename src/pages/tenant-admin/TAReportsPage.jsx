import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Download, TrendingUp, DollarSign, Receipt, Users, BarChart2,
  AlertTriangle, RefreshCw,
} from 'lucide-react'
import { format, subDays } from 'date-fns'
import { useAuthStore } from '../../store/authStore.js'
import { useBranches } from '../../hooks/useBranches.js'
import {
  useReportSummary, useDailyReport, useBarberReport, useServiceReport,
} from '../../hooks/useReports.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Table from '../../components/ui/Table.jsx'
import { formatRupiah } from '../../utils/format.js'
import { useChartTheme, tooltipStyle } from '../../utils/chartTheme.js'

function linearRegression(data) {
  const n = data.length
  if (n < 2) return { slope: 0, intercept: data[0] || 0 }
  const sumX = data.reduce((s, _, i) => s + i, 0)
  const sumY = data.reduce((s, v) => s + v, 0)
  const sumXY = data.reduce((s, v, i) => s + i * v, 0)
  const sumXX = data.reduce((s, _, i) => s + i * i, 0)
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return { slope: 0, intercept: sumY / n }
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

const PIE_COLORS = ['#C9A84C', '#E8C875', '#A8893A', '#D4AF68', '#B89640', '#9A7A2E']

const PERIODS = [
  { id: 'today', days: 1 },
  { id: 'week',  days: 7 },
  { id: 'month', days: 30 },
  { id: 'year',  days: 365 },
]

function periodRange(period) {
  const today = new Date()
  const endDate = today.toISOString().split('T')[0]
  const days = (PERIODS.find(p => p.id === period) || PERIODS[2]).days
  const startDate = subDays(today, days - 1).toISOString().split('T')[0]
  return { startDate, endDate, days }
}

const csvEscape = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const downloadCSV = (filename, sections) => {
  const lines = []
  for (const sec of sections) {
    if (sec.title) { lines.push(`# ${sec.title}`) }
    if (sec.header) lines.push(sec.header.map(csvEscape).join(','))
    for (const row of sec.rows) lines.push(row.map(csvEscape).join(','))
    lines.push('')
  }
  const blob = new Blob(['﻿', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-dark-card ${className}`} />
}

export default function TAReportsPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const tenantId = user?.tenantId
  const { data: branches = [] } = useBranches(tenantId)

  const [period, setPeriod]     = useState('month')
  const [branchId, setBranchId] = useState('') // '' = all

  const { startDate, endDate, days } = useMemo(() => periodRange(period), [period])

  const summaryQ  = useReportSummary(tenantId, startDate, endDate, branchId || undefined)
  const dailyQ    = useDailyReport(tenantId, days, branchId || undefined)
  const barbersQ  = useBarberReport(tenantId, { startDate, endDate, ...(branchId ? { branchId } : {}) })
  const servicesQ = useServiceReport(tenantId, { startDate, endDate, ...(branchId ? { branchId } : {}) })

  const summary  = summaryQ.data
  const daily    = dailyQ.data || []
  const barbers  = barbersQ.data || []
  const services = servicesQ.data || []

  const isLoading = summaryQ.isLoading || dailyQ.isLoading
  const isError   = summaryQ.isError && dailyQ.isError
  const isFetching = summaryQ.isFetching || dailyQ.isFetching || barbersQ.isFetching || servicesQ.isFetching

  const chart = useChartTheme()

  // Build daily trend array filling in zero-revenue days
  const revenueTrend = useMemo(() => {
    const map = {}
    daily.forEach(d => { map[d.date] = d })
    return Array.from({ length: days }, (_, i) => {
      const d = subDays(new Date(), days - 1 - i)
      const key = d.toISOString().split('T')[0]
      return {
        date: format(d, days > 60 ? 'MMM yy' : 'dd/MM'),
        revenue: map[key]?.revenue ?? 0,
        transactions: map[key]?.transactions ?? 0,
      }
    })
  }, [daily, days])

  const hasData = revenueTrend.some(d => d.revenue > 0) || (summary?.summary?.totalRevenue || 0) > 0

  // Revenue forecast from last 14 real data points
  const last14 = revenueTrend.slice(-14)
  const { slope, intercept } = linearRegression(last14.map(d => d.revenue))
  const forecast7 = Array.from({ length: 7 }, (_, i) => {
    const x = last14.length + i
    return {
      date: format(subDays(new Date(), -1 - i), 'dd/MM'),
      forecast: Math.max(0, Math.round(slope * x + intercept)),
    }
  })
  const forecastTotal7 = forecast7.reduce((s, d) => s + d.forecast, 0)
  const combinedChart = [
    ...last14.map(d => ({ date: d.date, actual: d.revenue, forecast: null })),
    ...forecast7.map(d => ({ date: d.date, actual: null, forecast: d.forecast })),
  ]

  const serviceData = services.slice(0, 6).map(s => ({ name: s.name, value: s.count, revenue: s.revenue }))

  const exportCSV = () => {
    const periodLabel = `${startDate} → ${endDate}`
    const branchLabel = branchId ? (branches.find(b => b.id === branchId)?.name || branchId) : t('tenantAdmin.reports.allBranches')
    const sections = [
      {
        title: `Laporan ${periodLabel} · ${branchLabel}`,
        header: ['Metrik', 'Nilai'],
        rows: [
          ['Total Revenue',     summary?.summary?.totalRevenue || 0],
          ['Total Transaksi',   summary?.summary?.totalTransactions || 0],
          ['Avg/Transaksi',     summary?.summary?.averageTransactionValue || 0],
          ['Pelanggan Unik',    summary?.summary?.totalCustomers || 0],
          ['Pelanggan Baru',    summary?.summary?.totalNewCustomers || 0],
        ],
      },
      {
        title: 'Daily Revenue',
        header: ['Tanggal', 'Revenue', 'Transaksi'],
        rows: revenueTrend.map(d => [d.date, d.revenue, d.transactions]),
      },
      {
        title: 'Top Services',
        header: ['Layanan', 'Jumlah', 'Revenue'],
        rows: services.map(s => [s.name, s.count, s.revenue]),
      },
      {
        title: 'Performa Barber',
        header: ['Barber', 'Transaksi', 'Revenue', 'Avg Rating'],
        rows: barbers.map(b => [b.barberName, b.servicesCount, b.revenue, b.averageRating ? b.averageRating.toFixed(1) : '']),
      },
      {
        title: 'Revenue per Cabang',
        header: ['Cabang', 'Revenue', 'Transaksi'],
        rows: (summary?.revenueByBranch || []).map(b => [b.branchName, b.revenue, b.transactions]),
      },
      {
        title: 'Revenue per Metode Pembayaran',
        header: ['Metode', 'Revenue', 'Transaksi'],
        rows: (summary?.revenueByPaymentMethod || []).map(p => [p.method, p.revenue, p.count]),
      },
    ]
    const fname = `laporan-${period}-${endDate}${branchId ? '-' + (branches.find(b => b.id === branchId)?.name || branchId) : ''}.csv`
    downloadCSV(fname, sections)
  }

  const barberColumns = [
    { key: 'barberName',   label: t('tenantAdmin.reports.colBarber'),    render: v => <span className="font-medium text-off-white">{v}</span> },
    { key: 'servicesCount', label: t('common.transactions'), sortable: true, render: v => <span className="text-off-white">{v}</span> },
    { key: 'revenue',      label: t('common.revenue'), sortable: true, render: v => <span className="text-gold font-medium">{formatRupiah(v)}</span> },
    { key: 'averageRating', label: t('tenantAdmin.reports.colRating'),   render: v => v ? <span className="text-amber-400">⭐ {v?.toFixed(1)}</span> : '-' },
  ]

  const kpiValues = {
    totalRevenue:      summary?.summary?.totalRevenue ?? 0,
    totalTransactions: summary?.summary?.totalTransactions ?? 0,
    avgPerTxn:         summary?.summary?.averageTransactionValue ?? 0,
    uniqueCustomers:   summary?.summary?.totalCustomers ?? 0,
  }

  // Loading skeleton hanya kalau benar-benar belum ada data sama sekali (no cache).
  // Kalau initialData dari localStorage ada, summary terisi → langsung tampil angka.
  const showKpiSkeleton = isLoading && !summary

  const periodLabel = (id) => {
    if (id === 'today') return t('common.today')
    if (id === 'week')  return t('tenantAdmin.reports.periodWeek')
    if (id === 'month') return t('tenantAdmin.reports.periodMonth')
    if (id === 'year')  return t('tenantAdmin.reports.periodYear')
    return id
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-off-white">{t('tenantAdmin.reports.titleFull')}</h1>
          <p className="text-muted text-sm mt-1">{t('tenantAdmin.reports.subtitle')}</p>
        </div>
        <div className="flex gap-2 sm:gap-3 flex-wrap items-center">
          {branches.length > 1 && (
            <select
              value={branchId}
              onChange={e => setBranchId(e.target.value)}
              className="bg-dark-card border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/60 cursor-pointer max-w-[180px]"
              aria-label="Filter cabang"
            >
              <option value="">{t('tenantAdmin.reports.allBranches')}</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <div className="flex bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 sm:px-4 py-2 text-sm font-medium transition-colors ${
                  period === p.id ? 'bg-gold text-dark' : 'text-off-white hover:bg-dark-surface/60'
                }`}
              >
                {periodLabel(p.id)}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            icon={Download}
            onClick={exportCSV}
            disabled={!hasData || isFetching}
          >
            {t('tenantAdmin.reports.exportCSV')}
          </Button>
        </div>
      </div>

      {/* Error state */}
      {isError && !summary && (
        <Card className="p-10 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="text-off-white font-medium">{t('tenantAdmin.reports.errorLoading')}</p>
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            className="mt-4"
            onClick={() => { summaryQ.refetch(); dailyQ.refetch(); barbersQ.refetch(); servicesQ.refetch() }}
          >
            {t('tenantAdmin.reports.retry')}
          </Button>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: t('tenantAdmin.reports.totalRevenue'),       value: showKpiSkeleton ? null : formatRupiah(kpiValues.totalRevenue),       icon: DollarSign },
          { title: t('tenantAdmin.reports.totalTransactions'),  value: showKpiSkeleton ? null : kpiValues.totalTransactions,                icon: Receipt },
          { title: t('tenantAdmin.reports.avgPerTransaction'),  value: showKpiSkeleton ? null : formatRupiah(kpiValues.avgPerTxn),          icon: TrendingUp },
          { title: t('tenantAdmin.reports.uniqueCustomers'),    value: showKpiSkeleton ? null : kpiValues.uniqueCustomers,                  icon: Users },
        ].map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted">{kpi.title}</p>
                  {kpi.value === null
                    ? <Skeleton className="h-7 w-24 mt-1" />
                    : <p className="text-xl font-bold text-off-white mt-1">{kpi.value}</p>}
                </div>
                <kpi.icon className="w-8 h-8 text-gold/40" />
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Empty state */}
      {!isLoading && !isError && !hasData && (
        <Card className="p-10 text-center">
          <BarChart2 className="w-10 h-10 text-muted/30 mx-auto mb-3" />
          <p className="text-off-white font-medium">{t('tenantAdmin.reports.noTxData')}</p>
          <p className="text-muted text-sm mt-1">{t('tenantAdmin.reports.noTxDataHint')}</p>
        </Card>
      )}

      {/* Revenue Trend Chart */}
      {(isLoading || hasData) && (
        <Card>
          <CardHeader><h3 className="font-semibold text-off-white">{t('tenantAdmin.reports.dailyRevenueTrend')}</h3></CardHeader>
          <CardBody>
            {dailyQ.isLoading && !daily.length ? <Skeleton className="h-64" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                  <XAxis dataKey="date" tick={{ fill: chart.axisTick, fontSize: 11 }} tickLine={false} interval={Math.max(0, Math.floor(revenueTrend.length / 8))} />
                  <YAxis tick={{ fill: chart.axisTick, fontSize: 11 }} tickLine={false} tickFormatter={v => `${(v/1000000).toFixed(1)}M`} />
                  <Tooltip contentStyle={tooltipStyle(chart)} labelStyle={{ color: chart.tooltipLabel }} formatter={v => [formatRupiah(v), t('common.revenue')]} />
                  <Line type="monotone" dataKey="revenue" stroke="#C9A84C" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      )}

      {/* Revenue Forecast — only meaningful for week+ periods */}
      {hasData && days >= 7 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold text-off-white">{t('tenantAdmin.reports.revenueForecast')}</h3>
              <div className="flex items-center gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5"><span className="w-8 h-0.5 bg-gold inline-block" /> {t('tenantAdmin.reports.actual')}</span>
                <span className="flex items-center gap-1.5"><span className="w-8 border-t-2 border-dashed border-gold inline-block" /> {t('tenantAdmin.reports.prediction')}</span>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
              <div className="lg:col-span-1 p-4 bg-gold/10 border border-gold/20 rounded-xl">
                <p className="text-xs text-muted mb-1">{t('tenantAdmin.reports.forecast7Days')}</p>
                <p className="text-xl font-bold text-gold">{formatRupiah(forecastTotal7)}</p>
                <p className="text-xs text-muted mt-1">
                  {t('tenantAdmin.reports.trendLabel')}: {slope >= 0 ? '📈' : '📉'} {slope >= 0 ? '+' : ''}{formatRupiah(Math.round(slope))}{t('tenantAdmin.reports.perDay')}
                </p>
              </div>
              <div className="lg:col-span-3">
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={combinedChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                    <XAxis dataKey="date" tick={{ fill: chart.axisTick, fontSize: 10 }} tickLine={false} interval={2} />
                    <YAxis tick={{ fill: chart.axisTick, fontSize: 10 }} tickLine={false} tickFormatter={v => `${(v/1000000).toFixed(1)}M`} width={45} />
                    <Tooltip contentStyle={tooltipStyle(chart)} labelStyle={{ color: chart.tooltipLabel }} formatter={v => [formatRupiah(v), '']} />
                    <Line type="monotone" dataKey="actual"   stroke="#C9A84C" strokeWidth={2} dot={false} name={t('tenantAdmin.reports.actual')}     connectNulls={false} />
                    <Line type="monotone" dataKey="forecast" stroke="#C9A84C" strokeWidth={2} dot={false} strokeDasharray="5 5" name={t('tenantAdmin.reports.prediction')} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Service & Transaction charts */}
      {(isLoading || hasData) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Service Breakdown */}
          <Card>
            <CardHeader><h3 className="font-semibold text-off-white">{t('tenantAdmin.reports.topServices')}</h3></CardHeader>
            <CardBody>
              {servicesQ.isLoading && !services.length ? <Skeleton className="h-56" /> : serviceData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-muted text-sm">{t('tenantAdmin.reports.noServiceData')}</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={serviceData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" nameKey="name" paddingAngle={3}>
                      {serviceData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle(chart)} labelStyle={{ color: chart.tooltipLabel }} formatter={(v, n) => [v + 'x', n]} />
                    <Legend wrapperStyle={{ fontSize: 12, color: chart.legendText }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardBody>
          </Card>

          {/* Transactions per day */}
          <Card>
            <CardHeader><h3 className="font-semibold text-off-white">{t('tenantAdmin.reports.transactionsPerDay')}</h3></CardHeader>
            <CardBody>
              {dailyQ.isLoading && !daily.length ? <Skeleton className="h-56" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={revenueTrend.slice(-14)} barSize={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: chart.axisTick, fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fill: chart.axisTick, fontSize: 11 }} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle(chart)} labelStyle={{ color: chart.tooltipLabel }} />
                    <Bar dataKey="transactions" fill="#C9A84C" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Barber Performance Table */}
      {(isLoading || hasData) && (
        <Card>
          <CardHeader><h3 className="font-semibold text-off-white">{t('tenantAdmin.reports.barberPerformance')}</h3></CardHeader>
          {barbersQ.isLoading && !barbers.length
            ? <CardBody><Skeleton className="h-40" /></CardBody>
            : barbers.length === 0
              ? <CardBody><p className="text-muted text-sm text-center py-6">{t('tenantAdmin.reports.noBarberData')}</p></CardBody>
              : <Table columns={barberColumns} data={barbers} sortable />}
        </Card>
      )}
    </div>
  )
}
