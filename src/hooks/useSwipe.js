import { useRef } from 'react'

export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 50 }) {
  const startX = useRef(null)

  const onTouchStart = (e) => { startX.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (startX.current === null) return
    const diff = startX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > threshold) {
      if (diff > 0) onSwipeLeft?.()
      else onSwipeRight?.()
    }
    startX.current = null
  }

  return { onTouchStart, onTouchEnd }
}
