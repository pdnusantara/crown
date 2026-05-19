import { useEffect } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'
import { useAuthStore } from '../store/authStore.js'

// Backend emit `auditLog:created` ke tenant room tiap recordAudit() —
// halaman log aktivitas ikut update tanpa refresh.
function useAuditRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const onChange = () => {
      qc.invalidateQueries({ queryKey: ['auditLogs'] })
      qc.invalidateQueries({ queryKey: ['auditActions'] })
    }
    socket.on('auditLog:created', onChange)
    return () => socket.off('auditLog:created', onChange)
  }, [qc])
}

// Log aktivitas tenant — server-side pagination/search/filter.
// `enabled` dipakai agar query tak jalan saat tab audit belum dibuka.
export function useAuditLogs(filters = {}, enabled = true) {
  useAuditRealtime()
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['auditLogs', user?.tenantId, filters],
    queryFn: async () => {
      const res = await api.get('/audit-logs', { params: filters })
      const raw = res.data.data
      if (raw && typeof raw === 'object' && Array.isArray(raw.data)) return raw
      return { data: [], total: 0, page: 1, limit: 0, totalPages: 0 }
    },
    enabled: enabled && !!user?.tenantId,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
}

// Daftar action unik milik tenant — untuk dropdown filter.
export function useAuditActions(enabled = true) {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['auditActions', user?.tenantId],
    queryFn: async () => {
      const res = await api.get('/audit-logs/actions')
      return res.data.data || []
    },
    enabled: enabled && !!user?.tenantId,
    staleTime: 60_000,
  })
}
