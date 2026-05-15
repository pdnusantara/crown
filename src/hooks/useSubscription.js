import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

// Fetch subscription berdasarkan tenantId (bukan subscription.id)
export function useSubscription(tenantId) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['subscription', tenantId],
    queryFn: async () => {
      const res = await api.get(`/subscriptions/tenant/${tenantId}`)
      return res.data.data
    },
    enabled: !!tenantId,
    // Jangan retry kalau 404 (tenant baru belum punya subscription)
    retry: (failureCount, error) => {
      if (error?.response?.status === 404) return false
      return failureCount < 2
    },
  })

  useEffect(() => {
    if (!tenantId) return
    const s = getSocket()
    const onUpdate = (payload) => {
      if (!payload || payload.tenantId === tenantId) {
        qc.invalidateQueries({ queryKey: ['subscription', tenantId] })
      }
    }
    s.on('subscription:updated', onUpdate)
    return () => { s.off('subscription:updated', onUpdate) }
  }, [qc, tenantId])

  return query
}

// List subscriptions — super admin
export function useSubscriptions(filters = {}) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['subscriptions', filters],
    queryFn: async () => {
      const res = await api.get('/subscriptions', { params: filters })
      const raw = res.data.data
      return Array.isArray(raw) ? raw : (raw?.data || [])
    },
  })

  // Realtime sync: backend emit `subscription:any-updated` saat ada
  // mutation di tab/admin lain → list ini langsung refetch.
  useEffect(() => {
    const s = getSocket()
    const onAny = () => qc.invalidateQueries({ queryKey: ['subscriptions'] })
    s.on('subscription:any-updated', onAny)
    return () => { s.off('subscription:any-updated', onAny) }
  }, [qc])

  return query
}

// MRR dihitung dari subscription active + overdue
export function computeMrr(subscriptions) {
  return (subscriptions || [])
    .filter(s => s.status === 'active' || s.status === 'overdue')
    .reduce((sum, s) => sum + (s.price || 0), 0)
}

function invalidate(qc, tenantId) {
  qc.invalidateQueries({ queryKey: ['subscription', tenantId] })
  qc.invalidateQueries({ queryKey: ['subscriptions'] })
  qc.invalidateQueries({ queryKey: ['tenants'] })
}

export function useUpgradePackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subscriptionId, package: packageName }) =>
      api.patch(`/subscriptions/${subscriptionId}/upgrade`, { package: packageName }).then(r => r.data.data),
    onSuccess: (data) => invalidate(qc, data?.tenantId),
  })
}

export function useRenewSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subscriptionId }) =>
      api.patch(`/subscriptions/${subscriptionId}/renew`).then(r => r.data.data),
    onSuccess: (data) => invalidate(qc, data?.tenantId),
  })
}

export function useToggleAutoRenew() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subscriptionId }) =>
      api.patch(`/subscriptions/${subscriptionId}/auto-renew`).then(r => r.data.data),
    onSuccess: (data) => invalidate(qc, data?.tenantId),
  })
}

// Pause subscription — body: { pauseUntil (ISO), reason? }
export function usePauseSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subscriptionId, pauseUntil, reason }) =>
      api.post(`/subscriptions/${subscriptionId}/pause`, { pauseUntil, reason }).then(r => r.data.data),
    onSuccess: (data) => invalidate(qc, data?.tenantId),
  })
}

export function useResumeSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subscriptionId }) =>
      api.post(`/subscriptions/${subscriptionId}/resume`).then(r => r.data.data),
    onSuccess: (data) => invalidate(qc, data?.tenantId),
  })
}

export function usePayInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subscriptionId, invoiceId }) =>
      api.patch(`/subscriptions/${subscriptionId}/invoices/${invoiceId}/pay`).then(r => r.data.data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['subscription'] })
      qc.invalidateQueries({ queryKey: ['subscriptions'] })
    },
  })
}

export function useCreateSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) =>
      api.post('/subscriptions', data).then(r => r.data.data),
    onSuccess: (data) => invalidate(qc, data?.tenantId),
  })
}

export function useGrantBranchLicense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subscriptionId, note }) =>
      api.post(`/subscriptions/${subscriptionId}/grant-branch`, { note }).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches'] })
      qc.invalidateQueries({ queryKey: ['subscription'] })
      qc.invalidateQueries({ queryKey: ['subscriptions'] })
    },
  })
}

// Backward-compat export — beberapa halaman mungkin masih import ini
export function useUpdateSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) =>
      api.put(`/subscriptions/${id}`, data).then(r => r.data.data),
    onSuccess: (data) => invalidate(qc, data?.tenantId),
  })
}
