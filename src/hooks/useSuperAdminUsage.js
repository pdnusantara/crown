import { useQuery } from '@tanstack/react-query'
import api from '../lib/api.js'

export function useSuperAdminUsage(days = 7) {
  return useQuery({
    queryKey: ['super-admin', 'usage', days],
    queryFn: async () => {
      const res = await api.get('/super-admin/usage', { params: { days } })
      return res.data.data
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}
