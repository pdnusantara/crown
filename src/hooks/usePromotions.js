import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

const REALTIME_EVENTS = ['promotion:created', 'promotion:updated']

function usePromotionRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const onChange = () => qc.invalidateQueries({ queryKey: ['promotions'] })
    REALTIME_EVENTS.forEach(evt => socket.on(evt, onChange))
    return () => REALTIME_EVENTS.forEach(evt => socket.off(evt, onChange))
  }, [qc])
}

export function usePromotions() {
  usePromotionRealtime()
  return useQuery({
    queryKey: ['promotions'],
    queryFn: () => api.get('/promotions').then(r => r.data.data),
    refetchInterval: 60_000,
  })
}

export function useCreatePromotion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/promotions', data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
  })
}

export function useUpdatePromotion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/promotions/${id}`, data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
  })
}

export function useDeactivatePromotion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/promotions/${id}`).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
  })
}

export function useActivatePromotion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.put(`/promotions/${id}`, { isActive: true }).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
  })
}

export function usePromotionRedemptions(id) {
  return useQuery({
    queryKey: ['promotions', id, 'redemptions'],
    queryFn: () => api.get(`/promotions/${id}/redemptions`).then(r => r.data.data),
    enabled: !!id,
  })
}
