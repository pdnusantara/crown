import { useQuery } from '@tanstack/react-query'
import api from '../lib/api.js'

// Jadwal kerja milik staf sendiri (pola mingguan + 7 hari ke depan ter-resolve).
// Endpoint di-gate fitur `attendance`; panggil hanya saat menu tampil.
export function useMySchedule() {
  return useQuery({
    queryKey: ['attendance', 'my-schedule'],
    queryFn: async () => {
      const res = await api.get('/attendance/me/schedule')
      return res.data.data // { today, timezone, weekly:[7], upcoming:[7] }
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  })
}
