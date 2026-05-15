import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import * as Lucide from 'lucide-react'
import { useLanding } from '../hooks/useLanding.js'
import { useAuthStore } from '../store/authStore.js'
import { formatRupiah } from '../utils/format.js'

// Helper untuk animasi count-up angka.
function CountUp({ to = 0, duration = 1500, suffix = '' }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-50px' })
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!inView) return
    const start = performance.now()
    let raf
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(to * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, to, duration])
  return <span ref={ref}>{val.toLocaleString('id-ID')}{suffix}</span>
}

const FALLBACK_FEATURES = [
  { icon: 'Scissors',     title: 'POS Khusus Barbershop', desc: 'Kasir cepat dengan layanan, produk, voucher & komisi barber otomatis.' },
  { icon: 'Users',        title: 'Antrian & Booking',     desc: 'Customer booking online lewat link tenant Anda — tanpa aplikasi tambahan.' },
  { icon: 'Building2',    title: 'Multi-Cabang',          desc: 'Pantau semua cabang dalam satu dashboard, bandingkan kinerja real-time.' },
  { icon: 'BarChart3',    title: 'Laporan & Analitik',    desc: 'Omzet harian, layanan terlaris, performa barber, semua otomatis.' },
  { icon: 'MessageCircle',title: 'Notifikasi WhatsApp',   desc: 'Konfirmasi booking & struk transaksi otomatis dikirim ke pelanggan.' },
  { icon: 'Shield',       title: 'Multi-Role & Aman',     desc: 'Owner, kasir, barber, customer — masing-masing punya akses sendiri.' },
]

function getIcon(name) {
  return Lucide[name] || Lucide.Sparkles
}

const PACKAGE_GRADIENTS = {
  Basic:      'from-blue-500/20 to-blue-600/5',
  Pro:        'from-amber-400/30 to-amber-600/5',
  Enterprise: 'from-purple-500/25 to-purple-700/5',
}
const PACKAGE_BADGE = {
  Basic:      'border-blue-400/30 text-blue-300',
  Pro:        'border-amber-400/40 text-amber-300',
  Enterprise: 'border-purple-400/30 text-purple-300',
}

// Normalize WA number → format internasional `62...` untuk wa.me link.
function normalizeWa(input) {
  if (!input) return null
  const digits = String(input).replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0'))  return `62${digits.slice(1)}`
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('8'))  return `62${digits}`
  return digits
}

export default function LandingPage() {
  const { data, isLoading, isError } = useLanding()
  const { user, isAuthenticated } = useAuthStore()
  const { scrollYProgress } = useScroll()
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -80])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0.4])

  // Set page title untuk landing publik.
  useEffect(() => {
    const original = document.title
    document.title = 'SembaPOS — Sistem Manajemen Barbershop Modern'
    return () => { document.title = original }
  }, [])

  const hero = data?.hero || {}
  const features = (hero.features?.length ? hero.features : FALLBACK_FEATURES)
  const testimonials = data?.testimonials || []
  const faqs = data?.faqs || []
  const packages = data?.packages || []
  const stats = data?.stats || null
  const showStats = hero.showStats !== false && !!stats
  const waNumber = normalizeWa(hero.whatsappCta)

  return (
    <div className="min-h-screen bg-dark text-off-white overflow-x-hidden">
      <Nav isAuthed={isAuthenticated} userRole={user?.role} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-28 pb-20 lg:pt-36 lg:pb-32 overflow-hidden">
        {/* Decorative gradient orbs */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 -left-32 w-96 h-96 rounded-full bg-gold/10 blur-3xl animate-pulse" />
          <div className="absolute top-40 right-0 w-[480px] h-[480px] rounded-full bg-amber-500/5 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
        </div>

        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="max-w-6xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold/10 border border-gold/20 text-gold text-xs font-medium mb-6"
          >
            <Lucide.Sparkles size={12} />
            {hero.brandTagline || 'Dipercaya barbershop di seluruh Indonesia'}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-[1.1]"
          >
            {(hero.heroTitle || 'Sistem Manajemen Barbershop yang Profesional').split(' ').map((word, i, arr) => (
              <span key={i} className={i >= arr.length - 2 ? 'text-gold' : ''}>{word}{i < arr.length - 1 ? ' ' : ''}</span>
            ))}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="text-base sm:text-lg text-muted max-w-2xl mx-auto mb-10"
          >
            {hero.heroSubtitle || 'Kasir, antrian, booking online, multi-cabang, & laporan pintar — semua dalam satu aplikasi.'}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="flex flex-wrap items-center justify-center gap-3"
          >
            <Link
              to={isAuthenticated ? '/admin/dashboard' : '/register'}
              className="group inline-flex items-center gap-2 px-7 py-4 rounded-xl bg-gold text-dark font-semibold text-base hover:bg-gold/90 transition-all shadow-[0_0_40px_rgba(212,175,55,0.3)] hover:shadow-[0_0_60px_rgba(212,175,55,0.5)]"
            >
              {hero.heroCtaLabel || 'Mulai Uji Coba Gratis'}
              <Lucide.ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#fitur"
              className="inline-flex items-center gap-2 px-7 py-4 rounded-xl bg-dark-card border border-dark-border text-off-white font-medium hover:border-gold/40 transition-colors"
            >
              <Lucide.Play size={14} className="text-gold" /> Lihat Fitur
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-xs text-muted/70 mt-6"
          >
            ✨ Gratis 14 hari · Tanpa kartu kredit · Aktivasi instan
          </motion.p>
        </motion.div>

        {/* Hero showcase mockup */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.4 }}
          className="max-w-5xl mx-auto px-6 mt-16"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-gold/30 via-transparent to-amber-500/20 rounded-[2rem] blur-2xl" />
            <div className="relative rounded-2xl border border-gold/20 bg-dark-card shadow-2xl overflow-hidden">
              <DashboardMock />
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      {showStats && (
        <section className="py-12 border-y border-dark-border bg-dark-card/40">
          <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { label: 'Tenant Aktif',   value: stats.tenantCount,      suffix: '+', icon: 'Building2' },
              { label: 'Cabang Terkelola', value: stats.branchCount,    suffix: '+', icon: 'MapPin' },
              { label: 'Transaksi Diproses', value: stats.transactionCount, suffix: '+', icon: 'Receipt' },
              { label: 'Pelanggan Tercatat', value: stats.customerCount, suffix: '+', icon: 'Users' },
            ].map((s) => {
              const Icon = getIcon(s.icon)
              return (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                >
                  <Icon size={20} className="text-gold mx-auto mb-2" />
                  <p className="text-3xl md:text-4xl font-bold text-off-white">
                    <CountUp to={s.value} suffix={s.suffix} />
                  </p>
                  <p className="text-xs text-muted mt-1">{s.label}</p>
                </motion.div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section id="fitur" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            kicker="FITUR LENGKAP"
            title="Semua yang barbershop Anda butuhkan"
            subtitle="Tidak perlu spreadsheet atau aplikasi terpisah. SembaPOS sudah lengkap dari kasir sampai laporan pemilik."
          />

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-12">
            {features.map((f, i) => {
              const Icon = getIcon(f.icon)
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ delay: i * 0.06 }}
                  className="group p-6 rounded-2xl bg-dark-card border border-dark-border hover:border-gold/40 transition-all hover:bg-dark-card/80"
                >
                  <div className="w-12 h-12 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center mb-4 group-hover:bg-gold/20 transition-colors">
                    <Icon size={20} className="text-gold" />
                  </div>
                  <h3 className="font-display text-lg font-semibold mb-2">{f.title}</h3>
                  <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section id="harga" className="py-24 px-6 bg-dark-card/30">
        <div className="max-w-6xl mx-auto">
          <SectionHeading
            kicker="PAKET HARGA"
            title="Pilih paket sesuai skala usaha Anda"
            subtitle="Mulai gratis 14 hari. Upgrade kapan saja saat butuh kapasitas lebih besar."
          />

          {isLoading ? (
            <div className="grid md:grid-cols-3 gap-5 mt-12">
              {[1, 2, 3].map(i => <div key={i} className="h-96 bg-dark-card rounded-2xl animate-pulse" />)}
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-5 mt-12">
              {packages.map((p, i) => {
                const grad = PACKAGE_GRADIENTS[p.name] || PACKAGE_GRADIENTS.Basic
                const badge = PACKAGE_BADGE[p.name] || PACKAGE_BADGE.Basic
                const featured = p.name === 'Pro'
                const annual = Math.round((p.price * 12 * (1 - (p.annualDiscountPercent ?? 17) / 100)) / 1000) * 1000
                return (
                  <motion.div
                    key={p.name}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className={`relative p-6 rounded-2xl bg-gradient-to-b ${grad} border ${featured ? 'border-gold/50 shadow-[0_0_60px_rgba(212,175,55,0.15)]' : 'border-dark-border'}`}
                  >
                    {featured && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gold text-dark text-xs font-bold">
                        ⭐ Paling Populer
                      </div>
                    )}
                    <div className={`inline-block px-2.5 py-0.5 rounded-full border ${badge} text-xs font-bold mb-3`}>
                      {p.name}
                    </div>
                    <p className="text-4xl font-bold text-off-white mb-1">
                      {formatRupiah(p.price)}
                      <span className="text-sm text-muted font-normal"> /bulan</span>
                    </p>
                    <p className="text-xs text-green-400 mb-5">
                      Atau {formatRupiah(annual)}/tahun · hemat {p.annualDiscountPercent ?? 17}%
                    </p>

                    {p.description && (
                      <p className="text-sm text-muted mb-4 italic">{p.description}</p>
                    )}

                    <ul className="space-y-2.5 text-sm mb-6">
                      <Feat>Maks. {p.maxBranches} cabang</Feat>
                      <Feat>Maks. {p.maxStaff} staf</Feat>
                      {p.branchAddonPrice > 0 && (
                        <Feat muted>Cabang tambahan {formatRupiah(p.branchAddonPrice)}{p.branchAddonType === 'monthly' ? '/bulan' : ' (sekali)'}</Feat>
                      )}
                      {(p.features || []).map((feat, fi) => (
                        <Feat key={fi}>{feat}</Feat>
                      ))}
                    </ul>

                    <Link
                      to="/register"
                      state={{ packageName: p.name }}
                      className={`flex items-center justify-center gap-1.5 w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                        featured
                          ? 'bg-gold text-dark hover:bg-gold/90 shadow-[0_0_30px_rgba(212,175,55,0.3)]'
                          : 'bg-dark-card border border-dark-border hover:border-gold/40 text-off-white'
                      }`}
                    >
                      Pilih {p.name} <Lucide.ArrowRight size={14} />
                    </Link>
                  </motion.div>
                )
              })}
            </div>
          )}

          <p className="text-center text-xs text-muted mt-8">
            Semua paket termasuk: SSL, backup harian, integrasi WhatsApp, dukungan 24/7
          </p>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────────────── */}
      {testimonials.length > 0 && (
        <section className="py-24 px-6">
          <div className="max-w-6xl mx-auto">
            <SectionHeading
              kicker="TESTIMONI"
              title="Cerita dari para owner barbershop"
              subtitle="Mereka sudah upgrade dari spreadsheet ke SembaPOS — dan tidak akan kembali."
            />

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-12">
              {testimonials.map((t, i) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: (i % 3) * 0.08 }}
                  className="p-6 rounded-2xl bg-dark-card border border-dark-border hover:border-gold/30 transition-colors"
                >
                  <div className="flex items-center gap-1 mb-3 text-gold">
                    {Array.from({ length: t.rating || 5 }).map((_, idx) => (
                      <Lucide.Star key={idx} size={14} fill="currentColor" />
                    ))}
                  </div>
                  <p className="text-sm text-off-white/90 leading-relaxed mb-5 italic">"{t.message}"</p>
                  <div className="flex items-center gap-3 pt-3 border-t border-dark-border">
                    {t.photoUrl ? (
                      <img src={t.photoUrl} alt={t.name} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold to-amber-600 flex items-center justify-center text-dark font-bold text-sm">
                        {t.name?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-off-white">{t.name}</p>
                      <p className="text-xs text-muted">
                        {t.role && <span>{t.role}</span>}
                        {t.role && t.businessName && <span> · </span>}
                        {t.businessName && <span>{t.businessName}</span>}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      {faqs.length > 0 && (
        <section className="py-24 px-6 bg-dark-card/30">
          <div className="max-w-3xl mx-auto">
            <SectionHeading
              kicker="PERTANYAAN"
              title="Sering ditanyakan"
              subtitle="Belum nemu jawabannya? Hubungi tim kami via WhatsApp."
            />

            <div className="space-y-3 mt-12">
              {faqs.map((f, i) => (
                <FAQItem key={f.id} item={f} delay={i * 0.04} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto text-center p-10 lg:p-14 rounded-3xl bg-gradient-to-br from-gold/15 via-amber-600/5 to-transparent border border-gold/30 relative overflow-hidden"
        >
          <div className="absolute inset-0 -z-10 opacity-10" style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(212,175,55,0.4), transparent 50%), radial-gradient(circle at 80% 70%, rgba(212,175,55,0.3), transparent 50%)',
          }} />
          <Lucide.Sparkles className="text-gold mx-auto mb-4" size={32} />
          <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4">
            Mulai kelola barbershop dengan benar
          </h2>
          <p className="text-muted max-w-xl mx-auto mb-8">
            14 hari gratis untuk paket Basic. Tidak ada kartu kredit, tidak ada biaya tersembunyi. Bisa upgrade kapan saja.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/register"
              className="group inline-flex items-center gap-2 px-7 py-4 rounded-xl bg-gold text-dark font-semibold hover:bg-gold/90 transition-all"
            >
              Daftar Sekarang
              <Lucide.ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            {waNumber && (
              <a
                href={`https://wa.me/${waNumber}?text=${encodeURIComponent('Halo, saya tertarik dengan SembaPOS.')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-7 py-4 rounded-xl bg-dark-card border border-dark-border hover:border-green-500/40 transition-colors"
              >
                <Lucide.MessageCircle size={16} className="text-green-400" /> Konsultasi via WhatsApp
              </a>
            )}
          </div>
        </motion.div>
      </section>

      <Footer />

      {/* Floating WhatsApp button — always visible saat scroll */}
      {waNumber && (
        <motion.a
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.2 }}
          href={`https://wa.me/${waNumber}?text=${encodeURIComponent('Halo, saya tertarik dengan SembaPOS.')}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Konsultasi via WhatsApp"
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-green-500 hover:bg-green-400 flex items-center justify-center shadow-[0_8px_30px_rgba(34,197,94,0.45)] transition-colors"
        >
          <Lucide.MessageCircle size={22} className="text-white" />
          <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-30" />
        </motion.a>
      )}
    </div>
  )
}

// ── Subkomponen ──────────────────────────────────────────────────────────

function Nav({ isAuthed, userRole }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const homePath = userRole === 'super_admin' ? '/super-admin/dashboard'
                 : userRole === 'tenant_admin' ? '/admin/dashboard'
                 : userRole ? '/' : '/'

  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all ${scrolled ? 'bg-dark/80 backdrop-blur-md border-b border-dark-border' : 'bg-transparent'}`}>
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold to-amber-600 flex items-center justify-center text-dark font-bold">
            S
          </div>
          <span className="font-display text-lg font-bold tracking-tight">SembaPOS</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <a href="#fitur" className="text-muted hover:text-off-white transition-colors">Fitur</a>
          <a href="#harga" className="text-muted hover:text-off-white transition-colors">Harga</a>
          <a href="#" onClick={(e) => { e.preventDefault(); const el = document.getElementById('fitur'); if (el) el.scrollIntoView({ behavior: 'smooth' }) }} className="text-muted hover:text-off-white transition-colors">Demo</a>
        </nav>

        <div className="flex items-center gap-2">
          {isAuthed ? (
            <Link to={homePath} className="px-4 py-2 rounded-lg bg-gold text-dark text-sm font-semibold hover:bg-gold/90 transition-colors">
              Buka Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="hidden sm:inline-flex px-4 py-2 rounded-lg text-sm text-off-white hover:bg-dark-card transition-colors">
                Masuk
              </Link>
              <Link to="/register" className="px-4 py-2 rounded-lg bg-gold text-dark text-sm font-semibold hover:bg-gold/90 transition-colors">
                Daftar Gratis
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function SectionHeading({ kicker, title, subtitle }) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="text-xs font-bold tracking-[0.2em] text-gold mb-3"
      >
        {kicker}
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="font-display text-3xl lg:text-4xl font-bold mb-4"
      >
        {title}
      </motion.h2>
      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-muted"
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  )
}

function Feat({ children, muted }) {
  return (
    <li className={`flex items-start gap-2 ${muted ? 'text-muted' : 'text-off-white/90'}`}>
      <Lucide.Check size={14} className={`mt-0.5 flex-shrink-0 ${muted ? 'text-muted' : 'text-gold'}`} />
      <span>{children}</span>
    </li>
  )
}

function FAQItem({ item, delay }) {
  const [open, setOpen] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
      className="rounded-xl bg-dark-card border border-dark-border overflow-hidden"
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-dark-surface/40 transition-colors"
      >
        <span className="font-medium text-off-white pr-4">{item.question}</span>
        <Lucide.ChevronDown size={16} className={`text-gold flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 text-sm text-muted leading-relaxed whitespace-pre-line">{item.answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function Footer() {
  return (
    <footer className="border-t border-dark-border py-12 px-6 mt-12">
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        <div className="col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold to-amber-600 flex items-center justify-center text-dark font-bold">
              S
            </div>
            <span className="font-display text-lg font-bold">SembaPOS</span>
          </div>
          <p className="text-muted text-xs max-w-sm leading-relaxed">
            Sistem manajemen barbershop modern: kasir, antrian, booking online, multi-cabang, dan laporan pintar dalam satu aplikasi.
          </p>
        </div>
        <div>
          <h4 className="font-semibold text-off-white mb-3">Produk</h4>
          <ul className="space-y-2 text-muted text-xs">
            <li><a href="#fitur" className="hover:text-off-white">Fitur</a></li>
            <li><a href="#harga" className="hover:text-off-white">Harga</a></li>
            <li><Link to="/login" className="hover:text-off-white">Masuk</Link></li>
            <li><Link to="/register" className="hover:text-off-white">Daftar Gratis</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-off-white mb-3">Perusahaan</h4>
          <ul className="space-y-2 text-muted text-xs">
            <li>© {new Date().getFullYear()} SembaPOS</li>
            <li>sembapos.com</li>
          </ul>
        </div>
      </div>
    </footer>
  )
}

// Mock dashboard untuk hero — full SVG/divs styling agar tidak butuh asset.
function DashboardMock() {
  return (
    <div className="aspect-[16/10] bg-gradient-to-br from-dark-card to-dark p-4 sm:p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
          <span className="ml-2 text-[10px] text-muted">sembapos.com/admin/dashboard</span>
        </div>
        <div className="text-[10px] text-muted">Hari ini</div>
      </div>

      <div className="grid grid-cols-12 gap-3">
        {/* Sidebar */}
        <div className="col-span-3 hidden sm:block space-y-1.5">
          {['Dashboard', 'Cabang', 'Layanan', 'Staff', 'Reports', 'Billing'].map((item, i) => (
            <div key={item} className={`px-2.5 py-1.5 rounded-md text-[10px] ${i === 0 ? 'bg-gold/15 text-gold' : 'text-muted'}`}>
              {item}
            </div>
          ))}
        </div>

        {/* Main */}
        <div className="col-span-12 sm:col-span-9 space-y-3">
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Omzet hari ini', value: 'Rp 4.2 jt', up: '+18%' },
              { label: 'Transaksi',       value: '47',       up: '+5'  },
              { label: 'Antrian',         value: '8',        up: ''    },
            ].map((k) => (
              <div key={k.label} className="p-2.5 rounded-lg bg-dark-card border border-dark-border">
                <p className="text-[9px] text-muted">{k.label}</p>
                <p className="text-base font-bold text-off-white mt-0.5">{k.value}</p>
                {k.up && <p className="text-[9px] text-green-400 mt-0.5">↑ {k.up}</p>}
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="p-3 rounded-lg bg-dark-card border border-dark-border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-muted">Omzet 7 hari terakhir</p>
              <p className="text-[9px] text-gold">+24%</p>
            </div>
            <div className="flex items-end gap-1.5 h-16">
              {[40, 65, 50, 80, 70, 90, 100].map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ duration: 0.6, delay: 0.3 + i * 0.05 }}
                  className="flex-1 bg-gradient-to-t from-gold/40 to-gold/80 rounded-sm"
                />
              ))}
            </div>
          </div>

          {/* Activity */}
          <div className="p-3 rounded-lg bg-dark-card border border-dark-border">
            <p className="text-[10px] text-muted mb-2">Aktivitas terbaru</p>
            <div className="space-y-1.5">
              {[
                { name: 'Andi · Potong + Cuci',  time: '2m'  },
                { name: 'Budi · Booking 14:30',  time: '8m'  },
                { name: 'Citra · Bayar Rp 75k',  time: '15m' },
              ].map((a, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + i * 0.1 }}
                  className="flex items-center justify-between text-[10px]"
                >
                  <span className="text-off-white/80">• {a.name}</span>
                  <span className="text-muted">{a.time}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
