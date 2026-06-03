import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, Download, Printer, Scissors, Users } from 'lucide-react'
import { subDays } from 'date-fns'
import { useAuthStore } from '../../store/authStore.js'
import { useIsFeatureEnabled } from '../../hooks/useFeatureFlags.js'
import { useBarberReport } from '../../hooks/useReports.js'
import { useBranches } from '../../hooks/useBranches.js'
import { formatRupiah } from '../../utils/format.js'
import { Card, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'

const PERIODS = [
  { id: 'thisMonth', label: 'Bulan Ini' },
  { id: 'lastMonth', label: 'Bulan Lalu' },
  { id: 'last30',    label: '30 Hari' },
  { id: 'last7',     label: '7 Hari' },
]

const fmtYmd = (d) => d.toISOString().split('T')[0]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const dLabel = (s) => { const [y, m, d] = s.split('-'); return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}` }

function rangeFor(period) {
  const now = new Date()
  if (period === 'thisMonth') {
    return { startDate: fmtYmd(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: fmtYmd(now) }
  }
  if (period === 'lastMonth') {
    return {
      startDate: fmtYmd(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      endDate:   fmtYmd(new Date(now.getFullYear(), now.getMonth(), 0)),
    }
  }
  const days = period === 'last7' ? 7 : 30
  return { startDate: fmtYmd(subDays(now, days - 1)), endDate: fmtYmd(now) }
}

const num = (v) => { const n = Number(String(v).replace(/[^\d]/g, '')); return Number.isFinite(n) ? n : 0 }
const csvEscape = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

export default function TAPayrollPage() {
  const { user } = useAuthStore()
  const enabled = useIsFeatureEnabled(user?.tenantId, 'payroll')
  if (!enabled) {
    return (
      <div className="max-w-lg mx-auto mt-10 px-4">
        <Card>
          <CardBody className="text-center py-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand/10 border border-brand/20 mb-4">
              <Wallet className="w-7 h-7 text-brand" />
            </div>
            <h2 className="font-display text-xl font-semibold text-off-white mb-2">Komisi &amp; Payroll belum aktif</h2>
            <p className="text-sm text-muted leading-relaxed max-w-sm mx-auto">
              Hitung komisi &amp; gaji barber per periode otomatis, lengkap dengan slip dan export — tersedia di paket Enterprise.
            </p>
            <Link to="/admin/billing" className="inline-flex mt-5">
              <Button>Lihat Paket &amp; Upgrade</Button>
            </Link>
          </CardBody>
        </Card>
      </div>
    )
  }
  return <PayrollInner user={user} />
}

function PayrollInner({ user }) {
  const tenantId = user?.tenantId
  const [period, setPeriod] = useState('thisMonth')
  const [branchId, setBranchId] = useState('')
  const [adj, setAdj] = useState({}) // { [barberId]: { bonus, deduction } }

  const { startDate, endDate } = useMemo(() => rangeFor(period), [period])
  const { data: branches = [] } = useBranches(tenantId)
  const { data: barbers = [], isLoading, isError, refetch } = useBarberReport(
    tenantId,
    { startDate, endDate, ...(branchId ? { branchId } : {}) },
  )

  const branchName = (id) => branches.find(b => b.id === id)?.name || '—'

  // Take-home: barber komisi → komisi; barber gaji tetap → gaji pokok. + bonus − potongan.
  const rows = useMemo(() => barbers.map(b => {
    const a = adj[b.barberId] || {}
    const bonus = num(a.bonus)
    const deduction = num(a.deduction)
    const basePay = b.salaryType === 'fixed' ? (b.baseSalary || 0) : (b.commission || 0)
    return { ...b, bonus, deduction, basePay, takeHome: Math.max(0, basePay + bonus - deduction) }
  }), [barbers, adj])

  const totals = useMemo(() => rows.reduce((t, r) => ({
    revenue: t.revenue + (r.revenue || 0),
    basePay: t.basePay + r.basePay,
    bonus:   t.bonus + r.bonus,
    deduction: t.deduction + r.deduction,
    takeHome: t.takeHome + r.takeHome,
  }), { revenue: 0, basePay: 0, bonus: 0, deduction: 0, takeHome: 0 }), [rows])

  const setAdjField = (id, field, value) =>
    setAdj(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))

  const schemeLabel = (b) => b.salaryType === 'fixed'
    ? 'Gaji tetap'
    : `Komisi ${Math.round((b.commissionRate || 0) * 100)}%`

  const exportCsv = () => {
    const header = ['Barber', 'Cabang', 'Layanan', 'Omzet', 'Skema', 'Komisi/Gaji Pokok', 'Bonus', 'Potongan', 'Dibayar']
    const lines = rows.map(r => [
      r.barberName, branchName(r.branchId), r.servicesCount || 0, r.revenue || 0,
      schemeLabel(r), r.basePay, r.bonus, r.deduction, r.takeHome,
    ])
    const total = ['TOTAL', '', '', totals.revenue, '', totals.basePay, totals.bonus, totals.deduction, totals.takeHome]
    const csv = [header, ...lines, total].map(r => r.map(csvEscape).join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll-${startDate}_${endDate}${branchId ? '-' + branchName(branchId) : ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap no-print">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white inline-flex items-center gap-2">
            <Wallet className="w-5 h-5 text-brand" /> Komisi &amp; Payroll
          </h1>
          <p className="text-muted text-xs sm:text-sm mt-1">
            Periode {dLabel(startDate)} – {dLabel(endDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" icon={Download} onClick={exportCsv} disabled={rows.length === 0}>CSV</Button>
          <Button variant="outline" icon={Printer} onClick={() => window.print()} disabled={rows.length === 0}>Cetak</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 no-print">
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map(p => (
            <button key={p.id} type="button" onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                period === p.id ? 'bg-brand border-brand text-dark' : 'bg-dark-card border-dark-border text-muted hover:text-off-white hover:border-brand/40'
              }`}>
              {p.label}
            </button>
          ))}
        </div>
        {branches.length > 1 && (
          <select value={branchId} onChange={e => setBranchId(e.target.value)}
            className="bg-dark-surface border border-dark-border text-off-white rounded-lg px-3 py-1.5 text-xs outline-none focus:border-brand/60">
            <option value="">Semua cabang</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <SummaryTile label="Total Dibayar" value={formatRupiah(totals.takeHome)} highlight />
        <SummaryTile label="Komisi/Gaji Pokok" value={formatRupiah(totals.basePay)} />
        <SummaryTile label="Bonus" value={formatRupiah(totals.bonus)} />
        <SummaryTile label="Potongan" value={formatRupiah(totals.deduction)} />
      </div>

      {isError ? (
        <Card><CardBody className="text-center py-8">
          <p className="text-sm text-red-400 mb-3">Gagal memuat data payroll.</p>
          <Button size="sm" variant="secondary" onClick={() => refetch()}>Coba Lagi</Button>
        </CardBody></Card>
      ) : isLoading ? (
        <Card><CardBody><div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-dark-card animate-pulse" />)}</div></CardBody></Card>
      ) : rows.length === 0 ? (
        <Card><CardBody className="text-center py-10 text-muted">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Belum ada transaksi barber pada periode ini.</p>
        </CardBody></Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-border text-xs uppercase tracking-wider text-muted">
                  <th className="px-4 py-3 text-left">Barber</th>
                  <th className="px-4 py-3 text-right">Layanan</th>
                  <th className="px-4 py-3 text-right">Omzet</th>
                  <th className="px-4 py-3 text-right">Komisi / Gaji</th>
                  <th className="px-4 py-3 text-right">Bonus</th>
                  <th className="px-4 py-3 text-right">Potongan</th>
                  <th className="px-4 py-3 text-right">Dibayar</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.barberId} className="border-b border-dark-border/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-off-white">{r.barberName}</p>
                      <p className="text-[11px] text-muted">{schemeLabel(r)}{branches.length > 1 ? ` · ${branchName(r.branchId)}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-off-white tabular-nums">{r.servicesCount || 0}</td>
                    <td className="px-4 py-3 text-right text-off-white tabular-nums whitespace-nowrap">{formatRupiah(r.revenue || 0)}</td>
                    <td className="px-4 py-3 text-right text-brand tabular-nums whitespace-nowrap">{formatRupiah(r.basePay)}</td>
                    <td className="px-4 py-3 text-right"><AdjInput value={adj[r.barberId]?.bonus} onChange={v => setAdjField(r.barberId, 'bonus', v)} /></td>
                    <td className="px-4 py-3 text-right"><AdjInput value={adj[r.barberId]?.deduction} onChange={v => setAdjField(r.barberId, 'deduction', v)} /></td>
                    <td className="px-4 py-3 text-right font-bold text-green-400 tabular-nums whitespace-nowrap">{formatRupiah(r.takeHome)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-dark-border font-semibold">
                  <td className="px-4 py-3 text-off-white">Total ({rows.length} barber)</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right text-off-white tabular-nums whitespace-nowrap">{formatRupiah(totals.revenue)}</td>
                  <td className="px-4 py-3 text-right text-brand tabular-nums whitespace-nowrap">{formatRupiah(totals.basePay)}</td>
                  <td className="px-4 py-3 text-right text-off-white tabular-nums whitespace-nowrap">{formatRupiah(totals.bonus)}</td>
                  <td className="px-4 py-3 text-right text-off-white tabular-nums whitespace-nowrap">{formatRupiah(totals.deduction)}</td>
                  <td className="px-4 py-3 text-right text-green-400 tabular-nums whitespace-nowrap">{formatRupiah(totals.takeHome)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-dark-border/60">
            {rows.map(r => (
              <div key={r.barberId} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-off-white text-sm truncate inline-flex items-center gap-1.5">
                      <Scissors className="w-3.5 h-3.5 text-brand flex-shrink-0" /> {r.barberName}
                    </p>
                    <p className="text-[11px] text-muted mt-0.5">{schemeLabel(r)}{branches.length > 1 ? ` · ${branchName(r.branchId)}` : ''}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-bold text-green-400 tabular-nums leading-none">{formatRupiah(r.takeHome)}</p>
                    <p className="text-[10px] text-muted mt-0.5">dibayar</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
                  <div><p className="text-muted">Layanan</p><p className="text-off-white font-medium">{r.servicesCount || 0}</p></div>
                  <div><p className="text-muted">Omzet</p><p className="text-off-white font-medium truncate">{formatRupiah(r.revenue || 0)}</p></div>
                  <div><p className="text-muted">Komisi/Gaji</p><p className="text-brand font-medium truncate">{formatRupiah(r.basePay)}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 no-print">
                  <label className="text-[11px] text-muted">Bonus
                    <AdjInput value={adj[r.barberId]?.bonus} onChange={v => setAdjField(r.barberId, 'bonus', v)} full />
                  </label>
                  <label className="text-[11px] text-muted">Potongan
                    <AdjInput value={adj[r.barberId]?.deduction} onChange={v => setAdjField(r.barberId, 'deduction', v)} full />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="text-[11px] text-muted no-print">
        Komisi dihitung dari omzet layanan yang dikerjakan barber pada periode terpilih. Barber gaji tetap memakai gaji pokok (asumsi periode 1 bulan). Bonus/potongan tidak tersimpan — isi saat akan membayar lalu export/cetak.
      </p>
    </div>
  )
}

function SummaryTile({ label, value, highlight }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? 'bg-brand/10 border-brand/30' : 'bg-dark-card/50 border-dark-border'}`}>
      <p className="text-[10px] sm:text-xs text-muted uppercase tracking-wider truncate">{label}</p>
      <p className={`text-base sm:text-lg font-bold tabular-nums truncate ${highlight ? 'text-brand' : 'text-off-white'}`}>{value}</p>
    </div>
  )
}

function AdjInput({ value, onChange, full }) {
  return (
    <input
      inputMode="numeric"
      value={value || ''}
      onChange={e => onChange(e.target.value.replace(/[^\d]/g, ''))}
      placeholder="0"
      className={`${full ? 'w-full mt-1' : 'w-24 text-right'} bg-dark-surface border border-dark-border text-off-white rounded-lg px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-brand/60`}
    />
  )
}
