import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, ChevronDown, ArrowRight, LifeBuoy, X, BookOpen,
} from 'lucide-react'

// ── Pusat Bantuan — UI shell dipakai bersama oleh /admin/bantuan & /kasir/bantuan
// Konten (kategori + topik) di-pass dari halaman pemanggil agar tetap per-peran.
//
// Bentuk data `categories`:
//   [{ id, label, icon, items: [{ id, q, a, steps?: string[], to?, toLabel? }] }]
export default function HelpCenter({ title, subtitle, categories = [], support }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(null) // id topik yang terbuka

  const q = query.trim().toLowerCase()

  // Filter topik berdasar pencarian — cocokkan judul, isi, & langkah.
  const filtered = useMemo(() => {
    if (!q) return categories
    return categories
      .map(cat => ({
        ...cat,
        items: cat.items.filter(it => {
          const hay = [
            it.q,
            it.a,
            ...(it.steps || []),
          ].join(' ').toLowerCase()
          return hay.includes(q)
        }),
      }))
      .filter(cat => cat.items.length > 0)
  }, [categories, q])

  const totalTopics = categories.reduce((n, c) => n + c.items.length, 0)
  const matchCount  = filtered.reduce((n, c) => n + c.items.length, 0)

  return (
    <div className="space-y-6 max-w-3xl mx-auto w-full">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-gold/15 via-amber-500/5 to-transparent border border-gold/30"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gold/20 border border-gold/30 flex items-center justify-center flex-shrink-0">
            <LifeBuoy className="text-gold" size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-off-white">
              {title}
            </h1>
            <p className="text-sm text-muted mt-1">{subtitle}</p>
          </div>
        </div>
      </motion.div>

      {/* Pencarian */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          type="text"
          inputMode="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Cari topik bantuan…"
          aria-label="Cari topik bantuan"
          className="w-full appearance-none rounded-xl bg-dark-card border border-dark-border pl-10 pr-10 py-2.5 text-sm text-off-white placeholder:text-muted focus:outline-none focus:border-gold/40 transition-colors"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Hapus pencarian"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-muted hover:text-off-white hover:bg-dark-surface transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {q && (
        <p className="text-xs text-muted -mt-2">
          {matchCount > 0
            ? `${matchCount} dari ${totalTopics} topik cocok dengan "${query}".`
            : `Tidak ada topik yang cocok dengan "${query}".`}
        </p>
      )}

      {/* Kategori + topik */}
      {filtered.length === 0 && q ? (
        <div className="text-center py-12">
          <BookOpen size={32} className="text-muted mx-auto mb-3" />
          <p className="text-sm text-muted">
            Coba kata kunci lain, atau hubungi bantuan di bawah.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map(cat => {
            const CatIcon = cat.icon
            return (
              <section key={cat.id}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  {CatIcon && <CatIcon size={15} className="text-gold flex-shrink-0" />}
                  <h2 className="text-sm font-bold text-off-white uppercase tracking-wide">
                    {cat.label}
                  </h2>
                </div>
                <div className="space-y-2">
                  {cat.items.map(it => {
                    const isOpen = open === it.id
                    return (
                      <div
                        key={it.id}
                        className="rounded-xl bg-dark-card border border-dark-border overflow-hidden"
                      >
                        <button
                          onClick={() => setOpen(isOpen ? null : it.id)}
                          aria-expanded={isOpen}
                          className="w-full flex items-center gap-3 p-3.5 text-left"
                        >
                          <span className="text-sm font-semibold text-off-white flex-1 min-w-0">
                            {it.q}
                          </span>
                          <motion.span
                            animate={{ rotate: isOpen ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex-shrink-0"
                          >
                            <ChevronDown size={16} className="text-muted" />
                          </motion.span>
                        </button>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="px-3.5 pb-3.5 pt-0 space-y-3">
                                <p className="text-sm text-muted leading-relaxed">{it.a}</p>
                                {it.steps && it.steps.length > 0 && (
                                  <ol className="space-y-1.5">
                                    {it.steps.map((s, i) => (
                                      <li key={i} className="flex gap-2.5 text-sm text-muted">
                                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gold/15 text-gold text-xs font-bold flex items-center justify-center">
                                          {i + 1}
                                        </span>
                                        <span className="leading-relaxed pt-0.5">{s}</span>
                                      </li>
                                    ))}
                                  </ol>
                                )}
                                {it.to && (
                                  <button
                                    onClick={() => navigate(it.to)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold text-dark text-xs font-semibold hover:bg-gold/90 transition-colors"
                                  >
                                    {it.toLabel || 'Buka halaman'} <ArrowRight size={12} />
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Footer bantuan */}
      {support && (
        <div className="rounded-2xl bg-dark-card border border-dark-border p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gold/15 flex items-center justify-center flex-shrink-0">
            <LifeBuoy size={18} className="text-gold" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-off-white">{support.title}</h3>
            <p className="text-xs text-muted mt-0.5">{support.desc}</p>
          </div>
          {support.action && (
            <button
              onClick={support.action.onClick}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-gold text-dark text-sm font-semibold hover:bg-gold/90 transition-colors flex-shrink-0"
            >
              {support.action.label} <ArrowRight size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
