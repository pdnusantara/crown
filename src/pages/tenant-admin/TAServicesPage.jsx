import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Edit2, Trash2, Clock, Search, Filter, ChevronLeft, ChevronRight,
  Package, Power, Eye, EyeOff, Layers, TrendingUp, Download, RefreshCw,
  CheckSquare, Square, X, Tag, BadgeCheck, Pause,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import {
  useServices, useServiceCategories, useServiceStats,
  useCreateService, useUpdateService, useDeleteService,
} from '../../hooks/useServices.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import Select from '../../components/ui/Select.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { formatRupiah, formatRupiahShort } from '../../utils/format.js'

const ICON_OPTIONS = ['✂️','🪒','💈','💆','🎨','🔥','✨','💎','👑','⚡','🌿','🧴','🪞','🌟','💧','🧖']
const DEFAULT_CATEGORIES = ['Potong Rambut', 'Perawatan', 'Warna', 'Combo', 'Cukur', 'Pijat', 'Treatment']
const PAGE_SIZE = 12

const SORT_OPTIONS = [
  { value: 'recent',     label: 'Terbaru',       sortBy: 'createdAt', sortDir: 'desc' },
  { value: 'name-asc',   label: 'Nama A→Z',      sortBy: 'name',      sortDir: 'asc'  },
  { value: 'name-desc',  label: 'Nama Z→A',      sortBy: 'name',      sortDir: 'desc' },
  { value: 'price-asc',  label: 'Harga termurah',sortBy: 'price',     sortDir: 'asc'  },
  { value: 'price-desc', label: 'Harga termahal',sortBy: 'price',     sortDir: 'desc' },
  { value: 'dur-asc',    label: 'Durasi tercepat',sortBy: 'duration', sortDir: 'asc' },
  { value: 'dur-desc',   label: 'Durasi terlama',sortBy: 'duration',  sortDir: 'desc' },
]

const csvEscape = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const downloadCSV = (filename, header, rows) => {
  const csv = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n')
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Stat tile ──────────────────────────────────────────────────────────────
function StatTile({ icon: Icon, label, value, valueShort, accent = 'gold', hint, delay = 0 }) {
  const palette = {
    gold:  { icon: 'text-gold',         bg: 'bg-gold/15 border-gold/30' },
    blue:  { icon: 'text-blue-300',     bg: 'bg-blue-500/15 border-blue-500/30' },
    green: { icon: 'text-emerald-300',  bg: 'bg-emerald-500/15 border-emerald-500/30' },
    amber: { icon: 'text-amber-300',    bg: 'bg-amber-500/15 border-amber-500/30' },
    rose:  { icon: 'text-rose-300',     bg: 'bg-rose-500/15 border-rose-500/30' },
  }[accent]
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className="p-2.5 sm:p-4 min-w-0 overflow-hidden">
        <div className="flex items-start gap-2 sm:gap-3 min-w-0">
          <div className={`shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center ${palette.bg}`}>
            <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${palette.icon}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-xs text-muted leading-tight truncate">{label}</p>
            <p className="text-sm sm:text-lg lg:text-xl font-bold text-off-white mt-0.5 leading-tight tabular-nums truncate">
              {valueShort != null ? (
                <>
                  <span className="sm:hidden">{valueShort}</span>
                  <span className="hidden sm:inline">{value}</span>
                </>
              ) : value}
            </p>
            {hint && (
              <p className="text-[10px] sm:text-[11px] text-muted mt-0.5 truncate">{hint}</p>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

// ─── Service card (grid item) ───────────────────────────────────────────────
function ServiceCard({ svc, selected, onToggleSelect, onEdit, onDelete, onToggleActive, busyId }) {
  const isBusy = busyId === svc.id
  const inactive = !svc.isActive
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className="min-w-0"
    >
      <Card className={`p-3 sm:p-4 card-hover transition-all ${inactive ? 'opacity-70' : ''} ${selected ? 'ring-2 ring-gold/50' : ''}`}>
        <div className="flex items-start gap-3 min-w-0">
          {/* Select checkbox */}
          <button
            type="button"
            onClick={() => onToggleSelect(svc.id)}
            className="shrink-0 mt-0.5 p-0.5 text-muted hover:text-gold transition-colors"
            aria-label={selected ? 'Batal pilih' : 'Pilih'}
          >
            {selected
              ? <CheckSquare className="w-4 h-4 text-gold" />
              : <Square className="w-4 h-4" />}
          </button>
          {/* Icon */}
          <div className="shrink-0 w-10 h-10 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center text-xl">
            {svc.icon || '✂️'}
          </div>
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-1.5 flex-wrap">
              <h3 className="font-medium text-off-white leading-tight truncate flex-1 min-w-0">{svc.name}</h3>
              {inactive && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 shrink-0">
                  <Pause className="w-2.5 h-2.5" /> Off
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1 mt-1">
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-dark-card/80 border border-dark-border/60 text-muted">
                <Tag className="w-2.5 h-2.5" /> {svc.category || 'Lainnya'}
              </span>
            </div>
            {svc.description && (
              <p className="text-xs text-muted mt-2 leading-snug line-clamp-2">{svc.description}</p>
            )}
          </div>
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-dark-border/60 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-gold font-semibold tabular-nums whitespace-nowrap text-sm sm:text-base">
              <span className="sm:hidden">{formatRupiahShort(svc.price)}</span>
              <span className="hidden sm:inline">{formatRupiah(svc.price)}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-muted text-xs whitespace-nowrap">
              <Clock className="w-3.5 h-3.5" />
              <span className="tabular-nums">{svc.duration}m</span>
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onToggleActive(svc)}
              title={inactive ? 'Aktifkan' : 'Nonaktifkan'}
              className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                inactive
                  ? 'text-muted hover:text-emerald-400'
                  : 'text-emerald-400/80 hover:text-emerald-400'
              }`}
            >
              {inactive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => onEdit(svc)}
              title="Edit"
              className="p-1.5 rounded-lg text-muted hover:text-blue-400 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(svc)}
              title="Hapus"
              className="p-1.5 rounded-lg text-muted hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

// ─── Service Form Modal ─────────────────────────────────────────────────────
function ServiceFormModal({ open, onClose, editService, knownCategories, onSave, saving }) {
  const [form, setForm] = useState({
    name: '', category: '', price: '', duration: '', description: '', icon: '✂️', isActive: true,
  })
  const [customCategory, setCustomCategory] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (open) {
      if (editService) {
        setForm({
          name: editService.name || '',
          category: editService.category || '',
          price: String(editService.price ?? ''),
          duration: String(editService.duration ?? ''),
          description: editService.description || '',
          icon: editService.icon || '✂️',
          isActive: editService.isActive !== false,
        })
        setCustomCategory(!knownCategories.includes(editService.category))
      } else {
        setForm({
          name: '',
          category: knownCategories[0] || 'Potong Rambut',
          price: '',
          duration: '30',
          description: '',
          icon: '✂️',
          isActive: true,
        })
        setCustomCategory(false)
      }
      setErrors({})
    }
  }, [open, editService, knownCategories])

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Nama wajib diisi'
    if (!form.category.trim()) e.category = 'Kategori wajib dipilih'
    const price = Number(form.price)
    if (!Number.isFinite(price) || price < 0) e.price = 'Harga harus angka ≥ 0'
    const duration = Number(form.duration)
    if (!Number.isFinite(duration) || duration < 1) e.duration = 'Durasi minimal 1 menit'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = () => {
    if (!validate()) return
    onSave({
      name: form.name.trim(),
      category: form.category.trim(),
      price: Math.round(Number(form.price)),
      duration: Math.round(Number(form.duration)),
      description: form.description.trim() || undefined,
      icon: form.icon || undefined,
      isActive: form.isActive,
    })
  }

  // Form-level shortcut: Ctrl+Enter submit
  const formRef = useRef(null)
  useEffect(() => {
    const handle = (ev) => {
      if (open && (ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
        ev.preventDefault()
        submit()
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form])

  const allOptions = [...new Set([...knownCategories, ...DEFAULT_CATEGORIES])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'id'))

  return (
    <Modal isOpen={open} onClose={onClose} title={editService ? 'Edit Layanan' : 'Tambah Layanan'} size="md">
      <div ref={formRef} className="space-y-4">
        {/* Icon picker */}
        <div>
          <label className="block text-sm font-medium text-muted mb-1.5">Ikon</label>
          <div className="grid grid-cols-8 sm:grid-cols-8 gap-1.5">
            {ICON_OPTIONS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => setForm(f => ({ ...f, icon: emoji }))}
                className={`aspect-square text-xl rounded-lg transition-all flex items-center justify-center ${
                  form.icon === emoji
                    ? 'bg-gold/20 border border-gold/50'
                    : 'bg-dark-surface hover:bg-dark-card border border-dark-border'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Nama Layanan *"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="Potong Reguler"
          error={errors.name}
        />

        {/* Category — combobox (select existing OR custom new) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-muted">Kategori *</label>
            <button
              type="button"
              onClick={() => setCustomCategory(c => !c)}
              className="text-xs text-gold hover:underline"
            >
              {customCategory ? 'Pilih dari daftar' : '+ Kategori baru'}
            </button>
          </div>
          {customCategory ? (
            <Input
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              placeholder="Misal: VIP, Express, Pijat Refleksi…"
              error={errors.category}
            />
          ) : (
            <>
              <Select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                options={allOptions.map(c => ({ value: c, label: c }))}
                placeholder="Pilih kategori..."
                error={errors.category}
              />
              {errors.category && !customCategory && (
                <p className="mt-1.5 text-xs text-red-400">{errors.category}</p>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Harga (Rp) *"
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={form.price}
            onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
            placeholder="35000"
            hint={form.price ? formatRupiah(Number(form.price) || 0) : null}
            error={errors.price}
          />
          <Input
            label="Durasi (menit) *"
            type="number"
            inputMode="numeric"
            min={1}
            value={form.duration}
            onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
            placeholder="30"
            error={errors.duration}
          />
        </div>

        <Input
          label="Deskripsi"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Deskripsi singkat layanan…"
          hint="Opsional · ditampilkan ke pelanggan saat booking"
        />

        {/* Active toggle */}
        <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-dark-card/40 border border-dark-border/60 cursor-pointer">
          <div className="min-w-0">
            <p className="text-sm font-medium text-off-white inline-flex items-center gap-2">
              <Power className="w-4 h-4 text-gold" /> Status Layanan
            </p>
            <p className="text-[11px] text-muted mt-0.5">
              {form.isActive ? 'Aktif: muncul di POS, booking, dan halaman publik.' : 'Nonaktif: tersimpan tapi tidak bisa dipilih.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.isActive}
            onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
            className={`shrink-0 relative w-10 h-6 rounded-full transition-colors ${
              form.isActive ? 'bg-gold' : 'bg-dark-card border border-dark-border'
            }`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              form.isActive ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </button>
        </label>

        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button variant="outline" fullWidth onClick={onClose} disabled={saving}>Batal</Button>
          <Button fullWidth onClick={submit} loading={saving}>
            {editService ? 'Simpan Perubahan' : 'Tambah Layanan'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Main ───────────────────────────────────────────────────────────────────
export default function TAServicesPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  // ── State (URL-synced) ────────────────────────────────────────────────────
  const [search, setSearch]         = useState(params.get('q') || '')
  const [category, setCategory]     = useState(params.get('cat') || '')
  const [activeFilter, setActiveFilter] = useState(params.get('active') || '') // '', 'true', 'false'
  const [sort, setSort]             = useState(params.get('sort') || 'recent')
  const [page, setPage]             = useState(Number(params.get('page')) || 1)

  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(id)
  }, [search])

  // Reset page on filter changes
  useEffect(() => { setPage(1) }, [debouncedSearch, category, activeFilter, sort])

  // Sync URL
  useEffect(() => {
    const next = new URLSearchParams(params)
    const setOrDel = (k, v) => v ? next.set(k, v) : next.delete(k)
    setOrDel('q', debouncedSearch)
    setOrDel('cat', category)
    setOrDel('active', activeFilter)
    setOrDel('sort', sort !== 'recent' ? sort : '')
    setOrDel('page', page > 1 ? String(page) : '')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, category, activeFilter, sort, page])

  // ── Queries ───────────────────────────────────────────────────────────────
  const sortConfig = SORT_OPTIONS.find(o => o.value === sort) || SORT_OPTIONS[0]
  const queryFilters = useMemo(() => {
    const f = { page, limit: PAGE_SIZE, sortBy: sortConfig.sortBy, sortDir: sortConfig.sortDir }
    if (debouncedSearch) f.search = debouncedSearch
    if (category)       f.category = category
    if (activeFilter)   f.isActive = activeFilter
    return f
  }, [page, sortConfig.sortBy, sortConfig.sortDir, debouncedSearch, category, activeFilter])

  const servicesQuery = useServices(queryFilters)
  const items     = servicesQuery.services
  const totalItems = servicesQuery.total
  const totalPages = servicesQuery.totalPages || Math.max(1, Math.ceil(totalItems / PAGE_SIZE))

  const categoriesQuery = useServiceCategories()
  const statsQuery = useServiceStats()

  const knownCategories = useMemo(
    () => (categoriesQuery.data || []).map(c => c.category),
    [categoriesQuery.data]
  )
  const stats = statsQuery.data || { total: 0, active: 0, inactive: 0, avgPrice: 0, avgDuration: 0, categories: 0 }

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createM = useCreateService()
  const updateM = useUpdateService()
  const deleteM = useDeleteService()

  const [busyId, setBusyId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editService, setEditService] = useState(null)

  const [confirmDel, setConfirmDel] = useState(null) // service to delete
  const [confirmBulk, setConfirmBulk] = useState(null) // 'delete' | 'activate' | 'deactivate' | null

  const [selected, setSelected] = useState(() => new Set())
  const allOnPageSelected = items.length > 0 && items.every(s => selected.has(s.id))
  const toggleSelect = (id) => setSelected(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelected(s => {
        const n = new Set(s); items.forEach(it => n.delete(it.id)); return n
      })
    } else {
      setSelected(s => {
        const n = new Set(s); items.forEach(it => n.add(it.id)); return n
      })
    }
  }
  const clearSelection = () => setSelected(new Set())

  const openAdd = () => { setEditService(null); setShowForm(true) }
  const openEdit = (svc) => { setEditService(svc); setShowForm(true) }

  const handleSave = async (payload) => {
    try {
      if (editService) {
        await updateM.mutateAsync({ id: editService.id, ...payload })
        toast.success('Layanan berhasil diperbarui')
      } else {
        await createM.mutateAsync(payload)
        toast.success('Layanan baru ditambahkan')
      }
      setShowForm(false)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan layanan')
    }
  }

  const handleToggleActive = async (svc) => {
    setBusyId(svc.id)
    try {
      await updateM.mutateAsync({ id: svc.id, isActive: !svc.isActive })
      toast.success(svc.isActive ? `${svc.name} dinonaktifkan` : `${svc.name} diaktifkan`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal mengubah status')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = (svc) => setConfirmDel(svc)
  const confirmDelete = async () => {
    if (!confirmDel) return
    try {
      await deleteM.mutateAsync(confirmDel.id)
      toast.success('Layanan dihapus')
      setSelected(s => { const n = new Set(s); n.delete(confirmDel.id); return n })
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menghapus layanan')
    }
  }

  const runBulk = async () => {
    if (!confirmBulk) return
    const ids = Array.from(selected)
    if (!ids.length) return
    let ok = 0, fail = 0
    if (confirmBulk === 'delete') {
      for (const id of ids) {
        try { await deleteM.mutateAsync(id); ok++ } catch { fail++ }
      }
    } else {
      const target = confirmBulk === 'activate'
      for (const id of ids) {
        try { await updateM.mutateAsync({ id, isActive: target }); ok++ } catch { fail++ }
      }
    }
    if (ok)   toast.success(`${ok} layanan diproses`)
    if (fail) toast.error(`${fail} gagal diproses`)
    clearSelection()
  }

  const exportCSV = () => {
    if (!items.length) {
      toast.error('Tidak ada data untuk diekspor')
      return
    }
    const header = ['Nama', 'Kategori', 'Harga', 'Durasi (menit)', 'Status', 'Deskripsi']
    const rows = items.map(s => [
      s.name,
      s.category || '',
      s.price ?? 0,
      s.duration ?? 0,
      s.isActive ? 'Aktif' : 'Nonaktif',
      s.description || '',
    ])
    downloadCSV(`layanan-${new Date().toISOString().slice(0, 10)}.csv`, header, rows)
    toast.success(`Berhasil ekspor ${rows.length} layanan`)
  }

  const resetFilters = () => {
    setSearch(''); setCategory(''); setActiveFilter(''); setSort('recent'); setPage(1)
  }
  const activeFilterCount = (debouncedSearch ? 1 : 0) + (category ? 1 : 0) + (activeFilter ? 1 : 0) + (sort !== 'recent' ? 1 : 0)

  // ── Multi-tenant guard ────────────────────────────────────────────────────
  if (!user?.tenantId) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="p-8 text-center">
          <Package className="w-10 h-10 text-gold/60 mx-auto mb-3" />
          <h2 className="font-display text-xl font-bold text-off-white">Tenant belum dikenali</h2>
          <p className="text-muted text-sm mt-2">Pastikan Anda login sebagai admin tenant.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6 pb-24 sm:pb-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white inline-flex items-center gap-2">
            <Package className="w-5 h-5 text-gold" /> Layanan
          </h1>
          <p className="text-muted text-xs sm:text-sm mt-1">
            {totalItems} layanan
            {category ? ` di "${category}"` : ''}
            {activeFilter === 'true' ? ' · aktif' : activeFilter === 'false' ? ' · nonaktif' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCSV}
            disabled={!items.length}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-dark-card/60 border border-dark-border text-muted text-xs font-medium hover:text-off-white hover:border-gold/40 disabled:opacity-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Ekspor CSV</span>
          </button>
          <Button icon={Plus} onClick={openAdd}>Tambah Layanan</Button>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
        <StatTile icon={Package}     label="Total"        value={stats.total}      accent="gold"  delay={0.02} />
        <StatTile icon={BadgeCheck}  label="Aktif"        value={stats.active}     accent="green" delay={0.04} />
        <StatTile icon={Pause}       label="Nonaktif"     value={stats.inactive}   accent="amber" delay={0.06} />
        <StatTile
          icon={TrendingUp}
          label="Harga Rata2"
          value={formatRupiah(stats.avgPrice)}
          valueShort={formatRupiahShort(stats.avgPrice)}
          accent="blue"
          delay={0.08}
        />
        <StatTile
          icon={Layers}
          label="Kategori"
          value={stats.categories}
          accent="rose"
          hint={`Avg ${stats.avgDuration} mnt`}
          delay={0.1}
        />
      </div>

      {/* ── Search + Filter bar ────────────────────────────────────────────── */}
      <Card className="p-3 sm:p-4 sticky top-0 z-20 backdrop-blur bg-dark-surface/95 border-dark-border">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari nama layanan…"
                className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-10 pr-9 py-2.5 text-sm outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/15"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted hover:text-off-white"
                  aria-label="Hapus pencarian"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/60"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={activeFilter}
              onChange={e => setActiveFilter(e.target.value)}
              className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/60"
            >
              <option value="">Semua Status</option>
              <option value="true">Aktif</option>
              <option value="false">Nonaktif</option>
            </select>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs hover:bg-amber-500/20"
              >
                <X className="w-3.5 h-3.5" /> Reset ({activeFilterCount})
              </button>
            )}
          </div>

          {/* Category chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCategory('')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                category === ''
                  ? 'bg-gold text-dark'
                  : 'bg-dark-card/60 border border-dark-border text-muted hover:text-off-white'
              }`}
            >
              Semua <span className="opacity-70 ml-0.5">({stats.total})</span>
            </button>
            {(categoriesQuery.data || []).map(c => (
              <button
                key={c.category}
                type="button"
                onClick={() => setCategory(c.category)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1 ${
                  category === c.category
                    ? 'bg-gold text-dark'
                    : 'bg-dark-card/60 border border-dark-border text-muted hover:text-off-white'
                }`}
              >
                <Tag className="w-2.5 h-2.5" />
                <span className="truncate max-w-[160px]">{c.category}</span>
                <span className="opacity-70">({c.count})</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Bulk actions bar ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <Card className="p-3 border-gold/30 bg-gold/5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <CheckSquare className="w-4 h-4 text-gold" />
                  <span className="text-off-white font-medium">{selected.size} dipilih</span>
                  <button type="button" onClick={clearSelection} className="text-xs text-muted hover:text-off-white">
                    Batal
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setConfirmBulk('activate')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium hover:bg-emerald-500/20"
                  >
                    <Eye className="w-3.5 h-3.5" /> Aktifkan
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmBulk('deactivate')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium hover:bg-amber-500/20"
                  >
                    <EyeOff className="w-3.5 h-3.5" /> Nonaktifkan
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmBulk('delete')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Hapus
                  </button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Select-all on page ─────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="flex items-center justify-between gap-2 px-1 -my-1">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="inline-flex items-center gap-2 text-xs text-muted hover:text-off-white"
          >
            {allOnPageSelected
              ? <CheckSquare className="w-4 h-4 text-gold" />
              : <Square className="w-4 h-4" />}
            Pilih semua di halaman ini
          </button>
          {(servicesQuery.isFetching) && (
            <span className="text-xs text-muted inline-flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" /> Sinkron…
            </span>
          )}
        </div>
      )}

      {/* ── Grid ───────────────────────────────────────────────────────────── */}
      {servicesQuery.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-dark-card/60 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="text-5xl mb-3">✂️</div>
          <h3 className="font-display text-lg font-semibold text-off-white">
            {activeFilterCount > 0 ? 'Tidak ada layanan cocok dengan filter' : 'Belum ada layanan'}
          </h3>
          <p className="text-muted text-sm mt-1 max-w-md mx-auto">
            {activeFilterCount > 0
              ? 'Coba reset filter atau ubah kata kunci pencarian.'
              : 'Layanan akan dipakai di POS, queue, dan booking publik. Mulai dengan menambahkan satu layanan utama Anda.'}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {activeFilterCount > 0 && (
              <Button variant="outline" onClick={resetFilters}>Reset Filter</Button>
            )}
            <Button icon={Plus} onClick={openAdd}>Tambah Layanan</Button>
          </div>
        </Card>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4"
        >
          <AnimatePresence>
            {items.map(svc => (
              <ServiceCard
                key={svc.id}
                svc={svc}
                selected={selected.has(svc.id)}
                onToggleSelect={toggleSelect}
                onEdit={openEdit}
                onDelete={handleDelete}
                onToggleActive={handleToggleActive}
                busyId={busyId}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(1)}
            className="px-2 py-1.5 rounded-md text-xs text-muted border border-dark-border bg-dark-card/40 disabled:opacity-40 hover:text-off-white"
          >
            «
          </button>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="inline-flex items-center gap-0.5 px-2 py-1.5 rounded-md text-xs text-muted border border-dark-border bg-dark-card/40 disabled:opacity-40 hover:text-off-white"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sebelumnya</span>
          </button>
          <span className="px-3 py-1.5 text-xs text-off-white tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            className="inline-flex items-center gap-0.5 px-2 py-1.5 rounded-md text-xs text-muted border border-dark-border bg-dark-card/40 disabled:opacity-40 hover:text-off-white"
          >
            <span className="hidden sm:inline">Berikutnya</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(totalPages)}
            className="px-2 py-1.5 rounded-md text-xs text-muted border border-dark-border bg-dark-card/40 disabled:opacity-40 hover:text-off-white"
          >
            »
          </button>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <ServiceFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        editService={editService}
        knownCategories={knownCategories}
        onSave={handleSave}
        saving={createM.isPending || updateM.isPending}
      />

      <ConfirmDialog
        isOpen={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={confirmDelete}
        title="Hapus Layanan?"
        description={`Layanan "${confirmDel?.name || ''}" akan dihapus. Transaksi lama tetap utuh, tapi layanan ini tidak akan muncul lagi di POS / booking.`}
        confirmText="Ya, Hapus"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={!!confirmBulk}
        onClose={() => setConfirmBulk(null)}
        onConfirm={runBulk}
        title={
          confirmBulk === 'delete'     ? 'Hapus banyak layanan?' :
          confirmBulk === 'activate'   ? 'Aktifkan banyak layanan?' :
          confirmBulk === 'deactivate' ? 'Nonaktifkan banyak layanan?' :
          'Konfirmasi'
        }
        description={
          confirmBulk === 'delete'
            ? `${selected.size} layanan akan dihapus. Transaksi lama tetap utuh.`
            : `${selected.size} layanan akan ${confirmBulk === 'activate' ? 'diaktifkan' : 'dinonaktifkan'}.`
        }
        confirmText={
          confirmBulk === 'delete' ? 'Ya, Hapus Semua' : 'Ya, Lanjutkan'
        }
        variant={confirmBulk === 'delete' ? 'danger' : 'warning'}
      />

      {servicesQuery.isFetching && !servicesQuery.isLoading && (
        <div className="fixed bottom-20 sm:bottom-6 right-4 z-30 inline-flex items-center gap-2 px-3 py-2 rounded-full bg-dark-card/90 border border-dark-border text-xs text-muted shadow-card backdrop-blur">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Sinkronisasi…
        </div>
      )}
    </div>
  )
}
