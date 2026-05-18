import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Globe, Edit3, Trash2, Plus, Save, MessageSquare, HelpCircle, Star, Eye, EyeOff, ExternalLink,
  LayoutTemplate, Layers,
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

const TABS = [
  { id: 'layout',       label: 'Tata Letak',       icon: Layers },
  { id: 'hero',         label: 'Hero & Branding',  icon: Globe },
  { id: 'content',      label: 'Section & Footer', icon: LayoutTemplate },
  { id: 'testimonials', label: 'Testimoni',        icon: MessageSquare },
  { id: 'faqs',         label: 'FAQ',              icon: HelpCircle },
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-card border border-dark-border text-sm hover:border-gold/40 transition-colors"
        >
          <ExternalLink size={13} /> Lihat halaman
        </a>
      </div>

      <div className="flex gap-1 bg-dark-card border border-dark-border rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => changeTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-2 ${tab === t.id ? 'bg-gold text-dark' : 'text-muted hover:text-off-white'}`}
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
    </div>
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

  useEffect(() => {
    if (data?.hero && !form) {
      setForm({
        heroTitle:    data.hero.heroTitle    || '',
        heroSubtitle: data.hero.heroSubtitle || '',
        heroCtaLabel: data.hero.heroCtaLabel || '',
        brandTagline: data.hero.brandTagline || '',
        whatsappCta:  data.hero.whatsappCta  || '',
        heroBadge:    data.hero.heroBadge    || '',
        showStats:    data.hero.showStats !== false,
      })
      setFeatures(Array.isArray(data.hero.features) ? data.hero.features : [])
      setTrustItems(Array.isArray(data.hero.trustItems) ? data.hero.trustItems : [])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  if (isLoading || !form) return <div className="h-64 bg-dark-card rounded-2xl animate-pulse" />

  async function handleSave() {
    try {
      await updateHero.mutateAsync({
        ...form,
        features,
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
    setFeatures(arr => [...arr, { icon: 'Sparkles', title: '', desc: '' }])
  }
  function removeFeature(i) {
    setFeatures(arr => arr.filter((_, idx) => idx !== i))
  }

  return (
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
            <label className="text-xs text-muted block mb-1.5">Judul utama (2 kata terakhir akan ditandai gold)</label>
            <textarea
              rows={2}
              className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/60 transition-colors"
              value={form.heroTitle}
              onChange={e => setForm(f => ({ ...f, heroTitle: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1.5">Subjudul</label>
            <textarea
              rows={3}
              className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/60 transition-colors"
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

          <Input
            label="Teks badge kecil (pil di atas tagline)"
            placeholder="Baru"
            value={form.heroBadge}
            onChange={e => setForm(f => ({ ...f, heroBadge: e.target.value }))}
            hint="Mis. 'Baru', 'Promo', 'v2.0'"
          />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-muted">Poin kepercayaan (di bawah tombol hero)</label>
              {trustItems.length < 6 && (
                <button
                  type="button"
                  onClick={() => setTrustItems(arr => [...arr, ''])}
                  className="text-xs text-gold hover:underline inline-flex items-center gap-1"
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
                    className="flex-1 bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-lg px-3 py-2 text-sm outline-none focus:border-gold/60"
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
              className="accent-gold"
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
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-off-white">Fitur Unggulan</h3>
            <Button size="sm" variant="secondary" icon={Plus} onClick={addFeature}>Tambah</Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-3 max-h-[600px] overflow-y-auto">
          {features.length === 0 && (
            <p className="text-sm text-muted text-center py-4">Belum ada fitur.</p>
          )}
          {features.map((f, i) => (
            <div key={i} className="p-3 bg-dark-surface rounded-xl border border-dark-border space-y-2">
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
                  className="w-full bg-dark-card border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/60"
                  value={f.desc}
                  onChange={e => updateFeature(i, 'desc', e.target.value)}
                />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted">
            Nama icon dari <a className="text-gold hover:underline" href="https://lucide.dev/icons" target="_blank" rel="noopener noreferrer">lucide.dev</a> (case-sensitive). Contoh: Scissors, Building2, BarChart3.
          </p>
          <Button onClick={handleSave} loading={updateHero.isPending} icon={Save} fullWidth variant="secondary">
            Simpan Fitur
          </Button>
        </CardBody>
      </Card>
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
                <div className="flex items-center gap-1 text-gold">
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
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/60"
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
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="accent-gold" />
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
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/60"
              value={form.answer}
              onChange={e => setForm(f => ({ ...f, answer: e.target.value }))}
            />
          </div>
          <Input label="Urutan tampil" type="number" value={form.displayOrder} onChange={e => setForm(f => ({ ...f, displayOrder: Number(e.target.value) }))} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="accent-gold" />
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
  pricing:      'Section "Harga"',
  testimonials: 'Section "Testimoni"',
  faq:          'Section "FAQ"',
}
const EMPTY_HEADING = { kicker: '', title: '', subtitle: '' }
const EMPTY_CLOSING = { title: '', subtitle: '', ctaLabel: '' }

function ContentEditor() {
  const toast = useToast()
  const { data, isLoading } = useLanding()
  const updateHero = useUpdateHero()

  const [steps, setSteps] = useState([])
  const [sections, setSections] = useState(null)
  const [closing, setClosing] = useState(EMPTY_CLOSING)
  const [footerText, setFooterText] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (data?.hero && !ready) {
      setSteps(Array.isArray(data.hero.steps) ? data.hero.steps : [])
      const s = data.hero.sections || {}
      setSections(Object.fromEntries(
        Object.keys(SECTION_LABELS).map(k => [k, { ...EMPTY_HEADING, ...(s[k] || {}) }])
      ))
      setClosing({ ...EMPTY_CLOSING, ...(data.hero.closingCta || {}) })
      setFooterText(data.hero.footerText || '')
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

  async function handleSave() {
    try {
      await updateHero.mutateAsync({
        steps: steps.map(s => ({ title: (s.title || '').trim(), desc: (s.desc || '').trim() })),
        sections,
        closingCta: {
          title:    closing.title.trim(),
          subtitle: closing.subtitle.trim(),
          ctaLabel: closing.ctaLabel.trim(),
        },
        footerText: footerText.trim(),
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
              <p className="text-xs font-semibold text-gold">{label}</p>
              <div className="grid sm:grid-cols-2 gap-2">
                <Input label="Kicker (label kecil)" value={sections[key].kicker} onChange={e => setSection(key, 'kicker', e.target.value)} />
                <Input label="Judul" value={sections[key].title} onChange={e => setSection(key, 'title', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted block mb-1.5">Subjudul</label>
                <textarea
                  rows={2}
                  className="w-full bg-dark-card border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/60"
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
                <span className="text-xs font-semibold text-gold">Langkah {i + 1}</span>
                <button onClick={() => setSteps(a => a.filter((_, idx) => idx !== i))} className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">
                  <Trash2 size={13} />
                </button>
              </div>
              <Input label="Judul" value={s.title} onChange={e => setStep(i, 'title', e.target.value)} />
              <div>
                <label className="text-xs text-muted block mb-1.5">Deskripsi</label>
                <textarea
                  rows={2}
                  className="w-full bg-dark-card border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/60"
                  value={s.desc}
                  onChange={e => setStep(i, 'desc', e.target.value)}
                />
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
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/60"
              value={closing.subtitle}
              onChange={e => setClosing(c => ({ ...c, subtitle: e.target.value }))}
            />
          </div>
          <Input label="Label tombol" placeholder="Daftar Sekarang" value={closing.ctaLabel} onChange={e => setClosing(c => ({ ...c, ctaLabel: e.target.value }))} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-semibold text-off-white">Footer</h3></CardHeader>
        <CardBody>
          <label className="text-xs text-muted block mb-1.5">Deskripsi singkat di footer</label>
          <textarea
            rows={3}
            className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/60"
            value={footerText}
            onChange={e => setFooterText(e.target.value)}
          />
        </CardBody>
      </Card>

      <Button onClick={handleSave} loading={updateHero.isPending} icon={Save} fullWidth>
        Simpan Konten Section
      </Button>
    </div>
  )
}
