import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Clock, ChevronRight, User, GripVertical, X as XIcon, ShoppingCart, Search, Users as UsersIcon } from 'lucide-react'
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
import { useToast } from '../../components/ui/Toast.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import Badge, { getStatusBadge } from '../../components/ui/Badge.jsx'
import LiveBadge from '../../components/ui/LiveBadge.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { getBranchSlug } from '../../utils/branchSlug.js'

const COLUMNS = [
  { id: 'waiting', label: 'Menunggu', short: 'Antri', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20', dot: 'bg-amber-400' },
  { id: 'in-progress', label: 'Sedang Dilayani', short: 'Dilayani', color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20', dot: 'bg-blue-400' },
  { id: 'done', label: 'Selesai', short: 'Selesai', color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20', dot: 'bg-green-400' },
  { id: 'paid', label: 'Sudah Bayar', short: 'Bayar', color: 'text-gold', bg: 'bg-gold/10', border: 'border-gold/20', dot: 'bg-gold' },
]

const STATUS_NEXT = { waiting: 'in-progress', 'in-progress': 'done', done: 'paid' }
const STATUS_BTN  = { waiting: 'Mulai', 'in-progress': 'Selesai', done: 'Ke Kasir' }

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
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = new Date(startedAt).getTime()
    const update = () => setElapsed(Math.floor((Date.now() - start) / 60000))
    update()
    const id = setInterval(update, 30000)
    return () => clearInterval(id)
  }, [startedAt])
  return <span className="text-xs text-blue-300">{elapsed} menit</span>
}

function TicketCard({ item, col, onAdvance, onCancel, isDragging = false, compact = false }) {
  const cancelable = item.status === 'waiting' || item.status === 'in-progress'
  return (
    <div className={`bg-dark-card border border-dark-border rounded-xl ${compact ? 'p-3' : 'p-3.5 sm:p-3'} ${isDragging ? 'opacity-50 shadow-2xl' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm sm:text-xs font-bold ${col.color}`}>{item.ticketNumber}</span>
        <div className="flex items-center gap-1">
          <Badge variant={item.type === 'booking' ? 'info' : 'muted'} className="text-[11px] sm:text-xs">
            {item.type === 'booking' ? '📅' : '🚶'} {item.type}
          </Badge>
          {cancelable && onCancel && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(item) }}
              title="Batalkan antrian"
              aria-label="Batalkan antrian"
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
            <span className="text-xs text-amber-400">~{item.waitTime} min</span>
          </div>
        )}
        {item.status === 'in-progress' && item.updatedAt && (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-blue-400" />
            <ElapsedTimer startedAt={item.updatedAt} />
          </div>
        )}
      </div>
      {STATUS_BTN[item.status] && (
        <button
          onClick={() => onAdvance(item)}
          className={`mt-2.5 w-full py-2.5 sm:py-1.5 rounded-lg text-sm sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] ${
            item.status === 'done'
              ? 'bg-gold/15 text-gold border border-gold/40 hover:bg-gold/25'
              : `${col.bg} ${col.color} border ${col.border} hover:opacity-80`
          }`}
        >
          {item.status === 'done'
            ? <><ShoppingCart className="w-4 h-4 sm:w-3 sm:h-3" /> {STATUS_BTN[item.status]}</>
            : <>{STATUS_BTN[item.status]} <ChevronRight className="w-4 h-4 sm:w-3 sm:h-3" /></>
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
  return (
    <div
      className={`rounded-2xl border ${col.border} ${col.bg} p-3 ${isMobile ? '' : 'min-h-[400px]'} transition-all`}
    >
      {!hideHeader && (
        <div className="flex items-center justify-between mb-3">
          <h3 className={`font-semibold text-sm ${col.color}`}>{col.label}</h3>
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
              <p className="text-xs">Kosong</p>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

function MobileStatusTabs({ active, onChange, counts }) {
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
              {col.short}
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
  const { queue = [] } = useBranchQueue(user?.branchId)
  const addToQueueM = useAddToQueue()
  const updateStatusM = useUpdateQueueStatus()
  const deleteQueueM = useDeleteQueueItem()
  const toast = useToast()
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ customerName: '', phone: '', services: '', barberId: '' })
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

  // Tick setiap 60 detik supaya filter "Sudah Bayar > 30 menit" otomatis recompute
  // tanpa perlu user me-refresh halaman.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  // Apply search & barber filter sebelum bagi per status
  const branchQueue = useMemo(() => {
    const s = search.trim().toLowerCase()
    return queue.filter(q => {
      if (filterBarber && q.staffId !== filterBarber) return false
      if (!s) return true
      return (
        (q.customerName || '').toLowerCase().includes(s) ||
        (q.ticketNumber || '').toLowerCase().includes(s) ||
        (q.services || []).join(' ').toLowerCase().includes(s)
      )
    })
  }, [queue, search, filterBarber])

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
    if (!form.customerName) return toast.error(t('queue.toast.nameRequired'))
    const barber = barbers.find(b => b.id === form.barberId)
    try {
      await addToQueueM.mutateAsync({
        tenantId: user.tenantId,
        branchId: user.branchId,
        customerName: form.customerName,
        phone: form.phone,
        services: form.services ? [form.services] : ['Potong Reguler'],
        staffId: form.barberId || null,
        staffName: barber?.name || null,
        type: 'walk-in',
      })
      toast.success(t('queue.toast.created', { name: form.customerName }))
      setShowModal(false)
      setForm({ customerName: '', phone: '', services: '', barberId: '' })
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
      toast.success(t('queue.toast.statusChanged', { label: col?.label || next }))
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
      toast.error('Pindahkan antrian satu langkah berurutan')
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

  const counts = useMemo(() => ({
    waiting: getByStatus('waiting').length,
    'in-progress': getByStatus('in-progress').length,
    done: getByStatus('done').length,
    paid: getByStatus('paid').length,
  }), [branchQueue])

  const activeCol = COLUMNS.find(c => c.id === mobileTab) || COLUMNS[0]
  const activeItems = getByStatus(mobileTab)

  const activeFilters = (search ? 1 : 0) + (filterBarber ? 1 : 0)

  return (
    <div className="space-y-3 sm:space-y-4 pb-20 sm:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white">Antrian</h1>
            <LiveBadge />
          </div>
          <p className="text-muted text-xs sm:text-sm mt-1">
            {counts.waiting} menunggu · {counts['in-progress']} dilayani
          </p>
        </div>
        <div className="hidden sm:block">
          <Button icon={Plus} onClick={() => setShowModal(true)}>Walk-in</Button>
        </div>
      </div>

      {/* Search + Filter Barber */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama, tiket, atau layanan…"
            className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl pl-10 pr-9 py-2.5 text-sm outline-none focus:border-gold/60 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Hapus pencarian"
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
              className="w-full appearance-none bg-dark-surface border border-dark-border text-off-white rounded-xl pl-9 pr-8 py-2.5 text-sm outline-none focus:border-gold/60 cursor-pointer"
            >
              <option value="">Semua barber</option>
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
            Reset ({activeFilters})
          </button>
        )}
      </div>

      {isMobile ? (
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
          aria-label="Tambah Walk-in"
          className="fixed bottom-20 right-4 z-30 h-14 w-14 rounded-full bg-gold text-dark-bg shadow-2xl shadow-gold/30 flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
      )}

      {/* Walk-in Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Tambah Walk-in">
        <div className="space-y-4">
          <Input label="Nama Pelanggan" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} placeholder="Nama pelanggan" />
          <Input label="Telepon (opsional)" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="081234567890" />
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">Layanan</label>
            <select value={form.services} onChange={e => setForm(f => ({ ...f, services: e.target.value }))} className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60">
              <option value="">Pilih layanan...</option>
              {services.map(s => <option key={s.id} value={s.name}>{s.name} — {s.duration} min</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-1.5">Barber (opsional)</label>
            <select value={form.barberId} onChange={e => setForm(f => ({ ...f, barberId: e.target.value }))} className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gold/60">
              <option value="">Pilih barber...</option>
              {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" fullWidth onClick={() => setShowModal(false)}>Batal</Button>
            <Button fullWidth onClick={handleAddWalkIn}>Tambah Antrian</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
        variant="danger"
        title="Batalkan antrian?"
        description={cancelTarget ? `Tiket ${cancelTarget.ticketNumber} akan dibatalkan dan tidak bisa dikembalikan.` : ''}
        highlight={cancelTarget?.customerName}
        confirmText="Ya, Batalkan"
        cancelText="Tidak, Kembali"
      />
    </div>
  )
}
