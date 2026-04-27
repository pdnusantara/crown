import { useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket, joinBranchRoom, leaveBranchRoom } from '../lib/socket.js'

// ─── Shape adapter ──────────────────────────────────────────────────────────
// UI menyimpan field tambahan (services array, phone, type, staffName, paid)
// di `notes` backend sebagai JSON agar bisa round-trip tanpa migrasi skema.

const statusToUI = (s, meta) => {
  if (s === 'in_progress') return 'in-progress'
  if (s === 'paid') return 'paid'
  // Backward-compat: data lama yang belum punya enum 'paid' menyimpan flag di notes
  if (s === 'done' && meta?.paid) return 'paid'
  return s
}
const statusToAPI = (s) => {
  if (s === 'in-progress') return 'in_progress'
  // 'paid' sekarang sudah jadi enum native — jangan lagi map ke 'done'
  return s
}
const typeToUI = (t) => (t === 'walk_in' ? 'walk-in' : t)
const typeToAPI = (t) => (t === 'walk-in' ? 'walk_in' : t)

const parseMeta = (notes) => {
  if (!notes) return {}
  try { return JSON.parse(notes) } catch { return { _raw: notes } }
}

const buildNotes = (meta) => {
  const cleaned = Object.fromEntries(
    Object.entries(meta).filter(([, v]) => v !== undefined && v !== null && v !== '')
  )
  return Object.keys(cleaned).length ? JSON.stringify(cleaned) : undefined
}

export function toUIItem(entry) {
  const meta = parseMeta(entry.notes)
  const services = entry.serviceNames
    ? entry.serviceNames.split('|').filter(Boolean)
    : (meta.services || (meta._raw ? [meta._raw] : ['Potong Reguler']))
  return {
    id: entry.id,
    tenantId: entry.tenantId,
    branchId: entry.branchId,
    ticketNumber: entry.queueNumber != null ? `A${String(entry.queueNumber).padStart(3, '0')}` : entry.id,
    customerId: entry.customerId || meta.customerId || null,
    customerName: entry.customerName,
    phone: entry.customerPhone || meta.phone || '',
    services,
    staffId: entry.barberId || null,
    staffName: entry.barberName || meta.staffName || null,
    type: typeToUI(entry.type) || meta.type || (entry.customerId ? 'booking' : 'walk-in'),
    status: statusToUI(entry.status, meta),
    waitTime: entry.estimatedTime ?? meta.waitTime ?? 15,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }
}

export function toAPIPayload(item) {
  return {
    tenantId: item.tenantId,
    branchId: item.branchId,
    customerId: item.customerId || undefined,
    customerName: item.customerName,
    customerPhone: item.phone || undefined,
    serviceNames: Array.isArray(item.services) && item.services.length
      ? item.services.join('|')
      : undefined,
    barberId: item.staffId || undefined,
    barberName: item.staffName || undefined,
    type: typeToAPI(item.type) || undefined,
    estimatedTime: typeof item.waitTime === 'number' ? item.waitTime : undefined,
  }
}

export function useBranchQueue(branchId) {
  const q = useQueue(branchId)
  const queue = useMemo(() => (q.data || []).map(toUIItem), [q.data])
  return { ...q, queue }
}

export function useQueue(branchId) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['queue', branchId],
    queryFn: async () => {
      const res = await api.get('/queue', { params: { branchId } })
      const raw = res.data.data
      return Array.isArray(raw) ? raw : (raw?.data || [])
    },
    enabled: !!branchId,
  })

  useEffect(() => {
    if (!branchId) return

    const socket = getSocket()
    joinBranchRoom(branchId)

    const invalidate = (entry) => {
      if (entry && entry.branchId && entry.branchId !== branchId) return
      qc.invalidateQueries({ queryKey: ['queue', branchId] })
    }

    socket.on('queue:created', invalidate)
    socket.on('queue:updated', invalidate)
    socket.on('queue:deleted', invalidate)

    // Refetch saat reconnect untuk mengisi event yang terlewat
    const handleReconnect = () => {
      joinBranchRoom(branchId)
      qc.invalidateQueries({ queryKey: ['queue', branchId] })
    }
    socket.on('connect', handleReconnect)

    return () => {
      socket.off('queue:created', invalidate)
      socket.off('queue:updated', invalidate)
      socket.off('queue:deleted', invalidate)
      socket.off('connect', handleReconnect)
      leaveBranchRoom(branchId)
    }
  }, [branchId, qc])

  return query
}

export function useAddToQueue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (uiItem) => {
      const payload = toAPIPayload(uiItem)
      return api.post('/queue', payload).then(r => r.data.data)
    },
    onMutate: async (uiItem) => {
      const key = ['queue', uiItem.branchId]
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData(key) || []
      const optimisticEntry = {
        id: `tmp-${Date.now()}`,
        tenantId: uiItem.tenantId,
        branchId: uiItem.branchId,
        customerId: uiItem.customerId || null,
        customerName: uiItem.customerName,
        barberId: uiItem.staffId || null,
        queueNumber: (prev[prev.length - 1]?.queueNumber || 0) + 1,
        status: statusToAPI('waiting'),
        notes: buildNotes({
          services: uiItem.services,
          phone: uiItem.phone,
          type: uiItem.type,
          staffName: uiItem.staffName,
          waitTime: uiItem.waitTime,
        }),
        estimatedTime: typeof uiItem.waitTime === 'number' ? uiItem.waitTime : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _optimistic: true,
      }
      qc.setQueryData(key, [...prev, optimisticEntry])
      return { prev, key }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.key) qc.setQueryData(ctx.key, ctx.prev)
    },
    onSettled: (_data, _err, variables) => {
      qc.invalidateQueries({ queryKey: ['queue', variables.branchId] })
    },
  })
}

export function useUpdateQueueStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }) => {
      const body = { status: statusToAPI(status) }
      return api.patch(`/queue/${id}`, body).then(r => r.data.data)
    },
    onMutate: async ({ id, branchId, status }) => {
      const key = ['queue', branchId]
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData(key) || []
      const apiStatus = statusToAPI(status)
      const next = prev.map(e =>
        e.id === id ? { ...e, status: apiStatus, updatedAt: new Date().toISOString() } : e
      )
      qc.setQueryData(key, next)
      return { prev, key }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.key) qc.setQueryData(ctx.key, ctx.prev)
    },
    onSettled: (_data, _err, variables) => {
      qc.invalidateQueries({ queryKey: ['queue', variables.branchId] })
    },
  })
}

export function useDeleteQueueItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }) => api.delete(`/queue/${id}`),
    onMutate: async ({ id, branchId }) => {
      const key = ['queue', branchId]
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData(key) || []
      qc.setQueryData(key, prev.filter(e => e.id !== id))
      return { prev, key }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.key) qc.setQueryData(ctx.key, ctx.prev)
    },
    onSettled: (_data, _err, variables) =>
      qc.invalidateQueries({ queryKey: ['queue', variables.branchId] }),
  })
}
