import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Scissors, Mail, Lock, ChevronRight } from 'lucide-react'
import { useAuthStore } from '../store/authStore.js'
import { usePublicTenantStore } from '../store/publicTenantStore.js'
import Button from '../components/ui/Button.jsx'
import Input from '../components/ui/Input.jsx'

// Credentials match backend seed (run: cd backend && npm run db:seed)
const DEMO_USERS = [
  { email: 'admin@barberos.com',       password: 'Admin123!',  role: 'Super Admin',    color: 'from-amber-500 to-orange-500' },
  { email: 'admin@barberkingdom.com',  password: 'Admin123!',  role: 'Tenant Admin',   color: 'from-gold to-gold-light' },
  { email: 'kasir@barberkingdom.com',  password: 'Kasir123!',  role: 'Kasir',          color: 'from-blue-500 to-cyan-500' },
  { email: 'budi@barberkingdom.com',   password: 'Barber123!', role: 'Barber',         color: 'from-green-500 to-emerald-500' },
]

export default function Login() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { login, isLoading, error, clearError } = useAuthStore()
  const { status: tenantStatus, name: tenantName, logo: tenantLogo } = usePublicTenantStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const isTenantContext = tenantStatus === 'found'

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()
    const result = await login(email, password)
    if (result.success) navigate(result.redirectTo)
  }

  const handleQuickLogin = async (user) => {
    clearError()
    setEmail(user.email)
    setPassword(user.password)
    const result = await login(user.email, user.password)
    if (result.success) navigate(result.redirectTo)
  }

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gold/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gold/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gold/3 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          {isTenantContext ? (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-dark-card border border-dark-border mb-4 overflow-hidden">
                {tenantLogo
                  ? <img src={tenantLogo} alt={tenantName} className="w-full h-full object-cover" />
                  : <Scissors className="w-8 h-8 text-gold" />
                }
              </div>
              <h1 className="font-display text-3xl font-bold text-off-white mb-1">{tenantName}</h1>
              <p className="text-muted text-sm">Powered by <span className="gold-text font-semibold">BarberOS</span></p>
            </>
          ) : (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gold mb-4 shadow-gold-lg">
                <Scissors className="w-8 h-8 text-dark" />
              </div>
              <h1 className="font-display text-4xl font-bold text-off-white mb-1">
                BARBER<span className="gold-text">OS</span>
              </h1>
              <p className="text-muted text-sm">Premium Barbershop Management System</p>
            </>
          )}
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="glass rounded-3xl p-6"
        >
          <h2 className="font-display text-xl font-semibold text-off-white mb-5">{t('auth.loginTitle')}</h2>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 text-red-400 text-sm"
            >
              {error}
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

          {/* Demo users */}
          <div className="mt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-dark-border" />
              <span className="text-xs text-muted">{t('auth.demoAccounts')}</span>
              <div className="flex-1 h-px bg-dark-border" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_USERS.map(user => (
                <button
                  key={user.email}
                  onClick={() => handleQuickLogin(user)}
                  disabled={isLoading}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-dark-card border border-dark-border hover:border-gold/30 transition-all text-left group"
                >
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${user.color} flex items-center justify-center flex-shrink-0`}>
                    <span className="text-xs font-bold text-white">{user.role[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-off-white truncate">{user.role}</p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-muted group-hover:text-gold transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        <p className="text-center text-muted text-xs mt-6">
          BarberOS v1.0 • Premium Barbershop Management
        </p>
      </div>
    </div>
  )
}
