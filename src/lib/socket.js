import { io } from 'socket.io-client'
import api, { getAccessToken } from './api.js'

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
    : 'http://localhost:3001')

let socket = null
let listenersWired = false

// Throttling untuk monitoring disconnect — kita hanya catat ke backend kalau
// putus lebih lama dari ambang batas (10s) sehingga blip jaringan singkat tidak
// membanjiri error log. Pasangan disconnectAt → reconnect timing dilaporkan
// dengan durasi total agar bisa lihat pola di production.
let disconnectAt = null
let disconnectReason = null
let reportTimer = null
const REPORT_THRESHOLD_MS = 10_000

function reportDisconnect(durationMs, reason) {
  // Jangan report saat tab background (akan tetap di-reconnect saat tab aktif lagi)
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  // Best-effort — observability tidak boleh menggagalkan apa pun
  api.post('/error-logs', {
    level: 'warning',
    type: 'system_error',
    message: `WebSocket disconnect for ${Math.round(durationMs / 1000)}s (reason: ${reason || 'unknown'})`,
    metadata: { durationMs, reason, userAgent: navigator.userAgent },
  }).catch(() => {})
}

function wireGlobalListeners(s) {
  if (listenersWired) return
  listenersWired = true

  const refreshAuth = (newToken) => {
    if (!s) return
    s.auth = { token: newToken || getAccessToken() || '' }
    if (!s.connected) s.connect()
  }

  // Token diperbarui (login atau refresh) → reconnect dengan token baru
  window.addEventListener('auth:token-set', (e) => refreshAuth(e?.detail?.accessToken))
  window.addEventListener('auth:token-refreshed', (e) => refreshAuth(e?.detail?.accessToken))

  // Logout → tutup socket
  window.addEventListener('auth:logout', () => {
    if (socket) {
      socket.disconnect()
      socket = null
      listenersWired = false
      disconnectAt = null
      if (reportTimer) { clearTimeout(reportTimer); reportTimer = null }
    }
  })

  // Bila handshake gagal karena token expired/invalid, coba reconnect setelah refresh berikutnya
  s.on('connect_error', (err) => {
    if (typeof console !== 'undefined' && import.meta.env.DEV) {
      console.warn('[socket] connect_error:', err?.message || err)
    }
  })

  // Monitoring disconnect — hanya laporkan kalau melewati threshold dan user
  // masih aktif di tab. Pola: putus ringan = abaikan, putus lama = catat.
  s.on('disconnect', (reason) => {
    disconnectAt = Date.now()
    disconnectReason = reason
    if (reportTimer) clearTimeout(reportTimer)
    reportTimer = setTimeout(() => {
      if (disconnectAt && !s.connected) {
        reportDisconnect(Date.now() - disconnectAt, disconnectReason)
      }
    }, REPORT_THRESHOLD_MS)
    if (import.meta.env.DEV) {
      console.warn('[socket] disconnect:', reason)
    }
  })

  s.on('connect', () => {
    if (disconnectAt) {
      const dur = Date.now() - disconnectAt
      if (dur >= REPORT_THRESHOLD_MS) reportDisconnect(dur, `${disconnectReason}/recovered`)
      disconnectAt = null
      disconnectReason = null
      if (reportTimer) { clearTimeout(reportTimer); reportTimer = null }
    }
  })
}

export function getSocket() {
  if (socket) return socket

  socket = io(SOCKET_URL, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    transports: ['websocket', 'polling'],
    auth: (cb) => cb({ token: getAccessToken() || '' }),
  })

  wireGlobalListeners(socket)
  return socket
}

export function joinBranchRoom(branchId) {
  if (!branchId) return
  const s = getSocket()
  const emitJoin = () => s.emit('queue:join', branchId)
  if (s.connected) emitJoin()
  else s.once('connect', emitJoin)
}

export function leaveBranchRoom(branchId) {
  if (!branchId || !socket) return
  socket.emit('queue:leave', branchId)
}

export function joinTenantRoom(tenantId) {
  if (!tenantId) return
  const s = getSocket()
  const emitJoin = () => s.emit('tenant:join', tenantId)
  if (s.connected) emitJoin()
  else s.once('connect', emitJoin)
}

export function leaveTenantRoom(tenantId) {
  if (!tenantId || !socket) return
  socket.emit('tenant:leave', tenantId)
}

export default getSocket
