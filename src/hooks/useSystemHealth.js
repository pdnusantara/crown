import { useQuery } from '@tanstack/react-query'
import api from '../lib/api.js'

// Ringkasan kesehatan operasional untuk panel super-admin (error, WA gateway,
// backup DB, cron renewal). Auto-refresh tiap 60 detik.
export function useSystemHealth() {
  return useQuery({
    queryKey: ['super-admin', 'system-health'],
    queryFn: async () => {
      const res = await api.get('/super-admin/system-health')
      return res.data.data
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
}
