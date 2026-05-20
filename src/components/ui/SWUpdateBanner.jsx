import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, X } from 'lucide-react'

// Banner kecil di pojok kanan-bawah saat service worker baru aktif. User
// memilih waktu reload — penting karena reload paksa bisa menghapus form yang
// sedang diisi (mis. form transaksi kasir, jadwal admin).
export default function SWUpdateBanner() {
  const [open, setOpen] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    const onUpdate = () => setOpen(true)
    window.addEventListener('app:update-available', onUpdate)
    return () => window.removeEventListener('app:update-available', onUpdate)
  }, [])

  if (!open) return null

  const reload = () => {
    sessionStorage.removeItem('sw-update-shown')
    window.location.reload()
  }

  return (
    <div className="fixed bottom-4 right-4 z-[110] max-w-sm">
      <div className="glass border border-emerald-400/30 bg-emerald-500/10 rounded-xl px-4 py-3 shadow-xl flex items-start gap-3">
        <RefreshCw className="w-5 h-5 text-emerald-300 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-off-white">
            {t('appUpdate.title')}
          </p>
          <p className="text-xs text-muted mt-0.5">
            {t('appUpdate.description')}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={reload}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-xs font-medium transition-colors"
            >
              {t('appUpdate.reload')}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2 py-1.5 rounded-lg text-muted hover:text-off-white text-xs"
            >
              {t('appUpdate.later')}
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label={t('appUpdate.dismiss')}
          onClick={() => setOpen(false)}
          className="p-1 rounded-md text-muted hover:text-off-white flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
