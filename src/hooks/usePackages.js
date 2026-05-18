import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api.js'
import { getSocket } from '../lib/socket.js'

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
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['packages'],
    queryFn: async () => {
      const res = await api.get('/packages')
      const list = res.data.data || []
      return { list, map: listToMap(list) }
    },
    // Paket jarang berubah — cache 5 menit
    staleTime: 5 * 60 * 1000,
  })

  // Realtime: super_admin men-update paket → semua tab/pengguna lain ikut refresh.
  useEffect(() => {
    const s = getSocket()
    const onUpdate = () => qc.invalidateQueries({ queryKey: ['packages'] })
    s.on('package:updated', onUpdate)
    return () => { s.off('package:updated', onUpdate) }
  }, [qc])

  return query
}

export function useUpdatePackage() {
  const qc = useQueryClient()
  return useMutation({
    // Kembalikan envelope { pkg, propagation } — `propagation` memberi tahu
    // berapa tenant yang flag fiturnya ikut tersinkron oleh perubahan ini.
    mutationFn: ({ name, ...data }) =>
      api.put(`/packages/${name}`, data).then(r => ({
        pkg: r.data.data,
        propagation: r.data.propagation || null,
      })),
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
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['packages'] })
      // Flag fitur tenant ikut berubah → segarkan cache feature-flags.
      qc.invalidateQueries({ queryKey: ['featureFlags'] })
      // Kartu harga di landing page memakai data paket → ikut disegarkan.
      qc.invalidateQueries({ queryKey: ['landing'] })
    },
  })
}
