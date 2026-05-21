import { useEffect } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

// Daftar log pesan WhatsApp keluar (paginated + filter). Realtime: backend
// emit `whatsapp:message` ke tenant room saat pesan dicatat / status berubah
// dari webhook → invalidate daftar + stats supaya halaman selalu mutakhir.
export function useWhatsappMessages(params = {}) {
  const qc = useQueryClient()

  useEffect(() => {
    const socket = getSocket()
    const onChange = () => {
      qc.invalidateQueries({ queryKey: ['whatsappMessages'] })
      qc.invalidateQueries({ queryKey: ['whatsappMessageStats'] })
    }
    socket.on('whatsapp:message', onChange)
    return () => socket.off('whatsapp:message', onChange)
  }, [qc])

  return useQuery({
    queryKey: ['whatsappMessages', params],
    queryFn: async () => {
      const res = await api.get('/whatsapp/messages', { params })
      return res.data.data // { data: [...], total, page, limit, totalPages }
    },
    placeholderData: keepPreviousData,
  })
}

export function useWhatsappMessageStats(range = {}) {
  return useQuery({
    queryKey: ['whatsappMessageStats', range],
    queryFn: async () => {
      const res = await api.get('/whatsapp/messages/stats', { params: range })
      return res.data.data
    },
  })
}
