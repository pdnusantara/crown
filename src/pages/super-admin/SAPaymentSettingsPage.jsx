import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CreditCard, Save, Eye, EyeOff, CheckCircle, AlertTriangle, ExternalLink, ToggleLeft, ToggleRight, Clock } from 'lucide-react'
import { usePaymentSettings, useUpdatePaymentSettings } from '../../hooks/usePayment.js'
import { usePaymentOrders } from '../../hooks/usePayment.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Badge from '../../components/ui/Badge.jsx'
import { formatRupiah, formatDate } from '../../utils/format.js'

const STATUS_VARIANTS = { pending: 'warning', success: 'success', failed: 'danger', expired: 'muted' }
const STATUS_LABEL    = { pending: 'Pending', success: 'Sukses', failed: 'Gagal', expired: 'Expired' }

function FieldRow({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted font-medium">{label}</label>
      {children}
    </div>
  )
}

export default function SAPaymentSettingsPage() {
  const { data: settings, isLoading } = usePaymentSettings()
  const update = useUpdatePaymentSettings()
  const { showToast } = useToast()

  const [form, setForm]         = useState({ merchantCode: '', apiKey: '', environment: 'sandbox', expiryMinutes: 60, active: false })
  const [showKey, setShowKey]   = useState(false)
  const [apiKeyDirty, setApiKeyDirty] = useState(false)

  useEffect(() => {
    if (settings) {
      setForm(f => ({
        ...f,
        merchantCode:  settings.merchantCode  || '',
        apiKey:        '',       // always clear; real key is never sent to FE
        environment:   settings.environment   || 'sandbox',
        expiryMinutes: settings.expiryMinutes || 60,
        active:        settings.active        ?? false,
      }))
    }
  }, [settings])

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave() {
    const payload = {
      merchantCode:  form.merchantCode.trim(),
      environment:   form.environment,
      expiryMinutes: Number(form.expiryMinutes),
      active:        form.active,
    }
    // Only send apiKey if user actually typed a new one
    if (apiKeyDirty && form.apiKey.trim()) payload.apiKey = form.apiKey.trim()

    try {
      await update.mutateAsync(payload)
      setApiKeyDirty(false)
      setForm(f => ({ ...f, apiKey: '' }))
      showToast('Pengaturan payment disimpan', 'success')
    } catch {
      showToast('Gagal menyimpan pengaturan', 'error')
    }
  }

  const { data: ordersData } = usePaymentOrders({ limit: 50 })
  const orders = ordersData?.data || []

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-dark-card rounded-xl animate-pulse w-64" />
        <div className="h-64 bg-dark-card rounded-2xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-off-white">Payment Gateway</h1>
        <p className="text-muted text-sm mt-1">Konfigurasi Duitku untuk menerima pembayaran otomatis</p>
      </div>

      {/* Settings card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard size={18} className="text-brand" />
            <span className="font-semibold text-off-white">Konfigurasi Duitku</span>
          </div>
          <a
            href="https://dashboard.duitku.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted hover:text-brand flex items-center gap-1 transition-colors"
          >
            Buka Dashboard Duitku <ExternalLink size={12} />
          </a>
        </CardHeader>

        <div className="p-5 space-y-5">
          {/* Active toggle */}
          <div className="flex items-center justify-between p-3 bg-dark-bg rounded-xl border border-dark-border">
            <div>
              <p className="text-sm font-medium text-off-white">Aktifkan Payment Gateway</p>
              <p className="text-xs text-muted mt-0.5">Tenant dapat membayar otomatis via Duitku</p>
            </div>
            <button
              onClick={() => set('active', !form.active)}
              className="text-brand transition-opacity hover:opacity-80"
            >
              {form.active ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-muted" />}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Merchant Code">
              <input
                className="input-base"
                placeholder="Contoh: DS12345"
                value={form.merchantCode}
                onChange={e => set('merchantCode', e.target.value)}
              />
            </FieldRow>

            <FieldRow label="API Key">
              <div className="relative">
                <input
                  className="input-base pr-10"
                  type={showKey ? 'text' : 'password'}
                  placeholder={settings?.apiKey || 'Masukkan API Key baru…'}
                  value={form.apiKey}
                  onChange={e => { set('apiKey', e.target.value); setApiKeyDirty(true) }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-off-white"
                  onClick={() => setShowKey(v => !v)}
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {settings?.apiKey && !apiKeyDirty && (
                <p className="text-xs text-muted">API Key tersimpan: {settings.apiKey}</p>
              )}
            </FieldRow>

            <FieldRow label="Environment">
              <select
                className="input-base"
                value={form.environment}
                onChange={e => set('environment', e.target.value)}
              >
                <option value="sandbox">Sandbox (Testing)</option>
                <option value="production">Production (Live)</option>
              </select>
            </FieldRow>

            <FieldRow label="Link Kadaluarsa (menit)">
              <input
                className="input-base"
                type="number"
                min="5"
                max="1440"
                value={form.expiryMinutes}
                onChange={e => set('expiryMinutes', e.target.value)}
              />
            </FieldRow>
          </div>

          {form.environment === 'production' && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm"
            >
              <AlertTriangle size={15} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-amber-300">Mode <strong>Production</strong> — transaksi ini akan dikenakan biaya nyata.</p>
            </motion.div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSave} loading={update.isPending} className="gap-2">
              <Save size={15} /> Simpan Pengaturan
            </Button>
          </div>
        </div>
      </Card>

      {/* Callback info */}
      <Card>
        <CardHeader>
          <span className="font-semibold text-off-white">Callback & Return URL</span>
        </CardHeader>
        <div className="p-5 space-y-3 text-sm">
          <p className="text-muted">Masukkan URL berikut di dashboard Duitku:</p>
          <div className="space-y-2">
            {[
              { label: 'Callback URL', value: `${window.location.origin.replace(':5173', ':3001')}/api/payment/callback` },
              { label: 'Return URL',   value: `${window.location.origin}/admin/billing?payment=done` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-3 p-3 bg-dark-bg rounded-xl border border-dark-border">
                <div>
                  <p className="text-xs text-muted">{label}</p>
                  <p className="text-off-white font-mono text-xs mt-0.5 break-all">{value}</p>
                </div>
                <button
                  className="text-muted hover:text-brand shrink-0 text-xs transition-colors"
                  onClick={() => { navigator.clipboard.writeText(value); showToast('Disalin!', 'success') }}
                >
                  Salin
                </button>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Recent orders */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-muted" />
            <span className="font-semibold text-off-white">Riwayat Transaksi Duitku</span>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          {orders.length === 0 ? (
            <p className="text-center text-muted py-10 text-sm">Belum ada transaksi</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-border text-muted text-xs">
                  <th className="text-left p-3">Order ID</th>
                  <th className="text-left p-3">Tipe</th>
                  <th className="text-right p-3">Nominal</th>
                  <th className="text-center p-3">Status</th>
                  <th className="text-left p-3">Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} className="border-b border-dark-border/50 hover:bg-dark-card/40 transition-colors">
                    <td className="p-3 font-mono text-xs text-muted">{o.merchantOrderId}</td>
                    <td className="p-3 capitalize">{o.type === 'branch_addon' ? 'Cabang' : 'Subscription'}</td>
                    <td className="p-3 text-right font-medium">{formatRupiah(o.amount)}</td>
                    <td className="p-3 text-center">
                      <Badge variant={STATUS_VARIANTS[o.status] || 'muted'}>{STATUS_LABEL[o.status] || o.status}</Badge>
                    </td>
                    <td className="p-3 text-muted text-xs">{formatDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}
