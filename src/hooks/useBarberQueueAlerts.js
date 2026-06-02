import { useEffect, useRef } from 'react'
import { getSocket } from '../lib/socket.js'
import { useAuthStore } from '../store/authStore.js'
import { useToast } from '../components/ui/Toast.jsx'

const MUTE_KEY = 'queueAlertMuted'

export function isQueueAlertMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false }
}
export function setQueueAlertMuted(muted) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0') } catch { /* ignore */ }
}

// Bunyi notifikasi singkat (dua nada) via Web Audio — tanpa file aset.
let audioCtx = null
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    audioCtx = audioCtx || new Ctx()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    const now = audioCtx.currentTime
    ;[880, 1175].forEach((freq, i) => {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t0 = now + i * 0.16
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.34)
    })
  } catch { /* audio diblokir browser → abaikan, toast tetap muncul */ }
}

// Notifikasi realtime saat ada pelanggan baru di antrian si barber (atau
// dialihkan ke dia). Mount sekali (mis. di AppLayout untuk role barber).
export function useBarberQueueAlerts() {
  const user = useAuthStore((s) => s.user)
  const toast = useToast()
  const alerted = useRef(new Set())

  const myId = user?.id
  const isBarber = user?.role === 'barber' || (user?.role === 'kasir' && user?.isBarber)

  useEffect(() => {
    if (!isBarber || !myId) return
    const socket = getSocket()

    const handle = (q) => {
      if (!q || q.barberId !== myId) return
      if (q.status && q.status !== 'waiting') return // hanya antrian menunggu
      if (alerted.current.has(q.id)) return          // anti-dobel (created+updated)
      alerted.current.add(q.id)

      const svc = q.serviceNames ? ` — ${String(q.serviceNames).split('|').join(', ')}` : ''
      const num = q.queueNumber != null ? ` (No. ${q.queueNumber})` : ''
      toast.info(`🔔 Pelanggan baru: ${q.customerName || 'Pelanggan'}${svc}${num}`, 6000)
      if (!isQueueAlertMuted()) playChime()
    }

    socket.on('queue:created', handle)
    socket.on('queue:updated', handle)
    return () => {
      socket.off('queue:created', handle)
      socket.off('queue:updated', handle)
    }
  }, [isBarber, myId, toast])
}
