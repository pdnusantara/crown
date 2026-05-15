import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'

// Settings lengkap — hanya super_admin (form payment gateway).
export function usePaymentSettings() {
  return useQuery({
    queryKey: ['payment-settings'],
    queryFn: () => api.get('/payment/settings').then(r => r.data.data),
  })
}

// Hanya flag `active` — boleh dipakai semua user (tenant_admin perlu tahu
// apakah tombol Bayar / Upgrade bisa ditampilkan).
export function usePaymentStatus() {
  return useQuery({
    queryKey: ['payment-status'],
    queryFn: () => api.get('/payment/status').then(r => r.data.data),
    staleTime: 60_000,
  })
}

export function useUpdatePaymentSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.put('/payment/settings', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-settings'] }),
  })
}

export function useCreatePaymentOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/payment/create', data).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-payment-orders'] }),
  })
}

// Cancel pending order
export function useCancelPaymentOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (merchantOrderId) =>
      api.post(`/payment/orders/${merchantOrderId}/cancel`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-payment-orders'] }),
  })
}

// Resend payment link via WhatsApp
export function useResendPaymentLink() {
  return useMutation({
    mutationFn: (merchantOrderId) =>
      api.post(`/payment/orders/${merchantOrderId}/resend`).then(r => r.data),
  })
}

// Validate promo code (preview)
export function useValidatePromo() {
  return useMutation({
    mutationFn: (data) => api.post('/payment/promotions/validate', data).then(r => r.data.data),
  })
}

export function useCheckPaymentOrder(merchantOrderId, enabled) {
  return useQuery({
    queryKey: ['payment-order', merchantOrderId],
    queryFn: () => api.get(`/payment/check/${merchantOrderId}`).then(r => r.data.data),
    enabled: !!merchantOrderId && enabled,
    refetchInterval: (data) => (data?.status === 'pending' ? 5000 : false),
  })
}

export function usePaymentOrders(filters = {}) {
  return useQuery({
    queryKey: ['payment-orders', filters],
    queryFn: () => api.get('/payment/orders', { params: filters }).then(r => r.data.data),
  })
}

export function useMyPaymentOrders() {
  return useQuery({
    queryKey: ['my-payment-orders'],
    queryFn: () => api.get('/payment/my-orders').then(r => r.data.data),
    refetchInterval: 30_000,
  })
}
