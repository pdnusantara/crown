import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useSocketStatus } from '../../hooks/useSocketStatus.js'

// Indikator real-time + tombol refresh manual.
//
// Klik badge → invalidate seluruh query aktif (refetch). Berguna sebagai
// "escape hatch" kalau user merasa data lambat update (WS drop, latensi tinggi,
// atau cache yang dianggap terlalu lama). State `refreshing` mencegah double-
// click dan kasih feedback visual ~600ms.
export default function LiveBadge({ className = '' }) {
  const connected = useSocketStatus()
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await qc.invalidateQueries({ refetchType: 'active' })
    } finally {
      // Tahan visual sebentar supaya user lihat feedback walau refetch cepat.
      setTimeout(() => setRefreshing(false), 600)
    }
  }

  const label = refreshing
    ? t('realtime.refreshing')
    : connected ? t('realtime.live') : t('realtime.offline')

  const tooltip = connected ? t('realtime.liveTooltip') : t('realtime.offlineTooltip')

  return (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={refreshing}
      title={tooltip}
      aria-label={tooltip}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors hover:brightness-110 disabled:opacity-70 ${
        connected
          ? 'border-green-400/30 bg-green-400/10 text-green-300'
          : 'border-red-400/30 bg-red-400/10 text-red-300'
      } ${className}`}
    >
      {refreshing ? (
        <RefreshCw className="w-3 h-3 animate-spin" />
      ) : (
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
          }`}
        />
      )}
      {label}
    </button>
  )
}
