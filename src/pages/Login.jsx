import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Scissors, Mail, Lock, Shield, Building2, ExternalLink, Sparkles, CalendarClock, Receipt, TrendingUp } from 'lucide-react'
import { useAuthStore } from '../store/authStore.js'
import { usePublicTenantStore } from '../store/publicTenantStore.js'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'
import { getTenantSlug } from '../lib/tenantSlug.js'

// Peran untuk tombol dev-login di subdomain tenant — login tanpa password ke
// akun tenant subdomain saat ini. Hanya muncul kalau backend DEV_LOGIN=1.
const DEV_ROLES = [
  { role: 'tenant_admin', label: 'Tenant Admin', color: 'from-brand to-brand-light' },
  { role: 'kasir',        label: 'Kasir',        color: 'from-blue-500 to-cyan-500' },
  { role: 'barber',       label: 'Barber',       color: 'from-green-500 to-emerald-500' },
]

// Highlight fitur di panel kiri — ringkas, relevan untuk semua peran toko.
const HIGHLIGHTS = [
  { icon: Receipt,       title: 'Kasir & struk cepat',     desc: 'Layanan, produk, komisi — sekali tap.' },
  { icon: CalendarClock, title: 'Antrian & booking online', desc: 'Giliran rapi, pelanggan booking sendiri.' },
  { icon: TrendingUp,    title: 'Laporan otomatis',         desc: 'Omzet, performa barber, tanpa Excel.' },
]

export default function Login() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { login, devLogin, isLoading, error, clearError } = useAuthStore()
  const { status: tenantStatus, name: tenantName, logo: tenantLogo, devLogin: devLoginEnabled } = usePublicTenantStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [redirectUrl, setRedirectUrl] = useState(null)

  const isTenantContext = tenantStatus === 'found'
  const slug = getTenantSlug()
  // Main domain = no tenant slug detected. We use this to gate the demo accounts
  // and surface the "this is the super-admin sign-in" banner.
  const isMainDomain = !slug && !isTenantContext
  // Tombol login cepat tanpa password — hanya di subdomain tenant & saat
  // backend mengaktifkannya (env DEV_LOGIN=1).
  const showDevLogin = isTenantContext && devLoginEnabled

  const brandName = isTenantContext ? tenantName : 'BarberOS'

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()
    setRedirectUrl(null)
    const result = await login(email, password)
    if (result.success) {
      navigate(result.redirectTo)
    } else if (result.redirect) {
      // Backend told us this account belongs on a different domain — surface
      // a one-click button so the user doesn't have to retype the URL.
      setRedirectUrl(result.redirect)
    }
  }

  const handleDevLogin = async (role) => {
    clearError()
    setRedirectUrl(null)
    const result = await devLogin(role)
    if (result.success) navigate(result.redirectTo)
  }

  return (
    <div className="min-h-screen bg-dark lg:grid lg:grid-cols-2 overflow-x-hidden">
      {/* ── Panel kiri: branding (desktop) ─────────────────────────────────── */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden p-12 text-white"
           style={{ background: 'linear-gradient(135deg,#4F46E5 0%,#6366F1 45%,#10B981 120%)' }}>
        {/* Dekorasi */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-[#10B981]/30 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.07]"
               style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, #fff 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        </div>

        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
                    className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center overflow-hidden backdrop-blur-sm">
            {isTenantContext && tenantLogo
              ? <img src={tenantLogo} alt={brandName} className="w-full h-full object-cover" />
              : <Scissors className="w-6 h-6 text-white" />}
          </div>
          <div className="leading-tight">
            <p className="font-display text-lg font-bold">{brandName}</p>
            {isTenantContext && <p className="text-xs text-white/70">Powered by BarberOS</p>}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
                    className="relative max-w-md">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/80 mb-4">
            <Sparkles size={14} /> Selamat datang kembali
          </span>
          <h2 className="font-display text-4xl font-bold leading-tight">
            Kelola barbershop kamu,<br />tanpa ribet.
          </h2>
          <p className="text-white/80 mt-4 leading-relaxed">
            Masuk untuk buka kasir, pantau antrian, dan lihat performa toko hari ini.
          </p>

          <div className="mt-8 space-y-3.5">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
                  <h.icon size={16} className="text-white" />
                </span>
                <div>
                  <p className="text-sm font-semibold leading-tight">{h.title}</p>
                  <p className="text-xs text-white/70 leading-snug">{h.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <p className="relative text-xs text-white/60">BarberOS v1.0 • Sistem Manajemen Barbershop</p>
      </div>

      {/* ── Panel kanan: form ──────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-center p-4 sm:p-8 min-h-screen lg:min-h-0 w-full">
        {/* Dekorasi halus khusus mobile/tablet (saat panel kiri tersembunyi) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none lg:hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-brand/10 rounded-full blur-3xl" />
        </div>

        <div className="w-full max-w-md min-w-0 relative z-10">
          {/* Brand header — tampil di mobile (panel kiri tersembunyi) */}
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-8 lg:hidden"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-dark-card border border-dark-border mb-3 overflow-hidden">
              {isTenantContext && tenantLogo
                ? <img src={tenantLogo} alt={brandName} className="w-full h-full object-cover" />
                : <Scissors className="w-8 h-8 text-brand" />}
            </div>
            <h1 className="font-display text-2xl font-bold text-off-white">{brandName}</h1>
            {isTenantContext
              ? <p className="text-muted text-sm">Powered by <span className="brand-text font-semibold">BarberOS</span></p>
              : <p className="text-muted text-sm">Premium Barbershop Management System</p>}
          </motion.div>

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="glass rounded-3xl p-6 sm:p-7"
          >
            <h2 className="font-display text-xl font-semibold text-off-white mb-1 text-center">{t('auth.loginTitle')}</h2>
            <p className="text-sm text-muted mb-4 text-center">Masuk ke akun kamu untuk lanjut.</p>

            {/* Domain context banner */}
            {isMainDomain && (
              <div className="flex items-start gap-2 bg-amber-400/10 border border-amber-400/30 rounded-xl p-3 mb-4 text-amber-200 text-xs leading-relaxed">
                <Shield size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
                <p>
                  Domain ini untuk <span className="font-semibold">Super-Admin</span> &amp; <span className="font-semibold">Affiliate</span>.
                  Akun tenant (admin/kasir/barber) silakan login melalui subdomain bisnis Anda
                  (mis. <span className="font-mono text-amber-100">tenant.sembapos.com</span>).
                </p>
              </div>
            )}
            {isTenantContext && (
              <div className="flex items-center justify-center gap-2 bg-brand/10 border border-brand/30 rounded-xl p-3 mb-4 text-off-white text-xs leading-relaxed text-center">
                <Building2 size={14} className="flex-shrink-0 text-brand" />
                <p>
                  Login tenant <span className="font-semibold">{tenantName}</span>.
                </p>
              </div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 text-red-400 text-sm space-y-2"
              >
                <p>{error}</p>
                {redirectUrl && (
                  <a
                    href={redirectUrl}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-light underline underline-offset-2"
                  >
                    <ExternalLink size={12} />
                    Buka domain yang benar
                  </a>
                )}
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label={t('auth.emailLabel')}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                icon={Mail}
                required
                autoFocus
              />

              <div className="relative">
                <Input
                  label={t('auth.passwordLabel')}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  icon={Lock}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 bottom-2.5 text-muted hover:text-off-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <Button
                type="submit"
                fullWidth
                loading={isLoading}
                size="lg"
                className="mt-2"
              >
                {isLoading ? t('auth.loggingIn') : t('auth.loginButton')}
              </Button>
            </form>

            {/* Login cepat tanpa password — HANYA muncul di subdomain tenant saat
                backend mengaktifkan DEV_LOGIN=1 (khusus pengembangan). Tidak pernah
                tampil di domain utama / produksi. */}
            {showDevLogin && (
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-dark-border" />
                  <span className="text-xs text-muted">Login cepat (mode dev)</span>
                  <div className="flex-1 h-px bg-dark-border" />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {DEV_ROLES.map(r => (
                    <button
                      key={r.role}
                      onClick={() => handleDevLogin(r.role)}
                      disabled={isLoading}
                      className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-dark-card border border-dark-border hover:border-brand/30 transition-all"
                    >
                      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${r.color} flex items-center justify-center`}>
                        <span className="text-xs font-bold text-white">{r.label[0]}</span>
                      </div>
                      <p className="text-xs font-medium text-off-white truncate">{r.label}</p>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted mt-2 text-center leading-relaxed">
                  Masuk tanpa password sebagai akun tenant ini — khusus pengembangan.
                </p>
              </div>
            )}
          </motion.div>

          <p className="text-center text-muted text-xs mt-6">
            Mau jadi mitra & dapat komisi?{' '}
            <a href="/affiliate/register" className="text-brand hover:underline">Daftar Affiliate</a>
          </p>
        </div>
      </div>
    </div>
  )
}
