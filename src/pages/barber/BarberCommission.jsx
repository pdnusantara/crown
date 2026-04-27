import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useAuthStore } from '../../store/authStore.js'
import { useTenantStore } from '../../store/tenantStore.js'
import { transactions as seedTransactions } from '../../data/seed.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import { formatRupiah, formatDate } from '../../utils/format.js'
import { subDays, format } from 'date-fns'

export default function BarberCommission() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const { getStaffById } = useTenantStore()
  const [period, setPeriod] = useState('month')

  const barber = getStaffById(user.staffId)
  const commissionRate = barber?.commissionRate || 0.35

  const myTxns = seedTransactions.filter(t => t.staffId === user.staffId || t.staffId === 'staff-001')

  const periodDays = period === 'today' ? 1 : period === 'week' ? 7 : 30
  const cutoff = subDays(new Date(), periodDays)
  const filtered = myTxns.filter(t => new Date(t.createdAt) >= cutoff)

  const totalRevenue = filtered.reduce((s, t) => s + t.total, 0)
  const totalCommission = Math.round(totalRevenue * commissionRate)

  // Daily chart data
  const chartData = Array.from({ length: Math.min(periodDays, 14) }, (_, i) => {
    const date = subDays(new Date(), Math.min(periodDays, 14) - 1 - i)
    const dateStr = date.toDateString()
    const dayTxns = myTxns.filter(t => new Date(t.createdAt).toDateString() === dateStr)
    const dayRevenue = dayTxns.reduce((s, t) => s + t.total, 0)
    return {
      date: format(date, 'dd/MM'),
      commission: Math.round(dayRevenue * commissionRate),
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-off-white">{t('barber.myCommission')}</h1>
        <p className="text-muted text-sm mt-1">{t('barber.ratePercent', { percent: (commissionRate * 100).toFixed(0) })}</p>
      </div>

      {/* Period selector */}
      <div className="flex bg-dark-card border border-dark-border rounded-xl overflow-hidden w-fit">
        {[['today', t('common.today')], ['week', t('common.thisWeek')], ['month', t('common.thisMonth')]].map(([id, label]) => (
          <button key={id} onClick={() => setPeriod(id)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${period === id ? 'bg-gold text-dark' : 'text-muted hover:text-off-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t('common.transactions'), value: filtered.length },
          { label: t('barber.revenueServed'), value: formatRupiah(totalRevenue) },
          { label: t('barber.commissionEarned'), value: formatRupiah(totalCommission) },
        ].map((s, i) => (
          <Card key={i} className="p-4 text-center">
            <p className="text-xl font-bold text-gold">{s.value}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader><h3 className="font-semibold text-off-white">{t('barber.dailyCommission')}</h3></CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip
                contentStyle={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 12 }}
                formatter={v => [formatRupiah(v), t('barber.commissionTooltip')]}
              />
              <Bar dataKey="commission" fill="#C9A84C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* Transaction list */}
      <div>
        <h3 className="font-semibold text-off-white mb-3">{t('barber.transactionHistory')}</h3>
        <div className="space-y-2">
          {filtered.slice(0, 10).map(txn => (
            <Card key={txn.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-off-white">{txn.services?.[0]?.name || t('barber.serviceFallback')}</p>
                  <p className="text-xs text-muted">{formatDate(txn.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gold font-semibold">{formatRupiah(Math.round(txn.total * commissionRate))}</p>
                  <p className="text-xs text-muted">{t('barber.fromAmount', { amount: formatRupiah(txn.total) })}</p>
                </div>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <Card className="p-8 text-center">
              <p className="text-muted">{t('barber.noTransactionsInPeriod')}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
