import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { useAuthStore } from '../store/authStore.js'

export function useBookings(filters = {}) {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['bookings', user?.tenantId, filters],
    queryFn: async () => {
      const res = await api.get('/bookings', {
        params: { tenantId: user?.tenantId, ...filters },
      })
      const raw = res.data.data
      return Array.isArray(raw) ? raw : (raw?.data || [])
    },
    enabled: !!user?.tenantId,
  })
}

export function useCreateBooking() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (data) => api.post('/bookings', data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings', user?.tenantId] }),
  })
}

export function useUpdateBooking() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/bookings/${id}`, data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings', user?.tenantId] }),
  })
}

export function useDeleteBooking() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (id) => api.delete(`/bookings/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings', user?.tenantId] }),
  })
}
