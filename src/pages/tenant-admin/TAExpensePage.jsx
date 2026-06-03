import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Trash2, Pencil, TrendingDown, TrendingUp, Wallet, ChevronLeft, ChevronRight,
  Search, AlertCircle, Download, RefreshCw, X, Receipt, CheckSquare, Square, Loader2,
  CopyPlus, ArrowUp, ArrowDown, Minus, Users, Check,
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { useAuthStore } from '../../store/authStore.js'
import { useFeatureFlags } from '../../hooks/useFeatureFlags.js'
import { useReportSummary, useStaffPayroll } from '../../hooks/useReports.js'
import { useBranches } from '../../hooks/useBranches.js'
import {
  useExpenses, useExpenseStats, useCreateExpense, useUpdateExpense,
  useDeleteExpense, useBulkDeleteExpenses, useCopyMonthExpenses,
} from '../../hooks/useExpenses.js'
import { EXPENSE_CATEGORIES, catById } from '../../utils/expenseCategories.js'
import { formatRupiah, formatRupiahShort } from '../../utils/format.js'
import api from '../../lib/api.js'
import Button from '../../components/ui/Button.jsx'
import Modal from '../../components/ui/Modal.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import ErrorBoundary from '../../components/ui/ErrorBoundary.jsx'
import { useToast } from '../../components/ui/Toast.jsx'

// ── Constants ───────────────────────────────────────────────────────────────────
const PAGE_LIMIT = 12

const SORT_OPTIONS = [
  { value: 'date-desc',   label: 'Terbaru' },
  { value: 'date-asc',    label: 'Terlama' },
  { value: 'amount-desc', label: 'Nominal ↓' },
  { value: 'amount-asc',  label: 'Nominal ↑' },
]

const EMPTY_FORM = () => ({
  date: format(new Date(), 'yyyy-MM-dd'),
  category: 'gaji',
  description: '',
  amount: '',
  branchId: '',
  note: '',
  barberId: '', // pass-through (tak tampil di UI) — penanda komisi barber
})

// Tanggal pengeluaran disimpan UTC-midnight — ambil bagian kalender saja
// supaya tidak bergeser hari karena timezone browser.
const ymd = (iso) => (iso ? String(iso).slice(0, 10) : '')
const fmtDate = (iso) => {
  try { return format(parseISO(ymd(iso)), 'd MMM yyyy', { locale: idLocale }) }
  catch { return '—' }
}

// ── Paywall ─────────────────────────────────────────────────────────────────────
function Paywall() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center">
        <Wallet className="w-7 h-7 text-brand" />
      </div>
      <h2 className="text-xl font-semibold text-off-white">Manajemen Pengeluaran</h2>
      <p className="text-muted max-w-sm text-sm">
        Fitur ini tersedia di paket <strong className="text-brand">Pro</strong> dan{' '}
        <strong className="text-brand">Enterprise</strong>. Upgrade paket untuk mencatat biaya
        operasional dan melihat laba bersih bisnis Anda.
      </p>
      <a href="/admin/billing" className="px-5 py-2.5 bg-brand text-dark rounded-xl font-semibold text-sm hover:bg-brand/90 transition-colors">
        Lihat Paket
      </a>
    </div>
  )
}

// ── Delta chip — perubahan biaya vs bulan lalu ──────────────────────────────────
// Untuk pengeluaran: KENAIKAN biaya = buruk (merah), penurunan = baik (hijau).
function DeltaChip({ pct }) {
  if (pct == null) return null
  if (pct === 0) return (
    <span title="Sama dengan bulan lalu"
      className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-dark-surface text-muted">
      <Minus size={10} />0%
    </span>
  )
  const up = pct > 0
  return (
    <span title="Dibandingkan bulan lalu"
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
        up ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400'
      }`}>
      {up ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
      {Math.abs(pct)}%
    </span>
  )
}

// ── Summary card ────────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, accent, icon: Icon, loading, delta }) {
  return (
    <div className="bg-dark-card border border-dark-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2 gap-2">
        <p className="text-[11px] text-muted uppercase tracking-wider font-medium">{label}</p>
        <Icon size={18} className={`${accent} flex-shrink-0`} />
      </div>
      {loading
        ? <div className="h-7 w-24 bg-dark-surface rounded-lg animate-pulse" />
        : <p className={`text-xl sm:text-2xl font-bold leading-tight break-words ${accent}`}>{value}</p>}
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        {delta}
        <p className="text-xs text-muted">{sub}</p>
      </div>
    </div>
  )
}

// ── Category breakdown ──────────────────────────────────────────────────────────
function CategoryBreakdown({ byCategory, total }) {
  const sorted = useMemo(() => EXPENSE_CATEGORIES
    .map(c => ({ ...c, amount: byCategory?.[c.id] || 0 }))
    .filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount), [byCategory])

  if (!total || sorted.length === 0) return null

  return (
    <div className="bg-dark-card border border-dark-border rounded-2xl p-4 space-y-3">
      <p className="text-[11px] text-muted uppercase tracking-wider font-medium">Breakdown Kategori</p>
      {sorted.map(c => {
        const pct = Math.round((c.amount / total) * 100)
        return (
          <div key={c.id}>
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="text-xs text-off-white flex items-center gap-1.5 min-w-0">
                <span className="flex-shrink-0">{c.icon}</span>
                <span className="truncate">{c.label}</span>
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-muted tabular-nums">{pct}%</span>
                <span className="text-xs font-semibold text-off-white tabular-nums">{formatRupiah(c.amount)}</span>
              </div>
            </div>
            <div className="h-1.5 bg-dark-surface rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className={`h-full rounded-full ${c.color.replace('text-', 'bg-')}`}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Expense form modal ──────────────────────────────────────────────────────────
function ExpenseFormModal({ open, onClose, initial, branches, onSaved }) {
  const toast = useToast()
  const createExpense = useCreateExpense()
  const updateExpense = useUpdateExpense()
  const [form, setForm] = useState(EMPTY_FORM())
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (initial?.id) {
      setForm({
        date: ymd(initial.date),
        category: initial.category,
        description: initial.description,
        amount: String(initial.amount),
        branchId: initial.branchId || '',
        note: initial.note || '',
        barberId: initial.barberId || '',
      })
    } else if (initial) {
      // Prefill pengeluaran baru (mis. dari "Gaji Staf") — sudah berbentuk form.
      setForm({ ...EMPTY_FORM(), ...initial })
    } else {
      setForm(EMPTY_FORM())
    }
    setError('')
  }, [open, initial])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const saving = createExpense.isPending || updateExpense.isPending
  const amountNum = Number(form.amount)

  const handleSave = async () => {
    if (!form.description.trim()) return setError('Deskripsi wajib diisi')
    if (!form.amount || isNaN(amountNum) || amountNum <= 0) return setError('Nominal harus lebih dari 0')
    if (!form.date) return setError('Tanggal wajib diisi')
    setError('')

    const payload = {
      category: form.category,
      description: form.description.trim(),
      amount: Math.round(amountNum),
      date: form.date,
      branchId: form.branchId || null,
      note: form.note.trim() || null,
      barberId: form.barberId || null,
    }
    try {
      if (initial?.id) {
        await updateExpense.mutateAsync({ id: initial.id, ...payload })
        toast.success('Pengeluaran diperbarui')
      } else {
        await createExpense.mutateAsync(payload)
        toast.success('Pengeluaran ditambahkan')
      }
      onSaved?.()
      onClose()
    } catch (err) {
      const msg = err?.response?.data?.error || 'Gagal menyimpan pengeluaran'
      setError(msg)
      toast.error(msg)
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={initial?.id ? 'Edit Pengeluaran' : 'Tambah Pengeluaran'} size="sm">
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-muted mb-1.5">Tanggal</label>
          <input
            type="date"
            value={form.date}
            onChange={e => set('date', e.target.value)}
            className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/60"
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1.5">Kategori</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {EXPENSE_CATEGORIES.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => set('category', c.id)}
                aria-pressed={form.category === c.id}
                className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs transition-all ${
                  form.category === c.id
                    ? 'border-brand/50 bg-brand/10 text-brand'
                    : 'border-dark-border bg-dark-surface text-muted hover:border-brand/30'
                }`}
              >
                <span className="text-lg">{c.icon}</span>
                <span className="text-center leading-tight">{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1.5">Deskripsi</label>
          <input
            value={form.description}
            onChange={e => set('description', e.target.value)}
            maxLength={200}
            placeholder="Contoh: Gaji barber bulan Mei"
            className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/60"
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1.5">Nominal (Rp)</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            placeholder="500000"
            className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/60"
          />
          {form.amount && !isNaN(amountNum) && amountNum > 0 && (
            <p className="text-xs text-brand mt-1">{formatRupiah(Math.round(amountNum))}</p>
          )}
        </div>

        {branches.length > 0 && (
          <div>
            <label className="block text-xs text-muted mb-1.5">
              Cabang <span className="opacity-50">(opsional)</span>
            </label>
            <select
              value={form.branchId}
              onChange={e => set('branchId', e.target.value)}
              className="w-full bg-dark-surface border border-dark-border text-off-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/60"
            >
              <option value="">Semua Cabang</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs text-muted mb-1.5">
            Catatan <span className="opacity-50">(opsional)</span>
          </label>
          <input
            value={form.note}
            onChange={e => set('note', e.target.value)}
            maxLength={500}
            placeholder="Catatan tambahan…"
            className="w-full bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand/60"
          />
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle size={13} className="flex-shrink-0" />{error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="outline" fullWidth onClick={onClose} disabled={saving}>Batal</Button>
          <Button fullWidth onClick={handleSave} loading={saving}>
            {initial?.id ? 'Simpan' : 'Tambah'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Copy-from-last-month modal ──────────────────────────────────────────────────
// Menarik pengeluaran bulan sebelumnya untuk di-review (checklist) lalu disalin
// sekaligus ke bulan aktif — hemat input rutin (gaji, sewa, listrik).
const EMPTY_ROWS = []

function CopyMonthModal({ open, onClose, fromMonth, toMonth }) {
  const toast = useToast()
  const copyMonth = useCopyMonthExpenses()

  const fromStart  = format(startOfMonth(fromMonth), 'yyyy-MM-dd')
  const fromEnd    = format(endOfMonth(fromMonth), 'yyyy-MM-dd')
  const fromLabel  = format(fromMonth, 'MMMM yyyy', { locale: idLocale })
  const toLabel    = format(toMonth, 'MMMM yyyy', { locale: idLocale })
  const toMonthStr = format(toMonth, 'yyyy-MM')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['expenses-copy-source', fromStart, fromEnd],
    queryFn: () => api
      .get('/expenses', { params: { startDate: fromStart, endDate: fromEnd, limit: 1000, sortBy: 'date-asc' } })
      .then(r => r.data?.data?.data || []),
    enabled: open,
    staleTime: 15_000,
  })
  const rows = data || EMPTY_ROWS

  const [selected, setSelected] = useState(() => new Set())
  // Pilih semua secara default begitu data termuat / modal dibuka.
  useEffect(() => {
    if (open && data) setSelected(new Set(data.map(r => r.id)))
  }, [open, data])

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)))

  const selectedTotal = useMemo(
    () => rows.filter(r => selected.has(r.id)).reduce((s, r) => s + r.amount, 0),
    [rows, selected],
  )

  const handleCopy = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    try {
      const res = await copyMonth.mutateAsync({ ids, toMonth: toMonthStr })
      toast.success(`${res?.created ?? ids.length} pengeluaran disalin ke ${toLabel}`)
      onClose()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menyalin pengeluaran')
    }
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Salin Pengeluaran" size="md">
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Pilih pengeluaran dari <span className="text-off-white font-medium capitalize">{fromLabel}</span> untuk
          disalin ke <span className="text-brand font-medium capitalize">{toLabel}</span>.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={22} className="animate-spin text-brand" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertCircle size={22} className="text-red-400" />
            <p className="text-sm text-muted">Gagal memuat data bulan lalu</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-dark-surface border border-dark-border flex items-center justify-center">
              <Receipt size={22} className="text-muted" />
            </div>
            <p className="text-sm text-muted capitalize">Tidak ada pengeluaran di {fromLabel}</p>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleAll}
              className="flex items-center gap-2 text-xs text-muted hover:text-off-white transition-colors"
            >
              {allSelected ? <CheckSquare size={15} className="text-brand" /> : <Square size={15} />}
              {allSelected ? 'Batalkan semua' : 'Pilih semua'}
            </button>

            <div className="max-h-[44vh] overflow-y-auto -mx-1 divide-y divide-dark-border">
              {rows.map(r => {
                const cat = catById(r.category)
                const isSel = selected.has(r.id)
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggle(r.id)}
                    className="w-full flex items-center gap-3 px-1 py-2.5 text-left hover:bg-dark-surface/40 transition-colors"
                  >
                    {isSel
                      ? <CheckSquare size={17} className="text-brand flex-shrink-0" />
                      : <Square size={17} className="text-muted flex-shrink-0" />}
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm ${cat.bg}`}>
                      {cat.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-off-white truncate">{r.description}</p>
                      <p className="text-[10px] text-muted">
                        {cat.label}
                        {r.branch?.name && ` · ${r.branch.name}`}
                        {' · '}{fmtDate(r.date)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-red-400 flex-shrink-0 tabular-nums">
                      {formatRupiahShort(r.amount)}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1 text-xs">
              <span className="text-muted">
                <span className="text-off-white font-medium">{selected.size}</span> dipilih
              </span>
              <span className="text-red-400 font-semibold tabular-nums">{formatRupiah(selectedTotal)}</span>
            </div>
          </>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="outline" fullWidth onClick={onClose} disabled={copyMonth.isPending}>
            Batal
          </Button>
          <Button
            fullWidth
            icon={CopyPlus}
            onClick={handleCopy}
            loading={copyMonth.isPending}
            disabled={selected.size === 0 || isLoading}
          >
            Salin {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Expense list item (desktop row + mobile card share this) ────────────────────
function ExpenseItem({ expense, selected, onToggleSelect, onEdit, onDelete }) {
  const cat = catById(expense.category)
  const branchName = expense.branch?.name

  return (
    <div className="flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-dark-surface/40 transition-colors">
      <button
        type="button"
        onClick={() => onToggleSelect(expense.id)}
        aria-label={selected ? 'Batal pilih' : 'Pilih'}
        className="flex-shrink-0 text-muted hover:text-brand transition-colors"
      >
        {selected ? <CheckSquare size={18} className="text-brand" /> : <Square size={18} />}
      </button>

      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base ${cat.bg}`}>
        {cat.icon}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-off-white truncate">{expense.description}</p>
        <div className="flex items-center gap-x-2 gap-y-0.5 mt-0.5 flex-wrap">
          <span className={`text-[10px] font-medium ${cat.color}`}>{cat.label}</span>
          {branchName && <span className="text-[10px] text-muted">· {branchName}</span>}
          <span className="text-[10px] text-muted">· {fmtDate(expense.date)}</span>
        </div>
      </div>

      <p className="text-sm font-semibold text-red-400 flex-shrink-0 tabular-nums">
        <span className="sm:hidden">{formatRupiahShort(expense.amount)}</span>
        <span className="hidden sm:inline">{formatRupiah(expense.amount)}</span>
      </p>

      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => onEdit(expense)}
          aria-label="Edit pengeluaran"
          className="p-1.5 rounded-lg text-muted hover:text-brand hover:bg-dark-surface transition-colors"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(expense)}
          aria-label="Hapus pengeluaran"
          className="p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-dark-surface transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Skeleton rows ───────────────────────────────────────────────────────────────
function ListSkeleton() {
  return (
    <div className="divide-y divide-dark-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="w-9 h-9 rounded-xl bg-dark-surface animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/2 bg-dark-surface rounded animate-pulse" />
            <div className="h-2.5 w-1/3 bg-dark-surface rounded animate-pulse" />
          </div>
          <div className="h-4 w-20 bg-dark-surface rounded animate-pulse" />
        </div>
      ))}
    </div>
  )
}

// ── Barber payroll modal ────────────────────────────────────────────────────────
// Jembatan Komisi → Pengeluaran. Komisi barber TIDAK otomatis jadi pengeluaran —
// modal ini menampilkan komisi tiap barber periode berjalan, lalu "Catat" mengisi
// form pengeluaran (kategori Gaji & Honor) otomatis untuk di-review & disimpan.
// Rincian per skema gaji untuk modal Gaji Staf.
function payDetail(s) {
  if (s.salaryType === 'fixed') return 'Gaji pokok bulanan tetap'
  if (s.salaryType === 'hybrid') {
    return `Pokok ${formatRupiahShort(s.baseSalary)} + komisi ${formatRupiahShort(s.commission)}`
  }
  return `Omzet ${formatRupiahShort(s.revenue)} · ${Math.round((s.commissionRate || 0) * 100)}% · ${s.servicesCount} layanan`
}

function StaffPayrollModal({ open, onClose, monthLabel, startDate, endDate, onPick }) {
  const { user } = useAuthStore()
  const { data, isLoading, isError } = useStaffPayroll(
    open ? user?.tenantId : undefined,
    { startDate, endDate },
  )
  // Tampilkan staf dengan gaji > 0 (barber komisi/pokok/kombinasi, kasir pokok).
  const staff = useMemo(
    () => (Array.isArray(data) ? data : []).filter(s => (s.pay || 0) > 0),
    [data],
  )
  const totalPay = staff.reduce((sum, s) => sum + (s.pay || 0), 0)

  // Penanda "sudah dicatat": cek pengeluaran kategori gaji bulan ini.
  const { data: gajiExpenses } = useQuery({
    queryKey: ['expenses', 'payroll-paid', startDate, endDate],
    queryFn: () => api
      .get('/expenses', { params: { category: 'gaji', startDate, endDate, limit: 1000 } })
      .then(r => r.data?.data?.data || []),
    enabled: open,
    staleTime: 10_000,
  })
  const paidIds = useMemo(
    () => new Set((gajiExpenses || []).map(e => e.barberId).filter(Boolean)),
    [gajiExpenses],
  )
  const paidCount = staff.filter(s => paidIds.has(s.barberId)).length

  return (
    <Modal isOpen={open} onClose={onClose} title="Gaji Staf" size="md">
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Gaji tiap staf (barber &amp; kasir) untuk <span className="text-off-white font-medium capitalize">{monthLabel}</span> sesuai
          skema masing-masing. Klik <span className="text-brand">Catat</span> untuk mengisi form pengeluaran
          otomatis. Tanda <span className="text-green-400">✓ Dicatat</span> = sudah masuk pengeluaran bulan ini.
        </p>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={22} className="animate-spin text-brand" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <AlertCircle size={22} className="text-red-400" />
            <p className="text-sm text-muted">Gagal memuat data gaji staf</p>
          </div>
        ) : staff.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-dark-surface border border-dark-border flex items-center justify-center">
              <Users size={20} className="text-muted" />
            </div>
            <p className="text-sm text-muted capitalize">Belum ada gaji staf untuk dibayar di {monthLabel}</p>
          </div>
        ) : (
          <>
            <div className="max-h-[44vh] overflow-y-auto -mx-1 divide-y divide-dark-border">
              {staff.map(s => {
                const paid = paidIds.has(s.barberId)
                const isKasir = s.role === 'kasir'
                return (
                  <div key={s.barberId} className={`flex items-center gap-3 px-1 py-2.5 ${paid ? 'opacity-55' : ''}`}>
                    <div className="w-8 h-8 rounded-lg bg-blue-400/10 flex items-center justify-center flex-shrink-0">
                      <Wallet size={15} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm text-off-white truncate">{s.barberName}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap ${
                          isKasir ? 'bg-blue-400/15 text-blue-300' : 'bg-dark-surface text-muted'
                        }`}>
                          {isKasir ? 'Kasir' : 'Barber'}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted truncate">{payDetail(s)}</p>
                      {s.attendance && (s.attendance.present + s.attendance.late + s.attendance.absent + s.attendance.leave) > 0 && (
                        <p className="text-[10px] truncate">
                          <span className="text-muted">Absensi: </span>
                          <span className="text-green-400">{s.attendance.present + s.attendance.late} hadir</span>
                          {s.attendance.late > 0 && <span className="text-amber-400"> · {s.attendance.late} telat</span>}
                          {s.attendance.absent > 0 && <span className="text-red-400"> · {s.attendance.absent} alpa</span>}
                          {s.attendance.leave > 0 && <span className="text-blue-400"> · {s.attendance.leave} izin</span>}
                        </p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-off-white flex-shrink-0 tabular-nums">
                      {formatRupiahShort(s.pay)}
                    </span>
                    {paid ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-1 rounded-lg flex-shrink-0">
                        <Check size={12} /> Dicatat
                      </span>
                    ) : (
                      <Button size="xs" variant="secondary" onClick={() => onPick(s)} className="flex-shrink-0">
                        Catat
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between gap-2 pt-2 text-xs border-t border-dark-border">
              <span className="text-muted">
                {staff.length} staf
                {paidCount > 0 && <span className="text-green-400"> · {paidCount} sudah dicatat</span>}
              </span>
              <span className="text-off-white font-semibold tabular-nums">
                Total gaji {formatRupiah(totalPay)}
              </span>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────────
function ExpensePageInner() {
  const { user } = useAuthStore()
  const toast = useToast()
  const tenantId = user?.tenantId

  // Gate fitur dari backend (TenantFeatureFlag) — bukan seed lokal.
  const { data: featureFlags = [], isLoading: flagsLoading } = useFeatureFlags(tenantId)
  const isAllowed = featureFlags.includes('expense_tracking')
  const { data: branches = [] } = useBranches(tenantId)

  // Periode = bulan aktif.
  const [activeMonth, setActiveMonth] = useState(() => new Date())
  const startDate = useMemo(() => format(startOfMonth(activeMonth), 'yyyy-MM-dd'), [activeMonth])
  const endDate   = useMemo(() => format(endOfMonth(activeMonth),   'yyyy-MM-dd'), [activeMonth])
  const monthLabel = format(activeMonth, 'MMMM yyyy', { locale: idLocale })
  const isCurrentMonth = format(activeMonth, 'yyyy-MM') === format(new Date(), 'yyyy-MM')

  // Filter & search (debounced).
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]           = useState('')
  const [catFilter, setCatFilter]     = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [sortBy, setSortBy]           = useState('date-desc')
  const [page, setPage]               = useState(1)

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset ke halaman 1 saat filter/periode berubah.
  useEffect(() => { setPage(1) }, [search, catFilter, branchFilter, sortBy, startDate])

  const filters = useMemo(() => ({
    page,
    limit: PAGE_LIMIT,
    startDate,
    endDate,
    sortBy,
    ...(search ? { search } : {}),
    ...(catFilter !== 'all' ? { category: catFilter } : {}),
    ...(branchFilter !== 'all' ? { branchId: branchFilter } : {}),
  }), [page, startDate, endDate, sortBy, search, catFilter, branchFilter])

  const { data: listData, isLoading, isError, isFetching, refetch } = useExpenses(filters)
  const { data: stats, refetch: refetchStats } = useExpenseStats({ startDate, endDate })
  const { data: reportData } = useReportSummary(tenantId, startDate, endDate)

  const expenses    = listData?.data || []
  const total       = listData?.total || 0
  const totalPages  = listData?.totalPages || 0
  const totalExpenses = stats?.total ?? 0
  const totalRevenue  = reportData?.summary?.totalRevenue ?? null
  const netProfit     = totalRevenue != null ? totalRevenue - totalExpenses : null

  // Perubahan biaya vs bulan lalu — null bila bulan lalu nol (tak ada acuan).
  const prevTotal = stats?.prevTotal ?? 0
  const expenseDeltaPct = useMemo(() => {
    if (!prevTotal || prevTotal <= 0) return null
    return Math.round(((totalExpenses - prevTotal) / prevTotal) * 100)
  }, [totalExpenses, prevTotal])

  // Mutations.
  const deleteExpense     = useDeleteExpense()
  const bulkDeleteExpenses = useBulkDeleteExpenses()

  // Selection (bulk action) — reset saat data/periode berganti.
  const [selected, setSelected] = useState(() => new Set())
  useEffect(() => { setSelected(new Set()) }, [page, startDate, search, catFilter, branchFilter, sortBy])

  const toggleSelect = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])
  const pageIds = expenses.map(e => e.id)
  const allOnPageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id))
  const toggleSelectAll = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allOnPageSelected) pageIds.forEach(id => next.delete(id))
      else pageIds.forEach(id => next.add(id))
      return next
    })
  }

  // Modals.
  const [formOpen, setFormOpen]       = useState(false)
  const [editTarget, setEditTarget]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [exporting, setExporting]     = useState(false)
  const [copyOpen, setCopyOpen]       = useState(false)
  const [payrollOpen, setPayrollOpen] = useState(false)

  const openCreate = () => { setEditTarget(null); setFormOpen(true) }
  const openEdit   = (e) => { setEditTarget(e); setFormOpen(true) }

  // Dari modal Gaji Staf → buka form pengeluaran terisi otomatis sesuai
  // skema gaji staf. Bukan edit (tanpa id) → ExpenseFormModal prefill.
  const handlePickPayroll = (staff) => {
    setPayrollOpen(false)
    const ratePct = Math.round((staff.commissionRate || 0) * 100)
    let note
    if (staff.salaryType === 'fixed') {
      note = 'Gaji pokok bulanan'
    } else if (staff.salaryType === 'hybrid') {
      note = `Gaji pokok ${formatRupiah(staff.baseSalary || 0)} + komisi ${ratePct}% (${formatRupiah(staff.commission || 0)})`
    } else {
      note = `Komisi ${ratePct}% dari omzet ${formatRupiah(staff.revenue || 0)}`
    }
    setEditTarget({
      category: 'gaji',
      description: `Gaji ${staff.barberName} ${monthLabel}`,
      amount: String(staff.pay || 0),
      // Tanggal akhir bulan → masuk laporan bulan tsb & terdeteksi "sudah dicatat".
      date: endDate,
      branchId: '',
      barberId: staff.barberId,
      note,
    })
    setFormOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteExpense.mutateAsync(deleteTarget.id)
      toast.success('Pengeluaran dihapus')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menghapus')
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleBulkDelete = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    try {
      const res = await bulkDeleteExpenses.mutateAsync(ids)
      toast.success(`${res?.deleted ?? ids.length} pengeluaran dihapus`)
      setSelected(new Set())
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal menghapus massal')
    } finally {
      setBulkConfirm(false)
    }
  }

  const handleRefresh = () => { refetch(); refetchStats() }

  // Export CSV — ambil seluruh baris periode (dengan filter aktif), bukan 1 halaman.
  const handleExport = async () => {
    if (total === 0) { toast.error('Tidak ada data untuk diekspor'); return }
    setExporting(true)
    try {
      const res = await api.get('/expenses', {
        params: { ...filters, page: 1, limit: 1000 },
      })
      const rows = res.data?.data?.data || []
      const header = ['Tanggal', 'Kategori', 'Deskripsi', 'Cabang', 'Nominal', 'Catatan']
      const body = rows.map(e => [
        ymd(e.date),
        catById(e.category).label,
        e.description,
        e.branch?.name || 'Semua Cabang',
        e.amount,
        e.note || '',
      ])
      const escape = (v) => {
        const s = String(v ?? '')
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const csv = [header, ...body].map(r => r.map(escape).join(',')).join('\r\n')
      const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pengeluaran-${format(activeMonth, 'yyyy-MM')}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Berhasil ekspor ${rows.length} pengeluaran`)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Gagal mengekspor')
    } finally {
      setExporting(false)
    }
  }

  const hasFilter = !!search || catFilter !== 'all' || branchFilter !== 'all'

  // Tunggu status flag — hindari Paywall berkedip.
  if (flagsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
      </div>
    )
  }
  if (!isAllowed) return <Paywall />

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-off-white">Pengeluaran</h1>
            <p className="text-sm text-muted mt-0.5">Kelola biaya operasional &amp; hitung laba bersih</p>
          </div>
          <Button icon={Plus} onClick={openCreate} className="flex-shrink-0">
            <span className="hidden sm:inline">Tambah</span>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Month picker */}
          <div className="flex items-center gap-1 bg-dark-card border border-dark-border rounded-xl px-1 py-1">
            <button
              onClick={() => setActiveMonth(m => subMonths(m, 1))}
              aria-label="Bulan sebelumnya"
              className="p-1.5 text-muted hover:text-off-white transition-colors rounded-lg hover:bg-dark-surface"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-off-white px-2 min-w-[116px] text-center capitalize">
              {monthLabel}
            </span>
            <button
              onClick={() => setActiveMonth(m => addMonths(m, 1))}
              disabled={isCurrentMonth}
              aria-label="Bulan berikutnya"
              className="p-1.5 text-muted hover:text-off-white transition-colors rounded-lg hover:bg-dark-surface disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            onClick={() => setCopyOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand/30 text-xs text-brand hover:bg-brand/10 transition-all"
          >
            <CopyPlus size={13} />
            <span className="hidden sm:inline">Salin Bulan Lalu</span>
            <span className="sm:hidden">Salin</span>
          </button>
          <button
            onClick={() => setPayrollOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dark-border text-xs text-muted hover:border-brand/30 hover:text-off-white transition-all"
          >
            <Users size={13} />
            <span className="hidden sm:inline">Gaji Staf</span>
            <span className="sm:hidden">Gaji</span>
          </button>
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dark-border text-xs text-muted hover:border-brand/30 hover:text-off-white transition-all disabled:opacity-40"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || total === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dark-border text-xs text-muted hover:border-brand/30 hover:text-off-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            <span className="hidden sm:inline">Ekspor CSV</span>
            <span className="sm:hidden">Ekspor</span>
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <SummaryCard
          label="Total Pengeluaran"
          value={formatRupiah(totalExpenses)}
          sub={`${stats?.count ?? 0} item bulan ini`}
          accent="text-red-400"
          icon={TrendingDown}
          delta={<DeltaChip pct={expenseDeltaPct} />}
        />
        <SummaryCard
          label="Total Pemasukan"
          value={totalRevenue != null ? formatRupiah(totalRevenue) : '—'}
          sub={totalRevenue == null ? 'Memuat data…' : 'dari transaksi'}
          accent="text-green-400"
          icon={TrendingUp}
          loading={totalRevenue == null}
        />
        <SummaryCard
          label="Laba Bersih"
          value={netProfit == null ? '—' : formatRupiah(netProfit)}
          sub={netProfit == null ? 'Memuat…'
            : netProfit >= 0 ? 'Bisnis kamu profitable 🎉' : 'Pengeluaran melebihi pemasukan'}
          accent={netProfit == null ? 'text-muted' : netProfit >= 0 ? 'text-brand' : 'text-red-400'}
          icon={Wallet}
          loading={netProfit == null}
        />
      </div>

      {/* ── Category breakdown ── */}
      <CategoryBreakdown byCategory={stats?.byCategory} total={totalExpenses} />

      {/* ── Expense list ── */}
      <div className="bg-dark-card border border-dark-border rounded-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col gap-2 px-3 sm:px-4 py-3 border-b border-dark-border sm:flex-row sm:items-center sm:flex-wrap">
          <p className="text-sm font-medium text-off-white sm:mr-auto">
            Daftar Pengeluaran
            {total > 0 && <span className="text-muted font-normal"> · {total}</span>}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
            <div className="relative col-span-2 sm:col-span-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                type="text"
                inputMode="search"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Cari deskripsi…"
                className="bg-dark-surface border border-dark-border text-off-white placeholder-muted rounded-lg pl-8 pr-7 py-1.5 text-xs outline-none focus:border-brand/50 w-full sm:w-44"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput('')}
                  aria-label="Hapus pencarian"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-off-white"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <select
              value={catFilter}
              onChange={e => setCatFilter(e.target.value)}
              aria-label="Filter kategori"
              className="bg-dark-surface border border-dark-border text-off-white rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-brand/50 w-full sm:w-auto"
            >
              <option value="all">Semua Kategori</option>
              {EXPENSE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
            {branches.length > 0 && (
              <select
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value)}
                aria-label="Filter cabang"
                className="bg-dark-surface border border-dark-border text-off-white rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-brand/50 w-full sm:w-auto"
              >
                <option value="all">Semua Cabang</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              aria-label="Urutkan"
              className={`bg-dark-surface border border-dark-border text-off-white rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-brand/50 w-full sm:w-auto ${branches.length > 0 ? '' : 'col-span-2 sm:col-span-1'}`}
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Bulk action bar */}
        <AnimatePresence>
          {selected.size > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden bg-brand/5 border-b border-brand/20"
            >
              <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5">
                <span className="text-xs text-brand font-medium">{selected.size} dipilih</span>
                <button
                  onClick={() => setSelected(new Set())}
                  className="text-xs text-muted hover:text-off-white"
                >
                  Batal
                </button>
                <Button
                  variant="danger"
                  size="xs"
                  icon={Trash2}
                  className="ml-auto"
                  loading={bulkDeleteExpenses.isPending}
                  onClick={() => setBulkConfirm(true)}
                >
                  Hapus
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Select-all row */}
        {!isLoading && !isError && expenses.length > 0 && (
          <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-dark-border bg-dark-surface/30">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-xs text-muted hover:text-off-white transition-colors"
            >
              {allOnPageSelected
                ? <CheckSquare size={15} className="text-brand" />
                : <Square size={15} />}
              Pilih semua di halaman ini
            </button>
          </div>
        )}

        {/* Body: loading / error / empty / list */}
        {isLoading ? (
          <ListSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertCircle size={22} className="text-red-400" />
            </div>
            <p className="text-sm text-muted">Gagal memuat data pengeluaran</p>
            <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => refetch()}>Coba lagi</Button>
          </div>
        ) : expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-dark-surface border border-dark-border flex items-center justify-center">
              <Receipt size={22} className="text-muted" />
            </div>
            <p className="text-muted text-sm">
              {hasFilter
                ? 'Tidak ada pengeluaran yang cocok dengan filter'
                : `Belum ada pengeluaran dicatat di ${monthLabel}`}
            </p>
            {hasFilter ? (
              <button
                onClick={() => { setSearchInput(''); setCatFilter('all'); setBranchFilter('all') }}
                className="text-xs text-brand hover:text-brand/80 transition-colors"
              >
                Reset filter
              </button>
            ) : (
              <button onClick={openCreate} className="text-xs text-brand hover:text-brand/80 transition-colors">
                + Tambah pengeluaran pertama
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-dark-border">
            <AnimatePresence initial={false}>
              {expenses.map(e => (
                <motion.div key={e.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <ExpenseItem
                    expense={e}
                    selected={selected.has(e.id)}
                    onToggleSelect={toggleSelect}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Pagination footer */}
        {!isLoading && !isError && totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-3 border-t border-dark-border bg-dark-surface/40">
            <span className="text-xs text-muted">
              Hal <span className="text-off-white">{page}</span> / {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Halaman sebelumnya"
                className="p-1.5 rounded-lg border border-dark-border text-muted hover:text-off-white hover:border-brand/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Halaman berikutnya"
                className="p-1.5 rounded-lg border border-dark-border text-muted hover:text-off-white hover:border-brand/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <ExpenseFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        initial={editTarget}
        branches={branches}
      />

      <CopyMonthModal
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        fromMonth={subMonths(activeMonth, 1)}
        toMonth={activeMonth}
      />

      <StaffPayrollModal
        open={payrollOpen}
        onClose={() => setPayrollOpen(false)}
        monthLabel={monthLabel}
        startDate={startDate}
        endDate={endDate}
        onPick={handlePickPayroll}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Pengeluaran?"
        description="Tindakan ini tidak dapat dibatalkan."
        highlight={deleteTarget?.description}
        confirmText="Ya, Hapus"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={bulkConfirm}
        onClose={() => setBulkConfirm(false)}
        onConfirm={handleBulkDelete}
        title="Hapus Pengeluaran Terpilih?"
        description={`${selected.size} pengeluaran akan dihapus permanen.`}
        confirmText={`Hapus ${selected.size} item`}
        variant="danger"
      />
    </div>
  )
}

export default function TAExpensePage() {
  return (
    <ErrorBoundary>
      <ExpensePageInner />
    </ErrorBoundary>
  )
}
