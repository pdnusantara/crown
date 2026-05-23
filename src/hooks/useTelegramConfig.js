import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'

// Konfigurasi notifikasi Telegram — hanya super_admin. Token tidak pernah
// dikirim utuh oleh backend (hanya bentuk ter-mask + flag botTokenSet).
export function useTelegramConfig() {
  return useQuery({
    queryKey: ['telegram-config'],
    queryFn: () => api.get('/telegram/config').then(r => r.data.data),
  })
}

export function useUpdateTelegramConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.put('/telegram/config', data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['telegram-config'] }),
  })
}

export function useTestTelegramConfig() {
  return useMutation({
    mutationFn: () => api.post('/telegram/config/test').then(r => r.data.data),
  })
}
