import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell, Search, Menu, Scissors } from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useTenantStore } from '../../store/tenantStore.js'
import { useNotificationStore } from '../../store/notificationStore.js'
import { useBroadcasts } from '../../hooks/useBroadcasts.js'
import { NotificationDrawer } from '../ui/NotificationDrawer.jsx'
import Avatar from '../ui/Avatar.jsx'

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
  '/kasir/transactions':    'nav.transactions',
  '/kasir/shift-closing':   'nav.shiftClose',
  '/barber/dashboard':      'nav.dashboard',
  '/barber/queue':          'nav.queue',
  '/barber/commission':     'nav.commission',
  '/customer/booking':      'nav.booking',
  '/customer/history':      'nav.history',
  '/customer/loyalty':      'nav.loyalty',
}

export const TopBar = ({ onMenuClick, onSearchClick }) => {
  const { user } = useAuthStore()
  const { getTenantById } = useTenantStore()
  const { getUnreadCount } = useNotificationStore()
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen] = useState(false)

  const profilePath = user?.role === 'super_admin' ? '/super-admin/profile'
    : user?.role === 'tenant_admin' ? '/admin/settings'
    : user?.role === 'kasir' ? null
    : user?.role === 'barber' ? null
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
    return 'BarberOS'
  }

  return (
    <>
      <header className="h-14 bg-dark-surface border-b border-dark-border flex items-center justify-between px-4 gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="p-2 rounded-lg text-muted hover:text-off-white hover:bg-dark-card transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gold flex items-center justify-center">
              <Scissors className="w-3.5 h-3.5 text-dark" />
            </div>
            <h1 className="font-display font-semibold text-off-white">{getPageTitle()}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onSearchClick && (
            <button
              onClick={onSearchClick}
              className="p-2 rounded-lg text-muted hover:text-off-white hover:bg-dark-card transition-colors"
              title={`${t('common.search')} (Ctrl+K)`}
            >
              <Search className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => setNotifOpen(true)}
            className="p-2 rounded-lg text-muted hover:text-off-white hover:bg-dark-card transition-colors relative"
            aria-label="Notifikasi"
          >
            <Bell className="w-5 h-5" />
            {totalUnread > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white px-0.5">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </button>
          <button
            onClick={profilePath ? () => navigate(profilePath) : undefined}
            className={`rounded-full transition-opacity ${profilePath ? 'hover:opacity-75 cursor-pointer' : 'cursor-default'}`}
            title={profilePath ? 'Profil & Pengaturan' : undefined}
          >
            <Avatar name={user?.name} size="sm" />
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
