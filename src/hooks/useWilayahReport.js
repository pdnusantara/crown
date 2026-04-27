import { useQuery } from '@tanstack/react-query'
import api from '../lib/api.js'

export function useWilayahReport({ kabupatenId, period = '30d' } = {}) {
  return useQuery({
    queryKey: ['wilayahReport', kabupatenId, period],
    queryFn: async () => {
      const res = await api.get('/reports/wilayah', { params: { kabupatenId, period } })
      return res.data.data
    },
    enabled: !!kabupatenId,
    staleTime: 2 * 60 * 1000,
  })
}
