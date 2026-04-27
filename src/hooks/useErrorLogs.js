import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'

export function useErrorLogs(filters = {}) {
  return useQuery({
    queryKey: ['errorLogs', filters],
    queryFn: async () => {
      const res = await api.get('/error-logs', { params: filters })
      const raw = res.data.data
      return Array.isArray(raw) ? raw : (raw?.data || [])
    },
    refetchInterval: 30_000, // auto-refresh every 30s
  })
}

export function useErrorLogStats(enabled = true) {
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

export function useErrorLogTrend(days = 7) {
  return useQuery({
    queryKey: ['errorLogs', 'trend', days],
    queryFn: async () => {
      const res = await api.get('/error-logs/stats/trend', { params: { days } })
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
