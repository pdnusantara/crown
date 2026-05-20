import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import api from '../lib/api.js'
import { useAuthStore } from '../store/authStore.js'
import { getSocket } from '../lib/socket.js'

// Rating "barbershop" overall yang masuk dari halaman publik /rating/:id.
// Read-only; backend scope otomatis berdasar role (kasir=branch, barber=self,
// admin=tenant). Realtime via event `rating:created` (same channel dengan
// BarberRating supaya satu submit publik update keduanya).

function useShopRatingRealtime(tenantId) {
  const qc = useQueryClient()
  const timerRef = useRef(null)
  useEffect(() => {
    if (!tenantId) return
    const socket = getSocket()
    const scheduleInvalidate = () => {
      if (timerRef.current) return
      timerRef.current = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['shop-ratings', tenantId] })
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

export function useShopRatings(filters = {}) {
  const { user } = useAuthStore()
  const tenantId = user?.tenantId
  useShopRatingRealtime(tenantId)

  const params = {}
  for (const k of Object.keys(filters)) {
    const v = filters[k]
    if (v != null && v !== '' && v !== 'all') params[k] = v
  }

  return useQuery({
    queryKey: ['shop-ratings', tenantId, params],
    queryFn: async () => {
      const res = await api.get('/shop-ratings', { params })
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

export function useShopRatingStats({ branchId } = {}) {
  const { user } = useAuthStore()
  const tenantId = user?.tenantId
  useShopRatingRealtime(tenantId)
  return useQuery({
    queryKey: ['shop-ratings', 'stats', tenantId, { branchId }],
    queryFn: async () => {
      const res = await api.get('/shop-ratings/stats', { params: { branchId } })
      return res.data?.data || null
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  })
}
