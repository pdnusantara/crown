import React, { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendingUp, TrendingDown, Download, GitCompare } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { format, subDays } from 'date-fns'
import { useAuthStore } from '../../store/authStore.js'
import { useBranches } from '../../hooks/useBranches.js'
import { useBranchSummary, useBranchDaily } from '../../hooks/useReports.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import { formatRupiah } from '../../utils/format.js'

function todayStr() { return new Date().toISOString().split('T')[0] }
function daysAgoStr(n) { return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split('T')[0] }

function WinLoss({ aVal, bVal }) {
  const aWins = aVal >= bVal
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

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-dark-card ${className}`} />
}

export default function TABranchComparisonPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const tenantId = user?.tenantId

  const { data: branches = [], isLoading: loadingBranches } = useBranches(tenantId)

  const [branchAId, setBranchAId] = useState('')
  const [branchBId, setBranchBId] = useState('')

  useEffect(() => {
    if (branches.length > 0 && !branchAId) setBranchAId(branches[0]?.id || '')
    if (branches.length > 1 && !branchBId) setBranchBId(branches[1]?.id || '')
  }, [branches])

  const startDate = daysAgoStr(29)
  const endDate   = todayStr()

  const { data: summaryA, isLoading: loadSA } = useBranchSummary(tenantId, branchAId, startDate, endDate)
  const { data: summaryB, isLoading: loadSB } = useBranchSummary(tenantId, branchBId, startDate, endDate)
  const { data: dailyA = [], isLoading: loadDA } = useBranchDaily(tenantId, branchAId, 7)
  const { data: dailyB = [], isLoading: loadDB } = useBranchDaily(tenantId, branchBId, 7)

  const branchA = branches.find(b => b.id === branchAId)
  const branchB = branches.find(b => b.id === branchBId)
  const isLoading = loadSA || loadSB

  const chartData = useMemo(() => {
    const mapA = {}; const mapB = {}
    dailyA.forEach(d => { mapA[d.date] = d.revenue })
    dailyB.forEach(d => { mapB[d.date] = d.revenue })
    return Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), 6 - i)
      const key = d.toISOString().split('T')[0]
      return {
        date: format(d, 'dd/MM'),
        [branchA?.name || 'A']: mapA[key] ?? 0,
        [branchB?.name || 'B']: mapB[key] ?? 0,
      }
    })
  }, [dailyA, dailyB, branchA, branchB])

  const sA = summaryA?.summary
  const sB = summaryB?.summary

  const metrics = [
    { label: t('tenantAdmin.branchComparison.metricRevenueMtd'),       aVal: sA?.totalRevenue             ?? 0, bVal: sB?.totalRevenue             ?? 0, fmt: formatRupiah },
    { label: t('tenantAdmin.branchComparison.metricTotalTransactions'), aVal: sA?.totalTransactions        ?? 0, bVal: sB?.totalTransactions        ?? 0, fmt: v => v },
    { label: t('tenantAdmin.branchComparison.metricNewCustomers'),      aVal: sA?.totalNewCustomers        ?? 0, bVal: sB?.totalNewCustomers        ?? 0, fmt: v => v },
    { label: t('tenantAdmin.branchComparison.metricAvgTransaction'),    aVal: sA?.averageTransactionValue  ?? 0, bVal: sB?.averageTransactionValue  ?? 0, fmt: formatRupiah },
  ]

  const handleExport = () => {
    const headers = `Metrik,${branchA?.name || 'A'},${branchB?.name || 'B'}\n`
    const rows = metrics.map(m => `${m.label},${m.aVal},${m.bVal}`).join('\n')
    const blob = new Blob([headers + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `perbandingan-cabang-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!loadingBranches && branches.length < 2) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">{t('tenantAdmin.branchComparison.title')}</h1>
          <p className="text-muted text-sm mt-1">{t('tenantAdmin.branchComparison.subtitle')}</p>
        </div>
        <Card className="p-10 text-center">
          <GitCompare className="w-10 h-10 text-muted/30 mx-auto mb-3" />
          <p className="text-off-white font-medium">Minimal 2 cabang diperlukan</p>
          <p className="text-muted text-sm mt-1">Tambahkan cabang kedua untuk mulai membandingkan performa antar cabang.</p>
        </Card>
      </div>
    )
  }

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
        {[{ id: branchAId, set: setBranchAId, branch: branchA, label: t('tenantAdmin.branchComparison.branchA') },
          { id: branchBId, set: setBranchBId, branch: branchB, label: t('tenantAdmin.branchComparison.branchB') }
        ].map(({ id, set, branch, label }) => (
          <Card key={label} className="p-4">
            <label className="block text-xs text-muted mb-2">{label}</label>
            <select value={id} onChange={e => set(e.target.value)} className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60">
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {branch?.address && <p className="text-xs text-muted mt-1">{branch.address}</p>}
          </Card>
        ))}
      </div>

      {/* Metrics comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map(m => {
          const aWins = m.aVal >= m.bVal
          const bWins = m.bVal > m.aVal
          return (
            <Card key={m.label} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted uppercase tracking-wider leading-tight">{m.label}</p>
                <WinLoss aVal={m.aVal} bVal={m.bVal} />
              </div>
              {isLoading ? <Skeleton className="h-16" /> : (
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-3 rounded-xl ${aWins ? 'bg-green-500/10 border border-green-500/20' : 'bg-dark-card'}`}>
                    <p className="text-xs text-muted mb-1 truncate">{branchA?.name || 'A'}</p>
                    <p className={`font-bold text-base ${aWins ? 'text-green-400' : 'text-off-white'}`}>{m.fmt(m.aVal)}</p>
                  </div>
                  <div className={`p-3 rounded-xl ${bWins ? 'bg-green-500/10 border border-green-500/20' : 'bg-dark-card'}`}>
                    <p className="text-xs text-muted mb-1 truncate">{branchB?.name || 'B'}</p>
                    <p className={`font-bold text-base ${bWins ? 'text-green-400' : 'text-off-white'}`}>{m.fmt(m.bVal)}</p>
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* 7-day chart */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-off-white">{t('tenantAdmin.branchComparison.revenue7Days')}</h3>
        </CardHeader>
        <CardBody>
          {(loadDA || loadDB) ? <Skeleton className="h-72" /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
                <Tooltip contentStyle={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 12 }} formatter={v => [formatRupiah(v), '']} />
                <Legend wrapperStyle={{ color: '#6B7280', fontSize: 12 }} />
                <Bar dataKey={branchA?.name || 'A'} fill="#C9A84C" radius={[4, 4, 0, 0]} />
                <Bar dataKey={branchB?.name || 'B'} fill="#4B8BFF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
