import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Clock, ChevronRight, User, GripVertical, X as XIcon } from 'lucide-react'
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
import { useTenantStore } from '../../store/tenantStore.js'
import { useBranchQueue, useAddToQueue, useUpdateQueueStatus, useDeleteQueueItem } from '../../hooks/useQueue.js'
import { useToast } from '../../components/ui/Toast.jsx'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import Badge, { getStatusBadge } from '../../components/ui/Badge.jsx'
import LiveBadge from '../../components/ui/LiveBadge.jsx'

const COLUMNS = [
  { id: 'waiting', label: 'Menunggu', color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20' },
  { id: 'in-progress', label: 'Sedang Dilayani', color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
  { id: 'done', label: 'Selesai', color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20' },
  { id: 'paid', label: 'Sudah Bayar', color: 'text-gold', bg: 'bg-gold/10', border: 'border-gold/20' },
]

const STATUS_NEXT = { waiting: 'in-progress', 'in-progress': 'done', done: 'paid' }
const STATUS_BTN = { waiting: 'Mulai', 'in-progress': 'Selesai', done: 'Bayar' }

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

function TicketCard({ item, col, onAdvance, onCancel, isDragging = false }) {
  const cancelable = item.status === 'waiting' || item.status === 'in-progress'
  return (
    <div className={`bg-dark-card border border-dark-border rounded-xl p-3 ${isDragging ? 'opacity-50 shadow-2xl' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-bold ${col.color}`}>{item.ticketNumber}</span>
        <div className="flex items-center gap-1">
          <Badge variant={item.type === 'booking' ? 'info' : 'muted'} className="text-xs">
            {item.type === 'booking' ? '📅' : '🚶'} {item.type}
          </Badge>
          {cancelable && onCancel && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(item) }}
              title="Batalkan antrian"
              className="text-muted hover:text-red-400 p-0.5 rounded transition-colors"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <p className="font-semibold text-off-white text-sm">{item.customerName}</p>
      <p className="text-xs text-muted mt-0.5">{item.services?.join(', ')}</p>
      {item.staffName && (
        <div className="flex items-center gap-1 mt-2">
          <User className="w-3 h-3 text-muted" />
          <span className="text-xs text-muted">{item.staffName}</span>
        </div>
      )}
      {item.status === 'waiting' && (
        <div className="flex items-center gap-1 mt-1">
          <Clock className="w-3 h-3 text-amber-400" />
          <span className="text-xs text-amber-400">~{item.waitTime} min</span>
        </div>
      )}
      {item.status === 'in-progress' && item.updatedAt && (
        <div className="flex items-center gap-1 mt-1">
          <Clock className="w-3 h-3 text-blue-400" />
          <ElapsedTimer startedAt={item.updatedAt} />
        </div>
      )}
      {STATUS_BTN[item.status] && (
        <button
          onClick={() => onAdvance(item)}
          className={`mt-2 w-full py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-all ${col.bg} ${col.color} border ${col.border} hover:opacity-80`}
        >
          Lanjutkan <ChevronRight className="w-3 h-3" />
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

function DroppableColumn({ col, items, onAdvance, onCancel, isMobile }) {
  const { setNodeRef, isOver } = useSortable ? { setNodeRef: undefined, isOver: false } : {}

  return (
    <div
      className={`rounded-2xl border ${col.border} ${col.bg} p-3 min-h-[400px] transition-all ${isOver ? 'ring-2 ring-gold/40' : ''}`}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className={`font-semibold text-sm ${col.color}`}>{col.label}</h3>
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${col.bg} ${col.color} border ${col.border}`}>
          {items.length}
        </span>
      </div>
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

export default function QueuePage() {
  const { user } = useAuthStore()
  const { getBarbersByBranch, getServicesByTenant } = useTenantStore()
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const barbers = getBarbersByBranch(user.branchId)
  const services = getServicesByTenant(user.tenantId)
  const branchQueue = queue

  const getByStatus = (status) => branchQueue.filter(q => q.status === status)

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
    const next = STATUS_NEXT[item.status]
    if (next) advanceTo(item, next)
  }

  const handleCancel = async (item) => {
    if (!window.confirm(t('queue.toast.cancelConfirm', { name: item.customerName }))) return
    try {
      await deleteQueueM.mutateAsync({ id: item.id, branchId: user.branchId })
      toast.success(t('queue.toast.cancelled', { name: item.customerName }))
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

    if (targetColumnId && active.id !== over.id) {
      const draggedItem = branchQueue.find(q => q.id === active.id)
      if (draggedItem && draggedItem.status !== targetColumnId) {
        advanceTo(draggedItem, targetColumnId)
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-off-white">Antrian</h1>
            <LiveBadge />
          </div>
          <p className="text-muted text-sm mt-1">{branchQueue.filter(q => q.status === 'waiting').length} menunggu</p>
        </div>
        <Button icon={Plus} onClick={() => setShowModal(true)}>Walk-in</Button>
      </div>

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUMNS.map(col => {
            const items = getByStatus(col.id)
            return (
              <DroppableColumn
                key={col.id}
                col={col}
                items={items}
                onAdvance={handleAdvance}
                onCancel={handleCancel}
                isMobile={isMobile}
              />
            )
          })}
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
    </div>
  )
}
