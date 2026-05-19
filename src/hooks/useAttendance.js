import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

// Realtime — saat ada perubahan absensi/jadwal di tenant, segarkan semua query.
function useAttendanceRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const socket = getSocket()
    const onChange = () => qc.invalidateQueries({ queryKey: ['attendance'] })
    socket.on('attendance:changed', onChange)
    socket.on('attendance:schedule_changed', onChange)
    return () => {
      socket.off('attendance:changed', onChange)
      socket.off('attendance:schedule_changed', onChange)
    }
  }, [qc])
}

// ── Staf: status hari ini, riwayat, check-in/out ────────────────────────────
export function useMyAttendanceToday() {
  useAttendanceRealtime()
  return useQuery({
    queryKey: ['attendance', 'me', 'today'],
    queryFn: async () => (await api.get('/attendance/me/today')).data.data,
    staleTime: 1000 * 30,
    retry: false,
  })
}

export function useMyAttendanceHistory() {
  return useQuery({
    queryKey: ['attendance', 'me', 'history'],
    queryFn: async () => (await api.get('/attendance/me/history')).data.data || [],
    retry: false,
  })
}

export function useCheckIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (geo) => api.post('/attendance/check-in', geo).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  })
}

export function useCheckOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (geo) => api.post('/attendance/check-out', geo).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  })
}

// ── Admin: rekap, statistik, laporan ────────────────────────────────────────
export function useAttendanceList(params, enabled = true) {
  useAttendanceRealtime()
  return useQuery({
    queryKey: ['attendance', 'list', params],
    queryFn: async () => {
      const res = await api.get('/attendance', { params })
      return res.data.data // { data, total, page, ... }
    },
    enabled,
    keepPreviousData: true,
  })
}

export function useAttendanceStats(params, enabled = true) {
  return useQuery({
    queryKey: ['attendance', 'stats', params],
    queryFn: async () => (await api.get('/attendance/stats', { params })).data.data,
    enabled,
  })
}

export function useAttendanceReport(params, enabled = true) {
  return useQuery({
    queryKey: ['attendance', 'report', params],
    queryFn: async () => (await api.get('/attendance/report', { params })).data.data,
    enabled,
  })
}

export function useAttendanceSchedules(enabled = true) {
  useAttendanceRealtime()
  return useQuery({
    queryKey: ['attendance', 'schedules'],
    queryFn: async () => (await api.get('/attendance/schedules')).data.data || [],
    enabled,
  })
}

export function useUpdateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ staffId, days }) =>
      api.put(`/attendance/schedules/${staffId}`, { days }).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance', 'schedules'] }),
  })
}

export function useManualAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/attendance/manual', body).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  })
}

export function useUpdateAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/attendance/${id}`, body).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  })
}
