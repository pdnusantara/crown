import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { ALL_FEATURE_FLAGS } from '../store/featureFlagStore.js'
import { getSocket } from '../lib/socket.js'

const FLAG_EVENT = 'featureFlag:changed'

function useFlagRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const onChange = (payload) => {
      const tenantId = payload?.tenantId
      qc.invalidateQueries({ queryKey: ['featureFlags'] })
      if (tenantId) qc.invalidateQueries({ queryKey: ['featureFlags', tenantId] })
    }
    socket.on(FLAG_EVENT, onChange)
    return () => socket.off(FLAG_EVENT, onChange)
  }, [qc])
}

// GET /api/feature-flags/:tenantId
// Backend returns [{id, label, category, enabled}]; we extract enabled IDs.
export function useFeatureFlags(tenantId) {
  useFlagRealtime()
  return useQuery({
    queryKey: ['featureFlags', tenantId],
    queryFn: async () => {
      const res = await api.get(`/feature-flags/${tenantId}`)
      const data = res.data.data || []
      // Support both shapes: array of objects with `enabled`, or plain string array
      if (data.length === 0) return []
      if (typeof data[0] === 'string') return data
      return data.filter(f => f.enabled).map(f => f.id)
    },
    enabled: !!tenantId,
    // Flag jarang berubah, tapi saat berubah harus cepat reflect (feature on/off).
    // WS event `featureFlag:changed` handle realtime; staleTime 60s cukup sebagai
    // safety net + memanfaatkan refetchOnWindowFocus saat user balik ke tab.
    staleTime: 60_000,
    retry: false,
  })
}

export function useIsFeatureEnabled(tenantId, flagId) {
  const { data: flags = [] } = useFeatureFlags(tenantId)
  return flags.includes(flagId)
}

export function useUpdateFeatureFlags() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tenantId, flags }) => {
      // Convert array of enabled IDs → [{flagId, enabled}] for all known flags
      const body = ALL_FEATURE_FLAGS.map(f => ({
        flagId:  f.id,
        enabled: flags.includes(f.id),
      }))
      return api.put(`/feature-flags/${tenantId}`, { flags: body }).then(r => r.data.data)
    },
    onSuccess: (_, variables) =>
      qc.invalidateQueries({ queryKey: ['featureFlags', variables.tenantId] }),
  })
}

// Sinkronkan flag SATU tenant ke Package.features (DB) — reset semua override.
export function useSyncTenantToPackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tenantId) =>
      api.post(`/feature-flags/${tenantId}/sync-package`).then((r) => r.data?.data),
    onSuccess: (_data, tenantId) => {
      qc.invalidateQueries({ queryKey: ['featureFlags', tenantId] })
      qc.invalidateQueries({ queryKey: ['featureFlags', 'audit'] })
    },
  })
}

// Drift report — list tenant yang flag-nya tidak sesuai Package.features.
export function useFeatureFlagAudit() {
  return useQuery({
    queryKey: ['featureFlags', 'audit'],
    queryFn: async () => (await api.get('/feature-flags/audit')).data?.data,
    staleTime: 30_000,
  })
}

// Sinkronkan SEMUA tenant aktif sekaligus + bersihkan orphan flag.
export function useSyncAllTenants() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/feature-flags/sync-all').then((r) => r.data?.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['featureFlags'] })
    },
  })
}
