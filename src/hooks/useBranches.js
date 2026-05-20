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

export function useBranchLicenseSummary(tenantId) {
  return useQuery({
    queryKey: ['branches', 'license', tenantId],
    queryFn: async () => {
      const res = await api.get('/branches/license/summary', { params: { tenantId } })
      return res.data.data
    },
    enabled: !!tenantId,
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

// Tutup cabang pada tanggal tertentu (mis. Lebaran, cuti bersama).
// Sekaligus menghapus BarberSchedule untuk tanggal+cabang itu di backend.
export function useCloseBranchDate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ branchId, date, note }) =>
      api.post(`/branches/${branchId}/closures`, { date, note }).then(r => r.data.data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['branches'] })
      qc.invalidateQueries({ queryKey: ['barberSchedules'] })
      return variables
    },
  })
}

export function useReopenBranchDate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ branchId, date }) =>
      api.delete(`/branches/${branchId}/closures`, { params: { date } }).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] })
      qc.invalidateQueries({ queryKey: ['barberSchedules'] })
    },
  })
}
