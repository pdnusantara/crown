import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore.js'
import { useTenant, useUpdateMyTenant } from '../../hooks/useTenants.js'
import { useSubscription } from '../../hooks/useSubscription.js'
import { useAuditLogs, useAuditActions } from '../../hooks/useAuditLogs.js'
import { useIsFeatureEnabled } from '../../hooks/useFeatureFlags.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card, { CardHeader, CardBody } from '../../components/ui/Card.jsx'
import Button from '../../components/ui/Button.jsx'
import Input from '../../components/ui/Input.jsx'
import Badge from '../../components/ui/Badge.jsx'
import * as api from '../../lib/api.js'
import { Settings, Bell, Shield, Palette, Download, Upload, FileText, MessageCircle, Send, QrCode, Smartphone, RefreshCw, PowerOff, CheckCircle2, XCircle, Loader2, AlertTriangle, Phone, ArrowUpRight, ChevronLeft, ChevronRight, X, Star, Eye, EyeOff } from 'lucide-react'
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
  const { user, updateProfile } = useAuthStore()
  const navigate = useNavigate()
  const toast = useToast()
  const updateMyTenant = useUpdateMyTenant()

  // Nama AKUN (user.name) — dipakai sapaan dashboard. Beda dari nama TOKO.
  const [accountName, setAccountName] = useState('')
  const [savingAccount, setSavingAccount] = useState(false)
  useEffect(() => { if (user?.name) setAccountName(user.name) }, [user?.name])
  const handleSaveAccount = async () => {
    const name = accountName.trim()
    if (!name) { toast.error('Nama akun tidak boleh kosong'); return }
    setSavingAccount(true)
    try {
      await updateProfile({ name })   // PATCH /auth/me → update user di store → sapaan dashboard ikut berubah
      toast.success('Nama akun diperbarui')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal memperbarui nama akun')
    } finally {
      setSavingAccount(false)
    }
  }

  // Ganti password akun sendiri via PATCH /auth/me (currentPassword wajib).
  // Tombol mata (showPwd) menampilkan teks yang sedang diketik — password lama
  // tetap tak bisa dilihat (tersimpan sebagai hash).
  const [pwdForm, setPwdForm] = useState({ current: '', next: '', confirm: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)
  const setPwdField = (k, v) => setPwdForm(f => ({ ...f, [k]: v }))
  const handleChangePassword = async () => {
    const { current, next, confirm } = pwdForm
    if (!current || !next || !confirm) { toast.error(t('tenantAdmin.settings.pwdAllRequired')); return }
    if (next.length < 6) { toast.error(t('tenantAdmin.settings.pwdTooShort')); return }
    if (next !== confirm) { toast.error(t('tenantAdmin.settings.pwdMismatch')); return }
    setSavingPwd(true)
    try {
      await updateProfile({ currentPassword: current, newPassword: next })
      toast.success(t('tenantAdmin.settings.pwdChanged'))
      setPwdForm({ current: '', next: '', confirm: '' })
      setShowPwd(false)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal mengubah password')
    } finally {
      setSavingPwd(false)
    }
  }

  const { data: tenant } = useTenant(user?.tenantId)
  const { data: sub } = useSubscription(user?.tenantId)
  // Tab WhatsApp hanya untuk tenant yang paketnya mengaktifkan flag `whatsapp`.
  const whatsappEnabled = useIsFeatureEnabled(user?.tenantId, 'whatsapp')
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

  // ── Pesan transaksi (teks otomatis setelah transaksi) ──────────────────────
  // waCustomerMessage = pembuka notifikasi WA otomatis ke pelanggan.
  // waShareMessage    = penutup pesan WA yang dibagikan kasir dari struk.
  const [txMsgForm, setTxMsgForm] = useState({ waCustomerMessage: '', waShareMessage: '' })
  const [txMsgSaving, setTxMsgSaving] = useState(false)
  useEffect(() => {
    const tm = tenant?.transactionMessages
    if (tm) {
      setTxMsgForm({
        waCustomerMessage: tm.waCustomerMessage || '',
        waShareMessage:    tm.waShareMessage || '',
      })
    }
  }, [tenant?.transactionMessages])

  // ── Rating otomatis via WhatsApp setelah transaksi ─────────────────────────
  const DEFAULT_RATING_TEMPLATE =
    'Halo {nama}! Terima kasih sudah berkunjung ke {toko}.\n\n' +
    'Bagaimana pengalamanmu hari ini? Bantu kami dengan beri rating singkat di link berikut:\n' +
    '{link}\n\n' +
    'Hanya butuh 30 detik. Masukan Anda sangat berarti untuk kami.'
  const [ratingForm, setRatingForm] = useState({
    enabled: false, autoSendMinutes: 15, messageTemplate: '',
  })
  const [ratingSaving, setRatingSaving] = useState(false)
  useEffect(() => {
    const rc = tenant?.ratingConfig
    if (rc) {
      setRatingForm({
        enabled:         !!rc.enabled,
        autoSendMinutes: Number.isFinite(rc.autoSendMinutes) ? rc.autoSendMinutes : 15,
        messageTemplate: rc.messageTemplate || '',
      })
    }
  }, [tenant?.ratingConfig])

  const handleSaveRatingConfig = async () => {
    setRatingSaving(true)
    try {
      const tpl = (ratingForm.messageTemplate || '').trim()
      await updateMyTenant.mutateAsync({
        ratingConfig: {
          enabled:         !!ratingForm.enabled,
          autoSendMinutes: Math.min(1440, Math.max(1, parseInt(ratingForm.autoSendMinutes, 10) || 15)),
          messageTemplate: tpl || null,
        },
      })
      toast.success('Pengaturan rating tersimpan')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan')
    } finally {
      setRatingSaving(false)
    }
  }

  // ── Pengingat kunjungan otomatis (WhatsApp) ────────────────────────────────
  const [reminderForm, setReminderForm] = useState({
    enabled: false, inactiveDays: 30, repeat: false, sendHour: 10,
    minDelaySec: 8, maxDelaySec: 30, message: '',
  })
  const [reminderSaving, setReminderSaving]                 = useState(false)
  const [reminderRunning, setReminderRunning]               = useState(false)
  const [reminderPreview, setReminderPreview]               = useState(null)
  const [reminderConnected, setReminderConnected]           = useState(null)
  const [reminderPreviewLoading, setReminderPreviewLoading] = useState(false)
  useEffect(() => {
    const vr = tenant?.visitReminder
    if (vr) {
      setReminderForm({
        enabled:      !!vr.enabled,
        inactiveDays: vr.inactiveDays || 30,
        repeat:       !!vr.repeat,
        sendHour:     typeof vr.sendHour === 'number' ? vr.sendHour : 10,
        minDelaySec:  typeof vr.minDelaySec === 'number' ? vr.minDelaySec : 8,
        maxDelaySec:  typeof vr.maxDelaySec === 'number' ? vr.maxDelaySec : 30,
        message:      vr.message || '',
      })
    }
  }, [tenant?.visitReminder])

  // Perkiraan jumlah pelanggan yang akan diingatkan — pakai konfigurasi yang
  // SUDAH tersimpan di server (refetch setelah simpan / kirim).
  const loadReminderPreview = async () => {
    setReminderPreviewLoading(true)
    try {
      const res = await api.get('/customers/visit-reminder/preview')
      setReminderPreview(res.data?.data?.eligible ?? null)
      setReminderConnected(res.data?.data?.connected ?? null)
    } catch {
      setReminderPreview(null)
      setReminderConnected(null)
    } finally {
      setReminderPreviewLoading(false)
    }
  }
  useEffect(() => {
    if (activeTab === 'visitReminder') loadReminderPreview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const handleSaveReminder = async () => {
    setReminderSaving(true)
    try {
      // Jeda: kunci [1,600] & pastikan max ≥ min.
      const lo = Math.min(600, Math.max(1, Number(reminderForm.minDelaySec) || 8))
      const hi = Math.max(lo, Math.min(600, Math.max(1, Number(reminderForm.maxDelaySec) || 30)))
      await updateMyTenant.mutateAsync({
        visitReminder: {
          enabled:      reminderForm.enabled,
          inactiveDays: Math.min(365, Math.max(1, Number(reminderForm.inactiveDays) || 30)),
          repeat:       reminderForm.repeat,
          sendHour:     Math.min(23, Math.max(0, Number(reminderForm.sendHour) || 0)),
          minDelaySec:  lo,
          maxDelaySec:  hi,
          message:      (reminderForm.message || '').trim() || null,
        },
      })
      // Selaraskan kembali nilai yang dinormalisasi ke form.
      setReminderForm(f => ({ ...f, minDelaySec: lo, maxDelaySec: hi }))
      toast.success('Pengaturan pengingat kunjungan tersimpan')
      loadReminderPreview()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan')
    } finally {
      setReminderSaving(false)
    }
  }

  const handleRunReminder = async () => {
    if (reminderRunning) return
    setReminderRunning(true)
    try {
      const res = await api.post('/customers/visit-reminder/run', {})
      const d = res.data?.data || {}
      if (d.started) {
        toast.success(`Pengiriman dimulai di latar belakang — ${d.eligible} pelanggan akan diingatkan bertahap dengan jeda acak.`)
      } else {
        toast.success('Tidak ada pelanggan yang memenuhi kriteria pengingat saat ini.')
      }
      loadReminderPreview()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal mengirim pengingat')
    } finally {
      setReminderRunning(false)
    }
  }

  // ── Booking Page config (synced with /api/public/info) ─────────────────────
  // Default disusun supaya tenant baru langsung dapat tampilan rapi tanpa perlu
  // isi semua field — hanya logo & alamat yang dipakai dari general tab.
  const [bookingForm, setBookingForm] = useState({
    tagline: '', description: '', heroImage: null,
    showLogo: true, showHero: true, showGallery: true,
    showAddress: true, showHours: true, showSocial: true,
    mode: 'dark',
    primaryColor: '#6366F1',
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
        primaryColor:  clean(bookingForm.primaryColor) || '#6366F1',
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

  const handleSaveTransactionMessages = async () => {
    setTxMsgSaving(true)
    try {
      // String kosong → null supaya backend tak menyimpan noise & pengiriman
      // jatuh ke teks default.
      const clean = (v) => { const s = (v || '').trim(); return s || null }
      await updateMyTenant.mutateAsync({
        transactionMessages: {
          waCustomerMessage: clean(txMsgForm.waCustomerMessage),
          waShareMessage:    clean(txMsgForm.waShareMessage),
        },
      })
      toast.success('Pesan transaksi tersimpan')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan')
    } finally {
      setTxMsgSaving(false)
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

  // Lock supaya polling silent tidak meng-overwrite status/loading saat user
  // baru saja klik aksi (Hubungkan/Putuskan/dll).
  const waActionLockRef = useRef(false)
  // Timestamp klik Hubungkan terakhir — selama 15 detik berikutnya, server
  // yang masih jawab 'disconnected'/'idle' diabaikan (backend gateway sering
  // lag 1–3 detik sebelum transisi ke 'connecting'/'connected'). Tanpa ini
  // POST /connect balik dengan 'disconnected', loadWhatsAppStatus segera
  // overwrite optimistic 'connecting' → UI seperti tak terjadi apa-apa.
  const connectIntentUntilRef = useRef(0)

  const loadWhatsAppStatus = async ({ silent = false } = {}) => {
    // Polling silent saat aksi user in-flight → skip total supaya tidak
    // overwrite optimistic state.
    if (silent && waActionLockRef.current) return
    try {
      if (!silent) setWaState(prev => ({ ...prev, loading: true }))
      const res = await api.get('/whatsapp/status')
      const data = res.data?.data || {}
      let serverStatus = data.status || 'idle'
      // Cegah downgrade dari intent 'connecting' ke 'disconnected'/'idle' lama
      // saat backend belum sempat sinkron (umum 1–3 detik setelah POST).
      const intentActive = Date.now() < connectIntentUntilRef.current
      if (intentActive && (serverStatus === 'disconnected' || serverStatus === 'idle')) {
        serverStatus = 'connecting'
      } else if (serverStatus !== 'disconnected' && serverStatus !== 'idle') {
        connectIntentUntilRef.current = 0 // backend sudah menyusul → lepas guard
      }
      setWaState(prev => ({
        ...prev,
        loading: silent ? prev.loading : false,
        status: serverStatus,
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
      if (!silent) setWaState(prev => ({ ...prev, loading: false }))
      if (!silent) toast.error(err?.response?.data?.error || 'Gagal memuat status WhatsApp')
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
    // Guard re-entry: kalau loading sudah true (user nge-spam klik / mouse
    // double-click), abaikan klik berikutnya supaya tidak kirim 2 POST.
    if (waState.loading || waActionLockRef.current) return
    waActionLockRef.current = true
    connectIntentUntilRef.current = Date.now() + 15_000
    // Transisi optimistik ke 'connecting' supaya tombol langsung berubah dari
    // "Hubungkan WhatsApp" ke "Batalkan" + status pill ikut bergerak. Tanpa
    // ini ada celah ~0.5–2 detik antara click dan loadWhatsAppStatus selesai
    // di mana user mengira tak jalan dan klik lagi.
    setWaState(prev => ({ ...prev, loading: true, status: 'connecting', lastError: null }))
    toast.success('Memulai koneksi WhatsApp…')
    try {
      await api.post('/whatsapp/connect')
      waActionLockRef.current = false
      await loadWhatsAppStatus()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal memulai koneksi WhatsApp')
      connectIntentUntilRef.current = 0
      waActionLockRef.current = false
      try { await loadWhatsAppStatus({ silent: true }) } catch {}
      setWaState(prev => ({ ...prev, loading: false }))
    }
  }

  const disconnectWhatsApp = async () => {
    if (waState.loading || waActionLockRef.current) return
    waActionLockRef.current = true
    // Putuskan koneksi → otomatis batalkan intent connect aktif.
    connectIntentUntilRef.current = 0
    setWaState(prev => ({ ...prev, loading: true }))
    toast.success('Memutuskan koneksi WhatsApp…')
    try {
      await api.post('/whatsapp/disconnect')
      waActionLockRef.current = false
      await loadWhatsAppStatus()
      toast.success('WhatsApp terputus')
    } catch (err) {
      waActionLockRef.current = false
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
  // lebih jarang saat sudah connected/idle. Polling pakai mode silent supaya
  // tidak mematikan `loading` yang sedang dipakai tombol aksi user.
  //
  // Pisah jadi dua useEffect: (1) initial load HANYA saat tab dibuka,
  // (2) interval setup yang ulang saat status berubah. Tanpa pemisahan ini,
  // setState optimistik (mis. `status:'connecting'` saat klik Hubungkan) akan
  // memicu useEffect re-run → loadWhatsAppStatus non-silent → overwrite balik
  // ke status server ('disconnected') dalam < 100ms → UI terlihat seperti
  // klik tak jalan.
  useEffect(() => {
    if (activeTab === 'whatsapp') loadWhatsAppStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'whatsapp') return
    const fastStates = ['awaiting_qr', 'connecting', 'authenticated', 'loading']
    const interval = fastStates.includes(waState.status) ? 2500 : 10000
    const timer = setInterval(() => loadWhatsAppStatus({ silent: true }), interval)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, waState.status])

  const TABS = [
    { id: 'general', label: t('tenantAdmin.settings.tabGeneral') },
    { id: 'bookingPage', label: 'Halaman Booking' },
    ...(whatsappEnabled ? [{ id: 'whatsapp', label: 'WhatsApp Beta' }] : []),
    { id: 'transactionMsg', label: 'Pesan Transaksi' },
    ...(whatsappEnabled ? [{ id: 'visitReminder', label: 'Pengingat Kunjungan' }] : []),
    ...(whatsappEnabled ? [{ id: 'ratingAuto', label: 'Rating Otomatis' }] : []),
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
              className={`px-4 py-2 rounded-lg text-sm font-medium text-center transition-all w-full sm:w-auto ${lastOdd ? 'col-span-2 sm:col-span-1' : ''} ${activeTab === tab.id ? 'bg-brand text-dark' : 'text-muted hover:text-off-white'}`}
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
                <Settings className="w-5 h-5 text-brand" />
                <h3 className="font-semibold text-off-white">{t('tenantAdmin.settings.businessInfo')}</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <Input label={t('tenantAdmin.settings.tenantName')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <p className="mt-1 text-[11px] text-muted leading-snug">
                  Nama bisnis yang tampil di <b className="text-off-white">struk POS</b>, halaman <b className="text-off-white">booking publik</b> /book, dan email transaksi. Beda dari "Nama Akun" (sapaan dashboard owner) di bawah.
                </p>
              </div>
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
                  className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/50"
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

          {/* Akun Saya — nama yang muncul di sapaan dashboard (BEDA dari nama toko) */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-brand" />
                <h3 className="font-semibold text-off-white">Akun Saya</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <Input
                label="Nama akun"
                placeholder="Nama Anda"
                value={accountName}
                onChange={e => setAccountName(e.target.value)}
              />
              <p className="text-xs text-muted">
                Nama ini dipakai untuk sapaan di dashboard (&ldquo;Selamat Pagi, …&rdquo;) dan inisial avatar Anda. <span className="text-amber-300">TIDAK muncul di struk POS atau halaman booking publik</span> — itu pakai <span className="text-off-white">Nama Bisnis</span> di kartu di atas. Email &amp; peran akun tidak bisa diubah dari sini.
              </p>
              <Button variant="secondary" onClick={handleSaveAccount} fullWidth loading={savingAccount}>
                Simpan Nama Akun
              </Button>
            </CardBody>
          </Card>

          {/* Data faktur (untuk PT/CV — muncul di invoice cetak) */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand" />
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
                <Bell className="w-5 h-5 text-brand" />
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
                    className={`w-11 h-6 rounded-full transition-colors relative ${notifications[n.key] ? 'bg-brand' : 'bg-dark-border'}`}
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
                <Shield className="w-5 h-5 text-brand" />
                <h3 className="font-semibold text-off-white">{t('tenantAdmin.settings.security')}</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <Input
                label={t('tenantAdmin.settings.currentPassword')}
                type={showPwd ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="current-password"
                value={pwdForm.current}
                onChange={e => setPwdField('current', e.target.value)}
              />
              <Input
                label={t('tenantAdmin.settings.newPassword')}
                type={showPwd ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="new-password"
                value={pwdForm.next}
                onChange={e => setPwdField('next', e.target.value)}
              />
              <Input
                label={t('tenantAdmin.settings.confirmPassword')}
                type={showPwd ? 'text' : 'password'}
                placeholder="••••••••"
                autoComplete="new-password"
                value={pwdForm.confirm}
                onChange={e => setPwdField('confirm', e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-off-white transition-colors"
              >
                {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showPwd ? t('tenantAdmin.settings.hidePassword') : t('tenantAdmin.settings.showPassword')}
              </button>
              <Button variant="secondary" fullWidth disabled={savingPwd} onClick={handleChangePassword}>
                {savingPwd ? t('tenantAdmin.settings.changingPassword') : t('tenantAdmin.settings.changePassword')}
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-brand" />
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
                    <div className="p-4 bg-brand/10 border border-brand/20 rounded-xl mb-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          <p className="font-semibold text-brand">Paket {sub.package}</p>
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

      {activeTab === 'transactionMsg' && (
        <div className="max-w-2xl">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-brand" />
                <h3 className="font-semibold text-off-white">Pesan Otomatis Setelah Transaksi</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-6">
              <p className="text-sm text-muted">
                Sesuaikan teks pesan WhatsApp yang dikirim ke pelanggan setelah transaksi.
                Gunakan <code className="text-brand bg-dark-surface px-1 py-0.5 rounded">{'{nama}'}</code> untuk
                menyisipkan nama pelanggan dan <code className="text-brand bg-dark-surface px-1 py-0.5 rounded">{'{toko}'}</code> untuk
                nama toko.
              </p>

              {/* Pesan WA otomatis ke pelanggan */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-off-white">
                  Pesan WhatsApp otomatis ke pelanggan
                </label>
                <textarea
                  value={txMsgForm.waCustomerMessage}
                  onChange={e => setTxMsgForm(f => ({ ...f, waCustomerMessage: e.target.value }))}
                  rows={3}
                  maxLength={500}
                  placeholder="Terima kasih sudah bertransaksi."
                  className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-lg px-3 py-2 text-sm outline-none focus:border-brand/60 resize-none"
                />
                <div className="flex justify-between gap-3">
                  <p className="text-[11px] text-muted">
                    Kalimat pembuka notifikasi otomatis. Rincian transaksi (total, cabang, waktu)
                    ditambahkan otomatis di bawahnya.
                    {!whatsappEnabled && ' Memerlukan fitur WhatsApp Beta aktif & notifikasi pelanggan dinyalakan.'}
                  </p>
                  <span className="text-[11px] text-muted flex-shrink-0 tabular-nums">{txMsgForm.waCustomerMessage.length}/500</span>
                </div>
              </div>

              {/* Penutup pesan WA share manual */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-off-white">
                  Penutup pesan WhatsApp share manual (kasir)
                </label>
                <textarea
                  value={txMsgForm.waShareMessage}
                  onChange={e => setTxMsgForm(f => ({ ...f, waShareMessage: e.target.value }))}
                  rows={3}
                  maxLength={500}
                  placeholder="Terima kasih sudah berkunjung! 🙏"
                  className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-lg px-3 py-2 text-sm outline-none focus:border-brand/60 resize-none"
                />
                <div className="flex justify-between gap-3">
                  <p className="text-[11px] text-muted">
                    Kalimat penutup saat kasir membagikan struk lewat tombol WhatsApp di halaman kasir.
                    Tombol share manual otomatis disembunyikan bila notifikasi otomatis di atas sudah aktif —
                    agar pelanggan tak menerima dua pesan.
                  </p>
                  <span className="text-[11px] text-muted flex-shrink-0 tabular-nums">{txMsgForm.waShareMessage.length}/500</span>
                </div>
              </div>

              <Button
                icon={MessageCircle}
                onClick={handleSaveTransactionMessages}
                loading={txMsgSaving}
                disabled={txMsgSaving}
              >
                Simpan Pesan
              </Button>
            </CardBody>
          </Card>
        </div>
      )}

      {activeTab === 'visitReminder' && (
        <div className="max-w-2xl">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-brand" />
                <h3 className="font-semibold text-off-white">Pengingat Kunjungan Otomatis</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-6">
              <p className="text-sm text-muted">
                Kirim pesan WhatsApp otomatis ke pelanggan yang sudah lama tidak berkunjung,
                agar mereka kembali. Pesan dikirim dari nomor WhatsApp toko yang tersambung
                di tab WhatsApp Beta.
              </p>

              {/* Aktifkan */}
              <label className="flex items-start gap-2.5 p-3 bg-dark-surface rounded-xl border border-dark-border cursor-pointer hover:border-brand/30 transition-colors">
                <input
                  type="checkbox"
                  checked={reminderForm.enabled}
                  onChange={e => setReminderForm(f => ({ ...f, enabled: e.target.checked }))}
                  className="mt-0.5 accent-brand"
                />
                <div className="text-sm">
                  <p className="text-off-white font-medium">Aktifkan pengingat kunjungan</p>
                  <p className="text-xs text-muted mt-0.5">Job berjalan otomatis tiap hari pada jam yang Anda tentukan.</p>
                </div>
              </label>

              {/* Ambang hari + jam kirim */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-off-white">
                    Ingatkan setelah tidak berkunjung
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={reminderForm.inactiveDays}
                      onChange={e => setReminderForm(f => ({ ...f, inactiveDays: e.target.value }))}
                      className="w-24 bg-dark-surface border border-dark-border text-off-white rounded-lg px-3 py-2 text-sm outline-none focus:border-brand/60"
                    />
                    <span className="text-sm text-muted">hari</span>
                  </div>
                  <p className="text-[11px] text-muted">Mis. 30 = pelanggan yang sudah 30 hari tak datang.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-off-white">
                    Jam kirim (zona waktu toko)
                  </label>
                  <select
                    value={reminderForm.sendHour}
                    onChange={e => setReminderForm(f => ({ ...f, sendHour: Number(e.target.value) }))}
                    className="w-full bg-dark-surface border border-dark-border text-off-white rounded-lg px-3 py-2 text-sm outline-none focus:border-brand/60"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted">Zona waktu toko: {tenant?.timezone || DEFAULT_TZ}.</p>
                </div>
              </div>

              {/* Mode frekuensi */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-off-white">Frekuensi pengingat</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { val: false, title: 'Sekali saja', desc: 'Diingatkan 1× per masa nonaktif. Anti-spam.' },
                    { val: true,  title: 'Berulang',   desc: `Kirim ulang tiap ${reminderForm.inactiveDays || 30} hari selama nonaktif.` },
                  ].map(opt => (
                    <button
                      key={String(opt.val)}
                      type="button"
                      onClick={() => setReminderForm(f => ({ ...f, repeat: opt.val }))}
                      className={`text-left p-3 rounded-xl border transition-colors ${reminderForm.repeat === opt.val ? 'border-brand bg-brand/10' : 'border-dark-border bg-dark-surface hover:border-brand/30'}`}
                    >
                      <p className="text-sm font-medium text-off-white">{opt.title}</p>
                      <p className="text-[11px] text-muted mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Jeda acak antar pesan — anti-blokir WhatsApp */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-off-white">Jeda acak antar pesan</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={reminderForm.minDelaySec}
                    onChange={e => setReminderForm(f => ({ ...f, minDelaySec: e.target.value }))}
                    className="w-24 bg-dark-surface border border-dark-border text-off-white rounded-lg px-3 py-2 text-sm outline-none focus:border-brand/60"
                  />
                  <span className="text-sm text-muted">sampai</span>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={reminderForm.maxDelaySec}
                    onChange={e => setReminderForm(f => ({ ...f, maxDelaySec: e.target.value }))}
                    className="w-24 bg-dark-surface border border-dark-border text-off-white rounded-lg px-3 py-2 text-sm outline-none focus:border-brand/60"
                  />
                  <span className="text-sm text-muted">detik</span>
                </div>
                <p className="text-[11px] text-muted">
                  Tiap pesan dikirim dengan jeda <span className="text-off-white">acak</span> dalam rentang ini —
                  mencegah pola pengiriman beruntun yang berisiko memicu blokir nomor WhatsApp.
                  Disarankan minimal 5 detik. Untuk daftar penerima besar, gunakan jeda lebih panjang.
                </p>
              </div>

              {/* Teks pesan */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-off-white">Teks pesan pengingat</label>
                <textarea
                  value={reminderForm.message}
                  onChange={e => setReminderForm(f => ({ ...f, message: e.target.value }))}
                  rows={4}
                  maxLength={600}
                  placeholder="Halo {nama}! Sudah {hari} hari sejak kunjungan terakhir Anda di {toko}. Kami tunggu kunjungan Anda berikutnya 😊"
                  className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-lg px-3 py-2 text-sm outline-none focus:border-brand/60 resize-none"
                />
                <div className="flex justify-between gap-3">
                  <p className="text-[11px] text-muted">
                    Placeholder: <code className="text-brand bg-dark-surface px-1 py-0.5 rounded">{'{nama}'}</code> nama
                    pelanggan, <code className="text-brand bg-dark-surface px-1 py-0.5 rounded">{'{toko}'}</code> nama
                    toko, <code className="text-brand bg-dark-surface px-1 py-0.5 rounded">{'{hari}'}</code> jumlah hari
                    sejak kunjungan terakhir. Dikosongkan = pakai teks bawaan.
                  </p>
                  <span className="text-[11px] text-muted flex-shrink-0 tabular-nums">{reminderForm.message.length}/600</span>
                </div>
              </div>

              {/* Peringatan WhatsApp belum tersambung */}
              {reminderConnected === false && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-300">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>WhatsApp toko belum tersambung — pengingat tidak akan terkirim sampai WhatsApp dihubungkan di tab WhatsApp Beta.</span>
                </div>
              )}

              {/* Perkiraan jumlah penerima */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-dark-surface border border-dark-border text-sm">
                <Bell className="w-4 h-4 text-brand flex-shrink-0" />
                <span className="text-muted">
                  {reminderPreviewLoading
                    ? 'Menghitung perkiraan penerima…'
                    : reminderPreview == null
                      ? 'Perkiraan penerima belum tersedia.'
                      : <>Saat ini <span className="text-off-white font-semibold">{reminderPreview} pelanggan</span> memenuhi kriteria pengingat (berdasarkan pengaturan tersimpan).</>}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={handleSaveReminder} loading={reminderSaving} disabled={reminderSaving}>
                  Simpan Pengaturan
                </Button>
                <Button
                  variant="secondary"
                  icon={Send}
                  onClick={handleRunReminder}
                  loading={reminderRunning}
                  disabled={reminderRunning}
                >
                  Kirim Pengingat Sekarang
                </Button>
              </div>
              <p className="text-[11px] text-muted -mt-2">
                "Kirim Sekarang" mengirim langsung ke pelanggan yang memenuhi kriteria tersimpan,
                tanpa menunggu jadwal. WhatsApp toko harus tersambung.
              </p>
            </CardBody>
          </Card>
        </div>
      )}

      {activeTab === 'ratingAuto' && (
        <div className="max-w-2xl">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-brand" />
                <h3 className="font-semibold text-off-white">Rating Otomatis via WhatsApp</h3>
              </div>
            </CardHeader>
            <CardBody className="space-y-5">
              <p className="text-sm text-muted">
                Aktifkan fitur ini supaya sistem otomatis mengirim link rating ke pelanggan
                setelah transaksi selesai. Pelanggan akan diarahkan ke halaman publik untuk
                memberi bintang & komentar — Anda bisa melihatnya di halaman <strong>Rating</strong>.
                Gunakan placeholder <code className="text-brand bg-dark-surface px-1 py-0.5 rounded">{'{nama}'}</code>,{' '}
                <code className="text-brand bg-dark-surface px-1 py-0.5 rounded">{'{toko}'}</code>, dan{' '}
                <code className="text-brand bg-dark-surface px-1 py-0.5 rounded">{'{link}'}</code>.
              </p>
              <div className="rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-[12px] text-off-white/90">
                <strong className="text-brand">Catatan:</strong> hanya transaksi yang selesai{' '}
                <em>setelah</em> fitur diaktifkan yang akan menerima link. Transaksi lama tidak akan
                dikirimi link supaya pelanggan tidak terganggu.
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ratingForm.enabled}
                  onChange={(e) => setRatingForm(f => ({ ...f, enabled: e.target.checked }))}
                  className="mt-1 w-4 h-4 accent-brand"
                />
                <span className="text-sm text-off-white">
                  Aktifkan kirim link rating otomatis ke pelanggan
                  <span className="block text-[11px] text-muted">
                    Hanya pelanggan dengan nomor HP yang menerima link. WhatsApp toko harus tersambung.
                  </span>
                </span>
              </label>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-off-white">
                  Kirim setelah (menit)
                </label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={ratingForm.autoSendMinutes}
                  onChange={(e) => setRatingForm(f => ({ ...f, autoSendMinutes: e.target.value }))}
                  className="w-32 bg-dark-surface border border-dark-border text-off-white rounded-lg px-3 py-2 text-sm outline-none focus:border-brand/60"
                />
                <p className="text-[11px] text-muted">
                  Jeda antara transaksi selesai dan link dikirim. Default 15 menit — beri waktu
                  pelanggan meninggalkan toko dulu supaya tidak canggung.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-off-white">
                  Template pesan WhatsApp
                </label>
                <textarea
                  value={ratingForm.messageTemplate}
                  onChange={(e) => setRatingForm(f => ({ ...f, messageTemplate: e.target.value }))}
                  rows={6}
                  maxLength={2000}
                  placeholder={DEFAULT_RATING_TEMPLATE}
                  className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-lg px-3 py-2 text-sm outline-none focus:border-brand/60 resize-none font-mono"
                />
                <div className="flex justify-between gap-3">
                  <p className="text-[11px] text-muted">
                    Kosongkan untuk pakai template default. Variabel:{' '}
                    <code className="text-brand">{'{nama}'}</code>{' '}
                    <code className="text-brand">{'{toko}'}</code>{' '}
                    <code className="text-brand">{'{link}'}</code>
                  </p>
                  <span className="text-[11px] text-muted flex-shrink-0 tabular-nums">
                    {ratingForm.messageTemplate.length}/2000
                  </span>
                </div>
              </div>

              <Button
                icon={Star}
                onClick={handleSaveRatingConfig}
                loading={ratingSaving}
                disabled={ratingSaving}
              >
                Simpan Pengaturan
              </Button>
            </CardBody>
          </Card>
        </div>
      )}

      {activeTab === 'backup' && (
        <div className="max-w-xl">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-brand" />
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
                className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-4 pr-9 py-2.5 text-sm outline-none focus:border-brand/60"
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
              className="bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2 text-sm outline-none focus:border-brand/60 max-w-[170px]"
            >
              <option value="">{t('tenantAdmin.settings.allActions')}</option>
              {auditActions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <button
              onClick={() => refetchAudit()}
              disabled={auditFetching}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dark-border text-sm text-muted hover:border-brand/30 hover:text-off-white transition-all disabled:opacity-40"
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
                    className="p-1.5 rounded-lg border border-dark-border text-muted hover:text-off-white hover:border-brand/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    onClick={() => setAuditPage(p => Math.min(auditTotalPages, p + 1))}
                    disabled={auditPage >= auditTotalPages}
                    aria-label="Halaman berikutnya"
                    className="p-1.5 rounded-lg border border-dark-border text-muted hover:text-off-white hover:border-brand/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
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
            <MessageCircle className="w-5 h-5 text-brand" />
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
                <Smartphone className="w-4 h-4 text-brand" />
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
            <label className="flex items-start gap-2.5 p-3 bg-dark-surface rounded-xl border border-dark-border cursor-pointer hover:border-brand/30 transition-colors">
              <input
                type="checkbox"
                checked={waState.settings.enabled}
                onChange={e => setSettings({ enabled: e.target.checked })}
                className="mt-0.5 accent-brand"
              />
              <div className="text-sm">
                <p className="text-off-white font-medium">Notifikasi transaksi otomatis</p>
                <p className="text-xs text-muted mt-0.5">Setiap transaksi POS langsung dikirim ke nomor admin.</p>
              </div>
            </label>
            <label className="flex items-start gap-2.5 p-3 bg-dark-surface rounded-xl border border-dark-border cursor-pointer hover:border-brand/30 transition-colors">
              <input
                type="checkbox"
                checked={waState.settings.notifyCustomer}
                onChange={e => setSettings({ notifyCustomer: e.target.checked })}
                className="mt-0.5 accent-brand"
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
            <Button onClick={onConnect} loading={waState.loading} icon={QrCode} disabled={waState.loading}>
              {waState.loading ? 'Menghubungkan…' : 'Hubungkan WhatsApp'}
            </Button>
          )}
          {isSleeping && (
            <Button onClick={onSendTest} loading={waState.loading} icon={Send} disabled={!phoneOk || waState.loading}>
              {waState.loading ? 'Mengirim…' : 'Bangunkan & Kirim Tes'}
            </Button>
          )}
          {isInProgress && (
            <Button onClick={onDisconnect} loading={waState.loading} variant="outline" icon={PowerOff} disabled={waState.loading}>
              {waState.loading ? 'Memproses…' : 'Batalkan'}
            </Button>
          )}
          {isConnected && (
            <>
              <Button onClick={onSendTest} loading={waState.loading} icon={Send} disabled={!phoneOk || waState.loading}>
                {waState.loading ? 'Mengirim…' : 'Kirim Pesan Tes'}
              </Button>
              <Button onClick={onDisconnect} loading={waState.loading} variant="outline" icon={PowerOff} disabled={waState.loading}>
                {waState.loading ? 'Memutuskan…' : 'Putuskan Koneksi'}
              </Button>
            </>
          )}
          <Button onClick={onSaveSettings} loading={waState.loading} variant="secondary" icon={RefreshCw} disabled={!phoneCheck.valid || waState.loading}>
            {waState.loading ? 'Menyimpan…' : 'Simpan Pengaturan'}
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
              <Palette className="w-5 h-5 text-brand" />
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
                    className={`relative p-3 rounded-xl border text-left transition-all ${active ? 'border-brand bg-brand/5' : 'border-dark-border hover:border-brand/30'}`}
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
                      <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-brand flex items-center justify-center">
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
              <Palette className="w-5 h-5 text-brand" />
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
                className="w-full bg-dark-surface border border-dark-border rounded-xl px-3 py-2.5 text-sm text-off-white placeholder-muted resize-none focus:outline-none focus:border-brand/50"
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
                  className="w-full h-48 rounded-xl border-2 border-dashed border-dark-border hover:border-brand/40 flex flex-col items-center justify-center gap-2 text-muted hover:text-brand transition-colors disabled:opacity-60"
                >
                  {heroUploading ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin text-brand" />
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
              <label className="text-xs text-muted block mb-1">Warna aksen (brand default)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.primaryColor || '#6366F1'}
                  onChange={e => set({ primaryColor: e.target.value })}
                  className="w-12 h-10 rounded-lg bg-dark-surface border border-dark-border cursor-pointer"
                />
                <Input
                  value={form.primaryColor || ''}
                  onChange={e => set({ primaryColor: e.target.value })}
                  placeholder="#6366F1"
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
                <Settings className="w-5 h-5 text-brand" />
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
                  className="aspect-square rounded-lg border-2 border-dashed border-dark-border hover:border-brand/40 flex flex-col items-center justify-center gap-1 text-muted hover:text-brand transition-colors disabled:opacity-60"
                >
                  {galleryUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-brand" />
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
              <Send className="w-5 h-5 text-brand" />
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
                <MessageCircle className="w-5 h-5 text-brand" />
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
                    className="bg-dark-card border border-dark-border rounded-xl px-3 py-2 text-sm text-off-white focus:outline-none focus:border-brand/40"
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
                  className="w-full bg-dark-card border border-dark-border rounded-xl px-3 py-2 text-sm text-off-white placeholder-muted resize-none focus:outline-none focus:border-brand/40"
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
              <Bell className="w-5 h-5 text-brand" />
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
              <label key={k} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-dark-border hover:border-brand/30 cursor-pointer">
                <span className="text-sm text-off-white">{label}</span>
                <input type="checkbox" checked={!!form[k]} onChange={e => set({ [k]: e.target.checked })} className="accent-brand" />
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
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-dark-border text-muted hover:text-brand hover:border-brand/40 text-sm transition-colors"
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
                    <div className="h-20" style={{ background: isLight ? `linear-gradient(135deg, ${form.primaryColor || '#6366F1'}22, transparent), ${previewBg}` : `linear-gradient(135deg, ${form.primaryColor || '#6366F1'}33, transparent), ${previewSurface}` }} />
                  )}
                  <div className="p-3 -mt-8 relative">
                    {form.showLogo && tenantLogo && (
                      <img src={tenantLogo} alt="logo" className="w-12 h-12 rounded-xl border-2 object-cover mb-2"
                        style={{ borderColor: form.primaryColor || '#6366F1', background: previewBg }} />
                    )}
                    <p className="font-bold text-sm" style={{ color: previewText }}>Nama bisnis</p>
                    {form.tagline && <p className="text-[11px]" style={{ color: form.primaryColor || '#6366F1' }}>{form.tagline}</p>}
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
