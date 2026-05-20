import React, { useMemo, useState } from 'react'
import { Search, Filter, Users, Download } from 'lucide-react'
import { useAffiliateSelfReferrals } from '../../hooks/useAffiliates.js'
import Card from '../../components/ui/Card.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { formatRupiah } from '../../utils/format.js'

export default function AffiliateReferralsPage() {
  const { data = [], isLoading } = useAffiliateSelfReferrals()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  const filtered = useMemo(() => {
    return data.filter(r => {
      if (status !== 'all') {
        const sub = r.tenant?.subscription?.status || 'unknown'
        if (status === 'active'  && sub !== 'active' && sub !== 'trial') return false
        if (status === 'expired' && sub !== 'expired' && sub !== 'overdue') return false
      }
      if (!search) return true
      const q = search.toLowerCase()
      return (r.tenant?.name || '').toLowerCase().includes(q) ||
             (r.tenant?.slug || '').toLowerCase().includes(q)
    })
  }, [data, search, status])

  const totalCommission = data.reduce((s, r) => s + (r.totalCommission || 0), 0)

  const exportCsv = () => {
    const rows = [
      ['Tenant', 'Slug', 'Paket', 'Status Langganan', 'Bergabung', 'Total Komisi'],
      ...filtered.map(r => [
        r.tenant?.name || '',
        r.tenant?.slug || '',
        r.tenant?.subscription?.package || '',
        r.tenant?.subscription?.status || '',
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">Tenant Rujukan</h1>
          <p className="text-muted text-sm mt-1">{data.length} tenant · {formatRupiah(totalCommission)} total komisi.</p>
        </div>
        <button onClick={exportCsv} disabled={!filtered.length}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dark-border text-xs text-muted hover:text-off-white disabled:opacity-40">
          <Download size={12} /> Ekspor CSV
        </button>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={13} className="text-muted" />
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="bg-dark-surface border border-dark-border rounded-xl px-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-gold/40">
            <option value="all">Semua langganan</option>
            <option value="active">Aktif/Trial</option>
            <option value="expired">Expired/Overdue</option>
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama tenant"
              className="w-full bg-dark-surface border border-dark-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-off-white focus:outline-none focus:border-gold/40" />
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-dark-card animate-pulse rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted">
          <Users size={32} className="mx-auto mb-3 opacity-30" />
          <p>Tidak ada tenant cocok dengan filter.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark-surface text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Tenant</th>
                  <th className="px-4 py-2 text-left font-medium">Paket</th>
                  <th className="px-4 py-2 text-left font-medium">Status Langganan</th>
                  <th className="px-4 py-2 text-right font-medium">Total Komisi</th>
                  <th className="px-4 py-2 text-left font-medium">Bergabung</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-t border-dark-border hover:bg-dark-surface/40">
                    <td className="px-4 py-3">
                      <p className="text-off-white font-medium">{r.tenant?.name}</p>
                      <p className="text-xs text-muted">{r.tenant?.slug}.sembapos.com</p>
                    </td>
                    <td className="px-4 py-3 text-off-white">{r.tenant?.subscription?.package || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={
                        r.tenant?.subscription?.status === 'active' ? 'success' :
                        r.tenant?.subscription?.status === 'trial'  ? 'info'    :
                        r.tenant?.subscription?.status === 'expired'? 'danger'  : 'muted'
                      }>{r.tenant?.subscription?.status || '—'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-gold tabular-nums">{formatRupiah(r.totalCommission)}</td>
                    <td className="px-4 py-3 text-xs text-muted">{new Date(r.createdAt).toLocaleDateString('id-ID')}</td>
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
