import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

export function useBranches(tenantId) {
  const qc = useQueryClient()

  // Realtime: refetch saat cabang berubah dari sesi lain (tambah/edit/hapus,
  // atau super-admin mengubah cabang/lisensi). Backend emit ke tenant room.
  useEffect(() => {
    if (!tenantId) return
    const socket = getSocket()
    const onChange = () => qc.invalidateQueries({ queryKey: ['branches'] })
    socket.on('branch:changed', onChange)
    return () => socket.off('branch:changed', onChange)
  }, [tenantId, qc])

  return useQuery({
    queryKey: ['branches', tenantId],
    queryFn: async () => {
      // limit tinggi: ambil semua cabang sekaligus supaya hitungan kuota &
      // "X cabang aktif" akurat (default pagination backend hanya 20/halaman).
      const res = await api.get('/branches', { params: { tenantId, limit: 1000 } })
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
