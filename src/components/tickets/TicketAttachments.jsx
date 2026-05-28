import React, { useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { ImagePlus, X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import * as api from '../../lib/api.js'
import { useToast } from '../ui/Toast.jsx'

export const MAX_TICKET_ATTACHMENTS = 6

// ── Lightbox: tampilan gambar penuh dengan navigasi prev/next ──────────────────
function Lightbox({ urls, index, onClose, onNavigate }) {
  const { t } = useTranslation()
  const count = urls.length
  return (
    <AnimatePresence>
      {index != null && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label={t('common.close', { defaultValue: 'Tutup' })}
          >
            <X size={20} />
          </button>

          {count > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onNavigate((index - 1 + count) % count) }}
                className="absolute left-3 sm:left-6 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                aria-label="Sebelumnya"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onNavigate((index + 1) % count) }}
                className="absolute right-3 sm:right-6 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                aria-label="Berikutnya"
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}

          <motion.img
            key={urls[index]}
            src={urls[index]}
            alt={`Lampiran ${index + 1}`}
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="max-h-[88vh] max-w-full rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {count > 1 && (
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/80 bg-black/40 px-3 py-1 rounded-full">
              {index + 1} / {count}
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Galeri (read-only): deretan thumbnail yang bisa diklik untuk zoom ──────────
export function AttachmentGallery({ urls, className = '' }) {
  const [lightboxIdx, setLightboxIdx] = useState(null)
  if (!urls || urls.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {urls.map((url, i) => (
        <button
          key={url}
          type="button"
          onClick={() => setLightboxIdx(i)}
          className="group relative h-20 w-20 overflow-hidden rounded-xl border border-dark-border bg-dark-card focus:outline-none focus:ring-2 focus:ring-brand/50"
        >
          <img src={url} alt={`Lampiran ${i + 1}`} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
        </button>
      ))}
      <Lightbox urls={urls} index={lightboxIdx} onClose={() => setLightboxIdx(null)} onNavigate={setLightboxIdx} />
    </div>
  )
}

// ── Picker: pilih + unggah gambar, dengan preview & tombol hapus ───────────────
export function AttachmentPicker({ value = [], onChange, max = MAX_TICKET_ATTACHMENTS, disabled = false }) {
  const { t } = useTranslation()
  const toast = useToast()
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(0)

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || [])
    if (files.length === 0) return
    const room = max - value.length
    if (room <= 0) {
      toast.error(t('tickets.attachMax', { max }))
      return
    }
    const toUpload = files.slice(0, room)
    if (files.length > room) toast.info(t('tickets.attachMax', { max }))

    setUploading((n) => n + toUpload.length)
    const uploaded = []
    for (const file of toUpload) {
      try {
        const fd = new FormData()
        fd.append('image', file)
        const res = await api.upload('/tickets/upload', fd)
        const url = res.data?.data?.url
        if (url) uploaded.push(url)
      } catch (err) {
        toast.error(err?.response?.data?.error || t('tickets.attachFailed'))
      } finally {
        setUploading((n) => Math.max(0, n - 1))
      }
    }
    if (uploaded.length) onChange([...value, ...uploaded])
  }, [value, max, onChange, toast, t])

  const removeAt = (idx) => onChange(value.filter((_, i) => i !== idx))
  const atLimit = value.length >= max
  const busy = disabled || uploading > 0

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
      />

      {(value.length > 0 || uploading > 0) && (
        <div className="flex flex-wrap gap-2">
          {value.map((url, i) => (
            <div key={url} className="relative h-16 w-16 overflow-hidden rounded-lg border border-dark-border bg-dark-card">
              <img src={url} alt={`Lampiran ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(i)}
                disabled={disabled}
                className="absolute top-0.5 right-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
                aria-label={t('common.delete', { defaultValue: 'Hapus' })}
              >
                <X size={11} />
              </button>
            </div>
          ))}
          {Array.from({ length: uploading }).map((_, i) => (
            <div key={`up-${i}`} className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-dark-border bg-dark-card">
              <Loader2 size={18} className="animate-spin text-brand" />
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy || atLimit}
        className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-dark-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-brand/40 hover:text-off-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ImagePlus size={14} />
        {atLimit ? t('tickets.attachMax', { max }) : t('tickets.attachAdd', { n: value.length, max })}
      </button>
    </div>
  )
}

export default AttachmentGallery
