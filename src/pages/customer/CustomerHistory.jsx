import React from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useBookingStore } from '../../store/bookingStore.js'
import { transactions as seedTransactions } from '../../data/seed.js'
import Card from '../../components/ui/Card.jsx'
import Badge, { getStatusBadge } from '../../components/ui/Badge.jsx'
import { formatRupiah, formatDate, formatDateTime } from '../../utils/format.js'
import { Receipt } from 'lucide-react'

export default function CustomerHistory() {
  const { t } = useTranslation()
  const { bookings } = useBookingStore()
  const myBookings = bookings.filter(b => b.customerId === 'cust-001')

  // Get customer's transactions
  const myTxns = seedTransactions.filter(t => t.customerId === 'cust-001').slice(0, 10)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-off-white">{t('customer.historyTitle')}</h1>
        <p className="text-muted text-sm mt-1">{t('customer.historySubtitle')}</p>
      </div>

      {/* Upcoming bookings */}
      {myBookings.filter(b => b.status !== 'cancelled').length > 0 && (
        <div>
          <h3 className="font-semibold text-off-white mb-3">{t('customer.activeBookings')}</h3>
          <div className="space-y-2">
            {myBookings.filter(b => b.status !== 'cancelled').map((b, i) => (
              <motion.div key={b.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-off-white">{b.services?.join(', ')}</p>
                      <p className="text-sm text-muted">{formatDate(b.date)} • {b.time}</p>
                      <p className="text-sm text-muted">{b.staffName || t('customer.barberAvailable')}</p>
                    </div>
                    <Badge variant={getStatusBadge(b.status)}>
                      {b.status === 'confirmed' ? t('customer.statusConfirmed') : t('customer.statusWaiting')}
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
          {myTxns.length === 0 ? (
            <Card className="p-10 text-center">
              <Receipt className="w-10 h-10 text-muted mx-auto mb-3 opacity-40" />
              <p className="text-muted">{t('customer.noTransactions')}</p>
            </Card>
          ) : (
            myTxns.map((txn, i) => (
              <motion.div key={txn.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-off-white">{txn.services?.[0]?.name || t('customer.serviceFallback')}</p>
                      <p className="text-sm text-muted">{formatDateTime(txn.createdAt)}</p>
                      <p className="text-sm text-muted">{txn.staffName}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gold">{formatRupiah(txn.total)}</p>
                      <Badge variant={getStatusBadge(txn.paymentMethod)} className="mt-1">{txn.paymentMethod}</Badge>
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
