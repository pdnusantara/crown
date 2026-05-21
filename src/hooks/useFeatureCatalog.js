import { useQuery } from '@tanstack/react-query'
import api from '../lib/api.js'
import { ALL_FEATURE_FLAGS } from '../store/featureFlagStore.js'

// Katalog fitur dari backend (SUMBER TUNGGAL: backend config/featureCatalog.js,
// disajikan oleh GET /api/feature-flags). Menambah fitur cukup di backend →
// otomatis muncul di sini, termasuk di halaman /super-admin/packages.
//
// ALL_FEATURE_FLAGS (src/store/featureFlagStore.js) hanya dipakai sebagai
// fallback/initialData: UI tak pernah kosong saat fetch & tetap jalan bila API
// gagal. Bentuk item: { id, label, description, category }.
export function useFeatureCatalog() {
  const { data } = useQuery({
    queryKey: ['featureCatalog'],
    queryFn: async () => {
      const res = await api.get('/feature-flags')
      const list = res.data?.data
      return Array.isArray(list) && list.length ? list : ALL_FEATURE_FLAGS
    },
    // placeholderData (BUKAN initialData): const fallback hanya ditampilkan
    // sementara fetch berjalan, tapi query TETAP mengambil katalog dari backend.
    // initialData + staleTime dulu membuat React Query menganggap fallback
    // sudah "fresh" → tak pernah fetch → UI mentok di daftar lama (bug).
    placeholderData: ALL_FEATURE_FLAGS,
    staleTime: 5 * 60 * 1000,
  })
  return Array.isArray(data) && data.length ? data : ALL_FEATURE_FLAGS
}
