import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { useAuthStore } from '../store/authStore.js'

export function useTransactions(filters = {}) {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['transactions', user?.tenantId, filters],
    queryFn: async () => {
      const res = await api.get('/transactions', {
        params: { tenantId: user?.tenantId, ...filters },
      })
      const raw = res.data.data
      return Array.isArray(raw) ? raw : (raw?.data || [])
    },
    enabled: !!user?.tenantId,
  })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (data) => api.post('/transactions', data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions', user?.tenantId] }),
  })
}
