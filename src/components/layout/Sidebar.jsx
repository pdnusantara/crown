import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Building2, Scissors, Users, BarChart3,
  Settings, CreditCard, ListOrdered, CalendarDays, Receipt,
  Star, TrendingUp, LogOut, Sun, Moon, Search, LogIn, Languages,
  Tag, GitCompare, Megaphone, Flag, MessageSquare, Activity,
  PieChart, UserCircle, DollarSign, Package, ShieldAlert, MapPin,
  ChevronRight, Wallet,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useTenantStore } from '../../store/tenantStore.js'
import { useThemeStore } from '../../store/themeStore.js'
import { useTicketStore } from '../../store/ticketStore.js'
import { useSubscriptionStore } from '../../store/subscriptionStore.js'
import { useErrorLogStats } from '../../hooks/useErrorLogs.js'
import { useTranslation } from 'react-i18next'
import Avatar from '../ui/Avatar.jsx'

const navConfig = {
  super_admin: [
    { labelKey: 'nav.dashboard',    icon: LayoutDashboard, path: '/super-admin/dashboard' },
    { labelKey: 'nav.tenants',      icon: Building2,       path: '/super-admin/tenants' },
    { labelKey: 'nav.packages',     icon: Package,         path: '/super-admin/packages' },
    { labelKey: 'nav.billing',      icon: DollarSign,      path: '/super-admin/billing' },
    { labelKey: 'nav.broadcast',    icon: Megaphone,       path: '/super-admin/broadcast' },
    { labelKey: 'nav.featureFlags', icon: Flag,            path: '/super-admin/feature-flags' },
    { labelKey: 'nav.tickets',      icon: MessageSquare,   path: '/super-admin/tickets', badge: 'tickets' },
    { labelKey: 'nav.activityLog',  icon: Activity,        path: '/super-admin/activity-log' },
    { labelKey: 'nav.errorLogs',    icon: ShieldAlert,     path: '/super-admin/error-logs', badge: 'errorLogs' },
    { labelKey: 'nav.usage',        icon: PieChart,        path: '/super-admin/usage' },
    { labelKey: 'nav.profile',      icon: UserCircle,      path: '/super-admin/profile' },
  ],
  tenant_admin: () => [
    { labelKey: 'nav.dashboard',  icon: LayoutDashboard, path: '/admin/dashboard' },
    { labelKey: 'nav.branches',   icon: Building2,       path: '/admin/branches' },
    { labelKey: 'nav.services',   icon: Scissors,        path: '/admin/services' },
    { labelKey: 'nav.staff',      icon: Users,           path: '/admin/staff', badge: 'lowstock' },
    { labelKey: 'nav.customers',  icon: Star,            path: '/admin/customers' },
    { labelKey: 'nav.reports',    icon: BarChart3,       path: '/admin/reports' },
    { labelKey: 'nav.schedule',   icon: CalendarDays,    path: '/admin/schedule' },
    { labelKey: 'nav.vouchers',   icon: Tag,             path: '/admin/vouchers' },
    { labelKey: 'nav.comparison',    icon: GitCompare,    path: '/admin/comparison' },
    { labelKey: 'nav.wilayahReport', icon: MapPin,        path: '/admin/wilayah-report' },
    { labelKey: 'nav.expenses',      icon: Wallet,        path: '/admin/expenses' },
    { labelKey: 'nav.tickets',       icon: MessageSquare, path: '/admin/tickets', badge: 'ta_tickets' },
    { labelKey: 'nav.billing',       icon: CreditCard,    path: '/admin/billing' },
    { labelKey: 'nav.settings',      icon: Settings,      path: '/admin/settings' },
  ],
  kasir: (user) => [
    { labelKey: 'nav.pos',          icon: CreditCard,    path: `/${user.branchId}/kasir/pos` },
    { labelKey: 'nav.queue',        icon: ListOrdered,   path: `/${user.branchId}/kasir/queue` },
    { labelKey: 'nav.booking',      icon: CalendarDays,  path: `/${user.branchId}/kasir/bookings` },
    { labelKey: 'nav.transactions', icon: Receipt,       path: `/${user.branchId}/kasir/transactions` },
    { labelKey: 'nav.shiftClose',   icon: LogIn,         path: `/${user.branchId}/kasir/shift-closing` },
  ],
  barber: () => [
    { labelKey: 'nav.dashboard',  icon: LayoutDashboard, path: '/barber/dashboard' },
    { labelKey: 'nav.queue',      icon: ListOrdered,     path: '/barber/queue' },
    { labelKey: 'nav.commission', icon: TrendingUp,      path: '/barber/commission' },
  ],
  customer: [
    { labelKey: 'nav.booking', icon: CalendarDays, path: '/customer/booking' },
    { labelKey: 'nav.history', icon: Receipt,      path: '/customer/history' },
    { labelKey: 'nav.loyalty', icon: Star,         path: '/customer/loyalty' },
  ],
}

export const Sidebar = ({ collapsed = false, onSearchClick }) => {
  const { user, logout } = useAuthStore()
  const { getTenantById, getLowStockProducts } = useTenantStore()
  const { theme, toggleTheme } = useThemeStore()
  const { getOpenCount, getByTenant: getTicketsByTenant } = useTicketStore()
  const { getByTenant: getSubscription } = useSubscriptionStore()
  const navigate = useNavigate()
  const { data: errorStats } = useErrorLogStats(user?.role === 'super_admin')
  const lowStockCount  = user?.tenantId ? (getLowStockProducts(user.tenantId)?.length || 0) : 0
  const openTickets    = user?.role === 'super_admin' ? getOpenCount() : 0
  const tenantOpenTickets = user?.tenantId ? (getTicketsByTenant(user.tenantId)?.filter(t => t.status === 'open').length || 0) : 0
  const unresolvedErrors = user?.role === 'super_admin' ? (errorStats?.unresolved || 0) : 0
  const { i18n, t } = useTranslation()
  const toggleLang = () => i18n.changeLanguage(i18n.language === 'id' ? 'en' : 'id')

  if (!user) return null

  const tenant = user.tenantId ? getTenantById(user.tenantId) : null
  const subscription = user.role === 'tenant_admin' && user.tenantId ? getSubscription(user.tenantId) : null
  const daysLeft = subscription?.endDate
    ? Math.ceil((new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24))
    : null
  const subExpired = subscription?.status === 'overdue' || (daysLeft !== null && daysLeft <= 0)
  const subWarning = !subExpired && daysLeft !== null && daysLeft <= 7

  const profilePath = user.role === 'super_admin' ? '/super-admin/profile'
    : user.role === 'tenant_admin' ? '/admin/billing'
    : null

  const getNavItems = () => {
    const config = navConfig[user.role]
    if (!config) return []
    if (typeof config === 'function') return config(user)
    return config
  }

  const navItems = getNavItems()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className={`
      fixed top-0 left-0 h-screen z-40
      bg-dark-surface border-r border-dark-border
      flex flex-col
      transition-all duration-300
      ${collapsed ? 'w-16' : 'w-[240px]'}
    `}>
      {/* Logo */}
      <div className="flex-shrink-0 px-6 py-5 border-b border-dark-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gold flex items-center justify-center flex-shrink-0">
            <Scissors className="w-5 h-5 text-dark" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="font-display font-bold text-off-white text-lg leading-tight gold-text">
                BARBER OS
              </h1>
              {tenant && (
                <p className="text-xs text-muted leading-tight mt-0.5">{tenant.name}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map(item => {
            const isLowStockBadge   = item.badge === 'lowstock'   && lowStockCount > 0
            const isTicketsBadge    = item.badge === 'tickets'    && openTickets > 0
            const isTATicketsBadge  = item.badge === 'ta_tickets' && tenantOpenTickets > 0
            const isErrorLogsBadge  = item.badge === 'errorLogs'  && unresolvedErrors > 0
            const badgeCount        = isLowStockBadge ? lowStockCount : isTicketsBadge ? openTickets : isTATicketsBadge ? tenantOpenTickets : isErrorLogsBadge ? unresolvedErrors : 0
            const showBadge       = badgeCount > 0
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) => `
                    sidebar-link
                    ${isActive ? 'active' : ''}
                    ${collapsed ? 'justify-center px-3' : ''}
                  `}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span className="flex-1">{t(item.labelKey)}</span>}
                  {showBadge && !collapsed && (
                    <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                      {badgeCount}
                    </span>
                  )}
                  {showBadge && collapsed && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Search shortcut */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <button
            onClick={onSearchClick}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-dark-border text-muted hover:border-gold/30 hover:text-off-white transition-all text-sm"
          >
            <Search className="w-4 h-4" />
            <span className="flex-1 text-left">{t('common.search')}...</span>
            <kbd className="text-xs bg-dark-card border border-dark-border rounded px-1.5 py-0.5">⌘K</kbd>
          </button>
        </div>
      )}

      {/* Bottom controls */}
      <div className="flex-shrink-0 px-3 py-3 border-t border-dark-border space-y-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-dark-border text-muted hover:text-off-white hover:border-gold/30 transition-all text-sm ${collapsed ? 'justify-center' : ''}`}
          title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 flex-shrink-0" /> : <Moon className="w-4 h-4 flex-shrink-0" />}
          {!collapsed && <span>{theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}</span>}
        </button>

        {/* Language toggle */}
        <button
          onClick={toggleLang}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-dark-border text-muted hover:text-off-white hover:border-gold/30 transition-all text-sm ${collapsed ? 'justify-center' : ''}`}
          title="Toggle Language"
        >
          <Languages className="w-4 h-4 flex-shrink-0" />
          {!collapsed && (
            <span className="flex-1 text-left">
              {i18n.language === 'id' ? '🇮🇩 Bahasa Indonesia' : '🇬🇧 English'}
            </span>
          )}
        </button>

        {/* User profile */}
        {!collapsed ? (
          <div className="rounded-xl bg-dark-card border border-dark-border overflow-hidden">
            {/* Package badge — tenant_admin only */}
            {subscription && (
              <button
                onClick={() => navigate('/admin/billing')}
                className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 border-b border-dark-border text-xs transition-colors hover:bg-dark-surface group ${
                  subExpired ? 'text-red-400' : subWarning ? 'text-amber-400' : 'text-muted'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                    subExpired ? 'bg-red-500/15 text-red-400' :
                    subWarning ? 'bg-amber-400/15 text-amber-400' :
                    'bg-gold/15 text-gold'
                  }`}>
                    {subscription.package}
                  </span>
                  <span>
                    {subExpired ? 'Langganan kadaluarsa' :
                     subWarning ? `${daysLeft} hari lagi` :
                     `Aktif · ${daysLeft}h lagi`}
                  </span>
                </div>
                <ChevronRight className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
            {/* Profile row */}
            <div className="flex items-center gap-3 px-3 py-2.5">
              <button
                onClick={profilePath ? () => navigate(profilePath) : undefined}
                className={`flex items-center gap-3 flex-1 min-w-0 text-left ${profilePath ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
              >
                <Avatar name={user.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-off-white truncate">{user.name}</p>
                  <p className="text-xs text-muted capitalize">{user.role.replace('_', ' ')}</p>
                </div>
              </button>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-muted hover:text-red-400 transition-colors flex-shrink-0"
                title={t('nav.logout')}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            className="w-full flex justify-center p-2 rounded-xl text-muted hover:text-red-400 transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}

export default Sidebar
