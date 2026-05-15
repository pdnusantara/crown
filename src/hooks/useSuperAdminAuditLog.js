import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

const REALTIME_EVENT = 'auditLog:created'

function useAuditLogRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const onCreated = () => qc.invalidateQueries({ queryKey: ['superAdmin', 'auditLog'] })
    socket.on(REALTIME_EVENT, onCreated)
    return () => socket.off(REALTIME_EVENT, onCreated)
  }, [qc])
}

export function useAuditLog(filters = {}) {
  useAuditLogRealtime()
  return useQuery({
    queryKey: ['superAdmin', 'auditLog', 'list', filters],
    queryFn: async () => {
      const res = await api.get('/super-admin/audit-log', { params: filters })
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
    refetchInterval: 60_000,
  })
}

export function useAuditLogStats(days = 30, tz) {
  useAuditLogRealtime()
  return useQuery({
    queryKey: ['superAdmin', 'auditLog', 'stats', days, tz || 'system'],
    queryFn: async () => {
      const res = await api.get('/super-admin/audit-log/stats', { params: { days, ...(tz ? { tz } : {}) } })
      return res.data.data
    },
    refetchInterval: 60_000,
  })
}

export function useAuditLogActions() {
  return useQuery({
    queryKey: ['superAdmin', 'auditLog', 'actions'],
    queryFn: async () => {
      const res = await api.get('/super-admin/audit-log/actions')
      return res.data.data || []
    },
    staleTime: 5 * 60_000,
  })
}

export function usePurgeAuditLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ olderThanDays, severity } = {}) =>
      api.delete('/super-admin/audit-log', { params: { olderThanDays, severity } }).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['superAdmin', 'auditLog'] }),
  })
}
