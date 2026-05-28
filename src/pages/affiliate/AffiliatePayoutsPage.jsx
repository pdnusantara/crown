import React, { useState } from 'react'
import { useAffiliateSelfPayouts, useAffiliateSelfStats, useAffiliateMe, useRequestPayout } from '../../hooks/useAffiliates.js'
import { Wallet, ArrowUpRight, AlertCircle, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import Card from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Badge from '../../components/ui/Badge.jsx'
import Modal from '../../components/ui/Modal.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { formatRupiah } from '../../utils/format.js'

const METHOD_LABEL = { bank_transfer: 'Transfer Bank', gopay: 'GoPay', ovo: 'OVO', dana: 'DANA' }

function badge(status) {
  if (status === 'requested')  return <Badge variant="warning">Diajukan</Badge>
  if (status === 'processing') return <Badge variant="info">Sedang Diproses</Badge>
  if (status === 'paid')       return <Badge variant="success">Dibayar</Badge>
  if (status === 'rejected')   return <Badge variant="danger">Ditolak</Badge>
  return <Badge variant="muted">{status}</Badge>
}

export default function AffiliatePayoutsPage() {
  const toast = useToast()
  const { data = [], isLoading } = useAffiliateSelfPayouts()
  const { data: stats } = useAffiliateSelfStats()
  const { data: me } = useAffiliateMe()
  const request = useRequestPayout()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  const submit = async () => {
    try {
      await request.mutateAsync({ note: note.trim() || undefined })
      toast.success('Permintaan pencairan dikirim')
      setOpen(false); setNote('')
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Gagal mengajukan pencairan')
    }
  }

  const canRequest = stats && me?.payoutMethod && stats.balance >= (stats.minPayout || 100000) && (stats.payoutPending?.count || 0) === 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">Pencairan</h1>
          <p className="text-muted text-sm mt-1">Riwayat & permintaan pencairan saldo komisi.</p>
        </div>
        <Button icon={ArrowUpRight} disabled={!canRequest} onClick={() => setOpen(true)}>
          {stats?.payoutPending?.count ? 'Ada payout berjalan' : 'Ajukan pencairan'}
        </Button>
      </div>

      <Card className="p-5">
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted">Saldo siap ditarik</p>
            <p className="text-3xl font-bold text-brand mt-1 tabular-nums">{formatRupiah(stats?.balance || 0)}</p>
            <p className="text-[11px] text-muted mt-1">Minimum: {formatRupiah(stats?.minPayout || 100000)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Sudah dibayarkan</p>
            <p className="text-3xl font-bold text-green-400 mt-1 tabular-nums">{formatRupiah(stats?.commissionPaid.amount || 0)}</p>
            <p className="text-[11px] text-muted mt-1">{stats?.commissionPaid.count || 0} komisi terbayar</p>
          </div>
          <div>
            <p className="text-xs text-muted">Sedang diproses</p>
            <p className="text-3xl font-bold text-blue-400 mt-1 tabular-nums">{formatRupiah(stats?.payoutPending?.amount || 0)}</p>
            <p className="text-[11px] text-muted mt-1">{stats?.payoutPending?.count || 0} permintaan</p>
          </div>
        </div>
        {!me?.payoutMethod && (
          <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" />
            <span>Lengkapi <Link to="/affiliate/profile" className="underline">metode pencairan</Link> di profil agar bisa ajukan payout.</span>
          </div>
        )}
      </Card>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-dark-card animate-pulse rounded-xl" />)}</div>
      ) : data.length === 0 ? (
        <Card className="p-12 text-center text-muted">
          <Wallet size={32} className="mx-auto mb-3 opacity-30" />
          <p>Belum ada permintaan pencairan.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-surface text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Diajukan</th>
                  <th className="px-4 py-2 text-right font-medium">Nominal</th>
                  <th className="px-4 py-2 text-left font-medium">Tujuan</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Diproses</th>
                  <th className="px-4 py-2 text-left font-medium">Bukti</th>
                </tr>
              </thead>
              <tbody>
                {data.map(p => (
                  <tr key={p.id} className="border-t border-dark-border hover:bg-dark-surface/40">
                    <td className="px-4 py-3 text-xs">{new Date(p.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-3 text-right text-brand font-semibold tabular-nums">{formatRupiah(p.amount)}</td>
                    <td className="px-4 py-3 text-xs">
                      <p className="text-off-white">{METHOD_LABEL[p.method] || p.method}</p>
                      <p className="text-muted font-mono">{p.account}</p>
                    </td>
                    <td className="px-4 py-3">
                      {badge(p.status)}
                      {p.adminNote && <p className="text-[10px] text-muted mt-1 max-w-[160px] truncate" title={p.adminNote}>“{p.adminNote}”</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {p.processedAt ? new Date(p.processedAt).toLocaleString('id-ID', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {p.proofUrl ? (
                        <a href={p.proofUrl} target="_blank" rel="noreferrer" className="text-xs text-brand inline-flex items-center gap-1 hover:underline">
                          Lihat <ExternalLink size={10} />
                        </a>
                      ) : <span className="text-muted text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Ajukan pencairan" size="md">
        <div className="space-y-3">
          <div className="bg-dark-surface rounded-xl p-3">
            <p className="text-muted text-xs">Nominal pencairan</p>
            <p className="text-brand text-2xl font-bold tabular-nums mt-0.5">{formatRupiah(stats?.balance || 0)}</p>
          </div>
          {me?.payoutMethod && (
            <div className="bg-dark-surface rounded-xl p-3 text-sm">
              <p className="text-muted text-xs">Akan ditransfer ke</p>
              <p className="text-off-white mt-0.5">{METHOD_LABEL[me.payoutMethod] || me.payoutMethod}</p>
              <p className="text-off-white font-mono">{me.payoutAccount}</p>
              <p className="text-xs text-muted">a.n. {me.payoutHolder || '—'}</p>
            </div>
          )}
          <div>
            <label className="text-xs text-muted block mb-1.5">Catatan (opsional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={500}
              className="w-full bg-dark-surface border border-dark-border rounded-xl p-3 text-sm text-off-white focus:outline-none focus:border-brand/40" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" fullWidth onClick={() => setOpen(false)}>Batal</Button>
            <Button fullWidth loading={request.isPending} onClick={submit}>Kirim Permintaan</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
