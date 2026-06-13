import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, BarChart3, Building2, Calendar, CalendarClock, CalendarDays,
  Check, ChevronDown, Circle, Lock, Mail, MapPin, MessageCircle, Phone, Play,
  Receipt, Scissors, ShieldCheck, Smartphone, Sparkles, Star, TrendingUp,
  Users, Wallet, X, ListOrdered, Zap,
} from 'lucide-react'
import { useLanding } from '../hooks/useLanding.js'
import { useAuthStore } from '../store/authStore.js'
import { initMetaPixel, trackPixel } from '../lib/metaPixel.js'
import { formatRupiah, formatRupiahShort } from '../utils/format.js'
import './landing-semba.css'

// ── Catatan tema ────────────────────────────────────────────────────────────
// Landing publik SELALU terang. Seluruh tampilan di-render di dalam root
// `<div className="semba">` dan SEMUA CSS-nya di-scope di landing-semba.css
// (prefix `.semba`) agar tema "barbershop heritage × SaaS modern" tidak bocor
// ke aplikasi tenant (yang berpalet indigo). Palet: ink #16140F · krem #F6F1E7
// · brass #E0A82E · hijau #1F3D34. Font: Bricolage Grotesque + Plus Jakarta Sans.
//
// Konten tetap DINAMIS: hero/fitur/section/testimoni/FAQ/paket/statistik & urutan
// section (array `layout`) semuanya bersumber dari /api/landing dan bisa diubah di
// /super-admin/landing. Hero & Footer terkunci; section di antaranya dirender
// lewat BLOCK_REGISTRY mengikuti `layout`.

// Animasi count-up angka statistik.
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

// Registry ikon untuk lookup dinamis (nama ikon disimpan sebagai string di
// config landing). Named import → Rollup tree-shake hanya ikon ini. Ikon tak
// dikenal jatuh ke fallback (Sparkles), jadi config lama tetap aman.
const Lucide = {
  ArrowRight, BarChart3, Building2, Calendar, CalendarClock, CalendarDays,
  Check, ChevronDown, Circle, Lock, Mail, MapPin, MessageCircle, Phone, Play,
  Receipt, Scissors, ShieldCheck, Smartphone, Sparkles, Star, TrendingUp,
  Users, Wallet, X, ListOrdered, Zap,
}
function getIcon(name) { return Lucide[name] || Lucide.Sparkles }

// Fitur default — dipakai kalau super-admin belum mengisi konten hero.
const FALLBACK_FEATURES = [
  { icon: 'Scissors',      title: 'Kasir khusus barbershop', desc: 'Catat layanan, produk, sampai komisi barber sekali tap. Cepat, antrean nggak numpuk.' },
  { icon: 'ListOrdered',   title: 'Antrian digital rapi', desc: 'Pelanggan ambil nomor & lihat estimasi dari HP. Kapster tahu siapa berikutnya, nggak ada rebutan.' },
  { icon: 'CalendarClock', title: 'Booking online 24 jam', desc: 'Pelanggan booking sendiri lewat link toko. Slot terkunci otomatis tanpa balas chat satu-satu.' },
  { icon: 'Building2',     title: 'Banyak cabang, satu layar', desc: 'Pantau semua cabang dari satu dashboard. Kelihatan mana yang paling cuan.' },
  { icon: 'TrendingUp',    title: 'Laporan yang ngerti sendiri', desc: 'Omzet harian, layanan terlaris, performa barber — kebaca otomatis tanpa Excel.' },
  { icon: 'MessageCircle', title: 'WhatsApp otomatis', desc: 'Konfirmasi booking dan struk langsung mampir ke WhatsApp pelanggan.' },
]

const FALLBACK_TRUST = ['Tanpa kartu kredit', 'Setup 5 menit', 'Bisa dibatalkan kapan saja']

// Baris perbandingan "cara lama vs SembaPOS" — dipakai CompareSection (sebelum/sesudah).
const COMPARE_ROWS = [
  { aspect: 'Antrian',         before: 'Ditulis di kertas, sering salah urutan',       after: 'Antrian digital rapi, pelanggan lihat dari HP' },
  { aspect: 'Booking',         before: 'Balas chat WA satu-satu, sering bentrok',       after: 'Booking online 24 jam, slot terkunci otomatis' },
  { aspect: 'Kas',             before: 'Dihitung manual, sering tidak cocok',           after: 'Tercatat real-time, selalu cocok' },
  { aspect: 'Komisi barber',   before: 'Dihitung satu-satu tiap akhir bulan',           after: 'Terhitung otomatis tiap transaksi' },
  { aspect: 'Banyak cabang',   before: 'Harus telpon tiap cabang buat tahu omzet',      after: 'Semua cabang terpantau dari satu layar' },
]

const FALLBACK_STEPS = [
  { title: 'Daftar & atur cabang', desc: 'Bikin akun gratis, masukkan layanan, harga, dan kapster. Selesai dalam 5 menit.' },
  { title: 'Bagikan link booking', desc: 'Tempel link booking di bio Instagram & WhatsApp. Pelanggan mulai booking hari itu juga.' },
  { title: 'Kelola & lihat laporan', desc: 'Layani antrian, catat transaksi, pantau omzet semua cabang dari satu dashboard.' },
]

const FALLBACK_SECTIONS = {
  features:     { kicker: 'Fitur Lengkap',  title: 'Semua yang dibutuhkan barbershop modern.', subtitle: 'Satu aplikasi untuk operasional harian sampai keputusan bisnis. Dirancang khusus untuk barbershop — bukan template kasir generik.' },
  steps:        { kicker: 'Cara Kerja',     title: 'Siap pakai dalam 3 langkah.', subtitle: 'Tidak perlu teknisi, tidak perlu pelatihan panjang. Daftar pagi, sore sudah jalan.' },
  compare:      { kicker: 'Sebelum vs Sesudah', title: 'Dari serba manual jadi serba otomatis.', subtitle: 'Perbedaan yang langsung terasa di hari pertama — bukan sekadar ganti alat, tapi ganti cara kerja.' },
  roi:          { kicker: 'Hitung Kebocoran Anda', title: 'Berapa rupiah yang menguap tiap bulan?', subtitle: 'Geser sesuai kondisi barbershop Anda dan lihat potensi tambahan omzet yang bisa diselamatkan.' },
  pricing:      { kicker: 'Harga',          title: 'Harga jujur, sesuai skala Anda.', subtitle: 'Mulai gratis 14 hari. Tanpa kartu kredit, tanpa biaya tersembunyi. Batalkan kapan saja.' },
  testimonials: { kicker: 'Kata Mereka',    title: 'Pemilik barbershop yang sudah pindah ke SembaPOS.', subtitle: 'Mereka sudah pindah dari catatan manual ke SembaPOS — dan nggak mau balik lagi.' },
  faq:          { kicker: 'FAQ',            title: 'Pertanyaan yang sering ditanya.', subtitle: 'Belum nemu jawabannya? Chat tim kami langsung lewat WhatsApp.' },
}

const FALLBACK_CLOSING = {
  title:    'Saatnya barbershop Anda naik kelas.',
  subtitle: 'Gabung dengan barbershop yang sudah mengelola bisnisnya tanpa ribet. Coba gratis 14 hari — tanpa risiko.',
  ctaLabel: 'Mulai Gratis 14 Hari',
}

const FALLBACK_FOOTER = 'Sistem manajemen barbershop modern: kasir, antrian, booking online, multi-cabang, dan laporan pintar dalam satu aplikasi.'

const FALLBACK_SEO = {
  title:       'SembaPOS — Sistem Manajemen Barbershop Modern',
  description: 'Kasir, antrian, booking online, multi-cabang, dan laporan pintar — semua dalam satu aplikasi yang dirancang khusus untuk barbershop. Coba gratis 14 hari, tanpa kartu kredit.',
  keywords:    'aplikasi barbershop, POS barbershop, manajemen barbershop, kasir barbershop, booking barbershop, antrian barbershop',
}

function upsertMeta(selector, content) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    const m = selector.match(/\[(name|property)="([^"]+)"\]/)
    if (m) el.setAttribute(m[1], m[2])
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

// Urutan section default kalau /api/landing belum mengembalikan `layout`.
const FALLBACK_LAYOUT = ['stats', 'features', 'compare', 'steps', 'roi', 'pricing', 'testimonials', 'faq', 'closingCta']
  .map(t => ({ id: t, type: t, visible: true }))

// Render judul hero — 2 kata terakhir disorot garis brass (.hl) mengikuti desain.
// Judul ≤2 kata seluruhnya jadi sorotan.
function renderHeroTitle(title) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  if (words.length <= 2) return <span className="hl">{words.join(' ')}</span>
  const head = words.slice(0, -2).join(' ')
  const tail = words.slice(-2).join(' ')
  return <>{head} <span className="hl">{tail}</span></>
}

function toEmbedUrl(url) {
  if (!url) return null
  const u = String(url).trim()
  let m
  if ((m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/)))
    return `https://www.youtube.com/embed/${m[1]}`
  if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)))
    return `https://player.vimeo.com/video/${m[1]}`
  return u
}

const PKG_TAGLINE = {
  Basic:      'Untuk barbershop tunggal yang baru mulai rapikan operasional.',
  Solo:       'Untuk barbershop tunggal yang baru mulai rapikan operasional.',
  Pro:        'Untuk barbershop berkembang dengan tim & pelanggan yang ramai.',
  Bisnis:     'Untuk jaringan multi-cabang & franchise yang butuh kontrol penuh.',
  Enterprise: 'Untuk jaringan multi-cabang & franchise yang butuh kontrol penuh.',
}

const BENEFIT_ORDER = [
  ['pos',             'Kasir cepat: layanan, produk & struk'],
  ['queue',           'Papan antrian biar giliran rapi'],
  ['booking',         'Pelanggan booking online sendiri'],
  ['loyalty',         'Poin & reward buat pelanggan setia'],
  ['voucher',         'Bikin voucher & promo diskon'],
  ['barber_rating',   'Pelanggan kasih rating ke barber'],
  ['schedule',        'Atur jadwal kerja barber'],
  ['attendance',      'Absensi staf via GPS'],
  ['expense_tracking','Catat pengeluaran & hitung laba bersih'],
  ['pwa',             'Aplikasi bisa dipasang di HP'],
  ['reports',         'Laporan omzet & analitik lengkap'],
  ['heatmap',         'Lihat jam tersibuk toko'],
  ['clv',             'Kenali pelanggan paling bernilai'],
  ['wilayah_report',  'Lihat pelanggan datang dari mana'],
  ['whatsapp',        'Struk & pengingat via WhatsApp'],
  ['whatsapp_logs',   'Pantau status pesan WhatsApp terkirim'],
  ['multi_branch',    'Kelola banyak cabang sekaligus'],
  ['backup',          'Backup & restore data toko'],
  ['api_access',      'Akses API untuk integrasi'],
  ['payroll',         'Komisi & payroll barber otomatis'],
]

function cardBenefits(p, prev) {
  const feats = new Set(p.features || [])
  const staffLine = p.maxStaff >= 99 ? 'Anggota tim tanpa batas' : `Tim hingga ${p.maxStaff} orang`
  const branchLine = p.maxBranches > 1 ? `Kelola hingga ${p.maxBranches} cabang` : 'Kelola 1 cabang'
  if (!prev) {
    const lines = [branchLine, staffLine]
    for (const [id, text] of BENEFIT_ORDER) if (feats.has(id)) lines.push(text)
    return { inheritFrom: null, lines }
  }
  const prevFeats = new Set(prev.features || [])
  const lines = []
  if (p.maxStaff > prev.maxStaff) lines.push(staffLine)
  if (p.maxBranches > prev.maxBranches) lines.push(branchLine)
  for (const [id, text] of BENEFIT_ORDER) if (feats.has(id) && !prevFeats.has(id)) lines.push(text)
  if (lines.length === 0) lines.push('Kapasitas lebih besar & prioritas dukungan')
  return { inheritFrom: prev.name, lines }
}

function normalizeWa(input) {
  if (!input) return null
  const digits = String(input).replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0'))  return `62${digits.slice(1)}`
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('8'))  return `62${digits}`
  return digits
}

// Harga ringkas tanpa prefix "Rp" (prefix di-render terpisah di kartu).
const priceShort = (n) => formatRupiahShort(n).replace('Rp', '')

// `heroLayout` dipertahankan demi kompatibilitas rute (/preview-hero) — desain
// baru bersifat tunggal (split), jadi prop ini tidak lagi mengubah tampilan.
export default function LandingPage() {
  const { data, isLoading } = useLanding()
  const { user, isAuthenticated } = useAuthStore()

  const isPreview = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === '1'

  // Mode preview (iframe builder super-admin) — terima layout via postMessage.
  const [previewLayout, setPreviewLayout] = useState(null)
  useEffect(() => {
    if (!isPreview) return
    const onMsg = (e) => {
      if (e.origin !== window.location.origin) return
      if (e.data?.type === 'sembapos-preview-layout' && Array.isArray(e.data.layout)) {
        setPreviewLayout(e.data.layout)
      }
    }
    window.addEventListener('message', onMsg)
    try { window.parent?.postMessage({ type: 'sembapos-preview-ready' }, window.location.origin) } catch {}
    return () => window.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    const original = document.title
    const html = document.documentElement
    const meta = document.querySelector('meta[name="theme-color"]')
    const prevThemeColor = meta?.content
    html.classList.add('is-landing')
    if (meta) meta.content = '#F6F1E7'
    return () => {
      document.title = original
      html.classList.remove('is-landing')
      if (meta && prevThemeColor) meta.content = prevThemeColor
    }
  }, [])

  // Muat font desain (Bricolage Grotesque + JetBrains Mono). Plus Jakarta Sans
  // sudah dimuat index.html; injeksi di sini menjamin tetap ada saat masuk via
  // navigasi client-side.
  useEffect(() => {
    if (document.getElementById('semba-fonts')) return
    const l = document.createElement('link')
    l.id = 'semba-fonts'
    l.rel = 'stylesheet'
    l.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Plus+Jakarta+Sans:ital,wght@0,400..800;1,400..600&family=JetBrains+Mono:wght@400;500&display=swap'
    document.head.appendChild(l)
  }, [])

  const hero = data?.hero || {}
  const siteName = (hero.siteName || 'SembaPOS').trim()
  const metaPixelId = hero.metaPixelId
  useEffect(() => {
    if (isPreview) return
    if (metaPixelId) initMetaPixel(metaPixelId)
  }, [metaPixelId, isPreview])

  // Sticky CTA bar — muncul setelah hero, sembunyi mendekati footer.
  const [showStickyCta, setShowStickyCta] = useState(false)
  useEffect(() => {
    if (isPreview) return
    const milestones = [25, 50, 75, 100]
    const fired = new Set()
    const onScroll = () => {
      const y = window.scrollY
      const nearBottom = window.innerHeight + y > document.documentElement.scrollHeight - 720
      setShowStickyCta(y > 620 && !nearBottom)
      const doc = document.documentElement
      const scrollable = doc.scrollHeight - window.innerHeight
      if (scrollable > 0) {
        const pct = ((y + window.innerHeight) / doc.scrollHeight) * 100
        for (const m of milestones) {
          if (pct >= m && !fired.has(m)) { fired.add(m); trackPixel('ScrollDepth', { percent: m }) }
        }
      }
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isPreview])

  // SEO dinamis — judul, meta, Open Graph, Twitter, canonical, JSON-LD.
  useEffect(() => {
    const seoTitle = (hero.seoTitle || `${siteName} — Sistem Manajemen Barbershop Modern`).trim()
    const seoDesc  = (hero.seoDescription || FALLBACK_SEO.description).trim()
    const seoKeys  = (hero.seoKeywords || FALLBACK_SEO.keywords).trim()
    const origin   = window.location.origin
    const pageUrl  = origin + '/'
    let ogImage    = (hero.seoOgImage || '/og-image.svg').trim()
    if (ogImage.startsWith('/')) ogImage = origin + ogImage

    document.title = seoTitle
    upsertMeta('meta[name="description"]', seoDesc)
    upsertMeta('meta[name="keywords"]', seoKeys)
    upsertMeta('meta[property="og:title"]', seoTitle)
    upsertMeta('meta[property="og:description"]', seoDesc)
    upsertMeta('meta[property="og:image"]', ogImage)
    upsertMeta('meta[property="og:url"]', pageUrl)
    upsertMeta('meta[name="twitter:title"]', seoTitle)
    upsertMeta('meta[name="twitter:description"]', seoDesc)
    upsertMeta('meta[name="twitter:image"]', ogImage)

    let canon = document.head.querySelector('link[rel="canonical"]')
    if (!canon) { canon = document.createElement('link'); canon.rel = 'canonical'; document.head.appendChild(canon) }
    canon.setAttribute('href', pageUrl)

    if (hero.siteFavicon) {
      let icon = document.head.querySelector('link[rel="icon"]')
      if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon) }
      icon.setAttribute('type', 'image/png')
      icon.setAttribute('href', hero.siteFavicon)
    }

    const tlist = data?.testimonials || []
    const org = { '@type': 'Organization', '@id': pageUrl + '#organization', name: siteName, url: pageUrl, logo: ogImage }
    if (hero.contactEmail)   org.email     = hero.contactEmail
    if (hero.contactPhone)   org.telephone = hero.contactPhone
    if (hero.contactAddress) org.address   = hero.contactAddress
    const app = {
      '@type': 'SoftwareApplication', name: siteName, applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web', description: seoDesc, url: pageUrl,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'IDR', description: 'Uji coba gratis 14 hari' },
    }
    if (tlist.length > 0) {
      const avg = tlist.reduce((s, t) => s + (t.rating || 5), 0) / tlist.length
      app.aggregateRating = { '@type': 'AggregateRating', ratingValue: avg.toFixed(1), reviewCount: String(tlist.length), bestRating: '5' }
    }
    const graph = [org, app]
    const faqList = (data?.faqs || []).filter(f => f?.question && f?.answer)
    if (faqList.length > 0) {
      graph.push({
        '@type': 'FAQPage',
        mainEntity: faqList.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
      })
    }
    const ld = { '@context': 'https://schema.org', '@graph': graph }
    let ldEl = document.getElementById('sembapos-jsonld')
    if (!ldEl) { ldEl = document.createElement('script'); ldEl.type = 'application/ld+json'; ldEl.id = 'sembapos-jsonld'; document.head.appendChild(ldEl) }
    ldEl.textContent = JSON.stringify(ld)
    return () => { document.getElementById('sembapos-jsonld')?.remove() }
  }, [data])

  const features = (hero.features?.length ? hero.features : FALLBACK_FEATURES)
  const trustItems = (hero.trustItems?.length ? hero.trustItems : FALLBACK_TRUST)
  const steps = (hero.steps?.length ? hero.steps : FALLBACK_STEPS)
  const sections = { ...FALLBACK_SECTIONS, ...(hero.sections || {}) }
  const closing = { ...FALLBACK_CLOSING, ...(hero.closingCta || {}) }
  const footerText = hero.footerText || FALLBACK_FOOTER
  const testimonials = data?.testimonials || []
  const faqs = data?.faqs || []
  const packages = data?.packages || []
  const stats = data?.stats || null
  const layout = previewLayout
    || ((Array.isArray(data?.layout) && data.layout.length) ? data.layout : FALLBACK_LAYOUT)
  const waNumber = normalizeWa(hero.whatsappCta)
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Halo, saya tertarik dengan ${siteName}.`)}`
    : null

  const homePath = user?.role === 'super_admin' ? '/super-admin/dashboard'
                 : user?.role === 'tenant_admin' ? '/admin/dashboard' : '/'
  const ctaTo = isAuthenticated ? homePath : '/register'
  const ctaLabel = isAuthenticated ? 'Buka Dashboard' : (hero.heroCtaLabel || 'Coba Gratis 14 Hari')

  const compareRows = (hero.compareRows?.length ? hero.compareRows : COMPARE_ROWS)
  const ctx = { hero, features, steps, sections, compareRows, packages, testimonials, faqs, stats, isLoading, closing, waHref, siteName, showStats: hero.showStats !== false }

  return (
    <div className="semba">
      <Nav isAuthed={isAuthenticated} homePath={homePath} logo={hero.siteLogo} siteName={siteName} ctaLabel={ctaLabel} ctaTo={ctaTo} />

      <HeroSection
        hero={hero} stats={stats} trustItems={trustItems} siteName={siteName}
        ctaTo={ctaTo} ctaLabel={ctaLabel} isAuthenticated={isAuthenticated}
        showStats={hero.showStats !== false}
      />

      {layout.filter(b => b && b.visible !== false).map(b => {
        const Comp = BLOCK_REGISTRY[b.type]
        return Comp ? <Comp key={b.id || b.type} block={b} ctx={ctx} /> : null
      })}

      <Footer text={footerText} logo={hero.siteLogo} siteName={siteName} waHref={waHref}
        contact={{ phone: hero.contactPhone || '', email: hero.contactEmail || '', address: hero.contactAddress || '' }} />

      <StickyCtaBar show={showStickyCta} siteName={siteName} to={ctaTo} label={ctaLabel}
        note={isAuthenticated ? 'Lanjutkan ke aplikasi kamu' : trustItems.join(' · ')}
        onCta={() => { if (!isAuthenticated) trackPixel('Lead') }} />

      {waHref && (
        <a href={waHref} target="_blank" rel="noopener noreferrer" aria-label="Konsultasi via WhatsApp"
          style={{
            position: 'fixed', right: 24, bottom: showStickyCta ? 96 : 24, zIndex: 58,
            width: 54, height: 54, borderRadius: '50%', background: '#25D366',
            display: 'grid', placeItems: 'center', boxShadow: '0 10px 30px -6px rgba(37,211,102,0.6)',
            transition: 'bottom .3s ease',
          }}>
          <MessageCircle size={24} color="#fff" />
        </a>
      )}
    </div>
  )
}

// ── Helper tampilan ──────────────────────────────────────────────────────────

function SectionHead({ kicker, title, subtitle }) {
  return (
    <div className="section-head">
      {kicker && <span className="eyebrow" style={{ justifyContent: 'center' }}>{kicker}</span>}
      {title && <h2>{title}</h2>}
      {subtitle && <p>{subtitle}</p>}
    </div>
  )
}

function Nav({ isAuthed, homePath, logo, siteName, ctaLabel, ctaTo }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <nav className={`nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="wrap nav-inner">
        <Link to="/" className="logo">
          {logo ? (
            <img src={logo} alt={siteName} style={{ height: 36, width: 'auto', maxWidth: 180, objectFit: 'contain' }} />
          ) : (
            <><span className="logo-mark"><span>{siteName.charAt(0).toUpperCase()}</span></span>{siteName}</>
          )}
        </Link>
        <div className="nav-links">
          <a href="#fitur">Fitur</a>
          <a href="#cara">Cara Kerja</a>
          <a href="#harga">Harga</a>
          <a href="#testimoni">Testimoni</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="nav-cta">
          {isAuthed
            ? <Link to={homePath} className="nav-login">Dashboard</Link>
            : <Link to="/login" className="nav-login">Masuk</Link>}
          <Link to={ctaTo} onClick={() => { if (!isAuthed) trackPixel('Lead') }} className="btn btn-accent">{ctaLabel}</Link>
        </div>
      </div>
    </nav>
  )
}

function HeroSection({ hero, stats, trustItems, ctaTo, ctaLabel, isAuthenticated, showStats }) {
  const tenantCount = stats?.tenantCount || 0
  const badge = hero.brandTagline
    || (showStats && tenantCount >= 10
      ? `Dipercaya ${tenantCount.toLocaleString('id-ID')}+ barbershop di Indonesia`
      : 'Dibuat khusus untuk barbershop Indonesia')
  return (
    <header className="hero" id="top">
      <div className="wrap hero-grid">
        <motion.div className="hero-text" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
          <span className="hero-badge"><span className="dot" />{badge}</span>
          <h1>{renderHeroTitle(hero.heroTitle || 'Kelola barbershop Anda tanpa ribet')}</h1>
          <p className="hero-sub">
            {hero.heroSubtitle || 'Isi kursi lebih penuh, kas selalu cocok, pantau semua cabang dari HP. Kasir, antrian, booking online, dan laporan pintar — semua jadi satu aplikasi.'}
          </p>
          <div className="hero-actions">
            <Link to={ctaTo} onClick={() => { if (!isAuthenticated) trackPixel('Lead') }} className="btn btn-primary">
              {ctaLabel} <ArrowRight />
            </Link>
            <a href="#fitur" className="btn btn-ghost"><Play fill="currentColor" stroke="none" /> Lihat Demo</a>
          </div>
          <div className="hero-trust">
            {trustItems.map((item, i) => (
              <span className="ck" key={i}><Check strokeWidth={3} /> {item}</span>
            ))}
          </div>
        </motion.div>

        <motion.div className="hero-visual" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.25 }}>
          <div className="hero-stage">
            <div className="float-tag float-1">
              <span className="ic"><Wallet /></span>
              +32% omzet bulan ini
            </div>
            <DashboardMock />
            <PhoneQueue />
          </div>
        </motion.div>
      </div>
    </header>
  )
}

// Mock dashboard hero — div-styled (kelas .dash dari desain), tanpa aset.
function DashboardMock() {
  const bars = [38, 55, 42, 70, 60, 88, 64]
  return (
    <div className="dash">
      <div className="dash-bar">
        <span className="d" /><span className="d" /><span className="d" />
        <span className="tab">app.sembapos.com/dashboard</span>
      </div>
      <div className="dash-body">
        <div className="dash-side">
          <div className="si on" /><div className="si" /><div className="si" /><div className="si" /><div className="si" />
        </div>
        <div className="dash-main">
          <div className="dash-h">
            <div><h4>Ringkasan Hari Ini</h4><div className="sub">Pantau toko real-time</div></div>
            <span className="dash-pill">● Live</span>
          </div>
          <div className="stat-row">
            <div className="stat"><div className="lab">Omzet</div><div className="val">Rp 4,2jt</div></div>
            <div className="stat"><div className="lab">Pelanggan</div><div className="val">38</div></div>
            <div className="stat"><div className="lab">Antrian</div><div className="val acc">6</div></div>
          </div>
          <div className="chart">
            {bars.map((h, i) => <span key={i} className="bar" style={{ height: `${h}%` }} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

// HP antrian live di hero — antrian auto-advance ringan (nomor tetap A1–A3).
function PhoneQueue() {
  const pool = [
    ['Budi Santoso', 'Haircut + Shaving'],
    ['Andi Pratama', 'Haircut'],
    ['Rizky H.', 'Coloring'],
    ['Dimas Putra', 'Haircut + Beard'],
    ['Fauzan A.', 'Coloring'],
  ]
  const [start, setStart] = useState(0)
  useEffect(() => {
    const motionOk = !window.matchMedia || window.matchMedia('(prefers-reduced-motion: no-preference)').matches
    if (!motionOk) return
    const id = setInterval(() => setStart((s) => (s + 1) % pool.length), 3200)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const visible = [0, 1, 2].map((k) => pool[(start + k) % pool.length])
  return (
    <div className="phone">
      <div className="phone-screen">
        <div className="ph-top">
          <div className="t">Antrian Live</div>
          <div className="s">Cabang Kemang · {pool.length} menunggu</div>
        </div>
        <div className="ph-q">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((p, i) => (
              <motion.div
                key={p[0]}
                layout
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.4 }}
                className={`ph-card${i === 0 ? ' active' : ''}`}
              >
                <div className="av">✂️</div>
                <div><div className="nm">{p[0]}</div><div className="mt">{p[1]}</div></div>
                <div className="num">A{i + 1}</div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ── Blok core ────────────────────────────────────────────────────────────────

// Stat strip gelap dengan angka brass. Bersumber statistik real-time.
function StatsSection({ ctx }) {
  const { stats, showStats } = ctx
  if (!stats || !showStats) return null
  const cells = [
    { to: stats.tenantCount,      label: 'Barbershop aktif' },
    { to: stats.branchCount,      label: 'Cabang terkelola' },
    { to: stats.transactionCount, label: 'Transaksi diproses' },
    { to: stats.customerCount,    label: 'Pelanggan tercatat' },
  ]
  return (
    <section className="stripmetrics">
      <div className="wrap">
        <div className="sm-grid">
          {cells.map((c) => (
            <div className="sm-cell" key={c.label}>
              <div className="v"><CountUp to={c.to} /><span className="u">+</span></div>
              <div className="l">{c.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// Label tag fitur (mono kecil) diturunkan dari ikon yang dipilih super-admin.
const FEATURE_TAG = {
  Scissors: 'Kasir / POS', Receipt: 'Kasir / POS', Wallet: 'Komisi & Payroll',
  ListOrdered: 'Antrian Digital', CalendarClock: 'Booking Online', Calendar: 'Booking Online',
  CalendarDays: 'Booking Online', Building2: 'Multi-Cabang', TrendingUp: 'Laporan Pintar',
  BarChart3: 'Laporan Pintar', MessageCircle: 'WhatsApp', ShieldCheck: 'Keamanan',
}

function FeaturesSection({ ctx }) {
  const { features, sections } = ctx
  return (
    <section className="section" id="fitur">
      <div className="wrap">
        <SectionHead {...sections.features} />
        {features.map((f, i) => {
          const Icon = getIcon(f.icon)
          const rev = i % 2 === 1
          const tag = FEATURE_TAG[f.icon] || 'Fitur Unggulan'
          return (
            <motion.div
              key={i}
              className={`feat${rev ? ' rev' : ''}`}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5 }}
            >
              <div className="feat-text">
                <span className="tag"><span className="dt" />{tag}</span>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
                <a href="#harga" className="feat-link">Pelajari {tag.toLowerCase()} <ArrowRight /></a>
              </div>
              <div className="feat-visual" style={rev ? { order: 1 } : undefined}>
                <FeatureVisual feature={f} Icon={Icon} />
              </div>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}

// Visual fitur: video/screenshot (bila super-admin mengunggah) → kalau tidak,
// mock div bawaan sesuai ikon (POS/antrian/booking/cabang/laporan), fallback ikon.
function FeatureVisual({ feature, Icon }) {
  const video = feature.video || feature.videoUrl
  if (video) {
    return (
      <div className="fv-card" style={{ padding: 0, overflow: 'hidden' }}>
        <video src={video} poster={feature.image || undefined} autoPlay loop muted playsInline preload="metadata"
          style={{ width: '100%', display: 'block', borderRadius: 'inherit' }} />
      </div>
    )
  }
  if (feature.image) {
    return (
      <div className="fv-card" style={{ padding: 0, overflow: 'hidden' }}>
        <img src={feature.image} alt={feature.title} loading="lazy" style={{ width: '100%', display: 'block' }} />
      </div>
    )
  }
  switch (feature.icon) {
    case 'ListOrdered': return <QueueMock />
    case 'CalendarClock': case 'Calendar': case 'CalendarDays': return <BookingMock />
    case 'Building2': return <BranchMock />
    case 'TrendingUp': case 'BarChart3': return <ReportMock />
    case 'Scissors': case 'Receipt': case 'Wallet': return <PosMock />
    default: return <GenericMock feature={feature} Icon={Icon} />
  }
}

function PosMock() {
  return (
    <div className="fv-card">
      <div className="pos-head"><span className="t">Transaksi Baru</span><span className="dash-pill">Kapster: Dimas</span></div>
      <div className="pos-grid">
        <div className="pos-item sel"><span className="nm">Haircut</span><span className="pr">Rp 45.000</span></div>
        <div className="pos-item sel"><span className="nm">Shaving</span><span className="pr">Rp 25.000</span></div>
        <div className="pos-item"><span className="nm">Coloring</span><span className="pr">Rp 120.000</span></div>
        <div className="pos-item"><span className="nm">Pomade</span><span className="pr">Rp 85.000</span></div>
      </div>
      <div className="pos-total"><span className="lab">Total · 2 item</span><span className="val">Rp 70.000</span></div>
    </div>
  )
}
function QueueMock() {
  return (
    <div className="fv-card">
      <div className="pos-head"><span className="t">Antrian Berjalan</span><span className="dash-pill">● 6 menunggu</span></div>
      <div className="q-list">
        <div className="q-item now"><span className="qn">A1</span><div className="qd"><div className="nm">Budi Santoso</div><div className="sv">Haircut + Shaving · Dimas</div></div><span className="qt">Sedang dilayani</span></div>
        <div className="q-item"><span className="qn">A2</span><div className="qd"><div className="nm">Andi Pratama</div><div className="sv">Haircut · Reza</div></div><span className="qt">~8 mnt</span></div>
        <div className="q-item"><span className="qn">A3</span><div className="qd"><div className="nm">Rizky Hidayat</div><div className="sv">Coloring · Dimas</div></div><span className="qt">~20 mnt</span></div>
      </div>
    </div>
  )
}
function BookingMock() {
  return (
    <div className="fv-card">
      <div className="pos-head"><span className="t">Pilih Jadwal · Sabtu</span><span className="dash-pill">Dimas</span></div>
      <div className="bk-cal">
        <div className="bk-slot taken">09:00</div><div className="bk-slot taken">10:00</div><div className="bk-slot">11:00</div><div className="bk-slot pick">13:00</div>
        <div className="bk-slot">14:00</div><div className="bk-slot taken">15:00</div><div className="bk-slot">16:00</div><div className="bk-slot">17:00</div>
      </div>
      <div className="bk-conf">
        <div className="ic"><Check strokeWidth={3} /></div>
        <div><div className="nm">Booking dikonfirmasi · 13:00</div><div className="mt">Haircut + Shaving · Rp 70.000</div></div>
      </div>
    </div>
  )
}
function BranchMock() {
  return (
    <div className="fv-card">
      <div className="pos-head"><span className="t">Performa Cabang</span><span className="dash-pill">Hari ini</span></div>
      <div className="mb-row"><span className="fl">🏪</span><div><div className="nm">Cabang Kemang</div><div className="lc">Jakarta Selatan</div></div><div className="rev"><div className="v">Rp 4,2jt</div><div className="g">▲ 12%</div></div></div>
      <div className="mb-row"><span className="fl">🏪</span><div><div className="nm">Cabang BSD</div><div className="lc">Tangerang</div></div><div className="rev"><div className="v">Rp 3,1jt</div><div className="g">▲ 8%</div></div></div>
      <div className="mb-row"><span className="fl">🏪</span><div><div className="nm">Cabang Bekasi</div><div className="lc">Bekasi Kota</div></div><div className="rev"><div className="v">Rp 2,7jt</div><div className="g">▲ 21%</div></div></div>
    </div>
  )
}
function ReportMock() {
  const bars = [46, 60, 52, 74, 68, 96, 80]
  const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
  return (
    <div className="fv-card">
      <div className="rp-top">
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>Omzet Minggu Ini</div>
          <div className="big"><span className="cur">Rp</span> 28,4jt</div>
        </div>
        <span className="gain">▲ 18% vs minggu lalu</span>
      </div>
      <div className="rp-chart">
        {bars.map((h, i) => (
          <div className={`bar${i === 5 ? ' peak' : ''}`} key={i}><i style={{ height: `${h}%` }} /></div>
        ))}
      </div>
      <div className="rp-labels">{days.map((d) => <span key={d}>{d}</span>)}</div>
    </div>
  )
}
function GenericMock({ feature, Icon }) {
  return (
    <div className="fv-card">
      <div className="pos-head"><span className="t">{feature.title}</span><span className="dash-pill">SembaPOS</span></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 0' }}>
        <span style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(var(--accent-rgb),.14)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Icon size={28} color="var(--accent-deep)" />
        </span>
        <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6 }}>{feature.desc}</p>
      </div>
      <div className="pos-total"><span className="lab">Aktif di semua paket</span><span className="val" style={{ fontSize: 16, color: 'var(--green)' }}>✓ Siap pakai</span></div>
    </div>
  )
}

// Cara kerja — section hijau, 3 langkah. Bersumber `steps` dinamis.
function StepsSection({ ctx }) {
  const { steps, sections } = ctx
  return (
    <section className="section how" id="cara">
      <div className="wrap">
        <SectionHead {...sections.steps} />
        <div className="steps">
          {steps.map((s, i) => (
            <motion.div
              key={i} className="step"
              initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
            >
              <div className="num">{String(i + 1).padStart(2, '0')}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
              {i < steps.length - 1 && <span className="ar">→</span>}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// Sebelum vs Sesudah (ba-grid). Baris dari COMPARE_ROWS.
function CompareSection({ ctx }) {
  const { sections, compareRows } = ctx
  return (
    <section className="section" id="perbandingan">
      <div className="wrap">
        <SectionHead {...sections.compare} />
        <div className="ba-grid">
          <div className="ba-vs">VS</div>
          <motion.div className="ba-col before" initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}>
            <div className="bhead">
              <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" /></svg></span>
              <div><div className="bt">Tanpa SembaPOS</div><div className="bs">buku + chat WhatsApp</div></div>
            </div>
            <div className="ba-list">
              {compareRows.map((r) => (
                <div className="row" key={r.aspect}><X /><span><b style={{ fontWeight: 700 }}>{r.aspect}:</b> {r.before}</span></div>
              ))}
            </div>
          </motion.div>
          <motion.div className="ba-col after" initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45, delay: 0.1 }}>
            <div className="bhead">
              <span className="ic"><Zap /></span>
              <div><div className="bt">Dengan SembaPOS</div><div className="bs">semua otomatis</div></div>
            </div>
            <div className="ba-list">
              {compareRows.map((r) => (
                <div className="row" key={r.aspect}><Check strokeWidth={3} /><span><b style={{ fontWeight: 700, color: '#fff' }}>{r.aspect}:</b> {r.after}</span></div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// Kalkulator ROI interaktif (section hijau). Asumsi konservatif & berlabel estimasi.
function RoiSection({ ctx }) {
  const { sections, packages } = ctx
  const RETURN_UPLIFT = 0.06
  const LEAK_RECOVERED = 0.03
  const [custPerDay, setCustPerDay] = useState(25)
  const [avgPrice, setAvgPrice] = useState(45000)
  const [openDays, setOpenDays] = useState(26)

  const monthlyRevenue = custPerDay * avgPrice * openDays
  const upliftValue = Math.round(monthlyRevenue * RETURN_UPLIFT)
  const leakValue = Math.round(monthlyRevenue * LEAK_RECOVERED)
  const totalBenefit = upliftValue + leakValue

  const cheapest = packages?.length
    ? Math.min(...packages.map(p => Number(p.price) || Infinity).filter(Boolean))
    : 99000
  const planPrice = Number.isFinite(cheapest) && cheapest > 0 ? cheapest : 99000
  const roiMultiple = planPrice > 0 ? Math.max(1, Math.round(totalBenefit / planPrice)) : 0

  const fields = [
    { label: 'Pelanggan per hari', value: custPerDay, set: setCustPerDay, min: 5, max: 150, step: 1, disp: `${custPerDay} orang` },
    { label: 'Rata-rata nilai transaksi', value: avgPrice, set: setAvgPrice, min: 15000, max: 200000, step: 5000, disp: formatRupiahShort(avgPrice) },
    { label: 'Hari buka per bulan', value: openDays, set: setOpenDays, min: 20, max: 31, step: 1, disp: `${openDays} hari` },
  ]
  return (
    <section className="section roi" id="hitung-untung">
      <div className="wrap roi-grid">
        <div>
          <span className="eyebrow">{sections.roi.kicker}</span>
          <h2>{sections.roi.title}</h2>
          <p className="lead">{sections.roi.subtitle}</p>
          <div className="roi-controls">
            {fields.map((f) => (
              <div className="roi-field" key={f.label}>
                <label>{f.label} <b>{f.disp}</b></label>
                <input type="range" min={f.min} max={f.max} step={f.step} value={f.value}
                  onChange={(e) => f.set(Number(e.target.value))} aria-label={f.label} />
              </div>
            ))}
          </div>
        </div>
        <motion.div className="roi-card" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <div className="rlab">Estimasi manfaat / bulan</div>
          <div className="rbig">{formatRupiah(totalBenefit)}</div>
          <div className="rsub">Sekitar <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{roiMultiple}×</span> lipat dari biaya langganan yang seharusnya bisa Anda dapatkan kembali.</div>
          <div className="rsplit">
            <div className="rbox"><div className="t">Biaya langganan</div><div className="n">{formatRupiahShort(planPrice)}<span style={{ fontSize: 13, color: '#a8b5ab' }}>/bln</span></div></div>
            <div className="rbox win"><div className="t">Potensi tambahan</div><div className="n">{formatRupiahShort(totalBenefit)}</div></div>
          </div>
          <Link to="/register" onClick={() => trackPixel('Lead', { content_name: 'roi_calculator' })} className="btn btn-accent">
            Mulai selamatkan omzet <ArrowRight />
          </Link>
          <div className="rfine">*Estimasi ilustratif berdasarkan input Anda — hasil nyata bervariasi tiap barbershop.</div>
        </motion.div>
      </div>
    </section>
  )
}

function PricingSection({ ctx }) {
  const { packages, isLoading, sections } = ctx
  const [yearly, setYearly] = useState(false)
  const priceRef = useRef(null)
  const priceInView = useInView(priceRef, { once: true, margin: '-120px' })
  useEffect(() => { if (priceInView) trackPixel('ViewContent', { content_type: 'pricing' }) }, [priceInView])

  return (
    <section ref={priceRef} className="section" id="harga"
      style={{ background: 'var(--paper)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
      <div className="wrap">
        <SectionHead {...sections.pricing} />
        <div className="price-toggle">
          <span className={`lbl${!yearly ? ' on' : ''}`}>Bulanan</span>
          <button className={`pt-switch${yearly ? ' yr' : ''}`} aria-label="Ganti periode tagihan" onClick={() => setYearly(y => !y)}>
            <span className="knob" />
          </button>
          <span className={`lbl${yearly ? ' on' : ''}`}>Tahunan</span>
          <span className="pt-save">Hemat 20%</span>
        </div>

        {isLoading ? (
          <div className="price-grid">
            {[1, 2, 3].map(i => <div key={i} className="pcard" style={{ minHeight: 440 }} />)}
          </div>
        ) : (
          <div className="price-grid">
            {packages.map((p, i) => {
              const prev = i > 0 ? packages[i - 1] : null
              const featured = p.name === 'Pro'
              const { inheritFrom, lines } = cardBenefits(p, prev)
              const disc = (p.annualDiscountPercent ?? 20) / 100
              const monthly = Number(p.price) || 0
              const shown = yearly ? Math.round(monthly * (1 - disc)) : monthly
              return (
                <motion.div
                  key={p.name} className={`pcard${featured ? ' pop' : ''}`}
                  initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                >
                  {featured && <span className="ptag">Paling Populer</span>}
                  <div className="pn">{p.name}</div>
                  <div className="pd">{p.description || PKG_TAGLINE[p.name] || 'Paket fleksibel buat barbershop kamu.'}</div>
                  <div className="pp">
                    <span className="cur">Rp</span>
                    <span className="amt">{priceShort(shown)}</span>
                    <span className="per">/ bln{yearly && <span className="yrnote">ditagih tahunan</span>}</span>
                  </div>
                  <div className="pbtn">
                    <Link to="/register" state={{ packageName: p.name }} onClick={() => trackPixel('Lead', { content_name: `pricing_${p.name}` })}
                      className={`btn ${featured ? 'btn-accent' : 'btn-ghost'}`}>
                      Mulai Gratis
                    </Link>
                  </div>
                  {inheritFrom && (
                    <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, color: featured ? 'var(--accent)' : 'var(--accent-deep)' }}>
                      Semua di paket {inheritFrom}, plus:
                    </p>
                  )}
                  <ul className="plist">
                    {lines.map((line, li) => (
                      <li key={li}><Check strokeWidth={3} /> {line}</li>
                    ))}
                  </ul>
                </motion.div>
              )
            })}
          </div>
        )}

        <div className="guarantee">
          <span className="gic"><ShieldCheck /></span>
          <div>
            <div className="gt">Garansi 30 hari uang kembali</div>
            <div className="gp">Coba tanpa risiko. Kalau dalam 30 hari pertama SembaPOS tidak cocok untuk barbershop Anda, kami kembalikan 100% — tanpa banyak tanya.</div>
          </div>
        </div>
      </div>
    </section>
  )
}

function TestimonialsSection({ ctx }) {
  const { testimonials, sections } = ctx
  if (!testimonials.length) return null
  const avg = (testimonials.reduce((s, t) => s + (t.rating || 5), 0) / testimonials.length).toFixed(1).replace('.', ',')
  return (
    <section className="section" id="testimoni">
      <div className="wrap">
        <SectionHead kicker={sections.testimonials.kicker} title={sections.testimonials.title} />
        <div style={{ textAlign: 'center', marginTop: -32, marginBottom: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontWeight: 700, fontSize: 15 }}>
            <span style={{ color: 'var(--accent)', letterSpacing: 3, fontSize: 18 }}>★★★★★</span>
            <span>{avg} / 5 · diulas oleh {testimonials.length} pemilik barbershop</span>
          </span>
        </div>
        <div className="tcols" style={{ marginTop: 40 }}>
          {testimonials.map((t, i) => {
            const stars = '★'.repeat(Math.round(t.rating || 5))
            return (
              <div className={`tcard${i === 0 ? ' tfeature' : ''}`} key={t.id}>
                <div className="stars">{stars}</div>
                <p>"{t.message}"</p>
                <div className="who">
                  {t.photoUrl
                    ? <img src={t.photoUrl} alt={t.name} className="av" style={{ objectFit: 'cover' }} />
                    : <span className="av">{(t.name || '?').charAt(0).toUpperCase()}</span>}
                  <div>
                    <div className="nm">{t.name}</div>
                    <div className="rl">{[t.role, t.businessName].filter(Boolean).join(' · ')}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function FaqSection({ ctx }) {
  const { faqs, sections } = ctx
  if (!faqs.length) return null
  return (
    <section className="section" id="faq">
      <div className="wrap">
        <SectionHead kicker={sections.faq.kicker} title={sections.faq.title} />
        <div className="faq-wrap">
          {faqs.map((f, i) => (
            <details className="faq" key={f.id} open={i === 0}>
              <summary>{f.question}<span className="ico">+</span></summary>
              <div className="ans">{f.answer}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function ClosingCtaSection({ ctx }) {
  const { closing, waHref } = ctx
  return (
    <section className="cta">
      <div className="wrap">
        <div className="cta-box">
          <div className="cta-stripe" />
          <span className="cta-urgency"><span className="pulse" />{closing.urgency || 'Onboarding gratis dibantu tim kami — slot minggu ini terbatas'}</span>
          <h2>{closing.title}</h2>
          <p>{closing.subtitle}</p>
          <div className="cta-actions">
            <Link to="/register" onClick={() => trackPixel('Lead', { content_name: 'closing_cta' })} className="btn btn-accent">
              {closing.ctaLabel} <ArrowRight />
            </Link>
            {waHref && (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn btn-ghost"
                style={{ color: '#F6F1E7', borderColor: 'rgba(255,255,255,.25)' }}>
                <MessageCircle /> Tanya via WhatsApp
              </a>
            )}
          </div>
          <div className="cta-note">✓ Tanpa kartu kredit &nbsp;·&nbsp; ✓ Setup 5 menit &nbsp;·&nbsp; ✓ Batalkan kapan saja</div>
        </div>
      </div>
    </section>
  )
}

// ── Blok free (banyak instance, konten dari block.config) ────────────────────

function FreeHead({ kicker, title, subtitle }) {
  if (!title && !kicker) return null
  return (
    <div className="section-head">
      {kicker && <span className="eyebrow" style={{ justifyContent: 'center' }}>{kicker}</span>}
      {title && <h2>{title}</h2>}
      {subtitle && <p>{subtitle}</p>}
    </div>
  )
}

function GallerySection({ block }) {
  const cfg = block.config || {}
  const items = Array.isArray(cfg.items) ? cfg.items.filter(it => it && it.url) : []
  if (items.length === 0) return null
  return (
    <section className="section">
      <div className="wrap">
        <FreeHead kicker={cfg.kicker} title={cfg.title} subtitle={cfg.subtitle} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
          {items.map((it, i) => (
            <figure key={i} style={{ borderRadius: 18, overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--paper)' }}>
              <img src={it.url} alt={it.caption || ''} loading="lazy" style={{ width: '100%', height: 224, objectFit: 'cover' }} />
              {it.caption && <figcaption style={{ padding: '12px 16px', fontSize: 14, color: 'var(--ink-soft)' }}>{it.caption}</figcaption>}
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

function VideoSection({ block }) {
  const cfg = block.config || {}
  const embed = toEmbedUrl(cfg.url)
  if (!embed) return null
  return (
    <section className="section" style={{ background: 'var(--paper)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
      <div className="wrap" style={{ maxWidth: 880 }}>
        <FreeHead kicker={cfg.kicker} title={cfg.title} subtitle={cfg.subtitle} />
        <div style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 18, overflow: 'hidden', border: '1px solid var(--line)', background: '#000' }}>
          <iframe src={embed} title={cfg.title || 'Video'} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      </div>
    </section>
  )
}

function LogoStripSection({ block }) {
  const cfg = block.config || {}
  const logos = Array.isArray(cfg.logos) ? cfg.logos.filter(l => l && l.url) : []
  if (logos.length === 0) return null
  return (
    <section className="proof">
      <div className="wrap proof-inner">
        {cfg.title && <span className="proof-lab">{cfg.title}</span>}
        <div className="proof-logos">
          {logos.map((l, i) => (
            <img key={i} src={l.url} alt={l.name || ''} title={l.name || ''} loading="lazy"
              style={{ height: 40, width: 'auto', objectFit: 'contain', opacity: 0.6 }} />
          ))}
        </div>
      </div>
    </section>
  )
}

function BannerSection({ block }) {
  const cfg = block.config || {}
  if (!cfg.heading && !cfg.image) return null
  return (
    <section className="cta">
      <div className="wrap">
        <div className="cta-box">
          {cfg.image && <img src={cfg.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3 }} />}
          <div style={{ position: 'relative' }}>
            {cfg.heading && <h2>{cfg.heading}</h2>}
            {cfg.text && <p>{cfg.text}</p>}
            {cfg.ctaLabel && cfg.ctaUrl && <a href={cfg.ctaUrl} className="btn btn-accent">{cfg.ctaLabel} <ArrowRight /></a>}
          </div>
        </div>
      </div>
    </section>
  )
}

function RichTextSection({ block }) {
  const cfg = block.config || {}
  if (!cfg.heading && !cfg.body) return null
  return (
    <section className="section">
      <div className="wrap" style={{ maxWidth: 760, textAlign: 'center' }}>
        <FreeHead kicker={cfg.kicker} title={cfg.heading} />
        {cfg.body && <p style={{ fontSize: 17, color: 'var(--ink-soft)', marginTop: 16, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{cfg.body}</p>}
        {cfg.ctaLabel && cfg.ctaUrl && <a href={cfg.ctaUrl} className="btn btn-accent" style={{ marginTop: 28 }}>{cfg.ctaLabel} <ArrowRight /></a>}
      </div>
    </section>
  )
}

// Peta tipe blok → komponen (14 tipe; identik dengan builder & backend enum).
const BLOCK_REGISTRY = {
  stats:        StatsSection,
  features:     FeaturesSection,
  steps:        StepsSection,
  compare:      CompareSection,
  roi:          RoiSection,
  pricing:      PricingSection,
  testimonials: TestimonialsSection,
  faq:          FaqSection,
  closingCta:   ClosingCtaSection,
  gallery:      GallerySection,
  video:        VideoSection,
  logoStrip:    LogoStripSection,
  banner:       BannerSection,
  richText:     RichTextSection,
}

// ── Sticky CTA + Footer ──────────────────────────────────────────────────────

function StickyCtaBar({ show, siteName, label, to, note, onCta }) {
  return (
    <div className={`stickybar${show ? ' show' : ''}`}>
      <div className="wrap stickybar-inner">
        <div className="sb-text">
          <span className="sb-mark">{siteName.charAt(0).toUpperCase()}</span>
          <div>
            <div className="sb-t">Siap rapikan barbershop Anda?</div>
            <div className="sb-s">{note}</div>
          </div>
        </div>
        <div className="sb-actions">
          <Link to={to} onClick={onCta} className="btn btn-accent">{label} <ArrowRight /></Link>
        </div>
      </div>
    </div>
  )
}

function Footer({ text, logo, contact = {}, siteName, waHref }) {
  const phone = (contact.phone || '').trim()
  const email = (contact.email || '').trim()
  const address = (contact.address || '').trim()
  const waPhone = normalizeWa(phone)
  const hasContact = phone || email || address
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <div className="logo">
              {logo ? (
                <img src={logo} alt={siteName} style={{ height: 36, width: 'auto', maxWidth: 180, objectFit: 'contain' }} />
              ) : (
                <><span className="logo-mark"><span>{siteName.charAt(0).toUpperCase()}</span></span>{siteName}</>
              )}
            </div>
            <p className="footer-about">{text}</p>
          </div>
          <div className="footer-col">
            <h5>Produk</h5>
            <a href="#fitur">Fitur</a>
            <a href="#harga">Harga</a>
            <a href="#cara">Cara Kerja</a>
            <Link to="/register">Daftar Gratis</Link>
          </div>
          <div className="footer-col">
            <h5>Kontak</h5>
            {phone && <a href={waPhone ? `https://wa.me/${waPhone}` : `tel:${phone.replace(/[^\d+]/g, '')}`} target={waPhone ? '_blank' : undefined} rel={waPhone ? 'noopener noreferrer' : undefined}>{phone}</a>}
            {email && <a href={`mailto:${email}`}>{email}</a>}
            {address && <a style={{ whiteSpace: 'pre-line' }}>{address}</a>}
            {!hasContact && <a href="#">sembapos.com</a>}
          </div>
          <div className="footer-col">
            <h5>Bantuan</h5>
            <a href="#faq">FAQ</a>
            <Link to="/syarat-ketentuan">Syarat &amp; Ketentuan</Link>
            <Link to="/kebijakan-privasi">Kebijakan Privasi</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} {siteName}. Dibuat untuk barbershop Indonesia.</span>
          <div className="footer-social">
            {waHref && (
              <a href={waHref} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
                <MessageCircle />
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  )
}
