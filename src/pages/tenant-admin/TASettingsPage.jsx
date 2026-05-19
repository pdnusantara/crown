import React, { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore.js'
import { useTenant, useUpdateMyTenant } from '../../hooks/useTenants.js'
import { useSubscription } from '../../hooks/useSubscription.js'
import { useAuditLogs, useAuditActions } from '../../hooks/useAuditLogs.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import Badge from '../../components/ui/Badge.jsx'
import * as api from '../../lib/api.js'
import { Settings, Bell, Shield, Palette, Download, Upload, FileText, MessageCircle, Send, QrCode, Smartphone, RefreshCw, PowerOff, CheckCircle2, XCircle, Loader2, AlertTriangle, Phone, ArrowUpRight, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { formatDistanceToNow } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { formatRupiah, formatDateTime } from '../../utils/format.js'
import { FALLBACK_TIMEZONES, DEFAULT_TZ } from '../../utils/timezone.js'

// Warna badge log aktivitas mengikuti severity dari backend AuditLog.
const SEVERITY_VARIANT = { info: 'info', success: 'success', warning: 'warning', error: 'danger' }
const AUDIT_LIMIT = 15

export default function TASettingsPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const toast = useToast()
  const updateMyTenant = useUpdateMyTenant()

  const { data: tenant } = useTenant(user?.tenantId)
  const { data: sub } = useSubscription(user?.tenantId)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    openTime: '09:00',
    closeTime: '21:00',
    taxRate: 10,
    currency: 'IDR',
    timezone: DEFAULT_TZ,
    // Tax / billing identity
    companyName: '',
    npwp: '',
    taxAddress: '',
  })
  useEffect(() => {
    if (tenant) {
      setForm(f => ({
        ...f,
        name:        tenant.name || '',
        phone:       tenant.phone || '',
        address:     tenant.address || '',
        timezone:    tenant.timezone || DEFAULT_TZ,
        companyName: tenant.companyName || '',
        npwp:        tenant.npwp || '',
        taxAddress:  tenant.taxAddress || '',
      }))
    }
  }, [tenant])

  const [notifications, setNotifications] = useState({ newBooking: true, queueFull: true, dailyReport: false })
  const [activeTab, setActiveTab] = useState('general')

  // ── Booking Page config (synced with /api/public/info) ─────────────────────
  // Default disusun supaya tenant baru langsung dapat tampilan rapi tanpa perlu
  // isi semua field — hanya logo & alamat yang dipakai dari general tab.
  const [bookingForm, setBookingForm] = useState({
    tagline: '', description: '', heroImage: null,
    showLogo: true, showHero: true, showGallery: true,
    showAddress: true, showHours: true, showSocial: true,
    mode: 'dark',
    primaryColor: '#C9A84C',
    gallery: [],
    instagram: '', tiktok: '', facebook: '',
    whatsapp: '', googleMapsUrl: '',
    testimonials: [],
  })
  const [bookingSaving, setBookingSaving] = useState(false)
  useEffect(() => {
    const bp = tenant?.bookingPage
    if (bp) {
      setBookingForm(b => ({
        ...b,
        ...bp,
        gallery: Array.isArray(bp.gallery) ? bp.gallery : [],
        testimonials: Array.isArray(bp.testimonials) ? bp.testimonials : [],
      }))
    }
  }, [tenant?.bookingPage])

  // Unggah satu gambar ke server → balik URL. Gambar booking disimpan sebagai
  // FILE (bukan base64 di JSON tenant) supaya payload kecil & tak menabrak
  // limit body request — penyebab foto besar gagal tersimpan sebelumnya.
  const [heroUploading, setHeroUploading] = useState(false)
  const [galleryUploading, setGalleryUploading] = useState(false)

  const uploadBookingImage = async (file) => {
    const fd = new FormData()
    fd.append('image', file)
    const res = await api.upload('/tenants/upload-image', fd)
    return res.data?.data?.url
  }

  const handlePickHero = async (file) => {
    if (!file) return
    setHeroUploading(true)
    try {
      const url = await uploadBookingImage(file)
      if (url) setBookingForm(f => ({ ...f, heroImage: url }))
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal mengunggah gambar')
    } finally {
      setHeroUploading(false)
    }
  }
  const handleAddGalleryFiles = async (files) => {
    const list = Array.from(files || [])
    if (list.length === 0) return
    setGalleryUploading(true)
    try {
      const urls = []
      for (const file of list) {
        const url = await uploadBookingImage(file)
        if (url) urls.push(url)
      }
      if (urls.length) setBookingForm(f => ({ ...f, gallery: [...f.gallery, ...urls].slice(0, 12) }))
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal mengunggah gambar')
    } finally {
      setGalleryUploading(false)
    }
  }
  const handleRemoveGallery = (idx) => {
    setBookingForm(f => ({ ...f, gallery: f.gallery.filter((_, i) => i !== idx) }))
  }
  const handleSaveBookingPage = async () => {
    setBookingSaving(true)
    try {
      // Strip empty strings to null so backend Json doesn't store noise.
      const clean = (v) => (v == null || v === '' ? null : v)
      const payload = {
        tagline:       clean(bookingForm.tagline),
        description:   clean(bookingForm.description),
        heroImage:     bookingForm.heroImage || null,
        showLogo:      !!bookingForm.showLogo,
        showHero:      !!bookingForm.showHero,
        showGallery:   !!bookingForm.showGallery,
        showAddress:   !!bookingForm.showAddress,
        showHours:     !!bookingForm.showHours,
        showSocial:    !!bookingForm.showSocial,
        mode:          bookingForm.mode === 'light' ? 'light' : 'dark',
        primaryColor:  clean(bookingForm.primaryColor) || '#C9A84C',
        gallery:       bookingForm.gallery,
        instagram:     clean(bookingForm.instagram),
        tiktok:        clean(bookingForm.tiktok),
        facebook:      clean(bookingForm.facebook),
        whatsapp:      clean(bookingForm.whatsapp),
        googleMapsUrl: clean(bookingForm.googleMapsUrl),
        testimonials:  bookingForm.testimonials,
      }
      await updateMyTenant.mutateAsync({ bookingPage: payload })
      toast.success('Pengaturan halaman booking tersimpan')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan')
    } finally {
      setBookingSaving(false)
    }
  }
  const [exporting, setExporting] = useState(false)
  // ── Log aktivitas (real backend AuditLog) ──────────────────────────────────
  const [auditFilter, setAuditFilter]           = useState({ action: '', search: '' })
  const [auditSearchInput, setAuditSearchInput] = useState('')
  const [auditPage, setAuditPage]               = useState(1)
  const [auditExporting, setAuditExporting]     = useState(false)

  // Debounce 350ms — tak query tiap ketik.
  useEffect(() => {
    const tmr = setTimeout(() => setAuditFilter(f => ({ ...f, search: auditSearchInput.trim() })), 350)
    return () => clearTimeout(tmr)
  }, [auditSearchInput])
  useEffect(() => { setAuditPage(1) }, [auditFilter.search, auditFilter.action])

  const auditEnabled = activeTab === 'audit'
  const auditQueryParams = useMemo(() => ({
    page: auditPage,
    limit: AUDIT_LIMIT,
    ...(auditFilter.search ? { search: auditFilter.search } : {}),
    ...(auditFilter.action ? { action: auditFilter.action } : {}),
  }), [auditPage, auditFilter])

  const {
    data: auditData, isLoading: auditLoading, isError: auditError,
    isFetching: auditFetching, refetch: refetchAudit,
  } = useAuditLogs(auditQueryParams, auditEnabled)
  const { data: auditActions = [] } = useAuditActions(auditEnabled)

  const auditLogs       = auditData?.data || []
  const auditTotal      = auditData?.total || 0
  const auditTotalPages = auditData?.totalPages || 0
  const [waState, setWaState] = useState({
    loading: false,
    status: 'idle',
    qrDataUrl: null,
    lastError: null,
    lastConnectedAt: null,
    loadingPercent: null,
    loadingMessage: null,
    notifyAdminPhoneNormalized: null,
    limitations: [],
    settings: {
      enabled: false,
      notifyAdminPhone: '',
      notifyCustomer: false,
    },
  })

  const handleSave = async () => {
    try {
      await updateMyTenant.mutateAsync({
        name:        form.name,
        phone:       form.phone || null,
        address:     form.address || null,
        timezone:    form.timezone || DEFAULT_TZ,
      })
      toast.success(t('tenantAdmin.settings.settingsSaved'))
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan pengaturan')
    }
  }

  const handleSaveTaxInfo = async () => {
    try {
      await updateMyTenant.mutateAsync({
        companyName: form.companyName || null,
        npwp:        form.npwp || null,
        taxAddress:  form.taxAddress || null,
      })
      toast.success('Data faktur tersimpan')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan')
    }
  }

  // Ekspor data tenant ke JSON — diambil langsung dari API backend (real,
  // tenant-scoped). Hanya-baca, jadi aman dipakai sebagai backup.
  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const unwrap = (res) => {
        const d = res?.data?.data
        return Array.isArray(d) ? d : (d?.data || [])
      }
      const [branches, services, staff, customers] = await Promise.all([
        api.get('/branches',  { params: { tenantId: user.tenantId } }),
        api.get('/services',  { params: { tenantId: user.tenantId } }),
        api.get('/users',     { params: { tenantId: user.tenantId } }),
        api.get('/customers', { params: { tenantId: user.tenantId, limit: 1000 } }),
      ])
      const payload = {
        version: '2.0',
        exportedAt: new Date().toISOString(),
        tenant: { id: user.tenantId, name: tenant?.name || null },
        branches:  unwrap(branches),
        services:  unwrap(services),
        staff:     unwrap(staff),
        customers: unwrap(customers),
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `crown-backup-${tenant?.slug || 'tenant'}-${format(new Date(), 'yyyy-MM-dd')}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Backup terunduh — ${payload.branches.length} cabang, ${payload.services.length} layanan, ${payload.staff.length} staf, ${payload.customers.length} pelanggan`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal mengunduh backup')
    } finally {
      setExporting(false)
    }
  }

  // Ekspor seluruh log periode (dengan filter aktif) ke CSV — bukan 1 halaman.
  const exportAuditCSV = async () => {
    if (auditExporting) return
    setAuditExporting(true)
    try {
      const res = await api.get('/audit-logs', { params: { ...auditQueryParams, page: 1, limit: 1000 } })
      const rows = res.data?.data?.data || []
      if (rows.length === 0) { toast.error('Tidak ada log untuk diekspor'); return }
      const header = ['Waktu', 'Pengguna', 'Aksi', 'Tingkat', 'Detail']
      const escape = (v) => {
        const s = String(v ?? '')
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const body = rows.map(l => [formatDateTime(l.createdAt), l.actorName, l.action, l.severity, l.detail || ''])
      const csv = [header, ...body].map(r => r.map(escape).join(',')).join('\r\n')
      const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `log-aktivitas-${format(new Date(), 'yyyy-MM-dd')}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Berhasil ekspor ${rows.length} log`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal mengekspor log')
    } finally {
      setAuditExporting(false)
    }
  }

  const loadWhatsAppStatus = async () => {
    try {
      setWaState(prev => ({ ...prev, loading: true }))
      const res = await api.get('/whatsapp/status')
      const data = res.data?.data || {}
      setWaState(prev => ({
        ...prev,
        loading: false,
        status: data.status || 'idle',
        qrDataUrl: data.qrDataUrl || null,
        lastError: data.lastError || null,
        lastConnectedAt: data.lastConnectedAt || null,
        loadingPercent: data.loadingPercent ?? null,
        loadingMessage: data.loadingMessage || null,
        notifyAdminPhoneNormalized: data.notifyAdminPhoneNormalized || null,
        limitations: data.limitations || [],
        settings: {
          enabled: !!data.settings?.enabled,
          notifyAdminPhone: data.settings?.notifyAdminPhone || '',
          notifyCustomer: !!data.settings?.notifyCustomer,
        },
      }))
    } catch (err) {
      setWaState(prev => ({ ...prev, loading: false }))
      toast.error(err?.response?.data?.error || 'Gagal memuat status WhatsApp')
    }
  }

  const saveWhatsAppSettings = async () => {
    try {
      setWaState(prev => ({ ...prev, loading: true }))
      await api.patch('/whatsapp/settings', waState.settings)
      await loadWhatsAppStatus()
      toast.success('Pengaturan WhatsApp disimpan')
    } catch (err) {
      setWaState(prev => ({ ...prev, loading: false }))
      toast.error(err?.response?.data?.error || 'Gagal menyimpan pengaturan WhatsApp')
    }
  }

  const connectWhatsApp = async () => {
    try {
      setWaState(prev => ({ ...prev, loading: true }))
      await api.post('/whatsapp/connect')
      await loadWhatsAppStatus()
    } catch (err) {
      setWaState(prev => ({ ...prev, loading: false }))
      toast.error(err?.response?.data?.error || 'Gagal memulai koneksi WhatsApp')
    }
  }

  const disconnectWhatsApp = async () => {
    try {
      setWaState(prev => ({ ...prev, loading: true }))
      await api.post('/whatsapp/disconnect')
      await loadWhatsAppStatus()
      toast.success('WhatsApp terputus')
    } catch (err) {
      setWaState(prev => ({ ...prev, loading: false }))
      toast.error(err?.response?.data?.error || 'Gagal memutus koneksi WhatsApp')
    }
  }

  const sendWhatsAppTest = async () => {
    try {
      setWaState(prev => ({ ...prev, loading: true }))
      await api.post('/whatsapp/test', {})
      toast.success('Pesan tes terkirim. Cek WhatsApp admin.')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal mengirim pesan tes')
    } finally {
      setWaState(prev => ({ ...prev, loading: false }))
    }
  }

  // Polling status: lebih sering saat menunggu QR/connecting/loading (UX),
  // lebih jarang saat sudah connected/idle.
  useEffect(() => {
    if (activeTab !== 'whatsapp') return
    loadWhatsAppStatus()
    const fastStates = ['awaiting_qr', 'connecting', 'authenticated', 'loading']
    const interval = fastStates.includes(waState.status) ? 2500 : 10000
    const timer = setInterval(loadWhatsAppStatus, interval)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, waState.status])

  const TABS = [
    { id: 'general', label: t('tenantAdmin.settings.tabGeneral') },
    { id: 'bookingPage', label: 'Halaman Booking' },
    { id: 'whatsapp', label: 'WhatsApp Beta' },
    { id: 'backup', label: t('tenantAdmin.settings.tabBackup') },
    { id: 'audit', label: t('tenantAdmin.settings.tabAudit') },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-off-white">{t('tenantAdmin.settings.title')}</h1>
        <p className="text-muted text-sm mt-1">{t('tenantAdmin.settings.subtitle')}</p>
      </div>

      {/* Tabs — di mobile grid 2 kolom rapi & rata (semua tab terlihat);
          di desktop kembali satu baris ringkas. */}
      <div className="grid grid-cols-2 gap-1 max-w-full sm:flex sm:w-fit bg-dark-card border border-dark-border rounded-xl p-1">
        {TABS.map((tab, idx) => {
          // Tab terakhir bila jumlahnya ganjil → lebar penuh agar tak ada sel kosong.
          const lastOdd = idx === TABS.length - 1 && TABS.length % 2 === 1
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium text-center transition-all w-full sm:w-auto ${lastOdd ? 'col-span-2 sm:col-span-1' : ''} ${activeTab === tab.id ? 'bg-gold text-dark' : 'text-muted hover:text-off-white'}`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-gold" />
                <h3 className="font-semibold text-off-white">{t('tenantAdmin.settings.businessInfo')}</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <Input label={t('tenantAdmin.settings.tenantName')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <Input label="Telepon kontak" type="tel" placeholder="08xxxxxxxxxx" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              <Input label="Alamat" placeholder="Alamat usaha" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input label={t('tenantAdmin.settings.defaultOpenTime')} type="time" value={form.openTime} onChange={e => setForm(f => ({ ...f, openTime: e.target.value }))} />
                <Input label={t('tenantAdmin.settings.defaultCloseTime')} type="time" value={form.closeTime} onChange={e => setForm(f => ({ ...f, closeTime: e.target.value }))} />
              </div>
              <Input label={t('tenantAdmin.settings.taxPercent')} type="number" value={form.taxRate} onChange={e => setForm(f => ({ ...f, taxRate: e.target.value }))} />
              <div>
                <label className="block text-xs text-muted mb-1.5">Zona Waktu</label>
                <select
                  value={form.timezone}
                  onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
                  className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/50"
                >
                  {FALLBACK_TIMEZONES.map(tz => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
                <p className="text-xs text-muted/70 mt-1">
                  Zona waktu menentukan batas hari pada laporan, jam transaksi, dan pengelompokan harian. Pastikan sesuai lokasi cabang.
                </p>
              </div>
              <Button onClick={handleSave} fullWidth loading={updateMyTenant.isPending}>{t('tenantAdmin.settings.saveSettings')}</Button>
            </CardBody>
          </Card>

          {/* Data faktur (untuk PT/CV — muncul di invoice cetak) */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-gold" />
                <h3 className="font-semibold text-off-white">Data Faktur (Opsional)</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-xs text-muted">
                Diisi jika usaha Anda berbentuk PT/CV dan butuh nama perusahaan + NPWP tercetak di invoice. Boleh dikosongkan kalau tidak relevan.
              </p>
              <Input
                label="Nama perusahaan"
                placeholder="PT/CV/UD ..."
                value={form.companyName}
                onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
              />
              <Input
                label="NPWP"
                placeholder="00.000.000.0-000.000"
                value={form.npwp}
                onChange={e => setForm(f => ({ ...f, npwp: e.target.value }))}
              />
              <Input
                label="Alamat NPWP / faktur"
                placeholder="Sesuai SK NPWP"
                value={form.taxAddress}
                onChange={e => setForm(f => ({ ...f, taxAddress: e.target.value }))}
              />
              <Button variant="secondary" onClick={handleSaveTaxInfo} fullWidth loading={updateMyTenant.isPending}>
                Simpan Data Faktur
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-gold" />
                <h3 className="font-semibold text-off-white">{t('tenantAdmin.settings.notifications')}</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              {[
                { key: 'newBooking', label: t('tenantAdmin.settings.notifNewBookingLabel'), desc: t('tenantAdmin.settings.notifNewBookingDesc') },
                { key: 'queueFull', label: t('tenantAdmin.settings.notifQueueFullLabel'), desc: t('tenantAdmin.settings.notifQueueFullDesc') },
                { key: 'dailyReport', label: t('tenantAdmin.settings.notifDailyReportLabel'), desc: t('tenantAdmin.settings.notifDailyReportDesc') },
              ].map(n => (
                <div key={n.key} className="flex items-center justify-between p-3 bg-dark-surface rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-off-white">{n.label}</p>
                    <p className="text-xs text-muted">{n.desc}</p>
                  </div>
                  <button
                    onClick={() => setNotifications(prev => ({ ...prev, [n.key]: !prev[n.key] }))}
                    className={`w-11 h-6 rounded-full transition-colors relative ${notifications[n.key] ? 'bg-gold' : 'bg-dark-border'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${notifications[n.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-gold" />
                <h3 className="font-semibold text-off-white">{t('tenantAdmin.settings.security')}</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <Input label={t('tenantAdmin.settings.currentPassword')} type="password" placeholder="••••••••" />
              <Input label={t('tenantAdmin.settings.newPassword')} type="password" placeholder="••••••••" />
              <Input label={t('tenantAdmin.settings.confirmPassword')} type="password" placeholder="••••••••" />
              <Button variant="secondary" fullWidth onClick={() => toast.info(t('tenantAdmin.settings.featureInDevelopment'))}>{t('tenantAdmin.settings.changePassword')}</Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-gold" />
                <h3 className="font-semibold text-off-white">{t('tenantAdmin.settings.subscriptionPlan')}</h3>
              </div>
            </CardHeader>
            <CardBody>
              {sub ? (() => {
                const daysLeft = differenceInDays(new Date(sub.endDate), new Date())
                const dayLabel = daysLeft < 0
                  ? `Telat ${Math.abs(daysLeft)} hari`
                  : daysLeft === 0 ? 'Berakhir hari ini' : `${daysLeft} hari lagi`
                const dayColor = daysLeft < 0 ? 'text-red-400' : daysLeft <= 7 ? 'text-amber-400' : 'text-green-400'
                return (
                  <>
                    <div className="p-4 bg-gold/10 border border-gold/20 rounded-xl mb-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <p className="font-semibold text-gold">Paket {sub.package}</p>
                          <p className="text-xs text-muted mt-0.5">
                            Aktif hingga {format(new Date(sub.endDate), 'dd MMM yyyy')}
                            <span className={`ml-1 ${dayColor}`}>· {dayLabel}</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-off-white">{formatRupiah(sub.price)}</p>
                          <p className="text-xs text-muted">{t('tenantAdmin.settings.perMonth')}</p>
                        </div>
                      </div>
                      <Badge variant={sub.status === 'active' ? 'success' : sub.status === 'overdue' ? 'danger' : 'warning'}>
                        {sub.status}
                      </Badge>
                    </div>
                  </>
                )
              })() : (
                <div className="p-4 bg-dark-surface border border-dark-border rounded-xl mb-4 text-sm text-muted">
                  Memuat data langganan…
                </div>
              )}
              <Button
                variant="secondary"
                fullWidth
                icon={ArrowUpRight}
                onClick={() => navigate('/admin/billing')}
              >
                Kelola langganan & upgrade paket
              </Button>
              <p className="text-xs text-muted mt-2 text-center">
                Perpanjang masa langganan dan upgrade paket dilakukan di halaman <span className="text-off-white">Billing</span>.
              </p>
            </CardBody>
          </Card>

        </div>
      )}

      {activeTab === 'bookingPage' && (
        <BookingPageTab
          form={bookingForm}
          setForm={setBookingForm}
          tenantLogo={tenant?.logo}
          tenantSlug={tenant?.slug}
          saving={bookingSaving}
          onSave={handleSaveBookingPage}
          onPickHero={handlePickHero}
          onAddGalleryFiles={handleAddGalleryFiles}
          onRemoveGallery={handleRemoveGallery}
          heroUploading={heroUploading}
          galleryUploading={galleryUploading}
        />
      )}

      {activeTab === 'whatsapp' && (
        <div className="grid grid-cols-1 gap-6">
          <WhatsAppCard
            waState={waState}
            setWaState={setWaState}
            onConnect={connectWhatsApp}
            onDisconnect={disconnectWhatsApp}
            onSaveSettings={saveWhatsAppSettings}
            onSendTest={sendWhatsAppTest}
          />
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="max-w-xl">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-gold" />
                <h3 className="font-semibold text-off-white">{t('tenantAdmin.settings.exportData')}</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm text-muted">
                Unduh seluruh data toko (cabang, layanan, staf, pelanggan) sebagai
                berkas JSON untuk arsip atau cadangan. Data diambil langsung dari
                server — selalu yang terbaru.
              </p>
              <Button icon={Download} fullWidth onClick={handleExport} loading={exporting} disabled={exporting}>
                {exporting ? 'Menyiapkan…' : t('tenantAdmin.settings.downloadBackup')}
              </Button>
            </CardBody>
          </Card>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="space-y-4">
          {/* Filter bar */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <input
                type="text"
                inputMode="search"
                value={auditSearchInput}
                onChange={e => setAuditSearchInput(e.target.value)}
                placeholder={t('tenantAdmin.settings.searchUserDetailPlaceholder')}
                className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-4 pr-9 py-2.5 text-sm outline-none focus:border-gold/60"
              />
              {auditSearchInput && (
                <button
                  onClick={() => setAuditSearchInput('')}
                  aria-label="Hapus pencarian"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-off-white"
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <select
              value={auditFilter.action}
              onChange={e => setAuditFilter(f => ({ ...f, action: e.target.value }))}
              aria-label="Filter aksi"
              className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-gold/60 max-w-[170px]"
            >
              <option value="">{t('tenantAdmin.settings.allActions')}</option>
              {auditActions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button
              onClick={() => refetchAudit()}
              disabled={auditFetching}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dark-border text-sm text-muted hover:border-gold/30 hover:text-off-white transition-all disabled:opacity-40"
            >
              <RefreshCw size={14} className={auditFetching ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <Button
              variant="secondary"
              icon={Download}
              loading={auditExporting}
              onClick={exportAuditCSV}
              disabled={auditTotal === 0}
            >
              <span className="hidden sm:inline">{t('tenantAdmin.settings.exportCsv')}</span>
            </Button>
          </div>

          <Card>
            {auditLoading ? (
              <div className="divide-y divide-dark-border">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="h-3 w-28 bg-dark-surface rounded animate-pulse" />
                    <div className="h-3 w-24 bg-dark-surface rounded animate-pulse" />
                    <div className="h-5 w-20 bg-dark-surface rounded-full animate-pulse ml-auto" />
                  </div>
                ))}
              </div>
            ) : auditError ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-4">
                <AlertTriangle className="w-9 h-9 text-red-400" />
                <p className="text-sm text-muted">Gagal memuat log aktivitas</p>
                <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => refetchAudit()}>
                  Coba lagi
                </Button>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 gap-2 text-center px-4">
                <FileText className="w-9 h-9 text-muted/40" />
                <p className="text-sm text-muted">
                  {auditFilter.search || auditFilter.action
                    ? 'Tidak ada log yang cocok dengan filter'
                    : t('tenantAdmin.settings.noAuditLogs')}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dark-border">
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{t('tenantAdmin.settings.colTime')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{t('tenantAdmin.settings.colUser')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{t('tenantAdmin.settings.colAction')}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">{t('tenantAdmin.settings.colDetail')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map(log => (
                        <tr key={log.id} className="border-b border-dark-border/50 hover:bg-dark-surface/50 transition-colors">
                          <td className="px-4 py-3 text-xs text-muted whitespace-nowrap align-top">
                            <div>{formatDateTime(log.createdAt)}</div>
                            <div className="text-muted/60">{formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: idLocale })}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-off-white align-top">{log.actorName}</td>
                          <td className="px-4 py-3 align-top">
                            <Badge variant={SEVERITY_VARIANT[log.severity] || 'muted'} className="text-xs">{log.action}</Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted align-top max-w-md break-words">{log.detail || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-dark-border">
                  {auditLogs.map(log => (
                    <div key={log.id} className="p-4 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={SEVERITY_VARIANT[log.severity] || 'muted'} className="text-xs">{log.action}</Badge>
                        <span className="text-[11px] text-muted whitespace-nowrap flex-shrink-0">
                          {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: idLocale })}
                        </span>
                      </div>
                      {log.detail && <p className="text-sm text-off-white break-words">{log.detail}</p>}
                      <div className="flex items-center gap-1.5 text-[11px] text-muted flex-wrap">
                        <span className="text-off-white/70">{log.actorName}</span>
                        <span>·</span>
                        <span>{formatDateTime(log.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Pagination */}
            {!auditLoading && !auditError && auditTotalPages > 1 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-dark-border">
                <span className="text-xs text-muted">
                  Hal <span className="text-off-white">{auditPage}</span> / {auditTotalPages}
                  <span className="hidden sm:inline"> · {auditTotal} log</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                    disabled={auditPage <= 1}
                    aria-label="Halaman sebelumnya"
                    className="p-1.5 rounded-lg border border-dark-border text-muted hover:text-off-white hover:border-gold/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    onClick={() => setAuditPage(p => Math.min(auditTotalPages, p + 1))}
                    disabled={auditPage >= auditTotalPages}
                    aria-label="Halaman berikutnya"
                    className="p-1.5 rounded-lg border border-dark-border text-muted hover:text-off-white hover:border-gold/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

// ── WhatsApp settings card ────────────────────────────────────────────────────
// Pemetaan status backend → label & warna ramah pengguna. Status mentah dari
// whatsapp-web.js cukup teknis (awaiting_qr, auth_failed, dll) — UI menerjemahkannya
// agar admin tidak perlu menebak.
const WA_STATUS_META = {
  idle:               { label: 'Belum aktif',                                      color: 'text-muted',     bg: 'bg-dark-surface',    border: 'border-dark-border',     Icon: PowerOff },
  connecting:         { label: 'Memulai…',                                         color: 'text-blue-400',  bg: 'bg-blue-500/10',     border: 'border-blue-500/30',     Icon: Loader2,     spin: true },
  awaiting_qr:        { label: 'Menunggu scan QR',                                 color: 'text-amber-400', bg: 'bg-amber-500/10',    border: 'border-amber-500/30',    Icon: QrCode },
  authenticated:      { label: 'Tertaut, memuat data…',                            color: 'text-blue-400',  bg: 'bg-blue-500/10',     border: 'border-blue-500/30',     Icon: Loader2,     spin: true },
  loading:            { label: 'Memuat data WhatsApp…',                            color: 'text-blue-400',  bg: 'bg-blue-500/10',     border: 'border-blue-500/30',     Icon: Loader2,     spin: true },
  connected:          { label: 'Terhubung',                                        color: 'text-green-400', bg: 'bg-emerald-500/10',  border: 'border-emerald-500/30',  Icon: CheckCircle2 },
  idle_sleeping:      { label: 'Standby (otomatis bangun saat ada notifikasi)',    color: 'text-muted',     bg: 'bg-dark-surface',    border: 'border-dark-border',     Icon: PowerOff },
  auth_failed:        { label: 'Gagal autentikasi',                                color: 'text-red-400',   bg: 'bg-red-500/10',      border: 'border-red-500/30',      Icon: XCircle },
  disconnected:       { label: 'Terputus',                                         color: 'text-muted',     bg: 'bg-dark-surface',    border: 'border-dark-border',     Icon: PowerOff },
  capacity_exceeded:  { label: 'Server penuh — coba lagi nanti',                   color: 'text-amber-400', bg: 'bg-amber-500/10',    border: 'border-amber-500/30',    Icon: AlertTriangle },
  error:              { label: 'Error',                                            color: 'text-red-400',   bg: 'bg-red-500/10',      border: 'border-red-500/30',      Icon: XCircle },
}

function getWaStatusMeta(status) {
  return WA_STATUS_META[status] || WA_STATUS_META.idle
}

// Validasi nomor WA Indonesia. Kosong dianggap valid (admin belum isi).
// Selain itu: minimal 9 digit angka setelah stripping non-digit, dan diawali
// 0 / 62 / 8.
function validatePhone(raw) {
  if (!raw) return { valid: true, message: null }
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length < 9) return { valid: false, message: 'Nomor terlalu pendek (minimal 9 digit).' }
  if (!/^(0|62|8)/.test(digits)) {
    return { valid: false, message: 'Format harus diawali 0, 62, atau 8.' }
  }
  return { valid: true, message: null }
}

function WhatsAppCard({ waState, setWaState, onConnect, onDisconnect, onSaveSettings, onSendTest }) {
  const meta = getWaStatusMeta(waState.status)
  const StatusIcon = meta.Icon
  const phoneCheck = validatePhone(waState.settings.notifyAdminPhone)
  const isConnected = waState.status === 'connected'
  const isSleeping = waState.status === 'idle_sleeping'
  const isInProgress = ['connecting', 'awaiting_qr', 'authenticated', 'loading'].includes(waState.status)
  const phoneOk = phoneCheck.valid && !!waState.settings.notifyAdminPhone

  const setSettings = (patch) =>
    setWaState(prev => ({ ...prev, settings: { ...prev.settings, ...patch } }))

  const lastConnectedLabel = waState.lastConnectedAt
    ? formatDistanceToNow(new Date(waState.lastConnectedAt), { addSuffix: true, locale: idLocale })
    : null

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-gold" />
            <h3 className="font-semibold text-off-white">WhatsApp Notifikasi</h3>
          </div>
          <Badge variant="warning">Beta</Badge>
        </div>
      </CardHeader>
      <CardBody className="space-y-5">
        <p className="text-sm text-muted">
          Hubungkan satu nomor WhatsApp untuk menerima pemberitahuan transaksi otomatis. Cara kerjanya seperti WhatsApp Web — scan QR sekali, lalu sesi tersimpan di server.
        </p>

        {/* Status pill */}
        <div className={`flex items-center gap-3 p-3 rounded-xl border ${meta.bg} ${meta.border}`}>
          <StatusIcon className={`w-5 h-5 flex-shrink-0 ${meta.color} ${meta.spin ? 'animate-spin' : ''}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${meta.color}`}>
              {meta.label}
              {waState.status === 'loading' && waState.loadingPercent != null && (
                <span className="ml-1 text-muted font-normal">({waState.loadingPercent}%)</span>
              )}
            </p>
            {isConnected && lastConnectedLabel && (
              <p className="text-xs text-muted mt-0.5">Tersambung {lastConnectedLabel}</p>
            )}
            {waState.status === 'awaiting_qr' && (
              <p className="text-xs text-muted mt-0.5">QR akan otomatis di-refresh setiap beberapa detik.</p>
            )}
            {waState.status === 'authenticated' && (
              <p className="text-xs text-muted mt-0.5">Scan berhasil — WhatsApp Web sedang memuat data…</p>
            )}
            {waState.status === 'loading' && (
              <p className="text-xs text-muted mt-0.5">
                {waState.loadingMessage || 'Memuat daftar chat…'} (bisa makan 30–60 detik untuk akun besar)
              </p>
            )}
            {waState.lastError && !isConnected && (
              <p className="text-xs text-red-400 mt-0.5 break-words">{waState.lastError}</p>
            )}
          </div>
        </div>

        {/* Loading progress bar */}
        {waState.status === 'loading' && waState.loadingPercent != null && (
          <div className="h-1.5 bg-dark-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, waState.loadingPercent))}%` }}
            />
          </div>
        )}

        {/* QR display — disembunyikan sekali sudah authenticated/loading */}
        {waState.qrDataUrl && waState.status === 'awaiting_qr' && (
          <div className="flex flex-col sm:flex-row items-start gap-4 p-4 bg-dark-surface rounded-xl border border-dark-border">
            <img src={waState.qrDataUrl} alt="WhatsApp QR" className="w-48 h-48 rounded-lg bg-white p-2 flex-shrink-0" />
            <div className="text-sm space-y-2 flex-1">
              <p className="text-off-white font-medium flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-gold" />
                Scan dari WhatsApp di HP
              </p>
              <ol className="text-xs text-muted space-y-1 list-decimal list-inside">
                <li>Buka WhatsApp di HP yang akan dipakai sebagai nomor server.</li>
                <li>Ketuk menu <span className="text-off-white">Setelan / Settings</span>.</li>
                <li>Pilih <span className="text-off-white">Perangkat tertaut / Linked Devices</span>.</li>
                <li>Tap <span className="text-off-white">Tautkan perangkat / Link a Device</span>.</li>
                <li>Arahkan kamera ke QR di samping.</li>
              </ol>
              <p className="text-xs text-amber-400 flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                Jangan pakai nomor pribadi — gunakan nomor khusus operasional.
              </p>
            </div>
          </div>
        )}

        {/* Settings form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Nomor admin penerima notifikasi"
            placeholder="contoh: 08123456789"
            icon={Phone}
            value={waState.settings.notifyAdminPhone}
            onChange={e => setSettings({ notifyAdminPhone: e.target.value })}
            error={waState.settings.notifyAdminPhone && !phoneCheck.valid ? phoneCheck.message : null}
            hint={
              phoneCheck.valid && waState.notifyAdminPhoneNormalized
                ? `Akan dikirim ke +${waState.notifyAdminPhoneNormalized}`
                : 'Boleh format 08… / 62… / 8…'
            }
          />
          <div className="space-y-3">
            <label className="flex items-start gap-2.5 p-3 bg-dark-surface rounded-xl border border-dark-border cursor-pointer hover:border-gold/30 transition-colors">
              <input
                type="checkbox"
                checked={waState.settings.enabled}
                onChange={e => setSettings({ enabled: e.target.checked })}
                className="mt-0.5 accent-gold"
              />
              <div className="text-sm">
                <p className="text-off-white font-medium">Notifikasi transaksi otomatis</p>
                <p className="text-xs text-muted mt-0.5">Setiap transaksi POS langsung dikirim ke nomor admin.</p>
              </div>
            </label>
            <label className="flex items-start gap-2.5 p-3 bg-dark-surface rounded-xl border border-dark-border cursor-pointer hover:border-gold/30 transition-colors">
              <input
                type="checkbox"
                checked={waState.settings.notifyCustomer}
                onChange={e => setSettings({ notifyCustomer: e.target.checked })}
                className="mt-0.5 accent-gold"
              />
              <div className="text-sm">
                <p className="text-off-white font-medium">Kirim juga ke pelanggan</p>
                <p className="text-xs text-muted mt-0.5">Hanya jika nomor pelanggan terdaftar di transaksi.</p>
              </div>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-dark-border/50">
          {!isConnected && !isInProgress && !isSleeping && (
            <Button onClick={onConnect} loading={waState.loading} icon={QrCode}>
              Hubungkan WhatsApp
            </Button>
          )}
          {isSleeping && (
            <Button onClick={onSendTest} loading={waState.loading} icon={Send} disabled={!phoneOk}>
              Bangunkan & Kirim Tes
            </Button>
          )}
          {isInProgress && (
            <Button onClick={onDisconnect} loading={waState.loading} variant="outline" icon={PowerOff}>
              Batalkan
            </Button>
          )}
          {isConnected && (
            <>
              <Button onClick={onSendTest} loading={waState.loading} icon={Send} disabled={!phoneOk}>
                Kirim Pesan Tes
              </Button>
              <Button onClick={onDisconnect} loading={waState.loading} variant="outline" icon={PowerOff}>
                Putuskan Koneksi
              </Button>
            </>
          )}
          <Button onClick={onSaveSettings} loading={waState.loading} variant="secondary" icon={RefreshCw} disabled={!phoneCheck.valid}>
            Simpan Pengaturan
          </Button>
        </div>

        {/* Beta limitations */}
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <p className="text-xs text-amber-400 font-semibold mb-1.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            Batasan fase Beta:
          </p>
          <ul className="text-xs text-off-white space-y-1 list-disc list-inside marker:text-amber-400">
            {(waState.limitations || []).map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      </CardBody>
    </Card>
  )
}

// ── Booking Page configuration tab ────────────────────────────────────────────
function BookingPageTab({ form, setForm, tenantLogo, tenantSlug, saving, onSave, onPickHero, onAddGalleryFiles, onRemoveGallery, heroUploading, galleryUploading }) {
  const heroInputRef = React.useRef(null)
  const galleryInputRef = React.useRef(null)
  const set = (patch) => setForm(f => ({ ...f, ...patch }))
  const subdomainUrl = tenantSlug ? `https://${tenantSlug}.sembapos.com/book` : null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Editor — 2 cols */}
      <div className="lg:col-span-2 space-y-6">
        {/* Tema Tampilan */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-gold" />
              <h3 className="font-semibold text-off-white">Tema Tampilan</h3>
            </div>
          </CardHeader>
          <CardBody>
            <p className="text-xs text-muted mb-3">Pilih tampilan halaman booking publik. Pelanggan akan melihat sesuai pilihan ini.</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'dark',  title: 'Dark',  subtitle: 'Hitam matte premium', preview: { bg: '#111', surface: '#1A1A1A', text: '#F0F0F0' } },
                { id: 'light', title: 'Light', subtitle: 'Putih bersih elegan', preview: { bg: '#FAFAFA', surface: '#FFFFFF', text: '#111' } },
              ].map(opt => {
                const active = (form.mode || 'dark') === opt.id
                return (
                  <button key={opt.id} onClick={() => set({ mode: opt.id })}
                    className={`relative p-3 rounded-xl border text-left transition-all ${active ? 'border-gold bg-gold/5' : 'border-dark-border hover:border-gold/30'}`}
                  >
                    <div className="rounded-lg overflow-hidden mb-3 border border-dark-border" style={{ background: opt.preview.bg }}>
                      <div className="h-3.5" style={{ background: opt.preview.bg, borderBottom: `1px solid ${opt.id === 'dark' ? '#252525' : '#E5E5E5'}` }} />
                      <div className="p-2 space-y-1.5">
                        <div className="h-1.5 rounded w-1/2" style={{ background: opt.preview.text, opacity: 0.85 }} />
                        <div className="h-1 rounded w-3/4" style={{ background: opt.preview.text, opacity: 0.4 }} />
                        <div className="h-6 rounded mt-2" style={{ background: opt.preview.surface, border: `1px solid ${opt.id === 'dark' ? '#252525' : '#E5E5E5'}` }} />
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-off-white">{opt.title}</p>
                    <p className="text-[11px] text-muted mt-0.5">{opt.subtitle}</p>
                    {active && (
                      <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gold flex items-center justify-center">
                        <CheckCircle2 className="w-3 h-3 text-dark" />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </CardBody>
        </Card>

        {/* Hero & Branding */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-gold" />
              <h3 className="font-semibold text-off-white">Hero & Branding</h3>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label className="text-xs text-muted block mb-1">Tagline (muncul di bawah nama bisnis)</label>
              <Input
                value={form.tagline || ''}
                onChange={e => set({ tagline: e.target.value })}
                placeholder="Mis. Premium Barbershop · Open Daily 09–21"
                maxLength={140}
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Deskripsi singkat</label>
              <textarea
                rows={3}
                value={form.description || ''}
                onChange={e => set({ description: e.target.value })}
                placeholder="Ceritakan barbershop kamu dalam 1–2 paragraf…"
                className="w-full bg-dark-surface border border-dark-border rounded-xl px-3 py-2.5 text-sm text-off-white placeholder-muted resize-none focus:outline-none focus:border-gold/50"
                maxLength={2000}
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-2">Hero image (banner di atas halaman booking)</label>
              {form.heroImage ? (
                <div className="relative group">
                  <img src={form.heroImage} alt="Hero preview" className="w-full h-48 object-cover rounded-xl border border-dark-border" />
                  <button
                    onClick={() => set({ heroImage: null })}
                    className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-red-500/80 backdrop-blur text-white text-xs font-medium hover:bg-red-500"
                  >Hapus</button>
                </div>
              ) : (
                <button
                  onClick={() => heroInputRef.current?.click()}
                  disabled={heroUploading}
                  className="w-full h-48 rounded-xl border-2 border-dashed border-dark-border hover:border-gold/40 flex flex-col items-center justify-center gap-2 text-muted hover:text-gold transition-colors disabled:opacity-60"
                >
                  {heroUploading ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin text-gold" />
                      <p className="text-sm">Mengunggah…</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-6 h-6" />
                      <p className="text-sm">Klik untuk unggah foto (JPG/PNG/WebP, maks 5 MB)</p>
                    </>
                  )}
                </button>
              )}
              <input
                ref={heroInputRef} type="file" accept="image/*" hidden
                onChange={e => onPickHero(e.target.files?.[0])}
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Warna aksen (gold default)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.primaryColor || '#C9A84C'}
                  onChange={e => set({ primaryColor: e.target.value })}
                  className="w-12 h-10 rounded-lg bg-dark-surface border border-dark-border cursor-pointer"
                />
                <Input
                  value={form.primaryColor || ''}
                  onChange={e => set({ primaryColor: e.target.value })}
                  placeholder="#C9A84C"
                  className="flex-1"
                />
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Gallery */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-gold" />
                <h3 className="font-semibold text-off-white">Galeri Foto</h3>
              </div>
              <span className="text-xs text-muted">{form.gallery.length}/12</span>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {form.gallery.map((src, i) => (
                <div key={i} className="relative group aspect-square">
                  <img src={src} alt={`Gallery ${i+1}`} className="w-full h-full object-cover rounded-lg border border-dark-border" />
                  <button
                    onClick={() => onRemoveGallery(i)}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center text-red-400 text-xs font-medium transition-opacity"
                  >Hapus</button>
                </div>
              ))}
              {form.gallery.length < 12 && (
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={galleryUploading}
                  className="aspect-square rounded-lg border-2 border-dashed border-dark-border hover:border-gold/40 flex flex-col items-center justify-center gap-1 text-muted hover:text-gold transition-colors disabled:opacity-60"
                >
                  {galleryUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-gold" />
                      <span className="text-[10px]">Mengunggah…</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      <span className="text-[10px]">Tambah</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <p className="text-xs text-muted">Galeri tampil sebagai grid foto di halaman booking publik. Bisa upload banyak file sekaligus.</p>
            <input
              ref={galleryInputRef} type="file" accept="image/*" multiple hidden
              onChange={e => { onAddGalleryFiles(e.target.files); e.target.value = '' }}
            />
          </CardBody>
        </Card>

        {/* Social */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Send className="w-5 h-5 text-gold" />
              <h3 className="font-semibold text-off-white">Sosial Media & Kontak</h3>
            </div>
          </CardHeader>
          <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Instagram" placeholder="@barberkingdom"
              value={form.instagram || ''} onChange={e => set({ instagram: e.target.value })} />
            <Input label="TikTok" placeholder="@barberkingdom"
              value={form.tiktok || ''} onChange={e => set({ tiktok: e.target.value })} />
            <Input label="Facebook URL" placeholder="https://fb.com/…"
              value={form.facebook || ''} onChange={e => set({ facebook: e.target.value })} />
            <Input label="WhatsApp" placeholder="081234567890"
              value={form.whatsapp || ''} onChange={e => set({ whatsapp: e.target.value })} />
            <div className="sm:col-span-2">
              <Input label="Google Maps URL" placeholder="https://goo.gl/maps/…"
                value={form.googleMapsUrl || ''} onChange={e => set({ googleMapsUrl: e.target.value })} />
            </div>
          </CardBody>
        </Card>

        {/* Testimonials */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-gold" />
                <h3 className="font-semibold text-off-white">Testimoni Pelanggan</h3>
              </div>
              <Button
                variant="outline" size="sm"
                onClick={() => set({ testimonials: [...form.testimonials, { name: '', text: '', rating: 5 }] })}
                disabled={form.testimonials.length >= 20}
              >Tambah</Button>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {form.testimonials.length === 0 && (
              <p className="text-xs text-muted text-center py-4">Belum ada testimoni. Tambahkan untuk meningkatkan trust pelanggan baru.</p>
            )}
            {form.testimonials.map((t, idx) => (
              <div key={idx} className="bg-dark-surface border border-dark-border rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={t.name} placeholder="Nama pelanggan"
                    onChange={e => set({ testimonials: form.testimonials.map((x, i) => i === idx ? { ...x, name: e.target.value } : x) })}
                  />
                  <select
                    value={t.rating || 5}
                    onChange={e => set({ testimonials: form.testimonials.map((x, i) => i === idx ? { ...x, rating: Number(e.target.value) } : x) })}
                    className="bg-dark-card border border-dark-border rounded-xl px-3 py-2 text-sm text-off-white focus:outline-none focus:border-gold/40"
                  >
                    {[5,4,3,2,1].map(n => <option key={n} value={n}>{n}★</option>)}
                  </select>
                  <button
                    onClick={() => set({ testimonials: form.testimonials.filter((_, i) => i !== idx) })}
                    className="px-2.5 py-1.5 rounded-lg text-xs text-muted hover:text-red-400"
                  >Hapus</button>
                </div>
                <textarea
                  rows={2} value={t.text} placeholder="Komentar pelanggan…"
                  onChange={e => set({ testimonials: form.testimonials.map((x, i) => i === idx ? { ...x, text: e.target.value } : x) })}
                  className="w-full bg-dark-card border border-dark-border rounded-xl px-3 py-2 text-sm text-off-white placeholder-muted resize-none focus:outline-none focus:border-gold/40"
                  maxLength={500}
                />
              </div>
            ))}
          </CardBody>
        </Card>

        {/* Visibility toggles */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-gold" />
              <h3 className="font-semibold text-off-white">Tampilkan/Sembunyikan Section</h3>
            </div>
          </CardHeader>
          <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              ['showLogo',    'Logo barbershop'],
              ['showHero',    'Hero image'],
              ['showGallery', 'Galeri foto'],
              ['showSocial',  'Sosial media'],
            ].map(([k, label]) => (
              <label key={k} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-dark-border hover:border-gold/30 cursor-pointer">
                <span className="text-sm text-off-white">{label}</span>
                <input type="checkbox" checked={!!form[k]} onChange={e => set({ [k]: e.target.checked })} className="accent-gold" />
              </label>
            ))}
          </CardBody>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={onSave} loading={saving} icon={CheckCircle2}>
            Simpan Pengaturan
          </Button>
          {subdomainUrl && (
            <a
              href={subdomainUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-dark-border text-muted hover:text-gold hover:border-gold/40 text-sm transition-colors"
            >
              Buka halaman booking <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Live preview — 1 col, sticky on desktop */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-off-white text-sm">Preview</h3>
              <span className="text-[10px] text-muted">Tampilan publik</span>
            </div>
          </CardHeader>
          <CardBody>
            {(() => {
              const isLight = form.mode === 'light'
              const previewBg      = isLight ? '#FAFAFA' : '#111111'
              const previewSurface = isLight ? '#FFFFFF' : '#1A1A1A'
              const previewBorder  = isLight ? '#E5E5E5' : '#252525'
              const previewText    = isLight ? '#111111' : '#F0F0F0'
              const previewMuted   = isLight ? '#888888' : '#888888'
              return (
                <div className="rounded-2xl overflow-hidden border" style={{ borderColor: previewBorder, background: previewBg }}>
                  {form.showHero && form.heroImage ? (
                    <div className="relative h-32 bg-cover bg-center" style={{ backgroundImage: `url(${form.heroImage})` }}>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    </div>
                  ) : (
                    <div className="h-20" style={{ background: isLight ? `linear-gradient(135deg, ${form.primaryColor || '#C9A84C'}22, transparent), ${previewBg}` : `linear-gradient(135deg, ${form.primaryColor || '#C9A84C'}33, transparent), ${previewSurface}` }} />
                  )}
                  <div className="p-3 -mt-8 relative">
                    {form.showLogo && tenantLogo && (
                      <img src={tenantLogo} alt="logo" className="w-12 h-12 rounded-xl border-2 object-cover mb-2"
                        style={{ borderColor: form.primaryColor || '#C9A84C', background: previewBg }} />
                    )}
                    <p className="font-bold text-sm" style={{ color: previewText }}>Nama bisnis</p>
                    {form.tagline && <p className="text-[11px]" style={{ color: form.primaryColor || '#C9A84C' }}>{form.tagline}</p>}
                    {form.description && <p className="text-[10px] mt-1 line-clamp-3" style={{ color: previewMuted }}>{form.description}</p>}
                    {form.showGallery && form.gallery.length > 0 && (
                      <div className="grid grid-cols-3 gap-1 mt-2">
                        {form.gallery.slice(0, 6).map((src, i) => (
                          <img key={i} src={src} alt="" className="aspect-square object-cover rounded" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
            <p className="text-[10px] text-muted mt-2">Preview hanya menunjukkan section yang relevan; halaman publik penuh tampil di {subdomainUrl || '/book'}.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
