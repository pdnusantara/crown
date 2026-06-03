import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Clock, ChevronRight, Bell, BellOff } from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useBranchQueue, useUpdateQueueStatus } from '../../hooks/useQueue.js'
import { isQueueAlertMuted, setQueueAlertMuted } from '../../hooks/useBarberQueueAlerts.js'
import Card from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import LiveBadge from '../../components/ui/LiveBadge.jsx'
import { useToast } from '../../components/ui/Toast.jsx'

export default function BarberQueue() {
  const { user } = useAuthStore()
  const { queue = [] } = useBranchQueue(user?.branchId)
  const updateStatusM = useUpdateQueueStatus()
  const toast = useToast()
  const { t } = useTranslation()

  const myStaffId = user?.staffId || user?.id
  const myQueue = queue.filter(q => q.staffId === myStaffId)
  const waiting = myQueue.filter(q => q.status === 'waiting')
  const inProgress = myQueue.filter(q => q.status === 'in-progress')
  const done = myQueue.filter(q => q.status === 'done' || q.status === 'paid')

  const handleAdvance = async (item) => {
    const next = item.status === 'waiting' ? 'in-progress' : 'done'
    try {
      await updateStatusM.mutateAsync({
        id: item.id,
        branchId: user.branchId,
        status: next,
      })
      toast.success(next === 'in-progress' ? t('queue.toast.startService') : t('queue.toast.markDone'))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('queue.toast.statusFailed'))
    }
  }

  const Section = ({ title, items, color }) => (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <h3 className="font-semibold text-off-white">{title}</h3>
        <span className="text-muted text-sm">({items.length})</span>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-brand">{item.ticketNumber}</span>
                    <Badge variant={item.type === 'booking' ? 'info' : 'muted'}>{item.type}</Badge>
                  </div>
                  <p className="font-semibold text-off-white truncate">{item.customerName}</p>
                  <p className="text-sm text-muted truncate">{item.services?.join(', ')}</p>
                  {item.status === 'waiting' && (
                    <div className="flex items-center gap-1 mt-1">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs text-amber-400">~{item.waitTime} min menunggu</span>
                    </div>
                  )}
                </div>
                {(item.status === 'waiting' || item.status === 'in-progress') && (
                  <button
                    onClick={() => handleAdvance(item)}
                    className="flex-shrink-0 flex items-center gap-1 px-4 py-2 bg-brand/10 border border-brand/20 text-brand rounded-xl text-sm font-medium hover:bg-brand/20 transition-colors"
                  >
                    {item.status === 'waiting' ? 'Mulai' : 'Selesai'}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </Card>
          </motion.div>
        ))}
        {items.length === 0 && (
          <Card className="p-6 text-center">
            <p className="text-muted text-sm">Tidak ada antrian</p>
          </Card>
        )}
      </div>
    </div>
  )

  const [muted, setMuted] = useState(isQueueAlertMuted())
  const toggleMuted = () => { const next = !muted; setMuted(next); setQueueAlertMuted(next) }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-off-white">Antrian Saya</h1>
            <LiveBadge />
          </div>
          <p className="text-muted text-sm mt-1">{inProgress.length} sedang dilayani, {waiting.length} menunggu</p>
        </div>
        <button
          type="button"
          onClick={toggleMuted}
          aria-label={muted ? 'Nyalakan suara notifikasi' : 'Senyapkan suara notifikasi'}
          title={muted ? 'Suara notifikasi: mati' : 'Suara notifikasi: nyala'}
          className={`flex-shrink-0 p-2 rounded-xl border transition-colors ${muted ? 'border-dark-border text-muted hover:text-off-white' : 'border-brand/30 text-brand bg-brand/5'}`}
        >
          {muted ? <BellOff size={18} /> : <Bell size={18} />}
        </button>
      </div>
      <Section title="Sedang Dilayani" items={inProgress} color="bg-blue-400" />
      <Section title="Menunggu" items={waiting} color="bg-amber-400" />
      <Section title="Selesai Hari Ini" items={done} color="bg-green-400" />
    </div>
  )
}
