import React, { useEffect, useRef, useState } from 'react'
import { motion, useInView, animate } from 'framer-motion'
import {
  Scissors, CalendarClock, Building2, TrendingUp, MessageCircle,
  Star, ArrowRight, Check, Zap, Sparkles, Crown,
} from 'lucide-react'

/*
 * LANDING PREVIEW — "Modern Barbershop Editorial"
 * Halaman PREVIEW terpisah (route /preview-landing). TIDAK menyentuh landing live.
 * Arah desain: craft barbershop premium × kejernihan modern.
 * Display: Bricolage Grotesque · Body: Plus Jakarta Sans (font Indonesia).
 */

const FONT_LINK_ID = 'semba-preview-fonts'

function useFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return
    const pre1 = document.createElement('link')
    pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com'
    const pre2 = document.createElement('link')
    pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = 'anonymous'
    const link = document.createElement('link')
    link.id = FONT_LINK_ID
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@500;600;700;800;900&family=Hanken+Grotesk:wght@400;500;600;700&display=swap'
    document.head.append(pre1, pre2, link)
  }, [])
}

// Angka yang menghitung naik saat masuk viewport
function CountUp({ to, prefix = '', format = (v) => Math.round(v).toLocaleString('id-ID'), duration = 1.4 }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!inView) return
    const controls = animate(0, to, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: setVal })
    return () => controls.stop()
  }, [inView, to, duration])
  return <span ref={ref}>{prefix}{format(val)}</span>
}

export default function LandingPagePreview() {
  useFonts()
  return (
    <div className="semba-preview">
      <style>{CSS}</style>

      {/* ── Decorative atmosphere ─────────────────────────────────────────── */}
      <div className="bg-atmos" aria-hidden>
        <div className="glow glow-a" />
        <div className="glow glow-b" />
        <div className="pole" />
        <div className="grain" />
      </div>

      <Nav />
      <Hero />
      <Marquee />
      <Bento />
      <Pricing />
      <Testimonials />
      <Faq />
      <Closer />
      <FooterMini />
    </div>
  )
}

/* ── Nav ──────────────────────────────────────────────────────────────────── */
function Nav() {
  return (
    <motion.nav
      initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="nav"
    >
      <a className="brand" href="#">
        <span className="brand-mark"><Scissors size={16} strokeWidth={2.6} /></span>
        <span className="brand-name">Semba<span className="brand-accent">POS</span></span>
      </a>
      <div className="nav-links">
        <a href="#fitur">Fitur</a>
        <a href="#harga">Harga</a>
        <a href="#cerita">Cerita</a>
      </div>
      <div className="nav-cta">
        <a className="ghost" href="#">Masuk</a>
        <a className="btn btn-ink" href="#">Coba gratis<ArrowRight size={15} /></a>
      </div>
    </motion.nav>
  )
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */
const ease = [0.22, 1, 0.36, 1]
const rise = (d = 0) => ({
  initial: { y: 26, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  transition: { duration: 0.7, ease, delay: d },
})

function Hero() {
  return (
    <header className="hero">
      <div className="hero-grid">
        {/* Left — message */}
        <div className="hero-copy">
          <motion.div {...rise(0.05)} className="badge">
            <span className="ping"><span /></span>
            POS yang ngerti barbershop
          </motion.div>

          <motion.h1 {...rise(0.12)} className="display headline">
            Antrean <em className="hl hl-indigo">rapi</em>,<br />
            kasir <em className="hl hl-mint">ngebut</em>,<br />
            cuan <em className="hl hl-gold">kebaca</em>.
          </motion.h1>

          <motion.p {...rise(0.2)} className="lede">
            Satu aplikasi buat ngurus seluruh barbershop kamu — dari giliran pelanggan,
            kasir, sampai laporan pemilik. Berhenti ngurus catatan, mulai ngurus pelanggan.
          </motion.p>

          <motion.div {...rise(0.28)} className="cta-row">
            <a className="btn btn-indigo lg" href="#">
              Mulai gratis 14 hari <ArrowRight size={18} />
            </a>
            <a className="btn btn-line lg" href="#harga">Lihat harga</a>
          </motion.div>

          <motion.div {...rise(0.36)} className="trust">
            <div className="avatars">
              {['#6366F1', '#10B981', '#C9A84C', '#4F46E5'].map((c, i) => (
                <span key={i} style={{ background: c, zIndex: 4 - i }} />
              ))}
            </div>
            <div className="trust-txt">
              <div className="stars"><Star size={13} /><Star size={13} /><Star size={13} /><Star size={13} /><Star size={13} /></div>
              <span><b>500+</b> barbershop sudah pindah dari buku catatan</span>
            </div>
          </motion.div>
        </div>

        {/* Right — alive product visual */}
        <HeroStage />
      </div>
    </header>
  )
}

function HeroStage() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.9, ease, delay: 0.25 }}
      className="stage"
    >
      <div className="stage-tilt">
        <DashboardCard />

        {/* Floating live cards */}
        <motion.div
          className="float float-book"
          initial={{ opacity: 0, x: 30, y: 10 }}
          animate={{ opacity: 1, x: 0, y: [0, -8, 0] }}
          transition={{ x: { delay: 0.9, duration: 0.6, ease }, opacity: { delay: 0.9, duration: 0.6 }, y: { delay: 1.6, duration: 4.5, repeat: Infinity, ease: 'easeInOut' } }}
        >
          <span className="fi fi-indigo"><CalendarClock size={16} /></span>
          <div><b>Booking baru</b><small>Andi · potong + cukur · 16.00</small></div>
        </motion.div>

        <motion.div
          className="float float-wa"
          initial={{ opacity: 0, x: -30, y: -10 }}
          animate={{ opacity: 1, x: 0, y: [0, 9, 0] }}
          transition={{ x: { delay: 1.15, duration: 0.6, ease }, opacity: { delay: 1.15, duration: 0.6 }, y: { delay: 1.9, duration: 5.2, repeat: Infinity, ease: 'easeInOut' } }}
        >
          <span className="fi fi-mint"><MessageCircle size={16} /></span>
          <div><b>Struk terkirim</b><small>via WhatsApp ke pelanggan ✓</small></div>
        </motion.div>
      </div>
    </motion.div>
  )
}

function DashboardCard() {
  const bars = [38, 52, 44, 70, 58, 86, 64]
  return (
    <div className="dash">
      <div className="dash-top">
        <div className="dash-id">
          <span className="dash-logo"><Scissors size={13} /></span>
          <div>
            <b>Barberque Kemang</b>
            <small>Cabang Jakarta</small>
          </div>
        </div>
        <span className="live"><span className="ping"><span /></span>Live</span>
      </div>

      <div className="kpis">
        <div className="kpi">
          <small>Omzet hari ini</small>
          <b className="num">Rp <CountUp to={4820000} format={(v) => Math.round(v / 1000).toLocaleString('id-ID') + 'rb'} /></b>
          <span className="delta up"><TrendingUp size={11} /> +12%</span>
        </div>
        <div className="kpi">
          <small>Antrean</small>
          <b className="num"><CountUp to={6} duration={1} /></b>
          <span className="delta">2 lagi diproses</span>
        </div>
        <div className="kpi">
          <small>Booking</small>
          <b className="num"><CountUp to={14} duration={1.1} /></b>
          <span className="delta up">hari ini</span>
        </div>
      </div>

      <div className="chart">
        <div className="chart-head"><small>Omzet 7 hari</small><small className="muted">Sen–Min</small></div>
        <div className="bars">
          {bars.map((h, i) => (
            <motion.span
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ delay: 0.7 + i * 0.07, duration: 0.7, ease }}
              className={i === 5 ? 'bar peak' : 'bar'}
            />
          ))}
        </div>
      </div>

      <div className="lead">
        <div className="lead-head"><Crown size={13} /> Barber terlaris</div>
        {[['Rizky', '2,1jt', 92], ['Dimas', '1,7jt', 74], ['Bayu', '1,3jt', 58]].map(([n, v, w], i) => (
          <div className="lead-row" key={n}>
            <span className="rank">{i + 1}</span>
            <span className="lead-name">{n}</span>
            <div className="lead-track"><motion.span initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ delay: 1 + i * 0.12, duration: 0.7, ease }} /></div>
            <b className="lead-val">{v}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Marquee band ─────────────────────────────────────────────────────────── */
function Marquee() {
  const items = ['Tutup buku 30 detik', 'Antrean online', 'Multi-cabang satu layar', 'Struk via WhatsApp', 'Laporan otomatis', 'Komisi barber otomatis', 'Loyalti pelanggan']
  const loop = [...items, ...items]
  return (
    <div className="marquee" aria-hidden>
      <div className="marquee-track">
        {loop.map((t, i) => (
          <span className="mq-item" key={i}>{t}<i className="mq-dot" /></span>
        ))}
      </div>
    </div>
  )
}

/* ── Bento features ───────────────────────────────────────────────────────── */
const FEATURES = [
  { k: 'big', icon: Scissors, title: 'Kasir khusus barbershop', desc: 'Catat layanan, produk, sampai komisi barber sekali tap. Antrean nggak numpuk, transaksi kelar dalam hitungan detik.', accent: 'indigo' },
  { k: 'tall', icon: CalendarClock, title: 'Booking & antrian online', desc: 'Pelanggan booking sendiri lewat link toko. Giliran rapi otomatis, nggak ada lagi rebutan kursi.', accent: 'mint' },
  { k: 's', icon: Building2, title: 'Banyak cabang, satu layar', desc: 'Pantau semua cabang dari satu dashboard.', accent: 'indigo' },
  { k: 's', icon: TrendingUp, title: 'Laporan yang ngerti sendiri', desc: 'Omzet, layanan terlaris, performa barber — kebaca otomatis tanpa Excel.', accent: 'gold' },
  { k: 's', icon: MessageCircle, title: 'WhatsApp otomatis', desc: 'Konfirmasi booking & struk mampir langsung ke WhatsApp pelanggan.', accent: 'mint' },
  { k: 's', icon: Star, title: 'Loyalti pelanggan', desc: 'Poin & pelanggan setia tercatat otomatis, bikin mereka balik lagi.', accent: 'gold' },
]

function Bento() {
  return (
    <section id="fitur" className="bento-wrap">
      <SectionHead kicker="Satu paket, semua beres" title={<>Semua yang barbershop kamu butuhin —<br /><span className="hl hl-indigo">tanpa</span> spreadsheet.</>} />
      <div className="bento">
        {FEATURES.map((f, i) => (
          <motion.article
            key={f.title}
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6, ease, delay: (i % 3) * 0.08 }}
            className={`tile tile-${f.k} acc-${f.accent}`}
          >
            <span className="tile-icon"><f.icon size={20} strokeWidth={2.2} /></span>
            <h3 className="display">{f.title}</h3>
            <p>{f.desc}</p>
            {f.k === 'big' && (
              <div className="tile-chips">
                <span><Zap size={12} /> Tap cepat</span>
                <span><Check size={12} /> Komisi auto</span>
                <span><Sparkles size={12} /> Struk instan</span>
              </div>
            )}
          </motion.article>
        ))}
      </div>
    </section>
  )
}

function SectionHead({ kicker, title, center }) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true }} transition={{ duration: 0.6, ease }}
      className={`sec-head${center ? ' sec-head-center' : ''}`}
    >
      <span className="kicker"><i /> {kicker}</span>
      <h2 className="display">{title}</h2>
    </motion.div>
  )
}

/* ── Closer CTA ───────────────────────────────────────────────────────────── */
function Closer() {
  return (
    <section id="harga" className="closer">
      <div className="closer-card">
        <div className="closer-pole" aria-hidden />
        <motion.div
          initial={{ y: 24, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }} transition={{ duration: 0.7, ease }}
          className="closer-inner"
        >
          <span className="badge badge-dark"><span className="ping"><span /></span> Gratis 14 hari · tanpa kartu kredit</span>
          <h2 className="display closer-title">Siap bikin barbershop kamu<br /> makin <span className="hl hl-gold">rapi</span> & <span className="hl hl-mint">cuan</span>?</h2>
          <p>Daftar sekarang, toko kamu bisa jalan hari ini juga. Beneran.</p>
          <div className="cta-row center">
            <a className="btn btn-light lg" href="#">Mulai gratis sekarang <ArrowRight size={18} /></a>
            <a className="btn btn-ghost-light lg" href="#">Ngobrol dulu via WhatsApp</a>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/* ── Pricing ──────────────────────────────────────────────────────────────── */
const PLANS = [
  {
    name: 'Basic', price: 99000, tag: 'Pas buat barbershop yang baru mulai rapi-rapi.',
    inherit: null,
    lines: ['Kasir & transaksi tanpa batas', 'Booking + antrian online', 'Data pelanggan & layanan', 'Laporan omzet harian', '1 cabang'],
  },
  {
    name: 'Pro', price: 199000, tag: 'Buat toko yang sudah ramai dan pengin tumbuh lebih cepat.',
    inherit: 'Basic', featured: true,
    lines: ['Struk & konfirmasi via WhatsApp', 'Komisi barber otomatis', 'Loyalti & poin pelanggan', 'Sampai 3 cabang', 'Laporan performa barber'],
  },
  {
    name: 'Enterprise', price: 399000, tag: 'Skala besar, banyak cabang, semua fitur kebuka.',
    inherit: 'Pro',
    lines: ['Cabang tanpa batas', 'Absensi & GPS staf', 'Backup data terjadwal', 'Dukungan prioritas', 'Semua fitur kebuka'],
  },
]

function Pricing() {
  return (
    <section id="harga" className="price-wrap">
      <SectionHead kicker="Paket Harga" title={<>Harga jelas, <span className="hl hl-mint">tanpa</span> kejutan.</>} center />
      <p className="sec-sub">Mulai gratis 14 hari. Bayar cuma kalau toko makin ramai — bisa naik paket kapan saja.</p>
      <div className="plans">
        {PLANS.map((p, i) => {
          const annual = Math.round((p.price * 12 * 0.83) / 1000) * 1000
          return (
            <motion.div
              key={p.name}
              initial={{ y: 30, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, ease, delay: i * 0.08 }}
              className={`plan ${p.featured ? 'plan-feat' : ''}`}
            >
              {p.featured && <span className="plan-ribbon"><Star size={11} fill="currentColor" /> Paling banyak dipilih</span>}
              <h3 className="display plan-name">{p.name}</h3>
              <p className="plan-tag">{p.tag}</p>
              <div className="plan-price">
                <b className="display">Rp{(p.price / 1000).toLocaleString('id-ID')}rb</b>
                <span>/bulan</span>
              </div>
              <p className="plan-annual">Tahunan Rp{(annual / 1000).toLocaleString('id-ID')}rb — hemat 17%</p>
              <div className="plan-div" />
              {p.inherit && <p className="plan-inherit">Semua di paket {p.inherit}, plus:</p>}
              <ul className="plan-lines">
                {p.lines.map((l) => (
                  <li key={l}><span className="tick"><Check size={11} strokeWidth={3.2} /></span>{l}</li>
                ))}
              </ul>
              <a className={`btn lg plan-cta ${p.featured ? 'btn-indigo' : 'btn-ink'}`} href="#">Pilih {p.name} <ArrowRight size={16} /></a>
              <p className="plan-foot"><Check size={12} strokeWidth={3} /> Gratis 14 hari · tanpa kartu kredit</p>
            </motion.div>
          )
        })}
      </div>
      <p className="price-note"><Sparkles size={14} /> Semua paket sudah termasuk SSL, keamanan data, update gratis & dukungan tim kami.</p>
    </section>
  )
}

/* ── Testimonials ─────────────────────────────────────────────────────────── */
const TESTI = [
  { m: 'Dulu tutup buku bisa sejam, sekarang 5 menit kelar. Barber juga seneng komisinya kebaca jelas tiap hari.', n: 'Reza Maulana', r: 'Owner', b: 'Kapten Barber, Bekasi', t: 4 },
  { m: 'Pelanggan booking sendiri lewat link, antrean jadi rapi banget. Nggak ada lagi drama rebutan giliran pas rame.', n: 'Dimas Prayoga', r: 'Owner', b: 'Gentlemen Cut, Depok', t: 3 },
  { m: 'Punya 4 cabang, sekarang semua kepantau dari HP. Tahu cabang mana paling cuan tanpa harus keliling.', n: 'Bayu Saputra', r: 'Pemilik', b: 'Pangkas Bro, Bandung', t: 5 },
]

function Testimonials() {
  return (
    <section id="cerita" className="testi-wrap">
      <div className="testi-inner">
        <SectionHead kicker="Cerita Owner" title={<>Mereka pindah dari buku catatan —<br /><span className="hl hl-gold">dan</span> nggak mau balik lagi.</>} />
        <div className="testi-grid">
          {TESTI.map((t, i) => (
            <motion.figure
              key={t.n}
              initial={{ y: 28, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.6, ease, delay: i * 0.1 }}
              className="testi"
            >
              <div className="testi-stars">{Array.from({ length: 5 }).map((_, k) => <Star key={k} size={14} fill="currentColor" />)}</div>
              <blockquote>“{t.m}”</blockquote>
              <figcaption>
                <span className="testi-av" style={{ background: ['#6366F1', '#10B981', '#C9A84C'][i % 3] }}>{t.n[0]}</span>
                <span className="testi-who"><b>{t.n}</b><small>{t.r} · {t.b}</small></span>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── FAQ ──────────────────────────────────────────────────────────────────── */
const FAQS = [
  { q: 'Perlu install aplikasi atau alat khusus?', a: 'Nggak. SembaPOS jalan langsung di browser HP, tablet, atau komputer. Cukup buka, login, langsung pakai. Mau cetak struk pun bisa lewat printer Bluetooth biasa.' },
  { q: 'Data toko saya aman?', a: 'Aman. Semua data dienkripsi, di-backup otomatis, dan tiap orang (owner/kasir/barber) punya akses sesuai perannya. Datamu nggak bisa dilihat toko lain.' },
  { q: 'Ribet nggak buat pindah dari catatan manual?', a: 'Gampang banget. Daftar cuma semenit, ada checklist panduan, dan toko bisa jalan hari itu juga. Kalau bingung, tim kami bantu lewat WhatsApp.' },
  { q: 'Kalau punya banyak cabang gimana?', a: 'Bisa. Pantau semua cabang dari satu dashboard, lengkap dengan perbandingan omzet per cabang. Mulai paket Pro untuk 3 cabang, atau Enterprise untuk tanpa batas.' },
  { q: 'Bisa berhenti kapan saja?', a: 'Bisa, tanpa penalti. Coba dulu gratis 14 hari tanpa kartu kredit. Lanjut cuma kalau kamu merasa terbantu.' },
]

function Faq() {
  const [open, setOpen] = useState(0)
  return (
    <section className="faq-wrap">
      <SectionHead kicker="Tanya Jawab" title={<>Masih ragu? <span className="hl hl-indigo">Wajar</span> kok.</>} center />
      <div className="faq-list">
        {FAQS.map((f, i) => {
          const isOpen = open === i
          return (
            <motion.div
              key={i}
              initial={{ y: 16, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }} transition={{ duration: 0.5, ease, delay: i * 0.04 }}
              className={`faq ${isOpen ? 'faq-open' : ''}`}
            >
              <button className="faq-q" onClick={() => setOpen(isOpen ? -1 : i)}>
                <span className="display">{f.q}</span>
                <span className="faq-sign">{isOpen ? '−' : '+'}</span>
              </button>
              <motion.div
                initial={false}
                animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                transition={{ duration: 0.32, ease }}
                className="faq-a-wrap"
              >
                <p className="faq-a">{f.a}</p>
              </motion.div>
            </motion.div>
          )
        })}
      </div>
      <p className="faq-help">Belum nemu jawabannya? <a href="#">Chat tim kami via WhatsApp →</a></p>
    </section>
  )
}

function FooterMini() {
  return (
    <footer className="foot">
      <div className="foot-brand">
        <span className="brand-mark sm"><Scissors size={13} /></span>
        Semba<span className="brand-accent">POS</span>
      </div>
      <p>Pratinjau desain landing · belum tersambung ke konten asli.</p>
    </footer>
  )
}

/* ── Styles ───────────────────────────────────────────────────────────────── */
const CSS = `
.semba-preview{
  --ink:#0E0E1A; --ink-soft:#3A3950; --mute:#6B6A82;
  --indigo:#6366F1; --indigo-deep:#4F46E5; --mint:#10B981; --gold:#C9A84C;
  --canvas:#F4F4FB; --paper:#FFFFFF; --line:#E4E4F0;
  --display:'Schibsted Grotesk', ui-sans-serif, sans-serif;
  --body:'Hanken Grotesk', ui-sans-serif, sans-serif;
  position:relative; min-height:100vh; background:var(--canvas);
  color:var(--ink); font-family:var(--body); overflow-x:clip;
  -webkit-font-smoothing:antialiased;
}
.semba-preview *{box-sizing:border-box;}
.semba-preview .display{font-family:var(--display); letter-spacing:-0.02em;}
.semba-preview a{text-decoration:none; color:inherit;}

/* atmosphere */
.bg-atmos{position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:0;}
.glow{position:absolute; border-radius:50%; filter:blur(90px); opacity:.5;}
.glow-a{width:560px;height:560px; top:-180px; right:-120px; background:radial-gradient(circle, #6366F133, transparent 70%);}
.glow-b{width:480px;height:480px; top:420px; left:-160px; background:radial-gradient(circle, #10B98126, transparent 70%);}
.pole{position:absolute; top:-120px; right:8%; width:120px; height:1100px; transform:rotate(24deg);
  background:repeating-linear-gradient(45deg, #6366F114 0 14px, #10B98112 14px 28px, transparent 28px 56px);
  opacity:.6; mask-image:linear-gradient(to bottom, transparent, #000 18%, #000 70%, transparent);}
.grain{position:absolute; inset:0; opacity:.04; mix-blend-mode:multiply;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");}

/* shared atoms */
.btn{display:inline-flex; align-items:center; gap:8px; font-weight:700; font-family:var(--body);
  border-radius:999px; padding:11px 20px; font-size:14px; cursor:pointer; transition:transform .15s, box-shadow .2s, background .2s; white-space:nowrap;}
.btn:active{transform:translateY(1px) scale(.99);}
.btn.lg{padding:15px 26px; font-size:15.5px;}
.btn-indigo{background:var(--indigo); color:#fff; box-shadow:0 12px 30px -10px #6366F1aa;}
.btn-indigo:hover{background:var(--indigo-deep); box-shadow:0 18px 40px -12px #6366F1cc; transform:translateY(-1px);}
.btn-ink{background:var(--ink); color:#fff;}
.btn-ink:hover{transform:translateY(-1px);}
.btn-line{background:transparent; color:var(--ink); border:1.5px solid var(--line);}
.btn-line:hover{border-color:var(--indigo); color:var(--indigo);}
.btn-light{background:#fff; color:var(--ink); box-shadow:0 14px 36px -12px #0006;}
.btn-light:hover{transform:translateY(-1px);}
.btn-ghost-light{background:#ffffff1a; color:#fff; border:1.5px solid #ffffff33;}
.btn-ghost-light:hover{background:#ffffff2a;}

.badge{display:inline-flex; align-items:center; gap:8px; font-size:12.5px; font-weight:600;
  color:var(--indigo-deep); background:#6366F112; border:1px solid #6366F126;
  padding:7px 13px; border-radius:999px;}
.badge-dark{color:#fff; background:#ffffff14; border-color:#ffffff26;}
.ping{position:relative; width:8px; height:8px; display:inline-flex;}
.ping span{position:absolute; inset:0; border-radius:50%; background:var(--mint);}
.ping::after{content:''; position:absolute; inset:0; border-radius:50%; background:var(--mint); animation:ping 1.8s cubic-bezier(0,0,.2,1) infinite;}
@keyframes ping{75%,100%{transform:scale(2.4); opacity:0;}}

.hl{font-style:normal; position:relative; white-space:nowrap;}
.hl-indigo{color:var(--indigo);}
.hl-mint{color:var(--mint);}
.hl-gold{color:var(--gold);}

/* nav */
.nav{position:relative; z-index:5; max-width:1180px; margin:0 auto; padding:22px 24px;
  display:flex; align-items:center; justify-content:space-between; gap:20px;}
.brand{display:inline-flex; align-items:center; gap:10px; font-weight:800; font-size:19px; font-family:var(--display);}
.brand-mark{display:grid; place-items:center; width:30px; height:30px; border-radius:9px;
  background:linear-gradient(135deg, var(--indigo), var(--indigo-deep)); color:#fff; box-shadow:0 8px 18px -8px #6366F1cc;}
.brand-mark.sm{width:24px;height:24px;border-radius:7px;}
.brand-accent{color:var(--indigo);}
.nav-links{display:flex; gap:26px; font-size:14.5px; font-weight:500; color:var(--ink-soft);}
.nav-links a:hover{color:var(--indigo);}
.nav-cta{display:flex; align-items:center; gap:14px;}
.nav-cta .ghost{font-size:14.5px; font-weight:600; color:var(--ink-soft);}
.nav-cta .ghost:hover{color:var(--ink);}
@media(max-width:860px){.nav-links{display:none;} }

/* hero */
.hero{position:relative; z-index:2; max-width:1180px; margin:0 auto; padding:46px 24px 30px;}
.hero-grid{display:grid; grid-template-columns:1.05fr .95fr; gap:40px; align-items:center;}
@media(max-width:960px){.hero-grid{grid-template-columns:1fr; gap:48px;} }
.headline{font-size:clamp(40px, 6.4vw, 78px); font-weight:800; line-height:.98; margin:20px 0 0;}
.lede{font-size:clamp(16px,2.1vw,19px); line-height:1.6; color:var(--ink-soft); max-width:30em; margin:22px 0 0;}
.cta-row{display:flex; gap:14px; margin-top:30px; flex-wrap:wrap;}
.cta-row.center{justify-content:center;}
.trust{display:flex; align-items:center; gap:14px; margin-top:30px;}
.avatars{display:flex;}
.avatars span{width:34px;height:34px;border-radius:50%; border:2.5px solid var(--canvas); margin-left:-10px;
  box-shadow:0 2px 6px #0002;}
.avatars span:first-child{margin-left:0;}
.trust-txt{font-size:13px; color:var(--mute); line-height:1.3;}
.trust-txt b{color:var(--ink);}
.stars{display:flex; gap:1px; color:var(--gold); margin-bottom:2px;}
.stars svg{fill:var(--gold);}

/* hero stage */
.stage{position:relative; perspective:1600px;}
.stage-tilt{position:relative; transform:rotateY(-9deg) rotateX(3deg) rotate(1deg);}
@media(max-width:960px){.stage-tilt{transform:none;} }

.dash{position:relative; z-index:2; background:var(--paper); border:1px solid var(--line);
  border-radius:22px; padding:18px; box-shadow:0 40px 80px -34px #1e1b4e55, 0 8px 24px -12px #0002;}
.dash-top{display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;}
.dash-id{display:flex; align-items:center; gap:10px;}
.dash-logo{display:grid; place-items:center; width:34px;height:34px;border-radius:10px; color:#fff;
  background:linear-gradient(135deg,#0E0E1A,#2a2745);}
.dash-id b{display:block; font-size:14px; font-family:var(--display); font-weight:700;}
.dash-id small{font-size:11.5px; color:var(--mute);}
.live{display:inline-flex; align-items:center; gap:7px; font-size:11.5px; font-weight:700; color:var(--mint);
  background:#10B98114; border:1px solid #10B98130; padding:5px 10px; border-radius:999px;}

.kpis{display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:14px;}
.kpi{background:var(--canvas); border:1px solid var(--line); border-radius:14px; padding:11px 12px;}
.kpi small{font-size:10.5px; color:var(--mute); text-transform:uppercase; letter-spacing:.04em; font-weight:600;}
.kpi .num{display:block; font-family:var(--display); font-weight:800; font-size:19px; margin:3px 0 2px; letter-spacing:-0.02em;}
.kpi .delta{font-size:11px; color:var(--mute); font-weight:600;}
.kpi .delta.up{color:var(--mint); display:inline-flex; align-items:center; gap:3px;}

.chart{background:var(--canvas); border:1px solid var(--line); border-radius:14px; padding:12px 13px 13px; margin-bottom:14px;}
.chart-head{display:flex; justify-content:space-between; margin-bottom:9px;}
.chart-head small{font-size:11px; font-weight:600; color:var(--ink-soft);}
.chart-head .muted{color:var(--mute); font-weight:500;}
.bars{display:flex; align-items:flex-end; gap:7px; height:66px;}
.bar{flex:1; border-radius:5px 5px 3px 3px; background:linear-gradient(to top,#c7c9f5,#a5a8f0); min-height:6px;}
.bar.peak{background:linear-gradient(to top,var(--indigo),#8b8df7); box-shadow:0 6px 14px -6px #6366f1aa;}

.lead{background:var(--canvas); border:1px solid var(--line); border-radius:14px; padding:12px 13px;}
.lead-head{display:flex; align-items:center; gap:6px; font-size:11.5px; font-weight:700; color:var(--gold); margin-bottom:9px;}
.lead-row{display:flex; align-items:center; gap:9px; margin-top:8px;}
.rank{width:17px;height:17px;border-radius:5px; background:#0E0E1A; color:#fff; font-size:10px; font-weight:700; display:grid; place-items:center;}
.lead-name{font-size:12.5px; font-weight:600; width:46px;}
.lead-track{flex:1; height:6px; border-radius:99px; background:#e6e6f2; overflow:hidden;}
.lead-track span{display:block; height:100%; border-radius:99px; background:linear-gradient(90deg,var(--indigo),var(--mint));}
.lead-val{font-size:12px; font-family:var(--display); font-weight:700; width:42px; text-align:right;}

.float{position:absolute; display:flex; align-items:center; gap:11px; background:#fff;
  border:1px solid var(--line); border-radius:14px; padding:11px 14px; z-index:3;
  box-shadow:0 22px 44px -20px #1e1b4e66;}
.float div{line-height:1.25;}
.float b{display:block; font-size:12.5px; font-family:var(--display);}
.float small{font-size:11px; color:var(--mute);}
.fi{display:grid; place-items:center; width:30px;height:30px;border-radius:9px; color:#fff; flex:none;}
.fi-indigo{background:linear-gradient(135deg,var(--indigo),var(--indigo-deep));}
.fi-mint{background:linear-gradient(135deg,var(--mint),#0c9b6e);}
.float-book{top:-22px; right:-26px;}
.float-wa{bottom:34px; left:-40px;}
@media(max-width:520px){.float-book{right:-6px; top:-16px;} .float-wa{left:-6px;} }

/* marquee */
.marquee{position:relative; z-index:2; margin-top:46px; padding:16px 0; background:var(--ink); color:#fff; overflow:hidden;
  border-top:1px solid #ffffff10; border-bottom:1px solid #ffffff10;}
.marquee-track{display:flex; width:max-content; animation:scroll 30s linear infinite;}
.mq-item{display:inline-flex; align-items:center; font-family:var(--display); font-weight:700; font-size:17px; letter-spacing:-0.01em; padding:0 4px;}
.mq-dot{display:inline-block; width:7px;height:7px;border-radius:50%; background:var(--mint); margin:0 26px;}
@keyframes scroll{to{transform:translateX(-50%);}}

/* bento */
.bento-wrap{position:relative; z-index:2; max-width:1180px; margin:0 auto; padding:86px 24px;}
.sec-head{max-width:680px; margin-bottom:40px;}
.kicker{display:inline-flex; align-items:center; gap:8px; font-size:12.5px; font-weight:700; text-transform:uppercase;
  letter-spacing:.08em; color:var(--indigo);}
.kicker i{width:22px; height:2px; border-radius:2px; background:var(--indigo);}
.sec-head h2{font-size:clamp(30px,4.6vw,50px); font-weight:800; line-height:1.04; margin-top:14px;}
.bento{display:grid; grid-template-columns:repeat(3,1fr); gap:16px;}
@media(max-width:840px){.bento{grid-template-columns:repeat(2,1fr);} }
@media(max-width:560px){.bento{grid-template-columns:1fr;} }
.tile{position:relative; background:var(--paper); border:1px solid var(--line); border-radius:20px; padding:24px;
  transition:transform .25s, box-shadow .25s, border-color .25s; overflow:hidden;}
.tile:hover{transform:translateY(-4px); box-shadow:0 26px 50px -28px #1e1b4e40; border-color:#cfd0ee;}
.tile h3{font-size:18.5px; font-weight:700; margin:16px 0 8px;}
.tile p{font-size:14px; line-height:1.55; color:var(--ink-soft);}
.tile-big{grid-column:span 2; padding:30px;}
.tile-big h3{font-size:24px;}
.tile-big p{font-size:15.5px; max-width:34em;}
.tile-tall{grid-row:span 2; display:flex; flex-direction:column;}
.tile-tall p{flex:1;}
@media(max-width:840px){.tile-big{grid-column:span 2;} .tile-tall{grid-row:span 1;} }
@media(max-width:560px){.tile-big,.tile-tall{grid-column:span 1;} }
.tile-icon{display:grid; place-items:center; width:46px;height:46px; border-radius:13px; color:#fff;}
.acc-indigo .tile-icon{background:linear-gradient(135deg,var(--indigo),var(--indigo-deep));}
.acc-mint .tile-icon{background:linear-gradient(135deg,var(--mint),#0c9b6e);}
.acc-gold .tile-icon{background:linear-gradient(135deg,var(--gold),#b08f3a);}
.acc-indigo{background:linear-gradient(180deg,#fbfbff,#f3f3fd);}
.tile-chips{display:flex; gap:8px; flex-wrap:wrap; margin-top:18px;}
.tile-chips span{display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:600; color:var(--ink-soft);
  background:#6366F10e; border:1px solid #6366F11f; padding:5px 11px; border-radius:999px;}

/* closer */
.closer{position:relative; z-index:2; max-width:1180px; margin:0 auto; padding:0 24px 90px;}
.closer-card{position:relative; border-radius:30px; overflow:hidden; padding:72px 28px; text-align:center;
  background:radial-gradient(120% 130% at 80% 0%, #2c2858 0%, #0E0E1A 60%);}
.closer-pole{position:absolute; inset:0; opacity:.5; pointer-events:none;
  background:repeating-linear-gradient(45deg,#6366F11f 0 18px,#10B9811a 18px 36px,transparent 36px 72px);
  mask-image:radial-gradient(120% 120% at 80% 0%, #000, transparent 65%);}
.closer-inner{position:relative;}
.closer-title{font-size:clamp(30px,5vw,52px); font-weight:800; color:#fff; line-height:1.05; margin:20px 0 0;}
.closer p{color:#c7c6dd; font-size:16px; margin:16px 0 0;}
.closer .cta-row{margin-top:28px;}

/* footer */
.foot{position:relative; z-index:2; max-width:1180px; margin:0 auto; padding:26px 24px 50px;
  display:flex; align-items:center; justify-content:space-between; gap:16px; color:var(--mute); font-size:13px; flex-wrap:wrap;}
.foot-brand{display:inline-flex; align-items:center; gap:9px; font-family:var(--display); font-weight:800; font-size:16px; color:var(--ink);}

/* section head variants */
.sec-head-center{text-align:center; margin-left:auto; margin-right:auto;}
.sec-head-center .kicker{justify-content:center;}
.sec-sub{text-align:center; max-width:38em; margin:14px auto 0; color:var(--ink-soft); font-size:16px; line-height:1.55;}

/* pricing */
.price-wrap{position:relative; z-index:2; max-width:1180px; margin:0 auto; padding:30px 24px 92px;}
.plans{display:grid; grid-template-columns:repeat(3,1fr); gap:18px; margin-top:44px; align-items:start;}
.plan{position:relative; background:var(--paper); border:1px solid var(--line); border-radius:22px; padding:28px; display:flex; flex-direction:column; transition:transform .25s, box-shadow .25s;}
.plan:hover{transform:translateY(-5px); box-shadow:0 32px 64px -32px #1e1b4e44;}
.plan-feat{background:radial-gradient(130% 130% at 50% 0%, #2c2858 0%, #0E0E1A 72%); border-color:#2c2858; color:#cfceea; box-shadow:0 36px 70px -30px #1e1b4e88;}
@media(min-width:841px){.plan-feat{margin-top:-16px; margin-bottom:-16px; padding-top:40px; padding-bottom:40px;}}
.plan-ribbon{position:absolute; top:-12px; left:50%; transform:translateX(-50%); display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:700; background:var(--indigo); color:#fff; padding:5px 13px; border-radius:999px; white-space:nowrap; box-shadow:0 10px 22px -8px #6366f1cc;}
.plan-name{font-size:22px; font-weight:800;}
.plan-feat .plan-name{color:#fff;}
.plan-tag{font-size:13px; color:var(--mute); margin-top:6px; min-height:38px; line-height:1.45;}
.plan-feat .plan-tag{color:#a5a2c8;}
.plan-price{display:flex; align-items:flex-end; gap:7px; margin-top:16px;}
.plan-price b{font-size:38px; font-weight:800; line-height:1;}
.plan-feat .plan-price b{color:#fff;}
.plan-price span{font-size:13px; color:var(--mute); padding-bottom:3px;}
.plan-annual{font-size:12px; color:var(--indigo-deep); font-weight:600; margin-top:7px;}
.plan-feat .plan-annual{color:#a5a2ff;}
.plan-div{height:1px; background:var(--line); margin:22px 0;}
.plan-feat .plan-div{background:#ffffff14;}
.plan-inherit{font-size:12px; font-weight:700; color:var(--indigo-deep); margin-bottom:12px;}
.plan-feat .plan-inherit{color:#a5a2ff;}
.plan-lines{list-style:none; padding:0; margin:0 0 24px; display:flex; flex-direction:column; gap:12px; flex:1;}
.plan-lines li{display:flex; align-items:flex-start; gap:10px; font-size:13.5px; color:var(--ink-soft); line-height:1.4;}
.plan-feat .plan-lines li{color:#cfceea;}
.tick{margin-top:1px; flex:none; width:17px;height:17px;border-radius:50%; display:grid; place-items:center; background:#e8eaf5; color:var(--indigo-deep);}
.plan-feat .tick{background:var(--indigo); color:#fff;}
.plan-cta{width:100%; justify-content:center;}
.plan-foot{display:inline-flex; align-items:center; justify-content:center; gap:6px; width:100%; margin-top:12px; font-size:11px; color:var(--mute);}
.plan-feat .plan-foot{color:#a5a2c8;}
.price-note{display:flex; align-items:center; justify-content:center; gap:8px; margin-top:40px; font-size:13px; color:var(--mute); text-align:center;}
.price-note svg{color:var(--gold); flex:none;}
@media(max-width:840px){.plans{grid-template-columns:1fr; max-width:400px; margin-left:auto; margin-right:auto;}}

/* testimonials */
.testi-wrap{position:relative; z-index:2; background:#ECECF6; padding:84px 0; margin-top:10px;}
.testi-inner{max-width:1180px; margin:0 auto; padding:0 24px;}
.testi-grid{display:grid; grid-template-columns:repeat(3,1fr); gap:18px; margin-top:40px; align-items:start;}
.testi{background:#fff; border:1px solid var(--line); border-radius:20px; padding:24px; display:flex; flex-direction:column;
  box-shadow:0 20px 44px -30px #1e1b4e3a; transition:transform .25s, box-shadow .25s;}
.testi:hover{transform:translateY(-4px); box-shadow:0 28px 54px -28px #1e1b4e4a;}
.testi-stars{display:flex; gap:2px; margin-bottom:13px; color:var(--gold);}
.testi-stars svg{fill:var(--gold);}
.testi blockquote{font-size:15.5px; line-height:1.6; color:var(--ink); margin:0; flex:1; font-weight:500;}
.testi figcaption{display:flex; align-items:center; gap:11px; margin-top:18px; padding-top:16px; border-top:1px solid var(--line);}
.testi-av{width:38px;height:38px;border-radius:50%; display:grid; place-items:center; color:#fff; font-weight:700; font-family:var(--display); font-size:15px; flex:none;}
.testi-who{display:flex; flex-direction:column; min-width:0;}
.testi-who b{font-size:13.5px;}
.testi-who small{font-size:12px; color:var(--mute);}
@media(max-width:840px){.testi-grid{grid-template-columns:1fr; max-width:440px; margin-left:auto; margin-right:auto;}}

/* faq */
.faq-wrap{position:relative; z-index:2; max-width:760px; margin:0 auto; padding:88px 24px 92px;}
.faq-list{margin-top:38px; display:flex; flex-direction:column; gap:12px;}
.faq{background:var(--paper); border:1px solid var(--line); border-radius:16px; overflow:hidden; transition:border-color .2s, box-shadow .25s;}
.faq-open{border-color:#cfd0ee; box-shadow:0 18px 40px -28px #1e1b4e40;}
.faq-q{width:100%; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 20px;
  background:none; border:none; cursor:pointer; text-align:left; font-size:15.5px; font-weight:700; color:var(--ink); font-family:var(--display);}
.faq-sign{font-size:24px; color:var(--indigo); line-height:1; flex:none; font-family:var(--body); font-weight:400;}
.faq-a-wrap{overflow:hidden;}
.faq-a{padding:0 20px 20px; font-size:14.5px; line-height:1.62; color:var(--ink-soft); margin:0;}
.faq-help{text-align:center; margin-top:30px; font-size:14px; color:var(--mute);}
.faq-help a{color:var(--indigo); font-weight:600;}
`
