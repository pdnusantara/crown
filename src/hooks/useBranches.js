import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'

export function useBranches(tenantId) {
  return useQuery({
    queryKey: ['branches', tenantId],
    queryFn: async () => {
      const res = await api.get('/branches', { params: { tenantId } })
      const raw = res.data.data
      return Array.isArray(raw) ? raw : (raw?.data || [])
    },
    enabled: !!tenantId,
  })
}

export function useCreateBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/branches', data).then(r => r.data.data),
    onSuccess: (_, variables) =>
      qc.invalidateQueries({ queryKey: ['branches', variables.tenantId] }),
  })
}

export function useUpdateBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, tenantId, ...data }) => api.put(`/branches/${id}`, data).then(r => r.data.data),
    onSuccess: (_, variables) =>
      qc.invalidateQueries({ queryKey: ['branches', variables.tenantId] }),
  })
}

export function useDeleteBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, tenantId }) => api.delete(`/branches/${id}`),
    onSuccess: (_, variables) =>
      qc.invalidateQueries({ queryKey: ['branches', variables.tenantId] }),
  })
}
