import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Users, Scissors, Receipt, User, X, ArrowRight, Command, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTenantStore } from '../../store/tenantStore.js'
import { useAuthStore } from '../../store/authStore.js'

const HISTORY_KEY = 'cmd-history'
const MAX_HISTORY = 5

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}
function addToHistory(query) {
  if (!query.trim() || query.length < 2) return
  const h = [query, ...getHistory().filter(q => q !== query)].slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h))
}
function removeFromHistory(query) {
  const h = getHistory().filter(q => q !== query)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h))
}

export function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [history, setHistory] = useState([])
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { services, customers, staff } = useTenantStore()

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(-1)
      setHistory(getHistory())
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (open) onClose()
      }
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const tenantServices = services?.filter(s => s.tenantId === user?.tenantId) || []
  const tenantCustomers = customers?.filter(c => c.tenantId === user?.tenantId) || []
  const tenantStaff = staff?.filter(s => s.tenantId === user?.tenantId) || []

  const results = query.length > 1 ? [
    ...tenantCustomers
      .filter(c => c.name.toLowerCase().includes(query.toLowerCase()) || c.phone?.includes(query))
      .slice(0, 4)
      .map(c => ({
        type: 'Pelanggan', label: c.name, sub: c.phone, icon: Users,
        action: () => navigate('/admin/customers')
      })),
    ...tenantServices
      .filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 4)
      .map(s => ({
        type: 'Layanan', label: s.name,
        sub: new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(s.price),
        icon: Scissors,
        action: () => navigate('/admin/services')
      })),
    ...tenantStaff
      .filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 3)
      .map(s => ({
        type: 'Staff', label: s.name, sub: s.role, icon: User,
        action: () => navigate('/admin/staff')
      })),
  ] : []

  const shortcuts = [
    { label: 'Transaksi Baru (POS)', icon: Receipt, action: () => navigate(`/${user?.branchId}/kasir/pos`) },
    { label: 'Lihat Antrian', icon: Users, action: () => navigate(`/${user?.branchId}/kasir/queue`) },
    { label: 'Data Pelanggan', icon: User, action: () => navigate('/admin/customers') },
    { label: 'Laporan', icon: Scissors, action: () => navigate('/admin/reports') },
  ]

  // Items navigable by arrow keys
  const navigableItems = query.length > 1 ? results : shortcuts

  const go = (action, label) => {
    if (label && query.length > 1) addToHistory(query)
    action()
    onClose()
    setQuery('')
    setActiveIndex(-1)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, navigableItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      const item = navigableItems[activeIndex]
      if (item) go(item.action, item.label)
    }
  }

  const handleHistoryClick = (q) => {
    setQuery(q)
    inputRef.current?.focus()
  }

  const handleDeleteHistory = (e, q) => {
    e.stopPropagation()
    removeFromHistory(q)
    setHistory(getHistory())
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9000] flex items-start justify-center pt-[12vh] px-4"
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            initial={{ y: -16, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -16, opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-lg bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Command Palette"
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#2A2A2A]">
              <Search size={18} className="text-[#C9A84C] flex-shrink-0" aria-hidden="true" />
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded={results.length > 0}
                aria-autocomplete="list"
                aria-controls="cmd-listbox"
                value={query}
                onChange={e => { setQuery(e.target.value); setActiveIndex(-1) }}
                onKeyDown={handleKeyDown}
                placeholder="Cari pelanggan, layanan, staff..."
                className="flex-1 bg-transparent text-[#F5F5F0] placeholder-[#6B7280] outline-none text-sm"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); setActiveIndex(-1) }}
                  className="p-1 rounded-md text-[#6B7280] hover:text-[#F5F5F0] transition-colors"
                  aria-label="Hapus pencarian"
                >
                  <X size={14} />
                </button>
              )}
              <kbd className="text-xs text-[#6B7280] bg-[#0A0A0A] border border-[#2A2A2A] rounded px-1.5 py-0.5 flex-shrink-0">ESC</kbd>
            </div>

            {/* Results */}
            <div id="cmd-listbox" role="listbox" ref={listRef}>
              {query.length > 1 ? (
                <div className="py-2 max-h-80 overflow-y-auto">
                  {results.length > 0 ? results.map((r, i) => (
                    <button
                      key={i}
                      role="option"
                      aria-selected={activeIndex === i}
                      onClick={() => go(r.action, r.label)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors group ${activeIndex === i ? 'bg-[#222222]' : 'hover:bg-[#1E1E1E]'}`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0">
                        <r.icon size={15} className="text-[#C9A84C]" aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[#F5F5F0] truncate">{r.label}</div>
                        <div className="text-xs text-[#6B7280] truncate">{r.sub}</div>
                      </div>
                      <div className={`flex items-center gap-2 transition-opacity ${activeIndex === i ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <span className="text-xs text-[#6B7280] bg-[#0A0A0A] border border-[#2A2A2A] rounded px-1.5 py-0.5 capitalize">{r.type}</span>
                        <ArrowRight size={13} className="text-[#C9A84C]" aria-hidden="true" />
                      </div>
                    </button>
                  )) : (
                    <div className="py-10 text-center">
                      <p className="text-sm text-[#6B7280]">Tidak ada hasil untuk <span className="text-[#F5F5F0]">"{query}"</span></p>
                      <p className="text-xs text-[#6B7280]/60 mt-1">Coba kata kunci yang berbeda</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  {/* Search History */}
                  {history.length > 0 && (
                    <div>
                      <p className="text-xs text-[#6B7280] uppercase tracking-wider mb-2 px-1">Pencarian Terbaru</p>
                      <div className="space-y-0.5">
                        {history.map((q, i) => (
                          <div key={i} className="flex items-center group">
                            <button
                              onClick={() => handleHistoryClick(q)}
                              className="flex-1 flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[#222222] text-left transition-colors"
                            >
                              <Clock size={14} className="text-[#6B7280] flex-shrink-0" aria-hidden="true" />
                              <span className="text-sm text-[#F5F5F0]">{q}</span>
                            </button>
                            <button
                              onClick={(e) => handleDeleteHistory(e, q)}
                              className="p-1.5 mr-1 rounded-lg text-[#6B7280] opacity-0 group-hover:opacity-100 hover:text-[#F5F5F0] transition-all"
                              aria-label={`Hapus riwayat: ${q}`}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Shortcuts */}
                  <div>
                    <p className="text-xs text-[#6B7280] uppercase tracking-wider mb-2 px-1">Pintasan Cepat</p>
                    <div className="space-y-0.5">
                      {shortcuts.map((item, i) => (
                        <button
                          key={i}
                          role="option"
                          aria-selected={activeIndex === i}
                          onClick={() => go(item.action)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors group ${activeIndex === i ? 'bg-[#222222]' : 'hover:bg-[#1E1E1E]'}`}
                        >
                          <div className="w-7 h-7 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0">
                            <item.icon size={14} className="text-[#C9A84C]" aria-hidden="true" />
                          </div>
                          <span className="text-sm text-[#F5F5F0] flex-1">{item.label}</span>
                          <ArrowRight size={13} className={`text-[#6B7280] transition-opacity ${activeIndex === i ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-[#2A2A2A] flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs text-[#6B7280]">
                <Command size={11} aria-hidden="true" />
                <span>K untuk buka</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#6B7280]">
                <kbd className="bg-[#0A0A0A] border border-[#2A2A2A] rounded px-1">↑↓</kbd>
                <span>navigasi</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#6B7280]">
                <kbd className="bg-[#0A0A0A] border border-[#2A2A2A] rounded px-1">↵</kbd>
                <span>pilih</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#6B7280]">
                <kbd className="bg-[#0A0A0A] border border-[#2A2A2A] rounded px-1">ESC</kbd>
                <span>tutup</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default CommandPalette
