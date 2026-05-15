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
  const cacheKey = tenantId ? `reports-summary:${tenantId}:${branchId || 'all'}:${sd}:${ed}` : null
  const initial = (() => {
    if (!cacheKey || typeof window === 'undefined') return undefined
    try { const raw = window.localStorage.getItem(cacheKey); return raw ? JSON.parse(raw) : undefined }
    catch { return undefined }
  })()
  return useQuery({
    queryKey: ['reports', 'summary', tenantId, sd, ed, branchId || 'all'],
    queryFn: async () => {
      const params = { tenantId, startDate: sd, endDate: ed }
      if (branchId) params.branchId = branchId
      const res = await api.get('/reports/summary', { params })
      const data = res.data.data
      if (cacheKey && data) {
        try { window.localStorage.setItem(cacheKey, JSON.stringify(data)) } catch {}
      }
      return data
    },
    enabled: !!tenantId,
    initialData: initial,
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
