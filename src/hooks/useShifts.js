import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { useAuthStore } from '../store/authStore.js'
import { getSocket, joinBranchRoom, leaveBranchRoom } from '../lib/socket.js'

export function useActiveShift(branchId) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['shifts', 'active', branchId],
    queryFn: async () => {
      const res = await api.get('/shifts/active', { params: { branchId } })
      return res.data.data
    },
    enabled: !!branchId,
    refetchInterval: 30_000,
  })

  // Realtime: shift ditutup dari device lain (kasir login ganda) → langsung
  // sinkron tanpa menunggu polling 30s.
  useEffect(() => {
    if (!branchId) return
    const socket = getSocket()
    joinBranchRoom(branchId)
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ['shifts', 'active', branchId] })
      qc.invalidateQueries({ queryKey: ['shifts'] })
    }
    socket.on('shift:closed', refresh)
    socket.on('shift:opened', refresh)
    socket.on('connect', refresh)
    return () => {
      socket.off('shift:closed', refresh)
      socket.off('shift:opened', refresh)
      socket.off('connect', refresh)
      leaveBranchRoom(branchId)
    }
  }, [branchId, qc])

  return query
}

/**
 * useShifts — list shifts dengan pagination meta.
 * `enabled` adalah opsi gating (tidak diteruskan sebagai param API).
 */
export function useShifts(filters = {}) {
  const { enabled, ...params } = filters
  return useQuery({
    queryKey: ['shifts', params],
    queryFn: async () => {
      const res = await api.get('/shifts', { params })
      const raw = res.data.data
      if (Array.isArray(raw)) return { data: raw, meta: null }
      return { data: raw?.data || [], meta: raw?.meta || null }
    },
    enabled: enabled !== false,
    keepPreviousData: true,
  })
}

/**
 * useShiftSummary — ambil summary penuh (payment breakdown, top services,
 * barber performance) dari API. Data real, bukan dari local zustand.
 *
 * Auto-refetch setiap 15s agar nominal hidup saat kasir masih melayani.
 */
export function useShiftSummary(shiftId, { refetchMs = 15_000 } = {}) {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const branchId = user?.branchId

  const query = useQuery({
    queryKey: ['shifts', 'summary', shiftId],
    queryFn: async () => {
      const res = await api.get(`/shifts/${shiftId}/summary`)
      return res.data.data
    },
    enabled: !!shiftId,
    refetchInterval: refetchMs,
  })

  // Live refresh: kalau ada transaction:created / queue paid di branch ini,
  // langsung invalidate supaya KPI berdetak tanpa nunggu interval.
  useEffect(() => {
    if (!shiftId || !branchId) return
    const socket = getSocket()
    joinBranchRoom(branchId)

    const refresh = () => qc.invalidateQueries({ queryKey: ['shifts', 'summary', shiftId] })
    socket.on('transaction:created', refresh)
    socket.on('queue:updated', refresh)
    // Kas keluar dicatat/dihapus dari device lain → ikut refresh.
    socket.on('shift:updated', refresh)

    return () => {
      socket.off('transaction:created', refresh)
      socket.off('queue:updated', refresh)
      socket.off('shift:updated', refresh)
      leaveBranchRoom(branchId)
    }
  }, [shiftId, branchId, qc])

  return query
}

/**
 * useShiftCashOut — catat / hapus "Kas Keluar" (pengeluaran tunai) untuk shift.
 * Setelah sukses, invalidate summary supaya kas seharusnya & daftar ikut update.
 */
export function useShiftCashOut(shiftId) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['shifts', 'summary', shiftId] })

  const add = useMutation({
    mutationFn: ({ amount, description, note }) =>
      api.post(`/shifts/${shiftId}/cash-out`, { amount, description, note }).then(r => r.data.data),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (expenseId) =>
      api.delete(`/shifts/${shiftId}/cash-out/${expenseId}`).then(r => r.data.data),
    onSuccess: invalidate,
  })

  return { add, remove }
}

export function useOpenShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ branchId, openingCash, notes }) =>
      api.post('/shifts/open', { branchId, openingCash, notes }).then(r => r.data.data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['shifts', 'active', variables.branchId] })
      qc.invalidateQueries({ queryKey: ['shifts'] })
    },
  })
}

export function useCloseShift() {
  const qc = useQueryClient()
  return useMutation({
    // FIX: backend route adalah POST, bukan PATCH. Method lama selalu 404.
    mutationFn: ({ id, closingCash, notes }) =>
      api.post(`/shifts/${id}/close`, { closingCash, notes }).then(r => r.data.data),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['shifts', 'active', variables.branchId] })
      qc.invalidateQueries({ queryKey: ['shifts'] })
      qc.invalidateQueries({ queryKey: ['shifts', 'summary', variables.id] })
    },
  })
}
