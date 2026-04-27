import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'

export function useBroadcasts(tenantId) {
  return useQuery({
    queryKey: ['broadcasts', tenantId],
    queryFn: async () => {
      const res = await api.get('/broadcasts', { params: { tenantId } })
      const raw = res.data.data
      return Array.isArray(raw) ? raw : (raw?.data || [])
    },
    enabled: !!tenantId,
  })
}

export function useAllBroadcasts() {
  return useQuery({
    queryKey: ['broadcasts', 'all'],
    queryFn: async () => {
      const res = await api.get('/broadcasts')
      const raw = res.data.data
      return Array.isArray(raw) ? raw : (raw?.data || [])
    },
  })
}

export function useCreateBroadcast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/broadcasts', data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  })
}

export function useMarkBroadcastRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.patch(`/broadcasts/${id}/read`).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  })
}
