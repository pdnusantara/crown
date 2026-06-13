import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Clock, Coffee, AlertCircle, Sun } from 'lucide-react'
import Card, { CardHeader, CardBody } from '../components/ui/Card.jsx'
import { useMySchedule } from '../hooks/useMySchedule.js'

// dayOfWeek: 0 = Minggu … 6 = Sabtu (sesuai tenantClock backend).
const DAY_FULL_KEYS = ['daySun', 'dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat']
const DAY_SHORT_KEYS = ['dayShortSun', 'dayShortMon', 'dayShortTue', 'dayShortWed', 'dayShortThu', 'dayShortFri', 'dayShortSat']

// "2026-06-02" → "Sen, 2 Jun" (ymd sudah tanggal lokal tenant → render sebagai UTC).
function fmtDate(ymd, locale = 'id-ID') {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
      .format(new Date(`${ymd}T00:00:00.000Z`))
  } catch { return ymd }
}

// Label sumber jadwal barber (mis. "barberSchedule:Pagi" → "Shift Pagi").
function shiftLabel(source, t) {
  if (typeof source === 'string' && source.startsWith('barberSchedule:')) {
    return t('mySchedule.shiftLabel', { name: source.split(':')[1] })
  }
  return null
}

function UpcomingRow({ row, isToday }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'en' ? 'en-US' : 'id-ID'
  const shift = shiftLabel(row.source, t)
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${isToday ? 'border-brand/40 bg-brand/5' : 'border-dark-border bg-dark-card'}`}>
      <div className="w-14 flex-shrink-0 text-center">
        <p className="text-[11px] text-muted">{t(`mySchedule.${DAY_SHORT_KEYS[row.dayOfWeek]}`)}</p>
        <p className="text-lg font-bold text-off-white leading-tight">{row.ymd.slice(8)}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-off-white">
          {fmtDate(row.ymd, locale)}{isToday && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand text-dark align-middle">{t('mySchedule.today')}</span>}
        </p>
        {row.isDayOff ? (
          <p className="text-xs text-amber-400 flex items-center gap-1 mt-0.5"><Coffee size={12} />{t('mySchedule.dayOff')}</p>
        ) : (
          <p className="text-xs text-muted flex items-center gap-1.5 mt-0.5">
            <Clock size={12} />{row.startTime}–{row.endTime}
            {shift && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-fresh/15 text-fresh">{shift}</span>}
          </p>
        )}
      </div>
    </div>
  )
}

export default function MySchedulePage() {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useMySchedule()
  const upcoming = data?.upcoming || []
  const weekly = data?.weekly || []
  const today = data?.today

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white flex items-center gap-2">
          <CalendarDays size={22} className="text-brand" /> {t('mySchedule.title')}
        </h1>
        <p className="text-muted text-xs sm:text-sm mt-0.5">{t('mySchedule.subtitle')}</p>
      </div>

      {isError ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted">
          <AlertCircle size={28} />
          <p className="text-sm">{t('mySchedule.loadFailed')}</p>
        </div>
      ) : (
        <>
          {/* 7 hari ke depan */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardHeader><h3 className="font-semibold text-off-white">{t('mySchedule.next7Days')}</h3></CardHeader>
              <CardBody>
                {isLoading ? (
                  <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="h-[60px] rounded-xl bg-dark-card animate-pulse" />)}</div>
                ) : (
                  <div className="space-y-2">
                    {upcoming.map(row => <UpcomingRow key={row.ymd} row={row} isToday={row.ymd === today} />)}
                  </div>
                )}
              </CardBody>
            </Card>
          </motion.div>

          {/* Pola mingguan */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
            <Card>
              <CardHeader>
                <h3 className="font-semibold text-off-white flex items-center gap-2"><Sun size={15} className="text-amber-400" />{t('mySchedule.weeklyPattern')}</h3>
                <p className="text-xs text-muted mt-0.5">{t('mySchedule.weeklyPatternHint')}</p>
              </CardHeader>
              <CardBody>
                {isLoading ? (
                  <div className="h-40 rounded-xl bg-dark-card animate-pulse" />
                ) : (
                  <div className="divide-y divide-dark-border">
                    {[1, 2, 3, 4, 5, 6, 0].map(dow => {
                      const d = weekly.find(w => w.dayOfWeek === dow)
                      if (!d) return null
                      return (
                        <div key={dow} className="flex items-center justify-between py-2.5">
                          <span className="text-sm font-medium text-off-white">{t(`mySchedule.${DAY_FULL_KEYS[dow]}`)}</span>
                          {d.isDayOff ? (
                            <span className="text-xs text-amber-400 flex items-center gap-1"><Coffee size={12} />{t('mySchedule.dayOff')}</span>
                          ) : (
                            <span className="text-sm text-muted tabular-nums">{d.startTime}–{d.endTime}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardBody>
            </Card>
          </motion.div>
        </>
      )}
    </div>
  )
}
