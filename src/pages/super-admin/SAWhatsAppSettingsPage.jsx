import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  MessageSquare, Save, Eye, EyeOff, ExternalLink, ToggleLeft, ToggleRight,
  Plug, CheckCircle, AlertTriangle,
} from 'lucide-react'
import {
  useWhatsappConfig, useUpdateWhatsappConfig, useTestWhatsappConfig,
} from '../../hooks/useWhatsappConfig.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'

function FieldRow({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

export default function SAWhatsAppSettingsPage() {
  const { data: config, isLoading } = useWhatsappConfig()
  const update = useUpdateWhatsappConfig()
  const test = useTestWhatsappConfig()
  const { showToast } = useToast()

  const [form, setForm] = useState({ apiKey: '', webhookSecret: '', baseUrl: '', enabled: true })
  const [showKey, setShowKey] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [apiKeyDirty, setApiKeyDirty] = useState(false)
  const [secretDirty, setSecretDirty] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    if (config) {
      setForm(f => ({
        ...f,
        apiKey: '',
        webhookSecret: '',
        baseUrl: config.baseUrl || '',
        enabled: config.enabled ?? true,
      }))
    }
  }, [config])

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave() {
    const payload = { enabled: form.enabled, baseUrl: form.baseUrl.trim() }
    if (apiKeyDirty && form.apiKey.trim()) payload.apiKey = form.apiKey.trim()
    if (secretDirty && form.webhookSecret.trim()) payload.webhookSecret = form.webhookSecret.trim()
    try {
      await update.mutateAsync(payload)
      setApiKeyDirty(false)
      setSecretDirty(false)
      setForm(f => ({ ...f, apiKey: '', webhookSecret: '' }))
      showToast('Konfigurasi WhatsApp Gateway disimpan', 'success')
    } catch {
      showToast('Gagal menyimpan konfigurasi', 'error')
    }
  }

  async function handleTest() {
    setTestResult(null)
    try {
      const res = await test.mutateAsync()
      setTestResult({ ok: true, msg: `Terhubung — ${res.deviceCount} device terdaftar di akun.` })
      showToast('Koneksi gateway berhasil', 'success')
    } catch (err) {
      const msg = err?.response?.data?.error || 'Koneksi gateway gagal'
      setTestResult({ ok: false, msg })
      showToast(msg, 'error')
    }
  }

  // Di dev origin pakai :5173 → backend :3001; di production nginx mem-proxy /api.
  const webhookUrl = `${window.location.origin.replace(':5173', ':3001')}/api/whatsapp/webhook`

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
        <h1 className="font-display text-2xl font-bold text-off-white">WhatsApp Gateway</h1>
        <p className="text-muted text-sm mt-1">
          Konfigurasi WA Gateway (wagat.web.id) — sumber notifikasi WhatsApp untuk semua tenant
        </p>
      </div>

      {/* Konfigurasi */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-gold" />
            <span className="font-semibold text-off-white">Kredensial Gateway</span>
          </div>
          <a
            href="https://wagat.web.id/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted hover:text-gold flex items-center gap-1 transition-colors"
          >
            Dokumentasi wagat <ExternalLink size={12} />
          </a>
        </CardHeader>

        <div className="p-5 space-y-5">
          {/* Master switch */}
          <div className="flex items-center justify-between p-3 bg-dark-bg rounded-xl border border-dark-border">
            <div>
              <p className="text-sm font-medium text-off-white">Aktifkan Integrasi WhatsApp</p>
              <p className="text-xs text-muted mt-0.5">Saklar utama — mematikan ini menonaktifkan WhatsApp untuk semua tenant</p>
            </div>
            <button onClick={() => set('enabled', !form.enabled)} className="text-gold transition-opacity hover:opacity-80">
              {form.enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-muted" />}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow
              label="API Key (x-api-key)"
              hint={config?.apiKeySet && !apiKeyDirty ? `Tersimpan: ${config.apiKeyMasked}` : 'Format: wag_xxxxxxxx'}
            >
              <div className="relative">
                <input
                  className="input-base pr-10"
                  type={showKey ? 'text' : 'password'}
                  placeholder={config?.apiKeySet ? '•••• (biarkan kosong jika tak diubah)' : 'Masukkan API Key'}
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
            </FieldRow>

            <FieldRow
              label="Webhook Secret"
              hint={config?.webhookSecretSet && !secretDirty ? `Tersimpan: ${config.webhookSecretMasked}` : 'Format: whsec_xxxxxxxx'}
            >
              <div className="relative">
                <input
                  className="input-base pr-10"
                  type={showSecret ? 'text' : 'password'}
                  placeholder={config?.webhookSecretSet ? '•••• (biarkan kosong jika tak diubah)' : 'Masukkan Webhook Secret'}
                  value={form.webhookSecret}
                  onChange={e => { set('webhookSecret', e.target.value); setSecretDirty(true) }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-off-white"
                  onClick={() => setShowSecret(v => !v)}
                >
                  {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </FieldRow>

            <FieldRow label="Base URL API" hint="Biarkan default kecuali memakai instance gateway sendiri">
              <input
                className="input-base"
                placeholder="https://wagat.web.id/api/v1"
                value={form.baseUrl}
                onChange={e => set('baseUrl', e.target.value)}
              />
            </FieldRow>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={handleTest} loading={test.isPending} className="gap-2">
                <Plug size={15} /> Test Koneksi
              </Button>
              {testResult && (
                <span className={`text-xs flex items-center gap-1 ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                  {testResult.ok ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
                  {testResult.msg}
                </span>
              )}
            </div>
            <Button onClick={handleSave} loading={update.isPending} className="gap-2">
              <Save size={15} /> Simpan Konfigurasi
            </Button>
          </div>
        </div>
      </Card>

      {/* Webhook URL */}
      <Card>
        <CardHeader>
          <span className="font-semibold text-off-white">Webhook URL</span>
        </CardHeader>
        <div className="p-5 space-y-3 text-sm">
          <p className="text-muted">
            Daftarkan URL berikut sebagai <span className="text-off-white">Webhook URL</span> di dashboard wagat,
            lalu salin <span className="text-off-white">Webhook Secret</span>-nya ke kolom di atas. Gateway akan
            mengirim status koneksi & pengiriman pesan ke sini (terverifikasi HMAC-SHA256).
          </p>
          <div className="flex items-center justify-between gap-3 p-3 bg-dark-bg rounded-xl border border-dark-border">
            <div className="min-w-0">
              <p className="text-xs text-muted">Webhook URL</p>
              <p className="text-off-white font-mono text-xs mt-0.5 break-all">{webhookUrl}</p>
            </div>
            <button
              className="text-muted hover:text-gold shrink-0 text-xs transition-colors"
              onClick={() => { navigator.clipboard.writeText(webhookUrl); showToast('Disalin!', 'success') }}
            >
              Salin
            </button>
          </div>
        </div>
      </Card>

      {/* Info */}
      <Card>
        <CardHeader>
          <span className="font-semibold text-off-white">Cara Kerja</span>
        </CardHeader>
        <div className="p-5 text-sm text-muted space-y-1.5">
          <p>• Satu akun wagat dipakai bersama; tiap tenant otomatis dapat satu <em>device</em> sendiri.</p>
          <p>• Tenant menghubungkan WhatsApp lewat <span className="text-off-white">Pengaturan → WhatsApp Beta</span> (scan QR).</p>
          <p>• Fitur ini hanya muncul untuk tenant yang paketnya mengaktifkan flag <span className="font-mono text-off-white">whatsapp</span>.</p>
          <p>• Saat tenant dihapus, device-nya otomatis dilepas dari gateway.</p>
        </div>
      </Card>
    </div>
  )
}
