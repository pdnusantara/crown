import React, { useState, useRef, useMemo } from 'react'
import { Search, Plus, Star, Edit2, Trash2, MapPin, Users, X } from 'lucide-react'
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from '../../hooks/useCustomers.js'
import { useToast } from '../../components/ui/Toast.jsx'
import { useUrlState } from '../../hooks/useUrlState.js'
import { useVirtualizer } from '@tanstack/react-virtual'
import { WilayahSelect } from '../../components/WilayahSelect.jsx'
import Card from '../../components/ui/Card.jsx'
import Badge, { getSegmentBadge } from '../../components/ui/Badge.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import { formatDate } from '../../utils/format.js'

const EMPTY_ADDRESS = {
  provinsiId: '', provinsi: '',
  kabupatenId: '', kabupaten: '',
  kecamatanId: '', kecamatan: '',
  kelurahanId: '', kelurahan: '',
  detail: '',
}
const EMPTY_FORM = {
  name: '', phone: '', email: '', gender: '', birthDate: '', notes: '',
  address: { ...EMPTY_ADDRESS },
}

function getSegment(visitCount = 0) {
  if (visitCount >= 10) return 'VIP'
  if (visitCount >= 3) return 'Regular'
  return 'New'
}

function GenderPill({ gender }) {
  if (gender === 'L') return <span className="text-blue-400 text-xs font-medium">L</span>
  if (gender === 'P') return <span className="text-pink-400 text-xs font-medium">P</span>
  return null
}

// ─── Mobile card ─────────────────────────────────────────────────────────────
function CustomerMobileCard({ customer, onEdit, onDelete }) {
  const segment = getSegment(customer.visitCount)
  const province = customer.address?.provinsi

  return (
    <div className="px-4 py-3.5 border-b border-dark-border/40 last:border-0 transition-colors active:bg-dark-surface/30">
      <div className="flex items-start gap-3">
        <Avatar name={customer.name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-off-white text-sm leading-tight truncate">{customer.name}</p>
              <p className="text-xs text-muted mt-0.5">{customer.phone}</p>
            </div>
            {/* Always-visible action buttons on mobile */}
            <div className="flex gap-1.5 flex-shrink-0">
              <button
                onClick={() => onEdit(customer)}
                className="p-2 rounded-xl bg-dark-surface border border-dark-border text-muted hover:text-gold hover:border-gold/30 transition-colors touch-manipulation"
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={() => onDelete(customer.id)}
                className="p-2 rounded-xl bg-dark-surface border border-dark-border text-muted hover:text-red-400 hover:border-red-500/30 transition-colors touch-manipulation"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          {/* Tags row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant={getSegmentBadge(segment)}>{segment}</Badge>
            <span className="flex items-center gap-1 text-xs">
              <Star size={11} className="text-gold" />
              <span className="text-gold font-semibold">{customer.loyaltyPoints}</span>
            </span>
            <span className="text-xs text-muted">{customer.visitCount}x</span>
            <GenderPill gender={customer.gender} />
            {province && (
              <span className="flex items-center gap-1 text-xs text-muted/60">
                <MapPin size={9} />
                {province}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Desktop table row ────────────────────────────────────────────────────────
function CustomerTableRow({ customer, onEdit, onDelete }) {
  const segment = getSegment(customer.visitCount)
  const province = customer.address?.provinsi

  return (
    <div className="flex items-center px-4 border-b border-dark-border/40 hover:bg-dark-surface/40 transition-colors group h-full">
      {/* Name + phone + province */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Avatar name={customer.name} size="sm" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="font-medium text-off-white text-sm truncate">{customer.name}</p>
            {province && (
              <span className="hidden xl:flex items-center gap-0.5 text-xs text-muted/50 flex-shrink-0">
                <MapPin size={9} />{province}
              </span>
            )}
          </div>
          <p className="text-xs text-muted leading-tight">{customer.phone}</p>
        </div>
      </div>
      {/* Gender — xl only */}
      <div className="hidden xl:flex w-10 flex-shrink-0 justify-center">
        <GenderPill gender={customer.gender} />
      </div>
      {/* Segment */}
      <div className="w-[88px] flex-shrink-0">
        <Badge variant={getSegmentBadge(segment)}>{segment}</Badge>
      </div>
      {/* Visits — lg only */}
      <div className="hidden lg:block w-20 text-center flex-shrink-0 text-sm text-off-white">
        {customer.visitCount}x
      </div>
      {/* Points */}
      <div className="w-20 flex-shrink-0 flex items-center justify-center gap-1">
        <Star className="w-3 h-3 text-gold flex-shrink-0" />
        <span className="text-gold text-sm font-semibold">{customer.loyaltyPoints}</span>
      </div>
      {/* Date — lg only */}
      <div className="hidden lg:block w-24 flex-shrink-0 text-right text-xs text-muted">
        {formatDate(customer.createdAt)}
      </div>
      {/* Actions — show on hover */}
      <div className="w-[72px] flex-shrink-0 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(customer)}
          className="p-1.5 rounded-lg hover:bg-dark-border text-muted hover:text-gold transition-colors"
        >
          <Edit2 size={13} />
        </button>
        <button
          onClick={() => onDelete(customer.id)}
          className="p-1.5 rounded-lg hover:bg-dark-border text-muted hover:text-red-400 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ hasFilters }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-2xl bg-dark-surface border border-dark-border flex items-center justify-center mb-3">
        <Users size={22} className="text-muted" />
      </div>
      <p className="text-off-white text-sm font-medium mb-1">
        {hasFilters ? 'Tidak ada hasil' : 'Belum ada pelanggan'}
      </p>
      <p className="text-muted text-xs">
        {hasFilters ? 'Coba ubah atau hapus filter.' : 'Tambahkan pelanggan pertama Anda.'}
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function TACustomersPage() {
  const toast = useToast()
  const [search, setSearch]                   = useUrlState('q', '')
  const [segFilter, setSegFilter]             = useUrlState('seg', '')
  const [provinsiFilter, setProvinsiFilter]   = useUrlState('prov', '')
  const [sortKey, setSortKey]                 = useUrlState('sort', 'name')
  const [showModal, setShowModal]             = useState(false)
  const [editingId, setEditingId]             = useState(null)
  const [form, setForm]                       = useState(EMPTY_FORM)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const parentRef = useRef(null)

  const { data: allCustomers = [], isLoading } = useCustomers({ limit: 1000 })
  const createCustomer = useCreateCustomer()
  const updateCustomer = useUpdateCustomer()
  const deleteCustomer = useDeleteCustomer()

  const availableProvinces = useMemo(() => (
    [...new Set(allCustomers.filter(c => c.address?.provinsi).map(c => c.address.provinsi))].sort()
  ), [allCustomers])

  const filtered = useMemo(() => {
    return allCustomers
      .filter(c => {
        const q = search.toLowerCase()
        const matchSearch = !search
          || c.name.toLowerCase().includes(q)
          || c.phone.includes(search)
          || (c.email || '').toLowerCase().includes(q)
        const matchSeg  = !segFilter      || getSegment(c.visitCount) === segFilter
        const matchProv = !provinsiFilter || c.address?.provinsi === provinsiFilter
        return matchSearch && matchSeg && matchProv
      })
      .sort((a, b) => {
        if (sortKey === 'visits') return (b.visitCount    || 0) - (a.visitCount    || 0)
        if (sortKey === 'points') return (b.loyaltyPoints || 0) - (a.loyaltyPoints || 0)
        if (sortKey === 'newest') return new Date(b.createdAt) - new Date(a.createdAt)
        return (a.name || '').localeCompare(b.name || '')
      })
  }, [allCustomers, search, segFilter, provinsiFilter, sortKey])

  const stats = useMemo(() => ({
    total:   allCustomers.length,
    vip:     allCustomers.filter(c => c.visitCount >= 10).length,
    regular: allCustomers.filter(c => c.visitCount >= 3 && c.visitCount < 10).length,
    new:     allCustomers.filter(c => c.visitCount < 3).length,
  }), [allCustomers])

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 6,
  })

  const hasFilters = !!(search || segFilter || provinsiFilter)

  function clearFilters() {
    setSearch('')
    setSegFilter('')
    setProvinsiFilter('')
  }

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  function openEdit(customer) {
    setEditingId(customer.id)
    setForm({
      name:      customer.name      || '',
      phone:     customer.phone     || '',
      email:     customer.email     || '',
      gender:    customer.gender    || '',
      birthDate: customer.birthDate ? customer.birthDate.split('T')[0] : '',
      notes:     customer.notes     || '',
      address:   customer.address   || { ...EMPTY_ADDRESS },
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('Nama dan nomor telepon wajib diisi')
      return
    }
    try {
      const payload = {
        ...form,
        birthDate: form.birthDate || undefined,
        email:     form.email     || undefined,
        gender:    form.gender    || undefined,
        notes:     form.notes     || undefined,
      }
      if (editingId) {
        await updateCustomer.mutateAsync({ id: editingId, ...payload })
        toast.success('Data pelanggan diperbarui')
      } else {
        await createCustomer.mutateAsync(payload)
        toast.success('Pelanggan baru ditambahkan')
      }
      setShowModal(false)
    } catch {
      toast.error(editingId ? 'Gagal memperbarui' : 'Gagal menambah pelanggan')
    }
  }

  async function handleDelete() {
    try {
      await deleteCustomer.mutateAsync(confirmDeleteId)
      toast.success('Pelanggan dihapus')
      setConfirmDeleteId(null)
    } catch {
      toast.error('Gagal menghapus pelanggan')
    }
  }

  const isSaving = createCustomer.isPending || updateCustomer.isPending

  // ── Segment stat cards (clickable to filter) ────────────────────────────────
  const statCards = [
    { label: 'Total',   value: stats.total,   color: 'text-off-white', filter: null },
    { label: 'VIP',     value: stats.vip,     color: 'text-gold',      sub: '≥10×',  filter: 'VIP' },
    { label: 'Regular', value: stats.regular, color: 'text-blue-400',  sub: '3–9×',  filter: 'Regular' },
    { label: 'Baru',    value: stats.new,     color: 'text-green-400', sub: '<3×',   filter: 'New' },
  ]

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">Pelanggan</h1>
          <p className="text-muted text-sm mt-0.5">
            {allCustomers.length} pelanggan terdaftar
          </p>
        </div>
        <Button icon={Plus} onClick={openAdd} className="flex-shrink-0">
          <span className="hidden sm:inline">Tambah&nbsp;</span>Pelanggan
        </Button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map(s => (
          <Card
            key={s.label}
            onClick={() => s.filter && setSegFilter(f => f === s.filter ? '' : s.filter)}
            className={`p-4 text-center select-none transition-all ${
              s.filter ? 'cursor-pointer hover:border-dark-border/80' : ''
            } ${
              s.filter && segFilter === s.filter
                ? 'border-gold/40 bg-dark-surface shadow-gold'
                : ''
            }`}
          >
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-muted text-sm font-medium">{s.label}</p>
            {s.sub && <p className="text-muted/50 text-xs mt-0.5">{s.sub}</p>}
          </Card>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="space-y-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama, telepon, email…"
            className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-10 pr-10 py-2.5 text-sm outline-none focus:border-gold/60"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-off-white transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Dropdowns row */}
        <div className="flex gap-2 flex-wrap">
          {availableProvinces.length > 0 && (
            <select
              value={provinsiFilter}
              onChange={e => setProvinsiFilter(e.target.value)}
              className="flex-1 min-w-[130px] bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/60 appearance-none cursor-pointer"
            >
              <option value="">Semua Provinsi</option>
              {availableProvinces.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <select
            value={segFilter}
            onChange={e => setSegFilter(e.target.value)}
            className="flex-1 min-w-[110px] bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/60 appearance-none cursor-pointer"
          >
            <option value="">Semua Segmen</option>
            <option value="VIP">VIP</option>
            <option value="Regular">Regular</option>
            <option value="New">Baru</option>
          </select>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
            className="flex-1 min-w-[130px] bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/60 appearance-none cursor-pointer"
          >
            <option value="name">Nama A–Z</option>
            <option value="visits">Kunjungan Terbanyak</option>
            <option value="points">Poin Terbanyak</option>
            <option value="newest">Terbaru</option>
          </select>
        </div>

        {/* Filter result info */}
        {hasFilters && (
          <div className="flex items-center justify-between text-xs px-0.5">
            <span className="text-muted">
              Menampilkan <span className="text-off-white font-medium">{filtered.length}</span> dari {allCustomers.length} pelanggan
            </span>
            <button
              onClick={clearFilters}
              className="text-gold hover:text-gold-light transition-colors font-medium"
            >
              Hapus filter
            </button>
          </div>
        )}
      </div>

      {/* ── Loading skeleton ── */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-dark-card animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Mobile card list (< md) ── */}
      {!isLoading && (
        <div className="block md:hidden">
          <Card className="overflow-hidden">
            {filtered.length === 0
              ? <EmptyState hasFilters={hasFilters} />
              : filtered.map(c => (
                  <CustomerMobileCard
                    key={c.id}
                    customer={c}
                    onEdit={openEdit}
                    onDelete={setConfirmDeleteId}
                  />
                ))
            }
          </Card>
        </div>
      )}

      {/* ── Desktop virtual-scroll table (≥ md) ── */}
      {!isLoading && (
        <div className="hidden md:block">
          <Card className="overflow-hidden">
            {/* Table header */}
            <div className="flex items-center px-4 py-3 border-b border-dark-border bg-dark-surface/60 text-xs font-semibold text-muted uppercase tracking-wider">
              <div className="flex-1 min-w-0">Pelanggan</div>
              <div className="hidden xl:block w-10 text-center flex-shrink-0">L/P</div>
              <div className="w-[88px] flex-shrink-0">Segmen</div>
              <div className="hidden lg:block w-20 text-center flex-shrink-0">Kunjungan</div>
              <div className="w-20 text-center flex-shrink-0">Poin</div>
              <div className="hidden lg:block w-24 text-right flex-shrink-0">Bergabung</div>
              <div className="w-[72px] flex-shrink-0" />
            </div>

            {filtered.length === 0
              ? <EmptyState hasFilters={hasFilters} />
              : (
                <div ref={parentRef} className="overflow-auto" style={{ height: '520px' }}>
                  <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                    {rowVirtualizer.getVirtualItems().map(vr => (
                      <div
                        key={vr.index}
                        style={{ position: 'absolute', top: vr.start, left: 0, right: 0, height: `${vr.size}px` }}
                      >
                        <CustomerTableRow
                          customer={filtered[vr.index]}
                          onEdit={openEdit}
                          onDelete={setConfirmDeleteId}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )
            }
          </Card>
        </div>
      )}

      {/* ── Add / Edit modal ── */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Edit Pelanggan' : 'Tambah Pelanggan'}
        size="lg"
      >
        <div className="space-y-5">
          {/* Info dasar */}
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Info Dasar</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Nama *"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nama lengkap"
              />
              <Input
                label="No. Telepon *"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="08xxxxxxxxxx"
              />
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@contoh.com"
              />
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">Jenis Kelamin</label>
                <select
                  value={form.gender}
                  onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                  className="w-full appearance-none bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60 cursor-pointer"
                >
                  <option value="">Tidak diisi</option>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
              </div>
              <div className="sm:col-span-2 sm:max-w-[50%]">
                <Input
                  label="Tanggal Lahir"
                  type="date"
                  value={form.birthDate}
                  onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Alamat */}
          <div className="border-t border-dark-border pt-5">
            <WilayahSelect
              value={form.address}
              onChange={address => setForm(f => ({ ...f, address }))}
            />
          </div>

          {/* Catatan */}
          <div className="border-t border-dark-border pt-5">
            <Input
              label="Catatan"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Info tambahan tentang pelanggan (opsional)"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" fullWidth onClick={() => setShowModal(false)}>
              Batal
            </Button>
            <Button fullWidth onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Menyimpan…' : (editingId ? 'Simpan Perubahan' : 'Tambah Pelanggan')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete confirmation ── */}
      {confirmDeleteId && (
        <Modal
          isOpen={!!confirmDeleteId}
          onClose={() => setConfirmDeleteId(null)}
          title="Hapus Pelanggan"
          size="sm"
        >
          <div className="space-y-5">
            <p className="text-muted text-sm leading-relaxed">
              Yakin ingin menghapus pelanggan ini? Data yang sudah dihapus tidak dapat dipulihkan.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" fullWidth onClick={() => setConfirmDeleteId(null)}>
                Batal
              </Button>
              <button
                onClick={handleDelete}
                disabled={deleteCustomer.isPending}
                className="flex-1 py-2.5 px-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {deleteCustomer.isPending ? 'Menghapus…' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
