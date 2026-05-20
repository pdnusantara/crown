import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import api from '../lib/api.js'
import { useAuthStore } from '../store/authStore.js'
import { getSocket } from '../lib/socket.js'

// Subscribe ke event transaction:* dari tenant room. Backend emit saat ada
// transaksi baru, status berubah (cancel/refund), atau update lain — UI yang
// sedang buka halaman transactions/POS langsung sinkron tanpa nunggu polling.
function useTransactionRealtime(tenantId) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!tenantId) return
    const socket = getSocket()
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ['transactions', 'list', tenantId] })
      qc.invalidateQueries({ queryKey: ['transactions', 'detail', tenantId] })
    }
    socket.on('transaction:created', invalidate)
    socket.on('transaction:updated', invalidate)
    return () => {
      socket.off('transaction:created', invalidate)
      socket.off('transaction:updated', invalidate)
    }
  }, [tenantId, qc])
}

// Hook utama: paginated. Backend mengembalikan paginatedResponse:
// { data: [...], total, page, limit, totalPages }
// — kita expose itu apa adanya supaya pemanggil bisa kontrol pagination UI.
export function useTransactions(filters = {}) {
  const { user } = useAuthStore()
  const tenantId = user?.tenantId
  useTransactionRealtime(tenantId)

  const query = useQuery({
    queryKey: ['transactions', 'list', tenantId, filters],
    queryFn: async () => {
      const res = await api.get('/transactions', {
        params: { tenantId, ...filters },
      })
      const raw = res.data?.data
      if (Array.isArray(raw)) {
        return { data: raw, total: raw.length, page: 1, limit: raw.length, totalPages: 1 }
      }
      return {
        data: raw?.data || [],
        total: raw?.total ?? 0,
        page: raw?.page ?? (Number(filters.page) || 1),
        limit: raw?.limit ?? (Number(filters.limit) || 20),
        totalPages: raw?.totalPages ?? 0,
      }
    },
    enabled: !!tenantId,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })

  return {
    ...query,
    transactions: query.data?.data || [],
    total: query.data?.total || 0,
    page: query.data?.page || 1,
    limit: query.data?.limit || 20,
    totalPages: query.data?.totalPages || 0,
  }
}

// Single transaction, untuk deep-link ?tx=ID. Mengisi data lengkap (items+service)
// kalau detail belum ada di list cache.
export function useTransaction(id) {
  const { user } = useAuthStore()
  useTransactionRealtime(user?.tenantId)
  return useQuery({
    queryKey: ['transactions', 'detail', user?.tenantId, id],
    queryFn: async () => {
      const res = await api.get(`/transactions/${id}`)
      return res.data?.data
    },
    enabled: !!id && !!user?.tenantId,
    staleTime: 60_000,
  })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (data) => api.post('/transactions', data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions', 'list', user?.tenantId] }),
  })
}

// Update status: completed | cancelled | refunded
export function useUpdateTransactionStatus() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: ({ id, status }) =>
      api.patch(`/transactions/${id}/status`, { status }).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions', 'list', user?.tenantId] })
      qc.invalidateQueries({ queryKey: ['transactions', 'detail', user?.tenantId] })
    },
  })
}

// Fetch semua transaksi pada filter saat ini — untuk export CSV.
// Iterasi paginated agar tidak timeout di tenant besar.
export async function fetchAllTransactions({ tenantId, ...filters }) {
  const all = []
  const limit = 200
  let page = 1
  let totalPages = 1
  while (page <= totalPages && page <= 50 /* safety cap */) {
    const res = await api.get('/transactions', {
      params: { tenantId, ...filters, page, limit },
    })
    const raw = res.data?.data
    const items = Array.isArray(raw) ? raw : (raw?.data || [])
    all.push(...items)
    totalPages = raw?.totalPages || 1
    page += 1
  }
  return all
}
