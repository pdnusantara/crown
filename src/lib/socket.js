import { io } from 'socket.io-client'
import { getAccessToken } from './api.js'

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
    : 'http://localhost:3001')

let socket = null
let listenersWired = false

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
    }
  })

  // Bila handshake gagal karena token expired/invalid, coba reconnect setelah refresh berikutnya
  s.on('connect_error', (err) => {
    if (typeof console !== 'undefined' && import.meta.env.DEV) {
      console.warn('[socket] connect_error:', err?.message || err)
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
