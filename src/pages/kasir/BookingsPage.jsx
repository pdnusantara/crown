import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { CalendarDays, Clock, User, Check, X, Plus } from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useBookingStore } from '../../store/bookingStore.js'
import { useTenantStore } from '../../store/tenantStore.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card from '../../components/ui/Card.jsx'
import Badge, { getStatusBadge } from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import { formatDate } from '../../utils/format.js'
import { addDays, format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

export default function BookingsPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const { bookings, confirmBooking, cancelBooking } = useBookingStore()
  const { getServiceById } = useTenantStore()
  const toast = useToast()
  const [dateFilter, setDateFilter] = useState('all')

  const today = format(new Date(), 'yyyy-MM-dd')
  const branchBookings = bookings.filter(b =>
    b.branchId === user.branchId && b.status !== 'cancelled'
  )

  const filtered = branchBookings.filter(b => {
    if (dateFilter === 'today') return b.date === today
    if (dateFilter === 'tomorrow') return b.date === format(addDays(new Date(), 1), 'yyyy-MM-dd')
    if (dateFilter === 'upcoming') return b.date >= today
    return true
  }).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))

  const stats = {
    today: branchBookings.filter(b => b.date === today).length,
    pending: branchBookings.filter(b => b.status === 'pending').length,
    confirmed: branchBookings.filter(b => b.status === 'confirmed').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">{t('bookings.title')}</h1>
          <p className="text-muted text-sm mt-1">{t('bookings.todayCount', { n: stats.today })}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t('bookings.today'), value: stats.today, color: 'text-gold' },
          { label: t('bookings.waitingConfirmation'), value: stats.pending, color: 'text-amber-400' },
          { label: t('bookings.confirmed'), value: stats.confirmed, color: 'text-green-400' },
        ].map(s => (
          <Card key={s.label} className="p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-muted text-xs">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Date filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { id: 'all', label: t('bookings.all') },
          { id: 'today', label: t('bookings.today') },
          { id: 'tomorrow', label: t('bookings.tomorrow') },
          { id: 'upcoming', label: t('bookings.upcoming') },
        ].map(f => (
          <button key={f.id} onClick={() => setDateFilter(f.id)}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${dateFilter === f.id ? 'bg-gold text-dark' : 'bg-dark-card border border-dark-border text-muted hover:text-off-white'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Bookings list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <CalendarDays className="w-12 h-12 text-muted mx-auto mb-3 opacity-40" />
            <p className="text-muted">{t('bookings.noBookingsForFilter')}</p>
          </Card>
        ) : (
          filtered.map((booking, i) => (
            <motion.div key={booking.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={getStatusBadge(booking.status)} dot>
                        {booking.status === 'confirmed' ? t('bookings.confirmed') : t('bookings.waiting')}
                      </Badge>
                      <span className="text-xs text-muted">#{booking.id.split('-')[1]}</span>
                    </div>
                    <p className="font-semibold text-off-white">{booking.customerName}</p>
                    <div className="flex items-center gap-4 mt-1.5 text-sm text-muted">
                      <div className="flex items-center gap-1">
                        <CalendarDays className="w-3.5 h-3.5" />
                        <span>{formatDate(booking.date)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{booking.time}</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted mt-1">
                      {booking.services.join(', ')}
                    </p>
                    {booking.staffName && (
                      <div className="flex items-center gap-1 mt-1">
                        <User className="w-3.5 h-3.5 text-muted" />
                        <span className="text-sm text-muted">{booking.staffName}</span>
                      </div>
                    )}
                    {booking.notes && (
                      <p className="text-xs text-muted mt-1.5 italic">"{booking.notes}"</p>
                    )}
                  </div>

                  {booking.status === 'pending' && (
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => { confirmBooking(booking.id); toast.success(t('bookings.confirmedToast')) }}
                        className="p-2 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl hover:bg-green-500/20 transition-colors"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { cancelBooking(booking.id); toast.success(t('bookings.cancelledToast')) }}
                        className="p-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          ))
        )}
      </div>
    </div>
  )
}
