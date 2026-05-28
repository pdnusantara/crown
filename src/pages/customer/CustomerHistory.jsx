import React from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/authStore.js'
import { useBookings } from '../../hooks/useBookings.js'
import { useTransactions } from '../../hooks/useTransactions.js'
import Card from '../../components/ui/Card.jsx'
import Badge, { getStatusBadge } from '../../components/ui/Badge.jsx'
import { formatRupiah, formatDate, formatDateTime } from '../../utils/format.js'
import { Receipt } from 'lucide-react'

const BOOKING_STATUS_LABEL = {
  pending:    'Menunggu',
  confirmed:  'Terkonfirmasi',
  done:       'Selesai',
  cancelled:  'Dibatalkan',
}

export default function CustomerHistory() {
  const { t } = useTranslation()
  const { user } = useAuthStore()

  const { data: bookings = [] } = useBookings({ customerId: user?.id })
  const { data: transactions = [], isLoading } = useTransactions({ customerId: user?.id })

  const activeBookings = bookings.filter(b => b.status !== 'cancelled' && b.status !== 'done')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-off-white">{t('customer.historyTitle')}</h1>
        <p className="text-muted text-sm mt-1">{t('customer.historySubtitle')}</p>
      </div>

      {/* Upcoming bookings */}
      {activeBookings.length > 0 && (
        <div>
          <h3 className="font-semibold text-off-white mb-3">{t('customer.activeBookings')}</h3>
          <div className="space-y-2">
            {activeBookings.map((b, i) => (
              <motion.div key={b.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-off-white">{b.serviceName || '—'}</p>
                      <p className="text-sm text-muted">{formatDate(b.date)} • {b.time}</p>
                      <p className="text-sm text-muted">{b.barberName || t('customer.barberAvailable')}</p>
                    </div>
                    <Badge variant={getStatusBadge(b.status)}>
                      {BOOKING_STATUS_LABEL[b.status] || b.status}
                    </Badge>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction history */}
      <div>
        <h3 className="font-semibold text-off-white mb-3">{t('customer.transactionHistory')}</h3>
        <div className="space-y-2">
          {isLoading ? (
            [...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-dark-card animate-pulse" />)
          ) : transactions.length === 0 ? (
            <Card className="p-10 text-center">
              <Receipt className="w-10 h-10 text-muted mx-auto mb-3 opacity-40" />
              <p className="text-muted">{t('customer.noTransactions')}</p>
            </Card>
          ) : (
            transactions.slice(0, 10).map((txn, i) => (
              <motion.div key={txn.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-off-white">
                        {(txn.items || []).map(i => i.name).join(', ') || t('customer.serviceFallback')}
                      </p>
                      <p className="text-sm text-muted">{formatDateTime(txn.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-brand">{formatRupiah(txn.total)}</p>
                      <Badge variant={getStatusBadge(txn.paymentMethod)} className="mt-1">
                        {txn.paymentMethod}
                      </Badge>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
