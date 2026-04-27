import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'

function normalizeTenant(t) {
  if (!t) return null
  return {
    ...t,
    // Derived convenience fields — backend payload stays intact
    status: t.isSuspended ? 'suspended' : 'active',
    totalBranches: t._count?.branches ?? 0,
    totalStaff: t._count?.users ?? 0,
    monthlyRevenue: t.monthlyRevenue ?? 0,
    package: t.subscription?.package ?? null,
    subscriptionStatus: t.subscription?.status ?? null,
  }
}

export function useTenants(filters = {}) {
  return useQuery({
    queryKey: ['tenants', filters],
    queryFn: async () => {
      const res = await api.get('/tenants', { params: filters })
      const raw = res.data.data
      // Backend returns paginated { data: [...], meta: {} } — unwrap it
      const list = Array.isArray(raw) ? raw : (raw?.data || [])
      return list.map(normalizeTenant)
    },
  })
}

export function useTenant(id) {
  return useQuery({
    queryKey: ['tenants', id],
    queryFn: async () => {
      const res = await api.get(`/tenants/${id}`)
      return normalizeTenant(res.data.data)
    },
    enabled: !!id,
  })
}

export function useCreateTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/tenants', data).then(r => normalizeTenant(r.data.data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
  })
}

export function useUpdateTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/tenants/${id}`, data).then(r => normalizeTenant(r.data.data)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
  })
}

export function useDeleteTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/tenants/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
  })
}
