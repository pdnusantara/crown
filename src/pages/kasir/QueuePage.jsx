import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Clock, ChevronRight, User, GripVertical, X as XIcon, ShoppingCart, Search, Users as UsersIcon, RefreshCw, AlertTriangle } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAuthStore } from '../../store/authStore.js'
import { usePosStore } from '../../store/posStore.js'
import { useBranchQueue, useAddToQueue, useUpdateQueueStatus, useDeleteQueueItem } from '../../hooks/useQueue.js'
import { useServices } from '../../hooks/useServices.js'
import { useUsers } from '../../hooks/useUsers.js'
import { useCustomers, useCreateCustomer } from '../../hooks/useCustomers.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import Badge, { getStatusBadge } from '../../components/ui/Badge.jsx'
import LiveBadge from '../../components/ui/LiveBadge.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { getBranchSlug } from '../../utils/branchSlug.js'

// label/short di-resolve via t() saat dipakai; di sini hanya kunci i18n + styling.
const COLUMNS = [
  { id: 'waiting', labelKey: 'queue.waiting', shortKey: 'queue.tabWaiting', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20', dot: 'bg-amber-400' },
  { id: 'in-progress', labelKey: 'queue.inProgressShort', shortKey: 'queue.tabInProgress', color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20', dot: 'bg-blue-400' },
  { id: 'done', labelKey: 'queue.done', shortKey: 'queue.done', color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20', dot: 'bg-green-400' },
  { id: 'paid', labelKey: 'queue.paid', shortKey: 'queue.paidShort', color: 'text-brand', bg: 'bg-brand/10', border: 'border-brand/20', dot: 'bg-brand' },
]

const STATUS_NEXT = { waiting: 'in-progress', 'in-progress': 'done', done: 'paid' }
const STATUS_BTN_KEY = { waiting: 'queue.start', 'in-progress': 'queue.finish', done: 'queue.toPos' }

// Kartu di kolom "Sudah Bayar" otomatis hilang dari kanban setelah X menit.
// Riwayat penuh tetap tersimpan & bisa dilihat di halaman Transaksi.
const PAID_VISIBLE_MINUTES = 30

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

function ElapsedTimer({ startedAt }) {
  const { t } = useTranslation()
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = new Date(startedAt).getTime()
    const update = () => setElapsed(Math.floor((Date.now() - start) / 60000))
    update()
    const id = setInterval(update, 30000)
    return () => clearInterval(id)
  }, [startedAt])
  return <span className="text-xs text-blue-300">{t('queue.elapsedMin', { n: elapsed })}</span>
}

function TicketCard({ item, col, onAdvance, onCancel, isDragging = false, compact = false }) {
  const { t } = useTranslation()
  const cancelable = item.status === 'waiting' || item.status === 'in-progress'
  const advanceLabel = STATUS_BTN_KEY[item.status] ? t(STATUS_BTN_KEY[item.status]) : null
  return (
    <div className={`bg-dark-card border border-dark-border rounded-xl ${compact ? 'p-3' : 'p-3.5 sm:p-3'} ${isDragging ? 'opacity-50 shadow-2xl' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm sm:text-xs font-bold ${col.color}`}>{item.ticketNumber}</span>
        <div className="flex items-center gap-1">
          <Badge variant={item.type === 'booking' ? 'info' : 'muted'} className="text-[11px] sm:text-xs">
            {item.type === 'booking' ? '📅' : '🚶'} {t(`queue.ticketType.${item.type}`, item.type)}
          </Badge>
          {cancelable && onCancel && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(item) }}
              title={t('queue.toast.cancelTooltip')}
              aria-label={t('queue.toast.cancelTooltip')}
              className="ml-0.5 inline-flex items-center justify-center w-8 h-8 sm:w-7 sm:h-7 rounded-lg text-muted hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/20 transition-colors"
            >
              <XIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>
      <p className="font-semibold text-off-white text-sm leading-tight truncate" title={item.customerName}>{item.customerName}</p>
      <p className="text-xs text-muted mt-0.5 line-clamp-2 break-words">{item.services?.join(', ')}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
        {item.staffName && (
          <div className="flex items-center gap-1">
            <User className="w-3 h-3 text-muted" />
            <span className="text-xs text-muted">{item.staffName}</span>
          </div>
        )}
        {item.status === 'waiting' && (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-400" />
            <span className="text-xs text-amber-400">{item.waitTime > 0 ? t('queue.estimateMin', { n: item.waitTime }) : t('queue.soon')}</span>
          </div>
        )}
        {item.status === 'in-progress' && item.updatedAt && (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-blue-400" />
            <ElapsedTimer startedAt={item.updatedAt} />
          </div>
        )}
      </div>
      {advanceLabel && (
        <button
          onClick={() => onAdvance(item)}
          className={`mt-2.5 w-full py-2.5 sm:py-1.5 rounded-lg text-sm sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] ${
            item.status === 'done'
              ? 'bg-brand/15 text-brand border border-brand/40 hover:bg-brand/25'
              : `${col.bg} ${col.color} border ${col.border} hover:opacity-80`
          }`}
        >
          {item.status === 'done'
            ? <><ShoppingCart className="w-4 h-4 sm:w-3 sm:h-3" /> {advanceLabel}</>
            : <>{advanceLabel} <ChevronRight className="w-4 h-4 sm:w-3 sm:h-3" /></>
          }
        </button>
      )}
    </div>
  )
}

function SortableTicketCard({ item, col, onAdvance, onCancel }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div className="relative">
        <div
          {...attributes}
          {...listeners}
          className="absolute top-2 left-2 z-10 cursor-grab active:cursor-grabbing text-muted hover:text-off-white touch-none"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="pl-6">
          <TicketCard item={item} col={col} onAdvance={onAdvance} onCancel={onCancel} />
        </div>
      </div>
    </div>
  )
}

function DroppableColumn({ col, items, onAdvance, onCancel, isMobile, hideHeader = false }) {
  const { t } = useTranslation()
  return (
    <div
      className={`rounded-2xl border ${col.border} ${col.bg} p-3 ${isMobile ? '' : 'min-h-[400px]'} transition-all`}
    >
      {!hideHeader && (
        <div className="flex items-center justify-between mb-3">
          <h3 className={`font-semibold text-sm ${col.color}`}>{t(col.labelKey)}</h3>
          <span className={`min-w-6 h-6 px-2 rounded-full flex items-center justify-center text-xs font-bold ${col.bg} ${col.color} border ${col.border}`}>
            {items.length}
          </span>
        </div>
      )}
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          <AnimatePresence>
            {items.map(item => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                {isMobile ? (
                  <TicketCard item={item} col={col} onAdvance={onAdvance} onCancel={onCancel} />
                ) : (
                  <SortableTicketCard item={item} col={col} onAdvance={onAdvance} onCancel={onCancel} />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {items.length === 0 && (
            <div className={`text-center py-8 ${col.color} opacity-30`}>
              <p className="text-xs">{t('queue.empty')}</p>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

function MobileStatusTabs({ active, onChange, counts }) {
  const { t } = useTranslation()
  return (
    <div className="sticky top-0 z-20 -mx-4 px-4 pb-2 pt-1 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
      <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {COLUMNS.map(col => {
          const isActive = active === col.id
          const count = counts[col.id] || 0
          return (
            <button
              key={col.id}
              onClick={() => onChange(col.id)}
              className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                isActive
                  ? `${col.bg} ${col.color} border ${col.border}`
                  : 'text-muted border border-transparent hover:text-off-white'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
              {t(col.shortKey)}
              <span className={`ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                isActive ? `${col.bg} ${col.color}` : 'bg-dark-card text-muted'
              }`}>{count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function QueuePage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const { queue = [], isLoading, isError, refetch } = useBranchQueue(user?.branchId)
  const addToQueueM = useAddToQueue()
  const updateStatusM = useUpdateQueueStatus()
  const deleteQueueM = useDeleteQueueItem()
  const toast = useToast()
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ customerId: null, customerName: '', phone: '', serviceIds: [], barberId: '' })
  // Pencarian pelanggan (link ke loyalti). custSearch = teks di kotak; bila kasir
  // tak memilih dari daftar, teks dipakai sebagai nama pelanggan baru (customerId null).
  const [custSearch, setCustSearch] = useState('')
  const [custSearchDeb, setCustSearchDeb] = useState('')
  const [selectedCust, setSelectedCust] = useState(null)
  const [serviceQuery, setServiceQuery] = useState('')
  const [showSvcPicker, setShowSvcPicker] = useState(false)
  const [showBarberPicker, setShowBarberPicker] = useState(false)
  const [activeItem, setActiveItem] = useState(null)
  const [mobileTab, setMobileTab] = useState('waiting')
  const [cancelTarget, setCancelTarget] = useState(null)
  const [search, setSearch] = useState('')
  const [filterBarber, setFilterBarber] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const { data: services = [] } = useServices({ isActive: 'true' })
  const { data: barbers = [] } = useUsers({ role: 'barber', branchId: user?.branchId })

  // Debounce pencarian pelanggan (250ms) → filter server-side.
  useEffect(() => {
    const id = setTimeout(() => setCustSearchDeb(custSearch.trim()), 250)
    return () => clearTimeout(id)
  }, [custSearch])

  // Cari pelanggan hanya saat modal terbuka, ada teks, & belum memilih.
  // NB: useCustomers mengembalikan `customers` sebagai array (lihat hook); JANGAN
  // pakai `data?.data` — `data` sudah array, akan selalu undefined/kosong.
  const { customers: custResults = [], isFetching: custFetching } = useCustomers({
    page: 1, limit: 8,
    enabled: showModal && custSearchDeb.length >= 1 && !form.customerId,
    ...(custSearchDeb ? { search: custSearchDeb } : {}),
  })
  const createCustomerM = useCreateCustomer()

  // Durasi layanan per nama — untuk estimasi tunggu posisi-aware.
  const serviceDurByName = useMemo(() => {
    const m = new Map()
    services.forEach(s => m.set(s.name, s.duration))
    return m
  }, [services])

  const selectedServices = useMemo(
    () => services.filter(s => form.serviceIds.includes(s.id)),
    [services, form.serviceIds]
  )
  const selectedTotalDur = selectedServices.reduce((a, s) => a + (s.duration || 0), 0)
  const selectedBarber = barbers.find(b => b.id === form.barberId) || null
  const filteredServices = useMemo(() => {
    const q = serviceQuery.trim().toLowerCase()
    return q ? services.filter(s => s.name.toLowerCase().includes(q)) : services
  }, [services, serviceQuery])

  const resetForm = () => {
    setForm({ customerId: null, customerName: '', phone: '', serviceIds: [], barberId: '' })
    setCustSearch(''); setCustSearchDeb(''); setSelectedCust(null); setServiceQuery(''); setShowSvcPicker(false); setShowBarberPicker(false)
  }
  const pickCustomer = (c) => {
    setForm(f => ({ ...f, customerId: c.id, customerName: c.name, phone: c.phone || '' }))
    setSelectedCust(c); setCustSearch(c.name)
  }
  const onCustSearchChange = (v) => {
    setCustSearch(v)
    // Mengetik = anggap pelanggan baru/tak-tertaut sampai dipilih dari daftar.
    setForm(f => ({ ...f, customerId: null, customerName: v }))
    setSelectedCust(null)
  }
  const toggleService = (id) => setForm(f => ({
    ...f,
    serviceIds: f.serviceIds.includes(id) ? f.serviceIds.filter(x => x !== id) : [...f.serviceIds, id],
  }))
  // Tambah pelanggan baru (tersimpan utk loyalti) lalu langsung tertaut ke antrean.
  const handleCreateNewCustomer = async () => {
    const name = custSearch.trim()
    if (!name) return toast.error(t('queue.toast.nameRequired'))
    try {
      const created = await createCustomerM.mutateAsync({ name, phone: form.phone || undefined })
      if (created?.id) pickCustomer(created)
      toast.success(t('queue.customerAdded', { name }))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('queue.customerAddFailed'))
    }
  }

  // Tick setiap 60 detik supaya filter "Sudah Bayar > 30 menit" otomatis recompute
  // tanpa perlu user me-refresh halaman.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // Apply search & barber filter sebelum bagi per status
  const branchQueue = useMemo(() => {
    const s = search.trim().toLowerCase()
    const filtered = queue.filter(q => {
      if (filterBarber && q.staffId !== filterBarber) return false
      if (!s) return true
      return (
        (q.customerName || '').toLowerCase().includes(s) ||
        (q.ticketNumber || '').toLowerCase().includes(s) ||
        (q.services || []).join(' ').toLowerCase().includes(s)
      )
    })
    // Estimasi tunggu posisi-aware: pelanggan menunggu giliran berdasarkan total
    // durasi antrean di depannya dibagi jumlah barber (paralel). Gantikan angka
    // statik 15 menit. Urutan `queue` sudah by queueNumber dari backend.
    const cap = Math.max(barbers.length, 1)
    let acc = 0
    const estMap = {}
    filtered.filter(q => q.status === 'waiting').forEach(q => {
      estMap[q.id] = Math.round(acc / cap)
      const dur = (q.services || []).reduce((su, n) => su + (serviceDurByName.get(n) || 30), 0) || 30
      acc += dur
    })
    return filtered.map(q => q.status === 'waiting' ? { ...q, waitTime: estMap[q.id] ?? q.waitTime } : q)
  }, [queue, search, filterBarber, barbers.length, serviceDurByName])

  const getByStatus = (status) => {
    const items = branchQueue.filter(q => q.status === status)
    if (status !== 'paid') return items
    const cutoff = Date.now() - PAID_VISIBLE_MINUTES * 60_000
    return items.filter(q => {
      const t = new Date(q.updatedAt || q.createdAt).getTime()
      return Number.isFinite(t) ? t >= cutoff : true
    })
  }

  const handleAddWalkIn = async () => {
    const name = (form.customerId ? form.customerName : custSearch.trim())
    if (!name) return toast.error(t('queue.toast.nameRequired'))
    const barber = barbers.find(b => b.id === form.barberId)
    const svcNames = selectedServices.length ? selectedServices.map(s => s.name) : [t('queue.defaultService')]
    try {
      await addToQueueM.mutateAsync({
        tenantId: user.tenantId,
        branchId: user.branchId,
        customerId: form.customerId || undefined, // tertaut loyalti bila pelanggan dipilih
        customerName: name,
        phone: form.phone,
        services: svcNames,
        staffId: form.barberId || null,
        staffName: barber?.name || null,
        type: 'walk-in',
        // Simpan total durasi sebagai estimasi awal (display dihitung ulang posisi-aware).
        waitTime: selectedTotalDur || undefined,
      })
      toast.success(t('queue.toast.created', { name }))
      setShowModal(false)
      resetForm()
    } catch (err) {
      toast.error(err?.response?.data?.error || t('queue.toast.createFailed'))
    }
  }

  const advanceTo = async (item, next) => {
    try {
      await updateStatusM.mutateAsync({
        id: item.id,
        branchId: user.branchId,
        status: next,
      })
      const col = COLUMNS.find(c => c.id === next)
      toast.success(t('queue.toast.statusChanged', { label: col?.labelKey ? t(col.labelKey) : next }))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('queue.toast.statusFailed'))
    }
  }

  const handleAdvance = (item) => {
    // "done → paid" step goes through POS instead of direct status change
    if (item.status === 'done') {
      usePosStore.getState().loadFromQueue(item, services)
      navigate(`/${getBranchSlug(user)}/kasir/pos?queueId=${item.id}`)
      return
    }
    const next = STATUS_NEXT[item.status]
    if (next) advanceTo(item, next)
  }

  const handleCancel = (item) => {
    setCancelTarget(item)
  }

  const confirmCancel = async () => {
    if (!cancelTarget) return
    try {
      await deleteQueueM.mutateAsync({ id: cancelTarget.id, branchId: user.branchId })
      toast.success(t('queue.toast.cancelled', { name: cancelTarget.customerName }))
    } catch (err) {
      toast.error(err?.response?.data?.error || t('queue.toast.cancelFailed'))
    }
  }

  const handleDragStart = (event) => {
    const item = branchQueue.find(q => q.id === event.active.id)
    setActiveItem(item)
  }

  const handleDragEnd = (event) => {
    const { active, over } = event
    setActiveItem(null)
    if (!over) return

    const targetColumnId = COLUMNS.find(c => c.id === over.id)?.id
      || branchQueue.find(q => q.id === over.id)?.status

    if (!targetColumnId || active.id === over.id) return
    const draggedItem = branchQueue.find(q => q.id === active.id)
    if (!draggedItem || draggedItem.status === targetColumnId) return

    // Hanya boleh MAJU satu langkah berurutan (menunggu→dilayani→selesai→bayar).
    // Lompatan/mundur ditolak agar tiket tak bisa ditandai "Sudah Bayar" tanpa
    // melewati kasir (tanpa transaksi/struk/omzet).
    if (targetColumnId !== STATUS_NEXT[draggedItem.status]) {
      toast.error(t('queue.advanceOneStep'))
      return
    }
    // "Selesai → Sudah Bayar" WAJIB lewat POS supaya transaksi tercatat.
    if (targetColumnId === 'paid') {
      usePosStore.getState().loadFromQueue(draggedItem, services)
      navigate(`/${getBranchSlug(user)}/kasir/pos?queueId=${draggedItem.id}`)
      return
    }
    advanceTo(draggedItem, targetColumnId)
  }

  // `tick` di deps → hitungan "Sudah Bayar >30 menit" ikut menyusut tiap menit
  // tanpa menunggu mutasi antrian.
  const counts = useMemo(() => ({
    waiting: getByStatus('waiting').length,
    'in-progress': getByStatus('in-progress').length,
    done: getByStatus('done').length,
    paid: getByStatus('paid').length,
  }), [branchQueue, tick])

  const activeCol = COLUMNS.find(c => c.id === mobileTab) || COLUMNS[0]
  const activeItems = getByStatus(mobileTab)

  const activeFilters = (search ? 1 : 0) + (filterBarber ? 1 : 0)

  return (
    <div className="space-y-3 sm:space-y-4 pb-20 sm:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white">{t('queue.title')}</h1>
            <LiveBadge />
          </div>
          <p className="text-muted text-xs sm:text-sm mt-1">
            {t('queue.summary', { inProgress: counts['in-progress'], waiting: counts.waiting })}
          </p>
        </div>
        <div className="hidden sm:block">
          <Button icon={Plus} onClick={() => setShowModal(true)}>{t('queue.walkIn')}</Button>
        </div>
      </div>

      {/* Search + Filter Barber */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('queue.searchPlaceholder')}
            className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-10 pr-9 py-2.5 text-sm outline-none focus:border-brand/60 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label={t('queue.clearSearch')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-md text-muted hover:text-off-white hover:bg-dark-card transition-colors"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {barbers.length > 0 && (
          <div className="relative sm:w-56">
            <UsersIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
            <select
              value={filterBarber}
              onChange={e => setFilterBarber(e.target.value)}
              className="w-full appearance-none bg-dark-surface border border-dark-border text-off-white rounded-xl pl-9 pr-8 py-2.5 text-sm outline-none focus:border-brand/60 cursor-pointer"
            >
              <option value="">{t('queue.allBarbers')}</option>
              {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <ChevronRight className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted rotate-90 pointer-events-none" />
          </div>
        )}
        {activeFilters > 0 && (
          <button
            onClick={() => { setSearch(''); setFilterBarber('') }}
            className="px-3 py-2.5 rounded-xl text-xs font-semibold text-muted hover:text-off-white hover:bg-dark-card transition-colors whitespace-nowrap"
          >
            {t('queue.resetCount', { count: activeFilters })}
          </button>
        )}
      </div>

      {isError && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-red-400/30 bg-red-400/5">
          <p className="text-sm text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {t('queue.loadError')}
          </p>
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => refetch()}>{t('queue.retry')}</Button>
        </div>
      )}

      {isLoading && queue.length === 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[...Array(isMobile ? 1 : 4)].map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-dark-card animate-pulse" />
          ))}
        </div>
      ) : isMobile ? (
        <>
          <MobileStatusTabs active={mobileTab} onChange={setMobileTab} counts={counts} />
          <DroppableColumn
            col={activeCol}
            items={activeItems}
            onAdvance={handleAdvance}
            onCancel={handleCancel}
            isMobile
            hideHeader
          />
        </>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {COLUMNS.map(col => (
              <DroppableColumn
                key={col.id}
                col={col}
                items={getByStatus(col.id)}
                onAdvance={handleAdvance}
                onCancel={handleCancel}
                isMobile={false}
              />
            ))}
          </div>

          <DragOverlay>
            {activeItem ? (
              <div className="opacity-90 rotate-2 scale-105">
                <TicketCard
                  item={activeItem}
                  col={COLUMNS.find(c => c.id === activeItem.status) || COLUMNS[0]}
                  onAdvance={() => {}}
                  isDragging={true}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Floating Walk-in (mobile) */}
      {isMobile && (
        <button
          onClick={() => setShowModal(true)}
          aria-label={t('queue.addWalkInModal')}
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 h-14 w-14 rounded-full bg-brand text-dark-bg shadow-2xl shadow-brand/30 flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
      )}

      {/* Walk-in Modal */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm() }} title={t('queue.addWalkInModal')}>
        <div className="space-y-4">
          {/* Pelanggan: cari yg sudah ada (tertaut loyalti) atau ketik nama baru */}
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">{t('queue.customerName')}</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
              <input
                value={custSearch}
                onChange={e => onCustSearchChange(e.target.value)}
                placeholder={t('queue.customerSearchPlaceholder')}
                className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-9 pr-9 py-2.5 text-sm outline-none focus:border-brand/60"
              />
              {custSearch && (
                <button onClick={() => { setCustSearch(''); setForm(f => ({ ...f, customerId: null, customerName: '' })); setSelectedCust(null) }}
                  aria-label={t('common.remove')} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-md text-muted hover:text-off-white hover:bg-dark-card">
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Hint loyalti saat pelanggan tertaut dipilih */}
            {selectedCust && form.customerId && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-brand/10 border border-brand/25">
                <User className="w-4 h-4 text-brand flex-shrink-0" />
                <span className="text-xs text-off-white font-medium truncate">{selectedCust.name}</span>
                <span className="text-xs text-muted">·</span>
                <span className="text-xs text-amber-300 whitespace-nowrap">⭐ {t('queue.pointsLabel', { count: selectedCust.loyaltyPoints || 0 })}</span>
                <span className="text-xs text-muted whitespace-nowrap">· {t('queue.visitsLabel', { count: selectedCust.visitCount || 0 })}</span>
              </div>
            )}

            {/* Daftar hasil pencarian + tombol tambah baru */}
            {!form.customerId && custSearchDeb.length >= 1 && (
              <div className="mt-1.5 rounded-xl border border-dark-border overflow-hidden">
                <div className="max-h-40 overflow-y-auto divide-y divide-dark-border">
                  {custFetching && custResults.length === 0 && (
                    <p className="px-3 py-2.5 text-xs text-muted">{t('queue.searching')}</p>
                  )}
                  {!custFetching && custResults.length === 0 && (
                    <p className="px-3 py-2.5 text-xs text-muted">{t('queue.noCustomerMatch')}</p>
                  )}
                  {custResults.map(c => (
                    <button key={c.id} onClick={() => pickCustomer(c)} type="button"
                      className="w-full text-left px-3 py-2.5 hover:bg-dark-card transition-colors flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block text-sm text-off-white truncate">{c.name}</span>
                        {c.phone && <span className="block text-xs text-muted truncate">{c.phone}</span>}
                      </span>
                      <span className="text-xs text-amber-300 whitespace-nowrap flex-shrink-0">⭐ {c.loyaltyPoints || 0}</span>
                    </button>
                  ))}
                </div>
                {/* Tambah pelanggan baru — tersimpan utk loyalti */}
                <button onClick={handleCreateNewCustomer} type="button" disabled={createCustomerM.isPending}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-brand bg-brand/5 hover:bg-brand/10 border-t border-dark-border transition-colors disabled:opacity-60">
                  <Plus className="w-4 h-4 flex-shrink-0" />
                  {createCustomerM.isPending ? t('queue.saving') : t('queue.addAsNewCustomer', { name: custSearch.trim() })}
                </button>
              </div>
            )}
          </div>

          <Input label={t('queue.phoneOptional')} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="081234567890" />

          <div>
            <label className="block text-sm font-medium text-muted mb-2">{t('queue.service')}</label>
            {services.length === 0 ? (
              <p className="text-xs text-muted">{t('queue.noServices')}</p>
            ) : (
              <>
                {/* Pemicu dropdown — modal tetap pendek */}
                <button type="button" onClick={() => setShowSvcPicker(v => !v)}
                  className="w-full flex items-center justify-between gap-2 px-4 min-h-[48px] py-2.5 rounded-xl border border-dark-border bg-dark-surface text-left transition-colors hover:border-brand/40">
                  <span className={`text-sm ${form.serviceIds.length ? 'text-off-white font-medium' : 'text-muted'}`}>
                    {form.serviceIds.length ? t('queue.servicesSelected', { count: form.serviceIds.length, minutes: selectedTotalDur }) : t('queue.selectService')}
                  </span>
                  <ChevronRight className={`w-4 h-4 text-muted flex-shrink-0 transition-transform ${showSvcPicker ? 'rotate-90' : ''}`} />
                </button>

                {/* Chip layanan terpilih (selalu terlihat) */}
                {selectedServices.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedServices.map(s => (
                      <span key={s.id} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg bg-brand/15 text-brand text-xs font-medium">
                        {s.name}
                        <button type="button" onClick={() => toggleService(s.id)} aria-label={t('queue.removeService', { name: s.name })}
                          className="w-5 h-5 inline-flex items-center justify-center rounded hover:bg-brand/20">
                          <XIcon className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Panel pilihan — hanya saat dibuka */}
                {showSvcPicker && (
                  <div className="mt-2 rounded-xl border border-dark-border overflow-hidden">
                    {services.length > 6 && (
                      <div className="relative p-2 border-b border-dark-border">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                        <input autoFocus value={serviceQuery} onChange={e => setServiceQuery(e.target.value)}
                          placeholder={t('queue.searchServicePlaceholder')}
                          className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-brand/60" />
                      </div>
                    )}
                    <div className="max-h-[34vh] overflow-y-auto p-2 space-y-1.5">
                      {filteredServices.length === 0 && (
                        <p className="text-xs text-muted py-2 px-1">{t('queue.noServicesFound')}</p>
                      )}
                      {filteredServices.map(s => {
                        const checked = form.serviceIds.includes(s.id)
                        return (
                          <button key={s.id} onClick={() => toggleService(s.id)} type="button"
                            className={`w-full flex items-center justify-between gap-3 px-3 min-h-[44px] py-2 rounded-lg border text-left transition-all active:scale-[0.99] ${
                              checked ? 'bg-brand/15 border-brand' : 'bg-dark-surface border-dark-border'
                            }`}>
                            <span className="min-w-0">
                              <span className={`block text-sm font-medium truncate ${checked ? 'text-brand' : 'text-off-white'}`}>{s.name}</span>
                              <span className="block text-xs text-muted">{t('queue.minutesValue', { n: s.duration })}</span>
                            </span>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border ${checked ? 'bg-brand border-brand' : 'border-dark-border'}`}>
                              {checked && <span className="text-dark-bg text-xs font-bold leading-none">✓</span>}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    <button type="button" onClick={() => setShowSvcPicker(false)}
                      className="w-full py-2.5 text-sm font-semibold text-brand bg-brand/5 hover:bg-brand/10 border-t border-dark-border transition-colors">
                      {t('queue.done')}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-2">{t('queue.barberOptional')}</label>
            {barbers.length === 0 ? (
              <p className="text-xs text-muted">{t('queue.noBarbersBranch')}</p>
            ) : (
              <>
                {/* Pemicu dropdown — konsisten dgn Layanan */}
                <button type="button" onClick={() => setShowBarberPicker(v => !v)}
                  className="w-full flex items-center justify-between gap-2 px-4 min-h-[48px] py-2.5 rounded-xl border border-dark-border bg-dark-surface text-left transition-colors hover:border-brand/40">
                  <span className="flex items-center gap-2.5 min-w-0">
                    <User className={`w-4 h-4 flex-shrink-0 ${form.barberId ? 'text-brand' : 'text-muted'}`} />
                    <span className={`text-sm truncate ${form.barberId ? 'text-off-white font-medium' : 'text-muted'}`}>
                      {selectedBarber ? selectedBarber.name : t('queue.selectBarber')}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 flex-shrink-0">
                    {form.barberId && (
                      <button type="button" aria-label={t('queue.removeBarber')}
                        onClick={(e) => { e.stopPropagation(); setForm(f => ({ ...f, barberId: '' })) }}
                        className="w-6 h-6 inline-flex items-center justify-center rounded text-muted hover:text-off-white hover:bg-dark-card">
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <ChevronRight className={`w-4 h-4 text-muted transition-transform ${showBarberPicker ? 'rotate-90' : ''}`} />
                  </span>
                </button>

                {/* Panel pilihan — hanya saat dibuka; pilih = tutup (single) */}
                {showBarberPicker && (
                  <div className="mt-2 rounded-xl border border-dark-border overflow-hidden">
                    <div className="max-h-[34vh] overflow-y-auto p-2 space-y-1.5">
                      {barbers.map(b => {
                        const sel = form.barberId === b.id
                        return (
                          <button key={b.id} type="button"
                            onClick={() => { setForm(f => ({ ...f, barberId: f.barberId === b.id ? '' : b.id })); setShowBarberPicker(false) }}
                            className={`w-full flex items-center justify-between gap-3 px-3 min-h-[44px] py-2 rounded-lg border text-left transition-all active:scale-[0.99] ${
                              sel ? 'bg-brand/15 border-brand' : 'bg-dark-surface border-dark-border'
                            }`}>
                            <span className="flex items-center gap-2.5 min-w-0">
                              <User className={`w-4 h-4 flex-shrink-0 ${sel ? 'text-brand' : 'text-muted'}`} />
                              <span className={`text-sm font-medium truncate ${sel ? 'text-brand' : 'text-off-white'}`}>{b.name}</span>
                            </span>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border ${sel ? 'bg-brand border-brand' : 'border-dark-border'}`}>
                              {sel && <span className="text-dark-bg text-xs font-bold leading-none">✓</span>}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" fullWidth onClick={() => { setShowModal(false); resetForm() }} disabled={addToQueueM.isPending}>{t('common.cancel')}</Button>
            <Button fullWidth onClick={handleAddWalkIn} loading={addToQueueM.isPending} disabled={addToQueueM.isPending}>{t('queue.addToQueue')}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
        variant="danger"
        title={t('queue.cancelTitle')}
        description={cancelTarget ? t('queue.cancelDesc', { ticket: cancelTarget.ticketNumber }) : ''}
        highlight={cancelTarget?.customerName}
        confirmText={t('queue.confirmCancel')}
        cancelText={t('queue.confirmKeep')}
      />
    </div>
  )
}
