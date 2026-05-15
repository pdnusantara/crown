import { useMutation, useQuery } from '@tanstack/react-query'
import api from '../lib/api.js'

export function useRegisterTenant() {
  return useMutation({
    mutationFn: (data) => api.post('/auth/register', data).then(r => r.data.data),
  })
}

// Debounced slug check — caller should pass a debounced value.
export function useCheckSlug(slug) {
  return useQuery({
    queryKey: ['check-slug', slug],
    queryFn: () => api.get('/auth/check-slug', { params: { slug } }).then(r => r.data.data),
    enabled: !!slug && slug.length >= 2,
    staleTime: 30_000,
  })
}
