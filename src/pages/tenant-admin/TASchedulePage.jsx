import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, CalendarDays, Trash2 } from 'lucide-react'
import { startOfWeek, addDays, format, addWeeks, subWeeks, isSameWeek } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { useAuthStore } from '../../store/authStore.js'
import { useTenantStore } from '../../store/tenantStore.js'
import { useScheduleStore } from '../../store/scheduleStore.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'

const SHIFT_TYPES = [
  { value: 'Pagi', labelKey: 'tenantAdmin.schedule.shiftMorningLabel', startTime: '08:00', endTime: '14:00', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { value: 'Sore', labelKey: 'tenantAdmin.schedule.shiftAfternoonLabel', startTime: '14:00', endTime: '22:00', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  { value: 'Full', labelKey: 'tenantAdmin.schedule.shiftFullLabel', startTime: '08:00', endTime: '22:00', color: 'bg-gold/20 text-gold border-gold/30' },
]

const BARBER_COLORS = [
  'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  'bg-pink-500/20 text-pink-300 border-pink-500/30',
  'bg-green-500/20 text-green-300 border-green-500/30',
  'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  'bg-teal-500/20 text-teal-300 border-teal-500/30',
]

const TIME_SLOTS = Array.from({ length: 8 }, (_, i) => {
  const h = 8 + i * 2
  return `${String(h).padStart(2, '0')}:00`
})

export default function TASchedulePage() {
  const { t } = useTranslation()
  const DAY_NAMES = [
    t('tenantAdmin.schedule.dayMon'),
    t('tenantAdmin.schedule.dayTue'),
    t('tenantAdmin.schedule.dayWed'),
    t('tenantAdmin.schedule.dayThu'),
    t('tenantAdmin.schedule.dayFri'),
    t('tenantAdmin.schedule.daySat'),
    t('tenantAdmin.schedule.daySun'),
  ]
  const { user } = useAuthStore()
  const { getStaffByTenant } = useTenantStore()
  const { addSchedule, updateSchedule, deleteSchedule, getSchedulesByWeek } = useScheduleStore()
  const toast = useToast()

  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [showModal, setShowModal] = useState(false)
  const [selectedCell, setSelectedCell] = useState(null) // { date, slot }
  const [selectedSchedule, setSelectedSchedule] = useState(null)
  const [form, setForm] = useState({ staffId: '', shift: 'Pagi' })

  const staff = getStaffByTenant(user.tenantId).filter(s => s.role === 'barber')
  const weekSchedules = getSchedulesByWeek(user.tenantId, currentWeek)

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i))

  const getBarberColor = (staffId) => {
    const idx = staff.findIndex(s => s.id === staffId)
    return BARBER_COLORS[idx % BARBER_COLORS.length] || BARBER_COLORS[0]
  }

  const getScheduleForCell = (date, slot) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return weekSchedules.filter(s => {
      if (s.date !== dateStr) return false
      const slotH = parseInt(slot.split(':')[0])
      const startH = parseInt(s.startTime?.split(':')[0] || 0)
      const endH = parseInt(s.endTime?.split(':')[0] || 23)
      return slotH >= startH && slotH < endH
    })
  }

  const handleCellClick = (date, slot) => {
    setSelectedCell({ date, slot })
    setSelectedSchedule(null)
    setForm({ staffId: staff[0]?.id || '', shift: 'Pagi' })
    setShowModal(true)
  }

  const handleScheduleClick = (e, schedule) => {
    e.stopPropagation()
    setSelectedSchedule(schedule)
    setSelectedCell(null)
    setShowModal(true)
  }

  const handleSave = () => {
    if (!form.staffId) return toast.error(t('tenantAdmin.schedule.selectBarber'))
    const shiftConfig = SHIFT_TYPES.find(s => s.value === form.shift)
    addSchedule({
      staffId: form.staffId,
      tenantId: user.tenantId,
      branchId: user.branchId,
      date: format(selectedCell.date, 'yyyy-MM-dd'),
      shift: form.shift,
      startTime: shiftConfig.startTime,
      endTime: shiftConfig.endTime,
    })
    toast.success(t('tenantAdmin.schedule.scheduleAdded'))
    setShowModal(false)
  }

  const handleDelete = () => {
    deleteSchedule(selectedSchedule.id)
    toast.success(t('tenantAdmin.schedule.scheduleDeleted'))
    setShowModal(false)
  }

  // Summary: total hours per barber
  const barberHours = staff.map(s => {
    const sch = weekSchedules.filter(w => w.staffId === s.id)
    const total = sch.reduce((acc, w) => {
      const start = parseInt(w.startTime?.split(':')[0] || 8)
      const end = parseInt(w.endTime?.split(':')[0] || 22)
      return acc + (end - start)
    }, 0)
    return { ...s, weekHours: total }
  }).filter(s => s.weekHours > 0)

  const weekLabel = `${format(currentWeek, 'd MMM', { locale: idLocale })} – ${format(addDays(currentWeek, 6), 'd MMM yyyy', { locale: idLocale })}`

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-off-white">{t('tenantAdmin.schedule.title')}</h1>
          <p className="text-muted text-sm mt-1">{t('tenantAdmin.schedule.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentWeek(w => subWeeks(w, 1))} className="p-2 rounded-xl border border-dark-border text-muted hover:text-off-white hover:border-gold/30 transition-all">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-off-white font-medium px-3 py-2 bg-dark-card border border-dark-border rounded-xl">{weekLabel}</span>
          <button onClick={() => setCurrentWeek(w => addWeeks(w, 1))} className="p-2 rounded-xl border border-dark-border text-muted hover:text-off-white hover:border-gold/30 transition-all">
            <ChevronRight size={18} />
          </button>
          <Button variant="secondary" onClick={() => setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            {t('tenantAdmin.schedule.thisWeek')}
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {staff.map((s, i) => (
          <div key={s.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${BARBER_COLORS[i % BARBER_COLORS.length]}`}>
            <div className="w-2 h-2 rounded-full bg-current" />
            {s.name}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="bg-dark-surface border border-dark-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: '700px' }}>
            {/* Header */}
            <div className="grid border-b border-dark-border" style={{ gridTemplateColumns: '80px repeat(7, 1fr)' }}>
              <div className="p-3 text-xs text-muted" />
              {weekDays.map((day, i) => {
                const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                return (
                  <div key={i} className={`p-3 text-center text-xs font-medium border-l border-dark-border ${isToday ? 'text-gold' : 'text-muted'}`}>
                    <div>{DAY_NAMES[i]}</div>
                    <div className={`text-base font-bold mt-0.5 ${isToday ? 'w-7 h-7 bg-gold text-dark rounded-full flex items-center justify-center mx-auto' : 'text-off-white'}`}>
                      {format(day, 'd')}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Time rows */}
            {TIME_SLOTS.map(slot => (
              <div key={slot} className="grid border-b border-dark-border/50" style={{ gridTemplateColumns: '80px repeat(7, 1fr)' }}>
                <div className="p-2 text-xs text-muted flex items-start justify-center pt-2">{slot}</div>
                {weekDays.map((day, di) => {
                  const cellScheds = getScheduleForCell(day, slot)
                  return (
                    <div
                      key={di}
                      onClick={() => handleCellClick(day, slot)}
                      className="min-h-[56px] border-l border-dark-border/50 p-1 cursor-pointer hover:bg-dark-card/30 transition-colors relative"
                    >
                      {cellScheds.map(sch => {
                        const staffMember = staff.find(s => s.id === sch.staffId)
                        const color = getBarberColor(sch.staffId)
                        return (
                          <div
                            key={sch.id}
                            onClick={e => handleScheduleClick(e, sch)}
                            className={`text-xs px-1.5 py-1 rounded border mb-0.5 truncate ${color} cursor-pointer hover:opacity-80 transition-opacity`}
                          >
                            {staffMember?.name || '?'} ({sch.shift})
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Summary */}
      {barberHours.length > 0 && (
        <div className="bg-dark-surface border border-dark-border rounded-2xl p-4">
          <h3 className="font-semibold text-off-white mb-3 text-sm">{t('tenantAdmin.schedule.totalHoursThisWeek')}</h3>
          <div className="flex flex-wrap gap-3">
            {barberHours.map(s => (
              <div key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${getBarberColor(s.id)}`}>
                <span className="font-medium">{s.name}</span>
                <span className="font-bold">{t('tenantAdmin.schedule.hoursValue', { hours: s.weekHours })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={selectedSchedule ? t('tenantAdmin.schedule.scheduleDetail') : t('tenantAdmin.schedule.addSchedule')}>
        {selectedSchedule ? (
          <div className="space-y-4">
            <div className="p-4 bg-dark-card rounded-xl space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">{t('tenantAdmin.schedule.barber')}</span>
                <span className="text-off-white">{staff.find(s => s.id === selectedSchedule.staffId)?.name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">{t('tenantAdmin.schedule.date')}</span>
                <span className="text-off-white">{selectedSchedule.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">{t('tenantAdmin.schedule.shift')}</span>
                <span className="text-gold font-medium">{selectedSchedule.shift}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">{t('tenantAdmin.schedule.hours')}</span>
                <span className="text-off-white">{selectedSchedule.startTime} – {selectedSchedule.endTime}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" fullWidth onClick={() => setShowModal(false)}>{t('tenantAdmin.schedule.close')}</Button>
              <Button variant="danger" fullWidth icon={Trash2} onClick={handleDelete}>{t('tenantAdmin.schedule.delete')}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {selectedCell && (
              <p className="text-sm text-muted">
                {format(selectedCell.date, 'EEEE, d MMMM yyyy', { locale: idLocale })} — {t('tenantAdmin.schedule.slot')} {selectedCell.slot}
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">{t('tenantAdmin.schedule.barber')}</label>
              <select value={form.staffId} onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))} className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60">
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">{t('tenantAdmin.schedule.shiftType')}</label>
              <div className="space-y-2">
                {SHIFT_TYPES.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, shift: s.value }))}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${form.shift === s.value ? s.color : 'border-dark-border text-muted hover:border-gold/30'}`}
                  >
                    <span className="font-medium">{s.value}</span>
                    <span className="ml-2 text-xs opacity-70">{t(s.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" fullWidth onClick={() => setShowModal(false)}>{t('tenantAdmin.schedule.cancel')}</Button>
              <Button fullWidth onClick={handleSave}>{t('tenantAdmin.schedule.save')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
