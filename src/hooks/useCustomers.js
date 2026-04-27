import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { useAuthStore } from '../store/authStore.js'

export function useCustomers(filters = {}) {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['customers', user?.tenantId, filters],
    queryFn: async () => {
      const res = await api.get('/customers', { params: { tenantId: user?.tenantId, ...filters } })
      const raw = res.data.data
      return Array.isArray(raw) ? raw : (raw?.data || [])
    },
    enabled: !!user?.tenantId,
  })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (data) => api.post('/customers', { ...data, tenantId: user?.tenantId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers', user?.tenantId] }),
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/customers/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers', user?.tenantId] }),
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (id) => api.delete(`/customers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers', user?.tenantId] }),
  })
}
