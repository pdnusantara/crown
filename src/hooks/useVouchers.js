import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { useAuthStore } from '../store/authStore.js'

export function useVouchers(filters = {}) {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['vouchers', user?.tenantId, filters],
    queryFn: async () => {
      const res = await api.get('/vouchers', {
        params: { tenantId: user?.tenantId, ...filters },
      })
      const raw = res.data.data
      return Array.isArray(raw) ? raw : (raw?.data || [])
    },
    enabled: !!user?.tenantId,
  })
}

export function useCreateVoucher() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (data) => api.post('/vouchers', { ...data, tenantId: user?.tenantId }).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vouchers', user?.tenantId] }),
  })
}

export function useUpdateVoucher() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/vouchers/${id}`, data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vouchers', user?.tenantId] }),
  })
}

export function useDeleteVoucher() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (id) => api.delete(`/vouchers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vouchers', user?.tenantId] }),
  })
}

export function useValidateVoucher() {
  return useMutation({
    mutationFn: ({ code, tenantId, subtotal }) =>
      api.post('/vouchers/validate', { code, tenantId, subtotal }).then(r => r.data.data),
  })
}
