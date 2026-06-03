import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'

// Status trial WhatsApp tenant: { status, durationDays, endsAt, daysLeft }
//   status: 'unavailable' | 'available' | 'active' | 'expired'
export function useWhatsappTrial(tenantId) {
  return useQuery({
    queryKey: ['whatsappTrial', tenantId],
    queryFn: async () => (await api.get('/whatsapp/trial')).data.data,
    enabled: !!tenantId,
    staleTime: 60_000,
    retry: false,
  })
}

export function useStartWhatsappTrial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/whatsapp/trial/start').then((r) => r.data.data),
    onSuccess: () => {
      // Trial meng-enable flag → segarkan status trial DAN feature flags supaya
      // tab/menu WA langsung terbuka tanpa reload.
      qc.invalidateQueries({ queryKey: ['whatsappTrial'] })
      qc.invalidateQueries({ queryKey: ['featureFlags'] })
    },
  })
}
