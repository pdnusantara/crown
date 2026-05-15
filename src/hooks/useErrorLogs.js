import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

// Backend emits these on the `support` room (super-admins).
const REALTIME_EVENTS = ['errorLog:created', 'errorLog:resolved', 'errorLog:deleted']

function useErrorLogRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const invalidate = () => qc.invalidateQueries({ queryKey: ['errorLogs'] })
    REALTIME_EVENTS.forEach((evt) => socket.on(evt, invalidate))
    return () => REALTIME_EVENTS.forEach((evt) => socket.off(evt, invalidate))
  }, [qc])
}

export function useErrorLogs(filters = {}) {
  useErrorLogRealtime()
  return useQuery({
    queryKey: ['errorLogs', filters],
    queryFn: async () => {
      const res = await api.get('/error-logs', { params: filters })
      // paginatedResponse: { data: [...], total, page, limit, totalPages, meta: {...} }
      const body = res.data || {}
      const list = Array.isArray(body.data) ? body.data : []
      const meta = body.meta || {
        total:    body.total ?? list.length,
        page:     body.page ?? 1,
        limit:    body.limit ?? list.length,
        totalPages: body.totalPages ?? 1,
      }
      return { data: list, meta }
    },
    refetchInterval: 30_000,
  })
}

export function useErrorLogStats(enabled = true) {
  useErrorLogRealtime()
  return useQuery({
    queryKey: ['errorLogs', 'stats'],
    queryFn: async () => {
      const res = await api.get('/error-logs/stats')
      return res.data.data
    },
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  })
}

export function useErrorLogTrend(days = 7, tz) {
  return useQuery({
    queryKey: ['errorLogs', 'trend', days, tz || 'system'],
    queryFn: async () => {
      const res = await api.get('/error-logs/stats/trend', { params: { days, ...(tz ? { tz } : {}) } })
      return res.data.data
    },
    refetchInterval: 60_000,
  })
}

function invalidate(qc) {
  qc.invalidateQueries({ queryKey: ['errorLogs'] })
}

export function useResolveError() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resolvedBy }) =>
      api.patch(`/error-logs/${id}/resolve`, { resolvedBy }).then(r => r.data.data),
    onSuccess: () => invalidate(qc),
  })
}

export function useBulkResolveErrors() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids) =>
      api.patch('/error-logs/bulk-resolve', { ids }).then(r => r.data.data),
    onSuccess: () => invalidate(qc),
  })
}

export function useDeleteErrorLogs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ olderThanDays, onlyResolved } = {}) =>
      api.delete('/error-logs', { params: { olderThanDays, onlyResolved } }).then(r => r.data.data),
    onSuccess: () => invalidate(qc),
  })
}

export function useCreateErrorLog() {
  return useMutation({
    mutationFn: (data) => api.post('/error-logs', data).then(r => r.data.data),
  })
}
