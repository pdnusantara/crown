import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'

// Normalize dari bentuk list API (array) → object keyed by name agar
// kompatibel dengan UI lama yang pakai `packages.Basic`, `packages.Pro`, dll.
function listToMap(list) {
  const map = {}
  for (const pkg of list || []) {
    map[pkg.name] = pkg
  }
  return map
}

export function usePackages() {
  return useQuery({
    queryKey: ['packages'],
    queryFn: async () => {
      const res = await api.get('/packages')
      const list = res.data.data || []
      return { list, map: listToMap(list) }
    },
    // Paket jarang berubah — cache 5 menit
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdatePackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, ...data }) => api.put(`/packages/${name}`, data).then(r => r.data.data),
    // Optimistic update — UI langsung tampil perubahan
    onMutate: async ({ name, ...patch }) => {
      await qc.cancelQueries({ queryKey: ['packages'] })
      const prev = qc.getQueryData(['packages'])
      if (prev?.list) {
        const nextList = prev.list.map(p => p.name === name ? { ...p, ...patch } : p)
        qc.setQueryData(['packages'], { list: nextList, map: listToMap(nextList) })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['packages'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['packages'] }),
  })
}
