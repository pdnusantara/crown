import React from 'react'
import { useTranslation } from 'react-i18next'
import { useSocketStatus } from '../../hooks/useSocketStatus.js'

export default function LiveBadge({ className = '' }) {
  const connected = useSocketStatus()
  const { t } = useTranslation()
  return (
    <span
      title={connected ? t('realtime.liveTooltip') : t('realtime.offlineTooltip')}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
        connected
          ? 'border-green-400/30 bg-green-400/10 text-green-300'
          : 'border-red-400/30 bg-red-400/10 text-red-300'
      } ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
        }`}
      />
      {connected ? t('realtime.live') : t('realtime.offline')}
    </span>
  )
}
