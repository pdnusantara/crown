import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'
import { useAuthStore } from '../store/authStore.js'

const REALTIME_EVENTS = [
  'voucher:created',
  'voucher:updated',
  'voucher:deleted',
  'voucher:bulk_changed',
]

function useVouchersRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const onChange = () => {
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      qc.invalidateQueries({ queryKey: ['voucherStats'] })
    }
    REALTIME_EVENTS.forEach(evt => socket.on(evt, onChange))
    return () => REALTIME_EVENTS.forEach(evt => socket.off(evt, onChange))
  }, [qc])
}

// Tenant-scoped list with pagination/search/sort/filter — server-side.
export function useVouchers(filters = {}) {
  useVouchersRealtime()
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['vouchers', user?.tenantId, filters],
    queryFn: async () => {
      const res = await api.get('/vouchers', { params: filters })
      const raw = res.data.data
      if (raw && typeof raw === 'object' && Array.isArray(raw.data)) return raw
      return { data: Array.isArray(raw) ? raw : [], total: 0, page: 1, limit: 0 }
    },
    enabled: !!user?.tenantId,
    placeholderData: keepPreviousData,
    staleTime: 20_000,
  })
}

export function useVoucherStats() {
  useVouchersRealtime()
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['voucherStats', user?.tenantId],
    queryFn: async () => {
      const res = await api.get('/vouchers/stats')
      return res.data.data
    },
    enabled: !!user?.tenantId,
    staleTime: 30_000,
  })
}

export function useCreateVoucher() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/vouchers', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      qc.invalidateQueries({ queryKey: ['voucherStats'] })
    },
  })
}

// Optimistic update so toggling active/inactive feels instant.
export function useUpdateVoucher() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/vouchers/${id}`, data).then(r => r.data.data),
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: ['vouchers'] })
      const snapshots = qc.getQueriesData({ queryKey: ['vouchers'] })
      snapshots.forEach(([key, prev]) => {
        if (!prev?.data) return
        qc.setQueryData(key, {
          ...prev,
          data: prev.data.map(v => v.id === id ? { ...v, ...patch } : v),
        })
      })
      return { snapshots }
    },
    onError: (_e, _v, ctx) => ctx?.snapshots?.forEach(([k, p]) => qc.setQueryData(k, p)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      qc.invalidateQueries({ queryKey: ['voucherStats'] })
    },
  })
}

export function useDeleteVoucher() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/vouchers/${id}`).then(r => r.data.data),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['vouchers'] })
      const snapshots = qc.getQueriesData({ queryKey: ['vouchers'] })
      snapshots.forEach(([key, prev]) => {
        if (!prev?.data) return
        qc.setQueryData(key, {
          ...prev,
          data: prev.data.filter(v => v.id !== id),
          total: Math.max(0, (prev.total || 0) - 1),
        })
      })
      return { snapshots }
    },
    onError: (_e, _v, ctx) => ctx?.snapshots?.forEach(([k, p]) => qc.setQueryData(k, p)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      qc.invalidateQueries({ queryKey: ['voucherStats'] })
    },
  })
}

export function useBulkToggleVouchers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, isActive }) => api.post('/vouchers/bulk-toggle', { ids, isActive }).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      qc.invalidateQueries({ queryKey: ['voucherStats'] })
    },
  })
}

export function useBulkDeleteVouchers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids) => api.post('/vouchers/bulk-delete', { ids }).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vouchers'] })
      qc.invalidateQueries({ queryKey: ['voucherStats'] })
    },
  })
}

// Validate via API — replaces the localStorage seed store.
export function useValidateVoucher() {
  return useMutation({
    mutationFn: ({ code, subtotal }) =>
      api.post('/vouchers/validate', { code, subtotal }).then(r => r.data.data),
  })
}

// Redeem (atomic increment usedCount server-side) — kasir setelah bayar.
export function useRedeemVoucher() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post('/vouchers/redeem', { id }).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vouchers'] }),
  })
}
