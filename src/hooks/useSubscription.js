import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'

// Fetch subscription berdasarkan tenantId (bukan subscription.id)
export function useSubscription(tenantId) {
  return useQuery({
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
}

// List subscriptions — super admin
export function useSubscriptions(filters = {}) {
  return useQuery({
    queryKey: ['subscriptions', filters],
    queryFn: async () => {
      const res = await api.get('/subscriptions', { params: filters })
      const raw = res.data.data
      return Array.isArray(raw) ? raw : (raw?.data || [])
    },
  })
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

// Backward-compat export — beberapa halaman mungkin masih import ini
export function useUpdateSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) =>
      api.put(`/subscriptions/${id}`, data).then(r => r.data.data),
    onSuccess: (data) => invalidate(qc, data?.tenantId),
  })
}
