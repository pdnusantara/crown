import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft, ChevronRight, Trash2, RefreshCw, AlertTriangle, Plus,
  Copy, CalendarDays, Search, Download, CheckSquare, Square, X,
  LayoutGrid, List as ListIcon, Eraser, ArrowDownAZ, Users, Clock,
} from 'lucide-react'
import { startOfWeek, addDays, format, addWeeks, subWeeks } from 'date-fns'
import { id as idLocale, enUS as enLocale } from 'date-fns/locale'
import { useAuthStore } from '../../store/authStore.js'
import { useUsers } from '../../hooks/useUsers.js'
import { useBranches } from '../../hooks/useBranches.js'
import {
  useBarberSchedules, useCreateBarberSchedule, useDeleteBarberSchedule,
  useUpdateBarberSchedule, useCopyScheduleWeek,
  useBulkDeleteSchedules, useClearScheduleWeek,
} from '../../hooks/useBarberSchedules.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import Card from '../../components/ui/Card.jsx'
import LiveBadge from '../../components/ui/LiveBadge.jsx'
import ErrorBoundary from '../../components/ui/ErrorBoundary.jsx'

const SHIFT_TYPES = [
  { value: 'Pagi', labelKey: 'tenantAdmin.schedule.shiftMorningLabel',   startTime: '08:00', endTime: '14:00', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { value: 'Sore', labelKey: 'tenantAdmin.schedule.shiftAfternoonLabel', startTime: '14:00', endTime: '22:00', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  { value: 'Full', labelKey: 'tenantAdmin.schedule.shiftFullLabel',      startTime: '08:00', endTime: '22:00', color: 'bg-gold/20 text-gold border-gold/30' },
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

const minutesOf = (s) => {
  const [sh, sm] = (s.startTime || '08:00').split(':').map(Number)
  const [eh, em] = (s.endTime   || '22:00').split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

function csvEscape(v) {
  const s = String(v ?? '')
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function TASchedulePageInner() {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language?.startsWith('en') ? enLocale : idLocale
  const DAY_NAMES = [
    t('tenantAdmin.schedule.dayMon'), t('tenantAdmin.schedule.dayTue'),
    t('tenantAdmin.schedule.dayWed'), t('tenantAdmin.schedule.dayThu'),
    t('tenantAdmin.schedule.dayFri'), t('tenantAdmin.schedule.daySat'),
    t('tenantAdmin.schedule.daySun'),
  ]
  const { user } = useAuthStore()
  const { data: allUsers = [] } = useUsers({ role: 'barber', isActive: true })
  const { data: branches = [] } = useBranches(user?.tenantId)
  const toast = useToast()

  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const weekStartStr = format(currentWeek, 'yyyy-MM-dd')

  const [branchFilter, setBranchFilter] = useState(() => user?.branchId || 'all')
  const queryFilters = { weekStart: weekStartStr }
  if (branchFilter && branchFilter !== 'all') queryFilters.branchId = branchFilter

  const { data: weekSchedules = [], isLoading, isError, refetch, isFetching } = useBarberSchedules(queryFilters)
  const createMut = useCreateBarberSchedule()
  const deleteMut = useDeleteBarberSchedule()
  const updateMut = useUpdateBarberSchedule()
  const copyWeekMut = useCopyScheduleWeek()
  const bulkDeleteMut = useBulkDeleteSchedules()
  const clearWeekMut = useClearScheduleWeek()

  // Local UI state
  const [repeatWeeks, setRepeatWeeks] = useState(1)
  const [draggedId, setDraggedId] = useState(null)
  const [dropHover, setDropHover] = useState(null)

  const [showModal, setShowModal] = useState(false)
  const [selectedCell, setSelectedCell] = useState(null)
  const [selectedSchedule, setSelectedSchedule] = useState(null)
  const [form, setForm] = useState({ staffId: '', shift: 'Pagi', branchId: '' })
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmCopy, setConfirmCopy] = useState(false)
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  // Layout & filters
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)
  const [viewMode, setViewMode] = useState(() => (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) ? 'list' : 'calendar')
  const [activeDayIdx, setActiveDayIdx] = useState(() => {
    const d = new Date()
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
    return dow
  })
  const [staffSearch, setStaffSearch] = useState('')
  const [searchDeb, setSearchDeb] = useState('')
  const [bulkMode, setBulkMode] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [sortHours, setSortHours] = useState(false)

  // Debounce search 200ms
  useEffect(() => {
    const id = setTimeout(() => setSearchDeb(staffSearch.trim().toLowerCase()), 200)
    return () => clearTimeout(id)
  }, [staffSearch])

  // Watch viewport
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = (e) => setIsMobile(e.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  // Reset selection when leaving bulk mode
  useEffect(() => { if (!bulkMode) setSelected(new Set()) }, [bulkMode])

  const staff = useMemo(() => {
    // Backend already scopes by tenant + isActive=true; just filter by search for the legend / form.
    if (!searchDeb) return allUsers
    return allUsers.filter(s => s.name?.toLowerCase().includes(searchDeb))
  }, [allUsers, searchDeb])

  // Color stability: use FULL staff list as basis (so colors don't shift when searching)
  const colorMap = useMemo(() => {
    const map = {}
    allUsers.forEach((s, i) => { map[s.id] = BARBER_COLORS[i % BARBER_COLORS.length] })
    return map
  }, [allUsers])
  const getBarberColor = (staffId) => colorMap[staffId] || BARBER_COLORS[0]

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i))

  const getScheduleForCell = (date, slot) => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return weekSchedules.filter(s => {
      if (s.date !== dateStr) return false
      const slotH = parseInt(slot.split(':')[0])
      const startH = parseInt((s.startTime || '00:00').split(':')[0])
      const endH   = parseInt((s.endTime   || '23:00').split(':')[0])
      return slotH >= startH && slotH < endH
    })
  }

  const handleCellClick = (date, slot) => {
    if (bulkMode) return
    setSelectedCell({ date, slot })
    setSelectedSchedule(null)
    const defaultBranch =
      (branchFilter && branchFilter !== 'all' ? branchFilter : null) ||
      user?.branchId || branches[0]?.id || ''
    setForm({ staffId: allUsers[0]?.id || '', shift: 'Pagi', branchId: defaultBranch })
    setShowModal(true)
  }

  const handleScheduleClick = (e, schedule) => {
    e.stopPropagation()
    if (bulkMode) {
      toggleSelect(schedule.id)
      return
    }
    setSelectedSchedule(schedule)
    setSelectedCell(null)
    setShowModal(true)
  }

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    if (!form.staffId) return toast.error(t('tenantAdmin.schedule.selectBarber'))
    const shiftConfig = SHIFT_TYPES.find(s => s.value === form.shift) || SHIFT_TYPES[0]
    try {
      await createMut.mutateAsync({
        staffId:   form.staffId,
        branchId:  form.branchId || user?.branchId || null,
        date:      format(selectedCell.date, 'yyyy-MM-dd'),
        shift:     form.shift,
        startTime: shiftConfig.startTime,
        endTime:   shiftConfig.endTime,
      })
      toast.success(t('tenantAdmin.schedule.scheduleAdded'))
      setShowModal(false)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.schedule.saveFailed'))
    }
  }

  const handleCopyWeek = async (overwrite = false) => {
    const fromWeekStart = format(subWeeks(currentWeek, 1), 'yyyy-MM-dd')
    try {
      const result = await copyWeekMut.mutateAsync({
        fromWeekStart, toWeekStart: weekStartStr, overwrite, repeatWeeks,
      })
      const deletedPart = result.deleted
        ? t('tenantAdmin.schedule.copySummaryDeleted', { count: result.deleted })
        : ''
      const weeksPart = result.weeks > 1
        ? t('tenantAdmin.schedule.copySummaryWeeks', { count: result.weeks })
        : ''
      toast.success(t('tenantAdmin.schedule.copySummary', {
        copied: result.copied, skipped: result.skipped,
        deleted: deletedPart, weeks: weeksPart,
      }))
      setConfirmCopy(false)
      setRepeatWeeks(1)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.schedule.copyFailed'))
    }
  }

  // Drag & drop
  const handleDragStart = (e, sch) => {
    setDraggedId(sch.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', sch.id)
  }
  const handleDragEnd = () => { setDraggedId(null); setDropHover(null) }
  const handleDragOver = (e, dateKey) => {
    if (!draggedId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropHover !== dateKey) setDropHover(dateKey)
  }
  const handleDrop = async (e, date) => {
    e.preventDefault()
    const id = draggedId || e.dataTransfer.getData('text/plain')
    if (!id) return
    const sch = weekSchedules.find(s => s.id === id)
    setDraggedId(null); setDropHover(null)
    if (!sch) return
    const newDate = format(date, 'yyyy-MM-dd')
    if (sch.date === newDate) return
    try {
      await updateMut.mutateAsync({ id: sch.id, date: newDate })
      toast.success(t('tenantAdmin.schedule.scheduleMoved'))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.schedule.moveFailed'))
    }
  }

  const askDelete = (sch) => {
    const member = allUsers.find(s => s.id === sch.staffId)
    setConfirmDelete({
      schedule: sch,
      title: t('tenantAdmin.schedule.confirmDeleteTitle'),
      description: t('tenantAdmin.schedule.confirmDeleteDesc', {
        name: member?.name || '—',
        date: format(new Date(sch.date + 'T00:00:00'), 'd MMM yyyy', { locale: dateLocale }),
      }),
    })
    setShowModal(false)
  }

  const performDelete = async () => {
    try {
      await deleteMut.mutateAsync(confirmDelete.schedule.id)
      toast.success(t('tenantAdmin.schedule.scheduleDeleted'))
      setConfirmDelete(null)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.schedule.deleteFailed'))
    }
  }

  const performBulkDelete = async () => {
    const ids = [...selected]
    if (!ids.length) { setConfirmBulk(false); return }
    try {
      const r = await bulkDeleteMut.mutateAsync(ids)
      toast.success(t('tenantAdmin.schedule.bulkDeleteSuccess', { count: r.deleted }))
      setSelected(new Set())
      setBulkMode(false)
      setConfirmBulk(false)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.schedule.deleteFailed'))
    }
  }

  const performClearWeek = async () => {
    try {
      const payload = { weekStart: weekStartStr }
      if (branchFilter && branchFilter !== 'all') payload.branchId = branchFilter
      const r = await clearWeekMut.mutateAsync(payload)
      toast.success(t('tenantAdmin.schedule.clearWeekSuccess', { count: r.deleted }))
      setConfirmClear(false)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('tenantAdmin.schedule.deleteFailed'))
    }
  }

  const handleExportCsv = () => {
    if (!weekSchedules.length) return toast.error(t('tenantAdmin.schedule.exportEmpty'))
    const headers = [
      t('tenantAdmin.schedule.date'),
      t('tenantAdmin.schedule.barber'),
      t('tenantAdmin.schedule.shift'),
      t('tenantAdmin.schedule.hours'),
      t('tenantAdmin.schedule.branch'),
    ]
    const rows = [...weekSchedules]
      .sort((a, b) => (a.date.localeCompare(b.date)) || a.startTime.localeCompare(b.startTime))
      .map(s => [
        s.date,
        allUsers.find(u => u.id === s.staffId)?.name || '—',
        s.shift,
        `${s.startTime}–${s.endTime}`,
        s.branchId ? (branches.find(b => b.id === s.branchId)?.name || '—') : t('tenantAdmin.schedule.branchNoneShort'),
      ])
    const csv = [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `schedule-${weekStartStr}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  }

  // Derived stats
  const barberHours = useMemo(() => {
    const list = allUsers.map(s => {
      const sch = weekSchedules.filter(w => w.staffId === s.id)
      const totalMinutes = sch.reduce((acc, w) => acc + minutesOf(w), 0)
      return { ...s, weekHours: Math.round(totalMinutes / 60 * 10) / 10, count: sch.length }
    }).filter(s => s.weekHours > 0)
    return sortHours ? list.sort((a, b) => b.weekHours - a.weekHours) : list
  }, [allUsers, weekSchedules, sortHours])

  const branchHours = useMemo(() => {
    if (branches.length <= 1) return []
    const map = {}
    for (const w of weekSchedules) {
      const key = w.branchId || '__none'
      map[key] = (map[key] || 0) + minutesOf(w)
    }
    return Object.entries(map)
      .map(([id, mins]) => ({
        id,
        name: id === '__none' ? t('tenantAdmin.schedule.branchNoneShort') : (branches.find(b => b.id === id)?.name || '—'),
        weekHours: Math.round(mins / 60 * 10) / 10,
      }))
      .filter(b => b.weekHours > 0)
      .sort((a, b) => b.weekHours - a.weekHours)
  }, [weekSchedules, branches, t])

  const totalMinutes = useMemo(
    () => weekSchedules.reduce((acc, w) => acc + minutesOf(w), 0),
    [weekSchedules]
  )
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10

  const weekLabel = `${format(currentWeek, 'd MMM', { locale: dateLocale })} – ${format(addDays(currentWeek, 6), 'd MMM yyyy', { locale: dateLocale })}`

  const filteredVisible = (sch) => {
    if (!searchDeb) return true
    const name = allUsers.find(u => u.id === sch.staffId)?.name?.toLowerCase() || ''
    return name.includes(searchDeb)
  }
  const visibleSchedules = useMemo(
    () => weekSchedules.filter(filteredVisible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekSchedules, searchDeb, allUsers]
  )
  const selectAllVisible = () => {
    setSelected(new Set(visibleSchedules.map(s => s.id)))
  }

  // ─── Render parts ────────────────────────────────────────────────────
  const ChipSchedule = ({ sch, dense = false }) => {
    const staffMember = allUsers.find(s => s.id === sch.staffId)
    const color = getBarberColor(sch.staffId)
    const isDragging = draggedId === sch.id
    const isSelected = selected.has(sch.id)
    const hideByFilter = !filteredVisible(sch)
    return (
      <div
        draggable={!bulkMode}
        onDragStart={(e) => { if (bulkMode) return; e.stopPropagation(); handleDragStart(e, sch) }}
        onDragEnd={handleDragEnd}
        onClick={e => handleScheduleClick(e, sch)}
        title={bulkMode ? '' : t('tenantAdmin.schedule.dragHint')}
        className={`relative ${dense ? 'text-xs px-1.5 py-1 mb-0.5' : 'text-sm px-2.5 py-1.5'} rounded border truncate ${color}
          ${bulkMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}
          ${isDragging ? 'opacity-40' : ''}
          ${hideByFilter ? 'opacity-30' : ''}
          ${isSelected ? 'ring-2 ring-gold ring-offset-1 ring-offset-dark-surface' : 'hover:opacity-80'}
          transition-all`}
      >
        {bulkMode && (
          <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-dark-surface border border-dark-border flex items-center justify-center">
            {isSelected ? <CheckSquare size={12} className="text-gold" /> : <Square size={12} className="text-muted" />}
          </span>
        )}
        <span className="truncate">{staffMember?.name || '?'} ({sch.shift})</span>
      </div>
    )
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white truncate">{t('tenantAdmin.schedule.title')}</h1>
          <p className="text-muted text-xs sm:text-sm mt-1">{t('tenantAdmin.schedule.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <LiveBadge className="hidden sm:inline-flex" />
          {branches.length > 1 && (
            <select
              value={branchFilter}
              onChange={e => setBranchFilter(e.target.value)}
              className="bg-dark-card border border-dark-border text-off-white rounded-xl px-3 py-2 text-xs sm:text-sm outline-none focus:border-gold/60 cursor-pointer max-w-[160px]"
              aria-label={t('tenantAdmin.schedule.branchFilterAria')}
            >
              <option value="all">{t('tenantAdmin.schedule.branchAll')}</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <Button variant="secondary" size="sm" onClick={() => refetch()} icon={RefreshCw} loading={isFetching && !isLoading} aria-label={t('tenantAdmin.schedule.refresh')} />
        </div>
      </div>

      {/* Week nav + actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setCurrentWeek(w => subWeeks(w, 1))}
            className="p-2 rounded-xl border border-dark-border text-muted hover:text-off-white hover:border-gold/30 transition-all"
            aria-label={t('tenantAdmin.schedule.prevWeekAria')}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-xs sm:text-sm text-off-white font-medium px-3 py-2 bg-dark-card border border-dark-border rounded-xl whitespace-nowrap">
            {weekLabel}
          </span>
          <button
            onClick={() => setCurrentWeek(w => addWeeks(w, 1))}
            className="p-2 rounded-xl border border-dark-border text-muted hover:text-off-white hover:border-gold/30 transition-all"
            aria-label={t('tenantAdmin.schedule.nextWeekAria')}
          >
            <ChevronRight size={18} />
          </button>
          <Button variant="secondary" size="sm" onClick={() => setCurrentWeek(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
            {t('tenantAdmin.schedule.thisWeek')}
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="inline-flex rounded-xl border border-dark-border p-0.5 bg-dark-card">
            <button
              onClick={() => setViewMode('calendar')}
              aria-pressed={viewMode === 'calendar'}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'calendar' ? 'bg-gold text-dark' : 'text-muted hover:text-off-white'
              }`}
            >
              <LayoutGrid size={13} />
              <span className="hidden sm:inline">{t('tenantAdmin.schedule.calendarView')}</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'list' ? 'bg-gold text-dark' : 'text-muted hover:text-off-white'
              }`}
            >
              <ListIcon size={13} />
              <span className="hidden sm:inline">{t('tenantAdmin.schedule.listView')}</span>
            </button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={Copy}
            onClick={() => setConfirmCopy(true)}
            loading={copyWeekMut.isPending}
            title={t('tenantAdmin.schedule.copyLastWeekTitle')}
            aria-label={t('tenantAdmin.schedule.copyLastWeek')}
          >
            <span className="hidden md:inline">{t('tenantAdmin.schedule.copyLastWeek')}</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Download}
            onClick={handleExportCsv}
            disabled={!weekSchedules.length}
            aria-label={t('tenantAdmin.schedule.exportCsv')}
          >
            <span className="hidden md:inline">{t('tenantAdmin.schedule.exportCsv')}</span>
          </Button>
          <Button
            variant={bulkMode ? 'primary' : 'secondary'}
            size="sm"
            icon={bulkMode ? X : CheckSquare}
            onClick={() => setBulkMode(v => !v)}
            aria-pressed={bulkMode}
            aria-label={bulkMode ? t('tenantAdmin.schedule.bulkExit') : t('tenantAdmin.schedule.bulkSelectMode')}
          >
            <span className="hidden md:inline">{bulkMode ? t('tenantAdmin.schedule.bulkExit') : t('tenantAdmin.schedule.bulkSelectMode')}</span>
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={Eraser}
            onClick={() => setConfirmClear(true)}
            disabled={!weekSchedules.length}
            aria-label={t('tenantAdmin.schedule.clearWeek')}
          >
            <span className="hidden lg:inline">{t('tenantAdmin.schedule.clearWeek')}</span>
          </Button>
        </div>
      </div>

      {/* Search + KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="col-span-1 sm:col-span-1 flex items-center gap-2 bg-dark-surface border border-dark-border rounded-xl px-3 py-2 focus-within:border-gold/60 transition-colors min-w-0">
          <Search aria-hidden="true" className="w-4 h-4 text-muted flex-shrink-0" />
          <input
            type="text"
            inputMode="search"
            role="searchbox"
            value={staffSearch}
            onChange={e => setStaffSearch(e.target.value)}
            placeholder={t('tenantAdmin.schedule.searchBarbers')}
            aria-label={t('tenantAdmin.schedule.searchBarbers')}
            className="flex-1 min-w-0 appearance-none bg-transparent border-0 text-off-white placeholder-muted text-sm outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
          />
          {staffSearch && (
            <button
              type="button"
              onClick={() => setStaffSearch('')}
              aria-label={t('tenantAdmin.schedule.clearSearch')}
              className="flex-shrink-0 -mr-1 p-1 rounded-md text-muted hover:text-off-white hover:bg-dark-card transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </label>
        <div className="grid grid-cols-2 gap-3 col-span-1 sm:col-span-2">
          <Card className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center text-gold">
              <CalendarDays size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] uppercase tracking-wide text-muted">{t('tenantAdmin.schedule.totalSchedules')}</div>
              <div className="text-base sm:text-lg font-bold text-off-white tabular-nums">{weekSchedules.length}</div>
            </div>
          </Card>
          <Card className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-300">
              <Clock size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] uppercase tracking-wide text-muted">{t('tenantAdmin.schedule.totalHours')}</div>
              <div className="text-base sm:text-lg font-bold text-off-white tabular-nums">{totalHours}</div>
            </div>
          </Card>
        </div>
      </div>

      {/* Bulk actions bar */}
      {bulkMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-gold/10 border border-gold/30">
          <div className="flex items-center gap-2 text-sm text-off-white">
            <Users size={14} className="text-gold" />
            <span className="font-medium">{t('tenantAdmin.schedule.bulkSelectedCount', { count: selected.size })}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={selectAllVisible}>{t('tenantAdmin.schedule.bulkSelectAll')}</Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>{t('tenantAdmin.schedule.bulkClearSel')}</Button>
            <Button size="sm" variant="danger" icon={Trash2} disabled={!selected.size} loading={bulkDeleteMut.isPending} onClick={() => setConfirmBulk(true)}>
              {t('tenantAdmin.schedule.bulkDelete')}
            </Button>
          </div>
        </div>
      )}

      {/* Main content */}
      {allUsers.length === 0 ? (
        <Card className="p-6 sm:p-8 text-center">
          <AlertTriangle size={28} className="mx-auto mb-3 text-amber-400" />
          <p className="text-sm text-muted">{t('tenantAdmin.schedule.noBarbers')}</p>
        </Card>
      ) : isError ? (
        <Card className="p-6 sm:p-8 flex flex-col items-center text-center">
          <AlertTriangle size={32} className="text-amber-400 mb-3" />
          <h3 className="font-semibold text-off-white mb-1">{t('tenantAdmin.schedule.errorLoading')}</h3>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => refetch()} className="mt-4">
            {t('tenantAdmin.schedule.retry')}
          </Button>
        </Card>
      ) : (
        <>
          {/* Legend — barber colors with search filter */}
          {staff.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {staff.map(s => (
                <div key={s.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${getBarberColor(s.id)}`}>
                  <div className="w-2 h-2 rounded-full bg-current" />
                  <span className="truncate max-w-[140px]">{s.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">{t('tenantAdmin.schedule.noMatchingBarber')}</p>
          )}

          {/* Calendar / List view */}
          {viewMode === 'calendar' ? (
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
                        const dateKey = format(day, 'yyyy-MM-dd')
                        const isDropHover = dropHover === dateKey && !!draggedId
                        return (
                          <div
                            key={di}
                            onClick={() => handleCellClick(day, slot)}
                            onDragOver={(e) => handleDragOver(e, dateKey)}
                            onDragLeave={() => dropHover === dateKey && setDropHover(null)}
                            onDrop={(e) => handleDrop(e, day)}
                            className={`min-h-[56px] border-l border-dark-border/50 p-1 transition-colors relative ${
                              bulkMode ? '' : 'cursor-pointer'
                            } ${isDropHover ? 'bg-gold/15 ring-2 ring-gold/40 ring-inset' : 'hover:bg-dark-card/30'}`}
                          >
                            {cellScheds.map(sch => <ChipSchedule key={sch.id} sch={sch} dense />)}
                          </div>
                        )
                      })}
                    </div>
                  ))}

                  {isLoading && (
                    <div className="px-4 py-3 border-t border-dark-border/40 space-y-2">
                      {[0,1,2].map(i => <div key={i} className="h-2 bg-dark-card rounded animate-pulse" />)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            // ─── LIST / MOBILE VIEW ──────────────────────────────────────
            <div className="space-y-3">
              {/* Day pills (mobile-friendly) */}
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                {weekDays.map((day, i) => {
                  const dateStr = format(day, 'yyyy-MM-dd')
                  const isToday = dateStr === format(new Date(), 'yyyy-MM-dd')
                  const isActive = i === activeDayIdx
                  const count = weekSchedules.filter(s => s.date === dateStr).length
                  return (
                    <button
                      key={i}
                      onClick={() => setActiveDayIdx(i)}
                      className={`snap-start flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-all min-w-[64px] ${
                        isActive
                          ? 'bg-gold text-dark border-gold'
                          : `bg-dark-card border-dark-border ${isToday ? 'text-gold' : 'text-muted'}`
                      }`}
                    >
                      <span className="text-[10px] uppercase tracking-wide font-medium">{DAY_NAMES[i]}</span>
                      <span className={`text-lg font-bold tabular-nums ${isActive ? '' : isToday ? 'text-gold' : 'text-off-white'}`}>{format(day, 'd')}</span>
                      {count > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-dark/20 text-dark' : 'bg-gold/15 text-gold'}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {(() => {
                const day = weekDays[activeDayIdx]
                const dateStr = format(day, 'yyyy-MM-dd')
                const daySch = [...weekSchedules]
                  .filter(s => s.date === dateStr)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                return (
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-off-white text-sm">
                        {format(day, 'EEEE, d MMMM yyyy', { locale: dateLocale })}
                      </h3>
                      {!bulkMode && (
                        <Button size="sm" icon={Plus} onClick={() => handleCellClick(day, TIME_SLOTS[0])}>
                          <span className="hidden sm:inline">{t('tenantAdmin.schedule.addSchedule')}</span>
                        </Button>
                      )}
                    </div>
                    {isLoading ? (
                      <div className="space-y-2">
                        {[0,1,2].map(i => <div key={i} className="h-12 rounded-lg bg-dark-card animate-pulse" />)}
                      </div>
                    ) : daySch.length === 0 ? (
                      <button
                        onClick={() => handleCellClick(day, TIME_SLOTS[0])}
                        className="w-full py-8 rounded-xl border border-dashed border-dark-border text-center hover:border-gold/40 transition-colors"
                      >
                        <CalendarDays size={24} className="mx-auto mb-2 text-muted" />
                        <p className="text-sm font-medium text-off-white">{t('tenantAdmin.schedule.noScheduleOnDay')}</p>
                        <p className="text-xs text-muted mt-0.5">{t('tenantAdmin.schedule.tapToAdd')}</p>
                      </button>
                    ) : (
                      <div className="space-y-2">
                        {daySch.map(sch => {
                          const staffMember = allUsers.find(s => s.id === sch.staffId)
                          const color = getBarberColor(sch.staffId)
                          const isSelected = selected.has(sch.id)
                          const branchName = sch.branchId
                            ? (branches.find(b => b.id === sch.branchId)?.name || '—')
                            : t('tenantAdmin.schedule.branchNoneShort')
                          return (
                            <div
                              key={sch.id}
                              onClick={(e) => handleScheduleClick(e, sch)}
                              className={`flex items-center gap-3 p-3 rounded-xl border bg-dark-card cursor-pointer hover:border-gold/30 transition-all ${
                                isSelected ? 'border-gold ring-1 ring-gold/30' : 'border-dark-border'
                              }`}
                            >
                              {bulkMode && (
                                <div className="flex-shrink-0">
                                  {isSelected ? <CheckSquare size={18} className="text-gold" /> : <Square size={18} className="text-muted" />}
                                </div>
                              )}
                              <div className={`flex-shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center ${color}`}>
                                <span className="text-xs font-bold">{(staffMember?.name || '?').slice(0, 2).toUpperCase()}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-off-white text-sm truncate">{staffMember?.name || '—'}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gold/10 text-gold border border-gold/20 font-medium">
                                    {sch.shift}
                                  </span>
                                </div>
                                <div className="text-xs text-muted mt-0.5 tabular-nums">
                                  {sch.startTime}–{sch.endTime}
                                  {branches.length > 1 && <span className="ml-2">· {branchName}</span>}
                                </div>
                              </div>
                              {!bulkMode && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); askDelete(sch) }}
                                  className="p-2 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                  aria-label={t('tenantAdmin.schedule.delete')}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </Card>
                )
              })()}
            </div>
          )}

          {/* Empty week */}
          {!isLoading && weekSchedules.length === 0 && (
            <Card className="p-6 sm:p-8 text-center">
              <CalendarDays size={28} className="mx-auto mb-3 text-muted" />
              <h3 className="font-semibold text-off-white mb-1 text-sm">{t('tenantAdmin.schedule.noSchedules')}</h3>
              <p className="text-muted text-xs mb-4">{t('tenantAdmin.schedule.emptyCta')}</p>
              <div className="flex items-center justify-center gap-2">
                <Button variant="secondary" size="sm" icon={Copy} onClick={() => setConfirmCopy(true)} loading={copyWeekMut.isPending}>
                  {t('tenantAdmin.schedule.copyLastWeek')}
                </Button>
              </div>
            </Card>
          )}

          {/* Hours summary */}
          {barberHours.length > 0 && (
            <div className="bg-dark-surface border border-dark-border rounded-2xl p-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h3 className="font-semibold text-off-white text-sm">{t('tenantAdmin.schedule.totalHoursThisWeek')}</h3>
                  <button
                    onClick={() => setSortHours(v => !v)}
                    aria-pressed={sortHours}
                    className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                      sortHours ? 'bg-gold/15 border-gold/40 text-gold' : 'border-dark-border text-muted hover:text-off-white'
                    }`}
                  >
                    <ArrowDownAZ size={12} />
                    {t('tenantAdmin.schedule.sortByHours')}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {barberHours.map(s => (
                    <div key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs sm:text-sm ${getBarberColor(s.id)}`}>
                      <span className="font-medium truncate max-w-[120px]">{s.name}</span>
                      <span className="font-bold tabular-nums">{t('tenantAdmin.schedule.hoursValue', { hours: s.weekHours })}</span>
                    </div>
                  ))}
                </div>
              </div>
              {branchHours.length > 0 && (
                <div className="pt-3 border-t border-dark-border">
                  <h3 className="font-semibold text-off-white mb-3 text-sm">{t('tenantAdmin.schedule.branchHoursTitle')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {branchHours.map(b => (
                      <div key={b.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dark-border bg-dark-card text-xs sm:text-sm">
                        <span className="text-off-white font-medium truncate max-w-[140px]">{b.name}</span>
                        <span className="text-gold font-bold tabular-nums">{t('tenantAdmin.schedule.hoursValue', { hours: b.weekHours })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)}
        title={selectedSchedule ? t('tenantAdmin.schedule.scheduleDetail') : t('tenantAdmin.schedule.addSchedule')}>
        {selectedSchedule ? (
          <div className="space-y-4">
            <div className="p-4 bg-dark-card rounded-xl space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted">{t('tenantAdmin.schedule.barber')}</span>
                <span className="text-off-white text-right truncate">{allUsers.find(s => s.id === selectedSchedule.staffId)?.name || '-'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">{t('tenantAdmin.schedule.date')}</span>
                <span className="text-off-white text-right">{format(new Date(selectedSchedule.date + 'T00:00:00'), 'EEEE, d MMM yyyy', { locale: dateLocale })}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">{t('tenantAdmin.schedule.shift')}</span>
                <span className="text-gold font-medium">{selectedSchedule.shift}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">{t('tenantAdmin.schedule.hours')}</span>
                <span className="text-off-white tabular-nums">{selectedSchedule.startTime} – {selectedSchedule.endTime}</span>
              </div>
              {selectedSchedule.branchId && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted">{t('tenantAdmin.schedule.branch')}</span>
                  <span className="text-off-white text-right truncate">{branches.find(b => b.id === selectedSchedule.branchId)?.name || '—'}</span>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" fullWidth onClick={() => setShowModal(false)}>{t('tenantAdmin.schedule.close')}</Button>
              <Button variant="danger" fullWidth icon={Trash2} onClick={() => askDelete(selectedSchedule)} loading={deleteMut.isPending}>
                {t('tenantAdmin.schedule.delete')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {selectedCell && (
              <p className="text-sm text-muted">
                {format(selectedCell.date, 'EEEE, d MMMM yyyy', { locale: dateLocale })} — {t('tenantAdmin.schedule.slot')} {selectedCell.slot}
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">{t('tenantAdmin.schedule.barber')}</label>
              <select
                value={form.staffId}
                onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))}
                className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60"
              >
                {allUsers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {branches.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-muted mb-1.5">{t('tenantAdmin.schedule.branch')}</label>
                <select
                  value={form.branchId}
                  onChange={e => setForm(f => ({ ...f, branchId: e.target.value }))}
                  className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60"
                >
                  <option value="">— {t('tenantAdmin.schedule.branchNone')} —</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">{t('tenantAdmin.schedule.shiftType')}</label>
              <div className="space-y-2">
                {SHIFT_TYPES.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, shift: s.value }))}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                      form.shift === s.value ? s.color : 'border-dark-border text-muted hover:border-gold/30'
                    }`}
                  >
                    <span className="font-medium">{s.value}</span>
                    <span className="ml-2 text-xs opacity-70">{t(s.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
              <Button variant="outline" fullWidth onClick={() => setShowModal(false)}>{t('tenantAdmin.schedule.cancel')}</Button>
              <Button fullWidth icon={Plus} onClick={handleSave} loading={createMut.isPending}>{t('tenantAdmin.schedule.save')}</Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={performDelete}
        title={confirmDelete?.title}
        description={confirmDelete?.description}
        confirmText={t('tenantAdmin.schedule.confirmYes')}
        cancelText={t('tenantAdmin.schedule.confirmNo')}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={performBulkDelete}
        title={t('tenantAdmin.schedule.bulkDeleteConfirm', { count: selected.size })}
        description={t('tenantAdmin.schedule.bulkDeleteConfirmDesc', { count: selected.size })}
        confirmText={t('tenantAdmin.schedule.confirmYes')}
        cancelText={t('tenantAdmin.schedule.confirmNo')}
        variant="danger"
      />

      <ConfirmDialog
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={performClearWeek}
        title={t('tenantAdmin.schedule.clearWeekConfirmTitle')}
        description={t('tenantAdmin.schedule.clearWeekConfirmDesc', { label: weekLabel })}
        confirmText={t('tenantAdmin.schedule.confirmYes')}
        cancelText={t('tenantAdmin.schedule.confirmNo')}
        variant="danger"
      />

      <Modal isOpen={confirmCopy} onClose={() => setConfirmCopy(false)} title={t('tenantAdmin.schedule.copyDialogTitle')}>
        <div className="space-y-4">
          <p
            className="text-sm text-muted leading-relaxed [&_b]:text-off-white"
            dangerouslySetInnerHTML={{
              __html: t('tenantAdmin.schedule.copyDialogDesc', {
                from:   format(subWeeks(currentWeek, 1), 'd MMM', { locale: dateLocale }),
                to:     format(addDays(subWeeks(currentWeek, 1), 6), 'd MMM yyyy', { locale: dateLocale }),
                target: weekLabel,
                extra:  repeatWeeks > 1
                  ? t('tenantAdmin.schedule.copyDialogExtraWeeks', { count: repeatWeeks - 1 })
                  : '',
                interpolation: { escapeValue: false },
              }),
            }}
          />
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">{t('tenantAdmin.schedule.copyRepeatLabel')}</label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[1, 2, 4, 8, 12].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRepeatWeeks(n)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    repeatWeeks === n
                      ? 'bg-gold text-dark border-gold'
                      : 'bg-dark-card border-dark-border text-muted hover:text-off-white'
                  }`}
                >
                  {t('tenantAdmin.schedule.copyRepeatWeeks', { count: n })}
                </button>
              ))}
            </div>
          </div>
          {weekSchedules.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
              {t('tenantAdmin.schedule.copyOverwriteWarn', { count: weekSchedules.length })}
            </div>
          )}
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <Button variant="outline" fullWidth onClick={() => setConfirmCopy(false)} disabled={copyWeekMut.isPending}>
              {t('tenantAdmin.schedule.cancel')}
            </Button>
            {weekSchedules.length > 0 && (
              <Button variant="danger" fullWidth icon={Trash2} onClick={() => handleCopyWeek(true)} loading={copyWeekMut.isPending}>
                {t('tenantAdmin.schedule.copyOverwriteBtn')}
              </Button>
            )}
            <Button fullWidth icon={Copy} onClick={() => handleCopyWeek(false)} loading={copyWeekMut.isPending}>
              {weekSchedules.length > 0 ? t('tenantAdmin.schedule.copySkipConflictBtn') : t('tenantAdmin.schedule.copyBtn')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default function TASchedulePage() {
  return (
    <ErrorBoundary>
      <TASchedulePageInner />
    </ErrorBoundary>
  )
}
