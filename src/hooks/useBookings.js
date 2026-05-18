import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { useAuthStore } from '../store/authStore.js'
import { getSocket, joinBranchRoom, leaveBranchRoom } from '../lib/socket.js'

/**
 * useBookings — list bookings.
 *
 * Mengembalikan { data, isLoading, meta } di mana `meta` berisi
 * pagination response dari backend kalau backend memakai paginatedResponse.
 * Kompatibel dengan response array murni juga.
 */
export function useBookings(filters = {}) {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['bookings', user?.tenantId, filters],
    queryFn: async () => {
      const res = await api.get('/bookings', {
        params: { tenantId: user?.tenantId, ...filters },
      })
      const raw = res.data.data
      if (Array.isArray(raw)) return { data: raw, meta: null }
      return { data: raw?.data || [], meta: raw?.meta || null }
    },
    enabled: !!user?.tenantId,
    keepPreviousData: true,
  })

  // Socket invalidation — ikuti pola useQueue: dengar event di room cabang
  useEffect(() => {
    if (!user?.tenantId) return
    const branchId = filters.branchId || user.branchId
    if (!branchId) return

    const socket = getSocket()
    joinBranchRoom(branchId)

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ['bookings', user.tenantId] })
      qc.invalidateQueries({ queryKey: ['bookings-stats', user.tenantId] })
    }

    socket.on('booking:created', invalidate)
    socket.on('booking:updated', invalidate)
    socket.on('booking:deleted', invalidate)

    const handleReconnect = () => {
      joinBranchRoom(branchId)
      invalidate()
    }
    socket.on('connect', handleReconnect)

    return () => {
      socket.off('booking:created', invalidate)
      socket.off('booking:updated', invalidate)
      socket.off('booking:deleted', invalidate)
      socket.off('connect', handleReconnect)
      leaveBranchRoom(branchId)
    }
  }, [user?.tenantId, user?.branchId, filters.branchId, qc])

  return {
    ...query,
    data: query.data?.data || [],
    meta: query.data?.meta || null,
  }
}

/**
 * useBookingStats — agregat tenant+cabang yang akurat lintas halaman
 * (kartu statistik tidak boleh dihitung dari satu page saja).
 */
export function useBookingStats(filters = {}) {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: ['bookings-stats', user?.tenantId, filters],
    queryFn: async () => {
      const res = await api.get('/bookings/stats', {
        params: { tenantId: user?.tenantId, ...filters },
      })
      return res.data.data
    },
    enabled: !!user?.tenantId,
    keepPreviousData: true,
  })
}

/**
 * fetchAllBookings — tarik semua booking pada filter saat ini untuk export CSV.
 * Iterasi paginated agar tidak timeout di tenant besar.
 */
export async function fetchAllBookings({ tenantId, ...filters }) {
  const all = []
  const limit = 200
  let page = 1
  let totalPages = 1
  while (page <= totalPages && page <= 50 /* safety cap */) {
    const res = await api.get('/bookings', {
      params: { tenantId, ...filters, page, limit },
    })
    const raw = res.data?.data
    const items = Array.isArray(raw) ? raw : (raw?.data || [])
    all.push(...items)
    totalPages = raw?.totalPages || raw?.meta?.totalPages || 1
    page += 1
  }
  return all
}

// Patch optimistik ke SEMUA cache list booking tenant ini sekaligus —
// query key memuat objek filter sehingga ada banyak entri tercache.
function patchBookingCaches(qc, tenantId, patchFn) {
  const snapshot = qc.getQueriesData({ queryKey: ['bookings', tenantId] })
  qc.setQueriesData({ queryKey: ['bookings', tenantId] }, (old) => {
    if (!old || !Array.isArray(old.data)) return old
    return { ...old, data: old.data.map(patchFn) }
  })
  return snapshot
}

export function useCreateBooking() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (data) => api.post('/bookings', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings', user?.tenantId] })
      qc.invalidateQueries({ queryKey: ['bookings-stats', user?.tenantId] })
    },
  })
}

export function useUpdateBooking() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/bookings/${id}`, data).then(r => r.data.data),
    onMutate: async ({ id, ...data }) => {
      await qc.cancelQueries({ queryKey: ['bookings', user?.tenantId] })
      const snapshot = patchBookingCaches(qc, user?.tenantId, (b) =>
        b.id === id ? { ...b, ...data } : b
      )
      return { snapshot }
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshot?.forEach(([key, data]) => qc.setQueryData(key, data))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['bookings', user?.tenantId] })
      qc.invalidateQueries({ queryKey: ['bookings-stats', user?.tenantId] })
    },
  })
}

export function useDeleteBooking() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (id) => api.delete(`/bookings/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['bookings', user?.tenantId] })
      const snapshot = patchBookingCaches(qc, user?.tenantId, (b) =>
        b.id === id ? { ...b, status: 'cancelled' } : b
      )
      return { snapshot }
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshot?.forEach(([key, data]) => qc.setQueryData(key, data))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['bookings', user?.tenantId] })
      qc.invalidateQueries({ queryKey: ['bookings-stats', user?.tenantId] })
    },
  })
}

/**
 * useBulkBooking — konfirmasi / batalkan banyak booking sekaligus
 * lewat satu request ke POST /bookings/bulk.
 */
export function useBulkBooking() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: ({ ids, action }) =>
      api.post('/bookings/bulk', { ids, action }).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings', user?.tenantId] })
      qc.invalidateQueries({ queryKey: ['bookings-stats', user?.tenantId] })
    },
  })
}

/**
 * Check-in: convert booking → queue entry (today).
 * Backend akan emit `queue:created` + `booking:updated`.
 */
export function useCheckInBooking() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (id) => api.post(`/bookings/${id}/check-in`).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings', user?.tenantId] })
      qc.invalidateQueries({ queryKey: ['bookings-stats', user?.tenantId] })
      qc.invalidateQueries({ queryKey: ['queue'] })
    },
  })
}
