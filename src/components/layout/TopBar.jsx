import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell, Search, Menu, Scissors, ChevronDown } from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useNotificationStore } from '../../store/notificationStore.js'
import { useBroadcasts } from '../../hooks/useBroadcasts.js'
import { NotificationDrawer } from '../ui/NotificationDrawer.jsx'

const pageTitleKeys = {
  '/super-admin/dashboard': 'nav.dashboard',
  '/super-admin/tenants':   'nav.tenants',
  '/admin/dashboard':       'nav.dashboard',
  '/admin/branches':        'nav.branches',
  '/admin/services':        'nav.services',
  '/admin/staff':           'nav.staff',
  '/admin/customers':       'nav.customers',
  '/admin/reports':         'nav.reports',
  '/admin/settings':        'nav.settings',
  '/admin/schedule':        'nav.schedule',
  '/admin/vouchers':        'nav.vouchers',
  '/admin/comparison':      'nav.comparison',
  '/admin/tickets':         'nav.tickets',
  '/admin/billing':         'nav.billing',
  '/admin/wilayah-report':  'nav.wilayahReport',
  '/admin/expenses':        'nav.expenses',
  '/kasir/pos':             'nav.pos',
  '/kasir/queue':           'nav.queue',
  '/kasir/bookings':        'nav.booking',
  '/kasir/customers':       'nav.customers',
  '/kasir/transactions':    'nav.transactions',
  '/kasir/shift-closing':   'nav.shiftClose',
  '/barber/dashboard':      'nav.dashboard',
  '/barber/queue':          'nav.queue',
  '/barber/commission':     'nav.commission',
  '/customer/booking':      'nav.booking',
  '/customer/history':      'nav.history',
  '/customer/loyalty':      'nav.loyalty',
}

// Inisial nama untuk avatar — 1-2 huruf kapital, fallback "?" kalau kosong.
function initialsOf(name) {
  if (!name) return '?'
  const parts = String(name).trim().split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() || '').join('') || '?'
}

export const TopBar = ({ onMenuClick, onSearchClick }) => {
  const { user } = useAuthStore()
  const { getUnreadCount } = useNotificationStore()
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen] = useState(false)

  const profilePath = user?.role === 'super_admin' ? '/super-admin/profile'
    : user?.role === 'tenant_admin' ? '/admin/settings'
    : null

  const { data: broadcasts = [] } = useBroadcasts(user?.tenantId)

  const unreadNotifs     = user?.tenantId ? getUnreadCount(user.tenantId) : 0
  const unreadBroadcasts = broadcasts.filter(b => b.active && !b.read?.includes(user?.tenantId)).length
  const totalUnread      = unreadNotifs + unreadBroadcasts

  const getPageTitle = () => {
    const path = location.pathname
    for (const [key, tkey] of Object.entries(pageTitleKeys)) {
      if (path.endsWith(key)) return t(tkey)
    }
    return 'SembaPOS'
  }

  const firstName = user?.name?.split(/\s+/)[0] || 'Pengguna'

  return (
    <>
      <header
        className="
          h-14 flex items-center justify-between px-4 gap-3 sticky top-0 z-30
          bg-dark-surface border-b border-dark-border
          relative
        "
      >
        {/* Aksen brand 2px di bawah header (modern SaaS) — selalu ada,
            tanpa mengganggu border bawah utama. */}
        <span
          aria-hidden="true"
          className="absolute left-0 bottom-[-1px] h-[2px] w-24 bg-brand rounded-r-full"
        />

        {/* ── Kiri: menu (mobile) + breadcrumb/title ──────────────────── */}
        <div className="flex items-center gap-2 min-w-0">
          {onMenuClick && (
            <button
              type="button"
              onClick={onMenuClick}
              className="p-2 -ml-1 rounded-lg text-muted hover:text-off-white hover:bg-dark-card transition-colors flex-shrink-0"
              aria-label="Buka menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          {/* Breadcrumb compact + brand mark */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-md bg-brand-gradient flex items-center justify-center flex-shrink-0 shadow-brand">
              <Scissors className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="hidden sm:inline text-xs text-muted">Beranda</span>
            <ChevronDown className="hidden sm:inline w-3 h-3 text-muted/60 -rotate-90" aria-hidden="true" />
            <h1 className="font-display font-semibold text-off-white truncate">
              {getPageTitle()}
            </h1>
          </div>
        </div>

        {/* ── Kanan: search · bell · user ───────────────────────────── */}
        <div className="flex items-center gap-1">
          {onSearchClick && (
            <button
              type="button"
              onClick={onSearchClick}
              className="
                hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg
                bg-dark-card border border-dark-border
                text-xs text-muted hover:text-off-white hover:border-brand/40
                transition-all min-w-[200px]
              "
              title={`${t('common.search')} (Ctrl+K)`}
            >
              <Search className="w-3.5 h-3.5" />
              <span className="flex-1 text-left">Cari di mana saja…</span>
              <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-dark-surface border border-dark-border text-muted">⌘K</kbd>
            </button>
          )}
          {/* Search ikon-only di sempit (mobile) */}
          {onSearchClick && (
            <button
              type="button"
              onClick={onSearchClick}
              className="md:hidden p-2 rounded-lg text-muted hover:text-off-white hover:bg-dark-card transition-colors"
              title={`${t('common.search')} (Ctrl+K)`}
              aria-label="Cari"
            >
              <Search className="w-5 h-5" />
            </button>
          )}

          {/* Notifikasi */}
          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            className="p-2 rounded-lg text-muted hover:text-off-white hover:bg-dark-card transition-colors relative"
            aria-label="Notifikasi"
          >
            <Bell className="w-5 h-5" />
            {totalUnread > 0 && (
              <span
                className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white px-0.5"
                style={{ boxShadow: '0 0 0 2px var(--tw-bg-opacity, transparent)' }}
              >
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </button>

          {/* User button — avatar + nama + chevron (terlihat seperti dropdown
              trigger; click → profile bila profilePath ada, kalau tidak ya
              no-op visual). Di mobile ikon-only. */}
          <button
            type="button"
            onClick={profilePath ? () => navigate(profilePath) : undefined}
            className={`
              flex items-center gap-2 pl-1 pr-2 py-1 rounded-full
              border border-transparent
              ${profilePath
                ? 'hover:border-brand/40 hover:bg-dark-card cursor-pointer'
                : 'cursor-default'}
              transition-all
            `}
            title={profilePath ? 'Profil & Pengaturan' : user?.name}
            aria-label="Akun pengguna"
          >
            <div
              className="w-8 h-8 rounded-full bg-brand-gradient flex items-center justify-center flex-shrink-0 shadow-brand text-white font-bold text-xs"
              aria-hidden="true"
            >
              {initialsOf(user?.name)}
            </div>
            <span className="hidden sm:inline text-sm font-semibold text-off-white truncate max-w-[120px]">
              {firstName}
            </span>
            {profilePath && (
              <ChevronDown className="hidden sm:inline w-3.5 h-3.5 text-muted flex-shrink-0" aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      <NotificationDrawer
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        tenantId={user?.tenantId}
      />
    </>
  )
}

export default TopBar
