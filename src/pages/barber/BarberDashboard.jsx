import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ListOrdered, CheckCircle, DollarSign, ChevronRight, Clock, Play,
  Scissors, TrendingUp, Calendar, RefreshCw, Loader2, Wallet,
  ArrowRight, Trophy, Phone, ChevronLeft, Sparkles, Camera, Edit3, X,
  Eye, EyeOff, Lock,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore.js'
import { useBranchQueue, useUpdateQueueStatus } from '../../hooks/useQueue.js'
import { useTransactions } from '../../hooks/useTransactions.js'
import { useBookings } from '../../hooks/useBookings.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Card from '../../components/ui/Card.jsx'
import Avatar from '../../components/ui/Avatar.jsx'
import LiveBadge from '../../components/ui/LiveBadge.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import Button from '../../components/ui/Button.jsx'
import { formatRupiah, formatRupiahShort } from '../../utils/format.js'
import { format, isToday, parseISO, subDays, differenceInMinutes } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

const HISTORY_PAGE_SIZE = 6

// ── helpers ─────────────────────────────────────────────────────────────────
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const safeParse = (s) => {
  try { return parseISO(s) } catch { return new Date(s) }
}

const fmtTime = (s) => {
  try { return format(safeParse(s), 'HH:mm') } catch { return '' }
}

const fmtDay = (s) => {
  try { return format(safeParse(s), 'd MMM', { locale: idLocale }) } catch { return '' }
}

const initials = (n = '') =>
  n.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()

// ── Sub-components ──────────────────────────────────────────────────────────

const ACCENTS = {
  gold:  { grad: 'from-brand/20 to-brand/0',         icon: 'text-brand',         iconBg: 'bg-brand/15 border-brand/30' },
  blue:  { grad: 'from-blue-400/20 to-blue-400/0', icon: 'text-blue-300',     iconBg: 'bg-blue-500/15 border-blue-500/30' },
  green: { grad: 'from-emerald-400/20 to-emerald-400/0', icon: 'text-emerald-300', iconBg: 'bg-emerald-500/15 border-emerald-500/30' },
  amber: { grad: 'from-amber-400/20 to-amber-400/0', icon: 'text-amber-300', iconBg: 'bg-amber-500/15 border-amber-500/30' },
}

function StatCard({ icon: Icon, label, value, valueShort, accent = 'gold', delay = 0, onClick }) {
  const a = ACCENTS[accent] || ACCENTS.gold
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="group text-left w-full"
    >
      <Card className="relative overflow-hidden p-3 sm:p-4 min-w-0">
        <div className={`absolute inset-0 bg-gradient-to-br ${a.grad} opacity-60 pointer-events-none`} />
        <div className="relative flex items-start gap-3 min-w-0">
          <div className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center ${a.iconBg}`}>
            <Icon className={`w-5 h-5 ${a.icon}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] sm:text-xs text-muted leading-tight truncate">{label}</p>
            <p className="text-lg sm:text-xl font-bold text-off-white mt-0.5 leading-tight tabular-nums truncate">
              {valueShort != null ? (
                <>
                  <span className="sm:hidden">{valueShort}</span>
                  <span className="hidden sm:inline">{value}</span>
                </>
              ) : value}
            </p>
          </div>
        </div>
      </Card>
    </motion.button>
  )
}

function QueueItemCard({ item, onAdvance, busyId, t }) {
  const isInProgress = item.status === 'in-progress'
  const startedAt = isInProgress && item.updatedAt ? safeParse(item.updatedAt) : null
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!isInProgress) return
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [isInProgress])
  const elapsedMin = startedAt ? Math.max(0, differenceInMinutes(now, startedAt)) : null

  const next = isInProgress ? 'done' : 'in-progress'
  const isBusy = busyId === item.id

  return (
    <Card className="p-3 sm:p-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="shrink-0">
          <Avatar name={item.customerName} size="md" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="text-[11px] font-bold text-brand tabular-nums">{item.ticketNumber}</span>
            <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border ${
              isInProgress
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}>
              {isInProgress ? t('queue.inProgressShort') : t('queue.waiting')}
            </span>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-dark-card/80 border border-dark-border text-muted">
              {item.type === 'booking' ? 'Booking' : 'Walk-in'}
            </span>
          </div>
          <p className="font-semibold text-off-white truncate">{item.customerName}</p>
          <p className="text-xs sm:text-sm text-muted truncate">{item.services?.join(', ') || '—'}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted">
            {item.phone && (
              <span className="inline-flex items-center gap-1 min-w-0">
                <Phone className="w-3 h-3 shrink-0" />
                <span className="truncate">{item.phone}</span>
              </span>
            )}
            {isInProgress ? (
              <span className="inline-flex items-center gap-1 text-blue-400">
                <Clock className="w-3 h-3" />
                <span className="tabular-nums">{elapsedMin ?? 0} min jalan</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-400">
                <Clock className="w-3 h-3" />
                <span className="tabular-nums">~{item.waitTime || 15} min</span>
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onAdvance(item, next)}
            className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 ${
              isInProgress
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                : 'bg-brand/15 text-brand border border-brand/30 hover:bg-brand/25'
            }`}
          >
            {isBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isInProgress ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">{isInProgress ? t('queue.finish') : t('queue.start')}</span>
          </button>
        </div>
      </div>
    </Card>
  )
}

function Sparkbars({ data, max }) {
  const safeMax = Math.max(max, 1)
  return (
    <div className="flex items-end gap-1 h-12 sm:h-14">
      {data.map((d, i) => {
        const h = Math.max(4, Math.round((d.value / safeMax) * 100))
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <div className="w-full rounded-md bg-gradient-to-t from-brand to-brand-light/70 transition-all" style={{ height: `${h}%` }} title={`${d.label}: ${formatRupiah(d.value)}`} />
            <span className="text-[9px] text-muted truncate w-full text-center">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Profile Edit Modal ──────────────────────────────────────────────────────

function resizeImageToBase64(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Gagal membaca file'))
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => reject(new Error('File bukan gambar yang valid'))
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

function ProfileEditModal({ open, onClose, user, toast }) {
  const updateProfile = useAuthStore(s => s.updateProfile)
  const fileRef = useRef(null)
  const [photo, setPhoto] = useState(user?.photo || '')
  const [name, setName] = useState(user?.name || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [tab, setTab] = useState('profile')

  useEffect(() => {
    if (open) {
      setPhoto(user?.photo || '')
      setName(user?.name || '')
      setPhone(user?.phone || '')
      setCurrentPassword('')
      setNewPassword('')
      setShowPw(false)
      setImgError(false)
      setTab('profile')
    }
  }, [open, user])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 5MB')
      return
    }
    try {
      const base64 = await resizeImageToBase64(file)
      setImgError(false)
      setPhoto(base64)
    } catch (err) {
      toast.error(err?.message || 'Gagal memproses gambar')
    }
  }

  const dirty = useMemo(() => {
    if (tab === 'profile') {
      return (
        (name || '').trim() !== (user?.name || '').trim() ||
        (phone || '').trim() !== (user?.phone || '').trim() ||
        (photo || '') !== (user?.photo || '')
      )
    }
    return !!newPassword
  }, [tab, name, phone, photo, newPassword, user])

  const submit = async () => {
    if (!dirty) return
    setSaving(true)
    try {
      const payload = {}
      if (tab === 'profile') {
        if ((name || '').trim() !== (user?.name || '').trim()) payload.name = name.trim()
        if ((phone || '').trim() !== (user?.phone || '').trim()) payload.phone = phone.trim()
        if ((photo || '') !== (user?.photo || '')) payload.photo = photo || null
      } else {
        if (!currentPassword) {
          toast.error('Masukkan password lama')
          setSaving(false)
          return
        }
        if (!newPassword || newPassword.length < 6) {
          toast.error('Password baru minimal 6 karakter')
          setSaving(false)
          return
        }
        payload.currentPassword = currentPassword
        payload.newPassword = newPassword
      }
      await updateProfile(payload)
      toast.success(tab === 'password' ? 'Password berhasil diperbarui' : 'Profil berhasil disimpan')
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyimpan perubahan')
    } finally {
      setSaving(false)
    }
  }

  const initialsTxt = (name || '?').trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?'

  return (
    <Modal isOpen={open} onClose={onClose} title="Edit Profil" size="md">
      {/* Tabs */}
      <div className="flex bg-dark-card/50 border border-dark-border rounded-xl p-1 mb-5">
        <button
          type="button"
          onClick={() => setTab('profile')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'profile' ? 'bg-brand text-dark' : 'text-muted hover:text-off-white'
          }`}
        >
          Profil
        </button>
        <button
          type="button"
          onClick={() => setTab('password')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === 'password' ? 'bg-brand text-dark' : 'text-muted hover:text-off-white'
          }`}
        >
          Password
        </button>
      </div>

      {tab === 'profile' ? (
        <div className="space-y-4">
          {/* Photo picker */}
          <div className="flex flex-col items-center gap-2">
            <div
              className="relative group cursor-pointer"
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              <div className="w-24 h-24 rounded-full overflow-hidden ring-2 ring-brand/40 group-hover:ring-brand transition-all">
                {photo && !imgError ? (
                  <img
                    src={photo}
                    alt="Foto profil"
                    className="w-full h-full object-cover"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl font-semibold text-white bg-gradient-to-br from-brand to-brand-light">
                    {initialsTxt}
                  </div>
                )}
              </div>
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button type="button" onClick={() => fileRef.current?.click()} className="text-brand hover:underline">
                {photo ? 'Ganti foto' : 'Upload foto'}
              </button>
              {photo && (
                <button
                  type="button"
                  onClick={() => { setPhoto(''); setImgError(false) }}
                  className="text-muted hover:text-red-400 inline-flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Hapus
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            <p className="text-[11px] text-muted text-center">Maks 5MB · disarankan 1:1 (persegi)</p>
          </div>

          <Input label="Nama" value={name} onChange={e => setName(e.target.value)} placeholder="Nama lengkap" />
          <Input
            label="Telepon"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="08xxxxxxxxxx"
            inputMode="tel"
          />

          <div className="bg-dark-card/40 border border-dark-border/60 rounded-xl px-3 py-2 text-xs text-muted">
            <p><span className="text-off-white font-medium">Email:</span> {user?.email}</p>
            <p className="mt-0.5"><span className="text-off-white font-medium">Cabang:</span> {user?.branch?.name || '—'}</p>
            <p className="mt-0.5"><span className="text-off-white font-medium">Komisi:</span> {((user?.commissionRate ?? 0.35) * 100).toFixed(0)}%</p>
            <p className="mt-1 text-[11px] opacity-80">Email, cabang & komisi diatur oleh admin.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <Lock className="w-5 h-5 text-amber-300 shrink-0" />
            <p className="text-xs text-amber-200">Setelah ganti password, Anda mungkin harus login ulang di perangkat lain.</p>
          </div>
          <Input
            label="Password lama"
            type={showPw ? 'text' : 'password'}
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
          <Input
            label="Password baru"
            type={showPw ? 'text' : 'password'}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="Min. 6 karakter"
            autoComplete="new-password"
            hint="Gunakan kombinasi huruf, angka, dan simbol untuk keamanan."
          />
          <button
            type="button"
            onClick={() => setShowPw(s => !s)}
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-off-white"
          >
            {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPw ? 'Sembunyikan' : 'Lihat'} password
          </button>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-5 mt-5 border-t border-dark-border">
        <Button variant="ghost" onClick={onClose} disabled={saving}>Batal</Button>
        <Button onClick={submit} loading={saving} disabled={!dirty || saving}>Simpan</Button>
      </div>
    </Modal>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function BarberDashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const toast = useToast()
  const [profileOpen, setProfileOpen] = useState(false)

  const myId = user?.id
  const tenantId = user?.tenantId
  const branchId = user?.branchId
  const commissionRate = user?.commissionRate ?? 0.35

  // Queue (today, branch-scoped via hook). UI items already filtered to today.
  const { queue = [], isFetching: queueFetching } = useBranchQueue(branchId)
  const updateStatusM = useUpdateQueueStatus()
  const [busyId, setBusyId] = useState(null)

  // Today's transactions where this barber has line items (backend filters by req.user.id when role=barber)
  const todayStr = todayISO()
  const txQuery = useTransactions({
    branchId,
    startDate: todayStr,
    endDate: todayStr,
    status: 'completed',
    limit: 100,
  })
  const todayTransactions = txQuery.transactions || []

  // 7-day window for sparkbars
  const weekStart = useMemo(() => {
    const d = subDays(new Date(), 6)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const weekTxQuery = useTransactions({
    branchId,
    startDate: weekStart,
    endDate: todayStr,
    status: 'completed',
    limit: 500,
  })
  const weekTransactions = weekTxQuery.transactions || []

  // Today's bookings assigned to me (backend forces barberId=user.id when role=barber)
  const bookingQ = useBookings({ branchId, date: todayStr, limit: 50 })
  const todayBookings = bookingQ.data || []

  // ── Derived: my queue ─────────────────────────────────────────────────────
  const myQueue = useMemo(
    () => queue.filter(q => q.staffId === myId),
    [queue, myId]
  )
  const waiting = myQueue.filter(q => q.status === 'waiting')
  const inProgress = myQueue.filter(q => q.status === 'in-progress')
  const doneTodayItems = myQueue.filter(q => q.status === 'done' || q.status === 'paid')
  const activeItems = [...inProgress, ...waiting]

  // ── Derived: earnings ─────────────────────────────────────────────────────
  const myItemsRevenue = (txList) => txList.reduce((sum, tx) => {
    const mine = (tx.items || []).filter(i => i.barberId === myId)
    return sum + mine.reduce((s, i) => s + (i.price || 0), 0)
  }, 0)

  const todayRevenue = myItemsRevenue(todayTransactions)
  const todayCommission = Math.round(todayRevenue * commissionRate)
  const todayServiceCount = todayTransactions.reduce((acc, tx) => {
    return acc + (tx.items || []).filter(i => i.barberId === myId).length
  }, 0)

  // 7-day chart data
  const chart = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), 6 - i)
      const ds = d.toDateString()
      const dayTxns = weekTransactions.filter(tx => new Date(tx.createdAt).toDateString() === ds)
      const dayRevenue = myItemsRevenue(dayTxns)
      return {
        label: format(d, 'EEE', { locale: idLocale }).replace('.', ''),
        value: Math.round(dayRevenue * commissionRate),
      }
    })
    const max = days.reduce((m, d) => Math.max(m, d.value), 0)
    return { days, max }
  }, [weekTransactions, myId, commissionRate])

  // ── Earnings history (paid services, paginated client-side) ───────────────
  const earningEntries = useMemo(() => {
    const items = []
    todayTransactions.forEach(tx => {
      const mine = (tx.items || []).filter(i => i.barberId === myId)
      mine.forEach(it => {
        items.push({
          id: `${tx.id}-${it.id || it.serviceId}`,
          txId: tx.id,
          name: it.name || it.service?.name || t('barber.serviceFallback'),
          customerName: tx.customer?.name || tx.customerName || 'Walk-in',
          createdAt: tx.createdAt,
          price: it.price || 0,
          commission: Math.round((it.price || 0) * commissionRate),
        })
      })
    })
    return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [todayTransactions, myId, commissionRate, t])

  const [historyPage, setHistoryPage] = useState(1)
  const totalHistoryPages = Math.max(1, Math.ceil(earningEntries.length / HISTORY_PAGE_SIZE))
  useEffect(() => { if (historyPage > totalHistoryPages) setHistoryPage(1) }, [totalHistoryPages, historyPage])
  const historyView = earningEntries.slice(
    (historyPage - 1) * HISTORY_PAGE_SIZE,
    historyPage * HISTORY_PAGE_SIZE
  )

  // ── Upcoming bookings (today, not yet started) ────────────────────────────
  const upcomingBookings = useMemo(() => {
    return todayBookings
      .filter(b => ['pending', 'confirmed'].includes(b.status))
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      .slice(0, 5)
  }, [todayBookings])

  // ── Now-serving spotlight (first in_progress) ─────────────────────────────
  const nowServing = inProgress[0] || null

  // ── Greeting ──────────────────────────────────────────────────────────────
  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 11) return 'Selamat pagi'
    if (h < 15) return 'Selamat siang'
    if (h < 18) return 'Selamat sore'
    return 'Selamat malam'
  }, [])

  // ── Actions ───────────────────────────────────────────────────────────────
  const advance = async (item, next) => {
    if (!branchId) return
    setBusyId(item.id)
    try {
      await updateStatusM.mutateAsync({ id: item.id, branchId, status: next })
      toast.success(next === 'in-progress'
        ? t('queue.toast.startService')
        : t('queue.toast.markDone'))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('queue.toast.statusFailed'))
    } finally {
      setBusyId(null)
    }
  }

  // ── Multi-tenant safety: if branch not set yet, show friendly state ───────
  if (!branchId) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="p-8 text-center">
          <Sparkles className="w-10 h-10 text-brand/60 mx-auto mb-3" />
          <h2 className="font-display text-xl font-bold text-off-white">Cabang belum ditentukan</h2>
          <p className="text-muted text-sm mt-2">
            Akun Anda belum dipasang ke cabang. Hubungi admin untuk pengaturan.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-6 pb-24 sm:pb-6">
      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="relative overflow-hidden p-4 sm:p-6">
          <div className="absolute inset-0 bg-gradient-to-br from-brand/10 via-transparent to-transparent pointer-events-none" />
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-card/80 border border-dark-border hover:border-brand/50 hover:text-brand text-muted text-xs font-medium transition-colors backdrop-blur"
            aria-label="Edit profil"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Edit Profil</span>
          </button>
          <div className="relative flex items-start sm:items-center gap-3 sm:gap-5 flex-col sm:flex-row">
            <div className="flex items-center gap-3 sm:gap-5 w-full">
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="relative group rounded-full"
                aria-label="Ganti foto profil"
              >
                <Avatar src={user?.photo} name={user?.name} size="xl" ring />
                <span className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-brand border-2 border-dark-surface flex items-center justify-center text-dark group-hover:scale-110 transition-transform">
                  <Camera className="w-3.5 h-3.5" />
                </span>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] sm:text-xs uppercase tracking-wider text-brand/80 font-semibold">
                  {greeting}
                </p>
                <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white truncate">
                  {user?.name || 'Barber'}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-brand/10 border border-brand/30 text-brand">
                    <Scissors className="w-3 h-3" /> {t('barber.profile')}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-dark-card/60 border border-dark-border text-muted">
                    <TrendingUp className="w-3 h-3" /> Komisi {(commissionRate * 100).toFixed(0)}%
                  </span>
                  {user?.branch?.name && (
                    <span className="text-[11px] text-muted truncate max-w-[160px]">
                      · {user.branch.name}
                    </span>
                  )}
                  <LiveBadge />
                </div>
              </div>
            </div>
            <div className="w-full sm:w-auto sm:text-right shrink-0 mt-3 sm:mt-0">
              <p className="text-[11px] uppercase tracking-wide text-muted">Komisi hari ini</p>
              <p className="text-2xl sm:text-3xl font-display font-bold text-brand tabular-nums whitespace-nowrap">
                {formatRupiah(todayCommission)}
              </p>
              <p className="text-[11px] text-muted tabular-nums">
                dari {formatRupiah(todayRevenue)} revenue
              </p>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <StatCard icon={ListOrdered} label="Antrian Aktif" value={activeItems.length} accent="amber" delay={0.02} onClick={() => navigate('/barber/queue')} />
        <StatCard icon={Play} label="Sedang Dilayani" value={inProgress.length} accent="blue" delay={0.04} onClick={() => navigate('/barber/queue')} />
        <StatCard
          icon={CheckCircle}
          label="Selesai Hari Ini"
          value={txQuery.total || 0}
          accent="green"
          delay={0.06}
          onClick={() => navigate(`/barber/commission?start=${todayStr}&end=${todayStr}`)}
        />
        <StatCard icon={DollarSign} label="Komisi Hari Ini" value={formatRupiah(todayCommission)} valueShort={formatRupiahShort(todayCommission)} accent="gold" delay={0.08} onClick={() => navigate('/barber/commission')} />
      </div>

      {/* ── Now Serving spotlight ──────────────────────────────────────────── */}
      <AnimatePresence>
        {nowServing && (
          <motion.div
            key={nowServing.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="relative overflow-hidden p-4 sm:p-5 border-blue-500/30">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent pointer-events-none" />
              <div className="relative flex items-start gap-3 sm:gap-4 min-w-0">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-300">
                  <Scissors className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-blue-300/90 font-semibold">Sedang dilayani</p>
                  <p className="font-semibold text-off-white truncate">{nowServing.customerName}</p>
                  <p className="text-xs text-muted truncate">{nowServing.services?.join(', ') || '—'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => advance(nowServing, 'done')}
                  disabled={busyId === nowServing.id}
                  className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
                >
                  {busyId === nowServing.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <CheckCircle className="w-4 h-4" />}
                  <span className="hidden sm:inline">Tandai Selesai</span>
                </button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 2-column layout: Active Queue + Bookings ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Active Queue */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-off-white inline-flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-brand" /> {t('queue.myQueue')}
              <span className="text-xs text-muted font-normal">({activeItems.length})</span>
            </h3>
            <button
              type="button"
              onClick={() => navigate('/barber/queue')}
              className="text-xs text-brand hover:underline inline-flex items-center gap-1"
            >
              Lihat semua <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2">
            {activeItems.length === 0 ? (
              <Card className="p-6 sm:p-8 text-center">
                <ListOrdered className="w-10 h-10 text-muted mx-auto mb-2 opacity-40" />
                <p className="text-muted text-sm">{t('queue.noActive')}</p>
                <p className="text-xs text-muted/70 mt-1">Antrian baru akan muncul otomatis di sini.</p>
              </Card>
            ) : (
              activeItems.slice(0, 6).map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <QueueItemCard item={item} onAdvance={advance} busyId={busyId} t={t} />
                </motion.div>
              ))
            )}
            {activeItems.length > 6 && (
              <button
                type="button"
                onClick={() => navigate('/barber/queue')}
                className="w-full text-xs text-brand py-2 hover:underline"
              >
                Lihat {activeItems.length - 6} antrian lain
              </button>
            )}
          </div>
        </div>

        {/* Today's bookings */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-off-white inline-flex items-center gap-2">
              <Calendar className="w-4 h-4 text-brand" /> Booking Hari Ini
              <span className="text-xs text-muted font-normal">({upcomingBookings.length})</span>
            </h3>
          </div>

          <div className="space-y-2">
            {bookingQ.isLoading ? (
              [...Array(2)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-dark-card/60 animate-pulse" />)
            ) : upcomingBookings.length === 0 ? (
              <Card className="p-5 text-center">
                <Calendar className="w-8 h-8 text-muted mx-auto mb-2 opacity-40" />
                <p className="text-xs text-muted">Tidak ada booking hari ini</p>
              </Card>
            ) : (
              upcomingBookings.map(b => (
                <Card key={b.id} className="p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 w-10 h-10 rounded-lg bg-brand/10 border border-brand/30 flex items-center justify-center">
                      <span className="text-[11px] font-bold text-brand tabular-nums">{b.time || '--:--'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-off-white truncate">{b.customerName || b.customer?.name || 'Pelanggan'}</p>
                      <p className="text-xs text-muted truncate">{b.serviceName || '—'}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-md border ${
                      b.status === 'confirmed'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    }`}>
                      {b.status === 'confirmed' ? 'Konfirm' : 'Pending'}
                    </span>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Earnings + Sparkline ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Sparkline */}
        <Card className="p-4 sm:p-5 lg:col-span-1">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold text-off-white inline-flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand" /> Komisi 7 Hari
            </h3>
            <button
              type="button"
              onClick={() => navigate('/barber/commission')}
              className="text-xs text-brand hover:underline"
            >
              Detail
            </button>
          </div>
          {weekTxQuery.isLoading ? (
            <div className="h-16 rounded-lg bg-dark-card/60 animate-pulse" />
          ) : (
            <Sparkbars data={chart.days} max={chart.max} />
          )}
          <p className="text-[11px] text-muted mt-2">
            Total minggu ini: <span className="text-brand font-semibold tabular-nums">
              {formatRupiah(chart.days.reduce((s, d) => s + d.value, 0))}
            </span>
          </p>
        </Card>

        {/* Today's earnings table */}
        <Card id="riwayat-komisi" className="p-4 sm:p-5 lg:col-span-2 scroll-mt-24">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-off-white inline-flex items-center gap-2">
              <Wallet className="w-4 h-4 text-brand" /> Riwayat Komisi Hari Ini
              <span className="text-xs text-muted font-normal">({earningEntries.length})</span>
            </h3>
            <div className="flex items-center gap-1 text-xs text-muted">
              <button
                type="button"
                disabled={historyPage <= 1}
                onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                className="p-1.5 rounded-md hover:bg-dark-card/60 disabled:opacity-40"
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="tabular-nums">{historyPage}/{totalHistoryPages}</span>
              <button
                type="button"
                disabled={historyPage >= totalHistoryPages}
                onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}
                className="p-1.5 rounded-md hover:bg-dark-card/60 disabled:opacity-40"
                aria-label="Halaman berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {txQuery.isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-dark-card/60 animate-pulse" />)}
            </div>
          ) : earningEntries.length === 0 ? (
            <div className="py-8 text-center">
              <Wallet className="w-8 h-8 text-muted mx-auto mb-2 opacity-40" />
              <p className="text-sm text-muted">Belum ada komisi hari ini</p>
              <p className="text-xs text-muted/70 mt-1">Selesaikan & bayarkan layanan untuk mulai mendapatkan komisi.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {historyView.map(row => (
                <div
                  key={row.id}
                  className="flex items-center gap-3 p-2 sm:p-3 rounded-xl bg-dark-card/40 border border-dark-border/50 min-w-0"
                >
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-brand/10 border border-brand/30 flex items-center justify-center text-[11px] font-bold text-brand">
                    {initials(row.customerName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-off-white truncate">{row.name}</p>
                    <p className="text-[11px] text-muted truncate">
                      {row.customerName} · {fmtTime(row.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-brand tabular-nums whitespace-nowrap">
                      {formatRupiah(row.commission)}
                    </p>
                    <p className="text-[10px] text-muted tabular-nums whitespace-nowrap">
                      dari {formatRupiah(row.price)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Quick links ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => navigate('/barber/queue')}
          className="text-left"
        >
          <Card className="p-4 hover:border-brand/40 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-brand/10 border border-brand/30 flex items-center justify-center text-brand">
                <ListOrdered className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-off-white">Antrian Saya</p>
                <p className="text-xs text-muted truncate">Kelola pelanggan menunggu &amp; sedang dilayani</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted shrink-0" />
            </div>
          </Card>
        </button>
        <button
          type="button"
          onClick={() => navigate('/barber/commission')}
          className="text-left"
        >
          <Card className="p-4 hover:border-brand/40 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-brand/10 border border-brand/30 flex items-center justify-center text-brand">
                <Trophy className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-off-white">Detail Komisi</p>
                <p className="text-xs text-muted truncate">Riwayat &amp; grafik penghasilan</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted shrink-0" />
            </div>
          </Card>
        </button>
      </div>

      {/* ── Refresh hint when fetching ─────────────────────────────────────── */}
      {(queueFetching || txQuery.isFetching) && (
        <div className="fixed bottom-20 sm:bottom-6 right-4 z-30 inline-flex items-center gap-2 px-3 py-2 rounded-full bg-dark-card/90 border border-dark-border text-xs text-muted shadow-card backdrop-blur">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          Sinkronisasi…
        </div>
      )}

      <ProfileEditModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={user}
        toast={toast}
      />
    </div>
  )
}
