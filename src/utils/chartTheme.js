import { useThemeStore } from '../store/themeStore.js'

/**
 * Resolve warna recharts berdasarkan theme aktif (dark/light).
 * Pakai di TAReportsPage / report charts lain agar grid/axis/tooltip konsisten
 * dengan mode terang & gelap.
 *
 * Recharts tidak support CSS variable untuk svg fill, jadi kita resolve eksplisit.
 */
export function useChartTheme() {
  const theme = useThemeStore(s => s.theme)
  const isLight = theme === 'light'
  return {
    isLight,
    grid:        isLight ? '#E5E2D8' : '#2A2A2A',
    axisTick:    isLight ? '#555555' : '#6B7280',
    tooltipBg:   isLight ? '#FFFFFF' : '#1A1A1A',
    tooltipBorder: isLight ? '#DDDBD0' : '#2A2A2A',
    tooltipLabel:  isLight ? '#111111' : '#F5F5F0',
    legendText:    isLight ? '#555555' : '#6B7280',
  }
}

// Standar tooltipStyle helper supaya tidak repeat object literal di tiap chart.
export function tooltipStyle(theme) {
  return {
    background:   theme.tooltipBg,
    border:       `1px solid ${theme.tooltipBorder}`,
    borderRadius: 12,
    color:        theme.tooltipLabel,
  }
}
