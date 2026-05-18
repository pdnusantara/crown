import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical, Eye, EyeOff, Edit3, Copy, Trash2, Plus, Save, Lock, Upload, Image as ImageIcon,
  BarChart3, LayoutGrid, ListChecks, Tag, MessageSquare, HelpCircle, Megaphone,
  Images, Video, Building2, Type, ExternalLink, Monitor, Smartphone, RefreshCw,
} from 'lucide-react'
import api from '../../lib/api.js'
import { useLanding, useUpdateLayout } from '../../hooks/useLanding.js'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { useToast } from '../../components/ui/Toast.jsx'

// Metadata tiap tipe blok. `core` = singleton (konten dari editor lain);
// selain itu = blok free (bisa banyak, konten di config, bisa hapus/duplikat).
const BLOCK_META = {
  stats:        { label: 'Statistik',      icon: BarChart3,     core: true },
  features:     { label: 'Fitur',          icon: LayoutGrid,    core: true },
  steps:        { label: 'Cara Mulai',     icon: ListChecks,    core: true },
  pricing:      { label: 'Paket Harga',    icon: Tag,           core: true },
  testimonials: { label: 'Testimoni',      icon: MessageSquare, core: true },
  faq:          { label: 'FAQ',            icon: HelpCircle,    core: true },
  closingCta:   { label: 'CTA Penutup',    icon: Megaphone,     core: true },
  gallery:      { label: 'Galeri Gambar',  icon: Images,        core: false },
  video:        { label: 'Video',          icon: Video,         core: false },
  logoStrip:    { label: 'Logo Partner',   icon: Building2,     core: false },
  banner:       { label: 'Banner Promo',   icon: ImageIcon,     core: false },
  richText:     { label: 'Teks & Tombol',  icon: Type,          core: false },
}
const FREE_TYPES = ['gallery', 'video', 'logoStrip', 'banner', 'richText']

// Untuk blok core: ke mana super-admin mengedit kontennya.
const CORE_EDIT = {
  features:     { tab: 'hero',         note: 'Edit di tab Hero & Branding' },
  steps:        { tab: 'content',      note: 'Edit di tab Section & Footer' },
  testimonials: { tab: 'testimonials', note: 'Edit di tab Testimoni' },
  faq:          { tab: 'faqs',         note: 'Edit di tab FAQ' },
  closingCta:   { tab: 'content',      note: 'Edit di tab Section & Footer' },
  pricing:      { nav: '/super-admin/packages', note: 'Diatur di menu Paket Harga' },
  stats:        { note: 'Otomatis dari data — tanpa editor konten' },
}

const uid = () =>
  (crypto?.randomUUID?.() || `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)

// ── Upload gambar ────────────────────────────────────────────────────────────
function ImageUploadField({ value, onChange, label = 'Gambar' }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(file) {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await api.post('/landing/upload', fd)
      onChange(res.data.data.url)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal mengunggah gambar')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <label className="text-xs text-muted block mb-1.5">{label}</label>
      <div className="flex items-center gap-3">
        {value ? (
          <img src={value} alt="" className="w-16 h-16 rounded-lg object-cover border border-dark-border" />
        ) : (
          <div className="w-16 h-16 rounded-lg bg-dark-surface border border-dark-border flex items-center justify-center">
            <ImageIcon size={18} className="text-muted" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => handleFile(e.target.files?.[0])} />
          <Button size="sm" variant="secondary" icon={Upload} loading={busy} onClick={() => inputRef.current?.click()}>
            {value ? 'Ganti gambar' : 'Unggah gambar'}
          </Button>
          {value && (
            <button type="button" onClick={() => onChange('')} className="text-xs text-red-400 hover:underline text-left">
              Hapus gambar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Textarea bertema gelap konsisten dengan editor lain.
function Field({ label, value, onChange, rows, placeholder }) {
  if (rows) {
    return (
      <div>
        <label className="text-xs text-muted block mb-1.5">{label}</label>
        <textarea
          rows={rows}
          placeholder={placeholder}
          className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/60"
          value={value || ''}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    )
  }
  return <Input label={label} placeholder={placeholder} value={value || ''} onChange={e => onChange(e.target.value)} />
}

// ── Editor konfigurasi per tipe blok free ───────────────────────────────────
function BlockConfigFields({ type, config, setConfig }) {
  const c = config || {}
  const set = (key, val) => setConfig({ ...c, [key]: val })
  const setList = (key, list) => setConfig({ ...c, [key]: list })

  if (type === 'gallery') {
    const items = Array.isArray(c.items) ? c.items : []
    return (
      <div className="space-y-3">
        <Field label="Kicker (label kecil, opsional)" value={c.kicker} onChange={v => set('kicker', v)} placeholder="Galeri" />
        <Field label="Judul (opsional)" value={c.title} onChange={v => set('title', v)} />
        <Field label="Subjudul (opsional)" value={c.subtitle} onChange={v => set('subtitle', v)} rows={2} />
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gold">Gambar ({items.length})</p>
          <button type="button" onClick={() => setList('items', [...items, { url: '', caption: '' }])} className="text-xs text-gold hover:underline inline-flex items-center gap-1">
            <Plus size={11} /> Tambah gambar
          </button>
        </div>
        {items.map((it, i) => (
          <div key={i} className="p-3 bg-dark-surface rounded-xl border border-dark-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Gambar {i + 1}</span>
              <button type="button" onClick={() => setList('items', items.filter((_, idx) => idx !== i))} className="p-1 rounded text-red-400 hover:bg-red-500/10">
                <Trash2 size={13} />
              </button>
            </div>
            <ImageUploadField value={it.url} onChange={url => setList('items', items.map((x, idx) => idx === i ? { ...x, url } : x))} />
            <Field label="Caption (opsional)" value={it.caption} onChange={v => setList('items', items.map((x, idx) => idx === i ? { ...x, caption: v } : x))} />
          </div>
        ))}
      </div>
    )
  }

  if (type === 'video') {
    return (
      <div className="space-y-3">
        <Field label="Kicker (opsional)" value={c.kicker} onChange={v => set('kicker', v)} placeholder="Video" />
        <Field label="Judul (opsional)" value={c.title} onChange={v => set('title', v)} />
        <Field label="Subjudul (opsional)" value={c.subtitle} onChange={v => set('subtitle', v)} rows={2} />
        <Field label="URL video (YouTube / Vimeo)" value={c.url} onChange={v => set('url', v)} placeholder="https://youtube.com/watch?v=..." />
      </div>
    )
  }

  if (type === 'logoStrip') {
    const logos = Array.isArray(c.logos) ? c.logos : []
    return (
      <div className="space-y-3">
        <Field label="Judul strip (opsional)" value={c.title} onChange={v => set('title', v)} placeholder="Dipercaya oleh" />
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gold">Logo ({logos.length})</p>
          <button type="button" onClick={() => setList('logos', [...logos, { url: '', name: '' }])} className="text-xs text-gold hover:underline inline-flex items-center gap-1">
            <Plus size={11} /> Tambah logo
          </button>
        </div>
        {logos.map((l, i) => (
          <div key={i} className="p-3 bg-dark-surface rounded-xl border border-dark-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Logo {i + 1}</span>
              <button type="button" onClick={() => setList('logos', logos.filter((_, idx) => idx !== i))} className="p-1 rounded text-red-400 hover:bg-red-500/10">
                <Trash2 size={13} />
              </button>
            </div>
            <ImageUploadField value={l.url} onChange={url => setList('logos', logos.map((x, idx) => idx === i ? { ...x, url } : x))} />
            <Field label="Nama (opsional)" value={l.name} onChange={v => setList('logos', logos.map((x, idx) => idx === i ? { ...x, name: v } : x))} />
          </div>
        ))}
      </div>
    )
  }

  if (type === 'banner') {
    return (
      <div className="space-y-3">
        <ImageUploadField label="Gambar latar (opsional)" value={c.image} onChange={v => set('image', v)} />
        <Field label="Heading" value={c.heading} onChange={v => set('heading', v)} />
        <Field label="Teks (opsional)" value={c.text} onChange={v => set('text', v)} rows={2} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Label tombol (opsional)" value={c.ctaLabel} onChange={v => set('ctaLabel', v)} />
          <Field label="URL tombol (opsional)" value={c.ctaUrl} onChange={v => set('ctaUrl', v)} placeholder="/register" />
        </div>
      </div>
    )
  }

  // richText
  return (
    <div className="space-y-3">
      <Field label="Kicker (opsional)" value={c.kicker} onChange={v => set('kicker', v)} />
      <Field label="Heading" value={c.heading} onChange={v => set('heading', v)} />
      <Field label="Isi teks" value={c.body} onChange={v => set('body', v)} rows={5} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Label tombol (opsional)" value={c.ctaLabel} onChange={v => set('ctaLabel', v)} />
        <Field label="URL tombol (opsional)" value={c.ctaUrl} onChange={v => set('ctaUrl', v)} placeholder="/register" />
      </div>
    </div>
  )
}

// ── Baris blok yang bisa di-drag ────────────────────────────────────────────
function SortableBlockRow({ block, onToggle, onEdit, onDuplicate, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const meta = BLOCK_META[block.type] || { label: block.type, icon: LayoutGrid, core: false }
  const Icon = meta.icon
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-xl border bg-dark-card ${
        block.visible ? 'border-dark-border' : 'border-dark-border opacity-60'
      }`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted hover:text-off-white touch-none"
        {...attributes}
        {...listeners}
        aria-label="Geser untuk mengurutkan"
      >
        <GripVertical size={16} />
      </button>

      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.core ? 'bg-gold/15 text-gold' : 'bg-blue-500/15 text-blue-300'}`}>
        <Icon size={15} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-off-white truncate">{meta.label}</p>
        <p className="text-[11px] text-muted">{meta.core ? 'Blok inti' : 'Blok tambahan'}</p>
      </div>

      {!block.visible && <Badge variant="muted" className="text-[10px]">Tersembunyi</Badge>}

      <button type="button" onClick={() => onToggle(block.id)} title={block.visible ? 'Sembunyikan' : 'Tampilkan'} className="p-1.5 rounded-lg text-muted hover:text-off-white hover:bg-dark-surface">
        {block.visible ? <Eye size={15} /> : <EyeOff size={15} />}
      </button>
      <button type="button" onClick={() => onEdit(block)} title="Edit" className="p-1.5 rounded-lg text-muted hover:text-off-white hover:bg-dark-surface">
        <Edit3 size={15} />
      </button>
      {!meta.core && (
        <button type="button" onClick={() => onDuplicate(block.id)} title="Duplikat" className="p-1.5 rounded-lg text-muted hover:text-off-white hover:bg-dark-surface">
          <Copy size={15} />
        </button>
      )}
      {!meta.core && (
        <button type="button" onClick={() => onDelete(block.id)} title="Hapus" className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10">
          <Trash2 size={15} />
        </button>
      )}
    </div>
  )
}

// Baris terkunci (Hero / Footer) — tidak bisa dipindah / disembunyikan.
function LockedRow({ icon: Icon, label, position }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-dark-border bg-dark-surface/50">
      <Lock size={15} className="text-muted" />
      <div className="w-8 h-8 rounded-lg bg-gold/15 text-gold flex items-center justify-center flex-shrink-0">
        <Icon size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-off-white">{label}</p>
        <p className="text-[11px] text-muted">Posisi {position} — terkunci</p>
      </div>
      <Badge variant="muted" className="text-[10px]">Tetap</Badge>
    </div>
  )
}

// ── Builder utama ───────────────────────────────────────────────────────────
export default function LandingLayoutBuilder({ onEditCore }) {
  const toast = useToast()
  const navigate = useNavigate()
  const { data, isLoading } = useLanding()
  const updateLayout = useUpdateLayout()

  const [blocks, setBlocks] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState(null)        // blok free yang sedang diedit
  const [configDraft, setConfigDraft] = useState({})
  const [previewKey, setPreviewKey] = useState(0)      // bump → iframe reload
  const [previewMode, setPreviewMode] = useState('desktop')

  useEffect(() => {
    if (data?.layout && !blocks) {
      setBlocks(data.layout.map(b => ({ ...b, visible: b.visible !== false })))
    }
  }, [data, blocks])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (isLoading || !blocks) {
    return <div className="h-64 bg-dark-card rounded-2xl animate-pulse" />
  }

  function handleDragEnd(e) {
    const { active, over } = e
    if (over && active.id !== over.id) {
      setBlocks(bs => {
        const oldI = bs.findIndex(b => b.id === active.id)
        const newI = bs.findIndex(b => b.id === over.id)
        return oldI < 0 || newI < 0 ? bs : arrayMove(bs, oldI, newI)
      })
    }
  }
  const toggle = (id) => setBlocks(bs => bs.map(b => b.id === id ? { ...b, visible: !b.visible } : b))
  const remove = (id) => setBlocks(bs => bs.filter(b => b.id !== id))
  const duplicate = (id) => setBlocks(bs => {
    const i = bs.findIndex(b => b.id === id)
    if (i < 0) return bs
    const copy = { ...bs[i], id: uid(), config: { ...(bs[i].config || {}) } }
    return [...bs.slice(0, i + 1), copy, ...bs.slice(i + 1)]
  })
  const addFreeBlock = (type) => {
    setBlocks(bs => [...bs, { id: uid(), type, visible: true, config: {} }])
    setAddOpen(false)
  }

  function handleEdit(block) {
    const meta = BLOCK_META[block.type]
    if (meta?.core) {
      const dest = CORE_EDIT[block.type]
      if (dest?.tab && onEditCore) onEditCore(dest.tab)
      else if (dest?.nav) navigate(dest.nav)
      else toast.info?.(dest?.note || 'Blok ini tidak punya editor konten')
      return
    }
    setEditing(block)
    setConfigDraft({ ...(block.config || {}) })
  }
  function saveConfig() {
    setBlocks(bs => bs.map(b => b.id === editing.id ? { ...b, config: configDraft } : b))
    setEditing(null)
  }

  async function handleSave() {
    try {
      // Buang field non-skema sebelum kirim.
      const payload = blocks.map(b => ({
        id: b.id, type: b.type, visible: !!b.visible,
        ...(BLOCK_META[b.type]?.core ? {} : { config: b.config || {} }),
      }))
      await updateLayout.mutateAsync(payload)
      toast.success('Tata letak landing tersimpan')
      setPreviewKey(k => k + 1) // segarkan pratinjau ke kondisi tersimpan
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan tata letak')
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-off-white">Tata Letak Landing</h3>
              <p className="text-xs text-muted mt-0.5">
                Geser untuk mengurutkan, sembunyikan, atau tambah blok. Hero & Footer terkunci.
              </p>
            </div>
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAddOpen(true)}>Tambah Blok</Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-2">
          <LockedRow icon={LayoutGrid} label="Hero" position="atas" />

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {blocks.map(b => (
                  <SortableBlockRow
                    key={b.id}
                    block={b}
                    onToggle={toggle}
                    onEdit={handleEdit}
                    onDuplicate={duplicate}
                    onDelete={remove}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {blocks.length === 0 && (
            <p className="text-sm text-muted text-center py-4">Belum ada blok. Tambahkan lewat tombol di atas.</p>
          )}

          <LockedRow icon={Megaphone} label="Footer" position="bawah" />
        </CardBody>
      </Card>

      <Button onClick={handleSave} loading={updateLayout.isPending} icon={Save} fullWidth>
        Simpan Tata Letak
      </Button>

      {/* Pratinjau langsung */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-off-white">Pratinjau</h3>
            <div className="flex items-center gap-1">
              <button
                type="button" onClick={() => setPreviewMode('desktop')}
                title="Tampilan desktop"
                className={`p-1.5 rounded-lg ${previewMode === 'desktop' ? 'bg-gold text-dark' : 'text-muted hover:text-off-white'}`}
              >
                <Monitor size={15} />
              </button>
              <button
                type="button" onClick={() => setPreviewMode('mobile')}
                title="Tampilan mobile"
                className={`p-1.5 rounded-lg ${previewMode === 'mobile' ? 'bg-gold text-dark' : 'text-muted hover:text-off-white'}`}
              >
                <Smartphone size={15} />
              </button>
              <button
                type="button" onClick={() => setPreviewKey(k => k + 1)}
                title="Segarkan pratinjau"
                className="p-1.5 rounded-lg text-muted hover:text-off-white"
              >
                <RefreshCw size={15} />
              </button>
              <a
                href="/?preview=1" target="_blank" rel="noopener noreferrer"
                title="Buka di tab baru"
                className="p-1.5 rounded-lg text-muted hover:text-off-white"
              >
                <ExternalLink size={15} />
              </a>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-muted mb-3">
            Pratinjau menampilkan kondisi <span className="text-off-white">tersimpan</span>. Klik "Simpan Tata Letak" untuk melihat perubahan terbaru.
          </p>
          <div
            className="mx-auto bg-white rounded-xl border border-dark-border overflow-hidden transition-all"
            style={{ maxWidth: previewMode === 'mobile' ? 390 : '100%' }}
          >
            <iframe
              key={previewKey}
              src="/?preview=1"
              title="Pratinjau landing"
              className="w-full"
              style={{ height: 640, border: 0 }}
            />
          </div>
        </CardBody>
      </Card>

      {/* Modal tambah blok */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Tambah Blok">
        <p className="text-sm text-muted mb-3">Pilih jenis blok yang ingin ditambahkan ke landing.</p>
        <div className="grid grid-cols-2 gap-2">
          {FREE_TYPES.map(type => {
            const meta = BLOCK_META[type]
            const Icon = meta.icon
            return (
              <button
                key={type}
                onClick={() => addFreeBlock(type)}
                className="flex items-center gap-2.5 p-3 rounded-xl bg-dark-surface border border-dark-border hover:border-gold/40 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-300 flex items-center justify-center flex-shrink-0">
                  <Icon size={15} />
                </div>
                <span className="text-sm font-medium text-off-white">{meta.label}</span>
              </button>
            )
          })}
        </div>
      </Modal>

      {/* Modal edit konfigurasi blok free */}
      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${BLOCK_META[editing.type]?.label || 'Blok'}` : ''}
        size="lg"
      >
        {editing && (
          <div className="space-y-4">
            <BlockConfigFields type={editing.type} config={configDraft} setConfig={setConfigDraft} />
            <div className="flex gap-2 pt-1">
              <Button variant="outline" fullWidth onClick={() => setEditing(null)}>Batal</Button>
              <Button fullWidth icon={Save} onClick={saveConfig}>Terapkan</Button>
            </div>
            <p className="text-[11px] text-muted text-center">
              Perubahan baru aktif setelah klik "Simpan Tata Letak".
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
