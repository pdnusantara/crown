import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import api from '../lib/api.js'
import { useAuthStore } from '../store/authStore.js'

// useServices — paginated. Backend mengembalikan paginatedResponse:
// { data, total, page, limit, totalPages }. Hook expose itu apa adanya
// supaya pemanggil bisa kontrol pagination UI sekaligus tetap kompatibel
// dengan callsite lama yang langsung pakai array (legacy).
export function useServices(filters = {}) {
  const { user } = useAuthStore()
  const tenantId = user?.tenantId

  // `enabled` adalah opsi gating, bukan parameter API — jangan ikut dikirim.
  const { enabled: enabledOpt, ...restFilters } = filters

  // Default ke limit besar bila pemanggil tidak menentukan pagination —
  // halaman lama (POS, Bookings, Queue) butuh seluruh layanan untuk picker.
  // Halaman admin (TAServicesPage) override dengan page/limit eksplisit.
  const params = { tenantId, ...restFilters }
  if (params.limit == null && params.page == null) params.limit = 500

  const query = useQuery({
    queryKey: ['services', tenantId, params],
    queryFn: async () => {
      const res = await api.get('/services', {
        params,
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
    enabled: !!tenantId && enabledOpt !== false,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  // Compat: callsite lama (POSPage, BookingsPage, dst.) iterasi langsung.
  // Expose juga `services` array agar destructuring `useServices().data` di
  // kode lama tetap dapat array.
  return {
    ...query,
    services: query.data?.data || [],
    total: query.data?.total || 0,
    page: query.data?.page || 1,
    limit: query.data?.limit || 20,
    totalPages: query.data?.totalPages || 0,
    // Backwards-compat: `.data` pada bentuk lama berisi array of services.
    data: query.data?.data || [],
  }
}

// Categories distinct dengan count, untuk filter chips & form combobox.
export function useServiceCategories() {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['services', 'categories', user?.tenantId],
    queryFn: async () => {
      const res = await api.get('/services/categories', { params: { tenantId: user?.tenantId } })
      const raw = res.data?.data
      return Array.isArray(raw) ? raw : []
    },
    enabled: !!user?.tenantId,
    staleTime: 60_000,
  })
}

// Stats untuk kartu summary di header.
export function useServiceStats() {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['services', 'stats', user?.tenantId],
    queryFn: async () => {
      const res = await api.get('/services/stats', { params: { tenantId: user?.tenantId } })
      return res.data?.data || null
    },
    enabled: !!user?.tenantId,
    staleTime: 60_000,
  })
}

const invalidateAll = (qc, tenantId) => {
  qc.invalidateQueries({ queryKey: ['services', tenantId] })
  qc.invalidateQueries({ queryKey: ['services', 'categories', tenantId] })
  qc.invalidateQueries({ queryKey: ['services', 'stats', tenantId] })
}

export function useCreateService() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (data) => api.post('/services', { ...data, tenantId: user?.tenantId }).then(r => r.data?.data),
    onSuccess: () => invalidateAll(qc, user?.tenantId),
  })
}

export function useUpdateService() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/services/${id}`, data).then(r => r.data?.data),
    onSuccess: () => invalidateAll(qc, user?.tenantId),
  })
}

export function useDeleteService() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (id) => api.delete(`/services/${id}`),
    onSuccess: () => invalidateAll(qc, user?.tenantId),
  })
}
