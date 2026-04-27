import React from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ListOrdered, CheckCircle, DollarSign, Star, ChevronRight } from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useTenantStore } from '../../store/tenantStore.js'
import { useBranchQueue, useUpdateQueueStatus } from '../../hooks/useQueue.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import { formatRupiah } from '../../utils/format.js'

export default function BarberDashboard() {
  const { user } = useAuthStore()
  const { getStaffById } = useTenantStore()
  const { queue = [] } = useBranchQueue(user?.branchId)
  const updateStatusM = useUpdateQueueStatus()
  const toast = useToast()
  const { t } = useTranslation()

  const myStaffId = user?.staffId || user?.id
  const barber = getStaffById(myStaffId)
  const myQueue = queue.filter(q => q.staffId === myStaffId)
  const activeItems = myQueue.filter(q => q.status === 'waiting' || q.status === 'in-progress')
  const doneToday = myQueue.filter(q => q.status === 'done' || q.status === 'paid').length
  const commissionToday = doneToday * 125000 * (barber?.commissionRate || 0.35)

  const advance = async (id, next) => {
    try {
      await updateStatusM.mutateAsync({ id, branchId: user.branchId, status: next })
    } catch (err) {
      toast.error(err?.response?.data?.error || t('queue.toast.statusFailed'))
    }
  }

  return (
    <div className="space-y-6">
      {/* Barber Profile */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <Avatar src={barber?.photo} name={barber?.name || user.name} size="xl" ring />
            <div>
              <h2 className="font-display text-xl font-bold text-off-white">{barber?.name || user.name}</h2>
              <p className="text-muted text-sm">{t('barber.profile')}</p>
              {barber?.rating && (
                <div className="flex items-center gap-1 mt-1">
                  <Star className="w-4 h-4 text-gold fill-gold" />
                  <span className="text-gold font-semibold">{barber.rating}</span>
                  <span className="text-muted text-sm">({t('barber.clientsCount', { count: barber.totalClients })})</span>
                </div>
              )}
              {barber?.specializations?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {barber.specializations.map(s => (
                    <span key={s} className="px-2 py-0.5 bg-gold/10 text-gold text-xs rounded-md">{s}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t('barber.activeQueue'), value: activeItems.length, icon: ListOrdered, color: 'text-blue-400' },
          { label: t('barber.doneToday'), value: doneToday, icon: CheckCircle, color: 'text-green-400' },
          { label: t('barber.commissionToday'), value: formatRupiah(commissionToday), icon: DollarSign, color: 'text-gold' },
        ].map((stat, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-4 text-center">
              <stat.icon className={`w-6 h-6 mx-auto mb-2 ${stat.color}`} />
              <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted">{stat.label}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* My Queue */}
      <div>
        <h3 className="font-semibold text-off-white mb-3">{t('queue.myQueue')}</h3>
        <div className="space-y-3">
          {activeItems.length === 0 ? (
            <Card className="p-8 text-center">
              <ListOrdered className="w-10 h-10 text-muted mx-auto mb-2 opacity-40" />
              <p className="text-muted">{t('queue.noActive')}</p>
            </Card>
          ) : (
            activeItems.map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-gold">{item.ticketNumber}</span>
                        <Badge variant={item.status === 'in-progress' ? 'info' : 'warning'} dot>
                          {item.status === 'in-progress' ? t('queue.inProgressShort') : t('queue.waiting')}
                        </Badge>
                      </div>
                      <p className="font-semibold text-off-white">{item.customerName}</p>
                      <p className="text-sm text-muted">{item.services?.join(', ')}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      {item.status === 'waiting' && (
                        <button
                          onClick={() => advance(item.id, 'in-progress')}
                          className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl text-xs font-medium hover:bg-blue-500/20 transition-colors"
                        >
                          {t('queue.start')}
                        </button>
                      )}
                      {item.status === 'in-progress' && (
                        <button
                          onClick={() => advance(item.id, 'done')}
                          className="px-3 py-1.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl text-xs font-medium hover:bg-green-500/20 transition-colors"
                        >
                          {t('queue.finish')}
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Commission mini summary */}
      <Card className="p-4 bg-gold/5 border-gold/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted">{t('barber.commissionRate')}</p>
            <p className="text-xl font-bold text-gold">{((barber?.commissionRate || 0.35) * 100).toFixed(0)}%</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted">{t('barber.totalClients')}</p>
            <p className="text-xl font-bold text-off-white">{barber?.totalClients || 0}</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
