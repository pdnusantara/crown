import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Search, Filter, Users, Download, Plus, Info, Clock, Trash2,
  Building2, CheckCircle2, XCircle,
} from 'lucide-react'
import { useAffiliateSelfReferrals, useClaimReferral, useCancelClaim } from '../../hooks/useAffiliates.js'
import Card from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Modal from '../../components/ui/Modal.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { formatRupiah } from '../../utils/format.js'
import { PLATFORM_DOMAIN } from '../../utils/platform.js'

// Badge status rujukan (lifecycle baris) — pakai varian Badge yg punya override light-mode.
function refStatusBadge(status) {
  if (status === 'active')   return <Badge variant="success" dot>Aktif</Badge>
  if (status === 'pending')  return <Badge variant="warning" dot>Menunggu</Badge>
  if (status === 'rejected') return <Badge variant="danger">Ditolak</Badge>
  if (status === 'churned')  return <Badge variant="muted">Berhenti</Badge>
  return <Badge variant="muted">{status || '—'}</Badge>
}

function subBadge(s) {
  if (s === 'active')  return <Badge variant="success">{s}</Badge>
  if (s === 'trial')   return <Badge variant="info">{s}</Badge>
  if (s === 'expired' || s === 'overdue') return <Badge variant="danger">{s}</Badge>
  return <Badge variant="muted">{s || '—'}</Badge>
}

export default function AffiliateReferralsPage() {
  const toast = useToast()
  const { data = [], isLoading } = useAffiliateSelfReferrals()
  const claim = useClaimReferral()
  const cancelClaim = useCancelClaim()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [claimOpen, setClaimOpen] = useState(false)
  const [subdomain, setSubdomain] = useState('')
  const [note, setNote] = useState('')
  const [cancelTarget, setCancelTarget] = useState(null)

  const counts = useMemo(() => ({
    total:   data.length,
    active:  data.filter(r => r.status === 'active').length,
    pending: data.filter(r => r.status === 'pending').length,
  }), [data])

  const totalCommission = data.reduce((s, r) => s + (r.totalCommission || 0), 0)

  const filtered = useMemo(() => {
    return data.filter(r => {
      if (status !== 'all' && r.status !== status) return false
      if (!search) return true
      const q = search.toLowerCase()
      return (r.tenant?.name || '').toLowerCase().includes(q) ||
             (r.tenant?.slug || '').toLowerCase().includes(q)
    })
  }, [data, search, status])

  const submitClaim = async () => {
    try {
      await claim.mutateAsync({ subdomain: subdomain.trim(), note: note.trim() || undefined })
      toast.success('Klaim dikirim. Tim kami akan meninjau sebelum komisi dihitung.')
      setClaimOpen(false); setSubdomain(''); setNote('')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Gagal mengirim klaim')
    }
  }

  const doCancel = async () => {
    try {
      await cancelClaim.mutateAsync(cancelTarget.id)
      toast.success('Klaim dibatalkan')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Gagal membatalkan')
    }
  }

  const exportCsv = () => {
    const rows = [
      ['Tenant', 'Slug', 'Sumber', 'Status Rujukan', 'Paket', 'Status Langganan', 'Bergabung', 'Total Komisi'],
      ...filtered.map(r => [
        r.tenant?.name || '', r.tenant?.slug || '',
        r.source === 'manual' ? 'Klaim manual' : 'Link',
        r.status || '',
        r.tenant?.subscription?.package || '', r.tenant?.subscription?.status || '',
        new Date(r.createdAt).toISOString().slice(0, 10),
        r.totalCommission || 0,
      ]),
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `referrals-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">Tenant Rujukan</h1>
          <p className="text-muted text-sm mt-1">{counts.total} tenant · {formatRupiah(totalCommission)} total komisi.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} disabled={!filtered.length}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dark-border text-xs text-muted hover:text-off-white disabled:opacity-40">
            <Download size={12} /> Ekspor CSV
          </button>
          <Button size="sm" icon={Plus} onClick={() => setClaimOpen(true)}>Klaim Tenant</Button>
        </div>
      </div>

      {/* KPI ringkas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Total Rujukan" value={counts.total} icon={Building2} color="text-brand" />
        <KpiTile label="Aktif" value={counts.active} icon={CheckCircle2} color="text-emerald-400" />
        <KpiTile label="Menunggu Klaim" value={counts.pending} icon={Clock} color="text-amber-400" />
        <KpiTile label="Total Komisi" value={formatRupiah(totalCommission)} icon={Users} color="text-blue-400" small />
      </div>

      {/* Info klaim manual */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-brand/10 border border-brand/30 text-xs text-off-white">
        <Info size={14} className="text-brand mt-0.5 flex-shrink-0" />
        <span>
          Ada tenant yang Anda ajak tapi lupa pakai link rujukan Anda? Klik <b>Klaim Tenant</b> dan masukkan
          subdomain tokonya. Klaim ditinjau tim kami dulu — komisi mulai dihitung setelah <b>disetujui</b>.
        </span>
      </div>

      {/* Filter */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={13} className="text-muted" />
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-brand/40">
            <option value="all">Semua status</option>
            <option value="active">Aktif</option>
            <option value="pending">Menunggu</option>
            <option value="rejected">Ditolak</option>
            <option value="churned">Berhenti</option>
          </select>
          <div className="relative flex-1 min-w-[160px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama / subdomain"
              className="w-full bg-dark-surface border border-dark-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-off-white placeholder-muted focus:outline-none focus:border-brand/40" />
          </div>
        </div>
      </Card>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-dark-card animate-pulse rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted">
          <Users size={32} className="mx-auto mb-3 opacity-30" />
          <p>{data.length === 0 ? 'Belum ada tenant rujukan.' : 'Tidak ada tenant cocok dengan filter.'}</p>
          {data.length === 0 && <p className="text-xs mt-1">Bagikan link rujukan atau klaim tenant yang sudah Anda ajak.</p>}
        </Card>
      ) : (
        <>
          {/* Desktop: tabel */}
          <Card className="overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-dark-surface text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Tenant</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Paket</th>
                    <th className="px-4 py-2 text-left font-medium">Langganan</th>
                    <th className="px-4 py-2 text-right font-medium">Total Komisi</th>
                    <th className="px-4 py-2 text-left font-medium">Bergabung</th>
                    <th className="px-4 py-2 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border">
                  {filtered.map(r => (
                    <tr key={r.id} className="hover:bg-dark-surface/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="text-off-white font-medium">{r.tenant?.name || '—'}</p>
                          {r.source === 'manual' && <Badge variant="gold">Klaim</Badge>}
                        </div>
                        <p className="text-xs text-muted">{r.tenant?.slug}.{PLATFORM_DOMAIN}</p>
                        {r.status === 'rejected' && r.reviewNote && (
                          <p className="text-[11px] text-red-400 mt-0.5">Ditolak: {r.reviewNote}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">{refStatusBadge(r.status)}</td>
                      <td className="px-4 py-3 text-off-white">{r.tenant?.subscription?.package || '—'}</td>
                      <td className="px-4 py-3">{subBadge(r.tenant?.subscription?.status)}</td>
                      <td className="px-4 py-3 text-right text-brand tabular-nums">{formatRupiah(r.totalCommission)}</td>
                      <td className="px-4 py-3 text-xs text-muted">{new Date(r.createdAt).toLocaleDateString('id-ID')}</td>
                      <td className="px-4 py-3 text-right">
                        {r.source === 'manual' && (r.status === 'pending' || r.status === 'rejected') ? (
                          <button onClick={() => setCancelTarget(r)}
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20">
                            <Trash2 size={11} /> Batalkan
                          </button>
                        ) : <span className="text-muted text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile: kartu */}
          <div className="md:hidden space-y-2">
            {filtered.map(r => (
              <Card key={r.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-off-white font-medium truncate">{r.tenant?.name || '—'}</p>
                      {r.source === 'manual' && <Badge variant="gold">Klaim</Badge>}
                    </div>
                    <p className="text-xs text-muted truncate">{r.tenant?.slug}.{PLATFORM_DOMAIN}</p>
                  </div>
                  {refStatusBadge(r.status)}
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-dark-border text-xs">
                  <span className="text-muted">{r.tenant?.subscription?.package || '—'}</span>
                  {subBadge(r.tenant?.subscription?.status)}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-muted">{new Date(r.createdAt).toLocaleDateString('id-ID')}</span>
                  <span className="text-brand tabular-nums text-sm font-semibold">{formatRupiah(r.totalCommission)}</span>
                </div>
                {r.status === 'rejected' && r.reviewNote && (
                  <p className="text-[11px] text-red-400 mt-2">Ditolak: {r.reviewNote}</p>
                )}
                {r.source === 'manual' && (r.status === 'pending' || r.status === 'rejected') && (
                  <button onClick={() => setCancelTarget(r)}
                    className="mt-2 w-full inline-flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
                    <Trash2 size={12} /> Batalkan klaim
                  </button>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Modal klaim */}
      <Modal isOpen={claimOpen} onClose={() => setClaimOpen(false)} title="Klaim tenant rujukan" size="md">
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Masukkan subdomain toko yang Anda ajak (mis. <span className="text-off-white font-mono">budibarber</span> dari
            <span className="text-off-white font-mono"> budibarber.{PLATFORM_DOMAIN}</span>). Klaim akan ditinjau tim kami;
            komisi mulai dihitung setelah disetujui.
          </p>
          <div>
            <label className="text-xs text-muted block mb-1.5">Subdomain tenant</label>
            <div className="flex items-center bg-dark-surface border border-dark-border rounded-xl overflow-hidden focus-within:border-brand/40">
              <input value={subdomain} onChange={e => setSubdomain(e.target.value)} autoFocus
                placeholder="budibarber"
                className="flex-1 bg-transparent px-3 py-2 text-sm text-off-white placeholder-muted focus:outline-none" />
              <span className="px-3 text-xs text-muted border-l border-dark-border py-2">.{PLATFORM_DOMAIN}</span>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1.5">Alasan / bukti (opsional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={500}
              className="w-full bg-dark-surface border border-dark-border rounded-xl p-3 text-sm text-off-white placeholder-muted focus:outline-none focus:border-brand/40"
              placeholder="Mis. saya yang ajak via WhatsApp, sempat demo langsung di tokonya." />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" fullWidth onClick={() => setClaimOpen(false)}>Batal</Button>
            <Button fullWidth loading={claim.isPending} disabled={subdomain.trim().length < 2} onClick={submitClaim}>
              Kirim Klaim
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={async () => { await doCancel(); setCancelTarget(null) }}
        title="Batalkan klaim?"
        description={`Klaim atas "${cancelTarget?.tenant?.name || cancelTarget?.tenant?.slug}" akan dihapus.`}
        confirmText="Ya, batalkan"
        cancelText="Tidak"
        variant="danger"
      />
    </div>
  )
}

function KpiTile({ label, value, icon: Icon, color, small }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted leading-tight">{label}</p>
          <Icon size={15} className={color} />
        </div>
        <p className={`${small ? 'text-base' : 'text-2xl'} font-bold tabular-nums ${color}`}>{value}</p>
      </Card>
    </motion.div>
  )
}
