// Halaman Pelanggan untuk kasir — versi ringkas dari TACustomersPage.
// Tujuan: kasir bisa memantau pelanggan (pencarian cepat, lihat riwayat,
// atur poin loyalti, tambah/ubah data dasar). TIDAK termasuk: hapus/bulk
// delete, ekspor CSV, segmen analytics kompleks — fitur itu tetap khusus
// admin di /admin/customers.
import React, { useMemo, useState, useEffect } from 'react'
import {
  Search, Plus, Users, Star, Phone, Calendar, X, Award, Edit2, RefreshCw,
  ChevronLeft, ChevronRight, Crown, TrendingUp, Cake, MapPin,
} from 'lucide-react'
import {
  useCustomers, useCustomer, useCustomerStats,
  useCreateCustomer, useUpdateCustomer, useUpdateLoyalty, usePointHistory,
} from '../../hooks/useCustomers.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { formatRupiah, formatDate, formatDateTime } from '../../utils/format.js'
import { formatDistanceToNow } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

const PAGE_SIZE = 20

// Klasifikasi ringkas berdasarkan kunjungan + recency. Cocok untuk badge
// visual; tidak menggantikan analytics admin.
function quickSegment(c) {
  if (!c.visitCount || c.visitCount <= 0) return { id: 'never', label: 'Belum tx', tone: 'muted' }
  if (c.visitCount >= 10) return { id: 'vip', label: 'VIP', tone: 'gold' }
  if (c.lastVisitAt) {
    const days = Math.floor((Date.now() - new Date(c.lastVisitAt).getTime()) / 86_400_000)
    if (days > 180) return { id: 'lost', label: 'Lost', tone: 'danger' }
    if (days > 90)  return { id: 'atRisk', label: 'At-Risk', tone: 'warning' }
  }
  if (c.visitCount >= 3) return { id: 'loyal', label: 'Loyal', tone: 'info' }
  return { id: 'new', label: 'Baru', tone: 'success' }
}

function StatTile({ icon: Icon, label, value, hint, accent = 'gold' }) {
  const colorMap = {
    gold: 'bg-gold/10 text-gold border-gold/20',
    info: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    success: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  }
  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${colorMap[accent]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
          <p className="text-lg font-bold text-off-white tabular-nums truncate">{value}</p>
          {hint && <p className="text-[11px] text-muted truncate">{hint}</p>}
        </div>
      </div>
    </Card>
  )
}

function CustomerRow({ c, onOpen }) {
  const seg = quickSegment(c)
  const lastVisit = c.lastVisitAt
    ? formatDistanceToNow(new Date(c.lastVisitAt), { addSuffix: true, locale: idLocale })
    : 'belum pernah'
  return (
    <button
      onClick={() => onOpen(c.id)}
      className="w-full text-left p-3 rounded-xl bg-dark-card border border-dark-border hover:border-gold/30 transition-colors flex items-center gap-3"
    >
      <div className="shrink-0 w-10 h-10 rounded-full bg-dark-surface border border-dark-border flex items-center justify-center text-sm font-bold text-gold">
        {(c.name || '?').slice(0, 1).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-off-white truncate">{c.name || '—'}</p>
          <Badge variant={seg.tone} size="sm">{seg.label}</Badge>
        </div>
        <p className="text-xs text-muted truncate flex items-center gap-1.5">
          <Phone className="w-3 h-3" />
          {c.phone || '—'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs text-muted">Kunjungan</p>
        <p className="text-sm font-bold text-off-white tabular-nums">{c.visitCount || 0}</p>
      </div>
      <div className="shrink-0 text-right hidden sm:block min-w-[90px]">
        <p className="text-xs text-muted">Poin</p>
        <p className="text-sm font-bold text-gold tabular-nums">{c.loyaltyPoints || 0}</p>
      </div>
      <div className="shrink-0 text-right hidden md:block min-w-[120px]">
        <p className="text-xs text-muted">Kunjungan terakhir</p>
        <p className="text-xs text-off-white truncate">{lastVisit}</p>
      </div>
    </button>
  )
}

// Drawer detail pelanggan + tombol Edit / Atur Poin.
function CustomerDrawer({ customerId, onClose, onEdit, onAdjust }) {
  const { data: c, isLoading } = useCustomer(customerId)
  const { data: history = [] } = usePointHistory(customerId, { limit: 20 })
  if (!customerId) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:w-[420px] h-full bg-dark-bg border-l border-dark-border overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-dark-bg/95 backdrop-blur border-b border-dark-border">
          <h2 className="font-semibold text-off-white">Detail Pelanggan</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-muted hover:text-off-white hover:bg-dark-card" aria-label="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {isLoading || !c ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <div key={i} className="h-14 rounded bg-dark-card animate-pulse" />)}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-dark-card border border-dark-border flex items-center justify-center text-xl font-bold text-gold">
                  {(c.name || '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-off-white truncate">{c.name}</p>
                  <p className="text-xs text-muted truncate flex items-center gap-1.5">
                    <Phone className="w-3 h-3" /> {c.phone || '—'}
                  </p>
                  {c.birthDate && (
                    <p className="text-xs text-muted truncate flex items-center gap-1.5">
                      <Cake className="w-3 h-3" /> {formatDate(c.birthDate)}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Card className="p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted">Kunjungan</p>
                  <p className="text-lg font-bold text-off-white tabular-nums">{c.visitCount || 0}</p>
                </Card>
                <Card className="p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted">Belanja</p>
                  <p className="text-sm font-bold text-off-white tabular-nums">{formatRupiah(c.totalSpend || 0)}</p>
                </Card>
                <Card className="p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted">Poin</p>
                  <p className="text-lg font-bold text-gold tabular-nums">{c.loyaltyPoints || 0}</p>
                </Card>
              </div>

              {(c.address?.kecamatan || c.address?.kabupaten) && (
                <Card className="p-3 flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-gold mt-0.5 shrink-0" />
                  <p className="text-xs text-muted">
                    {[c.address?.detail, c.address?.kelurahan, c.address?.kecamatan, c.address?.kabupaten]
                      .filter(Boolean).join(', ')}
                  </p>
                </Card>
              )}

              <div className="flex gap-2">
                <Button fullWidth variant="outline" icon={Edit2} onClick={() => onEdit(c)}>Edit</Button>
                <Button fullWidth icon={Award} onClick={() => onAdjust(c)}>Atur Poin</Button>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-gold" /> Riwayat Poin
                </p>
                {history.length === 0 ? (
                  <p className="text-xs text-muted text-center py-4">Belum ada riwayat poin.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {history.map((h) => (
                      <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-dark-card border border-dark-border text-xs">
                        <div className="min-w-0">
                          <p className="text-off-white truncate">{h.reason || h.action}</p>
                          <p className="text-muted text-[10px]">{formatDateTime(h.createdAt)}</p>
                        </div>
                        <span className={`font-bold tabular-nums shrink-0 ${h.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {h.delta >= 0 ? '+' : ''}{h.delta}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function FormModal({ open, onClose, editing, onSave, saving }) {
  const empty = { name: '', phone: '', email: '', gender: '', birthDate: '', notes: '' }
  const [form, setForm] = useState(empty)
  useEffect(() => {
    if (!open) return
    setForm(editing
      ? { name: editing.name || '', phone: editing.phone || '', email: editing.email || '',
          gender: editing.gender || '', birthDate: editing.birthDate ? editing.birthDate.slice(0, 10) : '',
          notes: editing.notes || '' }
      : empty)
  }, [open, editing])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const submit = () => {
    if (!form.name.trim()) return
    onSave({
      ...form,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      birthDate: form.birthDate || null,
    })
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={editing ? 'Ubah Pelanggan' : 'Tambah Pelanggan'}>
      <div className="space-y-3">
        <Input label="Nama *" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={120} />
        <Input label="Nomor HP" value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" maxLength={20} placeholder="08xxxxxxxxxx" />
        <Input label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} maxLength={120} />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-muted mb-1.5">Gender</label>
            <select value={form.gender} onChange={(e) => set('gender', e.target.value)}
              className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-off-white outline-none focus:border-gold/60">
              <option value="">—</option>
              <option value="male">Pria</option>
              <option value="female">Wanita</option>
            </select>
          </div>
          <Input label="Lahir" type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1.5">Catatan</label>
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value.slice(0, 300))}
            rows={2}
            className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-sm text-off-white outline-none focus:border-gold/60"
            placeholder="Preferensi potong, alergi, dll" />
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
          <Button fullWidth variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button fullWidth icon={Plus} onClick={submit} loading={saving} disabled={!form.name.trim()}>
            {editing ? 'Simpan' : 'Tambah'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function AdjustPointsModal({ open, onClose, customer, onConfirm, loading }) {
  const [delta, setDelta] = useState(0)
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) { setDelta(0); setReason('') } }, [open])
  const submit = () => {
    if (!delta || !customer) return
    onConfirm({ id: customer.id, points: Number(delta), reason: reason.trim() || (delta > 0 ? 'Penyesuaian +' : 'Penyesuaian -') })
  }
  return (
    <Modal isOpen={open} onClose={onClose} title="Atur Poin Loyalti">
      <div className="space-y-3">
        {customer && (
          <p className="text-sm text-muted">
            Pelanggan: <span className="text-off-white font-medium">{customer.name}</span>
            <span className="ml-2 text-gold tabular-nums">{customer.loyaltyPoints || 0} poin saat ini</span>
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {[-10, -5, 5, 10, 25, 50].map((q) => (
            <button key={q} onClick={() => setDelta((d) => Number(d || 0) + q)}
              className="px-2 py-2 rounded-lg text-xs font-medium border border-dark-border text-muted hover:text-gold hover:border-gold/40 transition-colors">
              {q > 0 ? `+${q}` : q}
            </button>
          ))}
        </div>
        <Input label="Perubahan poin (boleh negatif)" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
        <Input label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} placeholder="mis. Bonus event, koreksi" />
        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
          <Button fullWidth variant="outline" onClick={onClose} disabled={loading}>Batal</Button>
          <Button fullWidth icon={Award} onClick={submit} loading={loading} disabled={!delta}>Simpan</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function KasirCustomersPage() {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [searchDeb, setSearchDeb] = useState('')
  const [page, setPage] = useState(1)
  const [drawerId, setDrawerId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [adjusting, setAdjusting] = useState(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => { setSearchDeb(search.trim()); setPage(1) }, 250)
    return () => clearTimeout(id)
  }, [search])

  const { customers, total, totalPages, isLoading, isFetching, refetch } = useCustomers({
    search: searchDeb || undefined, page, limit: PAGE_SIZE,
  })
  const { data: stats } = useCustomerStats()
  const createMut = useCreateCustomer()
  const updateMut = useUpdateCustomer()
  const loyaltyMut = useUpdateLoyalty()

  const statsTiles = useMemo(() => ([
    { label: 'Total', value: stats?.total ?? total ?? 0, icon: Users, accent: 'gold' },
    { label: 'VIP', value: stats?.vipCount ?? 0, icon: Crown, accent: 'gold', hint: '10+ kunjungan' },
    { label: 'Baru bulan ini', value: stats?.newThisMonth ?? 0, icon: Star, accent: 'info' },
    { label: 'Total poin', value: (stats?.totalPoints ?? 0).toLocaleString('id-ID'), icon: Award, accent: 'success' },
  ]), [stats, total])

  const onSubmitForm = async (data) => {
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, ...data })
        toast.success('Data pelanggan diperbarui.')
      } else {
        await createMut.mutateAsync(data)
        toast.success('Pelanggan baru ditambahkan.')
      }
      setShowForm(false); setEditing(null)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan pelanggan.')
    }
  }

  const onAdjustPoints = async ({ id, points, reason }) => {
    try {
      await loyaltyMut.mutateAsync({ id, points, reason })
      toast.success(`Poin ${points > 0 ? 'ditambahkan' : 'dikurangi'} (${points}).`)
      setAdjusting(null)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal mengatur poin.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white">Pelanggan</h1>
          <p className="text-xs text-muted mt-0.5">Pantau pelanggan, atur poin loyalti, dan lihat riwayat singkat.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} loading={isFetching && !isLoading}
            aria-label="Refresh" />
          <Button size="sm" icon={Plus} onClick={() => { setEditing(null); setShowForm(true) }}>
            <span className="hidden sm:inline">Tambah</span>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {statsTiles.map((s) => <StatTile key={s.label} {...s} />)}
      </div>

      {/* Search */}
      <label className="flex items-center gap-2 bg-dark-surface border border-dark-border rounded-xl px-3 py-2 focus-within:border-gold/60 transition-colors">
        <Search className="w-4 h-4 text-muted shrink-0" />
        <input
          type="text" inputMode="search" role="searchbox"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau nomor HP…"
          className="flex-1 bg-transparent text-sm text-off-white outline-none appearance-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        {search && (
          <button onClick={() => setSearch('')} className="p-1 text-muted hover:text-off-white" aria-label="Bersihkan">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </label>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-dark-card animate-pulse" />)}
        </div>
      ) : customers.length === 0 ? (
        <Card className="p-10 text-center">
          <Users className="w-7 h-7 mx-auto text-muted mb-2" />
          <p className="text-sm text-muted">Belum ada pelanggan{searchDeb ? ' yang cocok' : ''}.</p>
          {!searchDeb && (
            <Button className="mt-3" size="sm" icon={Plus} onClick={() => { setEditing(null); setShowForm(true) }}>
              Tambah pelanggan pertama
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {customers.map((c) => <CustomerRow key={c.id} c={c} onOpen={setDrawerId} />)}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <span className="hidden sm:inline">Sebelumnya</span>
          </Button>
          <span className="text-xs text-muted tabular-nums">Hal {page} / {totalPages}</span>
          <Button variant="outline" size="sm" iconRight={ChevronRight} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            <span className="hidden sm:inline">Berikutnya</span>
          </Button>
        </div>
      )}

      {/* Drawer */}
      {drawerId && (
        <CustomerDrawer
          customerId={drawerId}
          onClose={() => setDrawerId(null)}
          onEdit={(c) => { setEditing(c); setShowForm(true); setDrawerId(null) }}
          onAdjust={(c) => { setAdjusting(c); setDrawerId(null) }}
        />
      )}

      {/* Form modal */}
      <FormModal
        open={showForm}
        editing={editing}
        onClose={() => { setShowForm(false); setEditing(null) }}
        onSave={onSubmitForm}
        saving={createMut.isPending || updateMut.isPending}
      />

      {/* Adjust points modal */}
      <AdjustPointsModal
        open={!!adjusting}
        customer={adjusting}
        onClose={() => setAdjusting(null)}
        onConfirm={onAdjustPoints}
        loading={loyaltyMut.isPending}
      />
    </div>
  )
}
