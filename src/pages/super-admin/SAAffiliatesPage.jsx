import React, { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Users, Plus, Search, Filter, X, RefreshCw, Radio,
  CheckCircle, AlertCircle, ChevronRight, UserPlus,
  TrendingUp, Wallet, Clock, Banknote, ShieldOff, ShieldCheck,
} from 'lucide-react'
import {
  useAffiliates, useAffiliateStats, useCreateAffiliate,
  useApproveAffiliate, useSuspendAffiliate, useReactivateAffiliate, useRejectAffiliate,
} from '../../hooks/useAffiliates.js'
import Card from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Badge from '../../components/ui/Badge.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { formatRupiah, formatRupiahShort } from '../../utils/format.js'

const STATUS_OPTS = [
  { id: 'all',       label: 'Semua status' },
  { id: 'pending',   label: 'Menunggu' },
  { id: 'active',    label: 'Aktif' },
  { id: 'suspended', label: 'Dibekukan' },
  { id: 'rejected',  label: 'Ditolak' },
]

function statusBadge(status) {
  if (status === 'active')    return <Badge variant="success" dot>Aktif</Badge>
  if (status === 'pending')   return <Badge variant="warning" dot>Menunggu</Badge>
  if (status === 'suspended') return <Badge variant="danger" dot>Dibekukan</Badge>
  if (status === 'rejected')  return <Badge variant="muted">Ditolak</Badge>
  return <Badge variant="muted">{status}</Badge>
}

const emptyForm = {
  name: '', email: '', phone: '', password: '',
  commissionRate: 10, // percent UI
  displayName: '', bio: '',
  payoutMethod: '', payoutAccount: '', payoutHolder: '',
  internalNotes: '',
}

export default function SAAffiliatesPage() {
  const toast = useToast()
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch]   = useState('')
  const [debounced, setDebounced] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [form, setForm]       = useState(emptyForm)
  const [confirmAction, setConfirmAction] = useState(null)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const params = useMemo(() => {
    const p = { limit: 50 }
    if (filterStatus !== 'all') p.status = filterStatus
    if (debounced) p.search = debounced
    return p
  }, [filterStatus, debounced])

  const { data: stats, isLoading: statsLoading } = useAffiliateStats()
  const { data: page, isLoading, isFetching, refetch } = useAffiliates(params)
  const create = useCreateAffiliate()
  const approve = useApproveAffiliate()
  const suspend = useSuspendAffiliate()
  const reactivate = useReactivateAffiliate()
  const reject = useRejectAffiliate()

  const items = page?.data || []

  const submit = async () => {
    if (!form.name.trim() || form.name.trim().length < 2) return toast.error('Nama wajib diisi (min 2 karakter)')
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return toast.error('Email tidak valid')
    if (form.password.length < 8) return toast.error('Password minimal 8 karakter')
    if (form.commissionRate < 0 || form.commissionRate > 100) return toast.error('Komisi 0–100%')
    try {
      await create.mutateAsync({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
        commissionRate: Number(form.commissionRate) / 100,
        displayName: form.displayName.trim() || undefined,
        bio: form.bio.trim() || undefined,
        payoutMethod: form.payoutMethod || undefined,
        payoutAccount: form.payoutAccount.trim() || undefined,
        payoutHolder: form.payoutHolder.trim() || undefined,
        internalNotes: form.internalNotes.trim() || undefined,
      })
      toast.success('Affiliate berhasil dibuat')
      setShowNew(false)
      setForm(emptyForm)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal membuat affiliate')
    }
  }

  const run = async (mut, payload, ok, fail) => {
    try { await mut.mutateAsync(payload); toast.success(ok) }
    catch (err) { toast.error(err?.response?.data?.error || fail) }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">Affiliate</h1>
          <p className="text-muted text-sm mt-1">Program rekomendasi mitra: rekrut tenant, dapat komisi tiap pembayaran berhasil.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-400/10 border border-green-400/20 text-[10px] text-green-400 font-medium">
            <Radio size={10} className="animate-pulse" /> Live
          </span>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} loading={isFetching && !isLoading}>
            Muat ulang
          </Button>
          <Button icon={Plus} size="sm" onClick={() => setShowNew(true)}>Tambah Affiliate</Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Mitra"      value={stats?.total ?? '—'}   color="text-brand"      icon={Users}     loading={statsLoading} delay={0} />
        <KpiCard label="Mitra Aktif"      value={stats?.active ?? '—'}  color="text-green-400" icon={ShieldCheck} loading={statsLoading} delay={0.05} />
        <KpiCard label="Menunggu Persetujuan" value={stats?.pending ?? '—'} color="text-amber-400" icon={Clock} loading={statsLoading} delay={0.10} />
        <KpiCard label="Tenant Rujukan"   value={stats?.totalReferrals ?? '—'} color="text-blue-400" icon={UserPlus} loading={statsLoading} delay={0.15} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Komisi Diakui" value={formatRupiahShort(stats?.totalCommission || 0)} color="text-emerald-400" icon={TrendingUp} loading={statsLoading} delay={0} sub={`${stats?.totalCommission ? formatRupiah(stats.totalCommission) : ''}`} />
        <KpiCard label="Belum Dibayar" value={formatRupiahShort(stats?.owedCommission || 0)} color="text-amber-400"   icon={Wallet} loading={statsLoading} delay={0.05} sub={`${stats?.owedCommission ? formatRupiah(stats.owedCommission) : ''}`} />
        <KpiCard label="Permintaan Payout"  value={`${stats?.pendingPayouts?.count || 0} • ${formatRupiahShort(stats?.pendingPayouts?.amount || 0)}`} color="text-purple-400" icon={Banknote} loading={statsLoading} delay={0.10} sub="Menunggu diproses" />
      </div>

      {/* Filter */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={13} className="text-muted flex-shrink-0" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40">
            {STATUS_OPTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari kode, nama, email…"
              aria-label="Cari affiliate"
              className="w-full bg-dark-surface border border-dark-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-off-white placeholder:text-muted focus:outline-none focus:border-brand/40"
            />
          </div>
          {(filterStatus !== 'all' || debounced) && (
            <button onClick={() => { setFilterStatus('all'); setSearch('') }} className="flex items-center gap-1 text-xs text-muted hover:text-off-white">
              <X size={12} /> Reset
            </button>
          )}
        </div>
      </Card>

      {/* List */}
      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-32 bg-dark-card rounded-2xl animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center text-muted">
          <Users size={32} className="mx-auto mb-3 opacity-30" />
          <p>{filterStatus !== 'all' || debounced ? 'Tidak ada affiliate yang cocok dengan filter.' : 'Belum ada affiliate. Klik "Tambah Affiliate" untuk mulai.'}</p>
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid md:grid-cols-2 gap-4">
          {items.map(a => (
            <Card key={a.id} className="p-4 hover:border-brand/30 transition-colors">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-mono text-base font-bold text-brand">{a.referralCode}</p>
                    {statusBadge(a.status)}
                    <span className="text-[10px] text-muted">{Math.round(a.commissionRate * 100)}% komisi</span>
                  </div>
                  <p className="text-sm text-off-white truncate">{a.displayName || a.user.name}</p>
                  <p className="text-xs text-muted truncate">{a.user.email}{a.user.phone ? ` · ${a.user.phone}` : ''}</p>
                </div>
                <Link to={`/super-admin/affiliates/${a.id}`} className="p-1.5 rounded-lg text-muted hover:text-off-white hover:bg-dark-surface" aria-label="Lihat detail">
                  <ChevronRight size={16} />
                </Link>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <Stat label="Tenant" value={a._count.referrals} />
                <Stat label="Komisi" value={formatRupiahShort(a.totalEarned)} small />
                <Stat label="Dibayar" value={formatRupiahShort(a.totalPaid)} small />
              </div>

              <div className="flex gap-2 flex-wrap">
                {a.status === 'pending' && (
                  <>
                    <Button size="xs" variant="primary" icon={CheckCircle}
                      loading={approve.isPending}
                      onClick={() => run(approve, { id: a.id }, 'Affiliate disetujui', 'Gagal menyetujui')}>
                      Setujui
                    </Button>
                    <Button size="xs" variant="ghost" icon={X}
                      onClick={() => setConfirmAction({
                        title: `Tolak ${a.referralCode}?`,
                        description: 'Affiliate tidak akan bisa login & link rujukannya nonaktif.',
                        run: () => run(reject, { id: a.id }, 'Affiliate ditolak', 'Gagal menolak'),
                      })}
                    >Tolak</Button>
                  </>
                )}
                {a.status === 'active' && (
                  <Button size="xs" variant="ghost" icon={ShieldOff}
                    onClick={() => setConfirmAction({
                      title: `Bekukan ${a.referralCode}?`,
                      description: 'Komisi baru tidak akan tercatat selama affiliate dibekukan.',
                      run: () => run(suspend, { id: a.id }, 'Affiliate dibekukan', 'Gagal membekukan'),
                    })}
                  >Bekukan</Button>
                )}
                {(a.status === 'suspended' || a.status === 'rejected') && (
                  <Button size="xs" variant="primary" icon={ShieldCheck}
                    loading={reactivate.isPending}
                    onClick={() => run(reactivate, { id: a.id }, 'Affiliate diaktifkan', 'Gagal mengaktifkan')}>
                    Aktifkan
                  </Button>
                )}
                <Link to={`/super-admin/affiliates/${a.id}`}
                  className="text-xs px-2.5 py-1 rounded-md border border-dark-border text-muted hover:text-off-white hover:border-brand/30 ml-auto">
                  Detail →
                </Link>
              </div>
            </Card>
          ))}
        </motion.div>
      )}

      {/* New modal */}
      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="Buat Affiliate Baru" size="lg">
        <div className="space-y-4">
          <p className="text-xs text-muted">
            Kode rujukan dibuat otomatis. Akun ini akan langsung aktif kecuali Anda pilih status lain.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <Input label="Nama lengkap *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Mis. Ridwan Pratama" />
            <Input label="Email login *"  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@partner.com" />
            <Input label="HP / WhatsApp"   value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="08xxxxxxxxxx" />
            <Input label="Password awal *" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 8 karakter" />
            <Input label="Komisi (%)" type="number" value={form.commissionRate} onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))} />
            <Input label="Nama publik (opsional)" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Tampil di halaman /register" />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1.5">Bio singkat (opsional)</label>
            <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              rows={2} maxLength={500}
              className="w-full bg-dark-surface border border-dark-border rounded-xl p-3 text-sm text-off-white placeholder:text-muted focus:outline-none focus:border-brand/40" />
          </div>
          <div className="border-t border-dark-border pt-3">
            <p className="text-xs text-muted mb-2">Metode pencairan (boleh kosong, affiliate isi sendiri)</p>
            <div className="grid md:grid-cols-3 gap-3">
              <select value={form.payoutMethod} onChange={e => setForm(f => ({ ...f, payoutMethod: e.target.value }))}
                className="bg-dark-surface border border-dark-border rounded-xl px-3 py-2 text-sm text-off-white">
                <option value="">— Pilih metode —</option>
                <option value="bank_transfer">Transfer Bank</option>
                <option value="gopay">GoPay</option>
                <option value="ovo">OVO</option>
                <option value="dana">DANA</option>
              </select>
              <Input label="" value={form.payoutAccount} onChange={e => setForm(f => ({ ...f, payoutAccount: e.target.value }))} placeholder="No. rekening / akun" />
              <Input label="" value={form.payoutHolder} onChange={e => setForm(f => ({ ...f, payoutHolder: e.target.value }))} placeholder="Nama pemilik" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1.5">Catatan internal (tidak ditampilkan ke affiliate)</label>
            <textarea value={form.internalNotes} onChange={e => setForm(f => ({ ...f, internalNotes: e.target.value }))}
              rows={2} maxLength={2000}
              className="w-full bg-dark-surface border border-dark-border rounded-xl p-3 text-sm text-off-white placeholder:text-muted focus:outline-none focus:border-brand/40" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" fullWidth onClick={() => setShowNew(false)}>Batal</Button>
            <Button fullWidth icon={CheckCircle} loading={create.isPending} onClick={submit}>Buat Affiliate</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => { await confirmAction.run(); setConfirmAction(null) }}
        title={confirmAction?.title}
        description={confirmAction?.description}
        confirmText="Ya"
        cancelText="Batal"
        variant="danger"
      />
    </div>
  )
}

function Stat({ label, value, small }) {
  return (
    <div className="bg-dark-surface rounded-lg p-2 text-center">
      <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
      <p className={`tabular-nums font-semibold text-off-white ${small ? 'text-xs' : 'text-sm'}`}>{value}</p>
    </div>
  )
}

function KpiCard({ label, value, color, icon: Icon, sub, loading, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted leading-tight">{label}</p>
          <Icon size={15} className={color} />
        </div>
        {loading ? (
          <div className="h-7 w-24 bg-dark-surface animate-pulse rounded" />
        ) : (
          <>
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value ?? '—'}</p>
            {sub && <p className="text-[10px] text-muted mt-1 truncate">{sub}</p>}
          </>
        )}
      </Card>
    </motion.div>
  )
}
