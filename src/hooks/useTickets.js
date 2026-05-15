import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

const REALTIME_EVENTS = ['ticket:created', 'ticket:updated', 'ticket:replied', 'ticket:deleted']

function useTicketRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const invalidateLists = (ticket) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: ['ticketsStats'] })
      if (ticket?.id) qc.invalidateQueries({ queryKey: ['ticket', ticket.id] })
    }
    REALTIME_EVENTS.forEach(evt => socket.on(evt, invalidateLists))
    return () => REALTIME_EVENTS.forEach(evt => socket.off(evt, invalidateLists))
  }, [qc])
}

// Normalize the paginated payload that comes back as either:
//   { success: true, data: { data: [...], meta: {...} } }
// (current shape due to historical wrapping in tickets route) or the cleaner
// { data: [...], meta: {...} } shape used by other audit pages.
function normalizePaginated(body) {
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

export function useTickets(tenantId, filters = {}) {
  useTicketRealtime()
  return useQuery({
    queryKey: ['tickets', 'tenant', tenantId, filters],
    queryFn: async () => {
      const res = await api.get('/tickets', { params: { tenantId, ...filters } })
      return normalizePaginated(res.data)
    },
    enabled: !!tenantId,
  })
}

export function useAllTickets(filters = {}) {
  useTicketRealtime()
  return useQuery({
    queryKey: ['tickets', 'all', filters],
    queryFn: async () => {
      const res = await api.get('/tickets', { params: filters })
      return normalizePaginated(res.data)
    },
  })
}

export function useTicketStats(params = {}, enabled = true) {
  useTicketRealtime()
  return useQuery({
    queryKey: ['ticketsStats', params],
    queryFn: async () => {
      const res = await api.get('/tickets/stats', { params })
      return res.data.data
    },
    enabled,
    refetchInterval: enabled ? 60_000 : false,
  })
}

export function useTicket(id) {
  useTicketRealtime()
  return useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => {
      const res = await api.get(`/tickets/${id}`)
      return res.data.data
    },
    enabled: !!id,
  })
}

export function useCreateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/tickets', data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  })
}

export function useReplyToTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) =>
      api.post(`/tickets/${id}/replies`, data).then(r => r.data.data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      if (variables?.id) qc.invalidateQueries({ queryKey: ['ticket', variables.id] })
    },
  })
}

export function useUpdateTicketStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, priority }) =>
      api.patch(`/tickets/${id}`, { status, priority }).then(r => r.data.data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: ['ticketsStats'] })
      if (variables?.id) qc.invalidateQueries({ queryKey: ['ticket', variables.id] })
    },
  })
}

export function useDeleteTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/tickets/${id}`).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      qc.invalidateQueries({ queryKey: ['ticketsStats'] })
    },
  })
}
