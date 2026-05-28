import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Scissors, Users, BarChart3,
  Settings, CreditCard, ListOrdered, CalendarDays, Receipt,
  Star, TrendingUp, LogOut, Sun, Moon, Search, Languages,
  Tag, GitCompare, Megaphone, Flag, MessageSquare, Activity,
  PieChart, UserCircle, DollarSign, Package, ShieldAlert, MapPin,
  ChevronRight, Wallet, Landmark, LifeBuoy, Fingerprint, Handshake,
  Banknote, UserPlus, MessageCircle,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useTenantStore } from '../../store/tenantStore.js'
import { useThemeStore } from '../../store/themeStore.js'
import { useTicketStats } from '../../hooks/useTickets.js'
import { useSubscriptionStore } from '../../store/subscriptionStore.js'
import { useErrorLogStats } from '../../hooks/useErrorLogs.js'
import { useFeatureFlags } from '../../hooks/useFeatureFlags.js'
import { getBranchSlug } from '../../utils/branchSlug.js'
import { useTranslation } from 'react-i18next'

// ── Konfigurasi nav per role ────────────────────────────────────────────────
// Item ber-`section` dikelompokkan dengan header label saat dirender. Item tanpa
// `section` masuk ke kelompok tanpa label di paling atas. Pengelompokan
// dilakukan saat render — urutan asli array tetap dihormati.
const navConfig = {
  super_admin: [
    { section: 'Platform',   labelKey: 'nav.dashboard',           icon: LayoutDashboard, path: '/super-admin/dashboard' },
    { section: 'Platform',   labelKey: 'nav.tenants',             icon: Building2,       path: '/super-admin/tenants' },
    { section: 'Platform',   labelKey: 'nav.tenantRegistrations', icon: UserPlus,        path: '/super-admin/tenant-registrations' },
    { section: 'Platform',   labelKey: 'nav.packages',            icon: Package,         path: '/super-admin/packages' },

    { section: 'Keuangan',   labelKey: 'nav.billing',         icon: DollarSign,  path: '/super-admin/billing' },
    { section: 'Keuangan',   labelKey: 'nav.paymentSettings', icon: Landmark,    path: '/super-admin/payment-settings' },

    { section: 'Komunikasi', labelKey: 'nav.whatsappSettings', icon: MessageSquare, path: '/super-admin/whatsapp-settings' },
    { section: 'Komunikasi', labelKey: 'nav.promotions',       icon: Tag,           path: '/super-admin/promotions' },
    { section: 'Komunikasi', labelKey: 'nav.landing',          icon: Megaphone,     path: '/super-admin/landing' },
    { section: 'Komunikasi', labelKey: 'nav.broadcast',        icon: Megaphone,     path: '/super-admin/broadcast' },

    { section: 'Sistem',     labelKey: 'nav.featureFlags', icon: Flag,          path: '/super-admin/feature-flags' },
    { section: 'Sistem',     labelKey: 'nav.tickets',      icon: MessageSquare, path: '/super-admin/tickets', badge: 'tickets' },
    { section: 'Sistem',     labelKey: 'nav.activityLog',  icon: Activity,      path: '/super-admin/activity-log' },
    { section: 'Sistem',     labelKey: 'nav.errorLogs',    icon: ShieldAlert,   path: '/super-admin/error-logs', badge: 'errorLogs' },
    { section: 'Sistem',     labelKey: 'nav.usage',        icon: PieChart,      path: '/super-admin/usage' },
    { section: 'Sistem',     labelKey: 'nav.affiliates',   icon: Handshake,     path: '/super-admin/affiliates' },

    { section: 'Akun',       labelKey: 'nav.profile',      icon: UserCircle,    path: '/super-admin/profile' },
  ],
  tenant_admin: () => [
    { section: 'Operasional', labelKey: 'nav.dashboard',  icon: LayoutDashboard, path: '/admin/dashboard' },
    { section: 'Operasional', labelKey: 'nav.branches',   icon: Building2,       path: '/admin/branches' },
    { section: 'Operasional', labelKey: 'nav.services',   icon: Scissors,        path: '/admin/services' },
    { section: 'Operasional', labelKey: 'nav.staff',      icon: Users,           path: '/admin/staff', badge: 'lowstock' },
    { section: 'Operasional', labelKey: 'nav.schedule',   icon: CalendarDays,    path: '/admin/schedule' },
    { section: 'Operasional', labelKey: 'nav.attendance', icon: Fingerprint,     path: '/admin/attendance', flag: 'attendance' },
    { section: 'Operasional', labelKey: 'nav.customers',  icon: Star,            path: '/admin/customers' },
    { section: 'Operasional', labelKey: 'nav.vouchers',   icon: Tag,             path: '/admin/vouchers' },
    { section: 'Operasional', labelKey: 'nav.expenses',   icon: Wallet,          path: '/admin/expenses' },

    { section: 'Laporan',     labelKey: 'nav.reports',        icon: BarChart3,  path: '/admin/reports' },
    { section: 'Laporan',     labelKey: 'nav.comparison',     icon: GitCompare, path: '/admin/comparison' },
    { section: 'Laporan',     labelKey: 'nav.wilayahReport',  icon: MapPin,     path: '/admin/wilayah-report' },
    { section: 'Laporan',     labelKey: 'nav.ratings',        icon: Star,       path: '/admin/ratings' },

    { section: 'Komunikasi',  labelKey: 'nav.whatsappLogs',   icon: MessageCircle, path: '/admin/whatsapp-logs', flag: 'whatsapp_logs' },
    { section: 'Komunikasi',  labelKey: 'nav.tickets',        icon: MessageSquare, path: '/admin/tickets', badge: 'ta_tickets' },

    { section: 'Akun',        labelKey: 'nav.billing',  icon: CreditCard, path: '/admin/billing' },
    { section: 'Akun',        labelKey: 'nav.settings', icon: Settings,   path: '/admin/settings' },
    { section: 'Akun',        labelKey: 'nav.help',     icon: LifeBuoy,   path: '/admin/bantuan' },
  ],
  kasir: (user) => {
    const slug = getBranchSlug(user)
    return [
      { section: 'Operasional', labelKey: 'nav.pos',          icon: CreditCard,    path: `/${slug}/kasir/pos` },
      { section: 'Operasional', labelKey: 'nav.queue',        icon: ListOrdered,   path: `/${slug}/kasir/queue` },
      { section: 'Operasional', labelKey: 'nav.booking',      icon: CalendarDays,  path: `/${slug}/kasir/bookings` },
      { section: 'Operasional', labelKey: 'nav.customers',    icon: Users,         path: `/${slug}/kasir/customers` },
      { section: 'Operasional', labelKey: 'nav.transactions', icon: Receipt,       path: `/${slug}/kasir/transactions` },

      { section: 'Manajemen',   labelKey: 'nav.shiftClose',   icon: Wallet,        path: `/${slug}/kasir/shift-closing` },
      { section: 'Manajemen',   labelKey: 'nav.attendance',   icon: Fingerprint,   path: `/${slug}/kasir/attendance`, flag: 'attendance' },
      { section: 'Manajemen',   labelKey: 'nav.ratings',      icon: Star,          path: `/${slug}/kasir/ratings` },
      { section: 'Manajemen',   labelKey: 'nav.help',         icon: LifeBuoy,      path: `/${slug}/kasir/bantuan` },
    ]
  },
  // Role pendek — tanpa section labels (penambahan section di sini bukan info,
  // malah noise visual).
  barber: () => [
    { labelKey: 'nav.dashboard',  icon: LayoutDashboard, path: '/barber/dashboard' },
    { labelKey: 'nav.queue',      icon: ListOrdered,     path: '/barber/queue' },
    { labelKey: 'nav.commission', icon: TrendingUp,      path: '/barber/commission' },
    { labelKey: 'nav.attendance', icon: Fingerprint,     path: '/barber/attendance', flag: 'attendance' },
    { labelKey: 'nav.ratings',    icon: Star,            path: '/barber/ratings' },
  ],
  customer: [
    { labelKey: 'nav.booking', icon: CalendarDays, path: '/customer/booking' },
    { labelKey: 'nav.history', icon: Receipt,      path: '/customer/history' },
    { labelKey: 'nav.loyalty', icon: Star,         path: '/customer/loyalty' },
  ],
  affiliate: [
    { labelKey: 'nav.dashboard',   icon: LayoutDashboard, path: '/affiliate/dashboard' },
    { labelKey: 'nav.referrals',   icon: UserPlus,        path: '/affiliate/referrals' },
    { labelKey: 'nav.commissions', icon: TrendingUp,      path: '/affiliate/commissions' },
    { labelKey: 'nav.payouts',     icon: Banknote,        path: '/affiliate/payouts' },
    { labelKey: 'nav.profile',     icon: UserCircle,      path: '/affiliate/profile' },
  ],
}

// Kelompokkan item nav berdasar field `section` (urutan asli dihormati).
// Item tanpa section masuk ke grup pertama (label null = tak punya header).
function groupNavBySection(items) {
  const groups = []
  let current = null
  for (const item of items) {
    const sec = item.section || null
    if (!current || current.label !== sec) {
      current = { label: sec, items: [] }
      groups.push(current)
    }
    current.items.push(item)
  }
  return groups
}

// Inisial nama untuk avatar — 1-2 huruf kapital, fallback "?" kalau kosong.
function initialsOf(name) {
  if (!name) return '?'
  const parts = String(name).trim().split(/\s+/).slice(0, 2)
  return parts.map(p => p[0]?.toUpperCase() || '').join('') || '?'
}

export const Sidebar = ({ collapsed = false, onSearchClick, onNavigate }) => {
  const { user, logout } = useAuthStore()
  const { getTenantById, getLowStockProducts } = useTenantStore()
  const { theme, toggleTheme } = useThemeStore()
  const { getByTenant: getSubscription } = useSubscriptionStore()
  const navigate = useNavigate()
  const { data: errorStats } = useErrorLogStats(user?.role === 'super_admin')
  // Open-ticket badge counts come from the real /api/tickets/stats endpoint —
  // super_admin sees platform-wide totals, tenant_admin sees their own scope.
  // Other roles (barber/kasir) skip the call entirely to avoid 403s.
  const ticketStatsEnabled = user?.role === 'super_admin' || user?.role === 'tenant_admin'
  const { data: ticketStats } = useTicketStats({}, ticketStatsEnabled)
  const lowStockCount     = user?.tenantId ? (getLowStockProducts(user.tenantId)?.length || 0) : 0
  const openTickets       = user?.role === 'super_admin' ? (ticketStats?.open || 0) : 0
  const tenantOpenTickets = user?.role === 'tenant_admin' ? (ticketStats?.open || 0) : 0
  const unresolvedErrors  = user?.role === 'super_admin' ? (errorStats?.unresolved || 0) : 0
  const { i18n, t } = useTranslation()
  const toggleLang = () => i18n.changeLanguage(i18n.language === 'id' ? 'en' : 'id')
  // Item nav ber-`flag` hanya tampil bila fitur paket tenant mengaktifkannya.
  const { data: enabledFlags = [] } = useFeatureFlags(user?.tenantId)

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
    const items = typeof config === 'function' ? config(user) : config
    return items.filter((i) => !i.flag || enabledFlags.includes(i.flag))
  }

  const navItems = getNavItems()
  const navGroups = groupNavBySection(navItems)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Hitung badge per item — dipakai di renderer nav.
  const badgeCountFor = (item) => {
    if (item.badge === 'lowstock'   && lowStockCount > 0)      return lowStockCount
    if (item.badge === 'tickets'    && openTickets > 0)        return openTickets
    if (item.badge === 'ta_tickets' && tenantOpenTickets > 0)  return tenantOpenTickets
    if (item.badge === 'errorLogs'  && unresolvedErrors > 0)   return unresolvedErrors
    return 0
  }

  // Label "konteks" di bawah brand: tenant.name (tenant_admin/super_admin),
  // nama cabang (kasir/barber), atau role (lainnya). Dijaga read-only di Fase B;
  // branch switcher penuh di Fase C kalau dibutuhkan.
  const contextLabel = (() => {
    if (tenant?.name) return tenant.name
    if (user.role === 'kasir' || user.role === 'barber') {
      const branch = user.branchName || (user.branchId ? `Cabang ${user.branchId.slice(-4).toUpperCase()}` : null)
      return branch || 'Cabang'
    }
    if (user.role === 'super_admin') return 'Super Admin'
    if (user.role === 'affiliate')   return 'Mitra Afiliasi'
    if (user.role === 'customer')    return 'Pelanggan'
    return null
  })()

  return (
    <aside
      className={`
        fixed top-0 left-0 h-screen z-40 flex flex-col overflow-hidden
        bg-indigo-900 text-off-white
        transition-all duration-300
        ${collapsed ? 'w-16' : 'w-[240px]'}
      `}
      style={{
        // Border kanan halus + soft brand glow di pojok kiri-atas (kedalaman,
        // tidak datar). Direpresentasikan inline supaya tak ikut dipindah
        // .light-mode override (sidebar tetap dark di kedua mode — by design).
        borderRight: '1px solid rgba(255,255,255,0.06)',
        backgroundImage:
          'radial-gradient(circle at 0% 0%, rgba(99,102,241,0.28), transparent 38%)',
      }}
    >
      {/* ── Brand row ────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-3 pt-4 pb-3">
        <div className="flex items-center gap-3 px-1">
          <div
            className="w-9 h-9 rounded-xl bg-brand-gradient flex items-center justify-center flex-shrink-0 shadow-brand"
            aria-hidden="true"
          >
            <Scissors className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <h1 className="font-display font-bold text-off-white text-base leading-tight tracking-wide">
                BARBER OS
              </h1>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-indigo-300/80 leading-tight mt-0.5">
                POS · SALON
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Context chip (tenant / cabang / role) ─────────────────────── */}
      {!collapsed && contextLabel && (
        <div className="flex-shrink-0 px-3 pb-3">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/8 bg-white/[0.04] text-xs"
            title={contextLabel}
          >
            <Building2 className="w-3.5 h-3.5 text-indigo-300 flex-shrink-0" />
            <span className="text-indigo-300/80 font-semibold tracking-wide uppercase text-[10px]">
              {user.role === 'kasir' || user.role === 'barber' ? 'Cabang' : 'Tenant'}
            </span>
            <span className="text-off-white font-medium truncate flex-1">{contextLabel}</span>
          </div>
        </div>
      )}

      {/* ── Search shortcut (Cmd+K) — naik ke atas, lebih mudah dijangkau */}
      {!collapsed && onSearchClick && (
        <div className="flex-shrink-0 px-3 pb-3">
          <button
            type="button"
            onClick={onSearchClick}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-white/8 bg-white/[0.04] text-xs text-indigo-300/80 hover:text-off-white hover:border-indigo-300/40 hover:bg-white/[0.08] transition-all"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">{t('common.search')}...</span>
            <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/8 border border-white/8">⌘K</kbd>
          </button>
        </div>
      )}

      {/* ── Navigation (sections) ────────────────────────────────────── */}
      <nav className="flex-1 px-3 pb-3 overflow-y-auto" onClick={() => onNavigate?.()}>
        {navGroups.map((group, gi) => (
          <div key={group.label || `__nogroup-${gi}`} className={gi > 0 ? 'mt-3' : ''}>
            {!collapsed && group.label && (
              <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                {group.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {group.items.map(item => {
                const badgeCount = badgeCountFor(item)
                const showBadge  = badgeCount > 0
                return (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path.endsWith('/dashboard') ? false : false}
                      className={({ isActive }) => `
                        relative flex items-center gap-3 px-3 py-2 rounded-lg
                        text-[13.5px] font-medium transition-all
                        ${isActive
                          ? 'bg-indigo-500/18 text-white font-semibold'
                          : 'text-indigo-300/85 hover:bg-white/6 hover:text-off-white'
                        }
                        ${collapsed ? 'justify-center px-0' : ''}
                      `}
                    >
                      {({ isActive }) => (
                        <>
                          {/* Bar 3px di kiri saat aktif (modern Linear-style),
                              dengan glow brand-light. */}
                          {isActive && !collapsed && (
                            <span
                              className="absolute -left-[2px] top-2 bottom-2 w-[3px] rounded-full bg-indigo-300"
                              style={{ boxShadow: '0 0 12px #A5A2FF' }}
                            />
                          )}
                          <item.icon
                            className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${isActive ? 'text-indigo-300' : ''}`}
                          />
                          {!collapsed && <span className="flex-1 truncate">{t(item.labelKey)}</span>}
                          {showBadge && !collapsed && (
                            <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                              {badgeCount}
                            </span>
                          )}
                          {showBadge && collapsed && (
                            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Bottom: subscription badge + theme/lang + user card ─────── */}
      <div className="flex-shrink-0 px-3 pb-3 pt-3 space-y-2 border-t border-white/8">
        {/* Theme + Language — duduk berdampingan, kompak */}
        {!collapsed && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-white/8 bg-white/[0.04] text-indigo-300/80 hover:text-off-white hover:border-indigo-300/40 hover:bg-white/[0.08] transition-all text-xs font-medium"
              title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span className="hidden xl:inline">{theme === 'dark' ? 'Terang' : 'Gelap'}</span>
            </button>
            <button
              type="button"
              onClick={toggleLang}
              className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-white/8 bg-white/[0.04] text-indigo-300/80 hover:text-off-white hover:border-indigo-300/40 hover:bg-white/[0.08] transition-all text-xs font-medium"
              title="Toggle Language"
            >
              <Languages className="w-3.5 h-3.5" />
              <span>{i18n.language === 'id' ? 'ID' : 'EN'}</span>
            </button>
          </div>
        )}
        {collapsed && (
          <>
            <button
              type="button"
              onClick={toggleTheme}
              className="w-full flex justify-center p-2 rounded-lg text-indigo-300/80 hover:text-off-white hover:bg-white/8 transition-all"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={toggleLang}
              className="w-full flex justify-center p-2 rounded-lg text-indigo-300/80 hover:text-off-white hover:bg-white/8 transition-all"
            >
              <Languages className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Subscription badge — tenant_admin only */}
        {!collapsed && subscription && (
          <button
            type="button"
            onClick={() => navigate('/admin/billing')}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border transition-all text-xs font-medium ${
              subExpired
                ? 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/15'
                : subWarning
                ? 'bg-amber-400/10 border-amber-400/30 text-amber-300 hover:bg-amber-400/15'
                : 'bg-premium/10 border-premium/30 text-premium-light hover:bg-premium/15'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider flex-shrink-0 ${
                subExpired ? 'bg-red-500/20'
                : subWarning ? 'bg-amber-400/20'
                : 'bg-premium/20'
              }`}>
                {subscription.package}
              </span>
              <span className="truncate">
                {subExpired ? 'Langganan kadaluarsa'
                  : subWarning ? `${daysLeft} hari lagi`
                  : `Aktif · ${daysLeft}h lagi`}
              </span>
            </span>
            <ChevronRight className="w-3 h-3 opacity-60 flex-shrink-0" />
          </button>
        )}

        {/* User card */}
        {!collapsed ? (
          <div className="flex items-center gap-2.5 p-2 rounded-xl border border-white/8 bg-white/[0.04] hover:bg-white/[0.08] hover:border-indigo-300/40 transition-all">
            <button
              type="button"
              onClick={profilePath ? () => navigate(profilePath) : undefined}
              className={`flex items-center gap-2.5 flex-1 min-w-0 text-left ${profilePath ? 'cursor-pointer' : ''}`}
            >
              <div
                className="w-9 h-9 rounded-lg bg-brand-gradient flex items-center justify-center flex-shrink-0 shadow-brand text-white font-bold text-sm"
                aria-hidden="true"
              >
                {initialsOf(user.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-off-white truncate leading-tight">{user.name}</p>
                <p className="text-[11px] text-indigo-300/80 capitalize truncate leading-tight mt-0.5">
                  {user.role.replace('_', ' ')}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="p-1.5 rounded-md text-indigo-300/70 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
              title={t('nav.logout')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex justify-center p-2 rounded-lg text-indigo-300/80 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-5 h-5" />
          </button>
        )}
      </div>
    </aside>
  )
}

export default Sidebar
