import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Clock, Check, ChevronRight, Scissors, ChevronLeft,
  User, Phone, MessageSquare, Star, Copy, Share2,
  Sparkles, AlertCircle, Camera, Globe, Music2, Image as ImageIcon,
} from 'lucide-react'
import publicApi from '../../lib/publicApi.js'
import WilayahPicker from '../../components/WilayahPicker.jsx'
import { usePublicTenantStore } from '../../store/publicTenantStore.js'
import { getTenantSlug } from '../../lib/tenantSlug.js'
import {
  format,
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isSameMonth, isSameDay, isBefore, startOfDay,
} from 'date-fns'
import { id as idLocale, enUS as enLocale } from 'date-fns/locale'
import { formatRupiah } from '../../utils/format.js'
import Avatar from '../../components/ui/Avatar.jsx'
import ErrorBoundary from '../../components/ui/ErrorBoundary.jsx'

// Pilih locale date-fns berdasarkan bahasa aktif i18n.
function dfLocale(lang) { return lang === 'en' ? enLocale : idLocale }

// ═══════════════════════════════════════════════════════════════════════════
// Helpers (unchanged from previous version)
// ═══════════════════════════════════════════════════════════════════════════

const BOOKING_LEAD_MINUTES = 15
// Step keys; label resolved via t('publicBooking.step<Key>') at render time.
const STEPS = [
  { key: 'pick',    labelKey: 'stepPick' },
  { key: 'date',    labelKey: 'stepDate' },
  { key: 'confirm', labelKey: 'stepConfirm' },
  { key: 'success', labelKey: 'stepSuccess' },
]

function generateTimeSlots(openTime = '09:00', closeTime = '21:00') {
  const out = []
  const [oh, om] = openTime.split(':').map(Number)
  const [ch, cm] = closeTime.split(':').map(Number)
  let cur = oh * 60 + om
  const end = ch * 60 + cm
  while (cur < end) {
    const h = String(Math.floor(cur / 60)).padStart(2, '0')
    const m = String(cur % 60).padStart(2, '0')
    out.push(`${h}:${m}`)
    cur += 30
  }
  return out
}
function nowHHMMInTz(tz) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'Asia/Jakarta',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date())
  } catch { const d = new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` }
}
function todayYmdInTz(tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Jakarta' }).format(new Date()) }
  catch { return new Date().toISOString().slice(0, 10) }
}
function hhmmToMinutes(s) { const [h, m] = s.split(':').map(Number); return h * 60 + m }
function isSlotInPast(time, selectedDate, tz) {
  if (!selectedDate) return false
  if (format(selectedDate, 'yyyy-MM-dd') !== todayYmdInTz(tz)) return false
  const cutoff = hhmmToMinutes(nowHHMMInTz(tz)) + BOOKING_LEAD_MINUTES
  return hhmmToMinutes(time) < cutoff
}
function shortId(id) { return id.slice(-8).toUpperCase() }

// Given backend-provided bookedRanges (each {start:'HH:MM', end:'HH:MM'}) and
// the duration of the service the customer is trying to book, return the list
// of slot start-times that would overlap and thus must be disabled. The 30-min
// generator step is the smallest grain so we just sweep candidate slots.
function computeBlockedSlotsFromRanges(ranges, targetDuration) {
  const SLOT_STEP = 30
  const out = new Set()
  const rs = ranges.map(r => ({ start: hhmmToMinutes(r.start), end: hhmmToMinutes(r.end) }))
  // Sweep every possible HH:MM slot from 00:00 to 23:30
  for (let m = 0; m < 24 * 60; m += SLOT_STEP) {
    const candidateEnd = m + targetDuration
    if (rs.some(r => r.start < candidateEnd && m < r.end)) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0')
      const mm = String(m % 60).padStart(2, '0')
      out.add(`${hh}:${mm}`)
    }
  }
  return [...out]
}

// Map kode status booking → label terlokalisasi. Terima `t`.
function statusLabel(status, t) {
  const map = {
    pending: 'statusPending', confirmed: 'statusConfirmed',
    in_progress: 'statusInProgress', done: 'statusDone', cancelled: 'statusCancelled',
  }
  return map[status] ? t(`publicBooking.${map[status]}`) : status
}

// Pilih warna teks yang kontras di atas warna accent (mis. tombol CTA). Accent
// terang seperti brass #E0A82E → teks ink; accent gelap → teks putih. Bikin CTA
// tetap terbaca walau tenant pasang primaryColor sendiri.
function readableOn(hex) {
  try {
    const h = String(hex).replace('#', '')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return lum > 0.6 ? '#16140F' : '#FFFFFF'
  } catch { return '#FFFFFF' }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function PublicBookingPage() {
  return (
    <ErrorBoundary>
      <PublicBookingPageInner />
    </ErrorBoundary>
  )
}

function PublicBookingPageInner() {
  const { t, i18n } = useTranslation()
  const {
    name: businessName, ownerName, logo: tenantLogo, status: tenantStatus,
    timezone: tenantTz, bookingPage, wilayah: tenantWilayah, resolve,
  } = usePublicTenantStore()

  // Auto-detect bahasa pelanggan pada mount pertama — hanya bila belum ada
  // preferensi tersimpan. navigator.language 'en*' → en, selain itu → id.
  useEffect(() => {
    try {
      const stored = localStorage.getItem('i18nextLng')
      if (!stored) {
        const nav = (navigator.language || '').toLowerCase()
        const detected = nav.startsWith('en') ? 'en' : 'id'
        i18n.changeLanguage(detected)
      }
    } catch { /* localStorage / navigator unavailable */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Nama yang ditampilkan di /book mengikuti Nama Akun pemilik (preferensi
  // tenant); fallback ke Nama Bisnis bila owner/akun tak tersedia.
  const tenantName = ownerName || businessName
  const bp = bookingPage || {}
  const accent = bp.primaryColor || '#E0A82E'

  // step: 0 (pick), 1 (date), 2 (confirm), 3 (success)
  const [step, setStep] = useState(0)
  const [branches, setBranches]   = useState([])
  const [services, setServices]   = useState([])
  const [barbers, setBarbers]     = useState([])
  const [testimonials, setTestimonials] = useState([])
  const [queueInfo, setQueueInfo] = useState({}) // branchId -> { waiting, estimatedMinutes }
  const [bookedSlots, setBookedSlots] = useState([])
  // Penutupan cabang pada tanggal terpilih (libur khusus admin).
  const [branchClosure, setBranchClosure] = useState(null) // null | { note }
  const [loading, setLoading]     = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState(null)
  const [booking, setBooking]     = useState(null)

  // `services` = array (booking bisa lebih dari satu layanan).
  const [selected, setSelected] = useState({
    branch: null, services: [], barber: null, date: null, time: null,
  })
  const [form, setForm] = useState({ name: '', phone: '', notes: '', wilayah: {} })
  const [formError, setFormError] = useState({})
  const [shake, setShake] = useState({})  // { key: timestamp }

  // tick every minute → past slots auto-disable
  const [, setNowTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNowTick(n => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // SEO + share metadata. Updates the document title/description/og tags so
  // links shared via WA/IG show the tenant's name instead of "SembaPOS".
  useEffect(() => {
    if (!tenantName) return
    const prevTitle = document.title
    document.title = `${t('publicBooking.onlineBooking')} · ${tenantName}`
    const setMeta = (name, value, attr = 'name') => {
      let el = document.querySelector(`meta[${attr}="${name}"]`)
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, name)
        document.head.appendChild(el)
      }
      el.setAttribute('content', value)
    }
    const desc = t('publicBooking.seoDescription', { name: tenantName })
    setMeta('description', desc)
    setMeta('og:title', `${t('publicBooking.onlineBooking')} · ${tenantName}`, 'property')
    setMeta('og:description', desc, 'property')
    setMeta('og:type', 'website', 'property')
    if (tenantLogo) setMeta('og:image', tenantLogo, 'property')
    setMeta('theme-color', accent)
    return () => { document.title = prevTitle }
  }, [tenantName, tenantLogo, accent, i18n.language]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lookup modal (cek booking by phone) ────────────────────────────────
  const [showLookup, setShowLookup]   = useState(false)
  const [lookupPhone, setLookupPhone] = useState('')
  const [lookupList, setLookupList]   = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState(null)
  const handleLookup = async () => {
    if (!lookupPhone.trim() || lookupPhone.trim().length < 4) {
      setLookupError(t('publicBooking.lookupPhoneMin'))
      return
    }
    setLookupLoading(true); setLookupError(null)
    try {
      const res = await publicApi.get('/public/bookings/lookup', { params: { phone: lookupPhone.trim() } })
      setLookupList(res.data.data || [])
    } catch (err) {
      setLookupError(err?.response?.data?.error || t('publicBooking.lookupFailed'))
    } finally { setLookupLoading(false) }
  }

  useEffect(() => {
    if (tenantStatus === 'no_tenant' && getTenantSlug()) resolve()
  }, [tenantStatus, resolve])

  useEffect(() => {
    if (tenantStatus === 'no_tenant') { setLoading(false); return }
    if (tenantStatus === 'idle' || tenantStatus === 'loading') return
    let cancelled = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const [bRes, sRes, tRes, qRes] = await Promise.all([
          publicApi.get('/public/branches'),
          publicApi.get('/public/services'),
          publicApi.get('/public/testimonials', { params: { limit: 6 } }).catch(() => ({ data: { data: [] } })),
          publicApi.get('/public/queue-status').catch(() => ({ data: { data: [] } })),
        ])
        if (cancelled) return
        const br = bRes.data.data || []
        setBranches(br)
        setServices(sRes.data.data || [])
        setTestimonials(tRes.data.data || [])
        setQueueInfo(
          (qRes.data.data || []).reduce((m, q) => { m[q.branchId] = q; return m }, {})
        )
        // Auto-select first/only branch
        if (br.length >= 1) {
          setSelected(s => ({ ...s, branch: br[0] }))
          loadBarbers(br[0].id)
        }
      } catch {
        if (!cancelled) setError(t('publicBooking.loadFailed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [tenantStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadBarbers = useCallback(async (branchId) => {
    try {
      const res = await publicApi.get('/public/barbers', { params: { branchId } })
      setBarbers(res.data.data || [])
    } catch { setBarbers([]) }
  }, [])

  // Re-fetch availability when branch/date/barber/service changes. Service is
  // included so backend can compute overlap-aware blocked slots (a 60-min
  // service starting at 14:00 should also block selecting 14:30 — the previous
  // version only returned exact start times).
  const refetchAvailability = useCallback(async (signal) => {
    if (!selected.branch || !selected.date) { setBookedSlots([]); setBranchClosure(null); return }
    const svcs = selected.services || []
    const totalDur = svcs.reduce((sum, s) => sum + (s.duration || 0), 0)
    try {
      const res = await publicApi.get('/public/availability', {
        params: {
          branchId:   selected.branch.id,
          date:       format(selected.date, 'yyyy-MM-dd'),
          barberId:   selected.barber?.id,
          serviceIds: svcs.map(s => s.id).join(','),
        },
        signal,
      })
      const data = res.data.data || {}
      // Cabang tutup di tanggal ini — kosongkan slot, set state closure.
      if (data.closed) {
        setBookedSlots([])
        setBranchClosure({ note: data.closureNote || null })
        return
      }
      setBranchClosure(null)
      // Use overlap-aware ranges when backend provides them (newer API), else
      // fall back to exact `booked` start times for back-compat. Durasi target =
      // jumlah durasi semua layanan terpilih.
      if (Array.isArray(data.bookedRanges) && data.bookedRanges.length && totalDur) {
        const blocked = computeBlockedSlotsFromRanges(data.bookedRanges, totalDur)
        setBookedSlots(blocked)
      } else {
        setBookedSlots(data.booked || [])
      }
    } catch { /* network error → keep last known list */ }
  }, [selected.branch, selected.date, selected.barber, selected.services])

  useEffect(() => {
    const ac = new AbortController()
    refetchAvailability(ac.signal)
    return () => ac.abort()
  }, [refetchAvailability])

  // Auto-refetch availability while user is on the schedule step so concurrent
  // bookings (other customers, walk-in via kasir) become visible quickly
  // without forcing a manual reload. Also refetch immediately when the tab
  // regains focus (mobile users come back after Instagram/WhatsApp).
  useEffect(() => {
    if (step !== 1) return
    const id = setInterval(() => refetchAvailability(), 60_000)
    const onVis = () => { if (document.visibilityState === 'visible') refetchAvailability() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [step, refetchAvailability])

  const pickBranch  = (b) => { setSelected(s => ({ ...s, branch: b, barber: null, date: null, time: null })); loadBarbers(b.id) }
  // Toggle layanan dalam daftar — booking bisa lebih dari satu layanan. Durasi
  // total berubah → reset jam terpilih supaya slot dihitung ulang.
  const pickService = (s) => setSelected(p => {
    const cur = p.services || []
    const exists = cur.some(x => x.id === s.id)
    return { ...p, services: exists ? cur.filter(x => x.id !== s.id) : [...cur, s], time: null }
  })
  const pickBarber  = (b) => setSelected(s => ({ ...s, barber: b, time: null }))
  const pickDate    = (d) => setSelected(s => ({ ...s, date: d, time: null }))
  const pickTime    = (t, status) => {
    if (status === 'past' || status === 'penuh') {
      setShake({ key: t, ts: Date.now() })
      setTimeout(() => setShake({}), 500)
      return
    }
    setSelected(s => ({ ...s, time: t }))
  }

  const validateForm = () => {
    const err = {}
    if (!form.name.trim() || form.name.trim().length < 2) err.name = t('publicBooking.errNameMin')
    if (!form.phone.trim() || form.phone.trim().length < 8) err.phone = t('publicBooking.errPhoneMin')
    else if (!/^[\d+\-\s()]{8,15}$/.test(form.phone.trim())) err.phone = t('publicBooking.errPhoneInvalid')
    setFormError(err)
    return Object.keys(err).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) return
    setSubmitting(true); setError(null)
    try {
      // Alamat wilayah pelanggan — gabung wilayah toko + pilihan pelanggan.
      // Hanya dikirim kalau kecamatan dipilih.
      const wl = form.wilayah || {}
      const address = (tenantWilayah?.kabupatenId && wl.kecamatanId)
        ? {
            provinsiId: tenantWilayah.provinsiId, provinsi: tenantWilayah.provinsi,
            kabupatenId: tenantWilayah.kabupatenId, kabupaten: tenantWilayah.kabupaten,
            ...wl,
          }
        : undefined
      const res = await publicApi.post('/public/bookings', {
        branchId: selected.branch.id,
        serviceIds: (selected.services || []).map(s => s.id),
        barberId: selected.barber?.id,
        customerName: form.name.trim(), customerPhone: form.phone.trim(),
        date: format(selected.date, 'yyyy-MM-dd'), time: selected.time,
        notes: form.notes.trim() || undefined,
        ...(address ? { address } : {}),
      })
      setBooking(res.data.data)
      setStep(3)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err?.response?.data?.error || t('publicBooking.submitFailed'))
    } finally { setSubmitting(false) }
  }

  const resetAll = () => {
    setStep(0)
    setSelected(s => ({ branch: branches[0] || null, services: [], barber: null, date: null, time: null }))
    setForm({ name: '', phone: '', notes: '', wilayah: {} })
    setFormError({}); setBooking(null); setError(null)
  }

  const timeSlots = selected.branch
    ? generateTimeSlots(selected.branch.openTime, selected.branch.closeTime) : []

  // ── Edge states ───────────────────────────────────────────────────────────
  if (tenantStatus === 'no_tenant') {
    return <BookShell accent={accent}><EmptyTenant /></BookShell>
  }
  if (loading) {
    return <BookShell accent={accent}><LoadingShell /></BookShell>
  }
  if (error && !branches.length) {
    return <BookShell accent={accent}><ErrorShell message={error} /></BookShell>
  }

  // Barber wajib dipilih (opsi "barber bebas" dihapus) — customer harus pilih nama barber.
  const selectedServices = selected.services || []
  const totalPrice    = selectedServices.reduce((sum, s) => sum + (s.price || 0), 0)
  const totalDuration = selectedServices.reduce((sum, s) => sum + (s.duration || 0), 0)
  const serviceSummary = selectedServices.map(s => s.name).join(', ')
  const canNextStep0  = selectedServices.length > 0 && !!selected.barber
  const canNextStep1  = !!selected.date && !!selected.time

  return (
    <BookShell accent={accent} tenantName={tenantName} tenantLogo={tenantLogo} bp={bp}
      onOpenLookup={() => { setShowLookup(true); setLookupList(null); setLookupError(null) }}
      sticky={
        step === 0 ? (
          <StickyCta
            label={t('publicBooking.ctaContinueSchedule')}
            disabled={!canNextStep0}
            onClick={() => { if (canNextStep0) { setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }) } }}
            accent={accent}
            note={canNextStep0
              ? `${t('publicBooking.servicesCount', { count: selectedServices.length })} · ${formatRupiah(totalPrice)}${totalDuration ? ` · ${t('publicBooking.minutesShort', { count: totalDuration })}` : ''}`
              : !selected.barber ? t('publicBooking.pickBarberServiceToContinue') : t('publicBooking.pickServiceToContinue')}
          />
        ) : null
      }
    >
      <div className="max-w-md mx-auto lg:max-w-2xl">
        <StepIndicator current={step} accent={accent} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
          className="mt-6 lg:mt-10"
        >
          {step === 0 && (
            <Step1Pick
              tenantName={tenantName} tenantLogo={tenantLogo} bp={bp}
              branches={branches} services={services} barbers={barbers}
              testimonials={testimonials} queueInfo={queueInfo}
              selected={selected} accent={accent} tenantTz={tenantTz}
              onPickBranch={pickBranch} onPickService={pickService} onPickBarber={pickBarber}
              canNext={canNextStep0}
              onNext={() => { if (canNextStep0) { setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }) } }}
            />
          )}
          {step === 1 && (
            <Step2Schedule
              selected={selected} timeSlots={timeSlots} bookedSlots={bookedSlots}
              branchClosure={branchClosure} tenantTz={tenantTz}
              accent={accent} shake={shake}
              onPickDate={pickDate} onPickTime={pickTime}
              onBack={() => setStep(0)}
              onNext={() => { setStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            />
          )}
          {step === 2 && (
            <Step3Confirm
              tenantName={tenantName} tenantWilayah={tenantWilayah}
              selected={selected} form={form} formError={formError}
              setForm={setForm} accent={accent} totalPrice={totalPrice}
              error={error} submitting={submitting}
              onBack={() => setStep(1)}
              onSubmit={handleSubmit}
            />
          )}
          {step === 3 && booking && (
            <Step4Success
              booking={booking} accent={accent} tenantName={tenantName}
              tenantPhone={bp.whatsapp}
              onAnother={resetAll}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Lookup modal — public, no auth required. Used when customer lost code. */}
      <AnimatePresence>
        {showLookup && (
          <LookupModal
            accent={accent}
            phone={lookupPhone}
            setPhone={setLookupPhone}
            loading={lookupLoading}
            list={lookupList}
            error={lookupError}
            onClose={() => setShowLookup(false)}
            onSubmit={handleLookup}
          />
        )}
      </AnimatePresence>
    </BookShell>
  )
}

function LookupModal({ accent, phone, setPhone, loading, list, error, onClose, onSubmit }) {
  const { t, i18n } = useTranslation()
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        className="fixed inset-x-0 bottom-0 z-50 lg:inset-0 lg:flex lg:items-center lg:justify-center lg:p-4"
      >
        <div
          className="w-full lg:max-w-md rounded-t-3xl lg:rounded-3xl p-5 space-y-4"
          style={{ background: 'var(--bk-surface)', border: '1px solid var(--bk-border)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">{t('publicBooking.lookupTitle')}</h3>
            <button onClick={onClose} className="p-2 rounded-lg" style={{ color: 'var(--bk-text-2)' }} aria-label={t('publicBooking.close')}>
              ✕
            </button>
          </div>
          <p className="text-xs" style={{ color: 'var(--bk-text-2)' }}>
            {t('publicBooking.lookupHint')}
          </p>
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--bk-text-2)' }} />
            <input
              type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="08xxxxxxxxxx" className="bk-input"
              onKeyDown={e => e.key === 'Enter' && onSubmit()}
              autoFocus
            />
          </div>
          {error && <p className="text-xs" style={{ color: '#FCA5A5' }}>{error}</p>}
          <button onClick={onSubmit} disabled={loading} className="bk-cta w-full">
            {loading ? t('publicBooking.searching') : t('publicBooking.searchBooking')}
          </button>

          {list !== null && (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {list.length === 0 ? (
                <p className="text-center text-sm py-6" style={{ color: 'var(--bk-text-muted)' }}>
                  {t('publicBooking.lookupEmpty')}
                </p>
              ) : (
                list.map(b => (
                  <div key={b.id} className="bk-card-flat p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-sm" style={{ color: accent }}>
                        #{shortId(b.id)}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded"
                        style={{
                          color: b.status === 'cancelled' ? '#FCA5A5' :
                                 b.status === 'done' ? 'var(--bk-text-2)' :
                                 b.status === 'in_progress' ? '#FCD34D' :
                                 'var(--bk-text)',
                          background: b.status === 'cancelled' ? 'rgba(239,68,68,0.12)' :
                                      b.status === 'done' ? 'var(--bk-surface-2)' :
                                      b.status === 'in_progress' ? 'rgba(251,191,36,0.12)' :
                                      'var(--bk-accent-soft)',
                        }}>
                        {statusLabel(b.status, t)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold">{b.serviceName}</p>
                    <p className="text-xs" style={{ color: 'var(--bk-text-2)' }}>
                      {format(new Date(b.date + 'T00:00:00'), 'EEEE, d MMM yyyy', { locale: dfLocale(i18n.language) })} · {b.time}
                    </p>
                    {b.branch?.name && (
                      <p className="text-xs" style={{ color: 'var(--bk-text-muted)' }}>{b.branch.name}{b.barberName ? ` · ${b.barberName}` : ''}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </motion.div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SHELL — design tokens + sticky bottom CTA
// ═══════════════════════════════════════════════════════════════════════════

function BookShell({ accent = '#E0A82E', tenantName, tenantLogo, bp = {}, sticky, children, onOpenLookup }) {
  const { t } = useTranslation()
  const showLogo = bp.showLogo !== false
  const isLight  = bp.mode === 'light'

  // Tokens swap based on mode. Both palettes share the same accent so the
  // brand identity stays consistent regardless of theme. Designed so that
  // sub-components reading `var(--bk-*)` need ZERO awareness of the mode.
  // Tokens v3 (selaras landing publik "heritage brass", 2026-06-13): light =
  // krem #F6F1E7 + kartu putih hangat + ink #16140F; dark = ink hangat + teks
  // krem. Aksen pakai accent prop tenant (default brass #E0A82E = landing).
  const tokens = isLight ? {
    '--bk-bg':            '#F6F1E7',
    '--bk-bg-translucent':'rgba(246,241,231,0.92)',
    '--bk-surface':       '#FFFDF8',
    '--bk-surface-2':     '#F0E9DA',
    '--bk-border':        '#E4DAC6',
    '--bk-border-strong': '#D6C9AD',
    '--bk-text':          '#16140F',
    '--bk-text-2':        '#6B5F4A',
    '--bk-text-muted':    '#938872',
  } : {
    '--bk-bg':            '#16140F',
    '--bk-bg-translucent':'rgba(22,20,15,0.92)',
    '--bk-surface':       '#211D16',
    '--bk-surface-2':     '#2A251B',
    '--bk-border':        '#3A3326',
    '--bk-border-strong': '#4A4030',
    '--bk-text':          '#F6F1E7',
    '--bk-text-2':        '#C9BFA8',
    '--bk-text-muted':    '#9A8F78',
  }

  return (
    <div
      className="book-root min-h-screen w-full"
      style={{
        '--bk-accent':       accent,
        '--bk-accent-soft':  `${accent}1A`,
        '--bk-accent-glow':  `${accent}55`,
        '--bk-accent-text':  readableOn(accent),
        ...tokens,
        background: tokens['--bk-bg'],
        color: tokens['--bk-text'],
        fontFamily: "'Plus Jakarta Sans','Inter',system-ui,-apple-system,'Segoe UI',sans-serif",
        paddingBottom: sticky ? '92px' : '0',
      }}
    >
      <style>{`
        .book-root { -webkit-font-smoothing: antialiased; }
        .book-root .bk-card {
          background: var(--bk-surface);
          border: 1px solid var(--bk-border);
          border-radius: 14px;
        }
        .book-root .bk-card-flat {
          background: var(--bk-surface-2);
          border: 1px solid var(--bk-border);
          border-radius: 12px;
        }
        .book-root .bk-cta {
          background: var(--bk-accent);
          color: var(--bk-accent-text, #FFFFFF);
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 0.01em;
          border-radius: 14px;
          min-height: 52px;
          padding: 0 22px;
          box-shadow: 0 4px 14px -4px var(--bk-accent-glow);
          transition: filter .15s ease, transform .12s ease, box-shadow .15s ease;
        }
        .book-root .bk-cta:hover { filter: brightness(1.06); box-shadow: 0 6px 18px -4px var(--bk-accent-glow); }
        .book-root .bk-cta:active { transform: scale(.98); }
        .book-root .bk-cta:disabled { filter: none; opacity: .35; cursor: not-allowed; box-shadow: none; }
        .book-root .bk-cta-outline {
          background: transparent;
          color: var(--bk-text);
          border: 1px solid var(--bk-border-strong);
          font-weight: 600;
          font-size: 15px;
          border-radius: 14px;
          min-height: 52px;
          padding: 0 22px;
          transition: border-color .15s ease, color .15s ease;
        }
        .book-root .bk-cta-outline:hover { border-color: var(--bk-accent); color: var(--bk-accent); }
        .book-root .bk-back {
          color: var(--bk-text-2);
          background: transparent;
          border: 1px solid var(--bk-border);
          border-radius: 14px;
          min-height: 52px;
          min-width: 52px;
          padding: 0 18px;
          font-weight: 500;
          transition: color .15s ease, border-color .15s ease;
        }
        .book-root .bk-back:hover { color: var(--bk-text); border-color: var(--bk-border-strong); }
        .book-root .bk-input {
          background: var(--bk-surface-2);
          border: 1px solid var(--bk-border);
          border-radius: 12px;
          color: var(--bk-text);
          padding: 14px 14px 14px 44px;
          width: 100%;
          font-size: 14.5px;
          transition: border-color .15s ease, box-shadow .15s ease;
        }
        .book-root .bk-input:focus {
          outline: none;
          border-color: var(--bk-accent);
          box-shadow: 0 0 0 3px var(--bk-accent-soft);
        }
        .book-root .bk-label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--bk-accent);
        }
        .book-root .bk-divider { height: 1px; background: var(--bk-border); }
        @keyframes bk-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-4px); }
          40% { transform: translateX(4px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(2px); }
        }
        .book-root .bk-shake { animation: bk-shake 0.4s ease-in-out; }

        /* ── Hero v2: gradient ink hangat (selaras landing heritage) ─────── */
        .book-root .bk-hero-v2 {
          border-radius: 18px;
          background: linear-gradient(135deg, #16140F 0%, #2A2114 100%);
          color: #F6F1E7;
          padding: 20px;
          position: relative; overflow: hidden;
          box-shadow: 0 12px 30px rgba(22,20,15,0.12), 0 4px 10px rgba(0,0,0,0.04);
        }
        .book-root .bk-hero-v2::before {
          content: ''; position: absolute; top: -30px; right: -30px;
          width: 180px; height: 180px;
          background: radial-gradient(closest-side, rgba(224,168,46,0.28), transparent);
          pointer-events: none;
        }
        .book-root .bk-hero-v2 > * { position: relative; }

        /* Status chip pulse mint */
        .book-root .bk-status-chip {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 9px; border-radius: 999px;
          background: rgba(16,185,129,0.20); color: #5EE3B5;
          font-size: 10.5px; font-weight: 700;
          border: 1px solid rgba(16,185,129,0.30);
        }
        .book-root .bk-status-chip .bk-pulse-dot {
          width: 6px; height: 6px; border-radius: 999px; background: #34D399;
          box-shadow: 0 0 0 3px rgba(16,185,129,0.25);
          animation: bk-pulse 1.6s ease-in-out infinite;
        }
        @keyframes bk-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
        .book-root .bk-soft-chip {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 9px; border-radius: 999px;
          background: rgba(255,255,255,0.10); color: rgba(255,255,255,0.85);
          font-size: 10.5px; font-weight: 600;
        }

        /* Progress bar (numbered steps) — pengganti dots */
        .book-root .bk-progress-v2 {
          padding: 14px 16px;
          background: var(--bk-surface);
          border: 1px solid var(--bk-border);
          border-radius: 14px;
          box-shadow: 0 1px 3px rgba(0,0,0,.04);
        }
        .book-root .bk-progress-v2 .lbl {
          display: flex; justify-content: space-between; align-items: baseline;
          margin-bottom: 10px;
          font-size: 11px; font-weight: 700; color: var(--bk-text-2);
          text-transform: uppercase; letter-spacing: 0.12em;
        }
        .book-root .bk-progress-v2 .lbl .curr { color: var(--bk-accent); }
        .book-root .bk-progress-v2 .bar {
          height: 6px; border-radius: 999px;
          background: var(--bk-surface-2);
          position: relative; overflow: hidden;
        }
        .book-root .bk-progress-v2 .fill {
          height: 100%; border-radius: 999px;
          background: linear-gradient(90deg, var(--bk-accent) 0%, var(--bk-accent) 100%);
          transition: width .25s ease;
        }
        .book-root .bk-progress-v2 .dots {
          display: flex; justify-content: space-between; margin-top: 10px;
        }
        .book-root .bk-progress-v2 .dot {
          display: flex; flex-direction: column; align-items: center; gap: 4px;
          font-size: 10px; font-weight: 600; color: var(--bk-text-muted);
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .book-root .bk-progress-v2 .circle {
          width: 22px; height: 22px; border-radius: 999px;
          background: var(--bk-surface-2); color: var(--bk-text-muted);
          display: grid; place-items: center;
          font-size: 11px; font-weight: 700;
          border: 1.5px solid var(--bk-border);
        }
        .book-root .bk-progress-v2 .dot.done .circle,
        .book-root .bk-progress-v2 .dot.active .circle {
          background: var(--bk-accent); color: #FFFFFF; border-color: var(--bk-accent);
        }
        .book-root .bk-progress-v2 .dot.done,
        .book-root .bk-progress-v2 .dot.active { color: var(--bk-accent); }
        .book-root .bk-progress-v2 .dot.active .circle {
          box-shadow: 0 0 0 4px var(--bk-accent-soft);
        }

        /* Animated success check ring */
        @keyframes bk-pop {
          0% { transform: scale(0.4); opacity: 0; }
          60% { transform: scale(1.08); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes bk-ring {
          0%, 100% { transform: scale(1); opacity: 0.16; }
          50% { transform: scale(1.12); opacity: 0; }
        }
        .book-root .bk-check-v2 {
          width: 96px; height: 96px;
          border-radius: 999px;
          background: linear-gradient(135deg, #10B981 0%, #34D399 100%);
          display: grid; place-items: center;
          box-shadow: 0 12px 30px rgba(16,185,129,0.28);
          position: relative; margin: 0 auto;
          animation: bk-pop 0.6s cubic-bezier(0.4, 0.0, 0.2, 1.4);
        }
        .book-root .bk-check-v2::before {
          content: ''; position: absolute; inset: -8px;
          border-radius: 999px;
          background: #10B981; opacity: 0.16;
          animation: bk-ring 2s ease-in-out infinite;
        }
      `}</style>

      {/* Slim sticky brand bar */}
      <header
        className="sticky top-0 z-30"
        style={{
          background: 'var(--bk-bg-translucent)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--bk-border)',
        }}
      >
        <div className="max-w-md mx-auto px-5 py-3 flex items-center gap-3">
          {showLogo && tenantLogo ? (
            <img src={tenantLogo} alt={tenantName}
              className="w-8 h-8 rounded-lg object-cover"
              style={{ outline: `1.5px solid ${accent}`, outlineOffset: 1 }} />
          ) : (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--bk-accent-soft)' }}>
              <Scissors className="w-4 h-4" style={{ color: accent }} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[13px] leading-none truncate" style={{ color: 'var(--bk-text)' }}>
              {tenantName || t('publicBooking.barbershop')}
            </p>
            <p className="text-[10px] uppercase tracking-[0.2em] mt-1" style={{ color: 'var(--bk-text-muted)' }}>
              {t('publicBooking.onlineBooking')}
            </p>
          </div>
          <LanguageSwitcher accent={accent} />
          {onOpenLookup && (
            <button
              onClick={onOpenLookup}
              className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full"
              style={{
                color: accent,
                border: `1px solid ${accent}55`,
                background: 'var(--bk-accent-soft)',
              }}
              aria-label={t('publicBooking.checkMyBooking')}
            >
              {t('publicBooking.checkBooking')}
            </button>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-5 pt-5 pb-12 lg:max-w-5xl lg:px-10 lg:pt-10 lg:pb-16">
        {children}
      </main>

      {/* Bottom sticky CTA — mobile only. Desktop uses the right-rail summary
          with inline CTA so the customer always sees their selection without
          a sticky bar covering content. */}
      <div className="lg:hidden">{sticky}</div>

      <footer className="text-center py-6 px-4" style={{ borderTop: '1px solid var(--bk-border)' }}>
        <p className="text-[11px]" style={{ color: 'var(--bk-text-muted)' }}>
          {t('publicBooking.poweredBy')} <span style={{ color: accent, fontWeight: 600 }}>SembaPos</span>
        </p>
      </footer>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGE SWITCHER — pill ID / EN, customer-facing
// ═══════════════════════════════════════════════════════════════════════════

function LanguageSwitcher({ accent }) {
  const { i18n } = useTranslation()
  const current = i18n.language?.startsWith('en') ? 'en' : 'id'
  const pick = (lng) => {
    try { localStorage.setItem('i18nextLng', lng) } catch { /* ignore */ }
    i18n.changeLanguage(lng)
  }
  const langs = [{ code: 'id', label: 'ID' }, { code: 'en', label: 'EN' }]
  return (
    <div
      className="flex items-center rounded-full p-0.5 flex-shrink-0"
      style={{ background: 'var(--bk-surface-2)', border: '1px solid var(--bk-border)' }}
      role="group"
      aria-label="Language"
    >
      {langs.map(l => {
        const isActive = current === l.code
        return (
          <button
            key={l.code}
            onClick={() => pick(l.code)}
            aria-pressed={isActive}
            className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full transition-colors"
            style={{
              color: isActive ? '#FFFFFF' : 'var(--bk-text-2)',
              background: isActive ? accent : 'transparent',
            }}
          >
            {l.label}
          </button>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP INDICATOR — progress bar bernomor (Tier 3 redesign, 2026-05-28)
// Pengganti dots + connecting line. Bar fill di atas + 4 step dots numbered di
// bawah, dengan label step yang sedang aktif eksplisit.
// ═══════════════════════════════════════════════════════════════════════════

function StepIndicator({ current }) {
  const { t } = useTranslation()
  const pct = ((current + 1) / STEPS.length) * 100
  return (
    <div className="bk-progress-v2">
      <div className="lbl">
        <span>{t('publicBooking.step')} <span className="curr">{current + 1} / {STEPS.length}</span></span>
        <span>{t(`publicBooking.${STEPS[current]?.labelKey}`)}</span>
      </div>
      <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
      <div className="dots">
        {STEPS.map((s, i) => {
          const isDone = i < current
          const isActive = i === current
          const cls = isDone ? 'dot done' : isActive ? 'dot active' : 'dot'
          return (
            <div key={s.key} className={cls}>
              <span className="circle">{isDone ? <Check className="w-3 h-3" strokeWidth={3} /> : i + 1}</span>
              {t(`publicBooking.${s.labelKey}`)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// STICKY BOTTOM CTA
// ═══════════════════════════════════════════════════════════════════════════

function StickyCta({ label, onClick, disabled, accent, note }) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{
        background: 'linear-gradient(180deg, transparent 0%, var(--bk-bg) 30%)',
        paddingTop: '24px',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0), 12px)',
      }}
    >
      <div className="max-w-md mx-auto px-5">
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-2" style={{ background: 'var(--bk-surface)', border: '1px solid var(--bk-border)' }}>
          <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: accent }} />
          <p className="text-xs flex-1 truncate" style={{ color: disabled ? 'var(--bk-text-muted)' : 'var(--bk-text-2)' }}>{note}</p>
        </div>
        <button onClick={onClick} disabled={disabled}
          className="bk-cta w-full inline-flex items-center justify-center gap-2"
        >
          {label}
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1 — Pilih Barber & Layanan
// ═══════════════════════════════════════════════════════════════════════════

function Step1Pick({ tenantName, tenantLogo, bp, branches, services, barbers, testimonials = [], queueInfo = {}, selected, accent, tenantTz,
                    onPickBranch, onPickService, onPickBarber, onNext, canNext }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-7 lg:space-y-10">
      {/* Header banner — full width on both mobile & desktop */}
      <ShopHeader bp={bp} tenantName={tenantName} tenantLogo={tenantLogo} branch={selected.branch} accent={accent} tenantTz={tenantTz} />

      {/* Two-column layout on desktop: selection (2/3) + summary (1/3) */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-8">
        <div className="lg:col-span-2 space-y-7">
          {/* Branch selector — only when multi-branch */}
          {branches.length > 1 && (
            <BranchSelector branches={branches} selected={selected.branch} onPick={onPickBranch} accent={accent} queueInfo={queueInfo} />
          )}

          {/* Estimasi antrean cabang terpilih — untuk tenant 1 cabang (selector
              di atas sudah menampilkannya per-pill saat multi-cabang). */}
          {branches.length <= 1 && selected.branch && queueInfo[selected.branch.id]?.waiting > 0 && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: 'var(--bk-surface)', color: 'var(--bk-text)', border: '1px solid var(--bk-border)' }}>
              🕐 {t('publicBooking.estWait', { wait: fmtWait(queueInfo[selected.branch.id].estimatedMinutes, t) })}
              <span style={{ color: 'var(--bk-text-muted)' }}>· {t('publicBooking.inQueue', { count: queueInfo[selected.branch.id].waiting })}</span>
            </div>
          )}

          {/* Barber picker */}
          <div>
            <SectionTitle accent={accent} step="01" title={t('publicBooking.pickBarber')} />
            <BarberCarousel barbers={barbers} selected={selected.barber} onPick={onPickBarber} accent={accent} />
          </div>

          {/* Service list — boleh pilih lebih dari satu */}
          <div>
            <SectionTitle accent={accent} step="02" title={t('publicBooking.pickService')} hint={t('publicBooking.multipleAllowed')} />
            <ServiceList services={services} selected={selected.services} onPick={onPickService} accent={accent} />
          </div>

          {/* Testimoni pelanggan — hanya tampil kalau ada published testimoni */}
          {testimonials.length > 0 && (
            <TestimonialsSection items={testimonials} accent={accent} />
          )}

          {/* Galeri foto — dari pengaturan Halaman Booking */}
          {bp.showGallery !== false && Array.isArray(bp.gallery) && bp.gallery.length > 0 && (
            <GallerySection images={bp.gallery} accent={accent} />
          )}

          {/* Sosial media & kontak — dari pengaturan Halaman Booking */}
          {bp.showSocial !== false && (
            <SocialContactSection bp={bp} accent={accent} />
          )}
        </div>

        {/* Sticky summary — desktop only */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <SidebarSummary
              accent={accent}
              selected={selected}
              tenantName={tenantName}
              ctaLabel={t('publicBooking.ctaContinueSchedule')}
              ctaDisabled={!canNext}
              onCta={onNext}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}

// Section "Apa Kata Pelanggan" — testimoni rating ≥4★ yang sudah di-publish admin.
// Layout responsive: 1 col mobile, 2 col tablet, 3 col desktop.
function TestimonialsSection({ items, accent }) {
  const { t, i18n } = useTranslation()
  return (
    <div>
      <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
        <div>
          <p className="bk-step-num" style={{ color: accent }}>03</p>
          <h2 className="font-display text-xl font-bold mt-0.5" style={{ color: 'var(--bk-text)' }}>
            {t('publicBooking.testimonialsTitle')}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--bk-text-muted)' }}>
          <span className="tabular-nums">{t('publicBooking.reviewCount', { count: items.length })}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3">
        {items.map(tm => (
          <div key={tm.id} className="bk-card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm truncate" style={{ color: 'var(--bk-text)' }}>
                {tm.barber?.name || t('publicBooking.barber')}
              </span>
              <span className="tabular-nums text-sm whitespace-nowrap" style={{ color: accent }}>
                {'★'.repeat(tm.rating)}{'☆'.repeat(5 - tm.rating)}
              </span>
            </div>
            <p className="text-sm italic leading-relaxed" style={{ color: 'var(--bk-text)' }}>
              "{tm.comment}"
            </p>
            {tm.publishedAt && (
              <p className="text-[11px] mt-auto" style={{ color: 'var(--bk-text-muted)' }}>
                {format(new Date(tm.publishedAt), 'd MMM yyyy', { locale: dfLocale(i18n.language) })}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Galeri foto toko — grid responsif dari `bookingPage.gallery`.
function GallerySection({ images, accent }) {
  const { t } = useTranslation()
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <ImageIcon className="w-5 h-5" style={{ color: accent }} />
        <h2 className="font-display text-xl font-bold" style={{ color: 'var(--bk-text)' }}>{t('publicBooking.gallery')}</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {images.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={t('publicBooking.galleryAlt', { num: i + 1 })}
            loading="lazy"
            className="w-full aspect-square object-cover rounded-xl"
            style={{ border: '1px solid var(--bk-border)' }}
          />
        ))}
      </div>
    </div>
  )
}

// Normalisasi nilai sosmed/kontak (handle ATAU URL) → URL siap-klik.
function buildSocialLinks(bp, t) {
  const clean = (v) => (v || '').trim()
  const isUrl = (v) => /^https?:\/\//i.test(v)
  const links = []
  const ig = clean(bp.instagram)
  const tt = clean(bp.tiktok)
  const fb = clean(bp.facebook)
  const wa = clean(bp.whatsapp)
  const map = clean(bp.googleMapsUrl)
  if (ig)  links.push({ key: 'ig', label: 'Instagram', icon: Camera,        href: isUrl(ig) ? ig : `https://instagram.com/${ig.replace(/^@/, '')}` })
  if (tt)  links.push({ key: 'tt', label: 'TikTok',    icon: Music2,        href: isUrl(tt) ? tt : `https://tiktok.com/@${tt.replace(/^@/, '')}` })
  if (fb)  links.push({ key: 'fb', label: 'Facebook',  icon: Globe,         href: isUrl(fb) ? fb : `https://facebook.com/${fb}` })
  if (wa) {
    const digits = wa.replace(/\D/g, '').replace(/^0/, '62')
    if (digits) links.push({ key: 'wa', label: 'WhatsApp', icon: MessageSquare, href: `https://wa.me/${digits}` })
  }
  if (map) links.push({ key: 'map', label: t('publicBooking.viewLocation'), icon: MapPin, href: map })
  return links
}

// Sosial media & kontak toko — dari `bookingPage`.
function SocialContactSection({ bp, accent }) {
  const { t } = useTranslation()
  const links = buildSocialLinks(bp, t)
  if (links.length === 0) return null
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Share2 className="w-5 h-5" style={{ color: accent }} />
        <h2 className="font-display text-xl font-bold" style={{ color: 'var(--bk-text)' }}>{t('publicBooking.socialContact')}</h2>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {links.map(l => (
          <a
            key={l.key}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-transform active:scale-95"
            style={{ background: 'var(--bk-surface)', border: '1px solid var(--bk-border)', color: 'var(--bk-text)' }}
          >
            <l.icon className="w-4 h-4" style={{ color: accent }} />
            {l.label}
          </a>
        ))}
      </div>
    </div>
  )
}

// Sidebar summary card — appears as right rail on desktop, replaces the
// bottom-fixed StickyCta. Always shows what's been picked + the next-step CTA.
function SidebarSummary({ accent, selected, tenantName, ctaLabel, ctaDisabled, onCta }) {
  const { t, i18n } = useTranslation()
  const svcs = selected.services || []
  const totalPrice = svcs.reduce((sum, s) => sum + (s.price || 0), 0)
  return (
    <div className="bk-card p-5 space-y-4">
      <div>
        <p className="bk-label">{t('publicBooking.summary')}</p>
        <p className="font-display text-base font-bold mt-1 truncate" style={{ color: 'var(--bk-text)' }}>{tenantName}</p>
      </div>

      <div className="space-y-2.5 text-sm">
        <SidebarRow label={t('publicBooking.branch')}  value={selected.branch?.name} />
        <SidebarRow label={t('publicBooking.barber')}  value={selected.barber?.name} muted={!selected.barber} />
        <SidebarRow
          label={svcs.length > 1 ? t('publicBooking.serviceWithCount', { count: svcs.length }) : t('publicBooking.service')}
          value={svcs.length ? svcs.map(s => s.name).join(', ') : null}
          highlight={svcs.length > 0}
          accent={accent}
        />
        {selected.date && (
          <SidebarRow label={t('publicBooking.schedule')} value={`${format(selected.date, 'd MMM', { locale: dfLocale(i18n.language) })} · ${selected.time || ''}`} />
        )}
      </div>

      {totalPrice > 0 && (
        <div className="rounded-xl p-3.5 flex items-center justify-between" style={{ background: accent, color: '#FFFFFF' }}>
          <span className="text-[10px] uppercase tracking-[0.22em] font-bold opacity-70">{t('publicBooking.total')}</span>
          <span className="font-display text-xl font-bold">{formatRupiah(totalPrice)}</span>
        </div>
      )}

      <button onClick={onCta} disabled={ctaDisabled} className="bk-cta w-full inline-flex items-center justify-center gap-2">
        {ctaLabel}
        <ChevronRight className="w-4 h-4" />
      </button>
      {ctaDisabled && (
        <p className="text-[11px] text-center" style={{ color: 'var(--bk-text-muted)' }}>
          {t('publicBooking.pickServiceToContinue')}
        </p>
      )}
    </div>
  )
}

function SidebarRow({ label, value, highlight, accent, muted }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--bk-text-muted)' }}>{label}</span>
      <span className="text-right truncate ml-2" style={{
        color: highlight ? accent : muted ? 'var(--bk-text-muted)' : 'var(--bk-text)',
        fontWeight: highlight ? 700 : 500,
      }}>
        {value || '—'}
      </span>
    </div>
  )
}

// Compute status "Buka sekarang" vs "Tutup" dari openTime/closeTime branch
// (HH:mm). TZ-aware: pakai jam zona waktu tenant (nowHHMMInTz) — sama dgn
// logika kunci slot — agar status benar walau pengunjung di zona berbeda.
// Kalau jam buka/tutup hilang, return null = chip tidak tampil.
function computeOpenStatus(branch, tz) {
  const open = branch?.openTime
  const close = branch?.closeTime
  if (!open || !close) return null
  const hhmm = nowHHMMInTz(tz)
  const isOpen = hhmm >= open && hhmm < close
  return { isOpen, open, close }
}

function ShopHeader({ bp, tenantName, tenantLogo, branch, accent, tenantTz }) {
  const { t } = useTranslation()
  const heroImage = bp.heroImage
  const showLogo  = bp.showLogo !== false
  const tagline   = bp.tagline
  const status    = computeOpenStatus(branch, tenantTz)
  const useImage  = !!heroImage

  // Mode A: tenant punya heroImage → pertahankan visual asli (image + overlay)
  // supaya identity foto barbershop tetap shining.
  // Mode B: tanpa hero image → pakai gradient brand indigo dark (rebrand 2026-05-28
  // Tier 3) supaya feels premium tanpa perlu asset upload.
  if (useImage) {
    return (
      <div className="relative overflow-hidden rounded-3xl" style={{ border: '1px solid var(--bk-border)' }}>
        <div className="absolute inset-0" style={{ backgroundImage: `url(${heroImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(17,17,17,0.55) 0%, rgba(17,17,17,0.85) 100%)' }} />

        <div className="relative px-5 pt-7 pb-5 lg:px-10 lg:pt-16 lg:pb-10 lg:min-h-[360px] lg:flex lg:flex-col lg:justify-end">
          {status && (
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <span className="bk-status-chip"><span className="bk-pulse-dot" />{status.isOpen ? t('publicBooking.openNow') : t('publicBooking.closed')}</span>
              <span className="bk-soft-chip">{status.isOpen ? t('publicBooking.closesAt', { time: status.close }) : t('publicBooking.opensAt', { time: status.open })}</span>
            </div>
          )}
          <div className="flex items-start gap-3 lg:gap-5">
            {showLogo && tenantLogo ? (
              <img src={tenantLogo} alt={tenantName}
                className="w-14 h-14 lg:w-20 lg:h-20 rounded-2xl object-cover flex-shrink-0"
                style={{ outline: `2px solid ${accent}`, outlineOffset: 2, background: 'var(--bk-bg)' }} />
            ) : showLogo ? (
              <div className="w-14 h-14 lg:w-20 lg:h-20 rounded-2xl flex-shrink-0 flex items-center justify-center"
                style={{ background: `${accent}20`, outline: `2px solid ${accent}`, outlineOffset: 2 }}>
                <Scissors className="w-6 h-6 lg:w-9 lg:h-9" style={{ color: accent }} />
              </div>
            ) : null}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] lg:text-[11px] uppercase tracking-[0.22em] font-semibold drop-shadow" style={{ color: accent }}>
                {tagline || t('publicBooking.premiumBarbershop')}
              </p>
              <h1 className="font-display text-2xl lg:text-5xl font-bold tracking-tight leading-tight mt-1 lg:mt-2 drop-shadow-md"
                style={{ color: '#FFF' }}>
                {tenantName}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 lg:gap-2 mt-4 lg:mt-5">
            {branch?.address && (
              <Badge icon={MapPin} accent={accent} label={branch.address} onDark />
            )}
            {branch?.openTime && branch?.closeTime && (
              <Badge icon={Clock} accent={accent} label={`${branch.openTime} – ${branch.closeTime}`} onDark />
            )}
            <Badge icon={Star} accent={accent} label={t('publicBooking.onlineBooking')} filled onDark />
          </div>
        </div>
      </div>
    )
  }

  // Mode B: brand gradient hero (Tier 3 modern)
  return (
    <div className="bk-hero-v2 lg:min-h-[280px] lg:flex lg:flex-col lg:justify-end lg:p-10">
      {status && (
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <span className="bk-status-chip"><span className="bk-pulse-dot" />{status.isOpen ? t('publicBooking.openNow') : t('publicBooking.closed')}</span>
          <span className="bk-soft-chip">{status.isOpen ? t('publicBooking.closesAt', { time: status.close }) : t('publicBooking.opensAt', { time: status.open })}</span>
        </div>
      )}
      <div className="flex items-start gap-3 lg:gap-5">
        {showLogo && tenantLogo ? (
          <img src={tenantLogo} alt={tenantName}
            className="w-14 h-14 lg:w-20 lg:h-20 rounded-2xl object-cover flex-shrink-0 bg-white/10" />
        ) : showLogo ? (
          <div className="w-14 h-14 lg:w-20 lg:h-20 rounded-2xl flex-shrink-0 flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.15)' }}>
            <Scissors className="w-6 h-6 lg:w-9 lg:h-9" style={{ color: '#FFFFFF' }} />
          </div>
        ) : null}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] lg:text-[11px] uppercase tracking-[0.22em] font-semibold" style={{ color: '#EBC877' }}>
            {tagline || t('publicBooking.premiumBarbershop')}
          </p>
          <h1 className="font-display text-2xl lg:text-5xl font-bold tracking-tight leading-tight mt-1 lg:mt-2" style={{ color: '#F6F1E7' }}>
            {tenantName}
          </h1>
        </div>
      </div>

      {(branch?.address || (branch?.openTime && branch?.closeTime)) && (
        <div className="flex flex-wrap gap-1.5 lg:gap-2 mt-4 lg:mt-5">
          {branch?.address && (
            <Badge icon={MapPin} accent={accent} label={branch.address} onDark />
          )}
          {branch?.openTime && branch?.closeTime && (
            <Badge icon={Clock} accent={accent} label={`${branch.openTime} – ${branch.closeTime}`} onDark />
          )}
        </div>
      )}
    </div>
  )
}

function Badge({ icon: Icon, label, accent, filled, onDark }) {
  // Filled = always gold-tinted (works on any surface).
  // Non-filled = adapts: subtle dark glass when on image overlay, subtle
  // surface card when on the lighter fallback hero.
  const styles = filled
    ? {
        background: `${accent}28`,
        border: `1px solid ${accent}`,
        color: accent,
      }
    : onDark
    ? {
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.18)',
        color: '#EFEFEF',
      }
    : {
        background: 'var(--bk-surface)',
        border: '1px solid var(--bk-border)',
        color: 'var(--bk-text)',
      }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium leading-none"
      style={{ ...styles, backdropFilter: 'blur(6px)' }}>
      <Icon className="w-3 h-3" />
      <span className="truncate max-w-[180px]">{label}</span>
    </span>
  )
}

function fmtWait(min, t) {
  if (min < 60) return t('publicBooking.waitMinutes', { count: min })
  const h = Math.floor(min / 60), m = min % 60
  return m
    ? t('publicBooking.waitHoursMinutes', { hours: h, minutes: m })
    : t('publicBooking.waitHours', { count: h })
}

function BranchSelector({ branches, selected, onPick, accent, queueInfo = {} }) {
  const { t } = useTranslation()
  return (
    <div>
      <SectionTitle accent={accent} step="" title={t('publicBooking.branch')} />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {branches.map(b => {
          const isSel = selected?.id === b.id
          const q = queueInfo[b.id]
          // Tampilkan estimasi hanya bila ada antrean — cabang tanpa antrean
          // dibiarkan bersih (langsung dilayani, tak perlu angka menakuti).
          const wait = q && q.waiting > 0
            ? `🕐 ${fmtWait(q.estimatedMinutes, t)} · ${t('publicBooking.inQueue', { count: q.waiting })}`
            : null
          return (
            <button key={b.id} onClick={() => onPick(b)}
              className="flex-shrink-0 flex flex-col items-start justify-center px-4 py-2 rounded-2xl text-sm font-semibold whitespace-nowrap transition-all"
              style={{
                background: isSel ? accent : 'var(--bk-surface)',
                color: isSel ? '#FFFFFF' : 'var(--bk-text)',
                border: `1px solid ${isSel ? accent : 'var(--bk-border)'}`,
                minHeight: '44px',
                boxShadow: isSel ? `0 4px 12px -4px ${accent}66` : 'none',
              }}
            >
              <span>{b.name}</span>
              {wait && (
                <span className="text-[10px] font-medium leading-none mt-0.5"
                  style={{ color: isSel ? 'rgba(255,255,255,0.85)' : 'var(--bk-text-muted)' }}>
                  {wait}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function BarberCarousel({ barbers, selected, onPick, accent }) {
  const { t } = useTranslation()
  if (barbers.length === 0) {
    return (
      <p className="text-center py-8 text-sm" style={{ color: 'var(--bk-text-muted)' }}>
        {t('publicBooking.noBarbers')}
      </p>
    )
  }
  return (
    <div className="flex gap-3 overflow-x-auto -mx-1 px-1 pb-2" role="radiogroup" aria-label={t('publicBooking.pickBarber')}>
      {barbers.map(barber => {
        const isSel = selected?.id === barber.id
        const hasRating = barber.ratingCount > 0 && barber.avgRating != null
        // "Rekomendasi": rating tinggi DAN cukup ulasan — cegah 1 ulasan bintang-5
        // jadi "top". Bantu pelanggan baru memilih (kurangi choice paralysis).
        const isTopRated = barber.avgRating >= 4.5 && barber.ratingCount >= 5
        return (
          <button key={barber.id}
            type="button"
            onClick={() => onPick(barber)}
            role="radio"
            aria-checked={isSel}
            aria-label={`${t('publicBooking.barber')} ${barber.name}${isTopRated ? `, ${t('publicBooking.recommended')}` : ''}${hasRating ? `, ${t('publicBooking.ratingAria', { rating: barber.avgRating, count: barber.ratingCount })}` : `, ${t('publicBooking.noRatingYet')}`}`}
            className="flex-shrink-0 flex flex-col items-center gap-1.5 w-[96px]"
          >
            <div className="relative">
              <div className="w-[72px] h-[72px] rounded-full overflow-hidden flex items-center justify-center transition-all"
                style={{
                  border: `2px solid ${isSel ? accent : 'transparent'}`,
                  boxShadow: isSel ? `0 0 0 1px ${accent}, 0 8px 20px -8px ${accent}80` : 'none',
                  padding: isSel ? '2px' : '0',
                  background: isSel ? 'var(--bk-bg)' : 'transparent',
                }}>
                <Avatar src={barber.photo} name={barber.name} size="lg" className="w-full h-full" />
              </div>
              {isSel && (
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: accent, color: '#FFFFFF', border: '2px solid var(--bk-bg)' }}>
                  <Check className="w-3 h-3" strokeWidth={3} />
                </div>
              )}
              {isTopRated && (
                <div className="absolute -top-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center text-[11px] leading-none"
                  title={t('publicBooking.recommendedHighRating')}
                  style={{ background: '#F59E0B', color: '#FFFFFF', border: '2px solid var(--bk-bg)' }}>
                  ★
                </div>
              )}
            </div>
            <p className="text-[11px] font-semibold leading-tight text-center truncate w-full"
              style={{ color: isSel ? accent : 'var(--bk-text)' }}>
              {barber.name}
            </p>
            {hasRating ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold leading-none px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--bk-surface)', color: accent }}>
                ★ {barber.avgRating.toFixed(1)}
                <span style={{ color: 'var(--bk-text-muted)' }}>({barber.ratingCount})</span>
              </span>
            ) : (
              <span className="text-[10px] leading-none" style={{ color: 'var(--bk-text-muted)' }}>
                {t('publicBooking.newBarber')}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function ServiceList({ services, selected, onPick, accent }) {
  const { t } = useTranslation()
  // `selected` kini array layanan terpilih (bisa lebih dari satu).
  const selectedList = Array.isArray(selected) ? selected : (selected ? [selected] : [])
  const selCount = selectedList.length
  const selTotal = selectedList.reduce((sum, s) => sum + (s.price || 0), 0)
  const selDur   = selectedList.reduce((sum, s) => sum + (s.duration || 0), 0)
  // Surface category chips only when there's more than one distinct category —
  // otherwise the filter row is just noise. "All" reset chip first, then the
  // categories in the order they first appear in the services list (backend
  // sorts by category asc so this is alphabetical-ish anyway).
  const categories = React.useMemo(() => {
    const seen = new Set()
    services.forEach(s => { if (s.category) seen.add(s.category) })
    return [...seen]
  }, [services])
  const [cat, setCat] = React.useState('All')
  const filtered = cat === 'All' ? services : services.filter(s => s.category === cat)

  if (services.length === 0) return (
    <p className="text-center py-12 text-sm" style={{ color: 'var(--bk-text-muted)' }}>{t('publicBooking.noServices')}</p>
  )
  return (
    <div className="space-y-3">
      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {['All', ...categories].map(c => {
            const isSel = cat === c
            return (
              <button
                key={c}
                onClick={() => setCat(c)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
                style={{
                  background: isSel ? accent : 'var(--bk-surface)',
                  color: isSel ? '#FFFFFF' : 'var(--bk-text-2)',
                  border: `1px solid ${isSel ? accent : 'var(--bk-border)'}`,
                }}
              >
                {c === 'All' ? t('publicBooking.all') : c}
              </button>
            )
          })}
        </div>
      )}
      <div className="space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
      {filtered.map(svc => {
        const isSel = selectedList.some(s => s.id === svc.id)
        return (
          <button key={svc.id} onClick={() => onPick(svc)}
            className="w-full text-left p-4 transition-all"
            style={{
              background: isSel ? `${accent}10` : 'var(--bk-surface)',
              border: `1.5px solid ${isSel ? accent : 'var(--bk-border)'}`,
              borderRadius: '14px',
              boxShadow: isSel ? `0 8px 24px -12px ${accent}60` : 'none',
            }}
          >
            <div className="flex items-center gap-3.5">
              <div className="text-3xl flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: isSel ? `${accent}22` : 'var(--bk-surface-2)' }}>
                {svc.icon || '✂️'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold leading-tight" style={{ color: 'var(--bk-text)' }}>{svc.name}</p>
                <div className="flex items-center gap-3 mt-1 text-[12px]" style={{ color: 'var(--bk-text-2)' }}>
                  {svc.duration && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />{t('publicBooking.minutesShort', { count: svc.duration })}
                    </span>
                  )}
                </div>
              </div>
              <span className="font-display text-base font-bold whitespace-nowrap" style={{ color: isSel ? accent : 'var(--bk-text)' }}>
                {formatRupiah(svc.price)}
              </span>
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all ml-1"
                style={{
                  background: isSel ? accent : 'transparent',
                  border: `2px solid ${isSel ? accent : 'var(--bk-border-strong)'}`,
                }}>
                {isSel && <Check className="w-4 h-4" strokeWidth={3} style={{ color: '#FFFFFF' }} />}
              </div>
            </div>
          </button>
        )
      })}
      </div>
      {selCount > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl"
          style={{ background: 'var(--bk-accent-soft)', border: `1px solid ${accent}55` }}>
          <span className="text-xs font-medium" style={{ color: 'var(--bk-text-2)' }}>
            {t('publicBooking.servicesSelected', { count: selCount })}{selDur ? ` · ${t('publicBooking.minutesShort', { count: selDur })}` : ''}
          </span>
          <span className="font-display text-base font-bold" style={{ color: accent }}>{formatRupiah(selTotal)}</span>
        </div>
      )}
    </div>
  )
}

function SectionTitle({ step, title, accent, hint }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      {step && (
        <span className="text-[10px] uppercase tracking-[0.22em] font-bold px-2 py-1 rounded-md" style={{
          color: accent, background: 'var(--bk-accent-soft)',
        }}>{step}</span>
      )}
      <h2 className="font-display text-base font-bold tracking-tight" style={{ color: 'var(--bk-text)' }}>{title}</h2>
      {hint && (
        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{
          color: accent, background: 'var(--bk-accent-soft)',
        }}>{hint}</span>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2 — Pilih Jadwal (calendar grid + slot grid)
// ═══════════════════════════════════════════════════════════════════════════

function Step2Schedule({ selected, timeSlots, bookedSlots, branchClosure, tenantTz, accent, shake,
                         onPickDate, onPickTime, onBack, onNext }) {
  const { t, i18n } = useTranslation()
  const weekdays = [
    t('publicBooking.dowSun'), t('publicBooking.dowMon'), t('publicBooking.dowTue'),
    t('publicBooking.dowWed'), t('publicBooking.dowThu'), t('publicBooking.dowFri'), t('publicBooking.dowSat'),
  ]
  // Set tanggal-tanggal cabang ini ditutup admin (mis. Lebaran) — dipakai untuk
  // disable di kalender pemilihan tanggal.
  const closedDates = React.useMemo(() => {
    const arr = Array.isArray(selected.branch?.closedDates) ? selected.branch.closedDates : []
    return new Set(arr.map((c) => c?.date).filter(Boolean))
  }, [selected.branch?.closedDates])
  const isClosedDate = (day) => closedDates.has(format(day, 'yyyy-MM-dd'))
  const [viewMonth, setViewMonth] = useState(selected.date || new Date())
  // ensure if selected.date changes externally we follow
  useEffect(() => { if (selected.date) setViewMonth(selected.date) }, [selected.date])

  const monthStart = startOfMonth(viewMonth)
  const monthEnd   = endOfMonth(viewMonth)
  const days       = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const leadingBlanks = getDay(monthStart) // 0=Sun

  const today = startOfDay(new Date())
  const isViewCurrentMonth = isSameMonth(viewMonth, today)
  const goPrev = () => { if (!isViewCurrentMonth) setViewMonth(subMonths(viewMonth, 1)) }
  const goNext = () => setViewMonth(addMonths(viewMonth, 1))

  const allSlotsUnavailable = selected.date && timeSlots.length > 0 && timeSlots.every(t =>
    isSlotInPast(t, selected.date, tenantTz) || bookedSlots.includes(t)
  )

  return (
    <div className="space-y-7 lg:max-w-4xl lg:mx-auto">
      {/* Two-column on desktop: calendar (left) + time grid (right) */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-7 lg:space-y-0">
      {/* Calendar */}
      <div className="bk-card p-4 lg:p-5">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={goPrev}
            disabled={isViewCurrentMonth}
            aria-label={t('publicBooking.prevMonth')}
            className="w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ color: 'var(--bk-text-2)', background: 'var(--bk-surface-2)' }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <p className="font-display text-base font-bold capitalize">
            {format(viewMonth, 'MMMM yyyy', { locale: dfLocale(i18n.language) })}
          </p>
          <button
            onClick={goNext}
            aria-label={t('publicBooking.nextMonth')}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ color: 'var(--bk-text-2)', background: 'var(--bk-surface-2)' }}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-1 mb-1.5">
          {weekdays.map((d, i) => (
            <p key={i} className="text-[10px] uppercase tracking-wider font-bold text-center" style={{ color: 'var(--bk-text-muted)' }}>{d}</p>
          ))}
        </div>

        {/* Date grid */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`bl${i}`} />)}
          {days.map(day => {
            const isPast = isBefore(day, today) && !isSameDay(day, today)
            const isSel = selected.date && isSameDay(day, selected.date)
            const isCurrentMonth = isSameMonth(day, viewMonth)
            const isToday_ = isSameDay(day, today)
            const closed = isClosedDate(day)
            const disabled = isPast || closed
            return (
              <button
                key={day.toISOString()}
                disabled={disabled}
                onClick={() => onPickDate(day)}
                aria-label={`${format(day, 'EEEE, d MMMM yyyy', { locale: dfLocale(i18n.language) })}${closed ? `, ${t('publicBooking.branchClosed')}` : ''}`}
                aria-pressed={isSel}
                aria-current={isToday_ ? 'date' : undefined}
                title={closed ? t('publicBooking.branchClosedThisDate') : undefined}
                className="aspect-square rounded-lg text-sm font-semibold relative flex items-center justify-center transition-all"
                style={{
                  background: isSel ? accent : closed ? 'rgba(239,68,68,0.10)' : 'transparent',
                  color: isSel ? '#111' :
                         closed ? '#FCA5A5' :
                         isPast ? 'var(--bk-text-muted)' :
                         isCurrentMonth ? 'var(--bk-text)' : 'var(--bk-text-2)',
                  opacity: isPast ? 0.35 : closed ? 0.85 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  border: isToday_ && !isSel ? `1.5px solid ${accent}66` : closed ? '1px solid rgba(239,68,68,0.35)' : '1.5px solid transparent',
                  textDecoration: closed ? 'line-through' : undefined,
                  minHeight: '44px',
                  minWidth: '44px',
                }}
              >
                {format(day, 'd')}
              </button>
            )
          })}
        </div>
      </div>

      {/* Time grid */}
      {selected.date && branchClosure ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle step="" title={t('publicBooking.branchClosedTitle')} accent={accent} />
          </div>
          <div className="p-4 rounded-xl flex items-start gap-3 text-sm"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', color: '#FCA5A5' }}>
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{t('publicBooking.branchClosedOnDate')}</p>
              {branchClosure.note && (
                <p className="mt-0.5 opacity-90 italic">{branchClosure.note}</p>
              )}
              <p className="mt-1 text-xs opacity-80">{t('publicBooking.pickAnotherDate')}</p>
            </div>
          </div>
        </div>
      ) : selected.date ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle step="" title={t('publicBooking.pickTime')} accent={accent} />
          </div>
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-3">
            {timeSlots.map(time => {
              const past   = isSlotInPast(time, selected.date, tenantTz)
              const booked = bookedSlots.includes(time)
              const status = past ? 'past' : booked ? 'penuh' : 'tersedia'
              const isSel  = selected.time === time
              const isShaking = shake.key === time
              const styles = (() => {
                if (isSel) return { background: accent, color: '#FFFFFF', border: `1.5px solid ${accent}`, boxShadow: `0 4px 12px -4px ${accent}80` }
                if (status === 'past' || status === 'penuh') return {
                  background: 'var(--bk-surface-2)', color: 'var(--bk-text-muted)',
                  border: '1px solid var(--bk-border)', textDecoration: 'line-through',
                }
                return { background: 'transparent', color: 'var(--bk-text)', border: '1.5px solid var(--bk-border-strong)' }
              })()
              return (
                <button
                  key={time}
                  onClick={() => onPickTime(time, status)}
                  aria-label={`${t('publicBooking.timeAt', { time })}${status === 'penuh' ? `, ${t('publicBooking.full')}` : status === 'past' ? `, ${t('publicBooking.past')}` : ''}`}
                  aria-pressed={isSel}
                  aria-disabled={status !== 'tersedia'}
                  title={status === 'penuh' ? t('publicBooking.slotFull') : status === 'past' ? t('publicBooking.past') : undefined}
                  className={`py-3 rounded-xl text-sm font-semibold transition-all ${isShaking ? 'bk-shake' : ''}`}
                  style={{ ...styles, minHeight: '44px' }}
                >
                  {time}
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 text-[11px]" style={{ color: 'var(--bk-text-2)' }}>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-md" style={{ border: '1.5px solid var(--bk-border-strong)' }} /> {t('publicBooking.legendAvailable')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-md" style={{ background: accent }} /> {t('publicBooking.legendSelected')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-md" style={{ background: 'var(--bk-surface-2)', border: '1px solid var(--bk-border)' }} /> {t('publicBooking.legendFullPast')}
            </span>
          </div>

          {allSlotsUnavailable && (
            <div className="mt-4 p-3 rounded-xl flex items-start gap-2 text-xs"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', color: '#FCD34D' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {t('publicBooking.allSlotsUnavailable')}
            </div>
          )}
        </div>
      ) : (
        <div className="hidden lg:flex items-center justify-center bk-card p-8 min-h-[300px] text-center"
          style={{ borderStyle: 'dashed' }}>
          <p className="text-sm" style={{ color: 'var(--bk-text-muted)' }}>
            {t('publicBooking.pickDateToSeeSlots')}
          </p>
        </div>
      )}
      </div>{/* end 2-col grid */}

      {/* Bottom actions */}
      <div className="flex gap-2 pt-2">
        <button onClick={onBack} className="bk-back inline-flex items-center justify-center gap-1.5">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={onNext} disabled={!selected.date || !selected.time}
          className="bk-cta flex-1 inline-flex items-center justify-center gap-1.5">
          {t('publicBooking.ctaContinueConfirm')}
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3 — Konfirmasi
// ═══════════════════════════════════════════════════════════════════════════

function Step3Confirm({ tenantName, tenantWilayah, selected, form, formError, setForm, accent, totalPrice,
                        error, submitting, onBack, onSubmit }) {
  const { t, i18n } = useTranslation()
  return (
    <div className="lg:grid lg:grid-cols-5 lg:gap-8 space-y-6 lg:space-y-0">
      {/* Left: form + notes */}
      <div className="space-y-6 lg:col-span-3">
        <div>
          <SectionTitle step="03" title={t('publicBooking.personalData')} accent={accent} />
          <div className="space-y-2.5">
            <Field label={t('publicBooking.name')} icon={User} placeholder={t('publicBooking.fullNamePlaceholder')}
              value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} error={formError.name} />
            <Field label={t('publicBooking.whatsappPhone')} icon={Phone} type="tel" placeholder="08xxxxxxxxxx"
              value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} error={formError.phone} />
            {tenantWilayah?.kabupatenId && (
              <div>
                <label className="bk-label block mb-1.5">
                  {t('publicBooking.region')} <span style={{ color: 'var(--bk-text-muted)' }}>{t('publicBooking.optionalParen')}</span>
                </label>
                <WilayahPicker
                  kabupatenId={tenantWilayah.kabupatenId}
                  value={form.wilayah}
                  onChange={w => setForm(f => ({ ...f, wilayah: w }))}
                  selectClassName="bk-input"
                  labelClassName="bk-label block mb-1 text-[11px]"
                />
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="bk-label block mb-1.5">{t('publicBooking.notesOptional')}</label>
          <div className="relative">
            <MessageSquare className="absolute left-4 top-3.5 w-4 h-4" style={{ color: 'var(--bk-text-2)' }} />
            <textarea rows={3} placeholder={t('publicBooking.notesPlaceholder')}
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="bk-input resize-none" />
          </div>
        </div>

        {/* Disclaimer — kept on left so the right total bar stays uncluttered */}
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--bk-text-muted)' }}>
          {t('publicBooking.disclaimer')}
        </p>
      </div>

      {/* Right: summary + total + CTA — sticky on desktop */}
      <div className="lg:col-span-2">
        <div className="lg:sticky lg:top-24 space-y-5">
          <div>
            <SectionTitle step="" title={t('publicBooking.summary')} accent={accent} />
            <div className="bk-card overflow-hidden">
              <SummaryRow label={t('publicBooking.barbershop')} value={tenantName} />
              <SummaryRow label={t('publicBooking.branch')}     value={selected.branch?.name} />
              <SummaryRow label={t('publicBooking.barber')}     value={selected.barber?.name || t('publicBooking.barberAvailable')} />
              <SummaryRow
                label={(selected.services || []).length > 1 ? t('publicBooking.serviceWithCount', { count: selected.services.length }) : t('publicBooking.service')}
                value={(selected.services || []).map(s => s.name).join(', ')}
              />
              <SummaryRow label={t('publicBooking.date')}    value={format(selected.date, 'EEEE, d MMMM yyyy', { locale: dfLocale(i18n.language) })} />
              <SummaryRow label={t('publicBooking.time')}    value={selected.time} />
              <SummaryRow label={t('publicBooking.price')}   value={formatRupiah(totalPrice)} bold last />
            </div>
          </div>

          {/* Total bar */}
          <div className="rounded-2xl p-4 flex items-center justify-between"
            style={{ background: accent, color: '#FFFFFF' }}>
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] font-bold opacity-70">{t('publicBooking.totalPayment')}</p>
              <p className="font-display text-2xl font-bold mt-0.5">{formatRupiah(totalPrice)}</p>
            </div>
            <Sparkles className="w-7 h-7 opacity-70" />
          </div>

          {error && (
            <div className="p-3 rounded-2xl text-sm"
              style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={onBack} className="bk-back inline-flex items-center justify-center">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={onSubmit} disabled={submitting} className="bk-cta flex-1 inline-flex items-center justify-center gap-1.5">
              {submitting ? 'Memproses…' : 'Konfirmasi Booking'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, icon: Icon, placeholder, type = 'text', value, onChange, error }) {
  return (
    <div>
      <label className="bk-label block mb-1.5">{label}</label>
      <div className="relative">
        <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--bk-text-2)' }} />
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="bk-input"
          style={error ? { borderColor: '#EF4444' } : undefined} />
      </div>
      {error && <p className="text-xs mt-1.5" style={{ color: '#FCA5A5' }}>{error}</p>}
    </div>
  )
}

function SummaryRow({ label, value, bold, last }) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3"
      style={{ borderBottom: last ? 'none' : '1px solid var(--bk-border)' }}
    >
      <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--bk-text-2)' }}>{label}</span>
      <span className={`text-sm text-right ${bold ? 'font-bold text-base' : 'font-medium'}`}
        style={{ color: bold ? 'var(--bk-accent)' : 'var(--bk-text)' }}>
        {value || '—'}
      </span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4 — Sukses (digital ticket)
// ═══════════════════════════════════════════════════════════════════════════

function Step4Success({ booking, accent, tenantName, tenantPhone, onAnother }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const code = shortId(booking.id)

  const handleCopy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleShare = async () => {
    const text = `Booking saya di ${tenantName}: #${code} pada ${format(new Date(booking.date + 'T00:00:00'), 'd MMMM yyyy', { locale: idLocale })} jam ${booking.time}.`
    if (navigator.share) {
      try { await navigator.share({ title: 'Booking', text }) } catch {}
    } else if (tenantPhone) {
      const wa = `https://wa.me/${String(tenantPhone).replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`
      window.open(wa, '_blank')
    } else {
      navigator.clipboard?.writeText(text)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-6 lg:max-w-lg lg:mx-auto">
      {/* Animated check — mint untuk semantik success (bukan accent indigo) */}
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 14 }}
          className="w-24 h-24 rounded-full mx-auto flex items-center justify-center relative"
          style={{
            background: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
            boxShadow: '0 12px 30px rgba(16,185,129,0.28)',
          }}
        >
          <motion.div
            initial={{ scale: 0, opacity: 0.6 }} animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="absolute inset-0 rounded-full" style={{ background: '#10B981', opacity: 0.16 }}
          />
          <Check className="w-11 h-11" strokeWidth={3} style={{ color: '#FFFFFF' }} />
        </motion.div>
        <h2 className="font-display text-2xl font-bold tracking-tight mt-5">Booking dikonfirmasi! 🎉</h2>
        <p className="text-sm mt-1.5" style={{ color: 'var(--bk-text-2)' }}>
          Simpan kode di bawah & datang sesuai jadwal
        </p>
      </div>

      {/* Digital ticket — dashed border + perforation effect */}
      <div className="relative">
        <div
          className="rounded-2xl p-6"
          style={{
            background: 'var(--bk-surface)',
            border: `1.5px dashed ${accent}55`,
          }}
        >
          {/* Perforation cutouts — match page bg so the ticket appears physically punched */}
          <div className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full" style={{ background: 'var(--bk-bg)' }} />
          <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full" style={{ background: 'var(--bk-bg)' }} />

          <p className="text-[10px] uppercase tracking-[0.22em] font-bold" style={{ color: accent }}>Kode Booking</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="font-mono text-3xl font-bold tracking-[0.16em]" style={{ color: accent }}>
              #{code}
            </span>
            <button onClick={handleCopy} className="p-2 rounded-lg" style={{ border: '1px solid var(--bk-border)', color: 'var(--bk-text-2)' }} aria-label="Salin kode">
              {copied ? <Check className="w-4 h-4" style={{ color: accent }} /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <div className="mt-5 pt-5 space-y-2.5" style={{ borderTop: `1.5px dashed ${accent}33` }}>
            <TicketRow label="Status"  value={statusLabel(booking.status, t)} />
            <TicketRow label="Cabang"  value={booking.branch?.name} />
            <TicketRow label="Layanan" value={booking.serviceName} />
            <TicketRow label="Barber"  value={booking.barberName || 'Barber tersedia'} />
            <TicketRow label="Tanggal" value={format(new Date(booking.date + 'T00:00:00'), 'd MMM yyyy', { locale: idLocale })} />
            <TicketRow label="Jam"     value={booking.time} bold />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={handleShare} className="bk-cta-outline flex-1 inline-flex items-center justify-center gap-2">
          <Share2 className="w-4 h-4" />
          Bagikan
        </button>
        <button onClick={onAnother} className="bk-cta flex-1 inline-flex items-center justify-center gap-2">
          Booking Lagi
        </button>
      </div>
    </div>
  )
}

function TicketRow({ label, value, bold }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--bk-text-2)' }}>{label}</span>
      <span className="text-sm text-right" style={{
        color: bold ? 'var(--bk-accent)' : 'var(--bk-text)',
        fontWeight: bold ? 700 : 500,
      }}>
        {value || '—'}
      </span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// SHELLS — empty / loading / error
// ═══════════════════════════════════════════════════════════════════════════

function EmptyTenant() {
  return (
    <div className="text-center py-14 space-y-5">
      <div className="w-20 h-20 rounded-2xl mx-auto flex items-center justify-center"
        style={{ background: 'var(--bk-surface)', border: '1px solid var(--bk-border)' }}>
        <Scissors className="w-9 h-9" style={{ color: 'var(--bk-text-muted)' }} />
      </div>
      <div>
        <h2 className="font-display text-xl font-bold">Barbershop Tidak Ditemukan</h2>
        <p className="text-sm mt-2" style={{ color: 'var(--bk-text-2)' }}>
          Akses halaman booking melalui link dari barbershop Anda.
        </p>
      </div>
      <div className="bk-card p-4 text-left max-w-sm mx-auto">
        <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'var(--bk-text-2)' }}>Contoh URL</p>
        <p className="font-mono text-sm mt-1.5" style={{ color: 'var(--bk-accent)' }}>namabarbershop.sembapos.com/book</p>
      </div>
    </div>
  )
}

function LoadingShell() {
  return (
    <div className="space-y-3 animate-pulse pt-6">
      <div className="h-32 rounded-3xl" style={{ background: 'var(--bk-surface)' }} />
      <div className="h-20 rounded-2xl" style={{ background: 'var(--bk-surface)' }} />
      <div className="h-20 rounded-2xl" style={{ background: 'var(--bk-surface)' }} />
    </div>
  )
}

function ErrorShell({ message }) {
  return (
    <div className="text-center py-14">
      <p className="text-sm mb-5" style={{ color: '#FCA5A5' }}>{message}</p>
      <button onClick={() => window.location.reload()} className="bk-cta">Coba Lagi</button>
    </div>
  )
}
