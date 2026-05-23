import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import * as Lucide from 'lucide-react'
import { useLanding } from '../hooks/useLanding.js'
import { useAuthStore } from '../store/authStore.js'
import { initMetaPixel, trackPixel } from '../lib/metaPixel.js'
import { formatRupiah } from '../utils/format.js'

// ── Catatan tema ────────────────────────────────────────────────────────────
// Landing publik SELALU terang — memakai warna eksplisit (bukan class tema
// `bg-dark`/`text-off-white`) supaya tidak ikut berubah oleh theme store app.
// Palet: ivory #FBFAF6 · krem #F5EFE3 · tinta #1C1A17 · emas #C9A84C / #A8893A.
//
// Urutan & visibilitas section dikendalikan array `layout` dari /api/landing
// (block builder super-admin). Hero & Footer terkunci di posisinya; section di
// antaranya dirender lewat BLOCK_REGISTRY mengikuti `layout`.

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

function getIcon(name) {
  return Lucide[name] || Lucide.Sparkles
}

// Fitur default — dipakai kalau super-admin belum mengisi konten hero.
const FALLBACK_FEATURES = [
  { icon: 'Scissors',      title: 'Kasir khusus barbershop', desc: 'Catat layanan, produk, sampai komisi barber sekali tap. Cepat, antrean nggak numpuk.' },
  { icon: 'CalendarClock', title: 'Booking & antrian online', desc: 'Pelanggan booking sendiri lewat link toko. Giliran rapi, nggak ada rebutan.' },
  { icon: 'Building2',     title: 'Banyak cabang, satu layar', desc: 'Pantau semua cabang dari satu dashboard. Kelihatan mana yang paling cuan.' },
  { icon: 'TrendingUp',    title: 'Laporan yang ngerti sendiri', desc: 'Omzet harian, layanan terlaris, performa barber — kebaca otomatis tanpa Excel.' },
  { icon: 'MessageCircle', title: 'WhatsApp otomatis', desc: 'Konfirmasi booking dan struk langsung mampir ke WhatsApp pelanggan.' },
  { icon: 'ShieldCheck',   title: 'Aman & sesuai peran', desc: 'Owner, kasir, barber — tiap orang punya akses sendiri. Data toko tetap aman.' },
]

// Fallback konten section — dipakai kalau super-admin belum mengisinya.
// Backend mengembalikan default yang sama; ini cuma jaring pengaman saat API
// gagal/loading supaya landing tidak pernah tampil kosong.
const FALLBACK_TRUST = ['Gratis 14 hari', 'Tanpa kartu kredit', 'Aktif langsung']

const FALLBACK_STEPS = [
  { title: 'Daftar gratis',  desc: 'Bikin akun toko cuma semenit. Langsung dapat masa coba 14 hari, tanpa kartu kredit.' },
  { title: 'Atur toko kamu', desc: 'Tambah cabang, layanan, dan tim. Ada checklist panduan biar nggak ada yang kelewat.' },
  { title: 'Mulai melayani', desc: 'Buka kasir, terima booking, pantau omzet. Sisanya biar aplikasi yang urus.' },
]

const FALLBACK_SECTIONS = {
  features:     { kicker: 'Fitur Lengkap',  title: 'Semua yang barbershop kamu butuhin', subtitle: 'Nggak perlu spreadsheet atau aplikasi terpisah. Dari kasir sampai laporan pemilik, semua sudah satu paket.' },
  steps:        { kicker: 'Gampang Banget', title: 'Mulai cuma 3 langkah', subtitle: 'Dari daftar sampai toko jalan, bisa kelar hari ini juga. Beneran.' },
  pricing:      { kicker: 'Paket Harga',    title: 'Harga jelas, tanpa kejutan', subtitle: 'Mulai gratis 14 hari. Bayar cuma kalau toko kamu makin ramai — bisa naik paket kapan saja.' },
  testimonials: { kicker: 'Testimoni',      title: 'Kata para owner barbershop', subtitle: 'Mereka sudah pindah dari catatan manual ke SembaPOS — dan nggak mau balik lagi.' },
  faq:          { kicker: 'Tanya Jawab',    title: 'Masih ragu? Wajar kok', subtitle: 'Belum nemu jawabannya? Chat tim kami langsung lewat WhatsApp.' },
}

const FALLBACK_CLOSING = {
  title:    'Yuk, rapikan barbershop kamu',
  subtitle: 'Coba gratis 14 hari. Tanpa kartu kredit, tanpa biaya tersembunyi. Kalau cocok, lanjut — kalau enggak, ya sudah.',
  ctaLabel: 'Daftar Sekarang',
}

const FALLBACK_FOOTER = 'Sistem manajemen barbershop modern: kasir, antrian, booking online, multi-cabang, dan laporan pintar dalam satu aplikasi.'

// Nilai SEO default — dipakai saat /api/landing belum termuat / gagal.
const FALLBACK_SEO = {
  title:       'SembaPOS — Sistem Manajemen Barbershop Modern',
  description: 'Kasir, antrian, booking online, multi-cabang, dan laporan pintar — semua dalam satu aplikasi yang dirancang khusus untuk barbershop. Coba gratis 14 hari, tanpa kartu kredit.',
  keywords:    'aplikasi barbershop, POS barbershop, manajemen barbershop, kasir barbershop, booking barbershop, antrian barbershop',
}

// Set/perbarui satu <meta> di <head>; dibuat bila belum ada.
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
const FALLBACK_LAYOUT = ['stats', 'features', 'steps', 'pricing', 'testimonials', 'faq', 'closingCta']
  .map(t => ({ id: t, type: t, visible: true }))

// Render judul hero — 2 kata terakhir ditonjolkan emas-italic (memenuhi
// kontrak label editor super-admin). Judul ≤2 kata seluruhnya jadi emas.
function renderHeroTitle(title) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  if (words.length <= 2) {
    return <span className="italic text-[#A8893A]">{words.join(' ')}</span>
  }
  const head = words.slice(0, -2).join(' ')
  const tail = words.slice(-2).join(' ')
  return <>{head}<br /><span className="italic text-[#A8893A]">{tail}</span></>
}

// Ubah URL YouTube/Vimeo umum → URL embed untuk <iframe>.
function toEmbedUrl(url) {
  if (!url) return null
  const u = String(url).trim()
  let m
  if ((m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/)))
    return `https://www.youtube.com/embed/${m[1]}`
  if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)))
    return `https://player.vimeo.com/video/${m[1]}`
  return u // anggap sudah berupa URL embed
}

// Tagline ramah per paket (dipakai kalau `package.description` kosong).
const PKG_TAGLINE = {
  Basic:      'Pas buat barbershop yang baru mulai rapi-rapi.',
  Pro:        'Buat toko yang sudah ramai dan pengin tumbuh lebih cepat.',
  Enterprise: 'Skala besar, banyak cabang, semua fitur kebuka.',
}

// Label ramah untuk SETIAP fitur — kartu harga menampilkan seluruh fitur yang
// benar-benar ada di paket (bukan subset). Urutan = dari fitur Basic, lalu
// tambahan Pro, lalu tambahan Enterprise, supaya daftar "plus" tampil logis.
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
  ['white_label',     'Branding sendiri tanpa logo SembaPOS'],
]

// Susun daftar manfaat kartu harga. Paket dasar tampil utuh; paket lebih
// tinggi tampil sebagai selisih ("Semua di paket X, plus ...") — pola termudah
// dipahami pelanggan. Semua diturunkan dari data paket asli (real-time).
function cardBenefits(p, prev) {
  const feats = new Set(p.features || [])
  const staffLine = p.maxStaff >= 99 ? 'Anggota tim tanpa batas' : `Tim hingga ${p.maxStaff} orang`
  const branchLine = p.maxBranches > 1 ? `Kelola hingga ${p.maxBranches} cabang` : 'Kelola 1 cabang'

  if (!prev) {
    const lines = [branchLine, staffLine]
    for (const [id, text] of BENEFIT_ORDER) {
      if (feats.has(id)) lines.push(text)
    }
    return { inheritFrom: null, lines }
  }

  const prevFeats = new Set(prev.features || [])
  const lines = []
  if (p.maxStaff > prev.maxStaff) lines.push(staffLine)
  if (p.maxBranches > prev.maxBranches) lines.push(branchLine)
  for (const [id, text] of BENEFIT_ORDER) {
    if (feats.has(id) && !prevFeats.has(id)) lines.push(text)
  }
  if (lines.length === 0) lines.push('Kapasitas lebih besar & prioritas dukungan')
  return { inheritFrom: prev.name, lines }
}

// Normalisasi nomor WA → format internasional `62...`.
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
  const { data, isLoading } = useLanding()
  const { user, isAuthenticated } = useAuthStore()

  // Mode preview builder super-admin — dideteksi sekali dari query string.
  const isPreview = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === '1'

  // Mode preview (iframe builder super-admin) — terima layout langsung dari
  // builder lewat postMessage supaya perubahan yang belum disimpan ikut tampil.
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
    // Beri tahu builder bahwa iframe siap menerima layout.
    try { window.parent?.postMessage({ type: 'sembapos-preview-ready' }, window.location.origin) } catch {}
    return () => window.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    // Judul disimpan untuk dipulihkan saat keluar dari landing — nilai SEO
    // dinamis diisi oleh efek SEO terpisah di bawah.
    const original = document.title

    // Landing selalu terang — pastikan latar terang juga saat masuk lewat
    // navigasi client-side dari halaman app yang gelap (skrip di index.html
    // hanya jalan saat load awal). Dikembalikan saat keluar dari landing.
    const html = document.documentElement
    const meta = document.querySelector('meta[name="theme-color"]')
    const prevThemeColor = meta?.content
    html.classList.add('is-landing')
    if (meta) meta.content = '#FBFAF6'

    return () => {
      document.title = original
      html.classList.remove('is-landing')
      if (meta && prevThemeColor) meta.content = prevThemeColor
    }
  }, [])

  const hero = data?.hero || {}
  // Nama brand yang tampil (header/footer/judul/SEO). Bisa diubah di
  // /super-admin/landing → kolom "Nama Situs". Default 'SembaPOS'.
  const siteName = (hero.siteName || 'SembaPOS').trim()

  // Meta Pixel — aktif saat super-admin sudah mengisi Pixel ID. Dilewati di
  // mode preview builder supaya statistik iklan tidak tercemar kunjungan admin.
  const metaPixelId = hero.metaPixelId
  useEffect(() => {
    if (isPreview) return
    if (metaPixelId) initMetaPixel(metaPixelId)
  }, [metaPixelId, isPreview])

  // Sticky CTA mobile — muncul setelah pengunjung scroll melewati hero, dan
  // sembunyi lagi saat mendekati footer supaya tak menutupi CTA penutup.
  const [showStickyCta, setShowStickyCta] = useState(false)
  useEffect(() => {
    if (isPreview) return
    const onScroll = () => {
      const y = window.scrollY
      const nearBottom = window.innerHeight + y > document.documentElement.scrollHeight - 720
      setShowStickyCta(y > 620 && !nearBottom)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isPreview])

  // SEO dinamis — judul, meta description/keywords, Open Graph, Twitter Card,
  // canonical, & structured data JSON-LD. Semua bersumber dari konten yang
  // diatur super-admin (tab "SEO & Iklan"); index.html hanya jadi nilai awal.
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
    if (!canon) {
      canon = document.createElement('link')
      canon.rel = 'canonical'
      document.head.appendChild(canon)
    }
    canon.setAttribute('href', pageUrl)

    // Favicon dinamis — diterapkan ke seluruh sesi (tidak dipulihkan saat
    // keluar landing) supaya identitas merek tetap konsisten.
    if (hero.siteFavicon) {
      let icon = document.head.querySelector('link[rel="icon"]')
      if (!icon) {
        icon = document.createElement('link')
        icon.rel = 'icon'
        document.head.appendChild(icon)
      }
      icon.setAttribute('type', 'image/png')
      icon.setAttribute('href', hero.siteFavicon)
    }

    // Structured data (JSON-LD) — Organization + SoftwareApplication. Rating
    // diturunkan dari testimoni nyata supaya valid (bukan angka karangan).
    const tlist = data?.testimonials || []
    const org = {
      '@type': 'Organization',
      '@id': pageUrl + '#organization',
      name: siteName,
      url: pageUrl,
      logo: ogImage,
    }
    if (hero.contactEmail)   org.email     = hero.contactEmail
    if (hero.contactPhone)   org.telephone = hero.contactPhone
    if (hero.contactAddress) org.address   = hero.contactAddress
    const app = {
      '@type': 'SoftwareApplication',
      name: siteName,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: seoDesc,
      url: pageUrl,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'IDR', description: 'Uji coba gratis 14 hari' },
    }
    if (tlist.length > 0) {
      const avg = tlist.reduce((s, t) => s + (t.rating || 5), 0) / tlist.length
      app.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: avg.toFixed(1),
        reviewCount: String(tlist.length),
        bestRating: '5',
      }
    }
    const ld = { '@context': 'https://schema.org', '@graph': [org, app] }
    let ldEl = document.getElementById('sembapos-jsonld')
    if (!ldEl) {
      ldEl = document.createElement('script')
      ldEl.type = 'application/ld+json'
      ldEl.id = 'sembapos-jsonld'
      document.head.appendChild(ldEl)
    }
    ldEl.textContent = JSON.stringify(ld)

    return () => {
      document.getElementById('sembapos-jsonld')?.remove()
    }
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

  // Tujuan tombol utama saat user sudah login — selaras dengan logika Nav.
  const homePath = user?.role === 'super_admin' ? '/super-admin/dashboard'
                 : user?.role === 'tenant_admin' ? '/admin/dashboard' : '/'

  // Konteks bersama untuk komponen blok core.
  const ctx = { hero, features, steps, sections, packages, testimonials, faqs, stats, isLoading, closing, waHref }

  return (
    <div className="min-h-screen bg-[#FBFAF6] text-[#57534E] font-body overflow-x-hidden antialiased">
      <Nav isAuthed={isAuthenticated} userRole={user?.role} logo={hero.siteLogo} siteName={siteName} />

      <HeroSection
        hero={hero}
        stats={stats}
        trustItems={trustItems}
        isAuthenticated={isAuthenticated}
        homePath={homePath}
      />

      {layout.filter(b => b && b.visible !== false).map(b => {
        const Comp = BLOCK_REGISTRY[b.type]
        return Comp ? <Comp key={b.id || b.type} block={b} ctx={ctx} /> : null
      })}

      <Footer
        text={footerText}
        logo={hero.siteLogo}
        siteName={siteName}
        contact={{
          phone:   hero.contactPhone   || '',
          email:   hero.contactEmail   || '',
          address: hero.contactAddress || '',
        }}
      />

      {waHref && (
        <motion.a
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1 }}
          href={waHref} target="_blank" rel="noopener noreferrer"
          aria-label="Konsultasi via WhatsApp"
          className={`fixed ${showStickyCta ? 'bottom-28 md:bottom-6' : 'bottom-6'} right-6 z-40 w-14 h-14 rounded-full bg-[#25D366] hover:bg-[#1ebe5a] flex items-center justify-center shadow-[0_10px_30px_-6px_rgba(37,211,102,0.6)] transition-all`}
        >
          <Lucide.MessageCircle size={22} className="text-white" />
          <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-25" />
        </motion.a>
      )}

      <StickyCtaBar
        show={showStickyCta}
        authed={isAuthenticated}
        to={isAuthenticated ? homePath : '/register'}
        label={isAuthenticated ? 'Buka Dashboard' : (hero.heroCtaLabel || 'Coba Gratis 14 Hari')}
        note={isAuthenticated ? 'Lanjutkan ke aplikasi kamu' : trustItems.join(' · ')}
        onCta={() => { if (!isAuthenticated) trackPixel('Lead') }}
      />

      {/* Utility class lokal — landing selalu terang, lepas dari tema app */}
      <style>{`
        .btn-gold{display:inline-flex;align-items:center;gap:.5rem;padding:.95rem 1.6rem;border-radius:.85rem;
          background:#C9A84C;color:#1C1A17;font-weight:700;font-size:.95rem;
          box-shadow:0 14px 30px -10px rgba(201,168,76,.7);transition:all .2s}
        .btn-gold:hover{background:#E8C875;box-shadow:0 16px 36px -10px rgba(201,168,76,.85)}
        .btn-ghost{display:inline-flex;align-items:center;gap:.45rem;padding:.95rem 1.5rem;border-radius:.85rem;
          background:#fff;border:1px solid #E4DCC8;color:#1C1A17;font-weight:600;font-size:.95rem;transition:all .2s}
        .btn-ghost:hover{border-color:#C9A84C;background:#FDFBF4}
      `}</style>
    </div>
  )
}

// ── Blok core ────────────────────────────────────────────────────────────────

function HeroSection({ hero, stats, trustItems, isAuthenticated, homePath }) {
  const { scrollYProgress } = useScroll()
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -60])
  const heroBadge = hero.heroBadge || 'Baru'

  // Bukti sosial — pakai jumlah tenant nyata bila statistik diaktifkan & sudah
  // cukup banyak; di bawah ambang tampilkan klaim umum supaya tetap meyakinkan.
  const tenantCount = stats?.tenantCount || 0
  const showRealCount = hero.showStats !== false && tenantCount >= 10

  return (
    <section className="relative pt-32 pb-16 lg:pt-40 lg:pb-24">
      {/* Latar dekoratif — glow emas lembut + tekstur titik halus */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[820px] h-[420px] rounded-full bg-[#C9A84C]/12 blur-[120px]" />
        <div className="absolute top-48 -right-20 w-72 h-72 rounded-full bg-[#E8C875]/20 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage: 'radial-gradient(#C9A84C26 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            maskImage: 'linear-gradient(to bottom, black, transparent 70%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 70%)',
          }}
        />
      </div>

      <motion.div style={{ y: heroY }} className="max-w-3xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-white border border-[#EAE0C6] text-[#A8893A] text-xs font-semibold shadow-[0_4px_16px_-8px_rgba(201,168,76,0.5)]"
        >
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#C9A84C] text-[#1C1A17]">
            <Lucide.Sparkles size={11} /> {heroBadge}
          </span>
          {hero.brandTagline || 'Dipercaya barbershop di seluruh Indonesia'}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.06 }}
          className="font-display text-4xl leading-[1.12] sm:text-6xl sm:leading-[1.08] lg:text-7xl font-bold text-[#1C1A17] tracking-tight mt-7"
        >
          {renderHeroTitle(hero.heroTitle || 'Kelola barbershop, tanpa ribet.')}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.14 }}
          className="text-base sm:text-lg text-[#6B6459] max-w-xl mx-auto mt-6"
        >
          {hero.heroSubtitle || 'Kasir, antrian, booking online, sampai laporan pemilik — semua jadi satu aplikasi. Tinggal pakai, langsung jalan hari ini juga.'}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.22 }}
          className="flex flex-wrap items-center justify-center gap-3 mt-9"
        >
          <Link
            to={isAuthenticated ? homePath : '/register'}
            onClick={() => { if (!isAuthenticated) trackPixel('Lead') }}
            className="btn-gold group"
          >
            {isAuthenticated ? 'Buka Dashboard' : (hero.heroCtaLabel || 'Coba Gratis 14 Hari')}
            <Lucide.ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </Link>
          <a href="#fitur" className="btn-ghost">
            <Lucide.Play size={13} className="text-[#A8893A]" /> Lihat Fitur
          </a>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-[13px] text-[#9A9189] mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
        >
          {trustItems.map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-[#D8D0BE]">·</span>}
              <span className="inline-flex items-center gap-1">
                <Lucide.Check size={13} className="text-[#C9A84C]" /> {item}
              </span>
            </React.Fragment>
          ))}
        </motion.p>

        {/* Bukti sosial — kluster avatar + rating bintang + jumlah pengguna */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-7 flex items-center justify-center gap-3"
        >
          <div className="flex -space-x-2.5">
            {['A', 'R', 'B', 'S'].map((c) => (
              <div
                key={c}
                className="w-8 h-8 rounded-full border-2 border-[#FBFAF6] flex items-center justify-center text-[11px] font-bold text-[#1C1A17] bg-gradient-to-br from-[#E8C875] to-[#A8893A]"
              >
                {c}
              </div>
            ))}
            <div className="w-8 h-8 rounded-full border-2 border-[#FBFAF6] flex items-center justify-center text-[11px] font-bold text-[#A8893A] bg-[#FBF4E1]">
              +
            </div>
          </div>
          <div className="text-left">
            <div className="flex items-center gap-0.5 text-[#C9A84C]">
              {[0, 1, 2, 3, 4].map(i => <Lucide.Star key={i} size={12} fill="currentColor" />)}
            </div>
            <p className="text-[12.5px] text-[#6B6459] leading-tight mt-0.5">
              {showRealCount
                ? <>Dipercaya <strong className="font-semibold text-[#1C1A17]">{tenantCount.toLocaleString('id-ID')}+</strong> barbershop di Indonesia</>
                : 'Dibuat khusus untuk barbershop Indonesia'}
            </p>
          </div>
        </motion.div>
      </motion.div>

      {/* Showcase dashboard */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.35 }}
        className="max-w-5xl mx-auto px-6 mt-16"
      >
        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-to-tr from-[#C9A84C]/25 via-transparent to-[#E8C875]/30 rounded-[2.5rem] blur-2xl" />
          <div className="relative rounded-2xl border border-[#EAE3D3] bg-white shadow-[0_30px_70px_-30px_rgba(28,26,23,0.35)] overflow-hidden">
            <DashboardMock />
          </div>
        </div>
      </motion.div>
    </section>
  )
}

function StatsSection({ ctx }) {
  const { stats } = ctx
  if (!stats) return null
  return (
    <section className="border-y border-[#EAE3D3] bg-white">
      <div className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        {[
          { label: 'Tenant aktif',        value: stats.tenantCount,      suffix: '+', icon: 'Building2' },
          { label: 'Cabang terkelola',    value: stats.branchCount,      suffix: '+', icon: 'MapPin' },
          { label: 'Transaksi diproses',  value: stats.transactionCount, suffix: '+', icon: 'Receipt' },
          { label: 'Pelanggan tercatat',  value: stats.customerCount,    suffix: '+', icon: 'Users' },
        ].map((s) => {
          const Icon = getIcon(s.icon)
          return (
            <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <Icon size={18} className="text-[#C9A84C] mx-auto mb-2" />
              <p className="font-display text-3xl md:text-4xl font-bold text-[#1C1A17]">
                <CountUp to={s.value} suffix={s.suffix} />
              </p>
              <p className="text-xs text-[#9A9189] mt-1">{s.label}</p>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}

function FeaturesSection({ ctx }) {
  const { features, sections } = ctx
  return (
    <section id="fitur" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <SectionHeading {...sections.features} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px mt-14 rounded-2xl overflow-hidden border border-[#EAE3D3] bg-[#EAE3D3]">
          {features.map((f, i) => {
            const Icon = getIcon(f.icon)
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ delay: (i % 3) * 0.07 }}
                className="group relative bg-white p-7 hover:bg-[#FDFBF4] transition-colors"
              >
                <span className="font-display text-sm font-semibold text-[#C9A84C]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="w-11 h-11 rounded-xl bg-[#FBF4E1] border border-[#EAE0C6] flex items-center justify-center mt-3 mb-4 group-hover:bg-[#C9A84C] transition-colors">
                  <Icon size={19} className="text-[#A8893A] group-hover:text-[#1C1A17] transition-colors" />
                </div>
                <h3 className="font-display text-xl font-semibold text-[#1C1A17] mb-1.5">{f.title}</h3>
                <p className="text-sm text-[#6B6459] leading-relaxed">{f.desc}</p>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function StepsSection({ ctx }) {
  const { steps, sections } = ctx
  return (
    <section className="py-24 px-6 bg-[#F5EFE3]">
      <div className="max-w-5xl mx-auto">
        <SectionHeading {...sections.steps} />
        <div className={`grid gap-5 mt-14 ${steps.length === 2 ? 'md:grid-cols-2' : steps.length >= 4 ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'}`}>
          {steps.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="relative bg-white rounded-2xl border border-[#EAE3D3] p-7"
            >
              <span className="font-display text-5xl font-bold text-[#EAE0C6]">{i + 1}</span>
              <h3 className="font-display text-lg font-semibold text-[#1C1A17] mt-2 mb-1.5">{s.title}</h3>
              <p className="text-sm text-[#6B6459] leading-relaxed">{s.desc}</p>
              {i < steps.length - 1 && (
                <Lucide.ArrowRight size={18} className="hidden md:block absolute top-1/2 -right-4 -translate-y-1/2 text-[#C9A84C] z-10" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PricingSection({ ctx }) {
  const { packages, isLoading, sections } = ctx
  return (
    <section id="harga" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <SectionHeading {...sections.pricing} />

        {isLoading ? (
          <div className="grid md:grid-cols-3 gap-6 mt-14">
            {[1, 2, 3].map(i => <div key={i} className="h-[480px] bg-white border border-[#EAE3D3] rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6 mt-14 items-start">
            {packages.map((p, i) => {
              const prev = i > 0 ? packages[i - 1] : null
              const featured = p.name === 'Pro'
              const { inheritFrom, lines } = cardBenefits(p, prev)
              const annual = Math.round((p.price * 12 * (1 - (p.annualDiscountPercent ?? 17) / 100)) / 1000) * 1000
              return (
                <motion.div
                  key={p.name}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className={`relative rounded-2xl p-7 flex flex-col ${
                    featured
                      ? 'bg-[#1C1A17] text-[#E7E2D6] shadow-[0_30px_60px_-25px_rgba(28,26,23,0.6)] md:-mt-4 md:mb-4'
                      : 'bg-white border border-[#EAE3D3]'
                  }`}
                >
                  {featured && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#C9A84C] text-[#1C1A17] text-[11px] font-bold whitespace-nowrap">
                      <Lucide.Star size={11} fill="currentColor" /> Paling Banyak Dipilih
                    </div>
                  )}

                  <h3 className={`font-display text-2xl font-bold ${featured ? 'text-white' : 'text-[#1C1A17]'}`}>
                    {p.name}
                  </h3>
                  <p className={`text-sm mt-1 min-h-[40px] ${featured ? 'text-[#A8A29A]' : 'text-[#6B6459]'}`}>
                    {p.description || PKG_TAGLINE[p.name] || 'Paket fleksibel buat barbershop kamu.'}
                  </p>

                  <div className="mt-5 mb-1 flex items-end gap-1.5">
                    <span className={`font-display text-4xl font-bold ${featured ? 'text-white' : 'text-[#1C1A17]'}`}>
                      {formatRupiah(p.price)}
                    </span>
                    <span className={`text-sm pb-1 ${featured ? 'text-[#A8A29A]' : 'text-[#9A9189]'}`}>/bulan</span>
                  </div>
                  <p className="text-xs text-[#A8893A] font-medium">
                    Bayar tahunan {formatRupiah(annual)} — hemat {p.annualDiscountPercent ?? 17}%
                  </p>

                  <div className={`h-px my-6 ${featured ? 'bg-white/10' : 'bg-[#EAE3D3]'}`} />

                  {inheritFrom && (
                    <p className={`text-xs font-semibold mb-3 ${featured ? 'text-[#E8C875]' : 'text-[#A8893A]'}`}>
                      Semua di paket {inheritFrom}, plus:
                    </p>
                  )}
                  <ul className="space-y-3 mb-7 flex-1">
                    {lines.map((line, li) => (
                      <li key={li} className="flex items-start gap-2.5">
                        <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                          featured ? 'bg-[#C9A84C]' : 'bg-[#FBF4E1] border border-[#EAE0C6]'
                        }`}>
                          <Lucide.Check size={11} className={featured ? 'text-[#1C1A17]' : 'text-[#A8893A]'} strokeWidth={3} />
                        </span>
                        <span className={`text-sm ${featured ? 'text-[#E7E2D6]' : 'text-[#57534E]'}`}>{line}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to="/register"
                    state={{ packageName: p.name }}
                    className={`flex items-center justify-center gap-1.5 w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                      featured
                        ? 'bg-[#C9A84C] text-[#1C1A17] hover:bg-[#E8C875]'
                        : 'bg-[#1C1A17] text-[#FBFAF6] hover:bg-[#2E2A24]'
                    }`}
                  >
                    Pilih {p.name} <Lucide.ArrowRight size={14} />
                  </Link>
                </motion.div>
              )
            })}
          </div>
        )}

        <p className="text-center text-[13px] text-[#9A9189] mt-9 inline-flex w-full items-center justify-center gap-2 flex-wrap">
          <Lucide.ShieldCheck size={14} className="text-[#C9A84C]" />
          Semua paket sudah termasuk SSL, keamanan data, update gratis & dukungan tim kami.
        </p>
      </div>
    </section>
  )
}

function TestimonialsSection({ ctx }) {
  const { testimonials, isLoading, sections } = ctx
  // Section hilang kalau memang tidak ada testimoni setelah data masuk;
  // saat loading tampilkan skeleton supaya tidak ada layout shift.
  if (!isLoading && testimonials.length === 0) return null
  return (
    <section className="py-24 px-6 bg-[#F5EFE3]">
      <div className="max-w-6xl mx-auto">
        <SectionHeading {...sections.testimonials} />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-14">
          {isLoading
            ? [1, 2, 3].map(i => (
                <div key={i} className="h-56 bg-white border border-[#EAE3D3] rounded-2xl animate-pulse" />
              ))
            : testimonials.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 3) * 0.08 }}
                className="bg-white rounded-2xl border border-[#EAE3D3] p-6 flex flex-col"
              >
                <div className="flex items-center gap-0.5 mb-3 text-[#C9A84C]">
                  {Array.from({ length: t.rating || 5 }).map((_, idx) => (
                    <Lucide.Star key={idx} size={14} fill="currentColor" />
                  ))}
                </div>
                <p className="text-[15px] text-[#3F3A33] leading-relaxed flex-1">"{t.message}"</p>
                <div className="flex items-center gap-3 pt-4 mt-4 border-t border-[#EAE3D3]">
                  {t.photoUrl ? (
                    <img src={t.photoUrl} alt={t.name} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E8C875] to-[#A8893A] flex items-center justify-center text-[#1C1A17] font-bold text-sm">
                      {t.name?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1C1A17] truncate">{t.name}</p>
                    <p className="text-xs text-[#9A9189] truncate">
                      {[t.role, t.businessName].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
        </div>
      </div>
    </section>
  )
}

function FaqSection({ ctx }) {
  const { faqs, isLoading, sections } = ctx
  if (!isLoading && faqs.length === 0) return null
  return (
    <section className="py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <SectionHeading {...sections.faq} />
        <div className="space-y-3 mt-12">
          {isLoading
            ? [1, 2, 3, 4].map(i => (
                <div key={i} className="h-14 bg-white border border-[#EAE3D3] rounded-xl animate-pulse" />
              ))
            : faqs.map((f, i) => <FAQItem key={f.id} item={f} delay={i * 0.04} />)}
        </div>
      </div>
    </section>
  )
}

function ClosingCtaSection({ ctx }) {
  const { closing, waHref } = ctx
  return (
    <section className="py-20 px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="max-w-4xl mx-auto text-center rounded-3xl bg-[#1C1A17] px-8 py-14 lg:py-16 relative overflow-hidden"
      >
        <div className="absolute inset-0 -z-0 opacity-60" style={{
          backgroundImage: 'radial-gradient(circle at 18% 30%, rgba(201,168,76,0.35), transparent 45%), radial-gradient(circle at 85% 80%, rgba(232,200,117,0.22), transparent 45%)',
        }} />
        <div className="relative">
          <Lucide.Scissors className="text-[#C9A84C] mx-auto mb-4" size={30} />
          <h2 className="font-display text-3xl lg:text-[2.6rem] font-bold text-white leading-tight">
            {closing.title}
          </h2>
          <p className="text-[#A8A29A] max-w-lg mx-auto mt-4 mb-8">
            {closing.subtitle}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/register" onClick={() => trackPixel('Lead')} className="btn-gold group">
              {closing.ctaLabel}
              <Lucide.ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            {waHref && (
              <a
                href={waHref} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 border border-white/15 text-[#E7E2D6] font-medium hover:bg-white/15 transition-colors"
              >
                <Lucide.MessageCircle size={16} className="text-[#5DD27A]" /> Tanya via WhatsApp
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </section>
  )
}

// ── Blok free (banyak instance, konten dari block.config) ────────────────────

// Heading kecil opsional untuk blok free.
function BlockHeading({ kicker, title, subtitle }) {
  if (!title && !kicker) return null
  return (
    <div className="text-center max-w-2xl mx-auto">
      {kicker && (
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#A8893A]">
          <span className="w-5 h-px bg-[#C9A84C]" /> {kicker} <span className="w-5 h-px bg-[#C9A84C]" />
        </p>
      )}
      {title && (
        <h2 className="font-display text-3xl lg:text-[2.4rem] font-bold text-[#1C1A17] mt-3 leading-tight">{title}</h2>
      )}
      {subtitle && <p className="text-[#6B6459] mt-3">{subtitle}</p>}
    </div>
  )
}

function GallerySection({ block }) {
  const cfg = block.config || {}
  const items = Array.isArray(cfg.items) ? cfg.items.filter(it => it && it.url) : []
  if (items.length === 0) return null
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <BlockHeading kicker={cfg.kicker} title={cfg.title} subtitle={cfg.subtitle} />
        <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-4 ${(cfg.title || cfg.kicker) ? 'mt-12' : ''}`}>
          {items.map((it, i) => (
            <motion.figure
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 3) * 0.07 }}
              className="rounded-2xl overflow-hidden border border-[#EAE3D3] bg-white"
            >
              <img src={it.url} alt={it.caption || ''} loading="lazy" className="w-full h-56 object-cover" />
              {it.caption && <figcaption className="px-4 py-3 text-sm text-[#6B6459]">{it.caption}</figcaption>}
            </motion.figure>
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
    <section className="py-24 px-6 bg-[#F5EFE3]">
      <div className="max-w-4xl mx-auto">
        <BlockHeading kicker={cfg.kicker} title={cfg.title} subtitle={cfg.subtitle} />
        <div className={`relative aspect-video rounded-2xl overflow-hidden border border-[#EAE3D3] bg-black ${(cfg.title || cfg.kicker) ? 'mt-12' : ''}`}>
          <iframe
            src={embed}
            title={cfg.title || 'Video'}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
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
    <section className="py-16 px-6 border-y border-[#EAE3D3] bg-white">
      <div className="max-w-6xl mx-auto">
        {cfg.title && (
          <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-[#A8893A] mb-8">{cfg.title}</p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {logos.map((l, i) => (
            <img
              key={i}
              src={l.url}
              alt={l.name || ''}
              title={l.name || ''}
              loading="lazy"
              className="h-9 md:h-11 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity"
            />
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
    <section className="py-20 px-6">
      <div className="max-w-5xl mx-auto relative rounded-3xl overflow-hidden border border-[#EAE3D3] bg-[#1C1A17]">
        {cfg.image && (
          <img src={cfg.image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-35" />
        )}
        <div className="relative px-8 py-14 text-center">
          {cfg.heading && (
            <h2 className="font-display text-3xl lg:text-[2.4rem] font-bold text-white leading-tight">{cfg.heading}</h2>
          )}
          {cfg.text && <p className="text-[#D9D3C7] max-w-xl mx-auto mt-4">{cfg.text}</p>}
          {cfg.ctaLabel && cfg.ctaUrl && (
            <a href={cfg.ctaUrl} className="btn-gold group mt-7">
              {cfg.ctaLabel}
              <Lucide.ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </a>
          )}
        </div>
      </div>
    </section>
  )
}

function RichTextSection({ block }) {
  const cfg = block.config || {}
  if (!cfg.heading && !cfg.body) return null
  return (
    <section className="py-24 px-6">
      <div className="max-w-3xl mx-auto text-center">
        {cfg.kicker && (
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#A8893A]">
            <span className="w-5 h-px bg-[#C9A84C]" /> {cfg.kicker} <span className="w-5 h-px bg-[#C9A84C]" />
          </p>
        )}
        {cfg.heading && (
          <h2 className="font-display text-3xl lg:text-[2.4rem] font-bold text-[#1C1A17] mt-3 leading-tight">{cfg.heading}</h2>
        )}
        {cfg.body && (
          <p className="text-[#6B6459] mt-4 leading-relaxed whitespace-pre-line">{cfg.body}</p>
        )}
        {cfg.ctaLabel && cfg.ctaUrl && (
          <a href={cfg.ctaUrl} className="btn-gold group mt-7">
            {cfg.ctaLabel}
            <Lucide.ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </a>
        )}
      </div>
    </section>
  )
}

// Peta tipe blok → komponen. Dipakai renderer LandingPage untuk render `layout`.
const BLOCK_REGISTRY = {
  stats:        StatsSection,
  features:     FeaturesSection,
  steps:        StepsSection,
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

// ── Subkomponen ──────────────────────────────────────────────────────────────

function Nav({ isAuthed, userRole, logo, siteName = 'SembaPOS' }) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const homePath = userRole === 'super_admin' ? '/super-admin/dashboard'
                 : userRole === 'tenant_admin' ? '/admin/dashboard' : '/'

  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all ${
      scrolled ? 'bg-[#FBFAF6]/90 backdrop-blur-md border-b border-[#EAE3D3]' : 'bg-transparent'
    }`}>
      <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          {logo ? (
            <img src={logo} alt={siteName} className="h-9 w-auto max-w-[180px] object-contain" />
          ) : (
            <>
              <div className="w-9 h-9 rounded-xl bg-[#1C1A17] flex items-center justify-center">
                <Lucide.Scissors size={17} className="text-[#C9A84C]" />
              </div>
              <span className="font-display text-xl font-bold tracking-tight text-[#1C1A17]">{siteName}</span>
            </>
          )}
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          <a href="#fitur" className="text-[#6B6459] hover:text-[#1C1A17] transition-colors">Fitur</a>
          <a href="#harga" className="text-[#6B6459] hover:text-[#1C1A17] transition-colors">Harga</a>
        </nav>

        <div className="flex items-center gap-2">
          {isAuthed ? (
            <Link to={homePath} className="px-4 py-2 rounded-lg bg-[#C9A84C] text-[#1C1A17] text-sm font-semibold hover:bg-[#E8C875] transition-colors">
              Buka Dashboard
            </Link>
          ) : (
            <Link to="/register" onClick={() => trackPixel('Lead')} className="px-4 py-2 rounded-lg bg-[#C9A84C] text-[#1C1A17] text-sm font-semibold hover:bg-[#E8C875] transition-colors">
              Daftar Gratis
            </Link>
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
        initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#A8893A]"
      >
        <span className="w-5 h-px bg-[#C9A84C]" /> {kicker} <span className="w-5 h-px bg-[#C9A84C]" />
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        className="font-display text-3xl lg:text-[2.6rem] font-bold text-[#1C1A17] mt-3 leading-tight"
      >
        {title}
      </motion.h2>
      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ delay: 0.08 }}
          className="text-[#6B6459] mt-3"
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  )
}

function FAQItem({ item, delay }) {
  const [open, setOpen] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      transition={{ delay }}
      className="rounded-xl bg-white border border-[#EAE3D3] overflow-hidden"
    >
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[#FDFBF4] transition-colors"
      >
        <span className="font-semibold text-[#1C1A17] pr-4">{item.question}</span>
        <Lucide.ChevronDown size={17} className={`text-[#A8893A] flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 text-sm text-[#6B6459] leading-relaxed whitespace-pre-line">{item.answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// Sticky CTA mobile — bilah konversi yang muncul saat scroll. Khusus layar
// kecil (desktop sudah punya tombol daftar permanen di Nav). Label & teks
// reassurance diturunkan dari konten dinamis super-admin.
function StickyCtaBar({ show, authed, label, to, note, onCta }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 110, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 110, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 30 }}
          className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#FBFAF6]/95 backdrop-blur-md border-t border-[#EAE3D3] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-12px_rgba(28,26,23,0.3)]"
        >
          <div className="max-w-md mx-auto">
            <Link
              to={to}
              onClick={onCta}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#C9A84C] text-[#1C1A17] font-bold text-sm shadow-[0_10px_24px_-10px_rgba(201,168,76,0.9)]"
            >
              {label}
              <Lucide.ArrowRight size={16} />
            </Link>
            {note && (
              <p className="text-center text-[11px] text-[#9A9189] mt-1.5 truncate">
                {authed ? note : <><Lucide.ShieldCheck size={11} className="inline -mt-0.5 mr-1 text-[#C9A84C]" />{note}</>}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Footer({ text, logo, contact = {}, siteName = 'SembaPOS' }) {
  const phone = (contact.phone || '').trim()
  const email = (contact.email || '').trim()
  const address = (contact.address || '').trim()
  const waPhone = normalizeWa(phone)
  return (
    <footer className="bg-[#1C1A17] text-[#A8A29A] px-6 pt-14 pb-8">
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        <div className="col-span-2">
          <div className="flex items-center gap-2.5 mb-3">
            {logo ? (
              <img src={logo} alt={siteName} className="h-9 w-auto max-w-[180px] object-contain" />
            ) : (
              <>
                <div className="w-9 h-9 rounded-xl bg-[#C9A84C] flex items-center justify-center">
                  <Lucide.Scissors size={17} className="text-[#1C1A17]" />
                </div>
                <span className="font-display text-xl font-bold text-[#FBFAF6]">{siteName}</span>
              </>
            )}
          </div>
          <p className="text-[13px] leading-relaxed max-w-sm">
            {text || 'Sistem manajemen barbershop modern: kasir, antrian, booking online, multi-cabang, dan laporan pintar dalam satu aplikasi.'}
          </p>
        </div>
        <div>
          <h4 className="font-semibold text-[#FBFAF6] mb-3">Produk</h4>
          <ul className="space-y-2 text-[13px]">
            <li><a href="#fitur" className="hover:text-[#C9A84C] transition-colors">Fitur</a></li>
            <li><a href="#harga" className="hover:text-[#C9A84C] transition-colors">Harga</a></li>
            <li><Link to="/register" className="hover:text-[#C9A84C] transition-colors">Daftar Gratis</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-[#FBFAF6] mb-3">Kontak</h4>
          <ul className="space-y-2.5 text-[13px]">
            {phone && (
              <li>
                <a
                  href={waPhone ? `https://wa.me/${waPhone}` : `tel:${phone.replace(/[^\d+]/g, '')}`}
                  target={waPhone ? '_blank' : undefined}
                  rel={waPhone ? 'noopener noreferrer' : undefined}
                  className="inline-flex items-start gap-2 hover:text-[#C9A84C] transition-colors"
                >
                  <Lucide.Phone size={14} className="text-[#C9A84C] flex-shrink-0 mt-0.5" />
                  <span>{phone}</span>
                </a>
              </li>
            )}
            {email && (
              <li>
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-start gap-2 hover:text-[#C9A84C] transition-colors break-all"
                >
                  <Lucide.Mail size={14} className="text-[#C9A84C] flex-shrink-0 mt-0.5" />
                  <span>{email}</span>
                </a>
              </li>
            )}
            {address && (
              <li className="inline-flex items-start gap-2">
                <Lucide.MapPin size={14} className="text-[#C9A84C] flex-shrink-0 mt-0.5" />
                <span className="whitespace-pre-line">{address}</span>
              </li>
            )}
            {!phone && !email && !address && (
              <>
                <li>sembapos.com</li>
                <li>Indonesia</li>
              </>
            )}
          </ul>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-white/10 text-[12px] text-[#7C766C]">
        © {new Date().getFullYear()} {siteName}. Dibuat untuk barbershop Indonesia.
      </div>
    </footer>
  )
}

// Mock dashboard untuk hero — versi terang, full div styling (tanpa aset).
// Mini sparkline untuk kartu KPI.
function Sparkline({ data, w = 46, h = 16 }) {
  const max = Math.max(...data)
  const pts = data
    .map((v, i) => `${(i * (w / (data.length - 1))).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DashboardMock() {
  // ── Data dummy untuk grafik pendapatan 7 hari (skala 0-100) ──
  const series = [42, 58, 49, 73, 64, 86, 98]
  const days = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
  const W = 300, H = 92, pad = 12, MAX = 108
  const pts = series.map((v, i) => [
    pad + i * ((W - pad * 2) / (series.length - 1)),
    H - pad - (v / MAX) * (H - pad * 2),
  ])
  // Catmull-Rom → kurva mulus.
  const smooth = (p) => {
    if (p.length < 2) return ''
    let d = `M ${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
    }
    return d
  }
  const linePath = smooth(pts)
  const last = pts[pts.length - 1]
  const areaPath = `${linePath} L ${last[0].toFixed(1)} ${H - pad} L ${pts[0][0].toFixed(1)} ${H - pad} Z`

  const nav = [
    { icon: 'LayoutDashboard', label: 'Dashboard', active: true },
    { icon: 'CalendarDays', label: 'Antrian & Booking' },
    { icon: 'Scissors', label: 'Layanan' },
    { icon: 'Users', label: 'Tim & Komisi' },
    { icon: 'BarChart3', label: 'Laporan' },
    { icon: 'Wallet', label: 'Keuangan' },
  ]
  const kpis = [
    { label: 'Omzet hari ini', value: 'Rp 4,2jt', up: '18%', spark: [30, 40, 35, 55, 50, 70, 82] },
    { label: 'Transaksi', value: '47', up: '12%', spark: [20, 35, 30, 45, 55, 60, 72] },
    { label: 'Pelanggan baru', value: '12', up: '8%', spark: [40, 38, 52, 48, 60, 58, 75] },
  ]
  const barbers = [
    { name: 'Andi', rating: '4.9', value: 'Rp 1,4jt', tone: '#C9A84C' },
    { name: 'Budi', rating: '4.8', value: 'Rp 1,1jt', tone: '#7BAEC9' },
    { name: 'Citra', rating: '4.7', value: 'Rp 0,9jt', tone: '#C97B9B' },
  ]

  return (
    <div className="aspect-[16/10] bg-[#FBFAF6] flex flex-col overflow-hidden">
      {/* Browser chrome */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 bg-white border-b border-[#EAE3D3]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-[#E5786E]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#E8C268]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#7BC98A]" />
          </div>
          <span className="ml-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F0EADC] text-[10px] text-[#9A9189] truncate">
            <Lucide.Lock size={9} /> sembapos.com/admin/dashboard
          </span>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#3E9E57] shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <motion.span
              className="absolute inline-flex h-full w-full rounded-full bg-[#7BC98A]"
              animate={{ scale: [1, 2.4, 1], opacity: [0.7, 0, 0.7] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#3E9E57]" />
          </span>
          Live
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 grid grid-cols-12 min-h-0">
        {/* Sidebar */}
        <aside className="col-span-3 hidden sm:flex flex-col p-3 gap-3 border-r border-[#EAE3D3] bg-white/50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#E8C875] to-[#C9A84C] flex items-center justify-center shadow-sm shrink-0">
              <Lucide.Scissors size={14} className="text-[#1C1A17]" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#1C1A17] font-display leading-none">SembaPOS</p>
              <p className="text-[8px] text-[#9A9189] mt-1 truncate">Barber Kingdom</p>
            </div>
          </div>
          <div className="space-y-0.5">
            {nav.map((n) => {
              const Icon = Lucide[n.icon] || Lucide.Circle
              return (
                <div
                  key={n.label}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-medium ${
                    n.active ? 'bg-[#C9A84C] text-[#1C1A17] shadow-sm' : 'text-[#9A9189]'
                  }`}
                >
                  <Icon size={12} className="shrink-0" /> <span className="truncate">{n.label}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-auto rounded-lg border border-[#EAE0C6] bg-[#FBF4E1] p-2">
            <p className="text-[9px] font-semibold text-[#A8893A]">Paket Pro aktif</p>
            <p className="text-[8px] text-[#9A9189] mt-0.5 leading-tight">3 cabang • 12 staf</p>
          </div>
        </aside>

        {/* Main */}
        <main className="col-span-12 sm:col-span-9 p-3 sm:p-4 flex flex-col gap-2.5 min-h-0">
          {/* header */}
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-bold text-[#1C1A17] font-display truncate">Selamat pagi, Barber Kingdom 👋</p>
              <p className="text-[9px] text-[#9A9189]">Ringkasan performa hari ini</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[#EAE3D3] bg-white text-[9px] text-[#57534E]">
                <Lucide.Calendar size={9} /> Hari ini <Lucide.ChevronDown size={9} />
              </span>
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#1C1A17] to-[#3A352D] flex items-center justify-center text-[8px] font-bold text-[#E8C875]">BK</div>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-2">
            {kpis.map((k, i) => (
              <motion.div
                key={k.label}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 + i * 0.08 }}
                className="p-2.5 rounded-xl bg-white border border-[#EAE3D3] shadow-[0_6px_18px_-10px_rgba(28,26,23,0.3)]"
              >
                <div className="flex items-start justify-between gap-1">
                  <p className="text-[8px] sm:text-[9px] text-[#9A9189] truncate">{k.label}</p>
                  <Sparkline data={k.spark} />
                </div>
                <div className="flex items-end justify-between mt-1 gap-1">
                  <p className="text-sm sm:text-base font-bold text-[#1C1A17] font-display leading-none">{k.value}</p>
                  <span className="inline-flex items-center gap-0.5 text-[8px] font-semibold text-[#3E9E57]">
                    <Lucide.TrendingUp size={9} />{k.up}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* chart + barber leaderboard */}
          <div className="grid grid-cols-3 gap-2 flex-1 min-h-0">
            {/* Revenue chart */}
            <div className="col-span-3 sm:col-span-2 p-2.5 rounded-xl bg-white border border-[#EAE3D3] shadow-[0_6px_18px_-10px_rgba(28,26,23,0.3)] flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                <p className="text-[9px] sm:text-[10px] font-medium text-[#57534E]">Pendapatan 7 hari</p>
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-[#A8893A]">
                  <Lucide.ArrowUpRight size={10} /> 24%
                </span>
              </div>
              <div className="flex-1 min-h-0 mt-1">
                <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full h-full">
                  <defs>
                    <linearGradient id="mockArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#C9A84C" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="#C9A84C" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0.25, 0.5, 0.75].map((g) => (
                    <line key={g} x1={pad} x2={W - pad} y1={pad + (H - pad * 2) * g} y2={pad + (H - pad * 2) * g} stroke="#F0EADC" strokeWidth="1" />
                  ))}
                  <motion.path
                    d={areaPath} fill="url(#mockArea)"
                    initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.5 }}
                  />
                  <motion.path
                    d={linePath} fill="none" stroke="#C9A84C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.2, ease: 'easeInOut' }}
                  />
                  <motion.circle
                    cx={last[0]} cy={last[1]} r="3.4" fill="#C9A84C" stroke="#fff" strokeWidth="1.6"
                    initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 1.2, type: 'spring', stiffness: 300 }}
                  />
                  {days.map((d, i) => (
                    <text key={d} x={pts[i][0]} y={H + 9} textAnchor="middle" fontSize="6.5" fill="#B8B0A4">{d}</text>
                  ))}
                </svg>
              </div>
            </div>

            {/* Barber leaderboard */}
            <div className="hidden sm:flex flex-col col-span-1 p-2.5 rounded-xl bg-white border border-[#EAE3D3] shadow-[0_6px_18px_-10px_rgba(28,26,23,0.3)]">
              <p className="text-[9px] sm:text-[10px] font-medium text-[#57534E] mb-1.5">Barber terbaik</p>
              <div className="space-y-1.5">
                {barbers.map((b, i) => (
                  <motion.div
                    key={b.name}
                    initial={{ opacity: 0, x: 8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.6 + i * 0.12 }}
                    className="flex items-center gap-2"
                  >
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0" style={{ backgroundColor: b.tone }}>{b.name[0]}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-medium text-[#1C1A17] truncate leading-none">{b.name}</p>
                      <p className="text-[8px] text-[#9A9189] flex items-center gap-0.5 mt-1">
                        <Lucide.Star size={7} className="fill-[#E8C268] text-[#E8C268]" /> {b.rating}
                      </p>
                    </div>
                    <span className="text-[8px] font-semibold text-[#57534E] shrink-0">{b.value}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
