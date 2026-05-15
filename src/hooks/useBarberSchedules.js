import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

const REALTIME_EVENTS = ['schedule:created', 'schedule:updated', 'schedule:deleted', 'schedule:bulk_changed']

function useScheduleRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const onChange = () => qc.invalidateQueries({ queryKey: ['barberSchedules'] })
    REALTIME_EVENTS.forEach(evt => socket.on(evt, onChange))
    return () => REALTIME_EVENTS.forEach(evt => socket.off(evt, onChange))
  }, [qc])
}

// `weekStart` should be a YYYY-MM-DD string (Monday of the week).
export function useBarberSchedules({ weekStart, staffId, branchId } = {}) {
  useScheduleRealtime()
  return useQuery({
    queryKey: ['barberSchedules', { weekStart, staffId, branchId }],
    queryFn: async () => {
      const res = await api.get('/barber-schedules', {
        params: { weekStart, staffId, branchId },
      })
      return res.data.data || []
    },
    enabled: !!weekStart,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

export function useCreateBarberSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/barber-schedules', data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['barberSchedules'] }),
  })
}

// Optimistic update so drag-and-drop and shift edits feel instant; rollback on
// 4xx (e.g. 409 conflict) — server is source of truth.
export function useUpdateBarberSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/barber-schedules/${id}`, data).then(r => r.data.data),
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: ['barberSchedules'] })
      const snapshots = qc.getQueriesData({ queryKey: ['barberSchedules'] })
      snapshots.forEach(([key, arr]) => {
        if (!Array.isArray(arr)) return
        qc.setQueryData(key, arr.map(s => s.id === id ? { ...s, ...patch } : s))
      })
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots?.forEach(([key, prev]) => qc.setQueryData(key, prev))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['barberSchedules'] }),
  })
}

export function useDeleteBarberSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/barber-schedules/${id}`).then(r => r.data.data),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['barberSchedules'] })
      const snapshots = qc.getQueriesData({ queryKey: ['barberSchedules'] })
      snapshots.forEach(([key, arr]) => {
        if (!Array.isArray(arr)) return
        qc.setQueryData(key, arr.filter(s => s.id !== id))
      })
      return { snapshots }
    },
    onError: (_e, _v, ctx) => ctx?.snapshots?.forEach(([k, p]) => qc.setQueryData(k, p)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['barberSchedules'] }),
  })
}

export function useCopyScheduleWeek() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload) => api.post('/barber-schedules/copy-week', payload).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['barberSchedules'] }),
  })
}

export function useBulkDeleteSchedules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids) => api.post('/barber-schedules/bulk-delete', { ids }).then(r => r.data.data),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ['barberSchedules'] })
      const idSet = new Set(ids)
      const snapshots = qc.getQueriesData({ queryKey: ['barberSchedules'] })
      snapshots.forEach(([key, arr]) => {
        if (!Array.isArray(arr)) return
        qc.setQueryData(key, arr.filter(s => !idSet.has(s.id)))
      })
      return { snapshots }
    },
    onError: (_e, _v, ctx) => ctx?.snapshots?.forEach(([k, p]) => qc.setQueryData(k, p)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['barberSchedules'] }),
  })
}

export function useClearScheduleWeek() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload) => api.post('/barber-schedules/clear-week', payload).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['barberSchedules'] }),
  })
}
