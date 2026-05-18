import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

// Public read — landing content
export function useLanding() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['landing'],
    queryFn: () => api.get('/landing').then(r => r.data.data),
    staleTime: 60_000,
  })

  // Realtime: super-admin mengubah paket atau konten landing → halaman ikut
  // segar tanpa reload. Backend emit `package:updated` (PUT /packages/:name)
  // dan `landing:updated` (PATCH /landing/hero + CRUD testimoni/FAQ).
  useEffect(() => {
    const s = getSocket()
    const onUpdate = () => qc.invalidateQueries({ queryKey: ['landing'] })
    s.on('package:updated', onUpdate)
    s.on('landing:updated', onUpdate)
    return () => {
      s.off('package:updated', onUpdate)
      s.off('landing:updated', onUpdate)
    }
  }, [qc])

  return query
}

// Super-admin: hero update
export function useUpdateHero() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.patch('/landing/hero', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['landing'] })
      qc.invalidateQueries({ queryKey: ['landing-admin'] })
    },
  })
}

// Super-admin: simpan tata letak blok (block builder)
export function useUpdateLayout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (layout) => api.patch('/landing/layout', { layout }).then(r => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landing'] }),
  })
}

// Super-admin: testimonials
export function useTestimonials() {
  return useQuery({
    queryKey: ['landing-admin', 'testimonials'],
    queryFn: () => api.get('/landing/testimonials').then(r => r.data.data),
  })
}
export function useCreateTestimonial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/landing/testimonials', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['landing-admin', 'testimonials'] })
      qc.invalidateQueries({ queryKey: ['landing'] })
    },
  })
}
export function useUpdateTestimonial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/landing/testimonials/${id}`, data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['landing-admin', 'testimonials'] })
      qc.invalidateQueries({ queryKey: ['landing'] })
    },
  })
}
export function useDeleteTestimonial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/landing/testimonials/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['landing-admin', 'testimonials'] })
      qc.invalidateQueries({ queryKey: ['landing'] })
    },
  })
}

// Super-admin: FAQs
export function useFAQs() {
  return useQuery({
    queryKey: ['landing-admin', 'faqs'],
    queryFn: () => api.get('/landing/faqs').then(r => r.data.data),
  })
}
export function useCreateFAQ() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/landing/faqs', data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['landing-admin', 'faqs'] })
      qc.invalidateQueries({ queryKey: ['landing'] })
    },
  })
}
export function useUpdateFAQ() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/landing/faqs/${id}`, data).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['landing-admin', 'faqs'] })
      qc.invalidateQueries({ queryKey: ['landing'] })
    },
  })
}
export function useDeleteFAQ() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/landing/faqs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['landing-admin', 'faqs'] })
      qc.invalidateQueries({ queryKey: ['landing'] })
    },
  })
}
