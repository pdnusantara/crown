import React, { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Button from './Button.jsx'

const VARIANT = {
  danger: {
    iconBg: 'bg-red-500/15',
    iconColor: 'text-red-400',
    ring: 'ring-red-500/20',
    confirmBtn: 'bg-red-500 hover:bg-red-600 text-white',
  },
  warning: {
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-400',
    ring: 'ring-amber-500/20',
    confirmBtn: 'bg-amber-500 hover:bg-amber-600 text-dark-bg',
  },
  primary: {
    iconBg: 'bg-brand/15',
    iconColor: 'text-brand',
    ring: 'ring-brand/20',
    confirmBtn: 'bg-brand hover:bg-brand/90 text-dark-bg',
  },
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Konfirmasi',
  description,
  confirmText = 'Ya, Lanjutkan',
  cancelText = 'Batal',
  variant = 'danger',
  icon: Icon = AlertTriangle,
  highlight,
}) {
  const [loading, setLoading] = useState(false)
  const v = VARIANT[variant] || VARIANT.danger

  const handleConfirm = async () => {
    try {
      setLoading(true)
      await onConfirm?.()
      onClose?.()
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={loading ? undefined : onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="relative z-10 w-full max-w-sm bg-dark-surface border border-dark-border rounded-t-3xl sm:rounded-3xl shadow-2xl"
          >
            <div className="sm:hidden flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-dark-border" />
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              aria-label="Tutup"
              className="absolute top-3 right-3 p-2 rounded-lg text-muted hover:text-off-white hover:bg-dark-card transition-all disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="px-6 pt-6 pb-5 text-center">
              <div className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center ring-8 ${v.iconBg} ${v.ring} mb-4`}>
                <Icon className={`w-6 h-6 ${v.iconColor}`} strokeWidth={2.2} />
              </div>
              <h3 className="font-display text-lg font-semibold text-off-white mb-1.5">{title}</h3>
              {description && (
                <p className="text-sm text-muted leading-relaxed">
                  {description}
                  {highlight && (
                    <span className="block mt-1.5 text-off-white font-semibold">"{highlight}"</span>
                  )}
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 px-6 pb-6">
              <Button variant="outline" fullWidth onClick={onClose} disabled={loading}>
                {cancelText}
              </Button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className={`w-full px-4 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed ${v.confirmBtn}`}
              >
                {loading ? 'Memproses…' : confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
