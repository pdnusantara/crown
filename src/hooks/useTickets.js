import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

function useTicketRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const invalidateLists = (ticket) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      if (ticket?.id) qc.invalidateQueries({ queryKey: ['ticket', ticket.id] })
    }
    socket.on('ticket:created', invalidateLists)
    socket.on('ticket:updated', invalidateLists)
    socket.on('ticket:replied', invalidateLists)
    return () => {
      socket.off('ticket:created', invalidateLists)
      socket.off('ticket:updated', invalidateLists)
      socket.off('ticket:replied', invalidateLists)
    }
  }, [qc])
}

export function useTickets(tenantId) {
  useTicketRealtime()
  return useQuery({
    queryKey: ['tickets', tenantId],
    queryFn: async () => {
      const res = await api.get('/tickets', { params: { tenantId } })
      const raw = res.data.data
      return Array.isArray(raw) ? raw : (raw?.data || [])
    },
    enabled: !!tenantId,
  })
}

export function useAllTickets() {
  useTicketRealtime()
  return useQuery({
    queryKey: ['tickets', 'all'],
    queryFn: async () => {
      const res = await api.get('/tickets')
      const raw = res.data.data
      return Array.isArray(raw) ? raw : (raw?.data || [])
    },
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
    mutationFn: ({ id, status }) =>
      api.patch(`/tickets/${id}`, { status }).then(r => r.data.data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      if (variables?.id) qc.invalidateQueries({ queryKey: ['ticket', variables.id] })
    },
  })
}
