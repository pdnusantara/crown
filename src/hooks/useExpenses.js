import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'
import { useAuthStore } from '../store/authStore.js'

// Event realtime dari backend (routes/expenses.js → emitExpense).
const REALTIME_EVENTS = [
  'expense:created',
  'expense:updated',
  'expense:deleted',
  'expense:bulk_changed',
]

// Subscribe sekali per komponen pemakai — invalidasi list + stats saat ada
// perubahan. getSocket() sudah auto-reconnect (lib/socket.js).
function useExpensesRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const onChange = () => {
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['expenseStats'] })
    }
    REALTIME_EVENTS.forEach(evt => socket.on(evt, onChange))
    return () => REALTIME_EVENTS.forEach(evt => socket.off(evt, onChange))
  }, [qc])
}

// Daftar pengeluaran — pagination/search/sort/filter server-side, tenant-scoped.
export function useExpenses(filters = {}) {
  useExpensesRealtime()
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['expenses', user?.tenantId, filters],
    queryFn: async () => {
      const res = await api.get('/expenses', { params: filters })
      const raw = res.data.data
      if (raw && typeof raw === 'object' && Array.isArray(raw.data)) return raw
      return { data: Array.isArray(raw) ? raw : [], total: 0, page: 1, limit: 0, totalPages: 0 }
    },
    enabled: !!user?.tenantId,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
}

// KPI periode: { total, count, byCategory, period }.
export function useExpenseStats({ startDate, endDate } = {}) {
  useExpensesRealtime()
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['expenseStats', user?.tenantId, startDate, endDate],
    queryFn: async () => {
      const res = await api.get('/expenses/stats', { params: { startDate, endDate } })
      return res.data.data
    },
    enabled: !!user?.tenantId && !!startDate && !!endDate,
    staleTime: 15_000,
  })
}

const invalidateAll = (qc) => {
  qc.invalidateQueries({ queryKey: ['expenses'] })
  qc.invalidateQueries({ queryKey: ['expenseStats'] })
}

export function useCreateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/expenses', data).then(r => r.data.data),
    onSuccess: () => invalidateAll(qc),
  })
}

// Optimistic — perubahan langsung terlihat di tabel sebelum server membalas.
export function useUpdateExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/expenses/${id}`, data).then(r => r.data.data),
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: ['expenses'] })
      const snapshots = qc.getQueriesData({ queryKey: ['expenses'] })
      snapshots.forEach(([key, prev]) => {
        if (!prev?.data) return
        qc.setQueryData(key, {
          ...prev,
          data: prev.data.map(e => e.id === id ? { ...e, ...patch } : e),
        })
      })
      return { snapshots }
    },
    onError: (_e, _v, ctx) => ctx?.snapshots?.forEach(([k, p]) => qc.setQueryData(k, p)),
    onSettled: () => invalidateAll(qc),
  })
}

export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/expenses/${id}`).then(r => r.data.data),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['expenses'] })
      const snapshots = qc.getQueriesData({ queryKey: ['expenses'] })
      snapshots.forEach(([key, prev]) => {
        if (!prev?.data) return
        qc.setQueryData(key, {
          ...prev,
          data: prev.data.filter(e => e.id !== id),
          total: Math.max(0, (prev.total || 0) - 1),
        })
      })
      return { snapshots }
    },
    onError: (_e, _v, ctx) => ctx?.snapshots?.forEach(([k, p]) => qc.setQueryData(k, p)),
    onSettled: () => invalidateAll(qc),
  })
}

export function useBulkDeleteExpenses() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids) => api.post('/expenses/bulk-delete', { ids }).then(r => r.data.data),
    onSuccess: () => invalidateAll(qc),
  })
}

// Salin pengeluaran terpilih ke bulan lain (tombol "Salin dari Bulan Lalu").
export function useCopyMonthExpenses() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, toMonth }) =>
      api.post('/expenses/copy-month', { ids, toMonth }).then(r => r.data.data),
    onSuccess: () => invalidateAll(qc),
  })
}
