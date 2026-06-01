import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, ArrowUpRight, BarChart3, Building2, Calendar, CalendarClock,
  CalendarDays, Check, ChevronDown, Circle, Code2, DatabaseBackup, Fingerprint,
  Flame, Gem, Gift, LayoutDashboard, ListOrdered, Lock, Mail, MapPin,
  MessageCircle, MessageSquare, Palette, Percent, Phone, Play, Receipt, Scissors,
  ShieldCheck, Smartphone, Sparkles, Star, TicketPercent, TrendingUp, Users, Wallet, X,
} from 'lucide-react'
import { useLanding } from '../hooks/useLanding.js'
import { useAuthStore } from '../store/authStore.js'
import { initMetaPixel, trackPixel } from '../lib/metaPixel.js'
import { formatRupiah } from '../utils/format.js'
import { FeatureDemo, FeatureDemoStyles } from '../components/FeatureDemos.jsx'

// ── Catatan tema ────────────────────────────────────────────────────────────
// Landing publik SELALU terang — memakai warna eksplisit (bukan class tema
// `bg-dark`/`text-off-white`) supaya tidak ikut berubah oleh theme store app.
// Palet: ivory #F4F4FA · krem #EEEEF5 · tinta #1E1B2E · brand #6366F1 / #4F46E5.
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

// Registry ikon untuk lookup dinamis (nama ikon disimpan sebagai string di
// config landing). Dengan named import di atas, Rollup tree-shake → hanya ikon
// ini yang masuk bundle, bukan seluruh lucide-react (~824KB). Ikon tak dikenal
// jatuh ke fallback (Sparkles/Circle), jadi config lama tetap aman.
const Lucide = {
  ArrowRight, ArrowUpRight, BarChart3, Building2, Calendar, CalendarClock,
  CalendarDays, Check, ChevronDown, Circle, Code2, DatabaseBackup, Fingerprint,
  Flame, Gem, Gift, LayoutDashboard, ListOrdered, Lock, Mail, MapPin,
  MessageCircle, MessageSquare, Palette, Percent, Phone, Play, Receipt, Scissors,
  ShieldCheck, Smartphone, Sparkles, Star, TicketPercent, TrendingUp, Users, Wallet,
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

// Baris perbandingan "cara lama vs SembaPOS" — dipakai CompareSection. Tiap baris:
// aspek operasional toko, kondisi tanpa sistem, lalu kondisi dengan SembaPOS.
const COMPARE_ROWS = [
  { aspect: 'Rekap omzet',     before: 'Tulis tangan / Excel tiap malam, sering selisih',   after: 'Otomatis real-time, laporan langsung jadi' },
  { aspect: 'Antrian',         before: 'Pelanggan rebutan, sering ribut giliran',           after: 'Papan antrian digital, giliran jelas & adil' },
  { aspect: 'Booking',         before: 'Balas chat WA satu-satu, gampang kelewat',          after: 'Pelanggan booking sendiri 24 jam lewat link' },
  { aspect: 'Komisi barber',   before: 'Hitung manual akhir bulan, rawan salah',           after: 'Terhitung otomatis tiap transaksi' },
  { aspect: 'Pelanggan balik', before: 'Andalkan ingatan, tanpa data',                     after: 'Poin loyalti + pengingat WhatsApp otomatis' },
  { aspect: 'Kebocoran kas',   before: 'Susah lacak transaksi yang hilang',                after: 'Semua tercatat & bisa diaudit per kasir' },
  { aspect: 'Banyak cabang',   before: 'Telepon satu-satu buat tahu omzet',                after: 'Semua cabang dalam satu dashboard' },
]

const FALLBACK_STEPS = [
  { title: 'Daftar gratis',  desc: 'Bikin akun toko cuma semenit. Langsung dapat masa coba 14 hari, tanpa kartu kredit.' },
  { title: 'Atur toko kamu', desc: 'Tambah cabang, layanan, dan tim. Ada checklist panduan biar nggak ada yang kelewat.' },
  { title: 'Mulai melayani', desc: 'Buka kasir, terima booking, pantau omzet. Sisanya biar aplikasi yang urus.' },
]

const FALLBACK_SECTIONS = {
  features:     { kicker: 'Fitur Lengkap',  title: 'Semua yang barbershop kamu butuhin', subtitle: 'Nggak perlu spreadsheet atau aplikasi terpisah. Dari kasir sampai laporan pemilik, semua sudah satu paket.' },
  steps:        { kicker: 'Gampang Banget', title: 'Mulai cuma 3 langkah', subtitle: 'Dari daftar sampai toko jalan, bisa kelar hari ini juga. Beneran.' },
  compare:      { kicker: 'Kenapa Pindah', title: 'Cara lama vs pakai SembaPOS', subtitle: 'Masih catat manual atau pakai Excel? Lihat bedanya kalau toko kamu jalan pakai satu sistem yang ngerti barbershop.' },
  roi:          { kicker: 'Hitung Untungnya', title: 'Berapa yang bisa toko kamu hemat?', subtitle: 'Geser angkanya sesuai kondisi toko kamu. Lihat sendiri estimasi tambahan omzet & waktu yang bisa kamu hemat tiap bulan.' },
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
const FALLBACK_LAYOUT = ['stats', 'features', 'steps', 'compare', 'roi', 'pricing', 'testimonials', 'faq', 'closingCta']
  .map(t => ({ id: t, type: t, visible: true }))

// Render judul hero — 2 kata terakhir ditonjolkan brand-italic (memenuhi
// kontrak label editor super-admin). Judul ≤2 kata seluruhnya jadi brand.
function renderHeroTitle(title) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  if (words.length <= 2) {
    return <span className="italic text-[#4F46E5]">{words.join(' ')}</span>
  }
  const head = words.slice(0, -2).join(' ')
  const tail = words.slice(-2).join(' ')
  return <>{head}<br /><span className="italic text-[#4F46E5]">{tail}</span></>
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

// Default 'split' = tampilan baru jadi landing UTAMA (hero dua-kolom, demo fitur
// beranimasi, blok hitam-emas, gradasi konversi). Lewatkan heroLayout="centered"
// untuk memaksa tampilan lama bila perlu.
export default function LandingPage({ heroLayout = 'split' } = {}) {
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
    if (meta) meta.content = '#F4F4FA'

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
    // Scroll-depth: catat 25/50/75/100% sekali masing-masing → kelihatan di
    // Meta Events mana pengunjung berhenti membaca (analitik funnel landing).
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
          if (pct >= m && !fired.has(m)) {
            fired.add(m)
            trackPixel('ScrollDepth', { percent: m })
          }
        }
      }
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
    // FAQPage — biar tanya-jawab tampil sebagai rich result accordion di Google.
    // Hanya disertakan kalau ada FAQ nyata (question + answer terisi).
    const graph = [org, app]
    const faqList = (data?.faqs || []).filter(f => f?.question && f?.answer)
    if (faqList.length > 0) {
      graph.push({
        '@type': 'FAQPage',
        mainEntity: faqList.map(f => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      })
    }
    const ld = { '@context': 'https://schema.org', '@graph': graph }
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
  const ctx = { hero, features, steps, sections, packages, testimonials, faqs, stats, isLoading, closing, waHref, animatedMocks: heroLayout === 'split' }

  return (
    <div className="min-h-screen bg-[#F4F4FA] text-[#3F3D5C] font-body overflow-x-hidden antialiased">
      <Nav isAuthed={isAuthenticated} userRole={user?.role} logo={hero.siteLogo} siteName={siteName} />

      <HeroSection
        hero={hero}
        stats={stats}
        trustItems={trustItems}
        isAuthenticated={isAuthenticated}
        homePath={homePath}
        layout={heroLayout}
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
        .btn-brand{display:inline-flex;align-items:center;gap:.5rem;padding:.95rem 1.6rem;border-radius:.85rem;
          background:#6366F1;color:#FFFFFF;font-weight:700;font-size:.95rem;
          box-shadow:0 8px 20px -8px rgba(99,102,241,.45);transition:all .2s}
        .btn-brand:hover{background:#4F46E5;box-shadow:0 12px 26px -10px rgba(99,102,241,.55)}
        .btn-ghost{display:inline-flex;align-items:center;gap:.45rem;padding:.95rem 1.5rem;border-radius:.85rem;
          background:#fff;border:1px solid #C7CBE0;color:#1E1B2E;font-weight:600;font-size:.95rem;transition:all .2s}
        .btn-ghost:hover{border-color:#6366F1;background:#FAFAFD;color:#4F46E5}
        .roi-range{-webkit-appearance:none;appearance:none;height:8px;border-radius:9999px;
          background:#E4E6F2;cursor:pointer;outline:none}
        .roi-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:22px;height:22px;
          border-radius:9999px;background:#6366F1;border:3px solid #fff;
          box-shadow:0 2px 8px -1px rgba(99,102,241,.55);cursor:pointer}
        .roi-range::-moz-range-thumb{width:22px;height:22px;border-radius:9999px;background:#6366F1;
          border:3px solid #fff;box-shadow:0 2px 8px -1px rgba(99,102,241,.55);cursor:pointer}
        .roi-range:focus-visible{box-shadow:0 0 0 3px rgba(99,102,241,.25)}
      `}</style>
    </div>
  )
}

// ── Blok core ────────────────────────────────────────────────────────────────

function HeroSection({ hero, stats, trustItems, isAuthenticated, homePath, layout }) {
  const { scrollYProgress } = useScroll()
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -60])
  const heroBadge = hero.heroBadge || 'Baru'
  // layout 'split' → mockup berdampingan di kanan judul (top-aligned).
  const split = layout === 'split'

  // Bukti sosial — pakai jumlah tenant nyata bila statistik diaktifkan & sudah
  // cukup banyak; di bawah ambang tampilkan klaim umum supaya tetap meyakinkan.
  const tenantCount = stats?.tenantCount || 0
  const showRealCount = hero.showStats !== false && tenantCount >= 10

  // Kelas perataan: di mode split, mobile tetap center, ≥lg jadi rata kiri.
  const alignText = split ? 'text-center lg:text-left' : 'text-center'
  const alignRow  = split ? 'justify-center lg:justify-start' : 'justify-center'
  const alignBox  = split ? 'mx-auto lg:mx-0' : 'mx-auto'

  const copy = (
    <div className={alignText}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-white border border-[#C7CBE0] text-[#4F46E5] text-xs font-semibold shadow-[0_4px_16px_-8px_rgba(99,102,241,0.5)]"
      >
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#6366F1] text-[#1E1B2E]">
          <Lucide.Sparkles size={11} /> {heroBadge}
        </span>
        {hero.brandTagline || 'Dipercaya barbershop di seluruh Indonesia'}
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.06 }}
        className={`font-display text-4xl leading-[1.12] sm:text-6xl sm:leading-[1.08] ${split ? 'lg:text-[3.4rem] lg:leading-[1.05]' : 'lg:text-7xl'} font-bold text-[#1E1B2E] tracking-tight mt-7`}
      >
        {renderHeroTitle(hero.heroTitle || 'Kelola barbershop, tanpa ribet.')}
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.14 }}
        className={`text-base sm:text-lg text-[#56548A] max-w-xl ${alignBox} mt-6`}
      >
        {hero.heroSubtitle || 'Kasir, antrian, booking online, sampai laporan pemilik — semua jadi satu aplikasi. Tinggal pakai, langsung jalan hari ini juga.'}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.22 }}
        className={`flex flex-wrap items-center gap-3 mt-9 ${alignRow}`}
      >
        <Link
          to={isAuthenticated ? homePath : '/register'}
          onClick={() => { if (!isAuthenticated) trackPixel('Lead') }}
          className="btn-brand group"
          style={split ? { background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 55%, #4338CA 100%)', boxShadow: '0 16px 38px -10px rgba(99,102,241,0.6)' } : undefined}
        >
          {isAuthenticated ? 'Buka Dashboard' : (hero.heroCtaLabel || 'Coba Gratis 14 Hari')}
          <Lucide.ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
        </Link>
        <a href="#fitur" className="btn-ghost">
          <Lucide.Play size={13} className="text-[#4F46E5]" /> Lihat Fitur
        </a>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className={`text-[13px] text-[#7C7AA8] mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 ${alignRow}`}
      >
        {trustItems.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-[#D5D8E8]">·</span>}
            <span className="inline-flex items-center gap-1">
              <Lucide.Check size={13} className={split ? 'text-[#10B981]' : 'text-[#6366F1]'} /> {item}
            </span>
          </React.Fragment>
        ))}
      </motion.p>

      {/* Bukti sosial — kluster avatar + rating bintang + jumlah pengguna */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className={`mt-7 flex items-center gap-3 ${alignRow}`}
      >
        <div className="flex -space-x-2.5">
          {['A', 'R', 'B', 'S'].map((c) => (
            <div
              key={c}
              className="w-8 h-8 rounded-full border-2 border-[#F4F4FA] flex items-center justify-center text-[11px] font-bold text-[#1E1B2E] bg-gradient-to-br from-[#A5A2FF] to-[#4F46E5]"
            >
              {c}
            </div>
          ))}
          <div className="w-8 h-8 rounded-full border-2 border-[#F4F4FA] flex items-center justify-center text-[11px] font-bold text-[#4F46E5] bg-[#E8EAF5]">
            +
          </div>
        </div>
        <div className="text-left">
          <div className="flex items-center gap-0.5 text-[#6366F1]">
            {[0, 1, 2, 3, 4].map(i => <Lucide.Star key={i} size={12} fill="currentColor" />)}
          </div>
          <p className="text-[12.5px] text-[#56548A] leading-tight mt-0.5">
            {showRealCount
              ? <>Dipercaya <strong className="font-semibold text-[#1E1B2E]">{tenantCount.toLocaleString('id-ID')}+</strong> barbershop di Indonesia</>
              : 'Dibuat khusus untuk barbershop Indonesia'}
          </p>
        </div>
      </motion.div>
    </div>
  )

  const showcase = (
    <motion.div
      initial={{ opacity: 0, y: split ? 30 : 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.35 }}
      className="relative"
    >
      <div className={`absolute -inset-4 rounded-[2.5rem] blur-2xl ${split ? 'bg-gradient-to-tr from-[#6366F1]/30 via-[#10B981]/14 to-[#A5A2FF]/35' : 'bg-gradient-to-tr from-[#6366F1]/25 via-transparent to-[#A5A2FF]/30'}`} />
      <div className="relative rounded-2xl border border-[#D5D8E8] bg-white shadow-[0_30px_70px_-30px_rgba(28,26,23,0.35)] overflow-hidden">
        <DashboardMock />
      </div>
    </motion.div>
  )

  return (
    <section className={`relative pt-28 pb-12 sm:pt-32 sm:pb-16 ${split ? 'lg:pt-36 lg:pb-24' : 'lg:pt-40 lg:pb-24'}`}>
      {/* Latar dekoratif — glow brand + tekstur titik halus */}
      {split ? (
        // Versi konversi: gradient mesh kaya (indigo + mint + whisper emas) supaya
        // terasa hidup & premium, dengan wash atas yang menuntun mata ke judul+CTA.
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#ECEEFF] via-[#F4F4FA] to-[#F4F4FA]" />
          <div className="absolute -top-32 left-[16%] w-[680px] h-[460px] rounded-full bg-[#6366F1]/18 blur-[130px]" />
          <div className="absolute top-24 -right-24 w-[440px] h-[440px] rounded-full bg-[#10B981]/14 blur-[120px]" />
          <div className="absolute top-[30rem] -left-24 w-96 h-96 rounded-full bg-[#C9A84C]/12 blur-[130px]" />
          <div
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage: 'radial-gradient(#6366F124 1px, transparent 1px)',
              backgroundSize: '26px 26px',
              maskImage: 'linear-gradient(to bottom, black, transparent 72%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 72%)',
            }}
          />
        </div>
      ) : (
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[820px] h-[420px] rounded-full bg-[#6366F1]/12 blur-[120px]" />
          <div className="absolute top-48 -right-20 w-72 h-72 rounded-full bg-[#A5A2FF]/20 blur-[100px]" />
          <div
            className="absolute inset-0 opacity-[0.5]"
            style={{
              backgroundImage: 'radial-gradient(#6366F126 1px, transparent 1px)',
              backgroundSize: '26px 26px',
              maskImage: 'linear-gradient(to bottom, black, transparent 70%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 70%)',
            }}
          />
        </div>
      )}

      {split ? (
        <motion.div style={{ y: heroY }} className="max-w-[78rem] mx-auto px-6 grid lg:grid-cols-[1fr_1.22fr] gap-12 lg:gap-16 items-center">
          {copy}
          {showcase}
        </motion.div>
      ) : (
        <>
          <motion.div style={{ y: heroY }} className="max-w-3xl mx-auto px-6">
            {copy}
          </motion.div>
          <div className="max-w-5xl mx-auto px-5 sm:px-6 mt-10 sm:mt-16">
            {showcase}
          </div>
        </>
      )}
    </section>
  )
}

function StatsSection({ ctx }) {
  const { stats, animatedMocks: dark } = ctx
  if (!stats) return null
  return (
    <section className={dark ? 'border-t-2 border-t-[#C9A84C]/50 border-b border-b-[#23233a] bg-[#0E0E1A]' : 'border-y border-[#D5D8E8] bg-white'}>
      <div className="max-w-5xl mx-auto px-6 py-10 sm:py-12 grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 text-center">
        {[
          { label: 'Tenant aktif',        value: stats.tenantCount,      suffix: '+', icon: 'Building2' },
          { label: 'Cabang terkelola',    value: stats.branchCount,      suffix: '+', icon: 'MapPin' },
          { label: 'Transaksi diproses',  value: stats.transactionCount, suffix: '+', icon: 'Receipt' },
          { label: 'Pelanggan tercatat',  value: stats.customerCount,    suffix: '+', icon: 'Users' },
        ].map((s) => {
          const Icon = getIcon(s.icon)
          return (
            <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <Icon size={18} className={`mx-auto mb-2 ${dark ? 'text-[#C9A84C]' : 'text-[#6366F1]'}`} />
              <p className={`font-display text-3xl md:text-4xl font-bold ${dark ? 'text-[#E3C674]' : 'text-[#1E1B2E]'}`}>
                <CountUp to={s.value} suffix={s.suffix} />
              </p>
              <p className={`text-xs mt-1 ${dark ? 'text-[#A5A2C8]' : 'text-[#7C7AA8]'}`}>{s.label}</p>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}

// Bingkai "browser" untuk screenshot fitur — gambar TIDAK dipotong
// (object-contain) supaya seluruh tampilan aplikasi terlihat utuh & terbaca.
function BrowserFrame({ src, alt }) {
  return (
    <div className="rounded-2xl border border-[#D5D8E8] bg-white shadow-[0_24px_60px_-28px_rgba(28,26,23,0.4)] overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[#E8EAF5] bg-[#F4F4FA]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#E0573E]/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#A5A2FF]/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#3FB950]/60" />
      </div>
      <div className="aspect-[16/10] bg-[#EEEEF5]">
        <img src={src} alt={alt} loading="lazy" className="w-full h-full object-contain" />
      </div>
    </div>
  )
}

// Bingkai "browser" berisi VIDEO (rekaman layar produk milik user).
// autoPlay + loop + muted + playsInline → jalan otomatis tanpa kontrol, ringan.
function VideoFrame({ src, poster }) {
  return (
    <div className="rounded-2xl border border-[#D5D8E8] bg-white shadow-[0_24px_60px_-28px_rgba(28,26,23,0.4)] overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[#E8EAF5] bg-[#F4F4FA]">
        <span className="w-2.5 h-2.5 rounded-full bg-[#E0573E]/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#E0A23E]/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#3FB950]/70" />
      </div>
      <div className="aspect-[16/10] bg-[#0E0E1A]">
        <video
          src={src}
          poster={poster || undefined}
          autoPlay loop muted playsInline preload="metadata"
          className="w-full h-full object-cover"
        />
      </div>
    </div>
  )
}

// Pilih media fitur: VIDEO (bila ada) → screenshot gambar → demo animasi.
// Untuk ganti ke video sendiri: set `feature.video` (URL .mp4/.webm) via editor
// landing / data /api/landing.
function FeatureMedia({ feature }) {
  const video = feature.video || feature.videoUrl
  if (video) return <VideoFrame src={video} poster={feature.image} />
  if (feature.image) return <BrowserFrame src={feature.image} alt={feature.title} />
  return <FeatureDemo icon={feature.icon} />
}

function FeaturesSection({ ctx }) {
  const { features, sections, animatedMocks } = ctx
  const indexed  = features.map((f, i) => ({ f, i }))

  // Mode preview: SEMUA fitur tampil sebagai blok bergantian kiri-kanan dengan
  // mini-demo BERANIMASI (terasa seperti video). Live default tetap screenshot/grid.
  if (animatedMocks) {
    return (
      <section id="fitur" className="py-14 sm:py-24 px-6">
        <FeatureDemoStyles />
        <div className="max-w-6xl mx-auto">
          <SectionHeading {...sections.features} />
          <div className="space-y-16 sm:space-y-24 mt-14">
            {indexed.map(({ f, i }, pos) => {
              const Icon = getIcon(f.icon)
              const mediaRight = pos % 2 === 1
              return (
                <motion.div
                  key={`fa-${i}`}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ duration: 0.5 }}
                  className="grid lg:grid-cols-2 gap-8 lg:gap-14 items-center"
                >
                  <div className={mediaRight ? 'lg:order-1' : 'lg:order-2'}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-xl bg-[#E8EAF5] border border-[#C7CBE0] flex items-center justify-center">
                        <Icon size={19} className="text-[#4F46E5]" />
                      </div>
                      <span className="font-display text-sm font-semibold text-[#6366F1]">{String(i + 1).padStart(2, '0')}</span>
                    </div>
                    <h3 className="font-display text-2xl sm:text-3xl font-semibold text-[#1E1B2E] mb-3 leading-tight">{f.title}</h3>
                    <p className="text-[#56548A] leading-relaxed sm:text-lg">{f.desc}</p>
                  </div>
                  <div className={mediaRight ? 'lg:order-2' : 'lg:order-1'}>
                    <FeatureMedia feature={f} />
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>
    )
  }

  const showcase = indexed.filter((x) => x.f.image)   // fitur dgn screenshot → showcase besar
  const compact  = indexed.filter((x) => !x.f.image)  // sisanya → grid ikon rapi
  return (
    <section id="fitur" className="py-14 sm:py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <SectionHeading {...sections.features} />

        {/* Showcase besar bergantian kiri-kanan untuk fitur yang punya gambar */}
        {showcase.length > 0 && (
          <div className="space-y-16 sm:space-y-24 mt-14">
            {showcase.map(({ f, i }, pos) => {
              const Icon = getIcon(f.icon)
              const imageRight = pos % 2 === 1
              return (
                <motion.div
                  key={`sc-${i}`}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-80px' }}
                  transition={{ duration: 0.5 }}
                  className="grid lg:grid-cols-2 gap-8 lg:gap-14 items-center"
                >
                  <div className={imageRight ? 'lg:order-1' : 'lg:order-2'}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-11 h-11 rounded-xl bg-[#E8EAF5] border border-[#C7CBE0] flex items-center justify-center">
                        <Icon size={19} className="text-[#4F46E5]" />
                      </div>
                      <span className="font-display text-sm font-semibold text-[#6366F1]">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </div>
                    <h3 className="font-display text-2xl sm:text-3xl font-semibold text-[#1E1B2E] mb-3 leading-tight">{f.title}</h3>
                    <p className="text-[#56548A] leading-relaxed sm:text-lg">{f.desc}</p>
                  </div>
                  <div className={imageRight ? 'lg:order-2' : 'lg:order-1'}>
                    <BrowserFrame src={f.image} alt={f.title} />
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Fitur tanpa gambar → grid ikon bernomor (tampilan lama yang bersih) */}
        {compact.length > 0 && (
          <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-4 ${showcase.length > 0 ? 'mt-16' : 'mt-14'}`}>
            {compact.map(({ f, i }, pos) => {
              const Icon = getIcon(f.icon)
              const big = pos === 0   // tile pertama → bento besar (2 kolom di lg) beraksen brand
              return (
                <motion.div
                  key={`cp-${i}`}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ delay: (pos % 3) * 0.06 }}
                  whileHover={{ y: -4 }}
                  className={`group relative rounded-2xl border p-7 transition-colors ${
                    big
                      ? 'sm:col-span-2 lg:col-span-2 bg-gradient-to-br from-[#6366F1] to-[#4F46E5] border-[#4F46E5] overflow-hidden'
                      : 'bg-white border-[#D5D8E8] hover:border-[#C7CBE0]'
                  }`}
                >
                  {big && <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />}
                  <span className={`relative font-display text-sm font-semibold ${big ? 'text-white/70' : 'text-[#6366F1]'}`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center mt-3 mb-4 transition-colors ${
                    big ? 'bg-white/15 border border-white/25' : 'bg-[#E8EAF5] border border-[#C7CBE0] group-hover:bg-[#6366F1]'
                  }`}>
                    <Icon size={19} className={big ? 'text-white' : 'text-[#4F46E5] group-hover:text-[#1E1B2E] transition-colors'} />
                  </div>
                  <h3 className={`relative font-display font-semibold mb-1.5 ${big ? 'text-2xl text-white' : 'text-xl text-[#1E1B2E]'}`}>{f.title}</h3>
                  <p className={`relative text-sm leading-relaxed ${big ? 'text-white/85 sm:max-w-md' : 'text-[#56548A]'}`}>{f.desc}</p>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

function StepsSection({ ctx }) {
  const { steps, sections, animatedMocks } = ctx
  const bgImage = sections.steps?.image
  const dark = animatedMocks || !!bgImage   // teks terang bila gelap ATAU ada gambar latar
  return (
    <section className={`relative overflow-hidden py-14 sm:py-24 px-6 ${dark ? 'bg-[#0E0E1A]' : 'bg-[#EEEEF5]'}`}>
      {bgImage && (
        <>
          <img src={bgImage} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
          {/* lapisan gelap di atas gambar agar tulisan tetap terbaca */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0E0E1A]/90 via-[#0E0E1A]/82 to-[#0E0E1A]/92" />
        </>
      )}
      <div className="relative max-w-5xl mx-auto">
        <SectionHeading {...sections.steps} dark={dark} />
        <div className={`grid gap-5 mt-14 ${steps.length === 2 ? 'md:grid-cols-2' : steps.length >= 4 ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3'}`}>
          {steps.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ y: -4 }}
              className={`relative rounded-2xl border p-7 ${dark
                ? 'bg-[#16162a] border-[#2a2a45] hover:border-[#C9A84C]/45'
                : 'bg-white border-[#D5D8E8] hover:border-[#C7CBE0] hover:shadow-[0_20px_44px_-24px_rgba(28,26,23,0.35)]'}`}
            >
              <span className={`font-display text-5xl font-bold ${dark ? 'text-[#C9A84C]/55' : 'text-[#C7CBE0]'}`}>{i + 1}</span>
              <h3 className={`font-display text-lg font-semibold mt-2 mb-1.5 ${dark ? 'text-white' : 'text-[#1E1B2E]'}`}>{s.title}</h3>
              <p className={`text-sm leading-relaxed ${dark ? 'text-[#A5A2C8]' : 'text-[#56548A]'}`}>{s.desc}</p>
              {i < steps.length - 1 && (
                <Lucide.ArrowRight size={18} className={`hidden md:block absolute top-1/2 -right-4 -translate-y-1/2 z-10 ${dark ? 'text-[#C9A84C]' : 'text-[#6366F1]'}`} />
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
  // ViewContent — sinyal minat kuat: pengunjung sampai melihat daftar harga.
  const priceRef = useRef(null)
  const priceInView = useInView(priceRef, { once: true, margin: '-120px' })
  useEffect(() => {
    if (priceInView) trackPixel('ViewContent', { content_type: 'pricing' })
  }, [priceInView])
  return (
    <section ref={priceRef} id="harga" className="py-14 sm:py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <SectionHeading {...sections.pricing} />

        {isLoading ? (
          <div className="grid md:grid-cols-3 gap-6 mt-14">
            {[1, 2, 3].map(i => <div key={i} className="h-[480px] bg-white border border-[#D5D8E8] rounded-2xl animate-pulse" />)}
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
                  whileHover={{ y: -6 }}
                  className={`relative rounded-2xl p-7 flex flex-col ${
                    featured
                      ? 'bg-[#1E1B2E] text-[#D5D8E8] shadow-[0_30px_60px_-25px_rgba(28,26,23,0.6)] md:-mt-4 md:mb-4'
                      : 'bg-white border border-[#D5D8E8]'
                  }`}
                >
                  {featured && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#6366F1] text-[#1E1B2E] text-[11px] font-bold whitespace-nowrap">
                      <Lucide.Star size={11} fill="currentColor" /> Paling Banyak Dipilih
                    </div>
                  )}

                  <h3 className={`font-display text-2xl font-bold ${featured ? 'text-white' : 'text-[#1E1B2E]'}`}>
                    {p.name}
                  </h3>
                  <p className={`text-sm mt-1 min-h-[40px] ${featured ? 'text-[#A5A2C8]' : 'text-[#56548A]'}`}>
                    {p.description || PKG_TAGLINE[p.name] || 'Paket fleksibel buat barbershop kamu.'}
                  </p>

                  <div className="mt-5 mb-1 flex items-end gap-1.5">
                    <span className={`font-display text-4xl font-bold ${featured ? 'text-white' : 'text-[#1E1B2E]'}`}>
                      {formatRupiah(p.price)}
                    </span>
                    <span className={`text-sm pb-1 ${featured ? 'text-[#A5A2C8]' : 'text-[#7C7AA8]'}`}>/bulan</span>
                  </div>
                  <p className="text-xs text-[#4F46E5] font-medium">
                    Bayar tahunan {formatRupiah(annual)} — hemat {p.annualDiscountPercent ?? 17}%
                  </p>

                  <div className={`h-px my-6 ${featured ? 'bg-white/10' : 'bg-[#D5D8E8]'}`} />

                  {inheritFrom && (
                    <p className={`text-xs font-semibold mb-3 ${featured ? 'text-[#A5A2FF]' : 'text-[#4F46E5]'}`}>
                      Semua di paket {inheritFrom}, plus:
                    </p>
                  )}
                  <ul className="space-y-3 mb-7 flex-1">
                    {lines.map((line, li) => (
                      <li key={li} className="flex items-start gap-2.5">
                        <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                          featured ? 'bg-[#6366F1]' : 'bg-[#E8EAF5] border border-[#C7CBE0]'
                        }`}>
                          <Lucide.Check size={11} className={featured ? 'text-[#1E1B2E]' : 'text-[#4F46E5]'} strokeWidth={3} />
                        </span>
                        <span className={`text-sm ${featured ? 'text-[#D5D8E8]' : 'text-[#3F3D5C]'}`}>{line}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to="/register"
                    state={{ packageName: p.name }}
                    className={`flex items-center justify-center gap-1.5 w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                      featured
                        ? 'bg-[#6366F1] text-[#1E1B2E] hover:bg-[#A5A2FF]'
                        : 'bg-[#1E1B2E] text-[#F4F4FA] hover:bg-[#1E1B4B]'
                    }`}
                  >
                    Pilih {p.name} <Lucide.ArrowRight size={14} />
                  </Link>
                  <p className={`mt-3 text-center text-[11px] inline-flex w-full items-center justify-center gap-1.5 ${featured ? 'text-[#A5A2C8]' : 'text-[#7C7AA8]'}`}>
                    <Lucide.Check size={12} className={featured ? 'text-[#A5A2FF]' : 'text-[#6366F1]'} strokeWidth={3} />
                    Gratis 14 hari · tanpa kartu kredit
                  </p>
                </motion.div>
              )
            })}
          </div>
        )}

        <p className="text-center text-[13px] text-[#7C7AA8] mt-9 inline-flex w-full items-center justify-center gap-2 flex-wrap">
          <Lucide.ShieldCheck size={14} className="text-[#6366F1]" />
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
    <section className="py-14 sm:py-24 px-6 bg-[#EEEEF5]">
      <div className="max-w-6xl mx-auto">
        <SectionHeading {...sections.testimonials} />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-14">
          {isLoading
            ? [1, 2, 3].map(i => (
                <div key={i} className="h-56 bg-white border border-[#D5D8E8] rounded-2xl animate-pulse" />
              ))
            : testimonials.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 3) * 0.08 }}
                whileHover={{ y: -4 }}
                className="bg-white rounded-2xl border border-[#D5D8E8] p-6 flex flex-col hover:border-[#C7CBE0] hover:shadow-[0_20px_44px_-24px_rgba(28,26,23,0.35)]"
              >
                <div className="flex items-center gap-0.5 mb-3 text-[#6366F1]">
                  {Array.from({ length: t.rating || 5 }).map((_, idx) => (
                    <Lucide.Star key={idx} size={14} fill="currentColor" />
                  ))}
                </div>
                <p className="text-[15px] text-[#3F3D5C] leading-relaxed flex-1">"{t.message}"</p>
                <div className="flex items-center gap-3 pt-4 mt-4 border-t border-[#D5D8E8]">
                  {t.photoUrl ? (
                    <img src={t.photoUrl} alt={t.name} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#A5A2FF] to-[#4F46E5] flex items-center justify-center text-[#1E1B2E] font-bold text-sm">
                      {t.name?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#1E1B2E] truncate">{t.name}</p>
                    <p className="text-xs text-[#7C7AA8] truncate">
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
    <section className="py-14 sm:py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <SectionHeading {...sections.faq} />
        <div className="space-y-3 mt-12">
          {isLoading
            ? [1, 2, 3, 4].map(i => (
                <div key={i} className="h-14 bg-white border border-[#D5D8E8] rounded-xl animate-pulse" />
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
    <section className="py-14 sm:py-20 px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="max-w-4xl mx-auto text-center rounded-3xl bg-[#1E1B2E] px-8 py-14 lg:py-16 relative overflow-hidden"
      >
        {closing.image && (
          <>
            <img src={closing.image} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
            {/* Tint tipis supaya gambar tetap jelas, ditambah scrim lembut di
                tengah (tempat teks) — keterbacaan utama ditopang text-shadow. */}
            <div className="absolute inset-0 bg-[#1E1B2E]/45" />
            <div className="absolute inset-0" style={{
              background: 'radial-gradient(ellipse 65% 55% at 50% 50%, rgba(20,18,32,0.5), transparent 78%)',
            }} />
          </>
        )}
        <div className="absolute inset-0 opacity-60" style={{
          backgroundImage: 'radial-gradient(circle at 18% 30%, rgba(99,102,241,0.35), transparent 45%), radial-gradient(circle at 85% 80%, rgba(232,200,117,0.22), transparent 45%)',
        }} />
        <div className="relative z-10">
          <Lucide.Scissors className="text-[#6366F1] mx-auto mb-4" size={30} />
          <h2 className={`font-display text-3xl lg:text-[2.6rem] font-bold text-white leading-tight ${closing.image ? '[text-shadow:0_2px_16px_rgba(0,0,0,0.85)]' : ''}`}>
            {closing.title}
          </h2>
          <p className={`max-w-lg mx-auto mt-4 mb-8 ${closing.image ? 'text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.8)]' : 'text-[#A5A2C8]'}`}>
            {closing.subtitle}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/register" onClick={() => trackPixel('Lead')} className="btn-brand group">
              {closing.ctaLabel}
              <Lucide.ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            {waHref && (
              <a
                href={waHref} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white/10 border border-white/15 text-[#D5D8E8] font-medium hover:bg-white/15 transition-colors"
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
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#4F46E5]">
          <span className="w-5 h-px bg-[#6366F1]" /> {kicker} <span className="w-5 h-px bg-[#6366F1]" />
        </p>
      )}
      {title && (
        <h2 className="font-display text-3xl lg:text-[2.4rem] font-bold text-[#1E1B2E] mt-3 leading-tight">{title}</h2>
      )}
      {subtitle && <p className="text-[#56548A] mt-3">{subtitle}</p>}
    </div>
  )
}

function GallerySection({ block }) {
  const cfg = block.config || {}
  const items = Array.isArray(cfg.items) ? cfg.items.filter(it => it && it.url) : []
  if (items.length === 0) return null
  return (
    <section className="py-14 sm:py-24 px-6">
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
              className="rounded-2xl overflow-hidden border border-[#D5D8E8] bg-white"
            >
              <img src={it.url} alt={it.caption || ''} loading="lazy" className="w-full h-56 object-cover" />
              {it.caption && <figcaption className="px-4 py-3 text-sm text-[#56548A]">{it.caption}</figcaption>}
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
    <section className="py-14 sm:py-24 px-6 bg-[#EEEEF5]">
      <div className="max-w-4xl mx-auto">
        <BlockHeading kicker={cfg.kicker} title={cfg.title} subtitle={cfg.subtitle} />
        <div className={`relative aspect-video rounded-2xl overflow-hidden border border-[#D5D8E8] bg-black ${(cfg.title || cfg.kicker) ? 'mt-12' : ''}`}>
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
    <section className="py-12 sm:py-16 px-6 border-y border-[#D5D8E8] bg-white">
      <div className="max-w-6xl mx-auto">
        {cfg.title && (
          <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-[#4F46E5] mb-8">{cfg.title}</p>
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
    <section className="py-14 sm:py-20 px-6">
      <div className="max-w-5xl mx-auto relative rounded-3xl overflow-hidden border border-[#D5D8E8] bg-[#1E1B2E]">
        {cfg.image && (
          <img src={cfg.image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-35" />
        )}
        <div className="relative px-8 py-14 text-center">
          {cfg.heading && (
            <h2 className="font-display text-3xl lg:text-[2.4rem] font-bold text-white leading-tight">{cfg.heading}</h2>
          )}
          {cfg.text && <p className="text-[#D5D8E8] max-w-xl mx-auto mt-4">{cfg.text}</p>}
          {cfg.ctaLabel && cfg.ctaUrl && (
            <a href={cfg.ctaUrl} className="btn-brand group mt-7">
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
    <section className="py-14 sm:py-24 px-6">
      <div className="max-w-3xl mx-auto text-center">
        {cfg.kicker && (
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#4F46E5]">
            <span className="w-5 h-px bg-[#6366F1]" /> {cfg.kicker} <span className="w-5 h-px bg-[#6366F1]" />
          </p>
        )}
        {cfg.heading && (
          <h2 className="font-display text-3xl lg:text-[2.4rem] font-bold text-[#1E1B2E] mt-3 leading-tight">{cfg.heading}</h2>
        )}
        {cfg.body && (
          <p className="text-[#56548A] mt-4 leading-relaxed whitespace-pre-line">{cfg.body}</p>
        )}
        {cfg.ctaLabel && cfg.ctaUrl && (
          <a href={cfg.ctaUrl} className="btn-brand group mt-7">
            {cfg.ctaLabel}
            <Lucide.ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </a>
        )}
      </div>
    </section>
  )
}

// Perbandingan "cara lama vs SembaPOS" — menjawab keberatan utama owner yang
// masih pakai catatan manual / Excel. Dua kartu berdampingan (kiri: tanpa sistem,
// kanan: dengan SembaPOS yang ditonjolkan). Baris sejajar mengikuti COMPARE_ROWS.
function CompareSection({ ctx }) {
  const { sections } = ctx
  return (
    <section id="perbandingan" className="py-14 sm:py-24 px-6 bg-[#EEEEF5]">
      <div className="max-w-5xl mx-auto">
        <SectionHeading {...sections.compare} />

        <div className="mt-12 grid md:grid-cols-2 gap-5 items-stretch">
          {/* Kartu: tanpa sistem */}
          <motion.div
            initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="rounded-2xl bg-white border border-[#D5D8E8] p-6 sm:p-7"
          >
            <div className="flex items-center gap-2.5 mb-5">
              <span className="w-9 h-9 rounded-lg bg-[#FBE9E9] flex items-center justify-center">
                <X size={18} className="text-[#D0584E]" />
              </span>
              <div>
                <p className="font-display text-lg font-bold text-[#1E1B2E] leading-none">Cara lama</p>
                <p className="text-xs text-[#8C89B4] mt-1">Excel, buku tulis, chat manual</p>
              </div>
            </div>
            <ul className="space-y-3.5">
              {COMPARE_ROWS.map((r) => (
                <li key={r.aspect} className="flex gap-3">
                  <X size={17} className="text-[#D0584E] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-[#56548A] leading-snug">
                    <span className="font-semibold text-[#1E1B2E]">{r.aspect}:</span> {r.before}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Kartu: dengan SembaPOS (ditonjolkan) */}
          <motion.div
            initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="relative rounded-2xl bg-[#1E1B2E] text-[#D5D8E8] p-6 sm:p-7 shadow-[0_30px_60px_-25px_rgba(28,26,23,0.6)]"
          >
            <span className="absolute -top-3 right-5 text-[11px] font-bold uppercase tracking-wider bg-[#D4B25E] text-[#1E1B2E] px-3 py-1 rounded-full">
              Lebih rapi
            </span>
            <div className="flex items-center gap-2.5 mb-5">
              <span className="w-9 h-9 rounded-lg bg-[#10B981]/20 flex items-center justify-center">
                <Check size={18} className="text-[#34D399]" />
              </span>
              <div>
                <p className="font-display text-lg font-bold text-white leading-none">Pakai SembaPOS</p>
                <p className="text-xs text-[#A5A2C8] mt-1">Satu aplikasi, semua otomatis</p>
              </div>
            </div>
            <ul className="space-y-3.5">
              {COMPARE_ROWS.map((r) => (
                <li key={r.aspect} className="flex gap-3">
                  <Check size={17} className="text-[#34D399] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-[#A5A2C8] leading-snug">
                    <span className="font-semibold text-white">{r.aspect}:</span> {r.after}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/register"
            onClick={() => trackPixel('Lead', { content_name: 'compare_section' })}
            className="btn-brand"
          >
            Pindah ke cara yang rapi <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  )
}

// Kalkulator ROI interaktif — pengunjung menggeser kondisi tokonya dan melihat
// estimasi tambahan omzet, kebocoran yang tercegah, & waktu admin yang dihemat.
// Semua angka memakai asumsi KONSERVATIF dan diberi label "estimasi" — tujuannya
// memberi gambaran, bukan janji. Pembanding biaya diambil dari paket termurah
// yang benar-benar aktif (real-time), fallback Rp99.000 bila paket belum termuat.
function RoiSection({ ctx }) {
  const { sections, packages } = ctx

  // Asumsi konservatif (bisa ditinjau): uplift kunjungan ulang dari loyalti +
  // pengingat booking, dan omzet yang sebelumnya bocor karena tak tercatat.
  const RETURN_UPLIFT = 0.06   // 6% omzet — pelanggan balik lebih sering
  const LEAK_RECOVERED = 0.03  // 3% omzet — transaksi tunai yang tadinya lolos

  const [custPerDay, setCustPerDay] = useState(25)
  const [avgPrice, setAvgPrice]     = useState(45000)
  const [openDays, setOpenDays]     = useState(26)

  const monthlyRevenue = custPerDay * avgPrice * openDays
  const upliftValue    = Math.round(monthlyRevenue * RETURN_UPLIFT)
  const leakValue      = Math.round(monthlyRevenue * LEAK_RECOVERED)
  const totalBenefit   = upliftValue + leakValue
  // Waktu rekap/laporan manual yang dihemat — skala ringan dengan volume.
  const hoursSaved     = Math.min(60, Math.round(8 + (custPerDay * openDays) / 90))

  const cheapest = packages?.length
    ? Math.min(...packages.map(p => Number(p.price) || Infinity).filter(Boolean))
    : 99000
  const planPrice = Number.isFinite(cheapest) && cheapest > 0 ? cheapest : 99000
  const roiMultiple = planPrice > 0 ? Math.max(1, Math.round(totalBenefit / planPrice)) : 0

  const inputs = [
    { label: 'Pelanggan per hari', value: custPerDay, set: setCustPerDay, min: 5,    max: 150,    step: 1,    fmt: v => `${v} orang` },
    { label: 'Rata-rata harga layanan', value: avgPrice, set: setAvgPrice, min: 15000, max: 200000, step: 5000, fmt: v => formatRupiah(v) },
    { label: 'Hari buka per bulan', value: openDays, set: setOpenDays, min: 20,   max: 31,     step: 1,    fmt: v => `${v} hari` },
  ]

  const results = [
    { icon: 'TrendingUp',     label: 'Tambahan omzet / bulan', value: formatRupiah(upliftValue), hint: 'dari pelanggan yang balik lebih sering' },
    { icon: 'Wallet',         label: 'Kebocoran tercegah / bulan', value: formatRupiah(leakValue), hint: 'transaksi tunai kini tercatat rapi' },
    { icon: 'CalendarClock',  label: 'Waktu admin dihemat', value: `±${hoursSaved} jam`, hint: 'laporan & rekap jalan otomatis' },
  ]

  return (
    <section id="hitung-untung" className="py-14 sm:py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <SectionHeading {...sections.roi} />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-12 grid lg:grid-cols-5 gap-6 items-stretch"
        >
          {/* Panel input — geser kondisi toko */}
          <div className="lg:col-span-2 bg-white border border-[#D5D8E8] rounded-2xl p-7 shadow-[0_20px_45px_-30px_rgba(28,26,23,0.5)]">
            <p className="text-sm font-bold text-[#1E1B2E] mb-6">Kondisi toko kamu</p>
            <div className="space-y-7">
              {inputs.map((f) => (
                <div key={f.label}>
                  <div className="flex items-baseline justify-between mb-2">
                    <label className="text-sm text-[#56548A]">{f.label}</label>
                    <span className="text-sm font-bold text-[#4F46E5] tabular-nums">{f.fmt(f.value)}</span>
                  </div>
                  <input
                    type="range" min={f.min} max={f.max} step={f.step} value={f.value}
                    onChange={(e) => f.set(Number(e.target.value))}
                    aria-label={f.label}
                    className="roi-range w-full"
                    style={{ accentColor: '#6366F1' }}
                  />
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs text-[#8C89B4] leading-relaxed">
              Estimasi memakai asumsi konservatif (kunjungan ulang +6%, kebocoran tercatat +3%). Hasil nyata tiap toko bisa berbeda.
            </p>
          </div>

          {/* Panel hasil */}
          <div className="lg:col-span-3 flex flex-col gap-5">
            <div className="grid sm:grid-cols-3 gap-4">
              {results.map((r, i) => {
                const Icon = getIcon(r.icon)
                return (
                  <motion.div
                    key={r.label}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="bg-white border border-[#D5D8E8] rounded-2xl p-5 flex flex-col"
                  >
                    <span className="w-9 h-9 rounded-lg bg-[#EEF0FF] flex items-center justify-center mb-3">
                      <Icon size={18} className="text-[#4F46E5]" />
                    </span>
                    <span className="font-display text-xl font-bold text-[#1E1B2E] tabular-nums leading-tight">{r.value}</span>
                    <span className="text-xs font-semibold text-[#56548A] mt-1">{r.label}</span>
                    <span className="text-[11px] text-[#8C89B4] mt-1 leading-snug">{r.hint}</span>
                  </motion.div>
                )
              })}
            </div>

            {/* Banner kesimpulan — manfaat vs biaya langganan */}
            <div className="flex-1 rounded-2xl bg-[#1E1B2E] text-white p-7 flex flex-col sm:flex-row sm:items-center gap-5 shadow-[0_30px_60px_-25px_rgba(28,26,23,0.6)]">
              <div className="flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#D4B25E]">Estimasi manfaat per bulan</p>
                <p className="font-display text-3xl sm:text-4xl font-bold mt-1 tabular-nums">{formatRupiah(totalBenefit)}</p>
                <p className="text-sm text-[#A5A2C8] mt-2">
                  Sekitar <span className="font-bold text-[#D4B25E]">{roiMultiple}×</span> lipat dari biaya langganan mulai {formatRupiah(planPrice)}/bulan.
                </p>
              </div>
              <Link
                to="/register"
                onClick={() => trackPixel('Lead', { content_name: 'roi_calculator' })}
                className="btn-brand whitespace-nowrap self-start sm:self-auto"
              >
                Coba Gratis 14 Hari <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// Peta tipe blok → komponen. Dipakai renderer LandingPage untuk render `layout`.
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
      scrolled ? 'bg-[#F4F4FA]/90 backdrop-blur-md border-b border-[#D5D8E8]' : 'bg-transparent'
    }`}>
      <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          {logo ? (
            <img src={logo} alt={siteName} className="h-9 w-auto max-w-[180px] object-contain" />
          ) : (
            <>
              <div className="w-9 h-9 rounded-xl bg-[#1E1B2E] flex items-center justify-center">
                <Lucide.Scissors size={17} className="text-[#6366F1]" />
              </div>
              <span className="font-display text-xl font-bold tracking-tight text-[#1E1B2E]">{siteName}</span>
            </>
          )}
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          <a href="#fitur" className="text-[#56548A] hover:text-[#1E1B2E] transition-colors">Fitur</a>
          <a href="#harga" className="text-[#56548A] hover:text-[#1E1B2E] transition-colors">Harga</a>
        </nav>

        <div className="flex items-center gap-2">
          {isAuthed ? (
            <Link to={homePath} className="px-4 py-2 rounded-lg bg-[#6366F1] text-[#1E1B2E] text-sm font-semibold hover:bg-[#A5A2FF] transition-colors">
              Buka Dashboard
            </Link>
          ) : (
            <Link to="/register" onClick={() => trackPixel('Lead')} className="px-4 py-2 rounded-lg bg-[#6366F1] text-[#1E1B2E] text-sm font-semibold hover:bg-[#A5A2FF] transition-colors">
              Daftar Gratis
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

function SectionHeading({ kicker, title, subtitle, dark }) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <motion.p
        initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
        className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] ${dark ? 'text-[#D4B25E]' : 'text-[#4F46E5]'}`}
      >
        <span className={`w-5 h-px ${dark ? 'bg-[#C9A84C]' : 'bg-[#6366F1]'}`} /> {kicker} <span className={`w-5 h-px ${dark ? 'bg-[#C9A84C]' : 'bg-[#6366F1]'}`} />
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        className={`font-display text-3xl lg:text-[2.6rem] font-bold mt-3 leading-tight ${dark ? 'text-white' : 'text-[#1E1B2E]'}`}
      >
        {title}
      </motion.h2>
      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          transition={{ delay: 0.08 }}
          className={`mt-3 ${dark ? 'text-[#A5A2C8]' : 'text-[#56548A]'}`}
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
      className="rounded-xl bg-white border border-[#D5D8E8] overflow-hidden"
    >
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-[#FAFAFD] transition-colors"
      >
        <span className="font-semibold text-[#1E1B2E] pr-4">{item.question}</span>
        <Lucide.ChevronDown size={17} className={`text-[#4F46E5] flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-5 text-sm text-[#56548A] leading-relaxed whitespace-pre-line">{item.answer}</p>
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
          className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#F4F4FA]/95 backdrop-blur-md border-t border-[#D5D8E8] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-12px_rgba(28,26,23,0.3)]"
        >
          <div className="max-w-md mx-auto">
            <Link
              to={to}
              onClick={onCta}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#6366F1] text-[#1E1B2E] font-bold text-sm shadow-[0_10px_24px_-10px_rgba(99,102,241,0.9)]"
            >
              {label}
              <Lucide.ArrowRight size={16} />
            </Link>
            {note && (
              <p className="text-center text-[11px] text-[#7C7AA8] mt-1.5 truncate">
                {authed ? note : <><Lucide.ShieldCheck size={11} className="inline -mt-0.5 mr-1 text-[#6366F1]" />{note}</>}
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
    <footer className="bg-[#1E1B2E] text-[#A5A2C8] px-6 pt-14 pb-8">
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        <div className="col-span-2">
          <div className="flex items-center gap-2.5 mb-3">
            {logo ? (
              <img src={logo} alt={siteName} className="h-9 w-auto max-w-[180px] object-contain" />
            ) : (
              <>
                <div className="w-9 h-9 rounded-xl bg-[#6366F1] flex items-center justify-center">
                  <Lucide.Scissors size={17} className="text-[#1E1B2E]" />
                </div>
                <span className="font-display text-xl font-bold text-[#F4F4FA]">{siteName}</span>
              </>
            )}
          </div>
          <p className="text-[13px] leading-relaxed max-w-sm">
            {text || 'Sistem manajemen barbershop modern: kasir, antrian, booking online, multi-cabang, dan laporan pintar dalam satu aplikasi.'}
          </p>
        </div>
        <div>
          <h4 className="font-semibold text-[#F4F4FA] mb-3">Produk</h4>
          <ul className="space-y-2 text-[13px]">
            <li><a href="#fitur" className="hover:text-[#6366F1] transition-colors">Fitur</a></li>
            <li><a href="#harga" className="hover:text-[#6366F1] transition-colors">Harga</a></li>
            <li><Link to="/register" className="hover:text-[#6366F1] transition-colors">Daftar Gratis</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-[#F4F4FA] mb-3">Kontak</h4>
          <ul className="space-y-2.5 text-[13px]">
            {phone && (
              <li>
                <a
                  href={waPhone ? `https://wa.me/${waPhone}` : `tel:${phone.replace(/[^\d+]/g, '')}`}
                  target={waPhone ? '_blank' : undefined}
                  rel={waPhone ? 'noopener noreferrer' : undefined}
                  className="inline-flex items-start gap-2 hover:text-[#6366F1] transition-colors"
                >
                  <Lucide.Phone size={14} className="text-[#6366F1] flex-shrink-0 mt-0.5" />
                  <span>{phone}</span>
                </a>
              </li>
            )}
            {email && (
              <li>
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-start gap-2 hover:text-[#6366F1] transition-colors break-all"
                >
                  <Lucide.Mail size={14} className="text-[#6366F1] flex-shrink-0 mt-0.5" />
                  <span>{email}</span>
                </a>
              </li>
            )}
            {address && (
              <li className="inline-flex items-start gap-2">
                <Lucide.MapPin size={14} className="text-[#6366F1] flex-shrink-0 mt-0.5" />
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
      <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-white/10 text-[12px] text-[#7C7AA8] flex flex-col sm:flex-row items-center justify-between gap-3 text-center">
        <span>© {new Date().getFullYear()} {siteName}. Dibuat untuk barbershop Indonesia.</span>
        <div className="flex items-center gap-4">
          <Link to="/syarat-ketentuan" className="hover:text-[#6366F1] transition-colors">Syarat &amp; Ketentuan</Link>
          <Link to="/kebijakan-privasi" className="hover:text-[#6366F1] transition-colors">Kebijakan Privasi</Link>
        </div>
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
      <polyline points={pts} fill="none" stroke="#6366F1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Toast notifikasi "hidup" di atas mockup — berganti tiap beberapa detik supaya
// pengunjung langsung merasa aplikasinya jalan real-time (booking, bayar, rating).
function LiveToast() {
  const items = [
    { Icon: Lucide.CalendarDays, tint: '#4F46E5', bg: '#E8EAF5', title: 'Booking baru masuk', sub: 'Andi · potong + keramas · 14:30' },
    { Icon: Lucide.Wallet,       tint: '#059669', bg: '#DCFCE7', title: 'Pembayaran diterima', sub: 'Rp 85.000 · QRIS' },
    { Icon: Lucide.Star,         tint: '#C2410C', bg: '#FFEDD5', title: 'Rating baru ⭐ 5,0', sub: '“Cepet & rapi, mantap!”' },
  ]
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % items.length), 2800)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const cur = items[idx]
  const Icon = cur.Icon
  return (
    <div className="absolute bottom-3 right-3 z-20 w-[185px] sm:w-[215px] pointer-events-none">
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.96 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="flex items-center gap-2.5 rounded-xl border border-[#D5D8E8] bg-white/95 backdrop-blur px-3 py-2 shadow-[0_16px_40px_-16px_rgba(28,26,23,0.45)]"
        >
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: cur.bg }}>
            <Icon size={14} style={{ color: cur.tint }} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-[#1E1B2E] leading-tight truncate">{cur.title}</p>
            <p className="text-[9px] text-[#7C7AA8] leading-tight truncate mt-0.5">{cur.sub}</p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
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
    { name: 'Andi', rating: '4.9', value: 'Rp 1,4jt', tone: '#6366F1' },
    { name: 'Budi', rating: '4.8', value: 'Rp 1,1jt', tone: '#7BAEC9' },
    { name: 'Citra', rating: '4.7', value: 'Rp 0,9jt', tone: '#C97B9B' },
  ]

  return (
    <div className="relative aspect-square sm:aspect-[16/10] bg-[#F4F4FA] flex flex-col overflow-hidden">
      {/* Browser chrome */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 bg-white border-b border-[#D5D8E8]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-[#E5786E]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#818CF8]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#34D399]" />
          </div>
          <span className="ml-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#E8EAF5] text-[10px] text-[#7C7AA8] truncate">
            <Lucide.Lock size={9} /> sembapos.com/admin/dashboard
          </span>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#059669] shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <motion.span
              className="absolute inline-flex h-full w-full rounded-full bg-[#34D399]"
              animate={{ scale: [1, 2.4, 1], opacity: [0.7, 0, 0.7] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#059669]" />
          </span>
          Live
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 grid grid-cols-12 min-h-0">
        {/* Sidebar */}
        <aside className="col-span-3 hidden sm:flex flex-col p-3 gap-3 border-r border-[#D5D8E8] bg-white/50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#A5A2FF] to-[#6366F1] flex items-center justify-center shadow-sm shrink-0">
              <Lucide.Scissors size={14} className="text-[#1E1B2E]" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#1E1B2E] font-display leading-none">BarberOS</p>
              <p className="text-[8px] text-[#7C7AA8] mt-1 truncate">Barber Kingdom</p>
            </div>
          </div>
          <div className="space-y-0.5">
            {nav.map((n) => {
              const Icon = Lucide[n.icon] || Lucide.Circle
              return (
                <div
                  key={n.label}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-medium ${
                    n.active ? 'bg-[#6366F1] text-[#1E1B2E] shadow-sm' : 'text-[#7C7AA8]'
                  }`}
                >
                  <Icon size={12} className="shrink-0" /> <span className="truncate">{n.label}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-auto rounded-lg border border-[#C7CBE0] bg-[#E8EAF5] p-2">
            <p className="text-[9px] font-semibold text-[#4F46E5]">Paket Pro aktif</p>
            <p className="text-[8px] text-[#7C7AA8] mt-0.5 leading-tight">3 cabang • 12 staf</p>
          </div>
        </aside>

        {/* Main */}
        <main className="col-span-12 sm:col-span-9 p-3 sm:p-4 flex flex-col gap-2.5 min-h-0">
          {/* header */}
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-bold text-[#1E1B2E] font-display truncate">Selamat pagi, Barber Kingdom 👋</p>
              <p className="text-[9px] text-[#7C7AA8]">Ringkasan performa hari ini</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[#D5D8E8] bg-white text-[9px] text-[#3F3D5C]">
                <Lucide.Calendar size={9} /> Hari ini <Lucide.ChevronDown size={9} />
              </span>
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#1E1B2E] to-[#2D2870] flex items-center justify-center text-[8px] font-bold text-[#A5A2FF]">BK</div>
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
                className="p-2.5 rounded-xl bg-white border border-[#D5D8E8] shadow-[0_6px_18px_-10px_rgba(28,26,23,0.3)]"
              >
                <div className="flex items-start justify-between gap-1">
                  <p className="text-[8px] sm:text-[9px] text-[#7C7AA8] truncate">{k.label}</p>
                  <Sparkline data={k.spark} />
                </div>
                <div className="flex items-end justify-between mt-1 gap-1">
                  <p className="text-sm sm:text-base font-bold text-[#1E1B2E] font-display leading-none">{k.value}</p>
                  <span className="inline-flex items-center gap-0.5 text-[8px] font-semibold text-[#059669]">
                    <Lucide.TrendingUp size={9} />{k.up}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* chart + barber leaderboard */}
          <div className="grid grid-cols-3 gap-2 flex-1 min-h-0">
            {/* Revenue chart */}
            <div className="col-span-3 sm:col-span-2 p-2.5 rounded-xl bg-white border border-[#D5D8E8] shadow-[0_6px_18px_-10px_rgba(28,26,23,0.3)] flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                <p className="text-[9px] sm:text-[10px] font-medium text-[#3F3D5C]">Pendapatan 7 hari</p>
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-[#4F46E5]">
                  <Lucide.ArrowUpRight size={10} /> 24%
                </span>
              </div>
              <div className="flex-1 min-h-0 mt-1">
                <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full h-full">
                  <defs>
                    <linearGradient id="mockArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366F1" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0.25, 0.5, 0.75].map((g) => (
                    <line key={g} x1={pad} x2={W - pad} y1={pad + (H - pad * 2) * g} y2={pad + (H - pad * 2) * g} stroke="#E8EAF5" strokeWidth="1" />
                  ))}
                  <motion.path
                    d={areaPath} fill="url(#mockArea)"
                    initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.5 }}
                  />
                  <motion.path
                    d={linePath} fill="none" stroke="#6366F1" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.2, ease: 'easeInOut' }}
                  />
                  <motion.circle
                    cx={last[0]} cy={last[1]} r="3.4" fill="#6366F1" stroke="#fff" strokeWidth="1.6"
                    initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 1.2, type: 'spring', stiffness: 300 }}
                  />
                  {days.map((d, i) => (
                    <text key={d} x={pts[i][0]} y={H + 9} textAnchor="middle" fontSize="6.5" fill="#A5A2C8">{d}</text>
                  ))}
                </svg>
              </div>
            </div>

            {/* Barber leaderboard */}
            <div className="hidden sm:flex flex-col col-span-1 p-2.5 rounded-xl bg-white border border-[#D5D8E8] shadow-[0_6px_18px_-10px_rgba(28,26,23,0.3)]">
              <p className="text-[9px] sm:text-[10px] font-medium text-[#3F3D5C] mb-1.5">Barber terbaik</p>
              <div className="space-y-1.5">
                {barbers.map((b, i) => (
                  <motion.div
                    key={b.name}
                    initial={{ opacity: 0, x: 8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.6 + i * 0.12 }}
                    className="flex items-center gap-2"
                  >
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0" style={{ backgroundColor: b.tone }}>{b.name[0]}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-medium text-[#1E1B2E] truncate leading-none">{b.name}</p>
                      <p className="text-[8px] text-[#7C7AA8] flex items-center gap-0.5 mt-1">
                        <Lucide.Star size={7} className="fill-[#818CF8] text-[#818CF8]" /> {b.rating}
                      </p>
                    </div>
                    <span className="text-[8px] font-semibold text-[#3F3D5C] shrink-0">{b.value}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>

      <LiveToast />
    </div>
  )
}
