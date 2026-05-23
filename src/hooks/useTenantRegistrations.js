import { useEffect } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

// Daftar pendaftaran tenant (paginated) — super_admin.
export function useTenantRegistrations(params) {
  const qc = useQueryClient()
  // Realtime: backend emit `tenant:updated` saat tenant baru lahir.
  useEffect(() => {
    const s = getSocket()
    const onUpdate = () => {
      qc.invalidateQueries({ queryKey: ['tenant-registrations'] })
      qc.invalidateQueries({ queryKey: ['tenant-registration-stats'] })
    }
    s.on('tenant:updated', onUpdate)
    return () => { s.off('tenant:updated', onUpdate) }
  }, [qc])

  return useQuery({
    queryKey: ['tenant-registrations', params],
    queryFn: () => api.get('/super-admin/tenant-registrations', { params }).then(r => r.data),
    placeholderData: keepPreviousData,
  })
}

export function useTenantRegistrationStats(tz) {
  return useQuery({
    queryKey: ['tenant-registration-stats', tz],
    queryFn: () => api.get('/super-admin/tenant-registrations/stats', { params: { tz } }).then(r => r.data.data),
  })
}
