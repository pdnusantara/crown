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
    }

    socket.on('booking:created', invalidate)
    socket.on('booking:updated', invalidate)
    socket.on('booking:deleted', invalidate)

    const handleReconnect = () => {
      joinBranchRoom(branchId)
      qc.invalidateQueries({ queryKey: ['bookings', user.tenantId] })
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

export function useCreateBooking() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (data) => api.post('/bookings', data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings', user?.tenantId] }),
  })
}

export function useUpdateBooking() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/bookings/${id}`, data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings', user?.tenantId] }),
  })
}

export function useDeleteBooking() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: (id) => api.delete(`/bookings/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings', user?.tenantId] }),
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
      qc.invalidateQueries({ queryKey: ['queue'] })
    },
  })
}
