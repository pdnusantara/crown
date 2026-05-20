import { QueryClient } from '@tanstack/react-query'

// Default cache policy untuk seluruh aplikasi.
//
// staleTime 30 detik — kompromi antara "selalu fresh" dan "hindari refetch
// berlebihan". Hook real-time (POS, queue, attendance) override ke 10–15 detik;
// data lambat (packages, feature flags) override ke 2 menit.
//
// refetchOnWindowFocus + refetchOnReconnect aktif supaya user yang pindah tab
// atau mengalami WS drop tidak terjebak data lama — ini penyebab utama keluhan
// "harus refresh-refresh dulu baru sesuai".
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime:    1000 * 60 * 10,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      onError: (err) => {
        console.error('Mutation error:', err?.response?.data?.error || err.message)
      }
    }
  }
})
