import React, { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, Building2, User, Mail, Phone, Lock, AtSign,
  CheckCircle, AlertCircle, Loader2, Sparkles, Eye, EyeOff,
} from 'lucide-react'
import { useRegisterTenant, useCheckSlug } from '../hooks/useRegister.js'
import { usePackages } from '../hooks/usePackages.js'
import { useAuthStore } from '../store/authStore.js'
import { formatRupiah } from '../utils/format.js'

const STEPS = ['Pilih Paket', 'Profil Bisnis', 'Akun Owner']

function useDebounced(value, ms = 400) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const initialPkg = location.state?.packageName || null
  const { setAuth } = useAuthStore()
  const { data: pkgData, isLoading: pkgsLoading } = usePackages()
  const register = useRegisterTenant()

  const [step, setStep] = useState(initialPkg ? 1 : 0)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    packageName:  initialPkg || 'Basic',
    businessName: '',
    slug:         '',
    ownerName:    '',
    email:        '',
    phone:        '',
    password:     '',
    agree:        false,
  })

  const debouncedSlug = useDebounced(form.slug, 400)
  const slugCheck = useCheckSlug(debouncedSlug)

  const packages = pkgData?.list || []

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setError(null)
  }

  function autoSlug(business) {
    return business.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 30)
  }

  function next() {
    setError(null)
    if (step === 0 && !form.packageName) return setError('Pilih salah satu paket dulu')
    if (step === 1) {
      if (!form.businessName.trim()) return setError('Nama bisnis wajib diisi')
      if (!form.slug.trim() || !/^[a-z0-9-]+$/.test(form.slug)) return setError('Slug hanya boleh huruf kecil, angka, dan tanda hubung')
      if (slugCheck.data && !slugCheck.data.available) return setError('Slug tidak tersedia, pilih yang lain')
    }
    setStep(s => Math.min(STEPS.length - 1, s + 1))
  }
  function back() { setStep(s => Math.max(0, s - 1)); setError(null) }

  async function handleSubmit() {
    setError(null)
    if (!form.ownerName.trim()) return setError('Nama owner wajib')
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) return setError('Email tidak valid')
    if (!form.phone.trim() || form.phone.length < 8) return setError('Nomor HP tidak valid')
    if (form.password.length < 8) return setError('Password minimal 8 karakter')
    if (!form.agree) return setError('Harap setujui syarat & ketentuan')

    try {
      const result = await register.mutateAsync({
        packageName:  form.packageName,
        businessName: form.businessName.trim(),
        slug:         form.slug.trim().toLowerCase(),
        ownerName:    form.ownerName.trim(),
        email:        form.email.trim().toLowerCase(),
        phone:        form.phone.trim(),
        password:     form.password,
      })
      // Auto-login: simpan tokens & user ke authStore.
      setAuth({
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      })
      // Pengguna baru → menuju welcome / dashboard.
      navigate('/admin/dashboard?welcome=1', { replace: true })
    } catch (err) {
      setError(err?.response?.data?.error || 'Pendaftaran gagal')
    }
  }

  const selectedPkg = packages.find(p => p.name === form.packageName)

  return (
    <div className="min-h-screen bg-dark text-off-white">
      {/* Top bar */}
      <header className="border-b border-dark-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-muted hover:text-off-white">
            <ArrowLeft size={14} /> Kembali
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-gold to-amber-600 flex items-center justify-center text-dark font-bold text-sm">S</div>
            <span className="font-display font-bold">SembaPOS</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Progress */}
        <div className="flex items-center justify-between mb-10">
          {STEPS.map((label, i) => (
            <React.Fragment key={label}>
              <div className="flex flex-col items-center min-w-0">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  i < step ? 'bg-gold text-dark' :
                  i === step ? 'bg-gold/20 text-gold border-2 border-gold' :
                  'bg-dark-card text-muted border border-dark-border'
                }`}>
                  {i < step ? <CheckCircle size={16} /> : i + 1}
                </div>
                <p className={`text-[11px] mt-1.5 hidden sm:block ${i === step ? 'text-gold' : 'text-muted'}`}>{label}</p>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${i < step ? 'bg-gold' : 'bg-dark-border'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="text-center mb-8">
          <Sparkles className="text-gold mx-auto mb-2" size={24} />
          <h1 className="font-display text-2xl lg:text-3xl font-bold">Mulai Uji Coba 14 Hari Gratis</h1>
          <p className="text-muted text-sm mt-1">Tanpa kartu kredit. Aktivasi instan.</p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="bg-dark-card border border-dark-border rounded-2xl p-6 lg:p-8"
          >
            {step === 0 && (
              <div>
                <h2 className="font-semibold text-lg mb-1">Pilih paket</h2>
                <p className="text-xs text-muted mb-5">Bisa upgrade kapan saja setelah trial.</p>
                {pkgsLoading ? (
                  <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-dark-surface rounded-xl animate-pulse" />)}</div>
                ) : (
                  <div className="space-y-3">
                    {packages.map(p => {
                      const active = form.packageName === p.name
                      const annual = Math.round((p.price * 12 * (1 - (p.annualDiscountPercent ?? 17) / 100)) / 1000) * 1000
                      return (
                        <button
                          key={p.name}
                          onClick={() => update('packageName', p.name)}
                          className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                            active ? 'border-gold bg-gold/5' : 'border-dark-border bg-dark-surface hover:border-gold/30'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-off-white">{p.name}</p>
                                {p.name === 'Pro' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gold text-dark font-bold">POPULER</span>}
                                {active && <CheckCircle size={14} className="text-gold" />}
                              </div>
                              <p className="text-xs text-muted mt-1">
                                Maks. {p.maxBranches} cabang · {p.maxStaff} staf
                              </p>
                              {p.description && <p className="text-xs text-muted mt-1 italic">{p.description}</p>}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-lg font-bold text-off-white">{formatRupiah(p.price)}</p>
                              <p className="text-[10px] text-muted">/bulan</p>
                              <p className="text-[10px] text-green-400 mt-0.5">tahunan {formatRupiah(annual)}</p>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
                <p className="text-xs text-muted mt-4 flex items-center gap-1">
                  <CheckCircle size={11} className="text-green-400" />
                  Trial 14 hari gratis untuk semua paket. Bayar setelah trial.
                </p>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold text-lg mb-1">Profil bisnis</h2>
                  <p className="text-xs text-muted mb-5">Nama yang akan tampil di aplikasi & link booking customer.</p>
                </div>

                <Field
                  label="Nama bisnis / barbershop"
                  icon={Building2}
                  placeholder="Contoh: Mahkota Barbershop"
                  value={form.businessName}
                  onChange={(v) => {
                    update('businessName', v)
                    if (!form.slug) update('slug', autoSlug(v))
                  }}
                />

                <div>
                  <Field
                    label="URL booking customer"
                    icon={AtSign}
                    placeholder="mahkota"
                    value={form.slug}
                    onChange={(v) => update('slug', v.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    suffix=".sembapos.com"
                    hint={<SlugStatus check={slugCheck} slug={debouncedSlug} />}
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold text-lg mb-1">Akun owner</h2>
                  <p className="text-xs text-muted mb-5">Akun ini akan jadi admin tenant Anda — bisa tambah staf nanti.</p>
                </div>

                <Field label="Nama lengkap"   icon={User}  value={form.ownerName} onChange={v => update('ownerName', v)} placeholder="Nama Anda" />
                <Field label="Email"          icon={Mail}  type="email" value={form.email} onChange={v => update('email', v)} placeholder="email@anda.com" />
                <Field label="WhatsApp / HP"  icon={Phone} type="tel"   value={form.phone} onChange={v => update('phone', v)} placeholder="08xxxxxxxxxx" />
                <Field
                  label="Password (min 8 karakter)"
                  icon={Lock}
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={v => update('password', v)}
                  placeholder="Password kuat"
                  rightIcon={showPassword ? EyeOff : Eye}
                  onRightClick={() => setShowPassword(s => !s)}
                />

                <label className="flex items-start gap-2.5 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.agree}
                    onChange={e => update('agree', e.target.checked)}
                    className="mt-0.5 accent-gold"
                  />
                  <span className="text-xs text-muted leading-relaxed">
                    Saya setuju dengan syarat layanan SembaPOS dan paham bahwa langganan akan otomatis berakhir setelah 14 hari trial bila tidak dibayar.
                  </span>
                </label>

                {/* Order summary */}
                <div className="mt-6 p-4 rounded-xl bg-dark-surface border border-dark-border">
                  <p className="text-xs text-muted mb-2">Ringkasan pendaftaran</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-off-white">{form.businessName || '—'}</span>
                    <span className="text-muted">{form.slug ? `${form.slug}.sembapos.com` : '—'}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-2 pt-2 border-t border-dark-border">
                    <span className="text-off-white">Paket {form.packageName}</span>
                    <span className="text-gold font-semibold">{selectedPkg ? formatRupiah(selectedPkg.price) : '—'}/bulan</span>
                  </div>
                  <div className="flex justify-between text-sm mt-2 pt-2 border-t border-dark-border">
                    <span className="text-green-400 font-medium">Trial 14 hari</span>
                    <span className="text-green-400 font-bold">GRATIS</span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300 flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 mt-8 pt-6 border-t border-dark-border">
              <button
                onClick={back}
                disabled={step === 0}
                className="text-sm text-muted hover:text-off-white px-4 py-2 disabled:opacity-30"
              >
                ← Kembali
              </button>
              {step < STEPS.length - 1 ? (
                <button
                  onClick={next}
                  disabled={step === 1 && (!slugCheck.data?.available || slugCheck.isFetching)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gold text-dark font-semibold hover:bg-gold/90 transition-colors disabled:opacity-40"
                >
                  Lanjut <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={register.isPending}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gold text-dark font-semibold hover:bg-gold/90 transition-colors disabled:opacity-40"
                >
                  {register.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  Daftarkan Saya
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        <p className="text-center text-xs text-muted mt-6">
          Sudah punya akun? <Link to="/login" className="text-gold hover:underline">Masuk di sini</Link>
        </p>
      </main>
    </div>
  )
}

function Field({ label, icon: Icon, value, onChange, type = 'text', placeholder, suffix, hint, rightIcon: RightIcon, onRightClick }) {
  return (
    <div>
      <label className="text-xs text-muted block mb-1.5">{label}</label>
      <div className="relative flex items-center">
        {Icon && <Icon size={14} className="absolute left-3 text-muted pointer-events-none" />}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl py-2.5 text-sm outline-none focus:border-gold/60 transition-colors ${Icon ? 'pl-9' : 'pl-3'} ${suffix ? 'pr-32' : RightIcon ? 'pr-10' : 'pr-3'}`}
        />
        {suffix && <span className="absolute right-3 text-xs text-muted">{suffix}</span>}
        {RightIcon && (
          <button onClick={onRightClick} type="button" className="absolute right-3 text-muted hover:text-off-white">
            <RightIcon size={14} />
          </button>
        )}
      </div>
      {hint && <div className="mt-1.5 text-xs">{hint}</div>}
    </div>
  )
}

function SlugStatus({ check, slug }) {
  if (!slug || slug.length < 2) return <span className="text-muted">Min. 2 karakter</span>
  if (check.isFetching) return <span className="text-muted inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Mengecek…</span>
  if (!check.data) return null
  if (check.data.available) {
    return <span className="text-green-400 inline-flex items-center gap-1"><CheckCircle size={11} /> Tersedia: <strong>{slug}.sembapos.com</strong></span>
  }
  const reason = check.data.reason
  return (
    <span className="text-red-400 inline-flex items-center gap-1">
      <AlertCircle size={11} /> {reason === 'taken' ? 'Sudah dipakai' : reason === 'reserved' ? 'Slug ini sudah dipakai sistem' : 'Format tidak valid'}
    </span>
  )
}
