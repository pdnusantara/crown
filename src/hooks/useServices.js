import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { useAuthStore } from '../store/authStore.js'

export function useServices() {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['services', user?.tenantId],
    queryFn: async () => {
      const res = await api.get('/services', { params: { tenantId: user?.tenantId } })
      const raw = res.data.data
      return Array.isArray(raw) ? raw : (raw?.data || [])
    },
    enabled: !!user?.tenantId,
  })
}

export function useCreateService() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (data) => api.post('/services', { ...data, tenantId: user?.tenantId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services', user?.tenantId] }),
  })
}

export function useUpdateService() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/services/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services', user?.tenantId] }),
  })
}

export function useDeleteService() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (id) => api.delete(`/services/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services', user?.tenantId] }),
  })
}
