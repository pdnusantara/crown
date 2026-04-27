import { motion, AnimatePresence } from 'framer-motion'
import { X, Bell, BellOff, AlertTriangle, Info, CheckCircle, Star, AlertCircle, Megaphone } from 'lucide-react'
import { useNotificationStore } from '../../store/notificationStore.js'
import { useBroadcasts, useMarkBroadcastRead } from '../../hooks/useBroadcasts.js'
import { formatDistanceToNow } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

const severityConfig = {
  warning: { icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-400/10',  border: 'border-l-amber-400' },
  info:    { icon: Info,          color: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-l-blue-400'  },
  success: { icon: CheckCircle,   color: 'text-green-400',  bg: 'bg-green-400/10',  border: 'border-l-green-400' },
  gold:    { icon: Star,          color: 'text-gold',       bg: 'bg-gold/10',       border: 'border-l-gold'      },
  error:   { icon: AlertCircle,   color: 'text-red-400',    bg: 'bg-red-400/10',    border: 'border-l-red-400'   },
}

const bcTypeConfig = {
  info:    { color: 'text-blue-400',  bg: 'bg-blue-400/10',  border: 'border-l-blue-400'  },
  warning: { color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-l-amber-400' },
  error:   { color: 'text-red-400',   bg: 'bg-red-400/10',   border: 'border-l-red-400'   },
  success: { color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-l-green-400' },
}

function timeAgo(dateStr) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: idLocale })
  } catch {
    return ''
  }
}

const isToday = (dateStr) => {
  const d = new Date(dateStr)
  const now = new Date()
  return d.toDateString() === now.toDateString()
}

export function NotificationDrawer({ open, onClose, tenantId }) {
  const { getByTenant, markAsRead, markAllAsRead, deleteNotification } = useNotificationStore()
  const { data: broadcasts = [] } = useBroadcasts(tenantId)
  const markBroadcastRead = useMarkBroadcastRead()

  const notifications   = getByTenant(tenantId || '')
  const activeBroadcasts = broadcasts.filter(b => b.active)
  const unreadBroadcasts = activeBroadcasts.filter(b => !b.read?.includes(tenantId))

  const todayNotifs = notifications.filter(n => isToday(n.createdAt))
  const olderNotifs = notifications.filter(n => !isToday(n.createdAt))
  const hasAnything = activeBroadcasts.length > 0 || notifications.length > 0

  const renderNotif = (n) => {
    const cfg  = severityConfig[n.severity] || severityConfig.info
    const Icon = cfg.icon
    return (
      <motion.div
        key={n.id}
        layout
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className={`relative group flex gap-3 p-3 rounded-xl border-l-2 cursor-pointer transition-all ${cfg.border} ${n.read ? 'bg-dark-card/50' : cfg.bg}`}
        onClick={() => markAsRead(n.id)}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
          <Icon size={16} className={cfg.color} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${n.read ? 'text-muted' : 'text-off-white'}`}>{n.title}</p>
          <p className="text-xs text-muted mt-0.5 leading-snug">{n.message}</p>
          <p className="text-xs text-muted/60 mt-1">{timeAgo(n.createdAt)}</p>
        </div>
        {!n.read && <div className="w-2 h-2 rounded-full bg-gold flex-shrink-0 mt-1" />}
        <button
          onClick={e => { e.stopPropagation(); deleteNotification(n.id) }}
          className="absolute top-2 right-2 p-1 rounded-lg text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
        >
          <X size={12} />
        </button>
      </motion.div>
    )
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[9000]"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-sm bg-dark-surface border-l border-dark-border z-[9001] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-dark-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-gold" />
                <h2 className="font-semibold text-off-white">Notifikasi</h2>
                {(unreadBroadcasts.length + notifications.filter(n => !n.read).length) > 0 && (
                  <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold">
                    {unreadBroadcasts.length + notifications.filter(n => !n.read).length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {notifications.some(n => !n.read) && (
                  <button
                    onClick={() => markAllAsRead(tenantId)}
                    className="text-xs text-gold hover:text-gold-light transition-colors"
                  >
                    Tandai Semua Dibaca
                  </button>
                )}
                <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-off-white hover:bg-dark-card transition-all">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {!hasAnything ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <BellOff size={40} className="text-muted mb-3 opacity-40" />
                  <p className="text-muted">Semua notifikasi telah dibaca</p>
                  <p className="text-xs text-muted/60 mt-1">Tidak ada notifikasi baru</p>
                </div>
              ) : (
                <>
                  {/* Broadcast / Pengumuman section */}
                  {activeBroadcasts.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2 px-1">
                        <Megaphone size={11} className="text-muted" />
                        <p className="text-xs text-muted uppercase tracking-wider">Pengumuman Platform</p>
                      </div>
                      <div className="space-y-2">
                        <AnimatePresence>
                          {activeBroadcasts.map(bc => {
                            const isRead = bc.read?.includes(tenantId)
                            const cfg    = bcTypeConfig[bc.type] || bcTypeConfig.info
                            return (
                              <motion.div
                                key={bc.id}
                                layout
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className={`relative group flex gap-3 p-3 rounded-xl border-l-2 transition-all ${cfg.border} ${isRead ? 'bg-dark-card/50' : cfg.bg}`}
                              >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                                  <Megaphone size={15} className={cfg.color} />
                                </div>
                                <div className="flex-1 min-w-0 pr-6">
                                  <p className={`text-sm font-medium ${isRead ? 'text-muted' : 'text-off-white'}`}>{bc.title}</p>
                                  <p className="text-xs text-muted mt-0.5 leading-snug">{bc.message}</p>
                                  <p className="text-xs text-muted/60 mt-1">{timeAgo(bc.sentAt)}</p>
                                </div>
                                {!isRead && (
                                  <button
                                    onClick={() => markBroadcastRead.mutate(bc.id)}
                                    className="absolute top-2 right-2 p-1 rounded-lg text-muted hover:text-off-white hover:bg-dark-surface transition-all"
                                    title="Tandai dibaca"
                                  >
                                    <X size={12} />
                                  </button>
                                )}
                                {!isRead && <div className="w-2 h-2 rounded-full bg-gold flex-shrink-0 mt-1" />}
                              </motion.div>
                            )
                          })}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}

                  {/* Regular notifications */}
                  {notifications.length > 0 && (
                    <>
                      {todayNotifs.length > 0 && (
                        <div>
                          <p className="text-xs text-muted uppercase tracking-wider mb-2 px-1">Terbaru</p>
                          <div className="space-y-2">
                            <AnimatePresence>
                              {todayNotifs.map(renderNotif)}
                            </AnimatePresence>
                          </div>
                        </div>
                      )}
                      {olderNotifs.length > 0 && (
                        <div>
                          <p className="text-xs text-muted uppercase tracking-wider mb-2 px-1">Sebelumnya</p>
                          <div className="space-y-2">
                            <AnimatePresence>
                              {olderNotifs.map(renderNotif)}
                            </AnimatePresence>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default NotificationDrawer
