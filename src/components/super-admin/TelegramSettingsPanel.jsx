import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Send, Save, Eye, EyeOff, ExternalLink, ToggleLeft, ToggleRight,
  Plug, CheckCircle, AlertTriangle, Bell, CalendarDays,
} from 'lucide-react'
import {
  useTelegramConfig, useUpdateTelegramConfig, useTestTelegramConfig,
} from '../../hooks/useTelegramConfig.js'
import { useToast } from '../ui/Toast.jsx'
import Card, { CardHeader } from '../ui/Card.jsx'
import Button from '../ui/Button.jsx'

function FieldRow({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}

function ToggleRow({ icon: Icon, title, desc, checked, disabled, onChange }) {
  return (
    <div className={`flex items-center justify-between p-3 bg-dark-bg rounded-xl border border-dark-border ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-2.5 min-w-0">
        {Icon && <Icon size={16} className="text-gold mt-0.5 shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-medium text-off-white">{title}</p>
          {desc && <p className="text-xs text-muted mt-0.5">{desc}</p>}
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className="text-gold transition-opacity hover:opacity-80 disabled:cursor-not-allowed shrink-0"
      >
        {checked ? <ToggleRight size={28} /> : <ToggleLeft size={28} className="text-muted" />}
      </button>
    </div>
  )
}

// Panel konfigurasi notifikasi Telegram — disematkan di halaman Laporan
// Pendaftaran (satu halaman). Memuat & menyimpan via /api/telegram/config.
export default function TelegramSettingsPanel() {
  const { data: config, isLoading } = useTelegramConfig()
  const update = useUpdateTelegramConfig()
  const test = useTestTelegramConfig()
  const { showToast } = useToast()

  const [form, setForm] = useState({
    botToken: '', chatId: '',
    enabled: false, notifyRegister: true, notifyError: true, daily: true, weekly: true, monthly: true,
  })
  const [showToken, setShowToken] = useState(false)
  const [tokenDirty, setTokenDirty] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    if (config) {
      setForm({
        botToken: '',
        chatId: config.chatId || '',
        enabled: config.enabled ?? false,
        notifyRegister: config.notifyRegister ?? true,
        notifyError: config.notifyError ?? true,
        daily: config.daily ?? true,
        weekly: config.weekly ?? true,
        monthly: config.monthly ?? true,
      })
      setTokenDirty(false)
    }
  }, [config])

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave() {
    const payload = {
      chatId: form.chatId.trim(),
      enabled: form.enabled,
      notifyRegister: form.notifyRegister,
      notifyError: form.notifyError,
      daily: form.daily,
      weekly: form.weekly,
      monthly: form.monthly,
    }
    if (tokenDirty && form.botToken.trim()) payload.botToken = form.botToken.trim()
    try {
      await update.mutateAsync(payload)
      setTokenDirty(false)
      setForm(f => ({ ...f, botToken: '' }))
      showToast('Konfigurasi Telegram disimpan', 'success')
    } catch (err) {
      showToast(err?.response?.data?.error || 'Gagal menyimpan konfigurasi', 'error')
    }
  }

  async function handleTest() {
    setTestResult(null)
    try {
      const res = await test.mutateAsync()
      const msg = `Terhubung${res.botUsername ? ` sebagai @${res.botUsername}` : ''} — pesan uji terkirim ke grup.`
      setTestResult({ ok: true, msg })
      showToast('Koneksi Telegram berhasil', 'success')
    } catch (err) {
      const msg = err?.response?.data?.error || 'Koneksi Telegram gagal'
      setTestResult({ ok: false, msg })
      showToast(msg, 'error')
    }
  }

  if (isLoading) {
    return <div className="h-48 bg-dark-card rounded-2xl animate-pulse" />
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="space-y-4 overflow-hidden"
    >
      {/* Kredensial */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Send size={18} className="text-gold" />
            <span className="font-semibold text-off-white">Notifikasi Telegram — Kredensial Bot</span>
          </div>
          <a
            href="https://core.telegram.org/bots#how-do-i-create-a-bot"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted hover:text-gold flex items-center gap-1 transition-colors"
          >
            Cara buat bot <ExternalLink size={12} />
          </a>
        </CardHeader>

        <div className="p-5 space-y-5">
          <ToggleRow
            title="Aktifkan Notifikasi Telegram"
            desc="Saklar utama — mematikan ini menghentikan semua notifikasi & laporan ke Telegram"
            checked={form.enabled}
            onChange={v => set('enabled', v)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow
              label="Bot Token"
              hint={config?.botTokenSet && !tokenDirty ? `Tersimpan: ${config.botTokenMasked}` : 'Dari @BotFather, format: 123456:ABC-DEF...'}
            >
              <div className="relative">
                <input
                  className="input-base pr-10"
                  type={showToken ? 'text' : 'password'}
                  placeholder={config?.botTokenSet ? '•••• (biarkan kosong jika tak diubah)' : 'Masukkan Bot Token'}
                  value={form.botToken}
                  onChange={e => { set('botToken', e.target.value); setTokenDirty(true) }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-off-white"
                  onClick={() => setShowToken(v => !v)}
                >
                  {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </FieldRow>

            <FieldRow label="Chat ID Grup" hint="ID grup tujuan, biasanya diawali tanda minus (mis. -1001234567890)">
              <input
                className="input-base"
                placeholder="-100xxxxxxxxxx"
                value={form.chatId}
                onChange={e => set('chatId', e.target.value)}
              />
            </FieldRow>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={handleTest} loading={test.isPending} className="gap-2">
                <Plug size={15} /> Test Kirim
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

      {/* Notifikasi & laporan */}
      <Card>
        <CardHeader>
          <span className="font-semibold text-off-white">Notifikasi & Laporan</span>
        </CardHeader>
        <div className="p-5 space-y-3">
          <ToggleRow
            icon={Bell}
            title="Notifikasi pendaftaran baru (instan)"
            desc="Kirim pesan ke grup setiap kali ada tenant baru mendaftar"
            checked={form.notifyRegister}
            disabled={!form.enabled}
            onChange={v => set('notifyRegister', v)}
          />
          <ToggleRow
            icon={AlertTriangle}
            title="Alert error aplikasi (instan)"
            desc="Kirim pesan ke grup tiap ada error aplikasi (di-throttle: error sama maks. 1x / 10 menit)"
            checked={form.notifyError}
            disabled={!form.enabled}
            onChange={v => set('notifyError', v)}
          />
          <ToggleRow
            icon={CalendarDays}
            title="Laporan harian"
            desc="Ringkasan pendaftar kemarin, dikirim tiap hari 09:00 WIB"
            checked={form.daily}
            disabled={!form.enabled}
            onChange={v => set('daily', v)}
          />
          <ToggleRow
            icon={CalendarDays}
            title="Laporan mingguan"
            desc="Ringkasan pendaftar minggu lalu, dikirim tiap Senin 08:00 WIB"
            checked={form.weekly}
            disabled={!form.enabled}
            onChange={v => set('weekly', v)}
          />
          <ToggleRow
            icon={CalendarDays}
            title="Laporan bulanan"
            desc="Ringkasan pendaftar bulan lalu, dikirim tiap tanggal 1, 08:00 WIB"
            checked={form.monthly}
            disabled={!form.enabled}
            onChange={v => set('monthly', v)}
          />
          <div className="text-xs text-muted leading-relaxed pt-1">
            Setup: buat bot via <span className="text-off-white">@BotFather</span> → salin token; tambahkan bot ke grup;
            ambil <span className="text-off-white">Chat ID</span> grup (mis. lewat <span className="text-off-white">@userinfobot</span>, biasanya diawali <span className="font-mono text-off-white">-100</span>); aktifkan saklar, simpan, lalu <span className="text-off-white">Test Kirim</span>.
          </div>
        </div>
      </Card>
    </motion.div>
  )
}
