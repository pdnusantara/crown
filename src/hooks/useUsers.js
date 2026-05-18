import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'

export function useUsers(filters = {}) {
  // `enabled` adalah opsi gating, bukan parameter API.
  const { enabled, ...params } = filters
  return useQuery({
    queryKey: ['users', params],
    queryFn: async () => {
      const res = await api.get('/users', { params })
      const raw = res.data.data
      return Array.isArray(raw) ? raw : (raw?.data || [])
    },
    enabled: enabled !== false,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/users', data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/users/${id}`, data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

// Set password baru untuk user. Argumen: id (string) ATAU { id, password }.
// Bila `password` diisi, admin menentukan sendiri; bila kosong, server generate.
// Response berisi tempPassword sekali — UI wajib menampilkannya & memberi tombol
// salin. Tidak ada cara mengambilnya kembali setelah modal ditutup.
export function useResetUserPassword() {
  return useMutation({
    mutationFn: (arg) => {
      const { id, password } = typeof arg === 'string' ? { id: arg } : (arg || {})
      return api
        .post(`/users/${id}/reset-password`, password ? { password } : {})
        .then(r => r.data.data)
    },
  })
}
