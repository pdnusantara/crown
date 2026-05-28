import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'
import { usePublicTenantStore } from '../store/publicTenantStore.js'

// Backend emit `tenant:updated` (CRUD super admin / patch tenant_admin) dan
// `tenant:status-changed` (suspend/aktifkan) — listen di sini supaya tabel
// /super-admin/tenants tidak perlu refresh manual.
function useTenantRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const s = getSocket()
    const invalidate = () => qc.invalidateQueries({ queryKey: ['tenants'] })
    s.on('tenant:updated', invalidate)
    s.on('tenant:status-changed', invalidate)
    return () => {
      s.off('tenant:updated', invalidate)
      s.off('tenant:status-changed', invalidate)
    }
  }, [qc])
}

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
  useTenantRealtime()
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
  useTenantRealtime()
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

// Tenant_admin updates own non-sensitive fields (name, contact, tax info).
// Tidak bisa ubah package / suspend / slug.
//
// onSuccess WAJIB invalidate beberapa sumber sekaligus karena tenant.name +
// tenant.logo direplikasi ke banyak tempat:
//   - `['branches']` cache include nested `tenant` (POSPage receipt baca
//     `currentBranch.tenant.name` untuk header struk → stale tanpa ini)
//   - `usePublicTenantStore` (zustand singleton) jadi sumber nama di /book
//     publik & fallback receipt → perlu re-resolve agar tampil baru
//
// Bug fix 2026-05-28: sebelumnya cuma invalidate ['tenants'], akibatnya
// struk POS masih tampilkan nama lama meski tenant.name sudah di-update.
export function useUpdateMyTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.patch('/tenants/me', data).then(r => normalizeTenant(r.data.data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants'] })
      qc.invalidateQueries({ queryKey: ['branches'] })
      // Re-fetch publicTenantStore (best-effort; tidak block kalau gagal)
      usePublicTenantStore.getState().resolve?.()
    },
  })
}

export function useDeleteTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/tenants/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
  })
}

export function useResetTenantPassword() {
  return useMutation({
    mutationFn: ({ id, newPassword }) =>
      api.post(`/tenants/${id}/reset-password`, newPassword ? { newPassword } : {}).then(r => r.data.data),
  })
}
