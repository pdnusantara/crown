import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

// ─── Realtime ─────────────────────────────────────────────────────────────
const REALTIME_EVENTS = [
  'affiliate:created',
  'affiliate:updated',
  'affiliate:commission_created',
  'affiliate:commission_updated',
  'affiliate:payout_requested',
  'affiliate:payout_updated',
  'affiliate:claim_requested',
  'affiliate:referral_updated',
]

function useAffiliateRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['affiliates'] })
      qc.invalidateQueries({ queryKey: ['affiliate-stats'] })
    }
    REALTIME_EVENTS.forEach(evt => socket.on(evt, handler))
    return () => REALTIME_EVENTS.forEach(evt => socket.off(evt, handler))
  }, [qc])
}

// ─── Super-admin: list ────────────────────────────────────────────────────
export function useAffiliates(params = {}) {
  useAffiliateRealtime()
  return useQuery({
    queryKey: ['affiliates', params],
    queryFn: () => api.get('/affiliates', { params }).then(r => r.data.data),
    refetchInterval: 60_000,
  })
}

export function useAffiliateStats() {
  useAffiliateRealtime()
  return useQuery({
    queryKey: ['affiliate-stats'],
    queryFn: () => api.get('/affiliates/stats').then(r => r.data.data),
    refetchInterval: 60_000,
  })
}

export function useAffiliate(id) {
  // Halaman detail ikut realtime — invalidate ['affiliates'] (prefix) menjangkau
  // ['affiliates', id, ...] juga, jadi tab referrals/komisi/payout ikut segar.
  useAffiliateRealtime()
  return useQuery({
    queryKey: ['affiliates', id],
    queryFn: () => api.get(`/affiliates/${id}`).then(r => r.data.data),
    enabled: !!id,
  })
}

export function useAffiliateReferrals(id) {
  return useQuery({
    queryKey: ['affiliates', id, 'referrals'],
    queryFn: () => api.get(`/affiliates/${id}/referrals`).then(r => r.data.data),
    enabled: !!id,
  })
}

export function useAffiliateCommissions(id, status) {
  return useQuery({
    queryKey: ['affiliates', id, 'commissions', status],
    queryFn: () => api.get(`/affiliates/${id}/commissions`, { params: { status } }).then(r => r.data.data),
    enabled: !!id,
  })
}

export function useAffiliatePayouts(id) {
  return useQuery({
    queryKey: ['affiliates', id, 'payouts'],
    queryFn: () => api.get(`/affiliates/${id}/payouts`).then(r => r.data.data),
    enabled: !!id,
  })
}

// ─── Super-admin: mutations ───────────────────────────────────────────────
function invalidate(qc, id) {
  qc.invalidateQueries({ queryKey: ['affiliates'] })
  qc.invalidateQueries({ queryKey: ['affiliate-stats'] })
  if (id) qc.invalidateQueries({ queryKey: ['affiliates', id] })
}

export function useCreateAffiliate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/affiliates', data).then(r => r.data.data),
    onSuccess: () => invalidate(qc),
  })
}

export function useUpdateAffiliate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/affiliates/${id}`, data).then(r => r.data.data),
    onSuccess: (_d, { id }) => invalidate(qc, id),
  })
}

function actionFactory(verb) {
  return function useAction() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: ({ id, ...body }) => api.post(`/affiliates/${id}/${verb}`, body).then(r => r.data.data),
      onSuccess: (_d, { id }) => invalidate(qc, id),
    })
  }
}
export const useApproveAffiliate    = actionFactory('approve')
export const useReactivateAffiliate = actionFactory('reactivate')
export const useSuspendAffiliate    = actionFactory('suspend')
export const useRejectAffiliate     = actionFactory('reject')
export const useResetAffiliatePassword = actionFactory('reset-password')

export function useApproveCommission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cid) => api.post(`/affiliates/commissions/${cid}/approve`).then(r => r.data.data),
    onSuccess: () => invalidate(qc),
  })
}
export function useVoidCommission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cid, reason }) => api.post(`/affiliates/commissions/${cid}/void`, { reason }).then(r => r.data.data),
    onSuccess: () => invalidate(qc),
  })
}
export function useProcessPayout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pid, adminNote, proofUrl }) =>
      api.post(`/affiliates/payouts/${pid}/process`, { adminNote, proofUrl }).then(r => r.data.data),
    onSuccess: () => invalidate(qc),
  })
}
export function useRejectPayout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pid, adminNote }) =>
      api.post(`/affiliates/payouts/${pid}/reject`, { adminNote }).then(r => r.data.data),
    onSuccess: () => invalidate(qc),
  })
}

// ─── Super-admin: manual claim review ─────────────────────────────────────
export function useAffiliateClaims(status = 'pending') {
  useAffiliateRealtime()
  return useQuery({
    queryKey: ['affiliate-claims', status],
    queryFn: () => api.get('/affiliates/claims', { params: { status } }).then(r => r.data.data),
    refetchInterval: 60_000,
  })
}
function useReviewClaim(decision) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ rid, note }) =>
      api.post(`/affiliates/referrals/${rid}/${decision}-claim`, { note }).then(r => r.data.data),
    onSuccess: () => {
      // invalidate(qc) sudah mencakup ['affiliates', id, 'referrals'] (prefix match).
      invalidate(qc)
      qc.invalidateQueries({ queryKey: ['affiliate-claims'] })
    },
  })
}
export const useApproveClaim = () => useReviewClaim('approve')
export const useRejectClaim  = () => useReviewClaim('reject')

// ─── Affiliate self-service ───────────────────────────────────────────────
const SELF_EVENTS = [
  'affiliate:self_updated',
  'affiliate:commission_created',
  'affiliate:commission_updated',
  'affiliate:payout_updated',
  'affiliate:referral_updated',
]

function useSelfRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['affiliate', 'me'] })
      qc.invalidateQueries({ queryKey: ['affiliate', 'stats'] })
      qc.invalidateQueries({ queryKey: ['affiliate', 'referrals'] })
      qc.invalidateQueries({ queryKey: ['affiliate', 'commissions'] })
      qc.invalidateQueries({ queryKey: ['affiliate', 'payouts'] })
      qc.invalidateQueries({ queryKey: ['affiliate', 'chart'] })
    }
    SELF_EVENTS.forEach(evt => socket.on(evt, handler))
    return () => SELF_EVENTS.forEach(evt => socket.off(evt, handler))
  }, [qc])
}

export function useAffiliateMe() {
  useSelfRealtime()
  return useQuery({
    queryKey: ['affiliate', 'me'],
    queryFn: () => api.get('/affiliate/me').then(r => r.data.data),
  })
}
export function useAffiliateSelfStats() {
  useSelfRealtime()
  return useQuery({
    queryKey: ['affiliate', 'stats'],
    queryFn: () => api.get('/affiliate/stats').then(r => r.data.data),
    refetchInterval: 60_000,
  })
}
export function useAffiliateChart(days = 30) {
  return useQuery({
    queryKey: ['affiliate', 'chart', days],
    queryFn: () => api.get('/affiliate/chart', { params: { days } }).then(r => r.data.data),
  })
}
export function useAffiliateSelfReferrals() {
  useSelfRealtime()
  return useQuery({
    queryKey: ['affiliate', 'referrals'],
    queryFn: () => api.get('/affiliate/referrals').then(r => r.data.data),
  })
}
export function useAffiliateSelfCommissions(status) {
  useSelfRealtime()
  return useQuery({
    queryKey: ['affiliate', 'commissions', status],
    queryFn: () => api.get('/affiliate/commissions', { params: { status } }).then(r => r.data.data),
  })
}
export function useAffiliateSelfPayouts() {
  useSelfRealtime()
  return useQuery({
    queryKey: ['affiliate', 'payouts'],
    queryFn: () => api.get('/affiliate/payouts').then(r => r.data.data),
  })
}

export function useUpdateAffiliateMe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.patch('/affiliate/me', data).then(r => r.data.data),
    onSuccess: (data) => {
      qc.setQueryData(['affiliate', 'me'], data)
      qc.invalidateQueries({ queryKey: ['affiliate'] })
    },
  })
}

export function useRequestPayout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/affiliate/payouts', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['affiliate', 'payouts'] })
      qc.invalidateQueries({ queryKey: ['affiliate', 'stats'] })
      qc.invalidateQueries({ queryKey: ['affiliate', 'me'] })
    },
  })
}

// Affiliate self: ajukan & batalkan klaim manual rujukan.
function invalidateSelfReferrals(qc) {
  qc.invalidateQueries({ queryKey: ['affiliate', 'referrals'] })
  qc.invalidateQueries({ queryKey: ['affiliate', 'stats'] })
}
export function useClaimReferral() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/affiliate/referrals/claim', data).then(r => r.data.data),
    onSuccess: () => invalidateSelfReferrals(qc),
  })
}
export function useCancelClaim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/affiliate/referrals/${id}`).then(r => r.data.data),
    onSuccess: () => invalidateSelfReferrals(qc),
  })
}

// ─── Public ───────────────────────────────────────────────────────────────
export function useReferralCodeLookup(code) {
  return useQuery({
    queryKey: ['affiliate-code', code],
    queryFn: () => api.get(`/public/affiliate-code/${encodeURIComponent(code)}`).then(r => r.data.data),
    enabled: !!code && code.length >= 3,
    staleTime: 60_000,
  })
}

export function useAffiliateRegister() {
  return useMutation({
    mutationFn: (data) => api.post('/public/affiliate-register', data).then(r => r.data.data),
  })
}
