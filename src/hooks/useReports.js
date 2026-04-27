import { useQuery } from '@tanstack/react-query'
import api from '../lib/api.js'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function daysAgoStr(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
}

export function useReportSummary(tenantId, startDate, endDate) {
  const sd = startDate ?? todayStr()
  const ed = endDate   ?? todayStr()
  return useQuery({
    queryKey: ['reports', 'summary', tenantId, sd, ed],
    queryFn: async () => {
      const res = await api.get('/reports/summary', { params: { tenantId, startDate: sd, endDate: ed } })
      return res.data.data
    },
    enabled: !!tenantId,
  })
}

// Yesterday stats for trend comparison
export function useYesterdayStats(tenantId) {
  const yest = daysAgoStr(1)
  return useReportSummary(tenantId, yest, yest)
}

export function useDailyReport(tenantId, days = 7) {
  const endDate   = todayStr()
  const startDate = daysAgoStr(days - 1)
  return useQuery({
    queryKey: ['reports', 'daily', tenantId, days],
    queryFn: async () => {
      const res = await api.get('/reports/daily', { params: { tenantId, startDate, endDate } })
      return res.data.data
    },
    enabled: !!tenantId,
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
