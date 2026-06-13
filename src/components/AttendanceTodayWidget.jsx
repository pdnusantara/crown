import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Fingerprint, ArrowRight } from 'lucide-react'
import { useAttendanceTodaySummary } from '../hooks/useAttendance.js'
import Card from './ui/Card.jsx'
import Badge from './ui/Badge.jsx'
import { statusMeta, fmtTime } from '../utils/attendance.js'

// Widget ringkas kehadiran staf hari ini untuk dashboard tenant admin.
// Hanya dirender saat fitur `attendance` aktif (dijaga pemanggil).
export default function AttendanceTodayWidget() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { data, isLoading } = useAttendanceTodaySummary()

  if (isLoading || !data) {
    return <Card className="p-4 h-32 animate-pulse" />
  }

  const c = data.counts || {}
  const tiles = [
    { label: t('attendanceWidget.present'),  value: c.present || 0, cls: 'text-green-400' },
    { label: t('attendanceWidget.late'),     value: c.late || 0,    cls: 'text-amber-400' },
    { label: t('attendanceWidget.notYet'),   value: c.pending || 0, cls: 'text-red-400' },
    { label: t('attendanceWidget.leaveAbsent'), value: (c.leave || 0) + (c.absent || 0), cls: 'text-blue-400' },
  ]
  // Staf yang perlu perhatian: belum absen / terlambat — tampilkan maksimal 6.
  const attention = (data.staff || [])
    .filter((s) => s.status === 'pending' || s.status === 'late')
    .slice(0, 6)

  return (
    <Card className="p-4 sm:p-5">
      <button
        type="button"
        onClick={() => navigate('/admin/attendance')}
        className="w-full flex items-center justify-between group mb-3"
      >
        <h3 className="flex items-center gap-2 font-semibold text-off-white">
          <Fingerprint className="w-4 h-4 text-brand" /> {t('attendanceWidget.title')}
        </h3>
        <span className="flex items-center gap-1 text-xs text-muted group-hover:text-brand transition-colors">
          {t('attendanceWidget.detail')} <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </button>

      <div className="grid grid-cols-4 gap-2 mb-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl bg-dark-surface border border-dark-border py-2 text-center">
            <p className={`text-lg font-bold ${tile.cls}`}>{tile.value}</p>
            <p className="text-[10px] text-muted leading-tight">{tile.label}</p>
          </div>
        ))}
      </div>

      {attention.length === 0 ? (
        <p className="text-xs text-muted text-center py-2">
          {data.totalStaff === 0 ? t('attendanceWidget.noStaff') : t('attendanceWidget.allCheckedIn')}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {attention.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-off-white truncate">{s.name}
                <span className="text-muted text-xs capitalize"> · {s.role}</span>
              </span>
              {s.status === 'late'
                ? <Badge variant="warning">{t('attendanceWidget.lateBadge', { minutes: s.lateMinutes, time: fmtTime(s.checkInAt) })}</Badge>
                : <Badge variant={statusMeta(s.status).variant}>{t('attendanceWidget.notYet')}</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
