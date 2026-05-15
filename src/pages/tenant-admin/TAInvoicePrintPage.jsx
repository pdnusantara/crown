import React, { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Printer, ArrowLeft } from 'lucide-react'
import api from '../../lib/api.js'
import { formatRupiah } from '../../utils/format.js'

function useInvoice(id) {
  return useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get(`/subscriptions/invoices/${id}`).then(r => r.data.data),
    enabled: !!id,
  })
}

export default function TAInvoicePrintPage() {
  const { id } = useParams()
  const { data: inv, isLoading, error } = useInvoice(id)

  // Trigger native print dialog setelah data ter-render
  useEffect(() => {
    if (inv) {
      const t = setTimeout(() => window.print(), 600)
      return () => clearTimeout(t)
    }
  }, [inv])

  if (isLoading) {
    return <div className="p-8 text-center text-muted">Memuat invoice…</div>
  }
  if (error || !inv) {
    return (
      <div className="p-8 text-center text-muted">
        <p>Invoice tidak ditemukan atau Anda tidak berhak mengaksesnya.</p>
        <a href="/admin/billing" className="inline-flex items-center gap-1 mt-4 text-gold hover:underline">
          <ArrowLeft size={14} /> Kembali ke Billing
        </a>
      </div>
    )
  }

  const tenant = inv.subscription?.tenant || {}
  const billTo = tenant.companyName || tenant.name
  const billAddr = tenant.taxAddress || tenant.address || '—'
  const subtotal = inv.originalAmount ?? (inv.amount + (inv.discountAmount || 0))
  const discount = inv.discountAmount || 0
  const total = inv.amount

  const periodLabel = inv.billingCycle === 'annual' ? 'Tahunan' : (inv.billingCycle === 'monthly' ? 'Bulanan' : '')

  const itemDesc = inv.type === 'branch_addon'
    ? 'Lisensi Cabang Tambahan'
    : inv.period?.toLowerCase().startsWith('upgrade')
      ? inv.period
      : `Langganan ${inv.subscription?.package || ''} ${periodLabel}`.trim()

  return (
    <div className="invoice-page bg-white text-black min-h-screen">
      {/* Toolbar — disembunyikan saat print via @media print */}
      <div className="no-print sticky top-0 bg-dark-card border-b border-dark-border px-4 py-3 flex items-center justify-between text-sm">
        <a href="/admin/billing" className="inline-flex items-center gap-1 text-muted hover:text-off-white">
          <ArrowLeft size={14} /> Kembali
        </a>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold text-dark font-semibold hover:bg-gold/90 transition"
        >
          <Printer size={14} /> Cetak / Simpan PDF
        </button>
      </div>

      <div className="max-w-3xl mx-auto p-8 print:p-0">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-black pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">INVOICE</h1>
            <p className="text-sm text-gray-700 mt-1">No. {inv.id.toUpperCase().slice(-12)}</p>
            <p className="text-sm text-gray-700">
              Tanggal: {format(new Date(inv.paidAt || inv.createdAt), 'dd MMMM yyyy')}
            </p>
            {inv.status === 'paid' && (
              <p className="text-sm text-green-700 font-bold mt-1">✓ LUNAS</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-gray-900">SembaPOS / BarberOS</p>
            <p className="text-xs text-gray-600">Sistem Manajemen Barbershop</p>
            <p className="text-xs text-gray-600">sembapos.com</p>
          </div>
        </div>

        {/* Bill to */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Ditagihkan kepada</p>
            <p className="font-semibold text-gray-900">{billTo}</p>
            {tenant.companyName && tenant.name !== tenant.companyName && (
              <p className="text-sm text-gray-700">a.n. {tenant.name}</p>
            )}
            <p className="text-sm text-gray-700 whitespace-pre-line">{billAddr}</p>
            {tenant.npwp && <p className="text-sm text-gray-700">NPWP: {tenant.npwp}</p>}
            {tenant.email && <p className="text-sm text-gray-700">{tenant.email}</p>}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Status pembayaran</p>
            <p className="text-sm font-semibold text-gray-900">
              {inv.status === 'paid' ? 'Lunas' : inv.status === 'overdue' ? 'Terlambat' : 'Menunggu pembayaran'}
            </p>
            {inv.paidAt && (
              <p className="text-xs text-gray-600 mt-0.5">
                Dibayar pada {format(new Date(inv.paidAt), 'dd MMM yyyy HH:mm')}
              </p>
            )}
            {inv.promotionCode && (
              <p className="text-xs text-gray-700 mt-1">
                Kode promo: <span className="font-mono font-semibold">{inv.promotionCode}</span>
              </p>
            )}
          </div>
        </div>

        {/* Items table */}
        <table className="w-full text-sm mb-6 border-collapse">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="py-2 font-semibold">Deskripsi</th>
              <th className="py-2 font-semibold text-right">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-300">
              <td className="py-3">
                <p className="font-medium">{itemDesc}</p>
                <p className="text-xs text-gray-600 mt-0.5">{inv.period}</p>
              </td>
              <td className="py-3 text-right">{formatRupiah(subtotal)}</td>
            </tr>
            {discount > 0 && (
              <tr className="border-b border-gray-300 text-green-700">
                <td className="py-2">Diskon{inv.promotionCode ? ` (${inv.promotionCode})` : ''}</td>
                <td className="py-2 text-right">− {formatRupiah(discount)}</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black">
              <td className="py-3 font-bold">TOTAL</td>
              <td className="py-3 text-right font-bold text-lg">{formatRupiah(total)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Footer */}
        <div className="text-xs text-gray-600 mt-12 pt-4 border-t border-gray-300 space-y-1">
          <p>Invoice ini diterbitkan secara elektronik dan sah tanpa tanda tangan basah.</p>
          <p>Pertanyaan terkait penagihan: hubungi support melalui menu Tickets di aplikasi.</p>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .invoice-page { background: white !important; }
        }
      `}</style>
    </div>
  )
}
