import React from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  LayoutDashboard, Building2, BarChart3, Settings,
  CreditCard, ListOrdered, CalendarDays, Receipt,
  Star, TrendingUp,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'

const navConfig = {
  super_admin: [
    { labelKey: 'nav.dashboard', icon: LayoutDashboard, path: '/super-admin/dashboard' },
    { labelKey: 'nav.tenants',   icon: Building2,       path: '/super-admin/tenants' },
  ],
  tenant_admin: () => [
    { labelKey: 'nav.dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
    { labelKey: 'nav.services',  icon: Settings,        path: '/admin/services' },
    { labelKey: 'nav.staff',     icon: Building2,       path: '/admin/staff' },
    { labelKey: 'nav.reports',   icon: BarChart3,       path: '/admin/reports' },
  ],
  kasir: (user) => [
    { labelKey: 'nav.pos',          icon: CreditCard,    path: `/${user.branchId}/kasir/pos` },
    { labelKey: 'nav.queue',        icon: ListOrdered,   path: `/${user.branchId}/kasir/queue` },
    { labelKey: 'nav.booking',      icon: CalendarDays,  path: `/${user.branchId}/kasir/bookings` },
    { labelKey: 'nav.transactions', icon: Receipt,       path: `/${user.branchId}/kasir/transactions` },
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

export const BottomNav = () => {
  const { user } = useAuthStore()
  const { t } = useTranslation()
  if (!user) return null

  const config = navConfig[user.role]
  const navItems = typeof config === 'function' ? config(user) : config || []

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-dark-surface border-t border-dark-border">
      <div className="flex items-center justify-around px-2 py-1 pb-safe">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `
              flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all
              ${isActive
                ? 'text-gold'
                : 'text-muted hover:text-off-white'
              }
            `}
          >
            {({ isActive }) => (
              <>
                <div className={`relative p-1.5 rounded-xl transition-all ${isActive ? 'bg-gold/15' : ''}`}>
                  <item.icon className="w-5 h-5" />
                  {isActive && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-gold rounded-full" />
                  )}
                </div>
                <span className="text-xs font-medium">{t(item.labelKey)}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export default BottomNav
