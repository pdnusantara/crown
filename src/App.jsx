import React, { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ToastProvider } from './components/ui/Toast.jsx'
import SWUpdateBanner from './components/ui/SWUpdateBanner.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import LoadingScreen from './components/ui/LoadingScreen.jsx'
import BranchLicenseGate from './components/BranchLicenseGate.jsx'
import SubscriptionGate from './components/SubscriptionGate.jsx'
import StaffSubscriptionGate from './components/StaffSubscriptionGate.jsx'
import { useAuthStore } from './store/authStore.js'
import { useThemeStore } from './store/themeStore.js'
import { getBranchSlug } from './utils/branchSlug.js'
import { useTenantStore } from './store/tenantStore.js'
import { usePublicTenantStore } from './store/publicTenantStore.js'
import { isTenantSubdomain } from './lib/tenantSlug.js'
import { Skeleton } from './components/ui/Skeleton.jsx'
import { queryClient } from './lib/queryClient.js'

// ── Lazy-loaded pages ───────────────────────────────────────────────────────
const Login         = lazy(() => import('./pages/Login.jsx'))
const LandingPage   = lazy(() => import('./pages/LandingPage.jsx'))
const RegisterPage  = lazy(() => import('./pages/RegisterPage.jsx'))
const LegalPage     = lazy(() => import('./pages/LegalPage.jsx'))

const SAPackagesPage     = lazy(() => import('./pages/super-admin/SAPackagesPage.jsx'))
const SADashboard        = lazy(() => import('./pages/super-admin/SADashboard.jsx'))
const SATenantsPage      = lazy(() => import('./pages/super-admin/SATenantsPage.jsx'))
const SATenantsDetailPage = lazy(() => import('./pages/super-admin/SATenantsDetailPage.jsx'))
const SABillingPage          = lazy(() => import('./pages/super-admin/SABillingPage.jsx'))
const SAPaymentSettingsPage  = lazy(() => import('./pages/super-admin/SAPaymentSettingsPage.jsx'))
const SAWhatsAppSettingsPage = lazy(() => import('./pages/super-admin/SAWhatsAppSettingsPage.jsx'))
const SATenantRegistrationsPage = lazy(() => import('./pages/super-admin/SATenantRegistrationsPage.jsx'))
const SABroadcastPage        = lazy(() => import('./pages/super-admin/SABroadcastPage.jsx'))
const SAFeatureFlagsPage = lazy(() => import('./pages/super-admin/SAFeatureFlagsPage.jsx'))
const SATicketsPage      = lazy(() => import('./pages/super-admin/SATicketsPage.jsx'))
const SAActivityLogPage  = lazy(() => import('./pages/super-admin/SAActivityLogPage.jsx'))
const SAUsagePage        = lazy(() => import('./pages/super-admin/SAUsagePage.jsx'))
const SAProfilePage      = lazy(() => import('./pages/super-admin/SAProfilePage.jsx'))
const SAErrorLogPage     = lazy(() => import('./pages/super-admin/SAErrorLogPage.jsx'))
const SAPromotionsPage   = lazy(() => import('./pages/super-admin/SAPromotionsPage.jsx'))
const SALandingPage      = lazy(() => import('./pages/super-admin/SALandingPage.jsx'))

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
const TAInvoicePrintPage     = lazy(() => import('./pages/tenant-admin/TAInvoicePrintPage.jsx'))
const TAWilayahReportPage    = lazy(() => import('./pages/tenant-admin/TAWilayahReportPage.jsx'))
const TAExpensePage          = lazy(() => import('./pages/tenant-admin/TAExpensePage.jsx'))
const TARatingsPage          = lazy(() => import('./pages/tenant-admin/TARatingsPage.jsx'))
const TAHelpPage             = lazy(() => import('./pages/tenant-admin/TAHelpPage.jsx'))
const TAAttendancePage       = lazy(() => import('./pages/tenant-admin/TAAttendancePage.jsx'))
const TAWhatsappLogsPage     = lazy(() => import('./pages/tenant-admin/TAWhatsappLogsPage.jsx'))

const POSPage          = lazy(() => import('./pages/kasir/POSPage.jsx'))
const QueuePage        = lazy(() => import('./pages/kasir/QueuePage.jsx'))
const BookingsPage     = lazy(() => import('./pages/kasir/BookingsPage.jsx'))
const TransactionsPage = lazy(() => import('./pages/kasir/TransactionsPage.jsx'))
const ShiftClosingPage = lazy(() => import('./pages/kasir/ShiftClosingPage.jsx'))
const KasirHelpPage    = lazy(() => import('./pages/kasir/HelpPage.jsx'))
// Kasir pakai komponen yang sama dengan admin agar tampilan & fitur identik.
// Kontrol admin-only (delete/bulk/export) disembunyikan di dalam TACustomersPage
// via deteksi user.role; backend juga sudah membatasi endpoint terkait.
const KasirCustomersPage = lazy(() => import('./pages/tenant-admin/TACustomersPage.jsx'))

const BarberDashboard  = lazy(() => import('./pages/barber/BarberDashboard.jsx'))
const BarberQueue      = lazy(() => import('./pages/barber/BarberQueue.jsx'))
const BarberCommission = lazy(() => import('./pages/barber/BarberCommission.jsx'))

const StaffAttendancePage = lazy(() => import('./pages/StaffAttendancePage.jsx'))

const CustomerBooking = lazy(() => import('./pages/customer/CustomerBooking.jsx'))
const CustomerHistory = lazy(() => import('./pages/customer/CustomerHistory.jsx'))
const CustomerLoyalty = lazy(() => import('./pages/customer/CustomerLoyalty.jsx'))

const PublicBookingPage = lazy(() => import('./pages/public/PublicBookingPage.jsx'))
const PublicRatingPage  = lazy(() => import('./pages/public/PublicRatingPage.jsx'))
const KasirRatingsPage  = lazy(() => import('./pages/kasir/KasirRatingsPage.jsx'))
const BarberRatingsPage = lazy(() => import('./pages/barber/BarberRatingsPage.jsx'))

// Affiliate program
const SAAffiliatesPage       = lazy(() => import('./pages/super-admin/SAAffiliatesPage.jsx'))
const SAAffiliateDetailPage  = lazy(() => import('./pages/super-admin/SAAffiliateDetailPage.jsx'))
const AffiliateDashboard     = lazy(() => import('./pages/affiliate/AffiliateDashboard.jsx'))
const AffiliateReferralsPage = lazy(() => import('./pages/affiliate/AffiliateReferralsPage.jsx'))
const AffiliateCommissionsPage = lazy(() => import('./pages/affiliate/AffiliateCommissionsPage.jsx'))
const AffiliatePayoutsPage   = lazy(() => import('./pages/affiliate/AffiliatePayoutsPage.jsx'))
const AffiliateProfilePage   = lazy(() => import('./pages/affiliate/AffiliateProfilePage.jsx'))
const AffiliateRegisterPage  = lazy(() => import('./pages/affiliate/AffiliateRegisterPage.jsx'))

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
    case 'kasir':        { const slug = getBranchSlug(user); return slug ? `/${slug}/kasir/pos` : '/login' }
    case 'barber':       return '/barber/dashboard'
    case 'customer':     return '/customer/booking'
    case 'affiliate':    return '/affiliate/dashboard'
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

// Root redirector — landing marketing hanya untuk apex domain (sembapos.com).
// Di subdomain tenant, root langsung ke /login (deteksi hostname sinkron, tanpa
// menunggu resolve tenant → tidak ada kedip landing). Kalau sudah login →
// dashboard sesuai peran.
function RootRedirector() {
  const { isAuthenticated, user } = useAuthStore()
  // Mode preview (iframe builder landing super-admin) — render landing apa
  // adanya tanpa redirect, walau super-admin sedang login.
  const isPreview = new URLSearchParams(window.location.search).get('preview') === '1'
  if (isPreview) return <LandingPage />
  if (isAuthenticated) return <Navigate to={roleHomePath(user)} replace />
  if (isTenantSubdomain()) return <Navigate to="/login" replace />
  return <LandingPage />
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
        <p className="text-muted text-sm">Hubungi SembaPOS support untuk informasi lebih lanjut.</p>
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
        <SWUpdateBanner />
        <PublicTenantLoader>
        <AuthInitializer>
        <Suspense fallback={<PageLoader />}>
          <Routes>
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/syarat-ketentuan" element={<LegalPage />} />
          <Route path="/kebijakan-privasi" element={<LegalPage />} />

          {/* Super Admin */}
          <Route
            path="/super-admin"
            element={<ProtectedRoute roles={['super_admin']}><AppLayout /></ProtectedRoute>}
          >
            <Route path="dashboard"      element={<SADashboard />} />
            <Route path="tenants"        element={<SATenantsPage />} />
            <Route path="tenant-registrations" element={<SATenantRegistrationsPage />} />
            <Route path="tenants/:id"    element={<SATenantsDetailPage />} />
            <Route path="packages"         element={<SAPackagesPage />} />
            <Route path="billing"          element={<SABillingPage />} />
            <Route path="payment-settings" element={<SAPaymentSettingsPage />} />
            <Route path="whatsapp-settings" element={<SAWhatsAppSettingsPage />} />
            <Route path="promotions"       element={<SAPromotionsPage />} />
            <Route path="landing"          element={<SALandingPage />} />
            <Route path="broadcast"        element={<SABroadcastPage />} />
            <Route path="feature-flags"  element={<SAFeatureFlagsPage />} />
            <Route path="tickets"        element={<SATicketsPage />} />
            <Route path="activity-log"   element={<SAActivityLogPage />} />
            <Route path="usage"          element={<SAUsagePage />} />
            <Route path="error-logs"     element={<SAErrorLogPage />} />
            <Route path="affiliates"        element={<SAAffiliatesPage />} />
            <Route path="affiliates/:id"    element={<SAAffiliateDetailPage />} />
            <Route path="profile"        element={<SAProfilePage />} />
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>

          {/* Tenant Admin */}
          <Route
            path="/admin"
            element={<ProtectedRoute roles={['tenant_admin']}><AppLayout /></ProtectedRoute>}
          >
            {/* SubscriptionGate: saat langganan berakhir, semua halaman /admin
                dikunci ke /admin/billing sampai dibayar. */}
            <Route element={<SubscriptionGate />}>
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
              <Route path="billing/invoice/:id" element={<TAInvoicePrintPage />} />
              <Route path="wilayah-report" element={<TAWilayahReportPage />} />
              <Route path="expenses"       element={<TAExpensePage />} />
              <Route path="ratings"        element={<TARatingsPage />} />
              <Route path="attendance"     element={<TAAttendancePage />} />
              <Route path="whatsapp-logs"  element={<TAWhatsappLogsPage />} />
              <Route path="bantuan"        element={<TAHelpPage />} />
            </Route>
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>

          {/* Kasir */}
          <Route
            path="/:branchId/kasir"
            element={<ProtectedRoute roles={['kasir']}><BranchLicenseGate /></ProtectedRoute>}
          >
            {/* StaffSubscriptionGate: blokir total saat langganan toko berakhir. */}
            <Route element={<StaffSubscriptionGate />}>
              <Route element={<AppLayout />}>
                <Route path="pos"           element={<POSPage />} />
                <Route path="queue"         element={<QueuePage />} />
                <Route path="bookings"      element={<BookingsPage />} />
                <Route path="customers"     element={<KasirCustomersPage />} />
                <Route path="transactions"  element={<TransactionsPage />} />
                <Route path="shift-closing" element={<ShiftClosingPage />} />
                <Route path="attendance"    element={<StaffAttendancePage />} />
                <Route path="ratings"       element={<KasirRatingsPage />} />
                <Route path="bantuan"       element={<KasirHelpPage />} />
                <Route index element={<Navigate to="pos" replace />} />
              </Route>
            </Route>
          </Route>

          {/* Barber */}
          <Route
            path="/barber"
            element={<ProtectedRoute roles={['barber']}><BranchLicenseGate /></ProtectedRoute>}
          >
            {/* StaffSubscriptionGate: blokir total saat langganan toko berakhir. */}
            <Route element={<StaffSubscriptionGate />}>
              <Route element={<AppLayout />}>
                <Route path="dashboard"  element={<BarberDashboard />} />
                <Route path="queue"      element={<BarberQueue />} />
                <Route path="commission" element={<BarberCommission />} />
                <Route path="attendance" element={<StaffAttendancePage />} />
                <Route path="ratings"    element={<BarberRatingsPage />} />
                <Route index element={<Navigate to="dashboard" replace />} />
              </Route>
            </Route>
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

          {/* Public affiliate registration (no auth) — declare BEFORE /affiliate protected block
              supaya React Router pilih ini lebih dulu untuk path tepat /affiliate/register. */}
          <Route path="/affiliate/register" element={<AffiliateRegisterPage />} />

          {/* Affiliate dashboard (protected) */}
          <Route
            path="/affiliate"
            element={<ProtectedRoute roles={['affiliate']}><AppLayout /></ProtectedRoute>}
          >
            <Route path="dashboard"   element={<AffiliateDashboard />} />
            <Route path="referrals"   element={<AffiliateReferralsPage />} />
            <Route path="commissions" element={<AffiliateCommissionsPage />} />
            <Route path="payouts"     element={<AffiliatePayoutsPage />} />
            <Route path="profile"     element={<AffiliateProfilePage />} />
            <Route index element={<Navigate to="dashboard" replace />} />
          </Route>

          {/* Halaman booking publik — tanpa auth, diakses via subdomain atau /book/:slug */}
          <Route path="/book" element={<PublicBookingPage />} />
          <Route path="/book/:slug" element={<PublicBookingPage />} />

          {/* Halaman rating publik — diakses via link WA setelah transaksi.
              Tenant ditebak dari subdomain (X-Tenant-Slug header otomatis). */}
          <Route path="/rating/:transactionId" element={<PublicRatingPage />} />

          {/* Root: tampil landing untuk pengunjung; user yang sudah login dialihkan ke home role-nya. */}
          <Route path="/" element={<RootRedirector />} />
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
