import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

export function useUsers(filters = {}) {
  // `enabled` adalah opsi gating, bukan parameter API.
  // Default limit 1000 supaya tenant >20 staf tidak ke-cut (backend default 20).
  const { enabled, limit = 1000, ...rest } = filters
  const params = { ...rest, limit }
  const qc = useQueryClient()

  // Realtime: invalidate saat ada perubahan staf dari sesi lain (tenant_admin
  // tambah/edit/hapus/reset, atau super-admin lintas-tenant). Backend emit ke
  // tenantRoom. Pakai key utama 'users' supaya semua variasi filter ke-refresh.
  useEffect(() => {
    if (enabled === false) return
    const socket = getSocket()
    const onChange = () => qc.invalidateQueries({ queryKey: ['users'] })
    socket.on('staff:changed', onChange)
    return () => socket.off('staff:changed', onChange)
  }, [enabled, qc])

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
    // Surface meta (mis. addonInvoice saat hire over kuota) ke caller via
    // `_meta`. Default hook lama drop seluruh response selain `data` — page
    // tidak tahu tagihan baru sudah dibuat.
    mutationFn: (data) => api.post('/users', data).then(r => ({
      ...r.data.data,
      _meta: r.data.meta || null,
    })),
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
