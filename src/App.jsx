import React, { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ToastProvider } from './components/ui/Toast.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import LoadingScreen from './components/ui/LoadingScreen.jsx'
import { useAuthStore } from './store/authStore.js'
import { useThemeStore } from './store/themeStore.js'
import { useTenantStore } from './store/tenantStore.js'
import { usePublicTenantStore } from './store/publicTenantStore.js'
import { Skeleton } from './components/ui/Skeleton.jsx'
import { queryClient } from './lib/queryClient.js'

// ── Lazy-loaded pages ───────────────────────────────────────────────────────
const Login = lazy(() => import('./pages/Login.jsx'))

const SAPackagesPage     = lazy(() => import('./pages/super-admin/SAPackagesPage.jsx'))
const SADashboard        = lazy(() => import('./pages/super-admin/SADashboard.jsx'))
const SATenantsPage      = lazy(() => import('./pages/super-admin/SATenantsPage.jsx'))
const SATenantsDetailPage = lazy(() => import('./pages/super-admin/SATenantsDetailPage.jsx'))
const SABillingPage      = lazy(() => import('./pages/super-admin/SABillingPage.jsx'))
const SABroadcastPage    = lazy(() => import('./pages/super-admin/SABroadcastPage.jsx'))
const SAFeatureFlagsPage = lazy(() => import('./pages/super-admin/SAFeatureFlagsPage.jsx'))
const SATicketsPage      = lazy(() => import('./pages/super-admin/SATicketsPage.jsx'))
const SAActivityLogPage  = lazy(() => import('./pages/super-admin/SAActivityLogPage.jsx'))
const SAUsagePage        = lazy(() => import('./pages/super-admin/SAUsagePage.jsx'))
const SAProfilePage      = lazy(() => import('./pages/super-admin/SAProfilePage.jsx'))
const SAErrorLogPage     = lazy(() => import('./pages/super-admin/SAErrorLogPage.jsx'))

const TADashboard          = lazy(() => import('./pages/tenant-admin/TADashboard.jsx'))
const TABranchesPage       = lazy(() => import('./pages/tenant-admin/TABranchesPage.jsx'))
const TAServicesPage       = lazy(() => import('./pages/tenant-admin/TAServicesPage.jsx'))
const TAStaffPage          = lazy(() => import('./pages/tenant-admin/TAStaffPage.jsx'))
const TACustomersPage      = lazy(() => import('./pages/tenant-admin/TACustomersPage.jsx'))
const TAReportsPage        = lazy(() => import('./pages/tenant-admin/TAReportsPage.jsx'))
const TASettingsPage       = lazy(() => import('./pages/tenant-admin/TASettingsPage.jsx'))
const TASchedulePage       = lazy(() => import('./pages/tenant-admin/TASchedulePage.jsx'))
const TAVouchersPage       = lazy(() => import('./pages/tenant-admin/TAVouchersPage.jsx'))
const TABranchComparisonPage = lazy(() => import('./pages/tenant-admin/TABranchComparisonPage.jsx'))
const TATicketsPage          = lazy(() => import('./pages/tenant-admin/TATicketsPage.jsx'))
const TABillingPage          = lazy(() => import('./pages/tenant-admin/TABillingPage.jsx'))
const TAWilayahReportPage    = lazy(() => import('./pages/tenant-admin/TAWilayahReportPage.jsx'))
const TAExpensePage          = lazy(() => import('./pages/tenant-admin/TAExpensePage.jsx'))

const POSPage          = lazy(() => import('./pages/kasir/POSPage.jsx'))
const QueuePage        = lazy(() => import('./pages/kasir/QueuePage.jsx'))
const BookingsPage     = lazy(() => import('./pages/kasir/BookingsPage.jsx'))
const TransactionsPage = lazy(() => import('./pages/kasir/TransactionsPage.jsx'))
const ShiftClosingPage = lazy(() => import('./pages/kasir/ShiftClosingPage.jsx'))

const BarberDashboard  = lazy(() => import('./pages/barber/BarberDashboard.jsx'))
const BarberQueue      = lazy(() => import('./pages/barber/BarberQueue.jsx'))
const BarberCommission = lazy(() => import('./pages/barber/BarberCommission.jsx'))

const CustomerBooking = lazy(() => import('./pages/customer/CustomerBooking.jsx'))
const CustomerHistory = lazy(() => import('./pages/customer/CustomerHistory.jsx'))
const CustomerLoyalty = lazy(() => import('./pages/customer/CustomerLoyalty.jsx'))

// ── Page loading fallback ───────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex-1 p-6 space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-dark-card rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array(4).fill(0).map((_, i) => (
          <div key={i} className="h-28 bg-dark-card rounded-xl" />
        ))}
      </div>
      <div className="h-64 bg-dark-card rounded-xl" />
    </div>
  )
}

// ── Protected Route ─────────────────────────────────────────────────────────
function roleHomePath(user) {
  if (!user) return '/login'
  switch (user.role) {
    case 'super_admin':  return '/super-admin/dashboard'
    case 'tenant_admin': return '/admin/dashboard'
    case 'kasir':        return user.branchId ? `/${user.branchId}/kasir/pos` : '/login'
    case 'barber':       return '/barber/dashboard'
    case 'customer':     return '/customer/booking'
    default:             return '/login'
  }
}

function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  // Logged in but wrong role — send to their role's home, not /login
  if (roles && !roles.includes(user?.role)) return <Navigate to={roleHomePath(user)} replace />
  return children
}

// ── 404 ─────────────────────────────────────────────────────────────────────
function NotFound() {
  return (
    <div className="min-h-screen bg-dark flex items-center justify-center">
      <div className="text-center">
        <p className="text-8xl font-display font-bold gold-text mb-4">404</p>
        <h1 className="text-2xl font-semibold text-off-white mb-2">Halaman tidak ditemukan</h1>
        <p className="text-muted mb-6">Halaman yang Anda cari tidak ada.</p>
        <a href="/login" className="px-6 py-2.5 bg-gold text-dark rounded-xl font-semibold hover:bg-gold-light transition-colors">
          Kembali ke Login
        </a>
      </div>
    </div>
  )
}

// ── Tenant Not Found ─────────────────────────────────────────────────────────
function TenantNotFound({ slug }) {
  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-dark-card border border-dark-border flex items-center justify-center mx-auto mb-6">
          <span className="text-2xl">✂️</span>
        </div>
        <h1 className="text-2xl font-semibold text-off-white mb-2">Tenant Tidak Ditemukan</h1>
        <p className="text-muted text-sm mb-1">
          Tidak ada barbershop dengan subdomain <span className="text-off-white font-mono">{slug}</span>.
        </p>
        <p className="text-muted text-sm">Periksa kembali alamat yang Anda akses.</p>
      </div>
    </div>
  )
}

// ── Tenant Suspended ─────────────────────────────────────────────────────────
function TenantSuspended({ name }) {
  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
          <span className="text-2xl">🔒</span>
        </div>
        <h1 className="text-2xl font-semibold text-off-white mb-2">Akun Ditangguhkan</h1>
        <p className="text-muted text-sm mb-1">
          Akun <span className="text-off-white font-medium">{name}</span> sedang ditangguhkan.
        </p>
        <p className="text-muted text-sm">Hubungi BarberOS support untuk informasi lebih lanjut.</p>
      </div>
    </div>
  )
}

// ── Public Tenant Loader ─────────────────────────────────────────────────────
// Resolves tenant from subdomain before rendering the app.
function PublicTenantLoader({ children }) {
  const { status, slug, name, resolve } = usePublicTenantStore()

  useEffect(() => {
    resolve()
  }, [])

  if (status === 'idle' || status === 'loading') return <LoadingScreen />
  if (status === 'not_found') return <TenantNotFound slug={slug} />
  if (status === 'suspended') return <TenantSuspended name={name} />
  return children
}

// ── Theme Applier ────────────────────────────────────────────────────────────
function ThemeApplier() {
  const { theme } = useThemeStore()
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') {
      root.classList.add('light-mode')
    } else {
      root.classList.remove('light-mode')
    }
  }, [theme])
  return null
}

// ── Auto-Segmentation on startup ────────────────────────────────────────────
function AutoSegmentation() {
  const { runAutoSegmentation } = useTenantStore()
  useEffect(() => {
    if (runAutoSegmentation) runAutoSegmentation()
  }, [])
  return null
}

// ── Auth Initializer ─────────────────────────────────────────────────────────
// Wraps the app: blocks route rendering until /auth/me has resolved, so a
// page refresh does not momentarily see `isAuthenticated: false` and redirect
// to /login before the session is restored.
function AuthInitializer({ children }) {
  const { isLoading, logout } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    useAuthStore.getState().initialize()
  }, [])

  useEffect(() => {
    const handleAuthLogout = () => {
      logout()
      navigate('/login', { replace: true })
    }
    window.addEventListener('auth:logout', handleAuthLogout)
    return () => window.removeEventListener('auth:logout', handleAuthLogout)
  }, [logout, navigate])

  if (isLoading) return <LoadingScreen />
  return children
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <a href="#main-content" className="skip-link">Langsung ke konten utama</a>
        <ThemeApplier />
        <AutoSegmentation />
        <PublicTenantLoader>
        <AuthInitializer>
        <Suspense fallback={<PageLoader />}>
          <Routes>
          <Route path="/login" element={<Login />} />

          {/* Super Admin */}
          <Route
            path="/super-admin"
            element={<ProtectedRoute roles={['super_admin']}><AppLayout /></ProtectedRoute>}
          >
            <Route path="dashboard"      element={<SADashboard />} />
            <Route path="tenants"        element={<SATenantsPage />} />
            <Route path="tenants/:id"    element={<SATenantsDetailPage />} />
            <Route path="packages"       element={<SAPackagesPage />} />
            <Route path="billing"        element={<SABillingPage />} />
            <Route path="broadcast"      element={<SABroadcastPage />} />
            <Route path="feature-flags"  element={<SAFeatureFlagsPage />} />
            <Route path="tickets"        element={<SATicketsPage />} />
            <Route path="activity-log"   element={<SAActivityLogPage />} />
            <Route path="usage"          element={<SAUsagePage />} />
            <Route path="error-logs"     element={<SAErrorLogPage />} />
            <Route path="profile"        element={<SAProfilePage />} />
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>

          {/* Tenant Admin */}
          <Route
            path="/admin"
            element={<ProtectedRoute roles={['tenant_admin']}><AppLayout /></ProtectedRoute>}
          >
            <Route path="dashboard"  element={<TADashboard />} />
            <Route path="branches"   element={<TABranchesPage />} />
            <Route path="services"   element={<TAServicesPage />} />
            <Route path="staff"      element={<TAStaffPage />} />
            <Route path="customers"  element={<TACustomersPage />} />
            <Route path="reports"    element={<TAReportsPage />} />
            <Route path="settings"   element={<TASettingsPage />} />
            <Route path="schedule"   element={<TASchedulePage />} />
            <Route path="vouchers"   element={<TAVouchersPage />} />
            <Route path="comparison" element={<TABranchComparisonPage />} />
            <Route path="tickets"        element={<TATicketsPage />} />
            <Route path="billing"        element={<TABillingPage />} />
            <Route path="wilayah-report" element={<TAWilayahReportPage />} />
            <Route path="expenses"       element={<TAExpensePage />} />
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>

          {/* Kasir */}
          <Route
            path="/:branchId/kasir"
            element={<ProtectedRoute roles={['kasir']}><AppLayout /></ProtectedRoute>}
          >
            <Route path="pos"           element={<POSPage />} />
            <Route path="queue"         element={<QueuePage />} />
            <Route path="bookings"      element={<BookingsPage />} />
            <Route path="transactions"  element={<TransactionsPage />} />
            <Route path="shift-closing" element={<ShiftClosingPage />} />
            <Route index element={<Navigate to="pos" replace />} />
          </Route>

          {/* Barber */}
          <Route
            path="/barber"
            element={<ProtectedRoute roles={['barber']}><AppLayout /></ProtectedRoute>}
          >
            <Route path="dashboard"  element={<BarberDashboard />} />
            <Route path="queue"      element={<BarberQueue />} />
            <Route path="commission" element={<BarberCommission />} />
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>

          {/* Customer */}
          <Route
            path="/customer"
            element={<ProtectedRoute roles={['customer']}><AppLayout /></ProtectedRoute>}
          >
            <Route path="booking" element={<CustomerBooking />} />
            <Route path="history" element={<CustomerHistory />} />
            <Route path="loyalty" element={<CustomerLoyalty />} />
            <Route index element={<Navigate to="booking" replace />} />
          </Route>

          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </AuthInitializer>
        </PublicTenantLoader>
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </ToastProvider>
    </QueryClientProvider>
  )
}
