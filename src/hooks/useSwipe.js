import { useRef } from 'react'

// Deteksi swipe horizontal untuk navigasi antar-tab di mobile.
//
// PENTING: jangan salah mengira scroll vertikal sebagai swipe. Sebelumnya hook
// ini hanya mengukur perpindahan sumbu-X, jadi saat pengguna scroll naik/turun
// (yang hampir selalu disertai sedikit geseran horizontal) navigasi ikut
// terpicu — halaman "pindah sendiri". Kini swipe baru dianggap sah bila:
//   1. perpindahan horizontal melewati threshold, DAN
//   2. perpindahan horizontal jelas mendominasi vertikal (faktor 1.5),
// sehingga gesture scroll/diagonal tidak lagi memicu pindah halaman.
export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 50 }) {
  const start = useRef(null)

  const onTouchStart = (e) => {
    // Abaikan gesture multi-jari (mis. pinch-zoom).
    if (e.touches.length > 1) { start.current = null; return }
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY }
  }

  const onTouchEnd = (e) => {
    if (!start.current) return
    const t = e.changedTouches[0]
    const dx = start.current.x - t.clientX
    const dy = start.current.y - t.clientY
    start.current = null
    if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) onSwipeLeft?.()
      else onSwipeRight?.()
    }
  }

  return { onTouchStart, onTouchEnd }
}
