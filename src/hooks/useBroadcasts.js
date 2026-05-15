import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

const REALTIME_EVENTS = ['broadcast:created', 'broadcast:updated', 'broadcast:deleted']

function useBroadcastRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const onChange = () => qc.invalidateQueries({ queryKey: ['broadcasts'] })
    REALTIME_EVENTS.forEach(evt => socket.on(evt, onChange))
    return () => REALTIME_EVENTS.forEach(evt => socket.off(evt, onChange))
  }, [qc])
}

// Backend `paginatedResponse` is wrapped inside `{ success, data: { data, meta } }`
// for broadcasts (legacy double-wrap). Normalize both shapes.
function normalize(body) {
  const inner = body?.data && typeof body.data === 'object' && Array.isArray(body.data.data)
    ? body.data
    : body
  const list = Array.isArray(inner?.data) ? inner.data : (Array.isArray(inner) ? inner : [])
  const meta = inner?.meta || {
    total:    inner?.total      ?? list.length,
    page:     inner?.page       ?? 1,
    limit:    inner?.limit      ?? list.length,
    totalPages: inner?.totalPages ?? 1,
  }
  return { data: list, meta }
}

export function useBroadcasts(tenantId) {
  useBroadcastRealtime()
  return useQuery({
    queryKey: ['broadcasts', tenantId],
    queryFn: async () => {
      const res = await api.get('/broadcasts', { params: { tenantId } })
      const { data } = normalize(res.data)
      return data
    },
    enabled: !!tenantId,
  })
}

export function useAllBroadcasts(filters = {}) {
  useBroadcastRealtime()
  return useQuery({
    queryKey: ['broadcasts', 'all', filters],
    queryFn: async () => {
      const res = await api.get('/broadcasts', { params: filters })
      return normalize(res.data)
    },
  })
}

export function useCreateBroadcast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/broadcasts', data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  })
}

export function useUpdateBroadcast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/broadcasts/${id}`, data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  })
}

export function useDeleteBroadcast() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/broadcasts/${id}`).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  })
}

export function useMarkBroadcastRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.patch(`/broadcasts/${id}/read`).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broadcasts'] }),
  })
}
