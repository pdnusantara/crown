import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, Building2, BarChart3, Settings,
  CreditCard, ListOrdered, CalendarDays, Receipt,
  Star, TrendingUp, DollarSign, MessageSquare, Menu, Fingerprint, Users,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useTicketStats } from '../../hooks/useTickets.js'
import { useFeatureFlags } from '../../hooks/useFeatureFlags.js'
import { getBranchSlug } from '../../utils/branchSlug.js'

const navConfig = {
  super_admin: [
    { labelKey: 'nav.dashboard', icon: LayoutDashboard, path: '/super-admin/dashboard' },
    { labelKey: 'nav.tenants',   icon: Building2,       path: '/super-admin/tenants' },
    { labelKey: 'nav.billing',   icon: DollarSign,      path: '/super-admin/billing' },
    { labelKey: 'nav.tickets',   icon: MessageSquare,   path: '/super-admin/tickets', badge: 'tickets' },
  ],
  tenant_admin: () => [
    { labelKey: 'nav.dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
    { labelKey: 'nav.services',  icon: Settings,        path: '/admin/services' },
    { labelKey: 'nav.staff',     icon: Building2,       path: '/admin/staff' },
    { labelKey: 'nav.reports',   icon: BarChart3,       path: '/admin/reports' },
  ],
  kasir: (user) => {
    const slug = getBranchSlug(user)
    return [
      { labelKey: 'nav.pos',          icon: CreditCard,    path: `/${slug}/kasir/pos` },
      { labelKey: 'nav.queue',        icon: ListOrdered,   path: `/${slug}/kasir/queue` },
      { labelKey: 'nav.booking',      icon: CalendarDays,  path: `/${slug}/kasir/bookings` },
      { labelKey: 'nav.customers',    icon: Users,         path: `/${slug}/kasir/customers` },
      { labelKey: 'nav.transactions', icon: Receipt,       path: `/${slug}/kasir/transactions` },
    ]
  },
  barber: () => [
    { labelKey: 'nav.dashboard',  icon: LayoutDashboard, path: '/barber/dashboard' },
    { labelKey: 'nav.queue',      icon: ListOrdered,     path: '/barber/queue' },
    { labelKey: 'nav.commission', icon: TrendingUp,      path: '/barber/commission' },
    { labelKey: 'nav.attendance', icon: Fingerprint,     path: '/barber/attendance', flag: 'attendance' },
  ],
  customer: [
    { labelKey: 'nav.booking', icon: CalendarDays, path: '/customer/booking' },
    { labelKey: 'nav.history', icon: Receipt,      path: '/customer/history' },
    { labelKey: 'nav.loyalty', icon: Star,         path: '/customer/loyalty' },
  ],
}

// Peran yang sidebar-nya jauh lebih panjang dari bottom bar — beri tab "Lainnya"
// agar seluruh menu tetap terjangkau di mobile tanpa membuka hamburger TopBar.
const ROLES_WITH_MORE = ['super_admin', 'tenant_admin', 'kasir', 'barber']

// Kerangka satu tab — dipakai NavLink (rute) maupun tombol "Lainnya".
// Modernisasi Fase B: aksen aktif pakai brand indigo (bukan gold), strip kecil
// di ATAS tab sebagai indicator (visual lebih modern dari dot di bawah).
function TabIcon({ icon: Icon, active, badge }) {
  return (
    <div className={`relative p-1.5 rounded-xl transition-all ${active ? 'bg-brand/15' : ''}`}>
      <Icon className="w-5 h-5" />
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </div>
  )
}

export const BottomNav = ({ onMoreClick }) => {
  const { user } = useAuthStore()
  const { t } = useTranslation()
  const location = useLocation()

  // Badge jumlah tiket terbuka — hanya super_admin & tenant_admin yang punya
  // endpoint /tickets/stats; peran lain skip agar tidak memicu 403.
  const ticketStatsEnabled = user?.role === 'super_admin' || user?.role === 'tenant_admin'
  const { data: ticketStats } = useTicketStats({}, ticketStatsEnabled)
  // Item ber-`flag` hanya tampil bila fitur paket tenant mengaktifkannya.
  const { data: enabledFlags = [] } = useFeatureFlags(user?.tenantId)

  if (!user) return null

  const config = navConfig[user.role]
  const rawItems = typeof config === 'function' ? config(user) : config || []
  const navItems = rawItems.filter((i) => !i.flag || enabledFlags.includes(i.flag))
  const showMore = ROLES_WITH_MORE.includes(user.role) && typeof onMoreClick === 'function'

  const openTickets = ticketStatsEnabled ? (ticketStats?.open || 0) : 0
  const badgeFor = (item) => (item.badge === 'tickets' ? openTickets : 0)

  // "Lainnya" tersorot saat halaman aktif tidak termasuk salah satu tab utama.
  const inMore = showMore && !navItems.some(i => location.pathname.startsWith(i.path))

  const tabClass = (active) => `
    relative flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2 px-1 transition-all
    ${active ? 'text-brand-strong dark:text-brand-light font-semibold' : 'text-muted hover:text-off-white'}
  `

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-dark-surface border-t border-dark-border">
      <div className="flex items-stretch justify-around px-1 py-1 pb-safe">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => tabClass(isActive)}
          >
            {({ isActive }) => (
              <>
                {/* Strip aksen 2px di atas tab saat aktif (modern Linear-style),
                    menggantikan dot di bawah. */}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-brand rounded-b-full"
                  />
                )}
                <TabIcon icon={item.icon} active={isActive} badge={badgeFor(item)} />
                <span className="text-[11px] font-medium truncate max-w-full">
                  {t(item.labelKey)}
                </span>
              </>
            )}
          </NavLink>
        ))}

        {showMore && (
          <button
            type="button"
            onClick={onMoreClick}
            aria-label={t('common.more')}
            className={tabClass(inMore)}
          >
            {inMore && (
              <span
                aria-hidden="true"
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-brand rounded-b-full"
              />
            )}
            <TabIcon icon={Menu} active={inMore} badge={0} />
            <span className="text-[11px] font-medium truncate max-w-full">
              {t('common.more')}
            </span>
          </button>
        )}
      </div>
    </nav>
  )
}

export default BottomNav
