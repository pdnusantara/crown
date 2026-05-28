import React, { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, Building2, User, Mail, Phone, Lock, AtSign,
  CheckCircle, AlertCircle, Loader2, Sparkles, Eye, EyeOff, RefreshCw,
  Copy, ExternalLink, PartyPopper, Handshake,
} from 'lucide-react'
import { useRegisterTenant, useCheckSlug } from '../hooks/useRegister.js'
import { useLanding } from '../hooks/useLanding.js'
import { useReferralCodeLookup } from '../hooks/useAffiliates.js'
import { initMetaPixel, trackPixel } from '../lib/metaPixel.js'
import { formatRupiah } from '../utils/format.js'
import { getAttribution } from '../utils/attribution.js'
import { tenantHostname, tenantLoginUrl, PLATFORM_NAME } from '../utils/platform.js'

const STEPS = ['Pilih Paket', 'Profil Bisnis', 'Akun Owner']

// Mirror backend slugRegex (auth.js): harus diawali & diakhiri alfanumerik,
// hyphen hanya di tengah. Mencegah `-toko`, `toko-`, `--`.
const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

function useDebounced(value, ms = 400) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

// Slug dari nama bisnis — buang karakter ilegal, rapikan hyphen di ujung.
function autoSlug(business) {
  return String(business)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

// Bersihkan input slug saat diketik (boleh hyphen trailing sementara).
function sanitizeSlugInput(v) {
  return String(v).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40)
}

// Indikator kekuatan password — penilaian advisory, minimum tetap 8 karakter.
function passwordStrength(pw) {
  if (!pw) return { level: 0, label: '', barClass: '', textClass: '' }
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (pw.length < 8) {
    return { level: 1, label: 'Terlalu pendek', barClass: 'bg-red-500', textClass: 'text-red-400' }
  }
  if (score <= 2) return { level: 1, label: 'Lemah',  barClass: 'bg-red-500',    textClass: 'text-red-400' }
  if (score <= 3) return { level: 2, label: 'Sedang', barClass: 'bg-amber-500',  textClass: 'text-amber-400' }
  return { level: 3, label: 'Kuat', barClass: 'bg-green-500', textClass: 'text-green-400' }
}

export default function RegisterPage() {
  const location = useLocation()
  const initialPkg = location.state?.packageName || null
  // Affiliate referral — diambil dari query ?ref=XXXX. Diingat di state agar
  // tampil di header & dikirim ke backend; jika kode tidak valid, backend
  // diam-diam mengabaikan attribution-nya (pendaftaran tetap sukses).
  const initialRef = useMemo(() => {
    if (typeof window === 'undefined') return ''
    const params = new URLSearchParams(window.location.search)
    // ?ref= di URL saat ini diutamakan; jika tidak ada (mis. pengunjung mendarat
    // di landing dengan ?ref= lalu klik Daftar), pakai atribusi first-touch.
    const fromUrl = params.get('ref') || getAttribution().ref || ''
    return fromUrl.toUpperCase().trim().slice(0, 32)
  }, [])
  // Daftar paket diambil dari /api/landing — endpoint PUBLIK. (/api/packages
  // butuh auth, jadi tidak bisa dipakai di halaman registrasi yang publik.)
  const { data: landingData, isLoading: pkgsLoading, isError: pkgsError, refetch: refetchPkgs } = useLanding()
  const refInfo = useReferralCodeLookup(initialRef)
  const register = useRegisterTenant()

  const [step, setStep] = useState(initialPkg ? 1 : 0)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [slugTouched, setSlugTouched] = useState(false)
  const [done, setDone] = useState(null) // { businessName, slug, email, trial }
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

  const packages = landingData?.packages || []
  const selectedPkg = packages.find(p => p.name === form.packageName)
  const pwStrength = useMemo(() => passwordStrength(form.password), [form.password])

  // Meta Pixel — aktif bila super-admin sudah mengonfigurasi Pixel ID. Halaman
  // /register juga memuat pixel supaya konversi tetap tercatat saat pengunjung
  // masuk langsung dari iklan tanpa melewati landing page.
  const metaPixelId = landingData?.hero?.metaPixelId
  useEffect(() => {
    if (metaPixelId) initMetaPixel(metaPixelId)
  }, [metaPixelId])

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setError(null)
  }

  // Slug valid format & sudah dikonfirmasi tersedia oleh backend.
  const slugFormatOk = form.slug.length >= 2 && SLUG_REGEX.test(form.slug)
  const slugConfirmedAvailable =
    slugFormatOk &&
    debouncedSlug === form.slug &&
    slugCheck.data?.available === true
  const slugChecking = slugFormatOk && (slugCheck.isFetching || debouncedSlug !== form.slug)

  function next() {
    setError(null)
    if (step === 1) {
      if (!form.businessName.trim()) return setError('Nama bisnis wajib diisi')
      if (!slugFormatOk) {
        return setError('URL minimal 2 karakter — huruf kecil, angka, tanda hubung hanya di tengah')
      }
      if (slugChecking) return setError('Tunggu pengecekan ketersediaan URL selesai')
      if (slugCheck.data && !slugCheck.data.available) return setError('URL tidak tersedia, pilih yang lain')
    }
    setStep(s => Math.min(STEPS.length - 1, s + 1))
  }
  function back() { setStep(s => Math.max(0, s - 1)); setError(null) }

  async function handleSubmit() {
    if (register.isPending) return
    setError(null)
    if (!form.ownerName.trim()) return setError('Nama owner wajib diisi')
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) return setError('Email tidak valid')
    if (form.phone.replace(/\D/g, '').length < 8) return setError('Nomor HP tidak valid (minimal 8 digit)')
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
        referralCode: initialRef || undefined,
        signupMeta:   getAttribution(),
      })
      // Akun tenant TIDAK boleh aktif di domain utama (sembapos.com) — login &
      // refresh di-enforce per subdomain. Maka jangan auto-login di sini;
      // arahkan owner ke subdomain mereka untuk masuk.
      setDone({
        businessName: result.tenant?.name || form.businessName.trim(),
        slug:         result.tenant?.slug || form.slug.trim().toLowerCase(),
        email:        result.user?.email || form.email.trim().toLowerCase(),
        trial:        result.trial || null,
      })
      // Konversi utama untuk Meta Ads — pendaftaran tenant berhasil.
      trackPixel('CompleteRegistration', {
        content_name: form.packageName,
        value:        selectedPkg?.price || 0,
        currency:     'IDR',
      })
    } catch (err) {
      setError(err?.response?.data?.error || 'Pendaftaran gagal. Coba lagi.')
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (done) {
    return <SuccessScreen data={done} />
  }

  const onStepEnter = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (step < STEPS.length - 1) next()
    else handleSubmit()
  }

  return (
    <div className="min-h-screen bg-dark text-off-white">
      {/* Top bar */}
      <header className="border-b border-dark-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-muted hover:text-off-white text-sm transition-colors">
            <ArrowLeft size={14} /> Kembali
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand to-amber-600 flex items-center justify-center text-dark font-bold text-sm">S</div>
            <span className="font-display font-bold">{PLATFORM_NAME}</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Referral banner — terlihat saat ?ref=XXX dan affiliate aktif */}
        {refInfo.data && (
          <div className="mb-6 p-3 rounded-xl bg-brand/10 border border-brand/30 flex items-center gap-3 text-sm">
            <div className="w-9 h-9 rounded-lg bg-brand/20 flex items-center justify-center flex-shrink-0">
              <Handshake size={16} className="text-brand" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-off-white">Direkrut oleh <span className="text-brand font-semibold">{refInfo.data.name}</span></p>
              <p className="text-[11px] text-muted">Kode rujukan {refInfo.data.code} akan terhubung otomatis dengan akun Anda.</p>
            </div>
          </div>
        )}

        {/* Progress */}
        <div className="flex items-center justify-between mb-8 sm:mb-10" aria-label={`Langkah ${step + 1} dari ${STEPS.length}`}>
          {STEPS.map((label, i) => (
            <React.Fragment key={label}>
              <div className="flex flex-col items-center min-w-0">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  i < step ? 'bg-brand text-dark' :
                  i === step ? 'bg-brand/20 text-brand border-2 border-brand' :
                  'bg-dark-card text-muted border border-dark-border'
                }`}>
                  {i < step ? <CheckCircle size={16} /> : i + 1}
                </div>
                <p className={`text-[11px] mt-1.5 hidden sm:block ${i === step ? 'text-brand' : 'text-muted'}`}>{label}</p>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 transition-colors ${i < step ? 'bg-brand' : 'bg-dark-border'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="text-center mb-6 sm:mb-8">
          <Sparkles className="text-brand mx-auto mb-2" size={24} />
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
            className="bg-dark-card border border-dark-border rounded-2xl p-5 sm:p-6 lg:p-8"
          >
            {/* ── Step 0: paket ─────────────────────────────────────────── */}
            {step === 0 && (
              <div>
                <h2 className="font-semibold text-lg mb-1">Pilih paket</h2>
                <p className="text-xs text-muted mb-5">Bisa upgrade kapan saja setelah trial.</p>
                {pkgsLoading ? (
                  <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-dark-surface rounded-xl animate-pulse" />)}</div>
                ) : pkgsError ? (
                  <div className="p-6 rounded-xl bg-dark-surface border border-dark-border text-center">
                    <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2 opacity-70" />
                    <p className="text-sm text-off-white">Gagal memuat daftar paket</p>
                    <button
                      onClick={() => refetchPkgs()}
                      className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-dark text-sm font-semibold hover:bg-brand-light transition-colors"
                    >
                      <RefreshCw size={14} /> Coba Lagi
                    </button>
                  </div>
                ) : packages.length === 0 ? (
                  <div className="p-6 rounded-xl bg-dark-surface border border-dark-border text-center text-sm text-muted">
                    Belum ada paket tersedia. Hubungi tim {PLATFORM_NAME}.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {packages.map(p => {
                      const active = form.packageName === p.name
                      const annual = Math.round((p.price * 12 * (1 - (p.annualDiscountPercent ?? 17) / 100)) / 1000) * 1000
                      return (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => update('packageName', p.name)}
                          aria-pressed={active}
                          className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                            active ? 'border-brand bg-brand/5' : 'border-dark-border bg-dark-surface hover:border-brand/30'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-off-white">{p.name}</p>
                                {p.name === 'Pro' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand text-dark font-bold">POPULER</span>}
                                {active && <CheckCircle size={14} className="text-brand" />}
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
                <p className="text-xs text-muted mt-4 flex items-center gap-1.5">
                  <CheckCircle size={11} className="text-green-400 flex-shrink-0" />
                  Trial 14 hari gratis untuk semua paket. Bayar setelah trial.
                </p>
              </div>
            )}

            {/* ── Step 1: profil bisnis ─────────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold text-lg mb-1">Profil bisnis</h2>
                  <p className="text-xs text-muted mb-5">Nama yang akan tampil di aplikasi & link booking customer.</p>
                </div>

                <Field
                  id="reg-business"
                  label="Nama bisnis / barbershop"
                  icon={Building2}
                  placeholder="Contoh: Mahkota Barbershop"
                  value={form.businessName}
                  autoComplete="organization"
                  onKeyDown={onStepEnter}
                  onChange={(v) => {
                    // Selama owner belum menyentuh field URL, sinkronkan otomatis.
                    setForm(f => ({ ...f, businessName: v, slug: slugTouched ? f.slug : autoSlug(v) }))
                    setError(null)
                  }}
                />

                <Field
                  id="reg-slug"
                  label="URL booking customer"
                  icon={AtSign}
                  placeholder="mahkota"
                  value={form.slug}
                  autoComplete="off"
                  onKeyDown={onStepEnter}
                  onChange={(v) => { setSlugTouched(true); update('slug', sanitizeSlugInput(v)) }}
                  suffix={`.${tenantHostname('')}`}
                  hint={<SlugStatus check={slugCheck} slug={form.slug} debouncedSlug={debouncedSlug} formatOk={slugFormatOk} />}
                />
              </div>
            )}

            {/* ── Step 2: akun owner ────────────────────────────────────── */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold text-lg mb-1">Akun owner</h2>
                  <p className="text-xs text-muted mb-5">Akun ini akan jadi admin tenant Anda — bisa tambah staf nanti.</p>
                </div>

                <Field id="reg-owner" label="Nama lengkap" icon={User} value={form.ownerName}
                  autoComplete="name" onKeyDown={onStepEnter}
                  onChange={v => update('ownerName', v)} placeholder="Nama Anda" />
                <Field id="reg-email" label="Email" icon={Mail} type="email" value={form.email}
                  autoComplete="email" inputMode="email" onKeyDown={onStepEnter}
                  onChange={v => update('email', v)} placeholder="email@anda.com" />
                <Field id="reg-phone" label="WhatsApp / HP" icon={Phone} type="tel" value={form.phone}
                  autoComplete="tel" inputMode="tel" onKeyDown={onStepEnter}
                  onChange={v => update('phone', v)} placeholder="08xxxxxxxxxx" />
                <div>
                  <Field
                    id="reg-password"
                    label="Password (min 8 karakter)"
                    icon={Lock}
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    autoComplete="new-password"
                    onKeyDown={onStepEnter}
                    onChange={v => update('password', v)}
                    placeholder="Password kuat"
                    rightIcon={showPassword ? EyeOff : Eye}
                    onRightClick={() => setShowPassword(s => !s)}
                    rightLabel={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  />
                  {form.password && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 flex gap-1" aria-hidden="true">
                        {[1, 2, 3].map(n => (
                          <div key={n} className={`h-1 flex-1 rounded-full transition-colors ${
                            n <= pwStrength.level ? pwStrength.barClass : 'bg-dark-border'
                          }`} />
                        ))}
                      </div>
                      <span className={`text-[11px] font-medium ${pwStrength.textClass}`}>{pwStrength.label}</span>
                    </div>
                  )}
                </div>

                <label className="flex items-start gap-2.5 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.agree}
                    onChange={e => update('agree', e.target.checked)}
                    className="mt-0.5 accent-brand w-4 h-4 flex-shrink-0"
                  />
                  <span className="text-xs text-muted leading-relaxed">
                    Saya setuju dengan syarat layanan {PLATFORM_NAME} dan paham bahwa langganan akan otomatis berakhir setelah 14 hari trial bila tidak dibayar.
                  </span>
                </label>

                {/* Order summary */}
                <div className="mt-6 p-4 rounded-xl bg-dark-surface border border-dark-border">
                  <p className="text-xs text-muted mb-2">Ringkasan pendaftaran</p>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="text-off-white truncate">{form.businessName || '—'}</span>
                    <span className="text-muted truncate">{form.slug ? `${form.slug}.${tenantHostname('')}` : '—'}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm mt-2 pt-2 border-t border-dark-border">
                    <span className="text-off-white">Paket {form.packageName}</span>
                    <span className="text-brand font-semibold whitespace-nowrap">{selectedPkg ? formatRupiah(selectedPkg.price) : '—'}/bulan</span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm mt-2 pt-2 border-t border-dark-border">
                    <span className="text-green-400 font-medium">Trial 14 hari</span>
                    <span className="text-green-400 font-bold">GRATIS</span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div role="alert" className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300 flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 mt-8 pt-6 border-t border-dark-border">
              <button
                type="button"
                onClick={back}
                disabled={step === 0 || register.isPending}
                className="text-sm text-muted hover:text-off-white px-4 py-2 disabled:opacity-30 transition-colors"
              >
                ← Kembali
              </button>
              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={next}
                  disabled={step === 0 ? (pkgsLoading || pkgsError || packages.length === 0) : false}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand text-dark font-semibold hover:bg-brand-light transition-colors disabled:opacity-40"
                >
                  Lanjut <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={register.isPending}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand text-dark font-semibold hover:bg-brand-light transition-colors disabled:opacity-60"
                >
                  {register.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  {register.isPending ? 'Mendaftarkan…' : 'Daftarkan Saya'}
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        <p className="text-center text-xs text-muted mt-6">
          Sudah punya akun? <Link to="/login" className="text-brand hover:underline">Masuk di sini</Link>
        </p>
      </main>
    </div>
  )
}

// ── Success screen ───────────────────────────────────────────────────────────
function SuccessScreen({ data }) {
  const [copied, setCopied] = useState(false)
  const host = tenantHostname(data.slug)
  const loginUrl = `${tenantLoginUrl(data.slug)}/login`

  const trialEnd = data.trial?.endsAt
    ? new Date(data.trial.endsAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const copyHost = async () => {
    try {
      await navigator.clipboard.writeText(host)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard tidak tersedia — abaikan */ }
  }

  return (
    <div className="min-h-screen bg-dark text-off-white flex items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md bg-dark-card border border-dark-border rounded-2xl p-6 sm:p-8 text-center"
      >
        <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
          <PartyPopper className="text-green-400" size={30} />
        </div>
        <h1 className="font-display text-2xl font-bold">Pendaftaran Berhasil!</h1>
        <p className="text-muted text-sm mt-1.5">
          Barbershop <span className="text-off-white font-semibold">{data.businessName}</span> sudah aktif.
        </p>

        {/* Alamat tenant */}
        <div className="mt-5 p-4 rounded-xl bg-dark-surface border border-dark-border text-left">
          <p className="text-[11px] text-muted uppercase tracking-wider mb-1.5">Alamat aplikasi Anda</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 truncate text-brand font-semibold text-sm">{host}</code>
            <button
              type="button"
              onClick={copyHost}
              aria-label="Salin alamat"
              className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-dark-card border border-dark-border text-muted hover:text-off-white text-[11px] transition-colors"
            >
              {copied ? <CheckCircle size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? 'Tersalin' : 'Salin'}
            </button>
          </div>
          <p className="text-[11px] text-muted mt-2 leading-relaxed">
            Simpan alamat ini — semua login staf & link booking pelanggan memakai domain ini.
          </p>
        </div>

        {/* Info akun & trial */}
        <div className="mt-3 text-left space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted">Akun owner</span>
            <span className="text-off-white truncate">{data.email}</span>
          </div>
          {trialEnd && (
            <div className="flex justify-between gap-3">
              <span className="text-muted">Trial aktif sampai</span>
              <span className="text-green-400 font-medium">{trialEnd}</span>
            </div>
          )}
        </div>

        <a
          href={loginUrl}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand text-dark font-semibold hover:bg-brand-light transition-colors"
        >
          Masuk ke Dashboard <ExternalLink size={15} />
        </a>
        <p className="text-[11px] text-muted mt-3">
          Anda akan masuk dengan email & password yang baru dibuat.
        </p>
      </motion.div>
    </div>
  )
}

// ── Field ────────────────────────────────────────────────────────────────────
function Field({
  id, label, icon: Icon, value, onChange, type = 'text', placeholder, suffix, hint,
  rightIcon: RightIcon, onRightClick, rightLabel, autoComplete, inputMode, onKeyDown,
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs text-muted block mb-1.5">{label}</label>
      <div className="relative flex items-center">
        {Icon && <Icon size={14} className="absolute left-3 text-muted pointer-events-none" />}
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          className={`w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl py-2.5 text-sm outline-none focus:border-brand/60 transition-colors ${Icon ? 'pl-9' : 'pl-3'} ${suffix ? 'pr-32' : RightIcon ? 'pr-10' : 'pr-3'}`}
        />
        {suffix && <span className="absolute right-3 text-xs text-muted pointer-events-none truncate max-w-[40%]">{suffix}</span>}
        {RightIcon && (
          <button
            type="button"
            onClick={onRightClick}
            aria-label={rightLabel || 'Toggle'}
            className="absolute right-3 text-muted hover:text-off-white transition-colors"
          >
            <RightIcon size={14} />
          </button>
        )}
      </div>
      {hint && <div className="mt-1.5 text-xs">{hint}</div>}
    </div>
  )
}

// ── SlugStatus ───────────────────────────────────────────────────────────────
function SlugStatus({ check, slug, debouncedSlug, formatOk }) {
  if (!slug || slug.length < 2) return <span className="text-muted">Minimal 2 karakter</span>
  if (!formatOk) {
    return (
      <span className="text-red-400 inline-flex items-center gap-1">
        <AlertCircle size={11} /> Tanda hubung hanya boleh di tengah
      </span>
    )
  }
  // Debounce belum selesai / sedang fetch → tampilkan loading.
  if (check.isFetching || debouncedSlug !== slug) {
    return <span className="text-muted inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Mengecek…</span>
  }
  if (!check.data) return null
  if (check.data.available) {
    return <span className="text-green-400 inline-flex items-center gap-1"><CheckCircle size={11} /> Tersedia: <strong>{slug}.{tenantHostname('')}</strong></span>
  }
  const reason = check.data.reason
  return (
    <span className="text-red-400 inline-flex items-center gap-1">
      <AlertCircle size={11} />
      {reason === 'taken' ? 'Sudah dipakai, pilih yang lain'
        : reason === 'reserved' ? 'URL ini dipakai sistem'
        : 'Format tidak valid'}
    </span>
  )
}
