import { useQuery } from '@tanstack/react-query'
import api from '../lib/api.js'

// Peringkat barber dalam cabang (bulan berjalan). Backend men-scope ke cabang
// si pemanggil untuk barber/kasir; admin boleh kirim branchId.
export function useBarberLeaderboard(branchId) {
  return useQuery({
    queryKey: ['reports', 'barber-leaderboard', branchId || 'self'],
    queryFn: async () => {
      const params = {}
      if (branchId) params.branchId = branchId
      const res = await api.get('/reports/barber-leaderboard', { params })
      return res.data.data // { period, meId, branchId, list: [{rank,barberId,name,photo,revenue,services,avgRating,totalRatings}] }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
}
