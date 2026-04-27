import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Search, Receipt } from 'lucide-react'
import { usePosStore } from '../../store/posStore.js'
import { transactions as seedTransactions } from '../../data/seed.js'
import Card from '../../components/ui/Card.jsx'
import Badge, { getStatusBadge } from '../../components/ui/Badge.jsx'
import Table from '../../components/ui/Table.jsx'
import { formatRupiah, formatDateTime } from '../../utils/format.js'

export default function TransactionsPage() {
  const { t } = useTranslation()
  const { transactions: posTransactions } = usePosStore()
  const [search, setSearch] = useState('')
  const [pmFilter, setPmFilter] = useState('')

  const PAYMENT_LABELS = {
    cash: t('pos.cash'),
    transfer: t('pos.transfer'),
    qris: t('pos.qris'),
    card: t('pos.card'),
  }

  const allTransactions = [...posTransactions, ...seedTransactions].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  )

  const filtered = allTransactions.filter(t2 => {
    const matchSearch = !search || t2.id.includes(search) || t2.staffName?.toLowerCase().includes(search.toLowerCase()) || t2.customerName?.toLowerCase().includes(search.toLowerCase())
    const matchPm = !pmFilter || t2.paymentMethod === pmFilter
    return matchSearch && matchPm
  })

  const totalRevenue = filtered.reduce((s, tx) => s + tx.total, 0)

  const columns = [
    {
      key: 'id', label: 'ID',
      render: v => <span className="text-xs font-mono text-muted">#{v.split('-')[1]}</span>
    },
    {
      key: 'createdAt', label: t('transactions.headerTime'),
      render: v => <span className="text-sm text-muted">{formatDateTime(v)}</span>
    },
    {
      key: 'customerName', label: t('transactions.headerCustomer'),
      render: (v, row) => (
        <div>
          <p className="text-sm font-medium text-off-white">{v || row.services?.[0]?.barberName || t('pos.walkIn')}</p>
          <p className="text-xs text-muted">{row.staffName}</p>
        </div>
      )
    },
    {
      key: 'paymentMethod', label: t('transactions.headerPayment'),
      render: v => <Badge variant={getStatusBadge(v)}>{PAYMENT_LABELS[v] || v}</Badge>
    },
    {
      key: 'total', label: t('transactions.headerTotal'), sortable: true,
      render: v => <span className="font-semibold text-gold">{formatRupiah(v)}</span>
    },
    {
      key: 'status', label: t('transactions.headerStatus'),
      render: v => <Badge variant="success">{t('transactions.completed')}</Badge>
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-off-white">{t('transactions.title')}</h1>
        <p className="text-muted text-sm mt-1">{allTransactions.length} {t('common.total').toLowerCase()} {t('transactions.title').toLowerCase()}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('transactions.title'), value: filtered.length },
          { label: t('common.revenue'), value: formatRupiah(totalRevenue) },
          { label: t('pos.cash'), value: filtered.filter(tx => tx.paymentMethod === 'cash').length },
          { label: `Non-${t('pos.cash').toLowerCase()}`, value: filtered.filter(tx => tx.paymentMethod !== 'cash').length },
        ].map((s, i) => (
          <Card key={i} className="p-4 text-center">
            <p className="text-xl font-bold text-gold">{s.value}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`${t('common.search')}...`} className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-gold/60" />
        </div>
        <select value={pmFilter} onChange={e => setPmFilter(e.target.value)} className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2 text-sm outline-none focus:border-gold/60">
          <option value="">{t('common.all')} {t('pos.paymentMethod')}</option>
          <option value="cash">{t('pos.cash')}</option>
          <option value="transfer">{t('pos.transfer')}</option>
          <option value="qris">{t('pos.qris')}</option>
        </select>
      </div>

      {/* Table */}
      <Card>
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="w-12 h-12 text-muted mx-auto mb-3 opacity-40" />
            <p className="text-muted">{t('transactions.noTransactions')}</p>
          </div>
        ) : (
          <Table columns={columns} data={filtered} sortable pageSize={15} />
        )}
      </Card>
    </div>
  )
}
