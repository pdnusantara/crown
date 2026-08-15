import React, { useState, useMemo, useEffect } from 'react'
import {
  Receipt, Search, Filter, RefreshCw, Download, X,
  Clock, XCircle, Wallet, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { usePaymentOrders } from '../../hooks/usePayment.js'
import { useTenants } from '../../hooks/useTenants.js'
import Card, { CardHeader } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { formatRupiah, formatDateTime } from '../../utils/format.js'
import { getSocket } from '../../lib/socket.js'
import { useQueryClient } from '@tanstack/react-query'

const STATUS_VARIANTS = { pending: 'warning', success: 'success', failed: 'danger', expired: 'muted', cancelled: 'muted' }
const STATUS_LABEL    = { pending: 'Pending', success: 'Sukses', failed: 'Gagal', expired: 'Kadaluarsa', cancelled: 'Dibatalkan' }
const TYPE_LABEL      = { subscription: 'Langganan', branch_addon: 'Cabang', upgrade: 'Upgrade', staff_addon: 'Staf' }

const PAGE_LIMIT = 25

function typeLabel(t) { return TYPE_LABEL[t] || t || '—' }

// ── CSV ──────────────────────────────────────────────────────────────────────
function escapeCsv(v) {
  if (v == null) return ''
  const s = String(v)
  return s.includes(',') || s.includes('\n') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
}
function exportCSV(rows) {
  const cols = ['merchantOrderId', 'tenantName', 'type', 'amount', 'discountAmount', 'promotionCode', 'status', 'paymentMethod', 'reference', 'createdAt']
  const head = ['Order ID', 'Tenant', 'Tipe', 'Nominal', 'Diskon', 'Kode Promo', 'Status', 'Metode', 'Reference', 'Tanggal']
  const body = rows.map(o => cols.map(c => escapeCsv(o[c])).join(','))
  const csv  = '﻿' + [head.join(','), ...body].join('\n')
  const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a    = Object.assign(document.createElement('a'), { href: url, download: `riwayat-transaksi-duitku-${new Date().toISOString().slice(0, 10)}.csv` })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── KPI tile ───────────────────────────────────────────────────────────────────
function StatTile({ icon: Icon, label, value, sub, tone = 'brand' }) {
  const toneCls = {
    brand:   'text-brand bg-brand/10',
    success: 'text-green-400 bg-green-400/10',
    warning: 'text-amber-400 bg-amber-400/10',
    danger:  'text-red-400 bg-red-400/10',
  }[tone]
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${toneCls}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="text-lg font-bold text-off-white truncate">{value}</p>
        {sub && <p className="text-[11px] text-muted truncate">{sub}</p>}
      </div>
    </Card>
  )
}

export default function SAPaymentTransactionsPage() {
  const qc = useQueryClient()

  const [search, setSearch]     = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus]     = useState('')
  const [type, setType]         = useState('')
  const [tenantId, setTenantId] = useState('')
  const [from, setFrom]         = useState('')
  const [to, setTo]             = useState('')
  const [page, setPage]         = useState(1)

  // Debounce search input
  useEffect(() => {
    const id = setTimeout(() => { setDebounced(search.trim()); setPage(1) }, 350)
    return () => clearTimeout(id)
  }, [search])

  // Reset ke halaman 1 saat filter berubah
  useEffect(() => { setPage(1) }, [status, type, tenantId, from, to])

  const filters = useMemo(() => ({
    page, limit: PAGE_LIMIT,
    ...(debounced && { search: debounced }),
    ...(status && { status }),
    ...(type && { type }),
    ...(tenantId && { tenantId }),
    ...(from && { from }),
    ...(to && { to }),
  }), [page, debounced, status, type, tenantId, from, to])

  const { data, isLoading, isError, refetch, isFetching } = usePaymentOrders(filters)
  const { data: tenantsData } = useTenants({ limit: 1000 })

  const orders   = data?.data || []
  const total    = data?.total || 0
  const summary  = data?.summary || {}
  const tenants  = tenantsData?.data || tenantsData?.list || tenantsData || []
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT))

  // Realtime: backend emit `subscription:any-updated` saat callback Duitku sukses
  useEffect(() => {
    const s = getSocket()
    const refresh = () => qc.invalidateQueries({ queryKey: ['payment-orders'] })
    const events = ['subscription:any-updated', 'subscription:updated']
    events.forEach(e => s.on(e, refresh))
    return () => events.forEach(e => s.off(e, refresh))
  }, [qc])

  const hasFilters = debounced || status || type || tenantId || from || to
  function resetFilters() {
    setSearch(''); setDebounced(''); setStatus(''); setType(''); setTenantId(''); setFrom(''); setTo(''); setPage(1)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">Riwayat Transaksi Duitku</h1>
          <p className="text-muted text-sm mt-1">Semua pembayaran tenant via payment gateway Duitku</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => refetch()} className="gap-2" disabled={isFetching}>
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} /> Muat ulang
          </Button>
          <Button variant="ghost" onClick={() => exportCSV(orders)} className="gap-2" disabled={!orders.length}>
            <Download size={15} /> Ekspor CSV
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile icon={Wallet}       tone="success" label="Total Diterima" value={formatRupiah(summary.successAmount || 0)} sub={`${summary.successCount || 0} transaksi sukses`} />
        <StatTile icon={Receipt}      tone="brand"   label="Total Transaksi" value={(summary.count ?? total).toLocaleString('id-ID')} sub="Sesuai filter aktif" />
        <StatTile icon={Clock}        tone="warning" label="Pending"         value={(summary.pendingCount || 0).toLocaleString('id-ID')} sub="Menunggu pembayaran" />
        <StatTile icon={XCircle}      tone="danger"  label="Gagal/Batal"     value={(summary.failedCount || 0).toLocaleString('id-ID')} sub="Gagal, kadaluarsa, batal" />
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="input-base pl-9 w-full"
                placeholder="Cari Order ID, reference, kode promo…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select className="input-base md:w-44" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Semua status</option>
              <option value="success">Sukses</option>
              <option value="pending">Pending</option>
              <option value="failed">Gagal</option>
              <option value="expired">Kadaluarsa</option>
              <option value="cancelled">Dibatalkan</option>
            </select>
            <select className="input-base md:w-44" value={type} onChange={e => setType(e.target.value)}>
              <option value="">Semua tipe</option>
              <option value="subscription">Langganan</option>
              <option value="upgrade">Upgrade</option>
              <option value="branch_addon">Cabang</option>
              <option value="staff_addon">Staf</option>
            </select>
          </div>
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <select className="input-base md:w-56" value={tenantId} onChange={e => setTenantId(e.target.value)}>
              <option value="">Semua tenant</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted shrink-0">Dari</label>
              <input type="date" className="input-base" value={from} onChange={e => setFrom(e.target.value)} />
              <label className="text-xs text-muted shrink-0">s/d</label>
              <input type="date" className="input-base" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            {hasFilters && (
              <button onClick={resetFilters} className="text-xs text-muted hover:text-brand flex items-center gap-1 transition-colors">
                <X size={13} /> Reset filter
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-muted" />
            <span className="font-semibold text-off-white">{total.toLocaleString('id-ID')} transaksi</span>
          </div>
        </CardHeader>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 bg-dark-bg rounded-lg animate-pulse" />)}
          </div>
        ) : isError ? (
          <div className="text-center py-12">
            <p className="text-muted text-sm mb-3">Gagal memuat riwayat transaksi.</p>
            <Button variant="ghost" onClick={() => refetch()} className="gap-2"><RefreshCw size={15} /> Coba lagi</Button>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12">
            <Receipt size={32} className="text-muted/40 mx-auto mb-3" />
            <p className="text-muted text-sm">{hasFilters ? 'Tidak ada transaksi yang cocok dengan filter.' : 'Belum ada transaksi.'}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border text-muted text-xs">
                    <th className="text-left p-3">Order ID</th>
                    <th className="text-left p-3">Tenant</th>
                    <th className="text-left p-3">Tipe</th>
                    <th className="text-right p-3">Nominal</th>
                    <th className="text-center p-3">Status</th>
                    <th className="text-left p-3">Metode</th>
                    <th className="text-left p-3">Tanggal</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} className="border-b border-dark-border/50 hover:bg-dark-card/40 transition-colors">
                      <td className="p-3 font-mono text-xs text-muted">{o.merchantOrderId}</td>
                      <td className="p-3 text-off-white">{o.tenantName || <span className="text-muted">—</span>}</td>
                      <td className="p-3">{typeLabel(o.type)}</td>
                      <td className="p-3 text-right font-medium text-off-white">
                        {formatRupiah(o.amount)}
                        {o.discountAmount > 0 && <span className="block text-[11px] text-green-400">−{formatRupiah(o.discountAmount)}</span>}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={STATUS_VARIANTS[o.status] || 'muted'}>{STATUS_LABEL[o.status] || o.status}</Badge>
                      </td>
                      <td className="p-3 text-muted text-xs">{o.paymentMethod || '—'}</td>
                      <td className="p-3 text-muted text-xs">{formatDateTime(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-dark-border/50">
              {orders.map(o => (
                <div key={o.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted truncate">{o.merchantOrderId}</span>
                    <Badge variant={STATUS_VARIANTS[o.status] || 'muted'}>{STATUS_LABEL[o.status] || o.status}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-off-white truncate">{o.tenantName || '—'}</span>
                    <span className="text-sm font-semibold text-off-white shrink-0">{formatRupiah(o.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{typeLabel(o.type)}{o.paymentMethod ? ` · ${o.paymentMethod}` : ''}</span>
                    <span>{formatDateTime(o.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-dark-border">
                <span className="text-xs text-muted">Halaman {page} dari {totalPages}</span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="gap-1">
                    <ChevronLeft size={15} /> Sebelumnya
                  </Button>
                  <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="gap-1">
                    Berikutnya <ChevronRight size={15} />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
