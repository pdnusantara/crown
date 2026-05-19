import React, { useState, useRef } from 'react'
import { MapPin, Clock, CheckCircle2, LogIn, LogOut, AlertTriangle, CalendarDays, Loader2, History, Navigation, Camera } from 'lucide-react'
import { useMyAttendanceToday, useMyAttendanceHistory, useCheckIn, useCheckOut } from '../hooks/useAttendance.js'
import { useToast } from '../components/ui/Toast.jsx'
import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx'
import Badge from '../components/ui/Badge.jsx'
import { DAY_NAMES, statusMeta, fmtDuration, fmtTime, fmtDateLong } from '../utils/attendance.js'

// Ambil posisi GPS perangkat — promise yang reject dengan pesan ramah.
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error('Perangkat ini tidak mendukung GPS.'))
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => reject(new Error(
        err.code === 1 ? 'Izin lokasi ditolak. Aktifkan GPS lalu izinkan akses lokasi di browser.'
        : err.code === 3 ? 'Permintaan lokasi melebihi waktu. Coba lagi di area dengan sinyal lebih baik.'
        : 'Gagal membaca lokasi GPS. Pastikan GPS aktif.'
      )),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}

export default function StaffAttendancePage() {
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
      const geo = await getPosition()
      const mut = mode === 'in' ? checkIn : checkOut
      await mut.mutateAsync({ ...geo, photo })
      toast.success(mode === 'in' ? 'Check-in berhasil. Selamat bekerja!' : 'Check-out berhasil. Terima kasih!')
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Terjadi kesalahan.'
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
              <h2 className="text-lg font-semibold text-off-white mb-1">Absensi belum aktif</h2>
              <p className="text-sm text-muted">Fitur Absensi Digital tidak tersedia pada paket toko Anda saat ini.</p>
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
          <h1 className="text-xl font-display font-bold text-off-white">Absensi Digital</h1>
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
                <p className="text-off-white font-semibold">Belum check-in</p>
                <p className="text-sm text-muted mt-0.5">Tekan tombol di bawah untuk mulai absen.</p>
              </>
            )}
            {phase === 'working' && (
              <>
                <p className="text-off-white font-semibold">Sedang bekerja</p>
                <p className="text-sm text-muted mt-0.5">
                  Check-in {fmtTime(attendance.checkInAt)}
                  {attendance.status === 'late' && (
                    <span className="text-amber-400"> · terlambat {attendance.lateMinutes}m</span>
                  )}
                </p>
              </>
            )}
            {phase === 'done' && (
              <>
                <p className="text-off-white font-semibold">Absen hari ini selesai</p>
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
                    ? <><Loader2 className="w-5 h-5 animate-spin" /> Memproses…</>
                    : phase === 'idle'
                      ? <>{requireSelfie ? <Camera className="w-5 h-5" /> : <LogIn className="w-5 h-5" />} Check In Sekarang</>
                      : <>{requireSelfie ? <Camera className="w-5 h-5" /> : <LogOut className="w-5 h-5" />} Check Out Sekarang</>}
                </button>
                {requireSelfie && (
                  <p className="mt-2 text-xs text-muted flex items-center justify-center gap-1">
                    <Camera className="w-3.5 h-3.5" /> Anda akan diminta mengambil foto selfie.
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
                <p className="text-muted text-xs">Jadwal kerja {dayName}</p>
                <p className="text-off-white font-medium">
                  {schedule?.isDayOff
                    ? 'Hari libur'
                    : `${schedule?.startTime || '—'} – ${schedule?.endTime || '—'}`}
                  {config?.lateToleranceMin > 0 && !schedule?.isDayOff && (
                    <span className="text-muted font-normal"> · toleransi {config.lateToleranceMin}m</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 border-t border-dark-border pt-3">
              <MapPin className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-muted text-xs">Lokasi absensi</p>
                {branch ? (
                  <p className="text-off-white font-medium">
                    {branch.name}
                    {branchConfigured
                      ? <span className="text-muted font-normal"> · radius {branch.attendanceRadius} m</span>
                      : <span className="text-amber-400 font-normal"> · koordinat belum diatur</span>}
                  </p>
                ) : (
                  <p className="text-amber-400 font-medium">Anda belum ditugaskan ke cabang.</p>
                )}
              </div>
            </div>
            {attendance?.checkInDistance != null && (
              <div className="flex items-start gap-3 border-t border-dark-border pt-3">
                <Navigation className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-muted text-xs">Jarak saat check-in</p>
                  <p className="text-off-white font-medium">{attendance.checkInDistance} m dari cabang</p>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        {!branchConfigured && (
          <p className="flex items-center gap-2 text-xs text-amber-400 px-1">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            Absensi belum bisa digunakan sampai admin mengatur koordinat cabang.
          </p>
        )}

        {/* Riwayat */}
        {history.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-off-white">
                <History className="w-4 h-4 text-gold" /> Riwayat Absensi
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
