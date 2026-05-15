import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Clock, Check, ChevronRight, Scissors, ChevronLeft,
  User, Phone, MessageSquare, Star, Copy, Share2,
  Sparkles, AlertCircle,
} from 'lucide-react'
import publicApi from '../../lib/publicApi.js'
import { usePublicTenantStore } from '../../store/publicTenantStore.js'
import { getTenantSlug } from '../../lib/tenantSlug.js'
import {
  format,
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isSameMonth, isSameDay, isBefore, startOfDay,
} from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { formatRupiah } from '../../utils/format.js'
import Avatar from '../../components/ui/Avatar.jsx'
import ErrorBoundary from '../../components/ui/ErrorBoundary.jsx'

// ═══════════════════════════════════════════════════════════════════════════
// Helpers (unchanged from previous version)
// ═══════════════════════════════════════════════════════════════════════════

const BOOKING_LEAD_MINUTES = 15
const STEPS = [
  { key: 'pick',    label: 'Barber & Layanan' },
  { key: 'date',    label: 'Jadwal' },
  { key: 'confirm', label: 'Konfirmasi' },
  { key: 'success', label: 'Selesai' },
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

const STATUS_LABEL = {
  pending: 'Menunggu Konfirmasi', confirmed: 'Terkonfirmasi',
  in_progress: 'Sedang Berlangsung', done: 'Selesai', cancelled: 'Dibatalkan',
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
  const {
    name: tenantName, logo: tenantLogo, status: tenantStatus,
    timezone: tenantTz, bookingPage, resolve,
  } = usePublicTenantStore()
  const bp = bookingPage || {}
  const accent = bp.primaryColor || '#C9A84C'

  // step: 0 (pick), 1 (date), 2 (confirm), 3 (success)
  const [step, setStep] = useState(0)
  const [branches, setBranches]   = useState([])
  const [services, setServices]   = useState([])
  const [barbers, setBarbers]     = useState([])
  const [bookedSlots, setBookedSlots] = useState([])
  const [loading, setLoading]     = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState(null)
  const [booking, setBooking]     = useState(null)

  const [selected, setSelected] = useState({
    branch: null, service: null, barber: null, date: null, time: null,
  })
  const [form, setForm] = useState({ name: '', phone: '', notes: '' })
  const [formError, setFormError] = useState({})
  const [shake, setShake] = useState({})  // { key: timestamp }

  // tick every minute → past slots auto-disable
  const [, setNowTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setNowTick(n => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // SEO + share metadata. Updates the document title/description/og tags so
  // links shared via WA/IG show the tenant's name instead of "BarberOS".
  useEffect(() => {
    if (!tenantName) return
    const prevTitle = document.title
    document.title = `Booking Online · ${tenantName}`
    const setMeta = (name, value, attr = 'name') => {
      let el = document.querySelector(`meta[${attr}="${name}"]`)
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, name)
        document.head.appendChild(el)
      }
      el.setAttribute('content', value)
    }
    const desc = `Booking online di ${tenantName}. Pilih layanan, barber, dan jadwal favoritmu — konfirmasi instan, bayar di tempat.`
    setMeta('description', desc)
    setMeta('og:title', `Booking Online · ${tenantName}`, 'property')
    setMeta('og:description', desc, 'property')
    setMeta('og:type', 'website', 'property')
    if (tenantLogo) setMeta('og:image', tenantLogo, 'property')
    setMeta('theme-color', accent)
    return () => { document.title = prevTitle }
  }, [tenantName, tenantLogo, accent])

  // ── Lookup modal (cek booking by phone) ────────────────────────────────
  const [showLookup, setShowLookup]   = useState(false)
  const [lookupPhone, setLookupPhone] = useState('')
  const [lookupList, setLookupList]   = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState(null)
  const handleLookup = async () => {
    if (!lookupPhone.trim() || lookupPhone.trim().length < 4) {
      setLookupError('Nomor HP minimal 4 digit')
      return
    }
    setLookupLoading(true); setLookupError(null)
    try {
      const res = await publicApi.get('/public/bookings/lookup', { params: { phone: lookupPhone.trim() } })
      setLookupList(res.data.data || [])
    } catch (err) {
      setLookupError(err?.response?.data?.error || 'Gagal mencari booking')
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
        const [bRes, sRes] = await Promise.all([
          publicApi.get('/public/branches'),
          publicApi.get('/public/services'),
        ])
        if (cancelled) return
        const br = bRes.data.data || []
        setBranches(br)
        setServices(sRes.data.data || [])
        // Auto-select first/only branch
        if (br.length >= 1) {
          setSelected(s => ({ ...s, branch: br[0] }))
          loadBarbers(br[0].id)
        }
      } catch {
        if (!cancelled) setError('Gagal memuat data. Pastikan koneksi internet Anda.')
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
    if (!selected.branch || !selected.date) { setBookedSlots([]); return }
    try {
      const res = await publicApi.get('/public/availability', {
        params: {
          branchId:  selected.branch.id,
          date:      format(selected.date, 'yyyy-MM-dd'),
          barberId:  selected.barber?.id,
          serviceId: selected.service?.id,
        },
        signal,
      })
      const data = res.data.data || {}
      // Use overlap-aware ranges when backend provides them (newer API), else
      // fall back to exact `booked` start times for back-compat.
      if (Array.isArray(data.bookedRanges) && data.bookedRanges.length && selected.service?.duration) {
        const targetDur = selected.service.duration
        const blocked = computeBlockedSlotsFromRanges(data.bookedRanges, targetDur)
        setBookedSlots(blocked)
      } else {
        setBookedSlots(data.booked || [])
      }
    } catch { /* network error → keep last known list */ }
  }, [selected.branch, selected.date, selected.barber, selected.service])

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
  const pickService = (s) => setSelected(p => ({ ...p, service: p.service?.id === s.id ? null : s }))
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
    if (!form.name.trim() || form.name.trim().length < 2) err.name = 'Nama minimal 2 karakter'
    if (!form.phone.trim() || form.phone.trim().length < 8) err.phone = 'Nomor HP minimal 8 digit'
    else if (!/^[\d+\-\s()]{8,15}$/.test(form.phone.trim())) err.phone = 'Format nomor HP tidak valid'
    setFormError(err)
    return Object.keys(err).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) return
    setSubmitting(true); setError(null)
    try {
      const res = await publicApi.post('/public/bookings', {
        branchId: selected.branch.id, serviceId: selected.service.id,
        barberId: selected.barber?.id,
        customerName: form.name.trim(), customerPhone: form.phone.trim(),
        date: format(selected.date, 'yyyy-MM-dd'), time: selected.time,
        notes: form.notes.trim() || undefined,
      })
      setBooking(res.data.data)
      setStep(3)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err?.response?.data?.error || 'Gagal membuat booking. Coba lagi.')
    } finally { setSubmitting(false) }
  }

  const resetAll = () => {
    setStep(0)
    setSelected(s => ({ branch: branches[0] || null, service: null, barber: null, date: null, time: null }))
    setForm({ name: '', phone: '', notes: '' })
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

  const canNextStep0 = !!selected.service
  const canNextStep1 = !!selected.date && !!selected.time
  const totalPrice   = selected.service?.price || 0

  return (
    <BookShell accent={accent} tenantName={tenantName} tenantLogo={tenantLogo} bp={bp}
      onOpenLookup={() => { setShowLookup(true); setLookupList(null); setLookupError(null) }}
      sticky={
        step === 0 ? (
          <StickyCta
            label="Lanjut Pilih Jadwal"
            disabled={!canNextStep0}
            onClick={() => { if (canNextStep0) { setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }) } }}
            accent={accent}
            note={canNextStep0 ? `${selected.service.name} · ${formatRupiah(selected.service.price)}` : 'Pilih layanan untuk lanjut'}
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
              selected={selected} accent={accent}
              onPickBranch={pickBranch} onPickService={pickService} onPickBarber={pickBarber}
              canNext={canNextStep0}
              onNext={() => { if (canNextStep0) { setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }) } }}
            />
          )}
          {step === 1 && (
            <Step2Schedule
              selected={selected} timeSlots={timeSlots} bookedSlots={bookedSlots} tenantTz={tenantTz}
              accent={accent} shake={shake}
              onPickDate={pickDate} onPickTime={pickTime}
              onBack={() => setStep(0)}
              onNext={() => { setStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            />
          )}
          {step === 2 && (
            <Step3Confirm
              tenantName={tenantName} selected={selected} form={form} formError={formError}
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
            <h3 className="font-display text-lg font-bold">Cek Booking Saya</h3>
            <button onClick={onClose} className="p-2 rounded-lg" style={{ color: 'var(--bk-text-2)' }} aria-label="Tutup">
              ✕
            </button>
          </div>
          <p className="text-xs" style={{ color: 'var(--bk-text-2)' }}>
            Masukkan nomor HP yang dipakai saat booking. Akan tampil maksimal 5 booking terbaru.
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
            {loading ? 'Mencari…' : 'Cari Booking'}
          </button>

          {list !== null && (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {list.length === 0 ? (
                <p className="text-center text-sm py-6" style={{ color: 'var(--bk-text-muted)' }}>
                  Tidak ada booking aktif dengan nomor ini.
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
                        {STATUS_LABEL[b.status] || b.status}
                      </span>
                    </div>
                    <p className="text-sm font-semibold">{b.serviceName}</p>
                    <p className="text-xs" style={{ color: 'var(--bk-text-2)' }}>
                      {format(new Date(b.date + 'T00:00:00'), 'EEEE, d MMM yyyy', { locale: idLocale })} · {b.time}
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

function BookShell({ accent = '#C9A84C', tenantName, tenantLogo, bp = {}, sticky, children, onOpenLookup }) {
  const showLogo = bp.showLogo !== false
  const isLight  = bp.mode === 'light'

  // Tokens swap based on mode. Both palettes share the same accent so the
  // brand identity stays consistent regardless of theme. Designed so that
  // sub-components reading `var(--bk-*)` need ZERO awareness of the mode.
  const tokens = isLight ? {
    '--bk-bg':            '#FAFAFA',
    '--bk-bg-translucent':'rgba(250,250,250,0.92)',
    '--bk-surface':       '#FFFFFF',
    '--bk-surface-2':     '#F4F4F4',
    '--bk-border':        '#E5E5E5',
    '--bk-border-strong': '#CFCFCF',
    '--bk-text':          '#111111',
    '--bk-text-2':        '#555555',
    '--bk-text-muted':    '#888888',
  } : {
    '--bk-bg':            '#111111',
    '--bk-bg-translucent':'rgba(17,17,17,0.92)',
    '--bk-surface':       '#1A1A1A',
    '--bk-surface-2':     '#202020',
    '--bk-border':        '#252525',
    '--bk-border-strong': '#3A3A3A',
    '--bk-text':          '#F0F0F0',
    '--bk-text-2':        '#888888',
    '--bk-text-muted':    '#555555',
  }

  return (
    <div
      className="book-root min-h-screen w-full"
      style={{
        '--bk-accent':       accent,
        '--bk-accent-soft':  `${accent}1A`,
        '--bk-accent-glow':  `${accent}55`,
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
          color: #111111;
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 0.01em;
          border-radius: 14px;
          min-height: 52px;
          padding: 0 22px;
          box-shadow: 0 12px 28px -10px var(--bk-accent-glow);
          transition: filter .15s ease, transform .12s ease;
        }
        .book-root .bk-cta:hover { filter: brightness(1.08); }
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
              {tenantName || 'Barbershop'}
            </p>
            <p className="text-[10px] uppercase tracking-[0.2em] mt-1" style={{ color: 'var(--bk-text-muted)' }}>
              Booking Online
            </p>
          </div>
          {onOpenLookup && (
            <button
              onClick={onOpenLookup}
              className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full"
              style={{
                color: accent,
                border: `1px solid ${accent}55`,
                background: 'var(--bk-accent-soft)',
              }}
              aria-label="Cek booking saya"
            >
              Cek Booking
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
          Powered by <span style={{ color: accent, fontWeight: 600 }}>SembaPos</span>
        </p>
      </footer>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP INDICATOR — 4 dots dengan garis penghubung
// ═══════════════════════════════════════════════════════════════════════════

function StepIndicator({ current, accent }) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => {
        const isDone = i < current
        const isActive = i === current
        return (
          <React.Fragment key={s.key}>
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-all"
                style={{
                  background: isDone || isActive ? accent : 'transparent',
                  color: isDone || isActive ? '#111' : 'var(--bk-text-muted)',
                  border: `1.5px solid ${isDone || isActive ? accent : 'var(--bk-border-strong)'}`,
                  boxShadow: isActive ? `0 0 0 4px ${accent}1F` : 'none',
                }}
              >
                {isDone ? <Check className="w-4 h-4" strokeWidth={3} /> : i + 1}
              </div>
              <p className="text-[9.5px] uppercase tracking-wider font-semibold whitespace-nowrap leading-none"
                style={{ color: isDone || isActive ? 'var(--bk-text)' : 'var(--bk-text-muted)' }}>
                {s.label}
              </p>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex-1 h-px relative top-[-12px] mx-1"
                style={{ background: i < current ? accent : 'var(--bk-border)' }} />
            )}
          </React.Fragment>
        )
      })}
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

function Step1Pick({ tenantName, tenantLogo, bp, branches, services, barbers, selected, accent,
                    onPickBranch, onPickService, onPickBarber, onNext, canNext }) {
  return (
    <div className="space-y-7 lg:space-y-10">
      {/* Header banner — full width on both mobile & desktop */}
      <ShopHeader bp={bp} tenantName={tenantName} tenantLogo={tenantLogo} branch={selected.branch} accent={accent} />

      {/* Two-column layout on desktop: selection (2/3) + summary (1/3) */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-8">
        <div className="lg:col-span-2 space-y-7">
          {/* Branch selector — only when multi-branch */}
          {branches.length > 1 && (
            <BranchSelector branches={branches} selected={selected.branch} onPick={onPickBranch} accent={accent} />
          )}

          {/* Barber picker */}
          <div>
            <SectionTitle accent={accent} step="01" title="Pilih Barber" />
            <BarberCarousel barbers={barbers} selected={selected.barber} onPick={onPickBarber} accent={accent} />
          </div>

          {/* Service list */}
          <div>
            <SectionTitle accent={accent} step="02" title="Pilih Layanan" />
            <ServiceList services={services} selected={selected.service} onPick={onPickService} accent={accent} />
          </div>
        </div>

        {/* Sticky summary — desktop only */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <SidebarSummary
              accent={accent}
              selected={selected}
              tenantName={tenantName}
              ctaLabel="Lanjut Pilih Jadwal"
              ctaDisabled={!canNext}
              onCta={onNext}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}

// Sidebar summary card — appears as right rail on desktop, replaces the
// bottom-fixed StickyCta. Always shows what's been picked + the next-step CTA.
function SidebarSummary({ accent, selected, tenantName, ctaLabel, ctaDisabled, onCta }) {
  const totalPrice = selected.service?.price || 0
  return (
    <div className="bk-card p-5 space-y-4">
      <div>
        <p className="bk-label">Ringkasan</p>
        <p className="font-display text-base font-bold mt-1 truncate" style={{ color: 'var(--bk-text)' }}>{tenantName}</p>
      </div>

      <div className="space-y-2.5 text-sm">
        <SidebarRow label="Cabang"  value={selected.branch?.name} />
        <SidebarRow label="Barber"  value={selected.barber ? selected.barber.name : (selected.service ? 'Barber tersedia' : null)} muted={!selected.barber && !selected.service} />
        <SidebarRow label="Layanan" value={selected.service?.name} highlight={!!selected.service} accent={accent} />
        {selected.date && (
          <SidebarRow label="Jadwal" value={`${format(selected.date, 'd MMM', { locale: idLocale })} · ${selected.time || ''}`} />
        )}
      </div>

      {totalPrice > 0 && (
        <div className="rounded-xl p-3.5 flex items-center justify-between" style={{ background: accent, color: '#111' }}>
          <span className="text-[10px] uppercase tracking-[0.22em] font-bold opacity-70">Total</span>
          <span className="font-display text-xl font-bold">{formatRupiah(totalPrice)}</span>
        </div>
      )}

      <button onClick={onCta} disabled={ctaDisabled} className="bk-cta w-full inline-flex items-center justify-center gap-2">
        {ctaLabel}
        <ChevronRight className="w-4 h-4" />
      </button>
      {ctaDisabled && (
        <p className="text-[11px] text-center" style={{ color: 'var(--bk-text-muted)' }}>
          Pilih layanan untuk lanjut
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

function ShopHeader({ bp, tenantName, tenantLogo, branch, accent }) {
  const heroImage = bp.heroImage
  const showLogo  = bp.showLogo !== false
  const tagline   = bp.tagline
  return (
    <div className="relative overflow-hidden rounded-3xl" style={{ border: '1px solid var(--bk-border)' }}>
      {/* Background image / fallback */}
      {heroImage ? (
        <div
          className="absolute inset-0"
          style={{ backgroundImage: `url(${heroImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 30% 20%, ${accent}33 0%, transparent 55%), var(--bk-surface)` }} />
      )}
      {/* Dark overlay only when a hero image exists — keeps the white hero
          title legible on top of arbitrary user-uploaded photos. Without an
          image the fallback gradient already provides contrast for the title
          rendered in `var(--bk-text)`. */}
      {heroImage && (
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(17,17,17,0.55) 0%, rgba(17,17,17,0.85) 100%)' }} />
      )}

      <div className="relative px-5 pt-7 pb-5 lg:px-10 lg:pt-16 lg:pb-10 lg:min-h-[360px] lg:flex lg:flex-col lg:justify-end">
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
              {tagline || 'Premium Barbershop'}
            </p>
            <h1 className="font-display text-2xl lg:text-5xl font-bold tracking-tight leading-tight mt-1 lg:mt-2 drop-shadow-md"
              style={{ color: heroImage ? '#FFF' : 'var(--bk-text)' }}>
              {tenantName}
            </h1>
          </div>
        </div>

        {/* Badges row: address + hours. `onDark` flag drives badge styling so
            they're legible on the dark overlay (image case) and on the lighter
            radial fallback (no-image case). */}
        <div className="flex flex-wrap gap-1.5 lg:gap-2 mt-4 lg:mt-5">
          {branch?.address && (
            <Badge icon={MapPin} accent={accent} label={branch.address} onDark={!!heroImage} />
          )}
          {branch?.openTime && branch?.closeTime && (
            <Badge icon={Clock} accent={accent} label={`${branch.openTime} – ${branch.closeTime}`} onDark={!!heroImage} />
          )}
          <Badge icon={Star} accent={accent} label="Booking Online" filled onDark={!!heroImage} />
        </div>
      </div>
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

function BranchSelector({ branches, selected, onPick, accent }) {
  return (
    <div>
      <SectionTitle accent={accent} step="" title="Cabang" />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {branches.map(b => {
          const isSel = selected?.id === b.id
          return (
            <button key={b.id} onClick={() => onPick(b)}
              className="flex-shrink-0 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all"
              style={{
                background: isSel ? accent : 'var(--bk-surface)',
                color: isSel ? '#111' : 'var(--bk-text)',
                border: `1px solid ${isSel ? accent : 'var(--bk-border)'}`,
                minHeight: '44px',
              }}
            >
              {b.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function BarberCarousel({ barbers, selected, onPick, accent }) {
  return (
    <div className="flex gap-3 overflow-x-auto -mx-1 px-1 pb-2">
      {/* Anyone option */}
      <button onClick={() => onPick(null)}
        className="flex-shrink-0 flex flex-col items-center gap-2 w-[88px]"
      >
        <div className="relative w-[72px] h-[72px] rounded-full flex items-center justify-center transition-all"
          style={{
            background: 'var(--bk-surface)',
            border: `2px ${selected === null ? 'solid' : 'dashed'} ${selected === null ? accent : 'var(--bk-border-strong)'}`,
          }}>
          <Sparkles className="w-7 h-7" style={{ color: selected === null ? accent : 'var(--bk-text-2)' }} />
          {selected === null && (
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: accent, color: '#111' }}>
              <Check className="w-3 h-3" strokeWidth={3} />
            </div>
          )}
        </div>
        <p className="text-[11px] font-semibold leading-tight text-center"
          style={{ color: selected === null ? accent : 'var(--bk-text)' }}>
          Tersedia
        </p>
      </button>

      {barbers.map(barber => {
        const isSel = selected?.id === barber.id
        return (
          <button key={barber.id} onClick={() => onPick(barber)}
            className="flex-shrink-0 flex flex-col items-center gap-2 w-[88px]"
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
              {/* Online dot */}
              <div className="absolute bottom-0 right-1 w-3.5 h-3.5 rounded-full"
                style={{ background: '#22C55E', border: '2.5px solid var(--bk-bg)' }} />
              {isSel && (
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: accent, color: '#111', border: '2px solid var(--bk-bg)' }}>
                  <Check className="w-3 h-3" strokeWidth={3} />
                </div>
              )}
            </div>
            <p className="text-[11px] font-semibold leading-tight text-center truncate w-full"
              style={{ color: isSel ? accent : 'var(--bk-text)' }}>
              {barber.name}
            </p>
          </button>
        )
      })}
    </div>
  )
}

function ServiceList({ services, selected, onPick, accent }) {
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
    <p className="text-center py-12 text-sm" style={{ color: 'var(--bk-text-muted)' }}>Belum ada layanan tersedia</p>
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
                  color: isSel ? '#111' : 'var(--bk-text-2)',
                  border: `1px solid ${isSel ? accent : 'var(--bk-border)'}`,
                }}
              >
                {c === 'All' ? 'Semua' : c}
              </button>
            )
          })}
        </div>
      )}
      <div className="space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
      {filtered.map(svc => {
        const isSel = selected?.id === svc.id
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
                      <Clock className="w-3 h-3" />{svc.duration} mnt
                    </span>
                  )}
                  <span className="font-bold" style={{ color: accent }}>{formatRupiah(svc.price)}</span>
                </div>
              </div>
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  background: isSel ? accent : 'transparent',
                  border: `2px solid ${isSel ? accent : 'var(--bk-border-strong)'}`,
                }}>
                {isSel && <Check className="w-4 h-4" strokeWidth={3} style={{ color: '#111' }} />}
              </div>
            </div>
          </button>
        )
      })}
      </div>
    </div>
  )
}

function SectionTitle({ step, title, accent }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      {step && (
        <span className="text-[10px] uppercase tracking-[0.22em] font-bold px-2 py-1 rounded-md" style={{
          color: accent, background: 'var(--bk-accent-soft)',
        }}>{step}</span>
      )}
      <h2 className="font-display text-base font-bold tracking-tight" style={{ color: 'var(--bk-text)' }}>{title}</h2>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2 — Pilih Jadwal (calendar grid + slot grid)
// ═══════════════════════════════════════════════════════════════════════════

function Step2Schedule({ selected, timeSlots, bookedSlots, tenantTz, accent, shake,
                         onPickDate, onPickTime, onBack, onNext }) {
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
            aria-label="Bulan sebelumnya"
            className="w-10 h-10 rounded-xl flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ color: 'var(--bk-text-2)', background: 'var(--bk-surface-2)' }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <p className="font-display text-base font-bold capitalize">
            {format(viewMonth, 'MMMM yyyy', { locale: idLocale })}
          </p>
          <button
            onClick={goNext}
            aria-label="Bulan berikutnya"
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ color: 'var(--bk-text-2)', background: 'var(--bk-surface-2)' }}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-1 mb-1.5">
          {['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map(d => (
            <p key={d} className="text-[10px] uppercase tracking-wider font-bold text-center" style={{ color: 'var(--bk-text-muted)' }}>{d}</p>
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
            return (
              <button
                key={day.toISOString()}
                disabled={isPast}
                onClick={() => onPickDate(day)}
                aria-label={format(day, 'EEEE, d MMMM yyyy', { locale: idLocale })}
                aria-pressed={isSel}
                aria-current={isToday_ ? 'date' : undefined}
                className="aspect-square rounded-lg text-sm font-semibold relative flex items-center justify-center transition-all"
                style={{
                  background: isSel ? accent : 'transparent',
                  color: isSel ? '#111' :
                         isPast ? 'var(--bk-text-muted)' :
                         isCurrentMonth ? 'var(--bk-text)' : 'var(--bk-text-2)',
                  opacity: isPast ? 0.35 : 1,
                  cursor: isPast ? 'not-allowed' : 'pointer',
                  border: isToday_ && !isSel ? `1.5px solid ${accent}66` : '1.5px solid transparent',
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
      {selected.date ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle step="" title="Pilih Jam" accent={accent} />
          </div>
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-3">
            {timeSlots.map(time => {
              const past   = isSlotInPast(time, selected.date, tenantTz)
              const booked = bookedSlots.includes(time)
              const status = past ? 'past' : booked ? 'penuh' : 'tersedia'
              const isSel  = selected.time === time
              const isShaking = shake.key === time
              const styles = (() => {
                if (isSel) return { background: accent, color: '#111', border: `1.5px solid ${accent}`, boxShadow: `0 6px 18px -8px ${accent}80` }
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
                  aria-label={`Jam ${time}${status === 'penuh' ? ', penuh' : status === 'past' ? ', sudah lewat' : ''}`}
                  aria-pressed={isSel}
                  aria-disabled={status !== 'tersedia'}
                  title={status === 'penuh' ? 'Slot penuh' : status === 'past' ? 'Sudah lewat' : undefined}
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
              <span className="w-3 h-3 rounded-md" style={{ border: '1.5px solid var(--bk-border-strong)' }} /> Tersedia
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-md" style={{ background: accent }} /> Dipilih
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-md" style={{ background: 'var(--bk-surface-2)', border: '1px solid var(--bk-border)' }} /> Penuh / Lewat
            </span>
          </div>

          {allSlotsUnavailable && (
            <div className="mt-4 p-3 rounded-xl flex items-start gap-2 text-xs"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', color: '#FCD34D' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              Semua slot di tanggal ini tidak tersedia. Silakan pilih tanggal lain.
            </div>
          )}
        </div>
      ) : (
        <div className="hidden lg:flex items-center justify-center bk-card p-8 min-h-[300px] text-center"
          style={{ borderStyle: 'dashed' }}>
          <p className="text-sm" style={{ color: 'var(--bk-text-muted)' }}>
            Pilih tanggal di kalender untuk melihat slot waktu
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
          Lanjut Konfirmasi
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3 — Konfirmasi
// ═══════════════════════════════════════════════════════════════════════════

function Step3Confirm({ tenantName, selected, form, formError, setForm, accent, totalPrice,
                        error, submitting, onBack, onSubmit }) {
  return (
    <div className="lg:grid lg:grid-cols-5 lg:gap-8 space-y-6 lg:space-y-0">
      {/* Left: form + notes */}
      <div className="space-y-6 lg:col-span-3">
        <div>
          <SectionTitle step="03" title="Data Diri" accent={accent} />
          <div className="space-y-2.5">
            <Field label="Nama" icon={User} placeholder="Nama lengkap"
              value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} error={formError.name} />
            <Field label="WhatsApp / HP" icon={Phone} type="tel" placeholder="08xxxxxxxxxx"
              value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} error={formError.phone} />
          </div>
        </div>

        <div>
          <label className="bk-label block mb-1.5">Catatan (opsional)</label>
          <div className="relative">
            <MessageSquare className="absolute left-4 top-3.5 w-4 h-4" style={{ color: 'var(--bk-text-2)' }} />
            <textarea rows={3} placeholder="Mis. potong pendek di samping, rapi di atas…"
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="bk-input resize-none" />
          </div>
        </div>

        {/* Disclaimer — kept on left so the right total bar stays uncluttered */}
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--bk-text-muted)' }}>
          Dengan menekan "Konfirmasi Booking", kamu setuju dengan kebijakan pembatalan: pembatalan ≥1 jam sebelum jadwal tidak dikenakan biaya.
          Pembayaran dilakukan langsung di lokasi.
        </p>
      </div>

      {/* Right: summary + total + CTA — sticky on desktop */}
      <div className="lg:col-span-2">
        <div className="lg:sticky lg:top-24 space-y-5">
          <div>
            <SectionTitle step="" title="Ringkasan" accent={accent} />
            <div className="bk-card overflow-hidden">
              <SummaryRow label="Barbershop" value={tenantName} />
              <SummaryRow label="Cabang"     value={selected.branch?.name} />
              <SummaryRow label="Barber"     value={selected.barber?.name || 'Barber tersedia'} />
              <SummaryRow label="Layanan"    value={selected.service?.name} />
              <SummaryRow label="Tanggal"    value={format(selected.date, 'EEEE, d MMMM yyyy', { locale: idLocale })} />
              <SummaryRow label="Jam"        value={selected.time} />
              <SummaryRow label="Harga"      value={formatRupiah(totalPrice)} bold last />
            </div>
          </div>

          {/* Total bar */}
          <div className="rounded-2xl p-4 flex items-center justify-between"
            style={{ background: accent, color: '#111' }}>
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] font-bold opacity-70">Total Pembayaran</p>
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
      {/* Animated check */}
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 14 }}
          className="w-24 h-24 rounded-full mx-auto flex items-center justify-center relative"
          style={{ border: `1.5px solid ${accent}`, background: `${accent}10` }}
        >
          <motion.div
            initial={{ scale: 0, opacity: 0.7 }} animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 1.4, repeat: Infinity }}
            className="absolute inset-0 rounded-full" style={{ border: `1.5px solid ${accent}` }}
          />
          <motion.div
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.4 }}
          >
            <Check className="w-11 h-11" strokeWidth={2.5} style={{ color: accent }} />
          </motion.div>
        </motion.div>
        <h2 className="font-display text-2xl font-bold tracking-tight mt-5">Booking Berhasil</h2>
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
            <TicketRow label="Status"  value={STATUS_LABEL[booking.status] || booking.status} />
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
