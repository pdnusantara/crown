// Pelaporan error terpusat → POST /api/error-logs.
//
// Kenapa fetch mentah, bukan instance `api` (axios):
//   • Hindari interceptor 401→refresh→logout — laporan error dari halaman
//     publik atau sesi kedaluwarsa tak boleh ikut memicu logout.
//   • Hindari rekursi bila axios sendiri yang sedang error.
//   • keepalive:true → laporan tetap terkirim walau halaman sedang unload.
//
// Throttle berlapis supaya satu bug berulang (mis. render-loop) tak membanjiri
// server: dedupe per-signature (30 dtk) + cap total per page-load.
import { getTenantSlug } from './tenantSlug.js'
import { isChunkLoadError } from './chunkReload.js'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

const DEDUPE_MS        = 30_000 // signature sama: maksimal 1 kirim / 30 dtk
const MAX_PER_PAGELOAD = 25     // batas keras agar tak banjir server
const recent = new Map()        // signature → ts terakhir kirim
let sentCount = 0

function signature(type, message, stack) {
  const firstFrame = (stack || '').split('\n')[1] || ''
  return `${type}|${message}|${firstFrame}`.slice(0, 300)
}

// Pesan noise yang tak layak dilaporkan ke backend.
function isNoise(message) {
  if (!message) return true
  return (
    message === 'Script error.' ||                  // error cross-origin tanpa detail
    /ResizeObserver loop/i.test(message) ||          // benign, ramai di Chrome
    /Non-Error promise rejection captured/i.test(message)
  )
}

// Lapor satu error. Best-effort & defensif — tak pernah melempar error.
export function reportError({ level = 'error', type = 'js_error', message, stack = null, metadata = null }) {
  try {
    const msg = String(message || '').slice(0, 2000)
    if (isNoise(msg)) return
    if (sentCount >= MAX_PER_PAGELOAD) return

    const sig = signature(type, msg, stack)
    const now = Date.now()
    const last = recent.get(sig)
    if (last && now - last < DEDUPE_MS) return
    recent.set(sig, now)
    sentCount++

    const headers = { 'Content-Type': 'application/json' }
    const slug = getTenantSlug()
    if (slug) headers['X-Tenant-Slug'] = slug
    const token = localStorage.getItem('barberos_access_token')
    if (token) headers.Authorization = `Bearer ${token}`

    const body = JSON.stringify({
      level,
      type,
      message: msg || 'Unknown error',
      stack: stack ? String(stack).slice(0, 10000) : undefined,
      path: typeof location !== 'undefined' ? location.pathname : undefined,
      metadata: metadata || undefined,
    })

    fetch(`${BASE_URL}/error-logs`, {
      method: 'POST',
      headers,
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {})
  } catch {
    /* pelaporan error tak boleh pernah menjadi sumber error baru */
  }
}

let installed = false

// Pasang penangkap global. Ini menutup kelas bug yang TIDAK ditangkap React
// Error Boundary: error di event handler (onClick dll.) & promise rejection
// tanpa .catch() — persis jenis bug yang bisa "diam" di produksi berhari-hari.
export function installGlobalErrorHandlers() {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (event) => {
    // Event gagal-muat resource (img/script) tak punya .error/.message berguna.
    if (!event.error && !event.message) return
    const err = event.error
    if (isChunkLoadError(err)) return // ditangani terpisah (reload sekali)
    reportError({
      type: 'js_error',
      message: err?.message || event.message,
      stack: err?.stack || null,
      metadata: { source: 'window.onerror', filename: event.filename, lineno: event.lineno, colno: event.colno },
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    if (isChunkLoadError(reason)) return
    // Error HTTP axios umumnya sudah ditangani caller; kalau benar-benar lolos,
    // tetap berguna — tandai sebagai api_error agar bisa dibedakan dari bug JS.
    const isAxios = !!(reason && typeof reason === 'object' && (reason.isAxiosError || reason.config))
    const message = (reason && (reason.message || (typeof reason === 'string' ? reason : reason.toString?.()))) || 'Unhandled promise rejection'
    reportError({
      type: isAxios ? 'api_error' : 'js_error',
      message: String(message),
      stack: reason?.stack || null,
      metadata: {
        source: 'unhandledrejection',
        ...(isAxios ? { url: reason?.config?.url, status: reason?.response?.status } : {}),
      },
    })
  })
}
