// Kategori pengeluaran — sumber tunggal dipakai halaman /admin/expenses.
// `id` HARUS sama dengan VALID_CATEGORIES di backend/src/routes/expenses.js.
// `color`/`bg` memakai utility yang aman untuk dark & light mode.

export const EXPENSE_CATEGORIES = [
  { id: 'gaji',        label: 'Gaji & Honor',      icon: '👤', color: 'text-blue-400',   bg: 'bg-blue-400/10'   },
  { id: 'supplies',    label: 'Produk & Supplies', icon: '📦', color: 'text-amber-400',  bg: 'bg-amber-400/10'  },
  { id: 'utilitas',    label: 'Listrik & Air',     icon: '⚡', color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  { id: 'sewa',        label: 'Sewa Tempat',       icon: '🏢', color: 'text-purple-400', bg: 'bg-purple-400/10' },
  { id: 'operasional', label: 'Operasional',       icon: '🔧', color: 'text-cyan-400',   bg: 'bg-cyan-400/10'   },
  { id: 'lainnya',     label: 'Lainnya',           icon: '📋', color: 'text-muted',      bg: 'bg-dark-surface'  },
]

const CATEGORY_MAP = Object.fromEntries(EXPENSE_CATEGORIES.map(c => [c.id, c]))

// Selalu balikan objek kategori valid — fallback ke 'lainnya' bila id tak dikenal.
export const catById = (id) => CATEGORY_MAP[id] || CATEGORY_MAP.lainnya

export const CATEGORY_IDS = EXPENSE_CATEGORIES.map(c => c.id)
