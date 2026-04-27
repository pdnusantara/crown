import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import { Download, TrendingUp, DollarSign, Receipt, Users, Activity } from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useTenantStore } from '../../store/tenantStore.js'
import { usePosStore } from '../../store/posStore.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Table from '../../components/ui/Table.jsx'
import { HeatmapChart } from '../../components/ui/HeatmapChart.jsx'
import { formatRupiah, formatDate } from '../../utils/format.js'
import { subDays, format } from 'date-fns'

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

const generateRevenueTrend = () => {
  return Array.from({ length: 30 }, (_, i) => ({
    date: format(subDays(new Date(), 29 - i), 'dd/MM'),
    revenue: Math.floor(Math.random() * 4000000) + 1000000,
    transactions: Math.floor(Math.random() * 30) + 10,
  }))
}

function generateHeatmapData() {
  return Array.from({ length: 12 }, (_, hi) => {
    const hour = 9 + hi
    return Array.from({ length: 7 }, (_, di) => {
      const isWeekend = di >= 5
      const isPeak = hour >= 10 && hour <= 16
      const base = isWeekend ? 8 : 5
      const peakMult = isPeak ? 2 : 1
      return Math.floor(Math.random() * base * peakMult) + (isPeak ? 2 : 0)
    })
  })
}

const PIE_COLORS = ['#C9A84C', '#E8C875', '#A8893A', '#D4AF68', '#B89640']

export default function TAReportsPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const { getServicesByTenant, getStaffByTenant } = useTenantStore()
  const { transactions } = usePosStore()
  const [period, setPeriod] = useState('month')

  const services = getServicesByTenant(user.tenantId)
  const staff = getStaffByTenant(user.tenantId).filter(s => s.role === 'barber')

  const revenueTrend = useMemo(() => generateRevenueTrend(), [])
  const heatmapData = useMemo(() => generateHeatmapData(), [])

  const totalRevenue = revenueTrend.reduce((s, d) => s + d.revenue, 0)
  const totalTxns = revenueTrend.reduce((s, d) => s + d.transactions, 0)
  const avgPerTxn = Math.round(totalRevenue / totalTxns)

  // Revenue Forecasting
  const last14 = revenueTrend.slice(-14)
  const revenueValues = last14.map(d => d.revenue)
  const { slope, intercept } = linearRegression(revenueValues)

  const forecast7 = Array.from({ length: 7 }, (_, i) => {
    const x = last14.length + i
    const predicted = Math.max(0, Math.round(slope * x + intercept))
    return {
      date: format(subDays(new Date(), -1 - i), 'dd/MM'),
      forecast: predicted,
    }
  })

  const forecastTotal7 = forecast7.reduce((s, d) => s + d.forecast, 0)

  // Combined chart: last 14 days solid + next 7 dashed
  const combinedChart = [
    ...last14.map(d => ({ date: d.date, actual: d.revenue, forecast: null })),
    ...forecast7.map(d => ({ date: d.date, actual: null, forecast: d.forecast })),
  ]

  const serviceData = services.slice(0, 6).map(s => ({
    name: s.name,
    value: Math.floor(Math.random() * 100) + 20,
    revenue: Math.floor(Math.random() * 5000000) + 500000,
  }))

  const barberPerf = staff.slice(0, 8).map(b => ({
    ...b,
    txns: Math.floor(Math.random() * 60) + 20,
    revenue: Math.floor(Math.random() * 8000000) + 2000000,
    commission: 0,
  })).map(b => ({ ...b, commission: Math.round(b.revenue * b.commissionRate) }))
    .sort((a, b) => b.revenue - a.revenue)

  const exportCSV = () => {
    const header = 'Tanggal,Revenue,Transaksi\n'
    const rows = revenueTrend.map(d => `${d.date},${d.revenue},${d.transactions}`).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `laporan-${period}-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const barberColumns = [
    { key: 'name', label: t('tenantAdmin.reports.colBarber'), render: (v) => <span className="font-medium text-off-white">{v}</span> },
    { key: 'txns', label: t('common.transactions'), sortable: true, render: v => <span className="text-off-white">{v}</span> },
    { key: 'revenue', label: t('common.revenue'), sortable: true, render: v => <span className="text-gold font-medium">{formatRupiah(v)}</span> },
    { key: 'commission', label: t('tenantAdmin.reports.colCommission'), sortable: true, render: v => <span className="text-green-400">{formatRupiah(v)}</span> },
    { key: 'rating', label: t('tenantAdmin.reports.colRating'), render: v => v ? <span className="text-amber-400">⭐ {v}</span> : '-' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">{t('tenantAdmin.reports.titleFull')}</h1>
          <p className="text-muted text-sm mt-1">{t('tenantAdmin.reports.subtitle')}</p>
        </div>
        <div className="flex gap-3">
          <div className="flex bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            {['today', 'week', 'month'].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${period === p ? 'bg-gold text-dark' : 'text-muted hover:text-off-white'}`}
              >
                {p === 'today' ? t('common.today') : p === 'week' ? t('tenantAdmin.reports.periodWeek') : t('tenantAdmin.reports.periodMonth')}
              </button>
            ))}
          </div>
          <Button variant="secondary" icon={Download} onClick={exportCSV}>{t('tenantAdmin.reports.exportCSV')}</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: t('tenantAdmin.reports.totalRevenue'), value: formatRupiah(totalRevenue), icon: DollarSign },
          { title: t('tenantAdmin.reports.totalTransactions'), value: totalTxns, icon: Receipt },
          { title: t('tenantAdmin.reports.avgPerTransaction'), value: formatRupiah(avgPerTxn), icon: TrendingUp },
          { title: t('tenantAdmin.reports.uniqueCustomers'), value: Math.floor(totalTxns * 0.8), icon: Users },
        ].map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted">{kpi.title}</p>
                  <p className="text-xl font-bold text-off-white mt-1">{kpi.value}</p>
                </div>
                <kpi.icon className="w-8 h-8 text-gold/40" />
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader><h3 className="font-semibold text-off-white">{t('tenantAdmin.reports.dailyRevenueTrend')}</h3></CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={revenueTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
              <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} interval={6} />
              <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} tickFormatter={v => `${(v/1000000).toFixed(1)}M`} />
              <Tooltip contentStyle={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 12 }} labelStyle={{ color: '#F5F5F0' }} formatter={v => [formatRupiah(v), t('common.revenue')]} />
              <Line type="monotone" dataKey="revenue" stroke="#C9A84C" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* Revenue Forecast */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
                  <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 10 }} tickLine={false} interval={2} />
                  <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} tickLine={false} tickFormatter={v => `${(v/1000000).toFixed(1)}M`} width={45} />
                  <Tooltip contentStyle={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 12 }} formatter={v => [formatRupiah(v), '']} />
                  <Line type="monotone" dataKey="actual" stroke="#C9A84C" strokeWidth={2} dot={false} name={t('tenantAdmin.reports.actual')} connectNulls={false} />
                  <Line type="monotone" dataKey="forecast" stroke="#C9A84C" strokeWidth={2} dot={false} strokeDasharray="5 5" name={t('tenantAdmin.reports.prediction')} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Service Breakdown */}
        <Card>
          <CardHeader><h3 className="font-semibold text-off-white">{t('tenantAdmin.reports.topServices')}</h3></CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={serviceData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" nameKey="name" paddingAngle={3}>
                  {serviceData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 12 }} formatter={(v, n) => [v + 'x', n]} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#6B7280' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        {/* Transaction distribution */}
        <Card>
          <CardHeader><h3 className="font-semibold text-off-white">{t('tenantAdmin.reports.transactionsPerDay')}</h3></CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueTrend.slice(-14)} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} />
                <Tooltip contentStyle={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 12 }} />
                <Bar dataKey="transactions" fill="#C9A84C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-gold" />
            <h3 className="font-semibold text-off-white">{t('tenantAdmin.reports.busiestHours')}</h3>
          </div>
        </CardHeader>
        <CardBody>
          <HeatmapChart data={heatmapData} />
          <div className="flex items-center gap-3 mt-3 text-xs text-muted">
            <span>{t('tenantAdmin.reports.quiet')}</span>
            <div className="flex gap-1">
              {[0.1, 0.3, 0.5, 0.7, 0.9].map(o => (
                <div key={o} className="w-5 h-3 rounded" style={{ backgroundColor: `rgba(201, 168, 76, ${o})` }} />
              ))}
            </div>
            <span>{t('tenantAdmin.reports.busy')}</span>
          </div>
        </CardBody>
      </Card>

      {/* Barber Performance Table */}
      <Card>
        <CardHeader><h3 className="font-semibold text-off-white">{t('tenantAdmin.reports.barberPerformance')}</h3></CardHeader>
        <Table columns={barberColumns} data={barberPerf} sortable />
      </Card>
    </div>
  )
}
