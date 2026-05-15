// Slug pendek per cabang untuk URL — preferensi: branch.code (mis. "kuningan"),
// fallback ke branchId (CUID) supaya kompatibel dengan akun lama yang belum
// punya branch object di token/cache.
export function getBranchSlug(user) {
  if (!user) return ''
  return user.branch?.code || user.branchId || ''
}

// Cocokkan slug URL dengan branch object (id atau code keduanya valid).
export function matchesBranch(slug, branch) {
  if (!slug || !branch) return false
  return branch.id === slug || branch.code === slug
}
