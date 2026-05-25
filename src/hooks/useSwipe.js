import { useRef } from 'react'

// Apakah `node` (atau salah satu leluhurnya, sampai sebelum `boundary`) berada
// di dalam elemen yang BENAR-BENAR bisa di-scroll horizontal? Kalau ya, gesture
// itu milik si scroller (tabel, chart, baris filter, dll) — jangan dianggap
// swipe pindah-tab. Hanya dihitung scroller bila kontennya memang melebihi lebar
// (scrollWidth > clientWidth) DAN overflow-x = auto/scroll; jadi tabel yang tidak
// meluap tetap membiarkan swipe navigasi bekerja.
function startedInHorizontalScroller(node, boundary) {
  let el = node
  while (el && el !== boundary && el.nodeType === 1) {
    if (el.scrollWidth - el.clientWidth > 2) {
      const ox = getComputedStyle(el).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
    el = el.parentElement
  }
  return false
}

// Deteksi swipe horizontal untuk navigasi antar-tab di mobile.
//
// PENTING: jangan salah mengira scroll sebagai swipe.
//   - Scroll VERTIKAL selalu ada sedikit geseran horizontal → dulu salah
//     terbaca sebagai swipe. Karena itu swipe hanya sah bila perpindahan X
//     melewati threshold DAN jelas mendominasi Y (faktor 1.5).
//   - Scroll HORIZONTAL di dalam tabel/chart juga jangan memicu navigasi →
//     gesture yang dimulai di dalam scroller horizontal diabaikan.
//   - Gesture multi-jari (pinch-zoom) diabaikan.
export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 50 }) {
  const start = useRef(null)

  const onTouchStart = (e) => {
    if (e.touches.length > 1) { start.current = null; return }
    if (startedInHorizontalScroller(e.target, e.currentTarget)) { start.current = null; return }
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
