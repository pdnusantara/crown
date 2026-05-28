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
  // Palet Phase A (rebrand Electric Indigo + Mint): light surfaces lavender +
  // pure white card; dark surfaces indigo-tinted (#1A1A2E surface, #2A2A40 border).
  return {
    isLight,
    grid:          isLight ? '#D5D8E8' : '#2A2A40',
    axisTick:      isLight ? '#56548A' : '#9B98C8',
    tooltipBg:     isLight ? '#FFFFFF' : '#1A1A2E',
    tooltipBorder: isLight ? '#D5D8E8' : '#2A2A40',
    tooltipLabel:  isLight ? '#1E1B2E' : '#F5F5F0',
    legendText:    isLight ? '#56548A' : '#9B98C8',
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
