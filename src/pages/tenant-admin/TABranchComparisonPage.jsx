import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendingUp, TrendingDown, Download } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { subDays, format } from 'date-fns'
import { useAuthStore } from '../../store/authStore.js'
import { useTenantStore } from '../../store/tenantStore.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import { formatRupiah } from '../../utils/format.js'

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function generateBranchData(seed) {
  const base = seed * 1000000
  return {
    revenueMTD: base + randomBetween(5000000, 25000000),
    transactionsMTD: randomBetween(80, 300),
    newCustomers: randomBetween(10, 60),
    avgTransaction: base / 10 + randomBetween(50000, 150000),
    topBarber: ['Rizky', 'Andi', 'Budi', 'Deni'][Math.floor(seed) % 4],
    busiestHour: `${randomBetween(10, 17)}:00 – ${randomBetween(11, 18)}:00`,
    last7Days: Array.from({ length: 7 }, (_, i) => ({
      date: format(subDays(new Date(), 6 - i), 'dd/MM'),
      revenue: base / 7 + randomBetween(500000, 2000000),
    }))
  }
}

function WinLoss({ aVal, bVal, reverse = false }) {
  const aWins = reverse ? aVal < bVal : aVal > bVal
  return (
    <div className="flex items-center gap-1">
      {aWins ? <TrendingUp size={14} className="text-green-400" /> : <TrendingDown size={14} className="text-red-400" />}
      <span className={aWins ? 'text-green-400 text-xs' : 'text-muted text-xs'}>A</span>
      <span className="text-muted text-xs">vs</span>
      {!aWins ? <TrendingUp size={14} className="text-green-400" /> : <TrendingDown size={14} className="text-red-400" />}
      <span className={!aWins ? 'text-green-400 text-xs' : 'text-muted text-xs'}>B</span>
    </div>
  )
}

export default function TABranchComparisonPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const { getBranchesByTenant } = useTenantStore()
  const branches = getBranchesByTenant(user.tenantId)

  const [branchAId, setBranchAId] = useState(branches[0]?.id || '')
  const [branchBId, setBranchBId] = useState(branches[1]?.id || branches[0]?.id || '')

  const branchA = branches.find(b => b.id === branchAId)
  const branchB = branches.find(b => b.id === branchBId)

  const dataA = useMemo(() => generateBranchData(branchAId.length), [branchAId])
  const dataB = useMemo(() => generateBranchData(branchBId.length + 1), [branchBId])

  const chartData = dataA.last7Days.map((d, i) => ({
    date: d.date,
    [branchA?.name || 'A']: Math.round(d.revenue),
    [branchB?.name || 'B']: Math.round(dataB.last7Days[i]?.revenue || 0),
  }))

  const handleExport = () => {
    const headers = `${t('tenantAdmin.branchComparison.csvMetric')},${t('tenantAdmin.branchComparison.csvBranchA')},${t('tenantAdmin.branchComparison.csvBranchB')}\n`
    const rows = [
      `${t('tenantAdmin.branchComparison.metricRevenueMtd')},${dataA.revenueMTD},${dataB.revenueMTD}`,
      `${t('tenantAdmin.branchComparison.metricTransactionsMtd')},${dataA.transactionsMTD},${dataB.transactionsMTD}`,
      `${t('tenantAdmin.branchComparison.metricNewCustomers')},${dataA.newCustomers},${dataB.newCustomers}`,
      `${t('tenantAdmin.branchComparison.metricAvgTransaction')},${dataA.avgTransaction},${dataB.avgTransaction}`,
    ].join('\n')
    const blob = new Blob([headers + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `perbandingan-cabang-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const metrics = [
    { label: t('tenantAdmin.branchComparison.metricRevenueMtd'), aVal: dataA.revenueMTD, bVal: dataB.revenueMTD, format: formatRupiah },
    { label: t('tenantAdmin.branchComparison.metricTotalTransactions'), aVal: dataA.transactionsMTD, bVal: dataB.transactionsMTD, format: v => v },
    { label: t('tenantAdmin.branchComparison.metricNewCustomers'), aVal: dataA.newCustomers, bVal: dataB.newCustomers, format: v => v },
    { label: t('tenantAdmin.branchComparison.metricAvgTransaction'), aVal: dataA.avgTransaction, bVal: dataB.avgTransaction, format: formatRupiah },
    { label: t('tenantAdmin.branchComparison.metricTopBarber'), aVal: dataA.topBarber, bVal: dataB.topBarber, format: v => v, noCompare: true },
    { label: t('tenantAdmin.branchComparison.metricBusiestHour'), aVal: dataA.busiestHour, bVal: dataB.busiestHour, format: v => v, noCompare: true },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">{t('tenantAdmin.branchComparison.title')}</h1>
          <p className="text-muted text-sm mt-1">{t('tenantAdmin.branchComparison.subtitle')}</p>
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-dark-card border border-dark-border text-muted hover:text-off-white hover:border-gold/30 rounded-xl text-sm transition-all">
          <Download size={16} />
          {t('tenantAdmin.branchComparison.downloadComparison')}
        </button>
      </div>

      {/* Branch selectors */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <label className="block text-xs text-muted mb-2">{t('tenantAdmin.branchComparison.branchA')}</label>
          <select value={branchAId} onChange={e => setBranchAId(e.target.value)} className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60">
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {branchA && <p className="text-xs text-muted mt-1">{branchA.address}</p>}
        </Card>
        <Card className="p-4">
          <label className="block text-xs text-muted mb-2">{t('tenantAdmin.branchComparison.branchB')}</label>
          <select value={branchBId} onChange={e => setBranchBId(e.target.value)} className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60">
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {branchB && <p className="text-xs text-muted mt-1">{branchB.address}</p>}
        </Card>
      </div>

      {/* Metrics comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map(m => {
          const aWins = !m.noCompare && (typeof m.aVal === 'number' ? m.aVal >= m.bVal : false)
          const bWins = !m.noCompare && (typeof m.bVal === 'number' ? m.bVal > m.aVal : false)
          return (
            <Card key={m.label} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted uppercase tracking-wider">{m.label}</p>
                {!m.noCompare && <WinLoss aVal={m.aVal} bVal={m.bVal} />}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={`p-3 rounded-xl ${aWins ? 'bg-green-500/10 border border-green-500/20' : 'bg-dark-card'}`}>
                  <p className="text-xs text-muted mb-1">{branchA?.name || t('tenantAdmin.branchComparison.branchA')}</p>
                  <p className={`font-bold text-base ${aWins ? 'text-green-400' : 'text-off-white'}`}>{m.format(m.aVal)}</p>
                </div>
                <div className={`p-3 rounded-xl ${bWins ? 'bg-green-500/10 border border-green-500/20' : 'bg-dark-card'}`}>
                  <p className="text-xs text-muted mb-1">{branchB?.name || t('tenantAdmin.branchComparison.branchB')}</p>
                  <p className={`font-bold text-base ${bWins ? 'text-green-400' : 'text-off-white'}`}>{m.format(m.bVal)}</p>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-off-white">{t('tenantAdmin.branchComparison.revenue7Days')}</h3>
        </CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} tickFormatter={v => `${(v/1000000).toFixed(1)}M`} />
              <Tooltip
                contentStyle={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 12 }}
                formatter={v => [formatRupiah(v), '']}
              />
              <Legend wrapperStyle={{ color: '#6B7280', fontSize: 12 }} />
              <Bar dataKey={branchA?.name || 'A'} fill="#C9A84C" radius={[4, 4, 0, 0]} />
              <Bar dataKey={branchB?.name || 'B'} fill="#4B8BFF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>
    </div>
  )
}
