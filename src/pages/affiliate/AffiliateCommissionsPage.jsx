import React, { useState, useMemo } from 'react'
import { Filter, Download, Banknote, AlertCircle } from 'lucide-react'
import { useAffiliateSelfCommissions } from '../../hooks/useAffiliates.js'
import Card from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { formatRupiah } from '../../utils/format.js'

function badge(status) {
  if (status === 'pending')  return <Badge variant="warning">Menunggu Verifikasi</Badge>
  if (status === 'approved') return <Badge variant="info">Disetujui — Siap Tarik</Badge>
  if (status === 'paid')     return <Badge variant="success">Sudah Dibayar</Badge>
  if (status === 'void')     return <Badge variant="danger">Dibatalkan</Badge>
  return <Badge variant="muted">{status}</Badge>
}

export default function AffiliateCommissionsPage() {
  const [status, setStatus] = useState('all')
  const { data = [], isLoading } = useAffiliateSelfCommissions(status === 'all' ? undefined : status)

  const totals = useMemo(() => ({
    pending:  data.filter(c => c.status === 'pending').reduce((s, c) => s + c.amount, 0),
    approved: data.filter(c => c.status === 'approved').reduce((s, c) => s + c.amount, 0),
    paid:     data.filter(c => c.status === 'paid').reduce((s, c) => s + c.amount, 0),
  }), [data])

  const exportCsv = () => {
    const rows = [
      ['Tanggal', 'Tenant', 'Periode', 'Nominal Invoice', 'Komisi (%)', 'Komisi (Rp)', 'Status'],
      ...data.map(c => [
        new Date(c.createdAt).toISOString().slice(0, 10),
        c.referral?.tenant?.name || '',
        c.period || '',
        c.baseAmount,
        Math.round(c.commissionRate * 100),
        c.amount,
        c.status,
      ]),
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `commissions-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">Komisi</h1>
          <p className="text-muted text-sm mt-1">Riwayat lengkap komisi dari setiap invoice tenant rujukan Anda.</p>
        </div>
        <button onClick={exportCsv} disabled={!data.length}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dark-border text-xs text-muted hover:text-off-white disabled:opacity-40">
          <Download size={12} /> Ekspor CSV
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryTile label="Menunggu verifikasi" value={totals.pending} color="text-amber-400" />
        <SummaryTile label="Disetujui — Siap Tarik" value={totals.approved} color="text-blue-400" />
        <SummaryTile label="Sudah Dibayar" value={totals.paid} color="text-green-400" />
      </div>

      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={13} className="text-muted" />
          {['all', 'pending', 'approved', 'paid', 'void'].map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1 text-xs rounded-full border ${
                status === s ? 'bg-gold/15 text-gold border-gold/40' : 'border-dark-border text-muted hover:text-off-white'
              }`}>{s === 'all' ? 'Semua' : s}</button>
          ))}
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-dark-card animate-pulse rounded-xl" />)}</div>
      ) : data.length === 0 ? (
        <Card className="p-12 text-center text-muted">
          <Banknote size={32} className="mx-auto mb-3 opacity-30" />
          <p>Belum ada komisi pada filter ini.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-surface text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Tanggal</th>
                  <th className="px-4 py-2 text-left font-medium">Tenant</th>
                  <th className="px-4 py-2 text-left font-medium">Periode</th>
                  <th className="px-4 py-2 text-right font-medium">Invoice</th>
                  <th className="px-4 py-2 text-right font-medium">Komisi</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map(c => (
                  <tr key={c.id} className="border-t border-dark-border hover:bg-dark-surface/40">
                    <td className="px-4 py-3 text-xs">{new Date(c.createdAt).toLocaleDateString('id-ID')}</td>
                    <td className="px-4 py-3">
                      <p className="text-off-white">{c.referral?.tenant?.name || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{c.period || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{formatRupiah(c.baseAmount)}</td>
                    <td className="px-4 py-3 text-right">
                      <p className="text-gold font-semibold tabular-nums">{formatRupiah(c.amount)}</p>
                      <p className="text-[10px] text-muted">{Math.round(c.commissionRate * 100)}%</p>
                    </td>
                    <td className="px-4 py-3">
                      {badge(c.status)}
                      {c.status === 'void' && c.voidReason && (
                        <p className="text-[10px] text-red-400 mt-1 flex items-start gap-0.5">
                          <AlertCircle size={9} className="mt-0.5 flex-shrink-0" /> {c.voidReason}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

function SummaryTile({ label, value, color }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-2xl font-bold tabular-nums mt-1 ${color}`}>{formatRupiah(value)}</p>
    </Card>
  )
}
