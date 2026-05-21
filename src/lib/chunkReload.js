// Pemulihan dari chunk lama pasca-deploy.
//
// Saat versi baru di-deploy, tab yang masih memegang index.html lama bisa gagal
// me-lazy-load chunk dengan hash lama → "Failed to fetch dynamically imported
// module". Solusi standar: reload SEKALI supaya browser mengambil index.html
// segar (referensi hash baru).
//
// Guard berbasis WAKTU (bukan boolean sticky): kalau kita baru saja reload tapi
// masih gagal (mis. server benar-benar kehilangan file) → jangan loop, biarkan
// ErrorBoundary menampilkan layar error. Tapi episode baru beberapa saat
// kemudian (mis. deploy lain di sesi yang sama) tetap bisa pulih otomatis —
// inilah kelemahan guard boolean lama yang hanya mengizinkan satu reload seumur
// sesi.
const KEY = '_chunk_reload_at'
const COOLDOWN_MS = 12_000

export function isChunkLoadError(error) {
  const msg = (error && (error.message || error.payload?.message)) || ''
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    error?.name === 'ChunkLoadError'
  )
}

// Reload sekali untuk memulihkan dari chunk usang. Return true kalau benar-benar
// memutuskan reload (pemanggil bisa berhenti menampilkan UI error).
export function reloadOnceForChunkError() {
  let last = 0
  try { last = Number(sessionStorage.getItem(KEY) || 0) } catch (_) { /* ignore */ }
  if (Date.now() - last < COOLDOWN_MS) return false
  try { sessionStorage.setItem(KEY, String(Date.now())) } catch (_) { /* ignore */ }
  window.location.reload()
  return true
}
