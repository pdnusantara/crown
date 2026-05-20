import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

// Konfigurasi WA Gateway — hanya super_admin. Secret tidak pernah dikirim utuh
// oleh backend (hanya bentuk ter-mask + flag *Set).
//
// Backend emit `whatsapp:status` saat status gateway berubah (connected /
// disconnected / qr_required) — kita invalidate agar UI super admin reflek
// realtime tanpa refresh.
export function useWhatsappConfig() {
  const qc = useQueryClient()
  useEffect(() => {
    const s = getSocket()
    const onStatus = () => qc.invalidateQueries({ queryKey: ['whatsapp-config'] })
    s.on('whatsapp:status', onStatus)
    return () => { s.off('whatsapp:status', onStatus) }
  }, [qc])

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
