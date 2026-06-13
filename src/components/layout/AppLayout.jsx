import React, { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import Sidebar from './Sidebar.jsx'
import TopBar from './TopBar.jsx'
import BottomNav from './BottomNav.jsx'
import { CommandPalette } from '../ui/CommandPalette.jsx'
import { useAuthStore } from '../../store/authStore.js'
import { useNotificationStore } from '../../store/notificationStore.js'
import { getSocket, joinBranchRoom, joinTenantRoom, leaveBranchRoom } from '../../lib/socket.js'
import { getBranchSlug } from '../../utils/branchSlug.js'
import { useToast } from '../ui/Toast.jsx'
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js'
import { useSwipe } from '../../hooks/useSwipe.js'
import { useBarberQueueAlerts } from '../../hooks/useBarberQueueAlerts.js'
import { Download, X, WifiOff, ShieldAlert } from 'lucide-react'
import { formatRupiah } from '../../utils/format.js'

const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    setMatches(mq.matches)
    const handler = (e) => setMatches(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [query])
  return matches
}

// Nav configs for swipe navigation
const navConfigs = {
  tenant_admin: () => [
    '/admin/dashboard',
    '/admin/branches',
    '/admin/services',
    '/admin/staff',
    '/admin/customers',
    '/admin/reports',
    '/admin/settings',
  ],
  kasir: (user) => {
    const slug = getBranchSlug(user)
    // Urutan WAJIB sama dgn BottomNav (pos→queue→bookings→customers→transactions)
    // supaya swipe kiri/kanan konsisten dgn tab bar (jangan lewati customers).
    return [
      `/${slug}/kasir/pos`,
      `/${slug}/kasir/queue`,
      `/${slug}/kasir/bookings`,
      `/${slug}/kasir/customers`,
      `/${slug}/kasir/transactions`,
    ]
  },
  barber: () => [
    '/barber/dashboard',
    '/barber/queue',
    '/barber/commission',
  ],
  customer: () => ['/customer/booking', '/customer/history', '/customer/loyalty'],
}

export const AppLayout = () => {
  const { t } = useTranslation()
  const { user, impersonating, stopImpersonation } = useAuthStore()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showPwaBanner, setShowPwaBanner] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const isOnline = useOnlineStatus()
  // Notifikasi realtime antrian untuk barber (no-op utk peran lain).
  useBarberQueueAlerts()

  // Tutup drawer sidebar mobile otomatis tiap pindah halaman. Tanpa ini, setelah
  // memilih menu di drawer, halaman berpindah TAPI drawer tetap menutupi layar
  // (terasa "macet") — pengguna harus menutup manual dulu.
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [location.pathname])

  // Listen for PWA install prompt
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-banner-dismissed')
    if (dismissed) return
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowPwaBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Keyboard shortcut Ctrl/Cmd+K for command palette
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen(o => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setShowPwaBanner(false)
    localStorage.setItem('pwa-banner-dismissed', '1')
  }

  const dismissPwaBanner = () => {
    setShowPwaBanner(false)
    localStorage.setItem('pwa-banner-dismissed', '1')
  }

  // Real-time notifications via socket (transactions + queue events)
  const addNotification = useNotificationStore(s => s.addNotification)
  const toast = useToast()
  useEffect(() => {
    if (!user) return
    const socket = getSocket()

    // Pastikan socket sudah join room yang relevan supaya notifikasi sampai
    // walau halaman aktif tidak punya hook queue lokal.
    if (user.tenantId) joinTenantRoom(user.tenantId)
    if (user.branchId) joinBranchRoom(user.branchId)

    const handleTransactionCreated = (data) => {
      // Notifikasi transaksi ditujukan ke admin tenant & barber terkait.
      // - Jangan notifikasi pembuat transaksi (mereka sudah lihat struk).
      // - Kasir lain tak perlu — fokus ke admin & barber.
      if (data.cashierId && data.cashierId === user.id) return
      if (user.role === 'kasir') return
      const isBarber = user.role === 'barber'
      if (isBarber && !(data.barberIds || []).includes(user.id)) return

      const title = isBarber ? `✂️ ${t('notifications.newCommission')}` : `💰 ${t('notifications.newTransaction')}`
      const message = isBarber
        ? t('notifications.commissionMsg', { customer: data.customerName, amount: formatRupiah(data.total), branch: data.branchName })
        : t('notifications.transactionMsg', { customer: data.customerName, amount: formatRupiah(data.total), method: data.paymentMethod || 'cash', branch: data.branchName })

      addNotification({
        type: 'transaction',
        title,
        message,
        tenantId: data.tenantId,
        branchId: data.branchId,
        refId: data.id,
        severity: 'success',
      })
      // Toast popup supaya benar-benar terlihat (sebelumnya hanya masuk lonceng).
      toast.success(`${title} — ${message}`, 4000)
    }

    // Filter relevansi event antrian per role.
    // - super_admin/tenant_admin: semua event di tenant
    // - kasir: hanya event di branch mereka
    // - barber: hanya event yang barberId-nya = user.id (assigned ke mereka)
    const isRelevantQueueEvent = (entry) => {
      if (!entry) return false
      if (user.role === 'barber') return entry.barberId === user.id
      if (user.role === 'kasir') return entry.branchId === user.branchId
      // super_admin/tenant_admin: scope ke tenant mereka
      if (user.tenantId && entry.tenantId && entry.tenantId !== user.tenantId) return false
      return true
    }

    const ticketStr = (e) =>
      e?.queueNumber != null ? `A${String(e.queueNumber).padStart(3, '0')}` : (e?.id || '').slice(-6).toUpperCase()

    const handleQueueCreated = (entry) => {
      if (!isRelevantQueueEvent(entry)) return
      const title = `🔔 ${t('notifications.newQueue')}`
      const message = t('notifications.queueJoinedMsg', { ticket: ticketStr(entry), customer: entry.customerName || t('notifications.aCustomer') })
      addNotification({
        type: 'queue', title, message, severity: 'info',
        tenantId: entry.tenantId, branchId: entry.branchId, refId: entry.id,
      })
      toast.info(`${title} — ${message}`, 4000)
    }

    const STATUS_TEXT = {
      waiting:     t('notifications.statusWaiting'),
      in_progress: t('notifications.statusInProgress'),
      done:        t('notifications.statusDone'),
      paid:        t('notifications.statusPaid'),
      cancelled:   t('notifications.statusCancelled'),
    }

    // Pakai cache lokal supaya tidak duplikat toast pada update yang
    // tidak mengubah status (mis. reorder).
    const statusCache = new Map() // queueId -> last status
    const handleQueueUpdated = (entry) => {
      if (!isRelevantQueueEvent(entry)) return
      const prev = statusCache.get(entry.id)
      statusCache.set(entry.id, entry.status)
      if (prev === entry.status) return
      const label = STATUS_TEXT[entry.status] || entry.status
      const title = entry.status === 'paid' ? `💰 ${t('notifications.paymentDone')}`
        : entry.status === 'in_progress' ? `✂️ ${t('notifications.serviceStarted')}`
        : entry.status === 'done' ? `✅ ${t('notifications.serviceDone')}`
        : `📌 ${t('notifications.queueStatus')}`
      const message = `${ticketStr(entry)} · ${entry.customerName || t('notifications.aCustomer')} ${label}`
      addNotification({
        type: 'queue', title, message,
        severity: entry.status === 'paid' ? 'success' : 'info',
        tenantId: entry.tenantId, branchId: entry.branchId, refId: entry.id,
      })
      const variant = entry.status === 'paid' ? 'success' : entry.status === 'cancelled' ? 'warning' : 'info'
      toast[variant](`${title} — ${message}`, 4000)
    }

    const handleQueueDeleted = (entry) => {
      if (!isRelevantQueueEvent(entry)) return
      const title = `⚠️ ${t('notifications.queueCancelled')}`
      const message = `${ticketStr(entry)} · ${entry.customerName || t('notifications.aCustomer')}`
      addNotification({
        type: 'queue', title, message, severity: 'warning',
        tenantId: entry.tenantId, branchId: entry.branchId, refId: entry.id,
      })
      toast.warning(`${title} — ${message}`, 4000)
    }

    // ── Booking lifecycle ──────────────────────────────────────────────────
    // Tujuan: kasir & barber yang ditugaskan dapat notifikasi saat ada booking
    // baru, status berubah, atau booking dibatalkan.
    const isRelevantBookingEvent = (b) => {
      if (!b) return false
      if (user.role === 'barber') return b.barberId === user.id
      if (user.role === 'kasir') return b.branchId === user.branchId
      if (user.tenantId && b.tenantId && b.tenantId !== user.tenantId) return false
      return true
    }
    const bookingIdShort = (b) => `#${(b?.id || '').slice(-6).toUpperCase()}`
    const bookingWhen = (b) => {
      if (!b?.date) return ''
      try {
        const [y, m, d] = String(b.date).split('-').map(Number)
        const dd = String(d).padStart(2, '0')
        const mm = String(m).padStart(2, '0')
        return `${dd}/${mm} ${b.time || ''}`.trim()
      } catch { return `${b.date} ${b.time || ''}` }
    }

    const handleBookingCreated = (b) => {
      if (!isRelevantBookingEvent(b)) return
      const title = `📅 ${t('notifications.newBooking')}`
      const message = `${b.customerName || t('notifications.aCustomer')} — ${b.serviceName || t('notifications.aService')} (${bookingWhen(b)}) ${bookingIdShort(b)}`
      addNotification({
        type: 'booking', title, message, severity: 'info',
        tenantId: b.tenantId, branchId: b.branchId, refId: b.id,
      })
      toast.info(`${title} — ${b.customerName}`, 4000)
    }

    const BOOKING_STATUS_TEXT = {
      pending:     t('notifications.bookingPending'),
      confirmed:   t('notifications.bookingConfirmed'),
      in_progress: t('notifications.bookingInProgress'),
      done:        t('notifications.bookingDone'),
      cancelled:   t('notifications.bookingCancelled'),
    }
    const bookingStatusCache = new Map()
    const handleBookingUpdated = (b) => {
      if (!isRelevantBookingEvent(b)) return
      const prev = bookingStatusCache.get(b.id)
      bookingStatusCache.set(b.id, b.status)
      if (prev === b.status) return
      // Skip notifikasi 'in_progress' — selalu pair dengan queue:created
      // ("Antrian Baru") yang sudah membuat toast & lonceng. Tanpa guard ini,
      // user lihat 2 popup identik per check-in (manual & cron auto-checkin).
      // Status lain (confirmed/cancelled/done) tetap di-notif karena event
      // booking-specific yang tak selalu punya pair queue event.
      if (b.status === 'in_progress') return
      const label = BOOKING_STATUS_TEXT[b.status] || b.status
      const title = b.status === 'cancelled' ? `⚠️ ${t('notifications.bookingCancelledTitle')}`
        : b.status === 'confirmed' ? `✅ ${t('notifications.bookingConfirmedTitle')}`
        : b.status === 'in_progress' ? `🚪 ${t('notifications.bookingCheckinTitle')}`
        : b.status === 'done' ? `✨ ${t('notifications.bookingDoneTitle')}`
        : `📌 ${t('notifications.bookingStatusTitle')}`
      const message = `${b.customerName || t('notifications.aCustomer')} ${label} ${bookingIdShort(b)}`
      addNotification({
        type: 'booking', title, message,
        severity: b.status === 'cancelled' ? 'warning' : b.status === 'done' ? 'success' : 'info',
        tenantId: b.tenantId, branchId: b.branchId, refId: b.id,
      })
      const variant = b.status === 'cancelled' ? 'warning'
        : b.status === 'confirmed' || b.status === 'done' ? 'success'
        : 'info'
      toast[variant](`${title} — ${b.customerName}`, 3500)
    }

    socket.on('transaction:created', handleTransactionCreated)
    socket.on('queue:created', handleQueueCreated)
    socket.on('queue:updated', handleQueueUpdated)
    socket.on('queue:deleted', handleQueueDeleted)
    socket.on('booking:created', handleBookingCreated)
    socket.on('booking:updated', handleBookingUpdated)
    return () => {
      socket.off('transaction:created', handleTransactionCreated)
      socket.off('queue:created', handleQueueCreated)
      socket.off('queue:updated', handleQueueUpdated)
      socket.off('queue:deleted', handleQueueDeleted)
      socket.off('booking:created', handleBookingCreated)
      socket.off('booking:updated', handleBookingUpdated)
      // Tidak otomatis leaveBranchRoom — biarkan socket tetap di room
      // sampai user logout (auth:logout listener di socket.js akan close).
    }
  }, [user, addNotification, toast, t])

  // Swipe navigation
  const getNavRoutes = () => {
    if (!user) return []
    const config = navConfigs[user.role]
    if (!config) return []
    if (typeof config === 'function') return config(user)
    return config
  }

  const navRoutes = getNavRoutes()
  const currentIdx = navRoutes.findIndex(r => location.pathname.startsWith(r))

  const swipeHandlers = useSwipe({
    onSwipeLeft: () => {
      if (currentIdx >= 0 && currentIdx < navRoutes.length - 1) {
        navigate(navRoutes[currentIdx + 1])
      }
    },
    onSwipeRight: () => {
      if (currentIdx > 0) {
        navigate(navRoutes[currentIdx - 1])
      }
    },
    threshold: 60,
  })

  return (
    <div className="min-h-screen bg-dark flex flex-col">
      {/* Impersonation Banner */}
      {impersonating && (
        <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-3 px-4 py-2 bg-red-600 text-white text-sm font-medium shadow-lg">
          <div className="flex items-center gap-2">
            <ShieldAlert size={15} />
            <span>{t('layout.impersonationPrefix')} <strong>{user?.name}</strong> ({user?.tenantId})</span>
          </div>
          <button
            onClick={() => { const path = stopImpersonation(); navigate(path) }}
            className="px-3 py-1 bg-white text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 transition-colors flex-shrink-0"
          >
            {t('layout.exitImpersonation')}
          </button>
        </div>
      )}

      {/* PWA Install Banner */}
      <AnimatePresence>
        {showPwaBanner && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-3 px-4 py-2.5 bg-brand text-dark text-sm font-medium shadow-lg"
          >
            <div className="flex items-center gap-2">
              <Download size={15} />
              <span>{t('layout.pwaBanner')}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleInstallPwa}
                className="px-3 py-1 bg-dark text-brand rounded-lg text-xs font-semibold hover:bg-dark-surface transition-colors"
              >
                {t('layout.install')}
              </button>
              <button onClick={dismissPwaBanner} className="p-1 hover:bg-dark/10 rounded-lg transition-colors">
                <X size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline Banner */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ y: -40 }}
            animate={{ y: 0 }}
            exit={{ y: -40 }}
            className="bg-amber-900/90 border-b border-amber-600/50 px-4 py-2 flex items-center gap-2 text-sm text-amber-200 z-[9998] relative"
          >
            <WifiOff size={16} className="text-amber-400 flex-shrink-0" />
            {t('layout.offlineBanner')}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar */}
        {isDesktop && <Sidebar onSearchClick={() => setCmdOpen(true)} />}

        {/* Mobile sidebar overlay */}
        <AnimatePresence>
          {!isDesktop && mobileSidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/50"
                onClick={() => setMobileSidebarOpen(false)}
              />
              <motion.div
                initial={{ x: -240 }}
                animate={{ x: 0 }}
                exit={{ x: -240 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed left-0 top-0 h-full z-50"
              >
                <Sidebar
                  onSearchClick={() => { setCmdOpen(true); setMobileSidebarOpen(false) }}
                  onNavigate={() => setMobileSidebarOpen(false)}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Main content */}
        <div className={`flex-1 flex flex-col min-w-0 ${isDesktop ? 'ml-[240px]' : ''}`}>
          {/* TopBar */}
          <TopBar
            onMenuClick={!isDesktop ? () => setMobileSidebarOpen(true) : undefined}
            onSearchClick={() => setCmdOpen(true)}
          />

          {/* Page content */}
          <main
            id="main-content"
            className={`flex-1 overflow-x-hidden ${!isDesktop ? 'pb-20' : ''} ${isDesktop ? 'p-6' : 'p-4'}`}
            {...(!isDesktop ? swipeHandlers : {})}
          >
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Outlet />
            </motion.div>
          </main>
        </div>

        {/* Mobile Bottom Navigation */}
        {!isDesktop && <BottomNav onMoreClick={() => setMobileSidebarOpen(true)} />}
      </div>

      {/* Command Palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  )
}

export default AppLayout
