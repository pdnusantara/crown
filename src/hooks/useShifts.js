import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'

export function useActiveShift(branchId) {
  return useQuery({
    queryKey: ['shifts', 'active', branchId],
    queryFn: async () => {
      const res = await api.get('/shifts/active', { params: { branchId } })
      return res.data.data
    },
    enabled: !!branchId,
  })
}

export function useShifts(filters = {}) {
  return useQuery({
    queryKey: ['shifts', filters],
    queryFn: async () => {
      const res = await api.get('/shifts', { params: filters })
      const raw = res.data.data
      return Array.isArray(raw) ? raw : (raw?.data || [])
    },
  })
}

export function useOpenShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/shifts', data).then(r => r.data.data),
    onSuccess: (_, variables) =>
      qc.invalidateQueries({ queryKey: ['shifts', 'active', variables.branchId] }),
  })
}

export function useCloseShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, branchId, ...data }) =>
      api.patch(`/shifts/${id}/close`, data).then(r => r.data.data),
    onSuccess: (_, variables) =>
      qc.invalidateQueries({ queryKey: ['shifts', 'active', variables.branchId] }),
  })
}
