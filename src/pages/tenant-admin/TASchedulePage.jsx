import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Trash2, RefreshCw, AlertTriangle, Plus,
  Copy, CalendarDays, Search, Download, CheckSquare, Square, X,
  LayoutGrid, List as ListIcon, Eraser, ArrowDownAZ, Users, Clock,
  Fingerprint, Sliders, Save, RotateCcw,
  CheckCircle2, Circle, UserCircle, ListChecks,
} from 'lucide-react'
import { startOfWeek, addDays, format, addWeeks, subWeeks } from 'date-fns'
import { id as idLocale, enUS as enLocale } from 'date-fns/locale'
import { useAuthStore } from '../../store/authStore.js'
import { useUsers } from '../../hooks/useUsers.js'
import { useBranches } from '../../hooks/useBranches.js'
import { useTenant, useUpdateMyTenant } from '../../hooks/useTenants.js'
import {
  useBarberSchedules, useCreateBarberSchedule, useDeleteBarberSchedule,
  useUpdateBarberSchedule, useCopyScheduleWeek,
  useBulkDeleteSchedules, useClearScheduleWeek,
} from '../../hooks/useBarberSchedules.js'
import { useAttendanceSchedules } from '../../hooks/useAttendance.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import Card from '../../components/ui/Card.jsx'
import LiveBadge from '../../components/ui/LiveBadge.jsx'
import ErrorBoundary from '../../components/ui/ErrorBoundary.jsx'

// Preset bawaan — dipakai bila tenant belum mengatur shiftPresets sendiri.
const DEFAULT_PRESETS = [
  { value: 'Pagi', startTime: '08:00', endTime: '14:00' },
  { value: 'Sore', startTime: '14:00', endTime: '22:00' },
  { value: 'Full', startTime: '08:00', endTime: '22:00' },
]
const PRESET_COLORS = [
  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'bg-orange-500/20 text-orange-300 border-orange-500/30',
  'bg-gold/20 text-gold border-gold/30',
  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
  'bg-sky-500/20 text-sky-300 border-sky-500/30',
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
  // Tarik kasir & barber. Backend useUsers menerima 1 role param, jadi gabung dua query.
  const { data: barberUsers = [] } = useUsers({ role: 'barber', isActive: true })
  const { data: kasirUsers  = [] } = useUsers({ role: 'kasir',  isActive: true })
  const allUsers = useMemo(() => {
    const merged = [...barberUsers, ...kasirUsers]
    return merged.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }, [barberUsers, kasirUsers])
  const [roleFilter, setRoleFilter] = useState('all') // all | kasir | barber
  const { data: branches = [] } = useBranches(user?.tenantId)
  const { data: tenant } = useTenant(user?.tenantId)
  const updateTenant = useUpdateMyTenant()
  // Pola kerja mingguan barber (WorkSchedule) — untuk peringatan "hari libur" saat
  // admin assign shift di tanggal yang dipola mingguannya libur. Gracefully fail
  // bila fitur attendance tidak aktif di tenant.
  const { data: attSchedules = [] } = useAttendanceSchedules()
  const toast = useToast()

  // Preset shift efektif: dari tenant.shiftPresets bila ada, fallback default.
  // Setiap preset diberi warna stabil berdasarkan urutan.
  const presets = useMemo(() => {
    const raw = Array.isArray(tenant?.shiftPresets) && tenant.shiftPresets.length > 0
      ? tenant.shiftPresets
      : DEFAULT_PRESETS
    return raw.map((p, i) => ({ ...p, color: PRESET_COLORS[i % PRESET_COLORS.length] }))
  }, [tenant?.shiftPresets])
  const [showPresetEditor, setShowPresetEditor] = useState(false)

  // Onboarding wizard: tampil saat minggu kosong kecuali admin sudah menutup.
  const wizardKey = `schedule_wizard_dismissed_${user?.tenantId || 'na'}`
  const [wizardDismissed, setWizardDismissed] = useState(() => {
    try { return localStorage.getItem(wizardKey) === '1' } catch { return false }
  })
  const dismissWizard = () => {
    try { localStorage.setItem(wizardKey, '1') } catch {}
    setWizardDismissed(true)
  }
  const showWizard = () => {
    try { localStorage.removeItem(wizardKey) } catch {}
    setWizardDismissed(false)
  }

  // Lookup WorkSchedule per (staffId, dayOfWeek=0..6).
  const wsLookup = useMemo(() => {
    const map = {}
    for (const row of attSchedules || []) {
      const days = {}
      for (const d of row.schedule || []) days[d.dayOfWeek] = d
      map[row.staffId] = days
    }
    return map
  }, [attSchedules])

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
  const [form, setForm] = useState({ staffId: '', shift: '', branchId: '', startTime: '', endTime: '' })
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
    // Backend already scopes by tenant + isActive=true; filter by role + search.
    let arr = allUsers
    if (roleFilter !== 'all') arr = arr.filter((s) => s.role === roleFilter)
    if (searchDeb) arr = arr.filter((s) => s.name?.toLowerCase().includes(searchDeb))
    return arr
  }, [allUsers, searchDeb, roleFilter])

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

  // Ghost chips: barber yang punya WorkSchedule default tapi BELUM ada
  // BarberSchedule untuk tanggal ini → tampilkan placeholder semi-transparan
  // di slot pertama yg di-cover oleh jam default. Klik = promosikan jadi shift.
  const ghostMap = useMemo(() => {
    const map = {}
    if (!allUsers.length) return map
    // Cek apakah staf masuk filter cabang yang aktif.
    const passesBranchFilter = (u) => {
      if (!branchFilter || branchFilter === 'all') return true
      return u.branchId === branchFilter
    }
    for (const day of weekDays) {
      const dateStr = format(day, 'yyyy-MM-dd')
      const dow = day.getDay() // 0=Minggu, sesuai dengan WorkSchedule.dayOfWeek
      // Set staf yang sudah punya BarberSchedule di tanggal ini.
      const taken = new Set(weekSchedules.filter((s) => s.date === dateStr).map((s) => s.staffId))
      for (const u of allUsers) {
        if (taken.has(u.id)) continue
        if (!passesBranchFilter(u)) continue
        if (roleFilter !== 'all' && u.role !== roleFilter) continue
        const ws = wsLookup[u.id]?.[dow]
        if (!ws || ws.isDayOff) continue
        const startH = parseInt((ws.startTime || '08:00').split(':')[0])
        const endH   = parseInt((ws.endTime   || '17:00').split(':')[0])
        // Slot pertama yang overlap jam WS — taruh ghost di sini saja.
        const firstSlot = TIME_SLOTS.find((s) => {
          const h = parseInt(s.split(':')[0])
          return h >= startH && h < endH
        }) || TIME_SLOTS[0]
        const key = `${dateStr}|${firstSlot}`
        ;(map[key] ||= []).push({
          staffId: u.id,
          name: u.name,
          role: u.role,
          startTime: ws.startTime,
          endTime: ws.endTime,
        })
      }
    }
    return map
  }, [allUsers, weekDays, weekSchedules, wsLookup, branchFilter, roleFilter])

  // Tambah shift dari ghost chip — sama seperti handleCellClick tapi
  // pre-fill staf & jam dari WorkSchedule.
  const handleGhostClick = (e, date, ghost) => {
    e.stopPropagation()
    if (bulkMode) return
    setSelectedCell({ date, slot: TIME_SLOTS[0] })
    setSelectedSchedule(null)
    const defaultBranch =
      (branchFilter && branchFilter !== 'all' ? branchFilter : null) ||
      user?.branchId || branches[0]?.id || ''
    // Cocokkan dengan preset bila jam-nya sama; kalau tidak, pakai label "Custom".
    const matched = presets.find((p) => p.startTime === ghost.startTime && p.endTime === ghost.endTime)
    setForm({
      staffId: ghost.staffId,
      shift: matched?.value || presets[0]?.value || 'Default',
      branchId: defaultBranch,
      startTime: ghost.startTime,
      endTime: ghost.endTime,
    })
    setShowModal(true)
  }

  const handleCellClick = (date, slot) => {
    if (bulkMode) return
    setSelectedCell({ date, slot })
    setSelectedSchedule(null)
    const defaultBranch =
      (branchFilter && branchFilter !== 'all' ? branchFilter : null) ||
      user?.branchId || branches[0]?.id || ''
    const first = presets[0] || DEFAULT_PRESETS[0]
    setForm({
      staffId: allUsers[0]?.id || '',
      shift: first.value,
      branchId: defaultBranch,
      startTime: first.startTime,
      endTime: first.endTime,
    })
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
    setForm({
      staffId: schedule.staffId,
      shift: schedule.shift || (presets[0]?.value ?? ''),
      branchId: schedule.branchId || '',
      startTime: schedule.startTime || '',
      endTime: schedule.endTime || '',
    })
    setShowModal(true)
  }

  // Saat user pilih preset, isi otomatis startTime/endTime (override edit manual sebelumnya).
  const pickPreset = (value) => {
    const p = presets.find((x) => x.value === value)
    if (!p) return setForm((f) => ({ ...f, shift: value }))
    setForm((f) => ({ ...f, shift: value, startTime: p.startTime, endTime: p.endTime }))
  }

  // Konflik dengan pola mingguan (WorkSchedule): warning di modal saat barber
  // ini punya WS isDayOff=true di hari yang sama, atau jam shift di luar jam WS.
  const modalDate = selectedSchedule
    ? new Date(selectedSchedule.date + 'T00:00:00')
    : selectedCell?.date || null
  const wsWarning = useMemo(() => {
    if (!modalDate || !form.staffId) return null
    const dow = modalDate.getDay() // 0=Minggu
    const ws = wsLookup[form.staffId]?.[dow]
    if (!ws) return null
    if (ws.isDayOff) {
      return {
        tone: 'warn',
        text: 'Pola mingguan staf ini: HARI LIBUR. Shift di sini akan menggantikan dan menjadi dasar perhitungan absensi.',
      }
    }
    // Cek jam shift jauh berbeda dari WS (mis. WS 09-17, shift Sore 14-22).
    if (form.startTime && form.endTime && ws.startTime && ws.endTime) {
      const sameStart = form.startTime === ws.startTime
      const sameEnd   = form.endTime === ws.endTime
      if (!sameStart || !sameEnd) {
        return {
          tone: 'info',
          text: `Pola mingguan staf ini: ${ws.startTime}–${ws.endTime}. Jam shift di sini akan dipakai untuk hitung terlambat hari itu.`,
        }
      }
    }
    return null
  }, [modalDate, form.staffId, form.startTime, form.endTime, wsLookup])

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    if (!form.staffId) return toast.error(t('tenantAdmin.schedule.selectBarber'))
    if (!/^\d{2}:\d{2}$/.test(form.startTime) || !/^\d{2}:\d{2}$/.test(form.endTime)) {
      return toast.error('Jam shift tidak valid (HH:MM).')
    }
    if (form.startTime >= form.endTime) {
      return toast.error('Jam selesai harus setelah jam mulai.')
    }
    try {
      if (selectedSchedule) {
        await updateMut.mutateAsync({
          id: selectedSchedule.id,
          staffId:   form.staffId,
          branchId:  form.branchId || null,
          shift:     form.shift,
          startTime: form.startTime,
          endTime:   form.endTime,
        })
        toast.success('Jadwal diperbarui.')
      } else {
        await createMut.mutateAsync({
          staffId:   form.staffId,
          branchId:  form.branchId || user?.branchId || null,
          date:      format(selectedCell.date, 'yyyy-MM-dd'),
          shift:     form.shift,
          startTime: form.startTime,
          endTime:   form.endTime,
        })
        toast.success(t('tenantAdmin.schedule.scheduleAdded'))
      }
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
    const u = allUsers.find((x) => x.id === sch.staffId)
    if (roleFilter !== 'all' && u?.role !== roleFilter) return false
    if (!searchDeb) return true
    return (u?.name || '').toLowerCase().includes(searchDeb)
  }
  const visibleSchedules = useMemo(
    () => weekSchedules.filter(filteredVisible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekSchedules, searchDeb, allUsers, roleFilter]
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
        <span className="truncate">
          <span className="inline-block w-3.5 text-center text-[9px] font-bold mr-1 opacity-70" aria-label={staffMember?.role}>
            {staffMember?.role === 'kasir' ? 'K' : 'B'}
          </span>
          {staffMember?.name || '?'} ({sch.shift})
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white truncate">Jadwal Kerja Mingguan</h1>
          <p className="text-muted text-xs sm:text-sm mt-1">Rencana shift kasir &amp; barber per tanggal. Pola jam dasar diatur di <Link to="/admin/attendance?tab=jadwal" className="text-gold hover:underline">Pola Mingguan</Link>.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowPresetEditor(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dark-border text-xs sm:text-sm text-muted hover:text-gold hover:border-gold/40 transition-all"
            title="Atur preset jam shift"
          >
            <Sliders className="w-4 h-4" />
            <span className="hidden sm:inline">Atur Preset</span>
          </button>
          <Link
            to="/admin/attendance"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dark-border text-xs sm:text-sm text-muted hover:text-gold hover:border-gold/40 transition-all"
            title="Halaman Absensi & Jadwal Mingguan"
          >
            <Fingerprint className="w-4 h-4" />
            <span className="hidden sm:inline">Absensi</span>
          </Link>
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
          {/* Pemilih peran — segmented control compact */}
          <div className="flex-shrink-0 inline-flex rounded-lg border border-dark-border overflow-hidden" role="tablist" aria-label="Filter peran">
            {[
              { id: 'all',    label: 'Semua' },
              { id: 'kasir',  label: 'Kasir' },
              { id: 'barber', label: 'Barber' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={roleFilter === opt.id}
                onClick={() => setRoleFilter(opt.id)}
                className={`px-2 py-1 text-[11px] font-medium transition-colors ${
                  roleFilter === opt.id
                    ? 'bg-gold text-dark'
                    : 'text-muted hover:text-off-white hover:bg-dark-card'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
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

          {/* Legend ghost chip — hanya ditampilkan bila ada ghost di minggu ini */}
          {viewMode === 'calendar' && Object.keys(ghostMap).length > 0 && !bulkMode && (
            <div className="flex items-start gap-2 rounded-lg border border-dark-border bg-dark-card/40 px-3 py-2 text-[11px] text-muted">
              <span className="inline-block px-1.5 py-0.5 rounded border border-dashed border-dark-border/70 bg-dark-card/40 italic opacity-70 shrink-0">
                Tono · 09:00–17:00
              </span>
              <span>
                Chip bergaris putus-putus = <span className="text-off-white">pola kerja mingguan</span> staf (diatur di
                <Link to="/admin/attendance" className="ml-1 text-gold hover:underline">Pola Mingguan</Link>).
                Klik untuk tambahkan sebagai shift khusus tanggal itu.
              </span>
            </div>
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
                        const cellGhosts = bulkMode ? [] : (ghostMap[`${dateKey}|${slot}`] || [])
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
                            {cellGhosts.map((g) => (
                              <button
                                key={`ghost-${g.staffId}`}
                                type="button"
                                onClick={(e) => handleGhostClick(e, day, g)}
                                title={`Pola mingguan ${g.name} (${g.role}): ${g.startTime}–${g.endTime}. Klik untuk tambahkan sebagai shift khusus.`}
                                className="block w-full text-xs px-1.5 py-1 mb-0.5 rounded border border-dashed border-dark-border/70 bg-dark-card/20 text-muted italic opacity-70 hover:opacity-100 hover:border-gold/40 hover:text-gold transition-all truncate text-left"
                              >
                                <span className="truncate">
                                  <span className="inline-block w-3 text-center text-[9px] font-bold mr-1 opacity-70 not-italic">
                                    {g.role === 'kasir' ? 'K' : 'B'}
                                  </span>
                                  {g.name} · {g.startTime}–{g.endTime}
                                </span>
                              </button>
                            ))}
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

          {/* Empty week — wizard / panduan onboarding */}
          {!isLoading && weekSchedules.length === 0 && (
            wizardDismissed ? (
              <Card className="p-6 sm:p-8 text-center">
                <CalendarDays size={28} className="mx-auto mb-3 text-muted" />
                <h3 className="font-semibold text-off-white mb-1 text-sm">{t('tenantAdmin.schedule.noSchedules')}</h3>
                <p className="text-muted text-xs mb-4">{t('tenantAdmin.schedule.emptyCta')}</p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <Button variant="secondary" size="sm" icon={Copy} onClick={() => setConfirmCopy(true)} loading={copyWeekMut.isPending}>
                    {t('tenantAdmin.schedule.copyLastWeek')}
                  </Button>
                  <button type="button" onClick={showWizard} className="text-xs text-gold hover:underline">
                    Buka panduan
                  </button>
                </div>
              </Card>
            ) : (
              <OnboardingPanel
                hasBarber={allUsers.length > 0}
                hasWeeklyPattern={(attSchedules || []).some((row) => (row.schedule || []).some((d) => !d.isDayOff))}
                hasCustomPresets={Array.isArray(tenant?.shiftPresets) && tenant.shiftPresets.length > 0}
                onOpenPresets={() => setShowPresetEditor(true)}
                onCopyLastWeek={() => setConfirmCopy(true)}
                onAddFirst={() => handleCellClick(weekDays[0], TIME_SLOTS[0])}
                onDismiss={dismissWizard}
                copyLoading={copyWeekMut.isPending}
              />
            )
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

      {/* Modal — Tambah / Edit jadwal (unified form) */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)}
        title={selectedSchedule ? t('tenantAdmin.schedule.scheduleDetail') : t('tenantAdmin.schedule.addSchedule')}>
        <div className="space-y-4">
          {selectedSchedule ? (
            <p className="text-sm text-muted">
              {format(new Date(selectedSchedule.date + 'T00:00:00'), 'EEEE, d MMMM yyyy', { locale: dateLocale })}
            </p>
          ) : selectedCell && (
            <p className="text-sm text-muted">
              {format(selectedCell.date, 'EEEE, d MMMM yyyy', { locale: dateLocale })} — {t('tenantAdmin.schedule.slot')} {selectedCell.slot}
            </p>
          )}
          {wsWarning && (
            <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
              wsWarning.tone === 'warn'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                : 'border-gold/20 bg-gold/5 text-muted'
            }`}>
              <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${wsWarning.tone === 'warn' ? 'text-amber-400' : 'text-gold/80'}`} />
              <span>{wsWarning.text}</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">Staf (Kasir / Barber)</label>
            <select
              value={form.staffId}
              onChange={e => setForm(f => ({ ...f, staffId: e.target.value }))}
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60"
            >
              {allUsers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-muted">{t('tenantAdmin.schedule.shiftType')}</label>
              <button
                type="button"
                onClick={() => setShowPresetEditor(true)}
                className="inline-flex items-center gap-1 text-[11px] text-gold hover:underline"
                title="Atur preset jam shift untuk tenant ini"
              >
                <Sliders className="w-3 h-3" /> Atur Preset
              </button>
            </div>
            <div className="space-y-2">
              {presets.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => pickPreset(s.value)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                    form.shift === s.value ? s.color : 'border-dark-border text-muted hover:border-gold/30'
                  }`}
                >
                  <span className="font-medium">{s.value}</span>
                  <span className="ml-2 text-xs opacity-70 tabular-nums">{s.startTime}–{s.endTime}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">Mulai</label>
              <input
                type="time"
                value={form.startTime}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1.5">Selesai</label>
              <input
                type="time"
                value={form.endTime}
                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60 tabular-nums"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted">
            Pilih preset untuk mengisi cepat, atau ubah jam manual di atas untuk shift khusus.
          </p>
          {selectedSchedule ? (
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
              <Button variant="danger" fullWidth icon={Trash2} onClick={() => askDelete(selectedSchedule)} loading={deleteMut.isPending}>
                {t('tenantAdmin.schedule.delete')}
              </Button>
              <Button fullWidth icon={Save} onClick={handleSave} loading={updateMut.isPending}>Simpan Perubahan</Button>
            </div>
          ) : (
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
              <Button variant="outline" fullWidth onClick={() => setShowModal(false)}>{t('tenantAdmin.schedule.cancel')}</Button>
              <Button fullWidth icon={Plus} onClick={handleSave} loading={createMut.isPending}>{t('tenantAdmin.schedule.save')}</Button>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal — Atur Preset Shift (tenant-level) */}
      <PresetEditorModal
        isOpen={showPresetEditor}
        onClose={() => setShowPresetEditor(false)}
        initial={tenant?.shiftPresets || DEFAULT_PRESETS}
        onSave={async (next) => {
          try {
            await updateTenant.mutateAsync({ shiftPresets: next })
            toast.success('Preset shift disimpan.')
            setShowPresetEditor(false)
          } catch (err) {
            toast.error(err?.response?.data?.error || 'Gagal menyimpan preset.')
          }
        }}
        saving={updateTenant.isPending}
      />

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

// Wizard panduan saat minggu kosong. 4 langkah dengan status auto-detect.
function OnboardingPanel({
  hasBarber, hasWeeklyPattern, hasCustomPresets,
  onOpenPresets, onCopyLastWeek, onAddFirst, onDismiss, copyLoading,
}) {
  const steps = [
    {
      id: 'staff', icon: UserCircle, done: hasBarber,
      title: 'Tambahkan barber',
      desc: hasBarber ? 'Sudah ada barber aktif.' : 'Belum ada barber. Tambahkan dulu di Karyawan.',
      action: hasBarber ? null : { label: 'Kelola Karyawan', to: '/admin/users' },
    },
    {
      id: 'pattern', icon: CalendarClock, done: hasWeeklyPattern,
      title: 'Atur Pola Mingguan',
      desc: hasWeeklyPattern
        ? 'Pola jam kerja mingguan sudah terisi. Pola ini akan muncul sebagai chip "default" di kalender.'
        : 'Tentukan jam masuk/keluar default per hari. Pola ini jadi dasar perhitungan terlambat & chip default di kalender.',
      action: { label: hasWeeklyPattern ? 'Lihat Pola' : 'Atur Pola', to: '/admin/attendance?tab=jadwal' },
    },
    {
      id: 'preset', icon: Sliders, done: true, // selalu ada (default ada bawaan)
      title: hasCustomPresets ? 'Preset Shift sudah disesuaikan' : 'Preset Shift bawaan aktif',
      desc: hasCustomPresets
        ? 'Preset shift mengikuti pengaturan tenant.'
        : 'Pagi 08–14, Sore 14–22, Full 08–22. Bisa disesuaikan kalau jam buka toko berbeda.',
      action: { label: 'Atur Preset', onClick: onOpenPresets },
    },
    {
      id: 'add', icon: ListChecks, done: false,
      title: 'Tambah shift pertama',
      desc: 'Klik sel kalender kosong, atau pakai tombol di bawah. Bila ada chip bergaris putus-putus, klik untuk pakai jam pola mingguan.',
      action: hasBarber ? { label: 'Tambah Sekarang', onClick: onAddFirst, primary: true } : null,
    },
  ]

  const completedCount = steps.filter((s) => s.done).length

  return (
    <div className="rounded-2xl border border-gold/20 bg-gradient-to-b from-gold/[0.04] to-transparent p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-display text-lg sm:text-xl font-bold text-off-white">Panduan Cepat: Mulai Jadwal Shift</h3>
          <p className="text-xs text-muted mt-1">
            Minggu ini belum ada jadwal. Ikuti {steps.length} langkah ringkas berikut — kebanyakan sudah otomatis bila data dasar sudah ada.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[11px] text-muted hover:text-off-white whitespace-nowrap"
          title="Sembunyikan panduan minggu ini"
        >
          Sembunyikan
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-[11px] text-muted mb-1.5">
          <span>{completedCount} dari {steps.length} langkah siap</span>
          <span className="tabular-nums">{Math.round((completedCount / steps.length) * 100)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-dark-card overflow-hidden">
          <div
            className="h-full bg-gold transition-all"
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="space-y-2.5">
        {steps.map((step, i) => {
          const Icon = step.icon
          return (
            <div
              key={step.id}
              className={`flex items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                step.done
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : 'border-dark-border bg-dark-surface/40 hover:border-gold/30'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {step.done
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  : <Circle className="w-5 h-5 text-muted" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon className={`w-3.5 h-3.5 ${step.done ? 'text-emerald-400' : 'text-gold'}`} />
                  <p className="text-sm font-medium text-off-white">
                    <span className="text-muted mr-1">{i + 1}.</span>{step.title}
                  </p>
                </div>
                <p className="text-xs text-muted mt-1">{step.desc}</p>
              </div>
              {step.action && (
                <div className="shrink-0">
                  {step.action.to ? (
                    <Link
                      to={step.action.to}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        step.action.primary
                          ? 'bg-gold text-dark hover:bg-gold-light'
                          : 'border border-dark-border text-muted hover:text-gold hover:border-gold/40'
                      }`}
                    >
                      {step.action.label} <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={step.action.onClick}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        step.action.primary
                          ? 'bg-gold text-dark hover:bg-gold-light'
                          : 'border border-dark-border text-muted hover:text-gold hover:border-gold/40'
                      }`}
                    >
                      {step.action.label} <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Shortcut Copy Minggu Lalu — selalu ada di bawah */}
      <div className="mt-5 pt-5 border-t border-dark-border/60 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted">
          Sudah pernah atur sebelumnya?
        </p>
        <Button variant="secondary" size="sm" icon={Copy} onClick={onCopyLastWeek} loading={copyLoading}>
          Salin Minggu Lalu
        </Button>
      </div>
    </div>
  )
}

function PresetEditorModal({ isOpen, onClose, initial, onSave, saving }) {
  const { t } = useTranslation()
  // Salin state lokal — perubahan tidak menyentuh tenant sampai user tekan Simpan.
  const [rows, setRows] = useState([])
  useEffect(() => {
    if (!isOpen) return
    const src = Array.isArray(initial) && initial.length > 0 ? initial : DEFAULT_PRESETS
    setRows(src.map((p) => ({ value: p.value, startTime: p.startTime, endTime: p.endTime })))
  }, [isOpen, initial])

  const update = (i, patch) => setRows((arr) => arr.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const remove = (i) => setRows((arr) => arr.filter((_, idx) => idx !== i))
  const add = () => {
    if (rows.length >= 6) return
    setRows((arr) => [...arr, { value: `Shift ${arr.length + 1}`, startTime: '08:00', endTime: '17:00' }])
  }
  const reset = () => setRows(DEFAULT_PRESETS.map((p) => ({ ...p })))

  const validate = () => {
    if (rows.length === 0) return 'Minimal satu preset.'
    const seen = new Set()
    for (const r of rows) {
      const v = (r.value || '').trim()
      if (!v) return 'Label preset tidak boleh kosong.'
      if (v.length > 20) return `Label "${v}" terlalu panjang (maks 20 karakter).`
      const key = v.toLowerCase()
      if (seen.has(key)) return `Label "${v}" duplikat.`
      seen.add(key)
      if (!/^\d{2}:\d{2}$/.test(r.startTime) || !/^\d{2}:\d{2}$/.test(r.endTime)) return `Jam preset "${v}" tidak valid.`
      if (r.startTime >= r.endTime) return `Pada "${v}": jam selesai harus setelah jam mulai.`
    }
    return null
  }

  const handleSave = () => {
    const err = validate()
    if (err) return alert(err)
    onSave(rows.map((r) => ({ value: r.value.trim(), startTime: r.startTime, endTime: r.endTime })))
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Atur Preset Shift">
      <div className="space-y-4">
        <p className="text-xs text-muted">
          Preset memudahkan admin mengisi jam shift dengan satu klik. Tetap bisa ubah jam manual saat tambah jadwal.
          Maks 6 preset.
        </p>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input
                type="text" value={r.value}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder="Label (mis. Pagi)"
                className="col-span-5 bg-dark-surface border border-dark-border text-off-white rounded-lg px-3 py-2 text-sm outline-none focus:border-gold/60"
                maxLength={20}
              />
              <input
                type="time" value={r.startTime}
                onChange={(e) => update(i, { startTime: e.target.value })}
                className="col-span-3 bg-dark-surface border border-dark-border text-off-white rounded-lg px-2 py-2 text-sm outline-none focus:border-gold/60 tabular-nums"
              />
              <input
                type="time" value={r.endTime}
                onChange={(e) => update(i, { endTime: e.target.value })}
                className="col-span-3 bg-dark-surface border border-dark-border text-off-white rounded-lg px-2 py-2 text-sm outline-none focus:border-gold/60 tabular-nums"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="col-span-1 text-muted hover:text-red-400 inline-flex justify-center"
                aria-label={`Hapus preset ${r.value || i + 1}`}
                title="Hapus preset"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" icon={Plus} onClick={add} disabled={rows.length >= 6}>
            Tambah Preset
          </Button>
          <Button variant="ghost" size="sm" icon={RotateCcw} onClick={reset}>
            Reset Default
          </Button>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2 border-t border-dark-border">
          <Button variant="outline" fullWidth onClick={onClose} disabled={saving}>{t('tenantAdmin.schedule.cancel')}</Button>
          <Button fullWidth icon={Save} onClick={handleSave} loading={saving}>Simpan Preset</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function TASchedulePage() {
  return (
    <ErrorBoundary>
      <TASchedulePageInner />
    </ErrorBoundary>
  )
}
