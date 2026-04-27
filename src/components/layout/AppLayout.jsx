import React, { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Sidebar from './Sidebar.jsx'
import TopBar from './TopBar.jsx'
import BottomNav from './BottomNav.jsx'
import { CommandPalette } from '../ui/CommandPalette.jsx'
import { useAuthStore } from '../../store/authStore.js'
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js'
import { useSwipe } from '../../hooks/useSwipe.js'
import { Download, X, WifiOff, ShieldAlert } from 'lucide-react'

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
  kasir: (user) => [
    `/${user.branchId}/kasir/pos`,
    `/${user.branchId}/kasir/queue`,
    `/${user.branchId}/kasir/bookings`,
    `/${user.branchId}/kasir/transactions`,
  ],
  barber: () => [
    '/barber/dashboard',
    '/barber/queue',
    '/barber/commission',
  ],
  customer: () => ['/customer/booking', '/customer/history', '/customer/loyalty'],
}

export const AppLayout = () => {
  const { user, impersonating, stopImpersonation } = useAuthStore()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showPwaBanner, setShowPwaBanner] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const isOnline = useOnlineStatus()

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
            <span>Mode Impersonation — Anda melihat sebagai <strong>{user?.name}</strong> ({user?.tenantId})</span>
          </div>
          <button
            onClick={() => { const path = stopImpersonation(); navigate(path) }}
            className="px-3 py-1 bg-white text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 transition-colors flex-shrink-0"
          >
            Keluar dari Impersonation
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
            className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-3 px-4 py-2.5 bg-gold text-dark text-sm font-medium shadow-lg"
          >
            <div className="flex items-center gap-2">
              <Download size={15} />
              <span>Pasang BarberOS di HP kamu untuk pengalaman lebih baik!</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleInstallPwa}
                className="px-3 py-1 bg-dark text-gold rounded-lg text-xs font-semibold hover:bg-dark-surface transition-colors"
              >
                Pasang
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
            Mode offline — perubahan akan tersinkronisasi saat koneksi kembali
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
                <Sidebar onSearchClick={() => { setCmdOpen(true); setMobileSidebarOpen(false) }} />
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
        {!isDesktop && <BottomNav />}
      </div>

      {/* Command Palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  )
}

export default AppLayout
