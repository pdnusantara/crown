import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'

// Konfigurasi WA Gateway — hanya super_admin. Secret tidak pernah dikirim utuh
// oleh backend (hanya bentuk ter-mask + flag *Set).
export function useWhatsappConfig() {
  return useQuery({
    queryKey: ['whatsapp-config'],
    queryFn: () => api.get('/whatsapp/config').then(r => r.data.data),
  })
}

export function useUpdateWhatsappConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.put('/whatsapp/config', data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp-config'] }),
  })
}

export function useTestWhatsappConfig() {
  return useMutation({
    mutationFn: () => api.post('/whatsapp/config/test').then(r => r.data.data),
  })
}
