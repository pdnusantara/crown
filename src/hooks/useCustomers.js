import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import api from '../lib/api.js'
import { useAuthStore } from '../store/authStore.js'
import { getSocket } from '../lib/socket.js'

/**
 * Subscribe ke event customer:* dari tenant room.
 * Memanggil invalidate untuk seluruh query 'customers' tenant.
 * Aman dipanggil multi-instance — listener di-cleanup pada unmount.
 */
function useCustomerRealtime(tenantId) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!tenantId) return
    const socket = getSocket()
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ['customers', tenantId] })
      qc.invalidateQueries({ queryKey: ['customers', 'stats', tenantId] })
      // Detail drawer & ledger pakai key 2-segmen berbeda ('detail'/'point-history'),
      // jadi invalidate ['customers', tenantId] di atas TIDAK menjangkaunya. Tanpa
      // ini, drawer yang sedang terbuka tak ikut tersegarkan saat ada event WS.
      qc.invalidateQueries({ queryKey: ['customers', 'detail'] })
      qc.invalidateQueries({ queryKey: ['customers', 'point-history'] })
    }
    socket.on('customer:created', invalidate)
    socket.on('customer:updated', invalidate)
    socket.on('customer:deleted', invalidate)
    return () => {
      socket.off('customer:created', invalidate)
      socket.off('customer:updated', invalidate)
      socket.off('customer:deleted', invalidate)
    }
  }, [tenantId, qc])
}

export function useCustomers(filters = {}) {
  const { user } = useAuthStore()
  const tenantId = user?.tenantId
  useCustomerRealtime(tenantId)

  // `enabled` adalah opsi gating query — JANGAN diteruskan sebagai param API.
  const { enabled: enabledOpt, ...apiFilters } = filters

  // Default ke limit besar bila tanpa pagination — caller lama (mis. POSPage
  // lookup) butuh seluruh data; halaman admin override eksplisit.
  const params = { tenantId, ...apiFilters }
  if (params.limit == null && params.page == null) params.limit = 1000

  const query = useQuery({
    queryKey: ['customers', tenantId, params],
    queryFn: async () => {
      const res = await api.get('/customers', { params })
      const raw = res.data?.data
      if (Array.isArray(raw)) {
        return { data: raw, total: raw.length, page: 1, limit: raw.length, totalPages: 1 }
      }
      return {
        data:       raw?.data       || [],
        total:      raw?.total      ?? 0,
        page:       raw?.page       ?? (Number(params.page) || 1),
        limit:      raw?.limit      ?? (Number(params.limit) || 20),
        totalPages: raw?.totalPages ?? 0,
      }
    },
    enabled: !!tenantId && enabledOpt !== false,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  return {
    ...query,
    customers:  query.data?.data || [],
    total:      query.data?.total || 0,
    page:       query.data?.page || 1,
    limit:      query.data?.limit || 20,
    totalPages: query.data?.totalPages || 0,
    // Backwards-compat: callsite lama destructures `data` sebagai array.
    data:       query.data?.data || [],
  }
}

export function useCustomer(id) {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['customers', 'detail', user?.tenantId, id],
    queryFn: async () => {
      const res = await api.get(`/customers/${id}`)
      return res.data?.data
    },
    enabled: !!id && !!user?.tenantId,
    staleTime: 30_000,
  })
}

export function useCustomerStats() {
  const { user } = useAuthStore()
  const tenantId = user?.tenantId

  // One-time cleanup cache lama (v1 + v2) di localStorage — sebelumnya kita
  // simpan stats di sana sebagai initialData, tapi itu bikin "flash stale"
  // (user lihat angka kunjungan sebelumnya selama 1-2 detik). Sekarang andalkan
  // React Query cache + skeleton loader saja. Dijalankan di efek (bukan badan
  // render) supaya render tetap murni & tak menyentuh storage tiap re-render.
  useEffect(() => {
    if (typeof window === 'undefined' || !tenantId) return
    try {
      window.localStorage.removeItem(`customer-stats:${tenantId}`)
      window.localStorage.removeItem(`customer-stats-v2:${tenantId}`)
    } catch {}
  }, [tenantId])

  return useQuery({
    queryKey: ['customers', 'stats', tenantId],
    queryFn: async () => {
      const res = await api.get('/customers/stats', { params: { tenantId } })
      return res.data?.data || null
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  })
}

const invalidateAll = (qc, tenantId) => {
  qc.invalidateQueries({ queryKey: ['customers', tenantId] })
  qc.invalidateQueries({ queryKey: ['customers', 'stats', tenantId] })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (data) => api.post('/customers', { ...data, tenantId: user?.tenantId }).then(r => r.data?.data),
    onSuccess: () => invalidateAll(qc, user?.tenantId),
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/customers/${id}`, data).then(r => r.data?.data),
    onSuccess: (_data, vars) => {
      invalidateAll(qc, user?.tenantId)
      if (vars?.id) qc.invalidateQueries({ queryKey: ['customers', 'detail', user?.tenantId, vars.id] })
    },
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (id) => api.delete(`/customers/${id}`),
    onSuccess: () => invalidateAll(qc, user?.tenantId),
  })
}

export function useBulkDeleteCustomers() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (ids) => api.post('/customers/bulk-delete', { ids }).then(r => r.data?.data),
    onSuccess: () => invalidateAll(qc, user?.tenantId),
  })
}

/**
 * Ambil semua data customer terfilter (max 5000) untuk ekspor lengkap.
 * Dipakai imperatively (mutateAsync) supaya hanya jalan saat tombol diklik.
 */
export function useExportCustomers() {
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: async (filters = {}) => {
      const params = { tenantId: user?.tenantId, ...filters }
      const res = await api.get('/customers/export/all', { params })
      return {
        data: res.data?.data || [],
        meta: res.data?.meta || { count: 0, capped: false },
      }
    },
  })
}

export function useUpdateLoyalty() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: ({ id, points, reason }) =>
      api.patch(`/customers/${id}/loyalty`, { points, reason }).then(r => r.data?.data),
    onSuccess: (_data, vars) => {
      invalidateAll(qc, user?.tenantId)
      if (vars?.id) {
        qc.invalidateQueries({ queryKey: ['customers', 'detail', user?.tenantId, vars.id] })
        qc.invalidateQueries({ queryKey: ['customers', 'point-history', vars.id] })
      }
    },
  })
}

/**
 * Riwayat pergerakan poin loyalitas untuk satu customer.
 * Pagination cursor-based: meta.nextCursor → kirim ke kueri berikutnya.
 */
export function usePointHistory(customerId, { limit = 50 } = {}) {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['customers', 'point-history', customerId, { limit }],
    queryFn: async () => {
      const res = await api.get(`/customers/${customerId}/point-history`, { params: { limit } })
      return {
        items: res.data?.data || [],
        meta:  res.data?.meta || { balance: 0, hasMore: false, nextCursor: null },
      }
    },
    enabled: !!customerId && !!user?.tenantId,
    staleTime: 15_000,
  })
}
