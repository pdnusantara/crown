import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Pencil, TrendingDown, TrendingUp, Wallet, ChevronLeft, ChevronRight, Search, AlertCircle } from 'lucide-react'
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { useAuthStore } from '../../store/authStore.js'
import { useExpenseStore, EXPENSE_CATEGORIES } from '../../store/expenseStore.js'
import { useFeatureFlagStore } from '../../store/featureFlagStore.js'
import { useReportSummary } from '../../hooks/useReports.js'
import { formatRupiah } from '../../utils/format.js'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import Input from '../../components/ui/Input.jsx'
import { useTenantStore } from '../../store/tenantStore.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const catById = (id) => EXPENSE_CATEGORIES.find(c => c.id === id) || EXPENSE_CATEGORIES[5]

function ProfitChip({ value }) {
  if (value == null) return null
  const pos = value >= 0
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${pos ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
      {pos ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {pos ? '+' : ''}{formatRupiah(value)}
    </span>
  )
}

// ── Paywall (feature not enabled) ────────────────────────────────────────────

function Paywall() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center">
        <Wallet className="w-7 h-7 text-gold" />
      </div>
      <h2 className="text-xl font-semibold text-off-white">Manajemen Pengeluaran</h2>
      <p className="text-muted max-w-sm text-sm">
        Fitur ini tersedia di paket <strong className="text-gold">Pro</strong> dan <strong className="text-gold">Enterprise</strong>.
        Upgrade paket untuk mencatat biaya operasional dan melihat laba bersih bisnis Anda.
      </p>
      <a href="/admin/billing" className="px-5 py-2.5 bg-gold text-dark rounded-xl font-semibold text-sm hover:bg-gold/90 transition-colors">
        Lihat Paket
      </a>
    </div>
  )
}

// ── Category bar chart ────────────────────────────────────────────────────────

function CategoryBreakdown({ catTotals, total }) {
  if (!total) return null
  const sorted = EXPENSE_CATEGORIES
    .map(c => ({ ...c, amount: catTotals[c.id] || 0 }))
    .filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  return (
    <div className="bg-dark-card border border-dark-border rounded-2xl p-4 space-y-3">
      <p className="text-xs text-muted uppercase tracking-wider font-medium">Breakdown Kategori</p>
      {sorted.map(c => {
        const pct = Math.round((c.amount / total) * 100)
        return (
          <div key={c.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-off-white flex items-center gap-1.5">
                <span>{c.icon}</span>
                {c.label}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">{pct}%</span>
                <span className="text-xs font-semibold text-off-white">{formatRupiah(c.amount)}</span>
              </div>
            </div>
            <div className="h-1.5 bg-dark-border rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className={`h-full rounded-full ${c.bg.replace('/10', '')} opacity-70`}
                style={{ background: 'currentColor' }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Expense form modal ────────────────────────────────────────────────────────

const EMPTY_FORM = { date: new Date().toISOString().split('T')[0], category: 'gaji', description: '', amount: '', branchId: '' }

function ExpenseFormModal({ open, onClose, initial, tenantId, branches }) {
  const { addExpense, updateExpense } = useExpenseStore()
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const [error, setError] = useState('')

  React.useEffect(() => {
    setForm(initial || EMPTY_FORM)
    setError('')
  }, [open, initial])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = () => {
    if (!form.description.trim()) return setError('Deskripsi wajib diisi')
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) return setError('Nominal harus lebih dari 0')
    const data = { ...form, amount: Number(form.amount), tenantId, branchId: form.branchId || null }
    if (initial?.id) updateExpense(initial.id, data)
    else addExpense(data)
    onClose()
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={initial?.id ? 'Edit Pengeluaran' : 'Tambah Pengeluaran'} size="sm">
      <div className="space-y-4">
        {/* Date */}
        <div>
          <label className="block text-xs text-muted mb-1.5">Tanggal</label>
          <input
            type="date"
            value={form.date}
            onChange={e => set('date', e.target.value)}
            className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/60"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-xs text-muted mb-1.5">Kategori</label>
          <div className="grid grid-cols-3 gap-2">
            {EXPENSE_CATEGORIES.map(c => (
              <button
                key={c.id}
                onClick={() => set('category', c.id)}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs transition-all ${
                  form.category === c.id
                    ? 'border-gold/50 bg-gold/10 text-gold'
                    : 'border-dark-border bg-dark-card text-muted hover:border-dark-border/80'
                }`}
              >
                <span className="text-lg">{c.icon}</span>
                <span className="text-center leading-tight">{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs text-muted mb-1.5">Deskripsi</label>
          <input
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Contoh: Gaji barber bulan Mei"
            className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/60"
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs text-muted mb-1.5">Nominal (Rp)</label>
          <input
            type="number"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            placeholder="500000"
            className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/60"
          />
        </div>

        {/* Branch (optional) */}
        {branches.length > 0 && (
          <div>
            <label className="block text-xs text-muted mb-1.5">Cabang <span className="opacity-50">(opsional)</span></label>
            <select
              value={form.branchId}
              onChange={e => set('branchId', e.target.value)}
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gold/60"
            >
              <option value="">Semua Cabang</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle size={13} />{error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="outline" fullWidth onClick={onClose}>Batal</Button>
          <Button fullWidth onClick={handleSave}>{initial?.id ? 'Simpan' : 'Tambah'}</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TAExpensePage() {
  const { user } = useAuthStore()
  const { isEnabled } = useFeatureFlagStore()
  const { getByPeriod, deleteExpense, getTotalByPeriod, getCategoryTotals } = useExpenseStore()
  const { getBranchesByTenant } = useTenantStore()

  const tenantId   = user?.tenantId
  const isAllowed  = isEnabled(tenantId, 'expense_tracking')
  const branches   = tenantId ? getBranchesByTenant(tenantId) : []

  // Period state — default to current month
  const [activeMonth, setActiveMonth] = useState(new Date())
  const startDate = format(startOfMonth(activeMonth), 'yyyy-MM-dd')
  const endDate   = format(endOfMonth(activeMonth),   'yyyy-MM-dd')

  // Revenue from reports API
  const { data: reportData } = useReportSummary(tenantId, startDate, endDate)
  const totalRevenue = reportData?.summary?.totalRevenue ?? null

  // Expenses from store
  const expenses      = getByPeriod(tenantId, startDate, endDate)
  const totalExpenses = getTotalByPeriod(tenantId, startDate, endDate)
  const catTotals     = getCategoryTotals(tenantId, startDate, endDate)
  const netProfit     = totalRevenue != null ? totalRevenue - totalExpenses : null

  // Filters
  const [catFilter,  setCatFilter]  = useState('all')
  const [search,     setSearch]     = useState('')
  // Modal
  const [formOpen,    setFormOpen]    = useState(false)
  const [editTarget,  setEditTarget]  = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const filtered = useMemo(() => expenses.filter(e => {
    const matchCat  = catFilter === 'all' || e.category === catFilter
    const matchText = !search || e.description.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchText
  }), [expenses, catFilter, search])

  const monthLabel = format(activeMonth, 'MMMM yyyy', { locale: idLocale })

  if (!isAllowed) return <Paywall />

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-off-white">Pengeluaran</h1>
          <p className="text-sm text-muted mt-0.5">Kelola biaya operasional & hitung laba bersih</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Month picker */}
          <div className="flex items-center gap-1 bg-dark-card border border-dark-border rounded-xl px-1 py-1">
            <button onClick={() => setActiveMonth(m => subMonths(m, 1))} className="p-1.5 text-muted hover:text-off-white transition-colors rounded-lg hover:bg-dark-surface">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-off-white px-2 min-w-[120px] text-center capitalize">{monthLabel}</span>
            <button onClick={() => setActiveMonth(m => addMonths(m, 1))} className="p-1.5 text-muted hover:text-off-white transition-colors rounded-lg hover:bg-dark-surface">
              <ChevronRight size={16} />
            </button>
          </div>
          <Button icon={Plus} onClick={() => { setEditTarget(null); setFormOpen(true) }}>
            Tambah
          </Button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="Total Pengeluaran"
          value={formatRupiah(totalExpenses)}
          sub={`${expenses.length} item`}
          accent="text-red-400"
          icon={<TrendingDown size={18} className="text-red-400" />}
        />
        <SummaryCard
          label="Total Pemasukan"
          value={totalRevenue != null ? formatRupiah(totalRevenue) : '—'}
          sub={totalRevenue == null ? 'Memuat data...' : 'dari transaksi'}
          accent="text-green-400"
          icon={<TrendingUp size={18} className="text-green-400" />}
        />
        <div className="bg-dark-card border border-dark-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted uppercase tracking-wider">Laba Bersih</p>
            <Wallet size={18} className={netProfit == null ? 'text-muted' : netProfit >= 0 ? 'text-gold' : 'text-red-400'} />
          </div>
          <p className={`text-2xl font-bold ${netProfit == null ? 'text-muted' : netProfit >= 0 ? 'text-gold' : 'text-red-400'}`}>
            {netProfit == null ? '—' : formatRupiah(netProfit)}
          </p>
          <p className="text-xs text-muted mt-1">
            {netProfit == null ? 'Memuat...' :
             netProfit >= 0 ? 'Bisnis kamu profitable 🎉' : 'Pengeluaran melebihi pemasukan'}
          </p>
        </div>
      </div>

      {/* ── Category breakdown ── */}
      {totalExpenses > 0 && (
        <CategoryBreakdown catTotals={catTotals} total={totalExpenses} />
      )}

      {/* ── Expense list ── */}
      <div className="bg-dark-card border border-dark-border rounded-2xl overflow-hidden">
        {/* List header + filters */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-dark-border flex-wrap">
          <p className="text-sm font-medium text-off-white flex-1">Daftar Pengeluaran</p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari..."
                className="bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:border-gold/50 w-36"
              />
            </div>
            <select
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              className="bg-dark-surface border border-dark-border text-off-white rounded-lg px-3 py-1.5 text-xs outline-none focus:border-gold/50"
            >
              <option value="all">Semua Kategori</option>
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-dark-surface border border-dark-border flex items-center justify-center text-2xl">
              📋
            </div>
            <p className="text-muted text-sm">Belum ada pengeluaran dicatat bulan ini</p>
            <button
              onClick={() => { setEditTarget(null); setFormOpen(true) }}
              className="text-xs text-gold hover:text-gold/80 transition-colors"
            >
              + Tambah pengeluaran pertama
            </button>
          </div>
        ) : (
          <div className="divide-y divide-dark-border">
            <AnimatePresence initial={false}>
              {filtered.map(e => {
                const cat = catById(e.category)
                const branch = e.branchId ? branches.find(b => b.id === e.branchId) : null
                return (
                  <motion.div
                    key={e.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-dark-surface/40 transition-colors group"
                  >
                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base ${cat.bg}`}>
                      {cat.icon}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-off-white truncate">{e.description}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-[10px] font-medium ${cat.color}`}>{cat.label}</span>
                        {branch && <span className="text-[10px] text-muted">· {branch.name}</span>}
                        <span className="text-[10px] text-muted">
                          · {format(parseISO(e.date), 'd MMM yyyy', { locale: idLocale })}
                        </span>
                      </div>
                    </div>
                    {/* Amount */}
                    <p className="text-sm font-semibold text-red-400 flex-shrink-0">{formatRupiah(e.amount)}</p>
                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => { setEditTarget(e); setFormOpen(true) }}
                        className="p-1.5 rounded-lg text-muted hover:text-gold transition-colors hover:bg-dark-surface"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(e.id)}
                        className="p-1.5 rounded-lg text-muted hover:text-red-400 transition-colors hover:bg-dark-surface"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Footer total */}
        {filtered.length > 0 && (
          <div className="flex justify-between items-center px-4 py-3 border-t border-dark-border bg-dark-surface/40">
            <span className="text-xs text-muted">{filtered.length} item</span>
            <span className="text-sm font-semibold text-red-400">
              {formatRupiah(filtered.reduce((s, e) => s + e.amount, 0))}
            </span>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <ExpenseFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        initial={editTarget}
        tenantId={tenantId}
        branches={branches}
      />

      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Hapus Pengeluaran?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">Tindakan ini tidak dapat dibatalkan.</p>
          <div className="flex gap-3">
            <Button variant="outline" fullWidth onClick={() => setDeleteConfirm(null)}>Batal</Button>
            <Button variant="danger" fullWidth onClick={() => { deleteExpense(deleteConfirm); setDeleteConfirm(null) }}>
              Hapus
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function SummaryCard({ label, value, sub, accent, icon }) {
  return (
    <div className="bg-dark-card border border-dark-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted uppercase tracking-wider">{label}</p>
        {icon}
      </div>
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      <p className="text-xs text-muted mt-1">{sub}</p>
    </div>
  )
}
