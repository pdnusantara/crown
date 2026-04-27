import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { ALL_FEATURE_FLAGS } from '../store/featureFlagStore.js'

// GET /api/feature-flags/:tenantId
// Backend returns [{id, label, category, enabled}]; we extract enabled IDs.
export function useFeatureFlags(tenantId) {
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
    staleTime: 1000 * 60 * 5,
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
