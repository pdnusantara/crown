import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import api from '../lib/api.js'
import { useAuthStore } from '../store/authStore.js'
import { getSocket } from '../lib/socket.js'

// =============================================================================
// useBarberRatings — list dengan filter + cursor pagination, anti realtime spam
// =============================================================================

/**
 * Realtime subscription per tenant. Throttled: hanya invalidate sekali per 500ms
 * supaya burst 20 rating tidak trigger 20 refetch.
 */
function useRatingRealtime(tenantId) {
  const qc = useQueryClient()
  const timerRef = useRef(null)
  useEffect(() => {
    if (!tenantId) return
    const socket = getSocket()
    const scheduleInvalidate = () => {
      if (timerRef.current) return
      timerRef.current = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['barber-ratings', tenantId] })
        qc.invalidateQueries({ queryKey: ['barber-ratings', 'stats', tenantId] })
        timerRef.current = null
      }, 500)
    }
    socket.on('rating:created', scheduleInvalidate)
    socket.on('rating:updated', scheduleInvalidate)
    socket.on('rating:deleted', scheduleInvalidate)
    return () => {
      socket.off('rating:created', scheduleInvalidate)
      socket.off('rating:updated', scheduleInvalidate)
      socket.off('rating:deleted', scheduleInvalidate)
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    }
  }, [tenantId, qc])
}

/**
 * List rating. Filters disinkronkan ke query key sehingga cache per-filter.
 *
 * @param {object} filters — { barberId, branchId, transactionId, customerId,
 *                              publishStatus, hasTicket, hasComment,
 *                              minRating, maxRating, startDate, endDate,
 *                              search, sortBy, sortDir, limit, cursor, withTotal }
 */
export function useBarberRatings(filters = {}) {
  const { user } = useAuthStore()
  const tenantId = user?.tenantId
  useRatingRealtime(tenantId)

  // Normalisasi: hapus key kosong supaya cache key konsisten
  const params = {}
  for (const k of Object.keys(filters)) {
    const v = filters[k]
    if (v != null && v !== '' && v !== 'all') params[k] = v
  }

  return useQuery({
    queryKey: ['barber-ratings', tenantId, params],
    queryFn: async () => {
      const res = await api.get('/barber-ratings', { params })
      return {
        items: res.data?.data || [],
        meta:  res.data?.meta || { hasMore: false, nextCursor: null, total: null },
      }
    },
    enabled: !!tenantId,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  })
}

export function useBarberRatingStats({ days = 7, branchId } = {}) {
  const { user } = useAuthStore()
  const tenantId = user?.tenantId
  useRatingRealtime(tenantId)
  return useQuery({
    queryKey: ['barber-ratings', 'stats', tenantId, { days, branchId }],
    queryFn: async () => {
      const res = await api.get('/barber-ratings/stats', { params: { days, branchId } })
      return res.data?.data || null
    },
    enabled: !!tenantId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

// =============================================================================
// Mutations — all with optimistic UI where it makes sense
// =============================================================================
function useInvalidateAll() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return () => {
    qc.invalidateQueries({ queryKey: ['barber-ratings', user?.tenantId] })
    qc.invalidateQueries({ queryKey: ['barber-ratings', 'stats', user?.tenantId] })
  }
}

export function useSubmitBarberRatingsBatch() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (payload) => api.post('/barber-ratings/batch', payload).then(r => r.data),
    onSuccess: invalidate,
  })
}

export function useSubmitBarberRating() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (payload) => api.post('/barber-ratings', payload).then(r => r.data?.data),
    onSuccess: invalidate,
  })
}

/**
 * Optimistic publish: update cache langsung, rollback on error.
 */
export function usePublishRating() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  return useMutation({
    mutationFn: ({ id, status }) =>
      api.patch(`/barber-ratings/${id}/publish`, { status }).then(r => r.data?.data),
    onMutate: async ({ id, status }) => {
      const tenantId = user?.tenantId
      const queries = qc.getQueriesData({ queryKey: ['barber-ratings', tenantId] })
      const snapshot = []
      for (const [key, data] of queries) {
        if (!data?.items) continue
        snapshot.push([key, data])
        qc.setQueryData(key, {
          ...data,
          items: data.items.map(item =>
            item.id === id
              ? { ...item, publishStatus: status, publishedAt: status === 'published' ? new Date().toISOString() : null }
              : item
          ),
        })
      }
      return { snapshot }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) ctx.snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['barber-ratings', user?.tenantId] })
      qc.invalidateQueries({ queryKey: ['barber-ratings', 'stats', user?.tenantId] })
    },
  })
}

export function useBulkPublishRatings() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (ids) => api.post('/barber-ratings/bulk-publish', { ids }).then(r => r.data?.data),
    onSuccess: invalidate,
  })
}

export function useBulkHideRatings() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (ids) => api.post('/barber-ratings/bulk-hide', { ids }).then(r => r.data?.data),
    onSuccess: invalidate,
  })
}

export function useBulkDeleteRatings() {
  const invalidate = useInvalidateAll()
  return useMutation({
    mutationFn: (ids) => api.post('/barber-ratings/bulk-delete', { ids }).then(r => r.data?.data),
    onSuccess: invalidate,
  })
}
