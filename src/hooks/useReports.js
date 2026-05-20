import { useQuery } from '@tanstack/react-query'
import api from '../lib/api.js'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function daysAgoStr(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
}

export function useReportSummary(tenantId, startDate, endDate, branchId) {
  const sd = startDate ?? todayStr()
  const ed = endDate   ?? todayStr()

  // One-time cleanup cache lama di localStorage — sebelumnya kita simpan
  // summary di sana sebagai initialData, tapi itu bikin user lihat angka
  // periode/cabang lain yang sempat dibuka (flash stale). Sekarang andalkan
  // React Query saja.
  if (typeof window !== 'undefined' && tenantId) {
    try {
      const prefix = `reports-summary:${tenantId}:`
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const key = window.localStorage.key(i)
        if (key && key.startsWith(prefix)) window.localStorage.removeItem(key)
      }
    } catch {}
  }

  return useQuery({
    queryKey: ['reports', 'summary', tenantId, sd, ed, branchId || 'all'],
    queryFn: async () => {
      const params = { tenantId, startDate: sd, endDate: ed }
      if (branchId) params.branchId = branchId
      const res = await api.get('/reports/summary', { params })
      return res.data.data
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  })
}

// Yesterday stats for trend comparison
export function useYesterdayStats(tenantId) {
  const yest = daysAgoStr(1)
  return useReportSummary(tenantId, yest, yest)
}

export function useDailyReport(tenantId, days = 7, branchId) {
  const endDate   = todayStr()
  const startDate = daysAgoStr(days - 1)
  return useQuery({
    queryKey: ['reports', 'daily', tenantId, days, branchId || 'all'],
    queryFn: async () => {
      const params = { tenantId, startDate, endDate }
      if (branchId) params.branchId = branchId
      const res = await api.get('/reports/daily', { params })
      return res.data.data
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  })
}

export function useBarberReport(tenantId, filters = {}) {
  return useQuery({
    queryKey: ['reports', 'barbers', tenantId, filters],
    queryFn: async () => {
      const res = await api.get('/reports/barbers', { params: { tenantId, ...filters } })
      return res.data.data
    },
    enabled: !!tenantId,
  })
}

// Daftar gaji staf (barber + kasir) periode untuk semua skema —
// dipakai fitur "Gaji Staf" di /admin/expenses.
export function useStaffPayroll(tenantId, filters = {}) {
  return useQuery({
    queryKey: ['reports', 'staffPayroll', tenantId, filters],
    queryFn: async () => {
      const res = await api.get('/reports/staff-payroll', { params: { tenantId, ...filters } })
      return res.data.data
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  })
}

export function useServiceReport(tenantId, filters = {}) {
  return useQuery({
    queryKey: ['reports', 'services', tenantId, filters],
    queryFn: async () => {
      const res = await api.get('/reports/services', { params: { tenantId, ...filters } })
      return res.data.data
    },
    enabled: !!tenantId,
  })
}

export function useBranchSummary(tenantId, branchId, startDate, endDate) {
  const sd = startDate ?? todayStr()
  const ed = endDate   ?? todayStr()
  return useQuery({
    queryKey: ['reports', 'summary', tenantId, branchId, sd, ed],
    queryFn: async () => {
      const res = await api.get('/reports/summary', { params: { tenantId, branchId, startDate: sd, endDate: ed } })
      return res.data.data
    },
    enabled: !!tenantId && !!branchId,
  })
}

export function useBranchDaily(tenantId, branchId, days = 7) {
  const endDate   = todayStr()
  const startDate = daysAgoStr(days - 1)
  return useQuery({
    queryKey: ['reports', 'daily', tenantId, branchId, days],
    queryFn: async () => {
      const res = await api.get('/reports/daily', { params: { tenantId, branchId, startDate, endDate } })
      return res.data.data
    },
    enabled: !!tenantId && !!branchId,
  })
}
