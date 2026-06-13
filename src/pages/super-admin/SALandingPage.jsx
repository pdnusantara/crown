import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  // ikon UI editor
  Globe, Edit3, Trash2, Plus, Save, HelpCircle, Eye, EyeOff, ExternalLink,
  LayoutTemplate, Layers, Search, Upload, Image as ImageIcon, LayoutGrid,
  // ikon yang juga dipakai untuk lookup dinamis (registry `Lucide` di bawah)
  ArrowRight, ArrowUpRight, BarChart3, Building2, Calendar, CalendarClock,
  CalendarDays, Check, ChevronDown, Circle, Code2, DatabaseBackup, Fingerprint,
  Flame, Gem, Gift, LayoutDashboard, ListOrdered, Lock, Mail, MapPin,
  MessageCircle, MessageSquare, Palette, Percent, Phone, Play, Receipt, Scissors,
  ShieldCheck, Smartphone, Sparkles, Star, TicketPercent, TrendingUp, Users, Wallet,
} from 'lucide-react'
import LandingLayoutBuilder from './LandingLayoutBuilder.jsx'
import {
  useLanding, useUpdateHero,
  useTestimonials, useCreateTestimonial, useUpdateTestimonial, useDeleteTestimonial,
  useFAQs, useCreateFAQ, useUpdateFAQ, useDeleteFAQ,
} from '../../hooks/useLanding.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import api from '../../lib/api.js'

// Registry ikon untuk lookup dinamis (item.icon disimpan sebagai string di
// config landing). Named import di atas → Rollup tree-shake, jadi seluruh
// lucide-react (~824KB) tak ikut ter-bundle ke chunk editor ini. Ikon tak
// dikenal jatuh ke fallback (Sparkles).
const Lucide = {
  ArrowRight, ArrowUpRight, BarChart3, Building2, Calendar, CalendarClock,
  CalendarDays, Check, ChevronDown, Circle, Code2, DatabaseBackup, Fingerprint,
  Flame, Gem, Gift, LayoutDashboard, ListOrdered, Lock, Mail, MapPin,
  MessageCircle, MessageSquare, Palette, Percent, Phone, Play, Receipt, Scissors,
  ShieldCheck, Smartphone, Sparkles, Star, TicketPercent, TrendingUp, Users, Wallet,
}

const TABS = [
  { id: 'layout',       label: 'Tata Letak',       icon: Layers },
  { id: 'hero',         label: 'Hero & Branding',  icon: Globe },
  { id: 'content',      label: 'Section & Footer', icon: LayoutTemplate },
  { id: 'testimonials', label: 'Testimoni',        icon: MessageSquare },
  { id: 'faqs',         label: 'FAQ',              icon: HelpCircle },
  { id: 'tracking',     label: 'SEO & Iklan',      icon: Search },
]

export default function SALandingPage() {
  const [tab, setTab] = useState('layout')
  const [layoutDirty, setLayoutDirty] = useState(false)

  // Pindah tab — kalau builder Tata Letak punya perubahan belum disimpan,
  // konfirmasi dulu supaya tidak hilang diam-diam.
  const changeTab = (id) => {
    if (id === tab) return
    if (tab === 'layout' && layoutDirty &&
        !window.confirm('Perubahan tata letak belum disimpan dan akan hilang. Tetap pindah?')) {
      return
    }
    setTab(id)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">Landing Page</h1>
          <p className="text-muted text-sm mt-1">Konten yang tampil di sembapos.com sebelum login.</p>
        </div>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-card border border-dark-border text-sm hover:border-brand/40 transition-colors"
        >
          <ExternalLink size={13} /> Lihat halaman
        </a>
      </div>

      <div className="flex gap-1 bg-dark-card border border-dark-border rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => changeTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-2 ${tab === t.id ? 'bg-brand text-dark' : 'text-muted hover:text-off-white'}`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'layout' && <LandingLayoutBuilder onEditCore={changeTab} onDirtyChange={setLayoutDirty} />}
      {tab === 'hero' && <HeroEditor />}
      {tab === 'content' && <ContentEditor />}
      {tab === 'testimonials' && <TestimonialsEditor />}
      {tab === 'faqs' && <FAQEditor />}
      {tab === 'tracking' && (
        <div className="space-y-6">
          <SeoEditor />
          <TrackingEditor />
        </div>
      )}
    </div>
  )
}

// ── SEO editor ───────────────────────────────────────────────────────────
// Mengatur judul, deskripsi, kata kunci, & gambar share (Open Graph) landing
// page. Disimpan lewat PATCH /landing/hero; LandingPage menyuntik meta tag,
// Open Graph, Twitter Card, canonical, & JSON-LD secara dinamis.
function SeoEditor() {
  const toast = useToast()
  const { data, isLoading } = useLanding()
  const updateHero = useUpdateHero()

  const [form, setForm] = useState(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (data?.hero && !form) {
      setForm({
        seoTitle:       data.hero.seoTitle       || '',
        seoDescription: data.hero.seoDescription || '',
        seoKeywords:    data.hero.seoKeywords    || '',
        seoOgImage:     data.hero.seoOgImage     || '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  if (isLoading || !form) return <div className="h-64 bg-dark-card rounded-2xl animate-pulse" />

  const titleLen = form.seoTitle.length
  const descLen  = form.seoDescription.length

  async function handleSave() {
    try {
      await updateHero.mutateAsync({
        seoTitle:       form.seoTitle.trim(),
        seoDescription: form.seoDescription.trim(),
        seoKeywords:    form.seoKeywords.trim(),
        seoOgImage:     form.seoOgImage.trim(),
      })
      toast.success('Pengaturan SEO tersimpan')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan')
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      // WAJIB multipart — default instance pakai application/json yg bikin axios
      // v1 merusak FormData (jadi [object Object]) → upload gagal.
      const res = await api.post('/landing/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 })
      setForm(f => ({ ...f, seoOgImage: res.data?.data?.url || '' }))
      toast.success('Gambar diunggah — jangan lupa simpan')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal mengunggah gambar')
    } finally {
      setUploading(false)
    }
  }

  const previewTitle = form.seoTitle.trim() || 'SembaPOS — Sistem Manajemen Barbershop Modern'
  const previewDesc  = form.seoDescription.trim()
    || 'Kasir, antrian, booking online, multi-cabang, dan laporan pintar — semua dalam satu aplikasi untuk barbershop.'
  const ogSrc = form.seoOgImage.trim() || '/og-image.svg'

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader><h3 className="font-semibold text-off-white">SEO Landing Page</h3></CardHeader>
        <CardBody className="space-y-4">
          <div>
            <Input
              label="Judul halaman (title tag)"
              placeholder="SembaPOS — Sistem Manajemen Barbershop Modern"
              value={form.seoTitle}
              onChange={e => setForm(f => ({ ...f, seoTitle: e.target.value }))}
            />
            <p className={`text-[11px] mt-1 ${titleLen > 60 ? 'text-amber-400' : 'text-muted'}`}>
              {titleLen}/60 karakter ideal{titleLen > 60 ? ' — bisa terpotong di hasil pencarian' : ''}
            </p>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1.5">Deskripsi (meta description)</label>
            <textarea
              rows={3}
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/60"
              placeholder="Ringkasan menarik 1–2 kalimat yang muncul di hasil pencarian Google."
              value={form.seoDescription}
              onChange={e => setForm(f => ({ ...f, seoDescription: e.target.value }))}
            />
            <p className={`text-[11px] mt-1 ${descLen > 160 ? 'text-amber-400' : 'text-muted'}`}>
              {descLen}/160 karakter ideal{descLen > 160 ? ' — bisa terpotong di hasil pencarian' : ''}
            </p>
          </div>
          <Input
            label="Kata kunci (pisahkan dengan koma)"
            placeholder="aplikasi barbershop, POS barbershop, kasir barbershop"
            value={form.seoKeywords}
            onChange={e => setForm(f => ({ ...f, seoKeywords: e.target.value }))}
          />

          <div>
            <label className="text-xs text-muted block mb-1.5">Gambar share (Open Graph — 1200×630 px)</label>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-sm cursor-pointer hover:border-brand/40 transition-colors">
                <Upload size={13} /> {uploading ? 'Mengunggah…' : 'Unggah gambar'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
              {form.seoOgImage && (
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, seoOgImage: '' }))}
                  className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  title="Hapus gambar"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted mt-1.5">
              Disarankan format JPG/PNG agar tampil di semua platform sosial. Kosongkan untuk memakai gambar bawaan.
            </p>
          </div>

          <Button onClick={handleSave} loading={updateHero.isPending} icon={Save} fullWidth>
            Simpan Pengaturan SEO
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-semibold text-off-white">Pratinjau</h3></CardHeader>
        <CardBody className="space-y-5">
          <div>
            <p className="text-xs text-muted mb-2">Tampil di hasil pencarian Google</p>
            <div className="p-3 rounded-xl bg-white">
              <p className="text-[#1a0dab] text-base leading-snug truncate">{previewTitle}</p>
              <p className="text-[#006621] text-xs mt-0.5">https://sembapos.com</p>
              <p className="text-[#4d5156] text-[13px] mt-1 line-clamp-2">{previewDesc}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted mb-2">Tampil saat dibagikan (Open Graph)</p>
            <div className="rounded-xl overflow-hidden border border-dark-border">
              <div className="aspect-[1200/630] bg-dark-card overflow-hidden">
                <img src={ogSrc} alt="Pratinjau Open Graph" className="w-full h-full object-cover" />
              </div>
              <div className="p-3 bg-dark-surface">
                <p className="text-[11px] text-muted uppercase">sembapos.com</p>
                <p className="text-sm font-semibold text-off-white truncate mt-0.5">{previewTitle}</p>
                <p className="text-xs text-muted line-clamp-2 mt-0.5">{previewDesc}</p>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted leading-relaxed">
            Halaman juga otomatis menyuntik canonical URL & data terstruktur
            JSON-LD (Organization + SoftwareApplication, lengkap dengan rating
            dari testimoni) untuk hasil pencarian yang lebih kaya.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

// ── Pelacakan / Meta Pixel editor ────────────────────────────────────────
// Mengatur Meta (Facebook) Pixel ID. Disimpan lewat PATCH /landing/hero yang
// sama; landing page & halaman /register menyuntik pixel saat nilainya ada.
function TrackingEditor() {
  const toast = useToast()
  const { data, isLoading } = useLanding()
  const updateHero = useUpdateHero()

  const [pixelId, setPixelId] = useState(null)

  useEffect(() => {
    if (data?.hero && pixelId === null) {
      setPixelId(data.hero.metaPixelId || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  if (isLoading || pixelId === null) return <div className="h-64 bg-dark-card rounded-2xl animate-pulse" />

  const savedId = data?.hero?.metaPixelId || ''
  const cleaned = pixelId.replace(/\D/g, '')
  const formatOk = cleaned.length === 0 || (cleaned.length >= 15 && cleaned.length <= 16)
  const active = savedId.length > 0

  async function handleSave() {
    if (!formatOk) {
      toast.error('Pixel ID Meta umumnya 15–16 digit angka')
      return
    }
    try {
      await updateHero.mutateAsync({ metaPixelId: cleaned })
      toast.success(cleaned ? 'Meta Pixel tersimpan & aktif' : 'Meta Pixel dinonaktifkan')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan')
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-off-white">Meta Pixel (Facebook & Instagram Ads)</h3>
            <Badge variant={active ? 'success' : 'muted'} className="text-[10px]">
              {active ? 'Aktif' : 'Nonaktif'}
            </Badge>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-muted">
            Pasang Meta Pixel untuk melacak pengunjung & konversi dari iklan
            Facebook/Instagram. Kosongkan kolom lalu simpan untuk menonaktifkan.
          </p>
          <Input
            label="Meta Pixel ID"
            placeholder="Contoh: 1234567890123456"
            value={pixelId}
            onChange={e => setPixelId(e.target.value.replace(/\D/g, '').slice(0, 20))}
            inputMode="numeric"
            hint={
              !formatOk
                ? 'Pixel ID Meta umumnya 15–16 digit angka'
                : 'Ambil dari Meta Events Manager → Data Sources → Pixel Anda'
            }
          />
          <a
            href="https://www.facebook.com/events_manager2"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline"
          >
            <ExternalLink size={13} /> Buka Meta Events Manager
          </a>
          <Button onClick={handleSave} loading={updateHero.isPending} icon={Save} fullWidth>
            Simpan Pengaturan Pixel
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-semibold text-off-white">Tes & Verifikasi Pixel</h3></CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-muted">
            Pixel <b className="text-off-white">tidak terbaca</b> di Pixel Helper? Hampir selalu karena cara mengetesnya, bukan pixel-nya. Penyebab paling sering: <b className="text-off-white">Anda sedang login</b> — membuka sembapos.com saat login otomatis mengalihkan ke dashboard, jadi landing (& pixel) tak pernah tampil. Ikuti urutan ini:
          </p>
          <ol className="space-y-2 text-xs text-muted list-decimal pl-4 leading-relaxed">
            <li>Tes lewat tombol di bawah (memakai <code className="text-off-white">?view=landing</code> agar landing tetap tampil walau Anda login) — atau buka <code className="text-off-white">sembapos.com</code> di jendela <b className="text-off-white">incognito</b> (cara pengunjung iklan melihatnya).</li>
            <li><b className="text-off-white">Jangan</b> tes di dalam preview editor (pixel sengaja dimatikan di preview agar data iklan tak terkotori).</li>
            <li>Hard-reload: <kbd className="px-1 bg-dark-card rounded">Ctrl/Cmd + Shift + R</kbd> — memastikan bukan versi lama dari cache PWA.</li>
            <li>Matikan dulu ad-blocker / privacy blocker (uBlock, Brave Shields, dll.) — mereka memblokir <code className="text-off-white">connect.facebook.net</code>.</li>
            <li>Pixel Helper akan menampilkan ID <code className="text-off-white">{savedId || '—'}</code> dengan event <code className="text-off-white">PageView</code>.</li>
          </ol>
          {active ? (
            <Button
              variant="secondary"
              icon={ExternalLink}
              fullWidth
              onClick={() => window.open(`${window.location.origin}/?view=landing&utm_source=pixel_test`, '_blank', 'noopener')}
            >
              Buka landing live untuk tes
            </Button>
          ) : (
            <p className="text-xs text-amber-300/90">Simpan Pixel ID dulu sebelum mengetes.</p>
          )}
          <a
            href="https://www.facebook.com/events_manager2/list/pixel/test_events"
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline"
          >
            <ExternalLink size={12} /> Buka "Test Events" di Meta Events Manager
          </a>
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><h3 className="font-semibold text-off-white">Event yang Dilacak</h3></CardHeader>
        <CardBody className="grid sm:grid-cols-3 gap-3">
          {[
            { ev: 'PageView',             desc: 'Setiap kunjungan landing page & halaman pendaftaran.' },
            { ev: 'Lead',                 desc: 'Pengunjung menekan tombol ajakan daftar di landing page.' },
            { ev: 'ViewContent',          desc: 'Pengunjung melihat bagian harga (minat tinggi).' },
            { ev: 'ScrollDepth',          desc: 'Kedalaman scroll 25/50/75/100% (event kustom).' },
            { ev: 'CompleteRegistration', desc: 'Pendaftaran tenant berhasil — konversi utama untuk iklan.' },
          ].map(item => (
            <div key={item.ev} className="p-3 bg-dark-surface rounded-xl border border-dark-border">
              <code className="text-xs font-semibold text-brand">{item.ev}</code>
              <p className="text-xs text-muted mt-1">{item.desc}</p>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  )
}

// ── Image upload field ───────────────────────────────────────────────────
// Field unggah gambar pakai-ulang: thumbnail + tombol unggah ke /landing/upload
// + tombol hapus. `onChange` menerima URL hasil unggah (atau '' saat dihapus).
function ImageUploadField({ label, hint, value, accept = 'image/png,image/jpeg,image/webp', onChange }) {
  const toast = useToast()
  const [uploading, setUploading] = useState(false)

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      // WAJIB multipart — default instance pakai application/json yg bikin axios
      // v1 merusak FormData (jadi [object Object]) → upload gagal.
      const res = await api.post('/landing/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 })
      onChange(res.data?.data?.url || '')
      toast.success('Gambar diunggah — jangan lupa simpan')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal mengunggah gambar')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label className="text-xs text-muted block mb-1.5">{label}</label>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg bg-dark-surface border border-dark-border flex items-center justify-center overflow-hidden flex-shrink-0">
          {value
            ? <img src={value} alt="" className="w-full h-full object-contain" />
            : <ImageIcon size={18} className="text-muted" />}
        </div>
        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-sm cursor-pointer hover:border-brand/40 transition-colors">
          <Upload size={13} /> {uploading ? 'Mengunggah…' : 'Unggah'}
          <input type="file" accept={accept} className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
            title="Hapus gambar"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {hint && <p className="text-[11px] text-muted mt-1.5">{hint}</p>}
    </div>
  )
}

// ── Video upload field ────────────────────────────────────────────────────
// Unggah video fitur (rekaman layar) ke /landing/upload-video. Bila diisi,
// landing menampilkan video ini menggantikan demo animasi.
function VideoUploadField({ label, hint, value, onChange }) {
  const toast = useToast()
  const [uploading, setUploading] = useState(false)
  // Browser hanya bisa decode MP4(H.264)/WebM. .MOV HEVC dari iPhone ter-upload
  // tapi gagal diputar → tandai supaya bisa kasih panduan, bukan diam "gagal memuat".
  const [playError, setPlayError] = useState(false)

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('video', file)
      // Video besar (≤30MB) di koneksi lambat bisa lama → 5 menit, selaras dgn
      // nginx client_body_timeout/proxy_*_timeout 300s di location /api/.
      const res = await api.post('/landing/upload-video', fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000 })
      setPlayError(false)
      onChange(res.data?.data?.url || '')
      toast.success('Video diunggah & dikonversi ke MP4 — jangan lupa simpan')
    } catch (err) {
      const msg = err?.code === 'ECONNABORTED'
        ? 'Unggah video kelamaan (timeout). Coba file lebih kecil atau koneksi lebih cepat.'
        : err?.response?.data?.error || 'Gagal mengunggah video'
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label className="text-xs text-muted block mb-1.5">{label}</label>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-lg bg-dark-surface border border-dark-border flex items-center justify-center overflow-hidden flex-shrink-0">
          {value
            ? <video src={value} muted loop autoPlay playsInline className="w-full h-full object-cover"
                onError={() => setPlayError(true)} onLoadedData={() => setPlayError(false)} />
            : <Upload size={18} className="text-muted" />}
        </div>
        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-sm cursor-pointer hover:border-brand/40 transition-colors">
          <Upload size={13} /> {uploading ? 'Mengunggah…' : 'Unggah video'}
          <input type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
            title="Hapus video"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {playError && value && (
        <p className="text-[11px] text-amber-400 mt-1.5">
          ⚠️ Video terunggah, tapi browser tak bisa memutarnya — kemungkinan format <b>.MOV/HEVC</b> (rekaman layar iPhone). Konversi ke <b>MP4 (H.264)</b> agar tampil di landing.
        </p>
      )}
      {hint && <p className="text-[11px] text-muted mt-1.5">{hint}</p>}
    </div>
  )
}

// ── Katalog fitur on-brand ───────────────────────────────────────────────
// Diturunkan langsung dari Brand Guidelines SembaPOS (20 fitur berflag + sorotan
// fitur selalu-aktif). Tujuannya: super-admin bisa menyusun "Fitur Unggulan"
// landing yang konsisten brand tanpa mengetik ulang ikon, judul, & deskripsi.
// Voice mengikuti pedoman: santai, sapaan "kamu", manfaat dulu.
const FEATURE_PRESETS = [
  { category: 'Operasional harian', items: [
    { icon: 'Scissors',      title: 'Kasir khusus barbershop', desc: 'Catat layanan, produk, sampai komisi barber sekali tap. Cepat, antrean nggak numpuk.' },
    { icon: 'CalendarClock', title: 'Booking online',          desc: 'Pelanggan booking sendiri lewat link toko. Giliran rapi, nggak ada rebutan.' },
    { icon: 'ListOrdered',   title: 'Antrian realtime',         desc: 'Papan antrian kasir & barber yang update otomatis. Semua tahu siapa giliran berikutnya.' },
    { icon: 'Gift',          title: 'Loyalty & poin',           desc: 'Poin dan reward bikin pelanggan balik lagi, bukan sekali datang terus hilang.' },
    { icon: 'TicketPercent', title: 'Voucher & promo',          desc: 'Bikin kode diskon yang terlacak — pas buat grand opening atau hari yang lagi sepi.' },
  ]},
  { category: 'Keputusan berbasis data', items: [
    { icon: 'BarChart3',     title: 'Laporan yang ngerti sendiri', desc: 'Omzet harian, layanan terlaris, performa barber — kebaca otomatis tanpa Excel.' },
    { icon: 'Flame',         title: 'Heatmap jam sibuk',           desc: 'Tahu jam tersibuk toko, biar jumlah barber pas — nggak kebanyakan atau kekurangan.' },
    { icon: 'Gem',           title: 'Pelanggan paling bernilai',   desc: 'Kenali pelanggan yang paling cuan, lalu rawat mereka biar makin betah.' },
    { icon: 'MapPin',        title: 'Laporan wilayah',             desc: 'Lihat pelanggan datang dari kecamatan mana, biar iklan lokal lebih tepat sasaran.' },
  ]},
  { category: 'Kelola tim & cabang', items: [
    { icon: 'CalendarDays',  title: 'Jadwal shift',              desc: 'Atur kalender shift barber mingguan tanpa grup WA yang berantakan.' },
    { icon: 'Building2',     title: 'Banyak cabang, satu layar', desc: 'Pantau semua cabang dari satu dashboard. Kelihatan mana yang paling cuan.' },
    { icon: 'Wallet',        title: 'Catat pengeluaran',         desc: 'Hitung laba bersih, bukan cuma omzet. Tahu beneran untung atau enggak.' },
    { icon: 'Fingerprint',   title: 'Absensi digital',           desc: 'Absen staf via GPS plus laporan kehadiran. Pantau yang telat tanpa nungguin di toko.' },
  ]},
  { category: 'Pengalaman & WhatsApp', items: [
    { icon: 'MessageCircle', title: 'Struk & pengingat WhatsApp', desc: 'Konfirmasi booking dan struk langsung mampir ke WhatsApp pelanggan.' },
    { icon: 'Star',          title: 'Rating barber',              desc: 'Pelanggan kasih bintang setelah potong. Tahu barber terbaik buat bahan promosi.' },
    { icon: 'MessageSquare', title: 'Laporan pesan WhatsApp',     desc: 'Pantau status pesan terkirim, sampai, atau gagal. Pastikan notifikasi beneran nyampe.' },
    { icon: 'Smartphone',    title: 'Pasang di HP (PWA)',         desc: 'Buka dari home screen seperti aplikasi biasa, tanpa lewat Play Store.' },
  ]},
  { category: 'Skala & integrasi', items: [
    { icon: 'Code2',         title: 'Akses API',        desc: 'Integrasi dengan sistem lain buat kebutuhan jaringan besar atau custom.' },
    { icon: 'Wallet',        title: 'Komisi & Payroll', desc: 'Hitung komisi & gaji barber per periode otomatis, cetak slip & export.' },
    { icon: 'DatabaseBackup',title: 'Backup & restore', desc: 'Export dan import data toko. Aman dan tenang soal data toko kamu.' },
  ]},
  { category: 'Selalu aktif (semua paket)', items: [
    { icon: 'LayoutDashboard', title: 'Dashboard pemilik',      desc: 'Ringkasan omzet, antrian, dan insight — dipantau dari HP, dari mana aja.' },
    { icon: 'Users',           title: 'Database pelanggan',     desc: 'Profil, riwayat kunjungan, poin, dan segmen pelanggan (VIP, baru, berisiko).' },
    { icon: 'ShieldCheck',     title: 'Aman & sesuai peran',    desc: 'Owner, kasir, barber — tiap orang punya akses sendiri. Data toko tetap aman.' },
    { icon: 'Percent',         title: 'Komisi barber otomatis', desc: 'Komisi tiap barber dihitung otomatis dari transaksi. Stop hitung manual tiap bulan.' },
  ]},
]

// Modal pemilih: super-admin centang fitur dari katalog brand lalu tambahkan
// sekaligus ke daftar "Fitur Unggulan". Fitur yang judulnya sudah ada dinonaktifkan.
function FeaturePresetModal({ open, onClose, existingTitles, onAdd }) {
  const [picked, setPicked] = useState([])
  useEffect(() => { if (open) setPicked([]) }, [open])

  const toggle = (item) => setPicked(p =>
    p.some(x => x.title === item.title) ? p.filter(x => x.title !== item.title) : [...p, item]
  )

  return (
    <Modal isOpen={open} onClose={onClose} title="Katalog Fitur SembaPOS" size="xl">
      <p className="text-xs text-muted mb-4">
        Pilih fitur dari Brand Guidelines untuk ditambahkan ke daftar "Fitur Unggulan". Ikon, judul, & deskripsi sudah on-brand — bisa kamu sunting lagi setelah ditambahkan.
      </p>
      <div className="space-y-5 max-h-[58vh] overflow-y-auto pr-1">
        {FEATURE_PRESETS.map(group => (
          <div key={group.category}>
            <p className="text-[11px] font-bold text-brand uppercase tracking-[0.12em] mb-2">{group.category}</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {group.items.map(item => {
                const added = existingTitles.includes(item.title.trim().toLowerCase())
                const sel = picked.some(x => x.title === item.title)
                const Icon = Lucide[item.icon] || Lucide.Sparkles
                return (
                  <button
                    key={item.title}
                    type="button"
                    disabled={added}
                    onClick={() => toggle(item)}
                    className={`text-left p-3 rounded-xl border flex gap-3 transition-colors ${
                      added
                        ? 'opacity-40 cursor-not-allowed border-dark-border bg-dark-surface'
                        : sel
                          ? 'border-brand bg-brand/10'
                          : 'border-dark-border bg-dark-surface hover:border-brand/40'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-brand/15 border border-brand/20 flex items-center justify-center flex-shrink-0">
                      <Icon size={17} className="text-brand" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-off-white flex items-center gap-1.5">
                        {item.title}
                        {added && <span className="text-[10px] text-muted">(sudah ada)</span>}
                        {sel && !added && <Check size={13} className="text-brand flex-shrink-0" />}
                      </p>
                      <p className="text-xs text-muted line-clamp-2 mt-0.5">{item.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-4 mt-3 border-t border-dark-border">
        <Button variant="outline" fullWidth onClick={onClose}>Batal</Button>
        <Button fullWidth icon={Plus} disabled={picked.length === 0} onClick={() => { onAdd(picked); onClose() }}>
          Tambah{picked.length > 0 ? ` ${picked.length} fitur` : ''}
        </Button>
      </div>
    </Modal>
  )
}

// ── Hero / branding editor ───────────────────────────────────────────────
function HeroEditor() {
  const toast = useToast()
  const { data, isLoading } = useLanding()
  const updateHero = useUpdateHero()

  const [form, setForm] = useState(null)
  const [features, setFeatures] = useState([])
  const [trustItems, setTrustItems] = useState([])
  const [showPresets, setShowPresets] = useState(false)

  useEffect(() => {
    if (data?.hero && !form) {
      setForm({
        heroTitle:    data.hero.heroTitle    || '',
        heroSubtitle: data.hero.heroSubtitle || '',
        heroCtaLabel: data.hero.heroCtaLabel || '',
        brandTagline: data.hero.brandTagline || '',
        whatsappCta:  data.hero.whatsappCta  || '',
        showStats:    data.hero.showStats !== false,
        siteName:     data.hero.siteName     || '',
        siteLogo:     data.hero.siteLogo     || '',
        siteFavicon:  data.hero.siteFavicon  || '',
      })
      // _k = kunci stabil per-fitur (bukan index) supaya kartu tak remount saat
      // tambah/hapus → cegah "lompat" & reset state field upload. Dibuang saat simpan.
      setFeatures((Array.isArray(data.hero.features) ? data.hero.features : []).map(f => ({ ...f, _k: crypto.randomUUID() })))
      setTrustItems(Array.isArray(data.hero.trustItems) ? data.hero.trustItems : [])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  if (isLoading || !form) return <div className="h-64 bg-dark-card rounded-2xl animate-pulse" />

  async function handleSave() {
    try {
      await updateHero.mutateAsync({
        ...form,
        features: features.map(({ _k, ...f }) => f), // buang kunci internal
        trustItems: trustItems.map(t => t.trim()).filter(Boolean),
      })
      toast.success('Konten landing tersimpan')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan')
    }
  }

  function updateFeature(i, key, value) {
    setFeatures(arr => arr.map((f, idx) => idx === i ? { ...f, [key]: value } : f))
  }
  function addFeature() {
    setFeatures(arr => [...arr, { icon: 'Sparkles', title: '', desc: '', image: '', _k: crypto.randomUUID() }])
  }
  function removeFeature(i) {
    setFeatures(arr => arr.filter((_, idx) => idx !== i))
  }
  // Tambahkan fitur dari katalog brand, lewati yang judulnya sudah ada.
  function addPresets(items) {
    setFeatures(arr => {
      const have = new Set(arr.map(f => (f.title || '').trim().toLowerCase()))
      const fresh = items
        .filter(it => !have.has(it.title.trim().toLowerCase()))
        .map(it => ({ icon: it.icon, title: it.title, desc: it.desc, _k: crypto.randomUUID() }))
      return [...arr, ...fresh]
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-semibold text-off-white">Nama, Logo & Favicon</h3></CardHeader>
        <CardBody className="grid sm:grid-cols-2 gap-5">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-muted mb-1.5">Nama Situs (brand)</label>
            <input
              type="text"
              value={form.siteName}
              onChange={e => setForm(f => ({ ...f, siteName: e.target.value }))}
              maxLength={60}
              placeholder="SembaPOS"
              className="w-full appearance-none rounded-lg border border-dark-border bg-dark-surface px-3 py-2 text-sm text-off-white placeholder-muted focus:outline-none focus:border-brand/50"
            />
            <p className="text-[11px] text-muted mt-1">
              Teks brand di pojok kiri header, footer, judul tab browser, & SEO. Dipakai saat logo gambar kosong. Kosongkan untuk default "SembaPOS".
            </p>
          </div>
          <ImageUploadField
            label="Logo (header & footer landing)"
            value={form.siteLogo}
            accept="image/png,image/jpeg,image/webp"
            onChange={url => setForm(f => ({ ...f, siteLogo: url }))}
            hint="PNG transparan disarankan. Tampil di header (latar terang) & footer (latar gelap) — pilih warna yang kontras di keduanya. Kosongkan untuk logo bawaan."
          />
          <ImageUploadField
            label="Favicon (ikon tab browser)"
            value={form.siteFavicon}
            accept="image/png"
            onChange={url => setForm(f => ({ ...f, siteFavicon: url }))}
            hint="PNG persegi, disarankan 48×48 px atau lebih. Kosongkan untuk ikon bawaan."
          />
        </CardBody>
        <CardBody className="pt-0">
          <Button onClick={handleSave} loading={updateHero.isPending} icon={Save} variant="secondary">
            Simpan Logo & Favicon
          </Button>
        </CardBody>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-off-white">Hero & Branding</h3>
        </CardHeader>
        <CardBody className="space-y-4">
          <Input
            label="Tagline kecil (di atas judul)"
            placeholder="Dipercaya barbershop di seluruh Indonesia"
            value={form.brandTagline}
            onChange={e => setForm(f => ({ ...f, brandTagline: e.target.value }))}
          />
          <div>
            <label className="text-xs text-muted block mb-1.5">Judul utama (2 kata terakhir akan diberi aksen warna brand)</label>
            <textarea
              rows={2}
              className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/60 transition-colors"
              value={form.heroTitle}
              onChange={e => setForm(f => ({ ...f, heroTitle: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1.5">Subjudul</label>
            <textarea
              rows={3}
              className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/60 transition-colors"
              value={form.heroSubtitle}
              onChange={e => setForm(f => ({ ...f, heroSubtitle: e.target.value }))}
            />
          </div>
          <Input
            label="Label tombol utama"
            placeholder="Mulai Uji Coba Gratis"
            value={form.heroCtaLabel}
            onChange={e => setForm(f => ({ ...f, heroCtaLabel: e.target.value }))}
          />
          <Input
            label="Nomor WhatsApp konsultasi (opsional)"
            placeholder="6281234567890 (tanpa +)"
            value={form.whatsappCta}
            onChange={e => setForm(f => ({ ...f, whatsappCta: e.target.value.replace(/\D/g, '') }))}
            hint="Kosongkan jika tidak ingin tampilkan tombol konsultasi"
          />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted">Poin kepercayaan (di bawah tombol hero)</label>
              {trustItems.length < 6 && (
                <button
                  type="button"
                  onClick={() => setTrustItems(arr => [...arr, ''])}
                  className="text-xs text-brand hover:underline inline-flex items-center gap-1"
                >
                  <Plus size={11} /> Tambah
                </button>
              )}
            </div>
            <div className="space-y-2">
              {trustItems.length === 0 && (
                <p className="text-xs text-muted">Belum ada poin. Mis. "Gratis 14 hari".</p>
              )}
              {trustItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="flex-1 bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-lg px-3 py-2 text-sm outline-none focus:border-brand/60"
                    placeholder="Gratis 14 hari"
                    value={item}
                    onChange={e => setTrustItems(arr => arr.map((v, idx) => idx === i ? e.target.value : v))}
                  />
                  <button
                    type="button"
                    onClick={() => setTrustItems(arr => arr.filter((_, idx) => idx !== i))}
                    className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-dark-surface border border-dark-border cursor-pointer">
            <input
              type="checkbox"
              checked={form.showStats}
              onChange={e => setForm(f => ({ ...f, showStats: e.target.checked }))}
              className="accent-brand"
            />
            <div className="text-sm">
              <p className="text-off-white font-medium">Tampilkan statistik real-time</p>
              <p className="text-xs text-muted">Jumlah tenant, cabang, transaksi, pelanggan dari DB.</p>
            </div>
          </label>

          <Button onClick={handleSave} loading={updateHero.isPending} icon={Save} fullWidth>
            Simpan Hero
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-off-white">Fitur Unggulan</h3>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" icon={LayoutGrid} onClick={() => setShowPresets(true)}>Dari Katalog</Button>
              <Button size="sm" variant="outline" icon={Plus} onClick={addFeature}>Kosong</Button>
            </div>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          {features.length === 0 && (
            <p className="text-sm text-muted text-center py-4">Belum ada fitur.</p>
          )}
          {features.map((f, i) => (
            <div key={f._k} className="p-3 bg-dark-surface rounded-xl border border-dark-border space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  label="Icon (Lucide)"
                  placeholder="Sparkles"
                  value={f.icon}
                  onChange={e => updateFeature(i, 'icon', e.target.value)}
                />
                <button onClick={() => removeFeature(i)} className="mt-5 p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
                  <Trash2 size={14} />
                </button>
              </div>
              <Input
                label="Judul"
                value={f.title}
                onChange={e => updateFeature(i, 'title', e.target.value)}
              />
              <div>
                <label className="text-xs text-muted block mb-1.5">Deskripsi</label>
                <textarea
                  rows={2}
                  className="w-full bg-dark-card border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-brand/60"
                  value={f.desc}
                  onChange={e => updateFeature(i, 'desc', e.target.value)}
                />
              </div>
              <ImageUploadField
                label="Gambar fitur (opsional)"
                value={f.image || ''}
                accept="image/png,image/jpeg,image/webp"
                onChange={url => updateFeature(i, 'image', url)}
                hint="Screenshot/foto fitur — tampil sebagai banner di atas kartu fitur di landing. Disarankan rasio ~16:10 (mis. 1200×750). Kosongkan untuk pakai ikon saja."
              />
              <VideoUploadField
                label="Video fitur (opsional)"
                value={f.video || ''}
                onChange={url => updateFeature(i, 'video', url)}
                hint="Rekaman layar fitur (MP4/WebM/MOV, maks 30 MB, rasio ~16:10). Server otomatis mengonversi & mengompres ke MP4 H.264 (termasuk .MOV iPhone) + membuang audio. Jalan otomatis (loop, tanpa suara). PRIORITAS: video > gambar > demo animasi."
              />
            </div>
          ))}
          <p className="text-xs text-muted">
            Pakai <span className="text-off-white">Dari Katalog</span> untuk menyusun cepat dari fitur on-brand, atau <span className="text-off-white">Kosong</span> untuk fitur custom. Nama icon dari <a className="text-brand hover:underline" href="https://lucide.dev/icons" target="_blank" rel="noopener noreferrer">lucide.dev</a> (case-sensitive). Contoh: Scissors, Building2, BarChart3.
          </p>
          <Button onClick={handleSave} loading={updateHero.isPending} icon={Save} fullWidth variant="secondary">
            Simpan Fitur
          </Button>
        </CardBody>
      </Card>
      </div>

      <FeaturePresetModal
        open={showPresets}
        onClose={() => setShowPresets(false)}
        existingTitles={features.map(f => (f.title || '').trim().toLowerCase())}
        onAdd={addPresets}
      />
    </div>
  )
}

// ── Testimonials editor ──────────────────────────────────────────────────
function TestimonialsEditor() {
  const toast = useToast()
  const { data: list = [], isLoading } = useTestimonials()
  const create = useCreateTestimonial()
  const update = useUpdateTestimonial()
  const remove = useDeleteTestimonial()

  const [editing, setEditing] = useState(null) // null | 'new' | item
  const [form, setForm] = useState({ name: '', role: '', businessName: '', message: '', rating: 5, photoUrl: '', displayOrder: 0, isActive: true })

  function openNew() { setForm({ name: '', role: '', businessName: '', message: '', rating: 5, photoUrl: '', displayOrder: list.length, isActive: true }); setEditing('new') }
  function openEdit(t) { setForm({ name: t.name, role: t.role || '', businessName: t.businessName || '', message: t.message, rating: t.rating || 5, photoUrl: t.photoUrl || '', displayOrder: t.displayOrder || 0, isActive: t.isActive }); setEditing(t) }

  async function handleSave() {
    try {
      const payload = {
        ...form,
        role: form.role || null,
        businessName: form.businessName || null,
        photoUrl: form.photoUrl || null,
      }
      if (editing === 'new') {
        await create.mutateAsync(payload)
        toast.success('Testimoni dibuat')
      } else {
        await update.mutateAsync({ id: editing.id, ...payload })
        toast.success('Testimoni diperbarui')
      }
      setEditing(null)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan')
    }
  }
  async function handleDelete(t) {
    if (!confirm(`Hapus testimoni dari ${t.name}?`)) return
    try {
      await remove.mutateAsync(t.id)
      toast.success('Testimoni dihapus')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menghapus')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button icon={Plus} onClick={openNew}>Tambah Testimoni</Button>
      </div>

      {isLoading ? (
        <div className="h-32 bg-dark-card rounded-2xl animate-pulse" />
      ) : list.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-muted">
          <MessageSquare size={32} className="mx-auto mb-3 opacity-30" />
          <p>Belum ada testimoni. Tambahkan untuk membangun trust di landing.</p>
        </CardBody></Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map(t => (
            <Card key={t.id} className={`p-4 ${!t.isActive ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-1 text-brand">
                  {Array.from({ length: t.rating || 5 }).map((_, i) => <Star key={i} size={12} fill="currentColor" />)}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(t)} className="p-1 rounded text-muted hover:text-off-white"><Edit3 size={13} /></button>
                  <button onClick={() => handleDelete(t)} className="p-1 rounded text-muted hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              </div>
              <p className="text-sm text-off-white/90 italic mb-3 line-clamp-3">"{t.message}"</p>
              <div className="text-xs text-muted">
                <p className="font-semibold text-off-white">{t.name}</p>
                {(t.role || t.businessName) && (
                  <p>{t.role}{t.role && t.businessName ? ' · ' : ''}{t.businessName}</p>
                )}
                <p className="mt-1 flex items-center gap-2">
                  <Badge variant={t.isActive ? 'success' : 'muted'} className="text-[10px]">{t.isActive ? 'Tampil' : 'Tersembunyi'}</Badge>
                  <span>Urutan: {t.displayOrder}</span>
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Tambah Testimoni' : 'Edit Testimoni'}>
        <div className="space-y-3">
          <Input label="Nama" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input label="Peran (opsional)" placeholder="Owner / Manager" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
          <Input label="Nama bisnis (opsional)" placeholder="Mahkota Barbershop" value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} />
          <div>
            <label className="text-xs text-muted block mb-1.5">Pesan</label>
            <textarea
              rows={4}
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-brand/60"
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Rating (1-5)" type="number" min="1" max="5" value={form.rating} onChange={e => setForm(f => ({ ...f, rating: Number(e.target.value) }))} />
            <Input label="Urutan" type="number" value={form.displayOrder} onChange={e => setForm(f => ({ ...f, displayOrder: Number(e.target.value) }))} />
          </div>
          <Input label="URL foto (opsional)" placeholder="https://..." value={form.photoUrl} onChange={e => setForm(f => ({ ...f, photoUrl: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="accent-brand" />
            <span>Tampilkan di landing</span>
          </label>
          <div className="flex gap-2">
            <Button variant="outline" fullWidth onClick={() => setEditing(null)}>Batal</Button>
            <Button fullWidth icon={Save} loading={create.isPending || update.isPending} onClick={handleSave}>Simpan</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── FAQ editor ───────────────────────────────────────────────────────────
function FAQEditor() {
  const toast = useToast()
  const { data: list = [], isLoading } = useFAQs()
  const create = useCreateFAQ()
  const update = useUpdateFAQ()
  const remove = useDeleteFAQ()

  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ question: '', answer: '', displayOrder: 0, isActive: true })

  function openNew() { setForm({ question: '', answer: '', displayOrder: list.length, isActive: true }); setEditing('new') }
  function openEdit(f) { setForm({ question: f.question, answer: f.answer, displayOrder: f.displayOrder || 0, isActive: f.isActive }); setEditing(f) }

  async function handleSave() {
    try {
      if (editing === 'new') await create.mutateAsync(form)
      else await update.mutateAsync({ id: editing.id, ...form })
      toast.success('FAQ tersimpan')
      setEditing(null)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal')
    }
  }
  async function handleDelete(f) {
    if (!confirm(`Hapus FAQ "${f.question.slice(0, 40)}…"?`)) return
    try {
      await remove.mutateAsync(f.id); toast.success('FAQ dihapus')
    } catch (err) { toast.error(err?.response?.data?.error || 'Gagal') }
  }
  async function toggleActive(f) {
    try { await update.mutateAsync({ id: f.id, isActive: !f.isActive }) }
    catch (err) { toast.error(err?.response?.data?.error || 'Gagal') }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button icon={Plus} onClick={openNew}>Tambah FAQ</Button>
      </div>

      {isLoading ? (
        <div className="h-32 bg-dark-card rounded-2xl animate-pulse" />
      ) : list.length === 0 ? (
        <Card><CardBody className="text-center py-12 text-muted">
          <HelpCircle size={32} className="mx-auto mb-3 opacity-30" />
          <p>Belum ada FAQ.</p>
        </CardBody></Card>
      ) : (
        <div className="space-y-2">
          {list.map(f => (
            <Card key={f.id} className={`p-4 ${!f.isActive ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-off-white">{f.question}</p>
                  <p className="text-sm text-muted mt-1 line-clamp-2 whitespace-pre-line">{f.answer}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant={f.isActive ? 'success' : 'muted'} className="text-[10px]">{f.isActive ? 'Tampil' : 'Tersembunyi'}</Badge>
                    <span className="text-xs text-muted">Urutan: {f.displayOrder}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => toggleActive(f)} className="p-1.5 rounded text-muted hover:text-off-white" title={f.isActive ? 'Sembunyikan' : 'Tampilkan'}>
                    {f.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button onClick={() => openEdit(f)} className="p-1.5 rounded text-muted hover:text-off-white"><Edit3 size={14} /></button>
                  <button onClick={() => handleDelete(f)} className="p-1.5 rounded text-muted hover:text-red-400"><Trash2 size={14} /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Tambah FAQ' : 'Edit FAQ'}>
        <div className="space-y-3">
          <Input label="Pertanyaan" value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} />
          <div>
            <label className="text-xs text-muted block mb-1.5">Jawaban</label>
            <textarea
              rows={5}
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-brand/60"
              value={form.answer}
              onChange={e => setForm(f => ({ ...f, answer: e.target.value }))}
            />
          </div>
          <Input label="Urutan tampil" type="number" value={form.displayOrder} onChange={e => setForm(f => ({ ...f, displayOrder: Number(e.target.value) }))} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="accent-brand" />
            <span>Tampilkan di landing</span>
          </label>
          <div className="flex gap-2">
            <Button variant="outline" fullWidth onClick={() => setEditing(null)}>Batal</Button>
            <Button fullWidth icon={Save} loading={create.isPending || update.isPending} onClick={handleSave}>Simpan</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Section & Footer editor ──────────────────────────────────────────────
// Mengatur bagian landing yang sebelumnya hardcoded: judul tiap section,
// langkah "Cara Mulai", CTA penutup, & teks footer. Semua disimpan lewat
// PATCH /landing/hero (partial) yang sama dengan editor Hero.
const SECTION_LABELS = {
  features:     'Section "Fitur"',
  steps:        'Section "Cara Mulai"',
  compare:      'Section "Sebelum vs Sesudah"',
  roi:          'Section "Kalkulator ROI"',
  pricing:      'Section "Harga"',
  testimonials: 'Section "Testimoni"',
  faq:          'Section "FAQ"',
}
const EMPTY_HEADING = { kicker: '', title: '', subtitle: '' }
const EMPTY_CLOSING = { title: '', subtitle: '', ctaLabel: '', urgency: '' }
const EMPTY_CONTACT = { contactPhone: '', contactEmail: '', contactAddress: '' }

// Default heading per-section — dipakai menyemai field di editor untuk section
// yang BELUM tersimpan di DB (mis. compare/roi yang baru ditambahkan), supaya
// admin melihat teks bawaan, bukan kolom kosong (yang bila disimpan akan
// mengosongkan judul section di landing). Selaras dengan FALLBACK_SECTIONS di
// LandingPage.jsx & DEFAULTS.sections di backend.
const DEFAULT_SECTION_HEADINGS = {
  compare: { kicker: 'Sebelum vs Sesudah', title: 'Dari serba manual jadi serba otomatis', subtitle: 'Perbedaan yang langsung terasa di hari pertama — bukan sekadar ganti alat, tapi ganti cara kerja.' },
  roi:     { kicker: 'Hitung Kebocoran', title: 'Berapa rupiah yang menguap tiap bulan?', subtitle: 'Geser sesuai kondisi barbershop kamu dan lihat potensi tambahan omzet yang bisa diselamatkan.' },
}

function ContentEditor() {
  const toast = useToast()
  const { data, isLoading } = useLanding()
  const updateHero = useUpdateHero()

  const [steps, setSteps] = useState([])
  const [sections, setSections] = useState(null)
  const [closing, setClosing] = useState(EMPTY_CLOSING)
  const [compareRows, setCompareRows] = useState([])
  const [footerText, setFooterText] = useState('')
  const [contact, setContact] = useState(EMPTY_CONTACT)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (data?.hero && !ready) {
      setSteps(Array.isArray(data.hero.steps) ? data.hero.steps : [])
      const s = data.hero.sections || {}
      setSections(Object.fromEntries(
        Object.keys(SECTION_LABELS).map(k => [k, { ...EMPTY_HEADING, ...(DEFAULT_SECTION_HEADINGS[k] || {}), ...(s[k] || {}) }])
      ))
      setClosing({ ...EMPTY_CLOSING, ...(data.hero.closingCta || {}) })
      setCompareRows(Array.isArray(data.hero.compareRows) ? data.hero.compareRows : [])
      setFooterText(data.hero.footerText || '')
      setContact({
        contactPhone:   data.hero.contactPhone   || '',
        contactEmail:   data.hero.contactEmail   || '',
        contactAddress: data.hero.contactAddress || '',
      })
      setReady(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  if (isLoading || !ready || !sections) return <div className="h-64 bg-dark-card rounded-2xl animate-pulse" />

  function setSection(key, field, value) {
    setSections(s => ({ ...s, [key]: { ...s[key], [field]: value } }))
  }
  function setStep(i, field, value) {
    setSteps(arr => arr.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }
  function setCompareRow(i, field, value) {
    setCompareRows(arr => arr.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }
  function addCompareRow() {
    setCompareRows(arr => [...arr, { aspect: '', before: '', after: '' }])
  }
  function removeCompareRow(i) {
    setCompareRows(arr => arr.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    try {
      await updateHero.mutateAsync({
        steps: steps.map(s => ({ title: (s.title || '').trim(), desc: (s.desc || '').trim() })),
        sections,
        closingCta: {
          title:    closing.title.trim(),
          subtitle: closing.subtitle.trim(),
          ctaLabel: closing.ctaLabel.trim(),
          urgency:  (closing.urgency || '').trim() || undefined,
        },
        compareRows: compareRows
          .map(r => ({ aspect: (r.aspect || '').trim(), before: (r.before || '').trim(), after: (r.after || '').trim() }))
          .filter(r => r.aspect || r.before || r.after),
        footerText: footerText.trim(),
        contactPhone:   contact.contactPhone.trim(),
        contactEmail:   contact.contactEmail.trim(),
        contactAddress: contact.contactAddress.trim(),
      })
      toast.success('Konten section tersimpan')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-semibold text-off-white">Judul Section</h3></CardHeader>
        <CardBody className="space-y-4">
          {Object.entries(SECTION_LABELS).map(([key, label]) => (
            <div key={key} className="p-3 bg-dark-surface rounded-xl border border-dark-border space-y-2">
              <p className="text-xs font-semibold text-brand">{label}</p>
              <div className="grid sm:grid-cols-2 gap-2">
                <Input label="Kicker (label kecil)" value={sections[key].kicker} onChange={e => setSection(key, 'kicker', e.target.value)} />
                <Input label="Judul" value={sections[key].title} onChange={e => setSection(key, 'title', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1.5">Subjudul</label>
                <textarea
                  rows={2}
                  className="w-full bg-dark-card border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-brand/60"
                  value={sections[key].subtitle}
                  onChange={e => setSection(key, 'subtitle', e.target.value)}
                />
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-off-white">Langkah "Cara Mulai"</h3>
            {steps.length < 6 && (
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => setSteps(a => [...a, { title: '', desc: '' }])}>Tambah</Button>
            )}
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          {steps.length === 0 && <p className="text-sm text-muted text-center py-3">Belum ada langkah.</p>}
          {steps.map((s, i) => (
            <div key={i} className="p-3 bg-dark-surface rounded-xl border border-dark-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-brand">Langkah {i + 1}</span>
                <button onClick={() => setSteps(a => a.filter((_, idx) => idx !== i))} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
                  <Trash2 size={13} />
                </button>
              </div>
              <Input label="Judul" value={s.title} onChange={e => setStep(i, 'title', e.target.value)} />
              <div>
                <label className="text-xs text-muted block mb-1.5">Deskripsi</label>
                <textarea
                  rows={2}
                  className="w-full bg-dark-card border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-brand/60"
                  value={s.desc}
                  onChange={e => setStep(i, 'desc', e.target.value)}
                />
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-off-white">Baris "Sebelum vs Sesudah"</h3>
            {compareRows.length < 8 && (
              <Button size="sm" variant="secondary" icon={Plus} onClick={addCompareRow}>Tambah</Button>
            )}
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs text-muted">Tiap baris membandingkan satu aspek: tanpa SembaPOS (Sebelum) vs dengan SembaPOS (Sesudah). Kosongkan semua untuk memakai daftar bawaan.</p>
          {compareRows.length === 0 && <p className="text-sm text-muted text-center py-3">Belum ada baris — memakai daftar bawaan.</p>}
          {compareRows.map((r, i) => (
            <div key={i} className="p-3 bg-dark-surface rounded-xl border border-dark-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-brand">Baris {i + 1}</span>
                <button onClick={() => removeCompareRow(i)} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
                  <Trash2 size={13} />
                </button>
              </div>
              <Input label="Aspek" placeholder="Antrian" value={r.aspect} onChange={e => setCompareRow(i, 'aspect', e.target.value)} />
              <div className="grid sm:grid-cols-2 gap-2">
                <Input label="Sebelum (tanpa SembaPOS)" value={r.before} onChange={e => setCompareRow(i, 'before', e.target.value)} />
                <Input label="Sesudah (dengan SembaPOS)" value={r.after} onChange={e => setCompareRow(i, 'after', e.target.value)} />
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-semibold text-off-white">CTA Penutup</h3></CardHeader>
        <CardBody className="space-y-4">
          <Input label="Judul" value={closing.title} onChange={e => setClosing(c => ({ ...c, title: e.target.value }))} />
          <div>
            <label className="text-xs text-muted block mb-1.5">Subjudul</label>
            <textarea
              rows={2}
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-brand/60"
              value={closing.subtitle}
              onChange={e => setClosing(c => ({ ...c, subtitle: e.target.value }))}
            />
          </div>
          <Input label="Label tombol" placeholder="Daftar Sekarang" value={closing.ctaLabel} onChange={e => setClosing(c => ({ ...c, ctaLabel: e.target.value }))} />
          <Input
            label="Badge urgensi (opsional)"
            placeholder="Onboarding gratis dibantu tim kami — slot minggu ini terbatas"
            value={closing.urgency || ''}
            onChange={e => setClosing(c => ({ ...c, urgency: e.target.value }))}
            hint="Pil kecil di atas judul CTA penutup. Kosongkan untuk memakai teks bawaan."
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-semibold text-off-white">Footer</h3></CardHeader>
        <CardBody>
          <label className="text-xs text-muted block mb-1.5">Deskripsi singkat di footer</label>
          <textarea
            rows={3}
            className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/60"
            value={footerText}
            onChange={e => setFooterText(e.target.value)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-semibold text-off-white">Kontak & Alamat</h3></CardHeader>
        <CardBody className="space-y-4">
          <p className="text-xs text-muted">
            Tampil di bagian "Kontak" pada footer landing page. Kosongkan semua untuk memakai info bawaan.
          </p>
          <Input
            label="Nomor telepon / WhatsApp"
            placeholder="0812-3456-7890"
            value={contact.contactPhone}
            onChange={e => setContact(c => ({ ...c, contactPhone: e.target.value }))}
            hint="Jika berupa nomor HP, tombol akan membuka WhatsApp."
          />
          <Input
            label="Email"
            type="email"
            placeholder="halo@sembapos.com"
            value={contact.contactEmail}
            onChange={e => setContact(c => ({ ...c, contactEmail: e.target.value }))}
          />
          <div>
            <label className="text-xs text-muted block mb-1.5">Alamat</label>
            <textarea
              rows={3}
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/60"
              placeholder="Jl. Contoh No. 1, Kota, Indonesia"
              value={contact.contactAddress}
              onChange={e => setContact(c => ({ ...c, contactAddress: e.target.value }))}
            />
          </div>
        </CardBody>
      </Card>

      <Button onClick={handleSave} loading={updateHero.isPending} icon={Save} fullWidth>
        Simpan Konten Section
      </Button>
    </div>
  )
}
