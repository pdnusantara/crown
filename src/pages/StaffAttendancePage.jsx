import React, { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, Clock, CheckCircle2, LogIn, LogOut, AlertTriangle, CalendarDays, Loader2, History, Navigation, Camera } from 'lucide-react'
import { useMyAttendanceToday, useMyAttendanceHistory, useCheckIn, useCheckOut } from '../hooks/useAttendance.js'
import { useToast } from '../components/ui/Toast.jsx'
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx'
import Badge from '../components/ui/Badge.jsx'
import { DAY_NAMES, statusMeta, fmtDuration, fmtTime, fmtDateLong } from '../utils/attendance.js'

// Ambil posisi GPS perangkat — promise yang reject dengan pesan ramah.
function getPosition(t) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error(t('staffAttendance.gpsUnsupported')))
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => reject(new Error(
        err.code === 1 ? t('staffAttendance.gpsDenied')
        : err.code === 3 ? t('staffAttendance.gpsTimeout')
        : t('staffAttendance.gpsFailed')
      )),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}

export default function StaffAttendancePage() {
  const { t } = useTranslation()
  const toast = useToast()
  const { data, isLoading, error } = useMyAttendanceToday()
  const { data: history = [] } = useMyAttendanceHistory()
  const checkIn = useCheckIn()
  const checkOut = useCheckOut()
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const pendingMode = useRef(null)

  const featureDisabled = error?.response?.status === 403
  const requireSelfie = !!data?.config?.requireSelfie

  // Jalankan absen: baca GPS lalu kirim (dengan foto bila ada).
  const runAct = async (mode, photo) => {
    setBusy(true)
    try {
      const geo = await getPosition(t)
      const mut = mode === 'in' ? checkIn : checkOut
      await mut.mutateAsync({ ...geo, photo })
      toast.success(mode === 'in' ? t('staffAttendance.checkInSuccess') : t('staffAttendance.checkOutSuccess'))
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || t('staffAttendance.genericError')
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  // Tombol absen — bila wajib selfie, buka kamera dulu; selain itu langsung GPS.
  const act = (mode) => {
    if (requireSelfie) {
      pendingMode.current = mode
      fileRef.current?.click()
    } else {
      runAct(mode, null)
    }
  }

  const onPhotoPicked = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const mode = pendingMode.current
    pendingMode.current = null
    if (file && mode) runAct(mode, file)
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-10">
        <Loader2 className="w-7 h-7 text-gold animate-spin" />
      </div>
    )
  }

  if (featureDisabled) {
    return (
      <div className="flex-1 p-6">
        <div className="max-w-md mx-auto">
          <Card>
            <CardBody className="text-center py-10">
              <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
              <h2 className="text-lg font-semibold text-off-white mb-1">{t('staffAttendance.disabledTitle')}</h2>
              <p className="text-sm text-muted">{t('staffAttendance.disabledDesc')}</p>
            </CardBody>
          </Card>
        </div>
      </div>
    )
  }

  const { today, config, branch, branchConfigured, schedule, attendance } = data || {}
  const checkedIn = !!attendance?.checkInAt
  const checkedOut = !!attendance?.checkOutAt
  const dayName = schedule ? DAY_NAMES[new Date(`${today}T00:00:00Z`).getUTCDay()] : ''

  // Status besar di tengah kartu utama.
  let phase = 'idle'      // belum check-in
  if (checkedIn && !checkedOut) phase = 'working'
  if (checkedOut) phase = 'done'

  return (
    <div className="flex-1 p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-xl font-display font-bold text-off-white">{t('staffAttendance.title')}</h1>
          <p className="text-sm text-muted mt-0.5 capitalize">{fmtDateLong(today)}</p>
        </div>

        {/* Kartu status utama */}
        <Card gold>
          <CardBody className="text-center py-7">
            <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 ${
              phase === 'done' ? 'bg-green-500/15' : phase === 'working' ? 'bg-gold/15' : 'bg-dark-surface'
            }`}>
              {phase === 'done'
                ? <CheckCircle2 className="w-10 h-10 text-green-400" />
                : phase === 'working'
                  ? <Clock className="w-10 h-10 text-gold" />
                  : <LogIn className="w-10 h-10 text-muted" />}
            </div>

            {phase === 'idle' && (
              <>
                <p className="text-off-white font-semibold">{t('staffAttendance.idleTitle')}</p>
                <p className="text-sm text-muted mt-0.5">{t('staffAttendance.idleDesc')}</p>
              </>
            )}
            {phase === 'working' && (
              <>
                <p className="text-off-white font-semibold">{t('staffAttendance.workingTitle')}</p>
                <p className="text-sm text-muted mt-0.5">
                  {t('staffAttendance.checkInAt', { time: fmtTime(attendance.checkInAt) })}
                  {attendance.status === 'late' && (
                    <span className="text-amber-400">{t('staffAttendance.lateSuffix', { minutes: attendance.lateMinutes })}</span>
                  )}
                </p>
              </>
            )}
            {phase === 'done' && (
              <>
                <p className="text-off-white font-semibold">{t('staffAttendance.doneTitle')}</p>
                <p className="text-sm text-muted mt-0.5">
                  {fmtTime(attendance.checkInAt)} – {fmtTime(attendance.checkOutAt)} · {fmtDuration(attendance.workedMinutes)}
                </p>
              </>
            )}

            {attendance && (
              <div className="mt-3">
                <Badge variant={statusMeta(attendance.status).variant} dot>
                  {statusMeta(attendance.status).label}
                </Badge>
              </div>
            )}

            {/* Tombol aksi */}
            {phase !== 'done' && (
              <>
                <input
                  ref={fileRef} type="file" accept="image/*" capture="user"
                  onChange={onPhotoPicked} className="hidden"
                />
                <button
                  onClick={() => act(phase === 'idle' ? 'in' : 'out')}
                  disabled={busy || !branchConfigured}
                  className={`mt-6 w-full py-4 rounded-2xl font-semibold text-base inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    phase === 'idle'
                      ? 'bg-gold text-dark hover:bg-gold-light shadow-gold'
                      : 'bg-red-600 text-white hover:bg-red-500'
                  }`}
                >
                  {busy
                    ? <><Loader2 className="w-5 h-5 animate-spin" /> {t('staffAttendance.processing')}</>
                    : phase === 'idle'
                      ? <>{requireSelfie ? <Camera className="w-5 h-5" /> : <LogIn className="w-5 h-5" />} {t('staffAttendance.checkInNow')}</>
                      : <>{requireSelfie ? <Camera className="w-5 h-5" /> : <LogOut className="w-5 h-5" />} {t('staffAttendance.checkOutNow')}</>}
                </button>
                {requireSelfie && (
                  <p className="mt-2 text-xs text-muted flex items-center justify-center gap-1">
                    <Camera className="w-3.5 h-3.5" /> {t('staffAttendance.selfieNotice')}
                  </p>
                )}
              </>
            )}
          </CardBody>
        </Card>

        {/* Jadwal & geofence */}
        <Card>
          <CardBody className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <CalendarDays className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-muted text-xs">{t('staffAttendance.workScheduleFor', { day: dayName })}</p>
                <p className="text-off-white font-medium">
                  {schedule?.isDayOff
                    ? t('staffAttendance.dayOff')
                    : `${schedule?.startTime || '—'} – ${schedule?.endTime || '—'}`}
                  {config?.lateToleranceMin > 0 && !schedule?.isDayOff && (
                    <span className="text-muted font-normal"> {t('staffAttendance.tolerance', { minutes: config.lateToleranceMin })}</span>
                  )}
                </p>
                {schedule?.source && !schedule.isDayOff && (
                  <p className="text-[11px] text-muted mt-0.5">
                    {schedule.source.startsWith('barberSchedule')
                      ? <>{t('staffAttendance.shiftPrefix')} <span className="text-gold">{schedule.source.split(':')[1] || t('staffAttendance.shiftCustom')}</span> {t('staffAttendance.shiftDailyPlan')}</>
                      : schedule.source === 'workSchedule'
                        ? t('staffAttendance.weeklyPattern')
                        : t('staffAttendance.systemDefault')}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-start gap-3 border-t border-dark-border pt-3">
              <MapPin className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-muted text-xs">{t('staffAttendance.attendanceLocation')}</p>
                {branch ? (
                  <p className="text-off-white font-medium">
                    {branch.name}
                    {branchConfigured
                      ? <span className="text-muted font-normal"> {t('staffAttendance.radius', { meters: branch.attendanceRadius })}</span>
                      : <span className="text-amber-400 font-normal"> {t('staffAttendance.coordsNotSet')}</span>}
                  </p>
                ) : (
                  <p className="text-amber-400 font-medium">{t('staffAttendance.noBranchAssigned')}</p>
                )}
              </div>
            </div>
            {attendance?.checkInDistance != null && (
              <div className="flex items-start gap-3 border-t border-dark-border pt-3">
                <Navigation className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-muted text-xs">{t('staffAttendance.checkInDistance')}</p>
                  <p className="text-off-white font-medium">{t('staffAttendance.distanceFromBranch', { meters: attendance.checkInDistance })}</p>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {!branchConfigured && (
          <p className="flex items-center gap-2 text-xs text-amber-400 px-1">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {t('staffAttendance.branchNotConfiguredWarn')}
          </p>
        )}

        {/* Riwayat */}
        {history.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-off-white">
                <History className="w-4 h-4 text-gold" /> {t('staffAttendance.historyTitle')}
              </h2>
            </CardHeader>
            <CardBody className="p-0">
              <ul className="divide-y divide-dark-border">
                {history.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-off-white truncate">{fmtDateLong(r.date)}</p>
                      <p className="text-xs text-muted">
                        {r.checkInAt ? fmtTime(r.checkInAt) : '—'} – {r.checkOutAt ? fmtTime(r.checkOutAt) : '—'}
                        {r.workedMinutes != null && ` · ${fmtDuration(r.workedMinutes)}`}
                      </p>
                    </div>
                    <Badge variant={statusMeta(r.status).variant}>{statusMeta(r.status).label}</Badge>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  )
}
