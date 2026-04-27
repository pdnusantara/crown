import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const EXPENSE_CATEGORIES = [
  { id: 'gaji',        label: 'Gaji & Honor',     icon: '👤', color: 'text-blue-400',   bg: 'bg-blue-400/10'   },
  { id: 'supplies',    label: 'Produk & Supplies', icon: '📦', color: 'text-amber-400',  bg: 'bg-amber-400/10'  },
  { id: 'utilitas',    label: 'Listrik & Air',     icon: '⚡', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  { id: 'sewa',        label: 'Sewa Tempat',       icon: '🏢', color: 'text-purple-400', bg: 'bg-purple-400/10' },
  { id: 'operasional', label: 'Operasional',       icon: '🔧', color: 'text-cyan-400',   bg: 'bg-cyan-400/10'   },
  { id: 'lainnya',     label: 'Lainnya',           icon: '📋', color: 'text-muted',      bg: 'bg-dark-card'     },
]

const d = (n) => {
  const dt = new Date()
  dt.setDate(dt.getDate() - n)
  return dt.toISOString().split('T')[0]
}

const SEED = [
  { id: 'exp-1', tenantId: 'barber-king', branchId: null,       category: 'sewa',        description: 'Sewa ruko bulan April',      amount: 2000000, date: d(22) },
  { id: 'exp-2', tenantId: 'barber-king', branchId: 'bk-main',  category: 'gaji',        description: 'Gaji barber bulan April',    amount: 3500000, date: d(15) },
  { id: 'exp-3', tenantId: 'barber-king', branchId: 'bk-main',  category: 'supplies',    description: 'Pomade, clipper oil, wax',   amount: 450000,  date: d(10) },
  { id: 'exp-4', tenantId: 'barber-king', branchId: null,       category: 'utilitas',    description: 'Tagihan listrik April',      amount: 280000,  date: d(8)  },
  { id: 'exp-5', tenantId: 'barber-king', branchId: 'bk-main',  category: 'operasional', description: 'Sabun, tisu, cairan steril', amount: 120000,  date: d(5)  },
  { id: 'exp-6', tenantId: 'barber-king', branchId: null,       category: 'lainnya',     description: 'Print spanduk promo',        amount: 200000,  date: d(3)  },
  { id: 'exp-7', tenantId: 'barber-king', branchId: 'bk-south', category: 'gaji',        description: 'Gaji barber cabang selatan', amount: 2800000, date: d(14) },
  { id: 'exp-8', tenantId: 'barber-king', branchId: 'bk-south', category: 'supplies',    description: 'Restock produk cabang',      amount: 300000,  date: d(9)  },
]

export const useExpenseStore = create(persist(
  (set, get) => ({
    expenses: SEED,

    getByTenant: (tenantId) =>
      get().expenses.filter(e => e.tenantId === tenantId),

    getByPeriod: (tenantId, startDate, endDate) =>
      get().expenses.filter(e =>
        e.tenantId === tenantId &&
        e.date >= startDate &&
        e.date <= endDate
      ).sort((a, b) => b.date.localeCompare(a.date)),

    addExpense: (expense) => {
      const entry = { ...expense, id: `exp-${Date.now()}`, createdAt: new Date().toISOString() }
      set(state => ({ expenses: [entry, ...state.expenses] }))
      return entry
    },

    updateExpense: (id, updates) =>
      set(state => ({ expenses: state.expenses.map(e => e.id === id ? { ...e, ...updates } : e) })),

    deleteExpense: (id) =>
      set(state => ({ expenses: state.expenses.filter(e => e.id !== id) })),

    getTotalByPeriod: (tenantId, startDate, endDate) =>
      get().getByPeriod(tenantId, startDate, endDate).reduce((s, e) => s + e.amount, 0),

    getCategoryTotals: (tenantId, startDate, endDate) => {
      const totals = {}
      get().getByPeriod(tenantId, startDate, endDate).forEach(e => {
        totals[e.category] = (totals[e.category] || 0) + e.amount
      })
      return totals
    },
  }),
  { name: 'barberos-expenses' }
))
