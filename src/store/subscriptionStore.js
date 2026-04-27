import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { addDays, subDays, format } from 'date-fns'

const today = new Date()

// ── Default package definitions ───────────────────────────────────────────────
// branchAddonPrice: biaya per penambahan cabang di luar kuota paket
// branchAddonType: 'monthly' (per bulan) | 'onetime' (satu kali bayar)
// Fallback defaults when API/DB is unavailable (e.g. offline cache).
// Semua paket maxBranches=1 — cabang tambahan dikenakan branchAddonPrice.
const INITIAL_PACKAGES = {
  Basic: {
    price: 299000,
    maxBranches: 1,
    maxStaff: 5,
    branchAddonPrice: 99000,
    branchAddonType: 'monthly',
    description: 'Cocok untuk barbershop single-outlet',
    features: ['pos', 'queue', 'basic_reports'],
  },
  Pro: {
    price: 599000,
    maxBranches: 1,
    maxStaff: 20,
    branchAddonPrice: 79000,
    branchAddonType: 'monthly',
    description: 'Untuk barbershop yang ingin scaling',
    features: ['pos', 'queue', 'booking', 'reports', 'loyalty', 'voucher'],
  },
  Enterprise: {
    price: 1299000,
    maxBranches: 1,
    maxStaff: 99,
    branchAddonPrice: 49000,
    branchAddonType: 'monthly',
    description: 'Skala besar, unlimited fitur & prioritas support',
    features: ['pos', 'queue', 'booking', 'reports', 'loyalty', 'voucher', 'api', 'white_label'],
  },
}

const INITIAL_SUBSCRIPTIONS = [
  {
    id: 'sub-1', tenantId: 'barber-king', package: 'Pro',
    status: 'active',
    startDate: format(subDays(today, 45), 'yyyy-MM-dd'),
    endDate: format(addDays(today, 15), 'yyyy-MM-dd'),
    price: 599000,
    extraBranches: 0,   // jumlah cabang tambahan berbayar
    invoices: [
      { id: 'inv-1', amount: 599000, status: 'paid',    date: format(subDays(today, 45), 'yyyy-MM-dd'), period: 'Mar 2026', type: 'subscription' },
      { id: 'inv-2', amount: 599000, status: 'paid',    date: format(subDays(today, 14), 'yyyy-MM-dd'), period: 'Apr 2026', type: 'subscription' },
      { id: 'inv-3', amount: 599000, status: 'pending', date: format(addDays(today, 15), 'yyyy-MM-dd'),  period: 'Mei 2026', type: 'subscription' },
    ],
    autoRenew: true,
    trialUsed: false,
  },
  {
    id: 'sub-2', tenantId: 'oldboy-cuts', package: 'Basic',
    status: 'overdue',
    startDate: format(subDays(today, 60), 'yyyy-MM-dd'),
    endDate: format(subDays(today, 2), 'yyyy-MM-dd'),
    price: 299000,
    extraBranches: 0,
    invoices: [
      { id: 'inv-4', amount: 299000, status: 'paid',    date: format(subDays(today, 60), 'yyyy-MM-dd'), period: 'Feb 2026', type: 'subscription' },
      { id: 'inv-5', amount: 299000, status: 'paid',    date: format(subDays(today, 30), 'yyyy-MM-dd'), period: 'Mar 2026', type: 'subscription' },
      { id: 'inv-6', amount: 299000, status: 'overdue', date: format(subDays(today, 2), 'yyyy-MM-dd'),  period: 'Apr 2026', type: 'subscription' },
    ],
    autoRenew: false,
    trialUsed: true,
  },
]

// Static export for backward compat (initial defaults)
export const PACKAGES_CONFIG = INITIAL_PACKAGES

export const useSubscriptionStore = create(persist(
  (set, get) => ({
    subscriptions: INITIAL_SUBSCRIPTIONS,
    packages: INITIAL_PACKAGES,   // ← mutable, editable by SA

    // ── Getters ──────────────────────────────────────────────────────────────
    getByTenant: (tenantId) =>
      get().subscriptions.find(s => s.tenantId === tenantId),

    getPackages: () => get().packages,

    getPackage: (name) => get().packages[name] || INITIAL_PACKAGES[name],

    getMRR: () =>
      get().subscriptions
        .filter(s => s.status === 'active' || s.status === 'overdue')
        .reduce((sum, s) => {
          const sub = s
          const pkg = get().packages[sub.package] || {}
          const branchExtra = (sub.extraBranches || 0) * (pkg.branchAddonPrice || 0)
          return sum + sub.price + (pkg.branchAddonType === 'monthly' ? branchExtra : 0)
        }, 0),

    getARR: () => get().getMRR() * 12,

    // ── Package management (SA) ───────────────────────────────────────────────
    updatePackage: (name, data) => {
      set(state => ({
        packages: {
          ...state.packages,
          [name]: { ...state.packages[name], ...data },
        },
      }))
    },

    // ── Subscription actions ──────────────────────────────────────────────────
    upgradePackage: (tenantId, newPackage) => {
      const pkg = get().packages[newPackage] || INITIAL_PACKAGES[newPackage]
      set(state => ({
        subscriptions: state.subscriptions.map(s =>
          s.tenantId === tenantId
            ? {
                ...s,
                package: newPackage,
                price: pkg.price,
                status: 'active',
                extraBranches: 0,
                endDate: format(addDays(today, 30), 'yyyy-MM-dd'),
              }
            : s
        ),
      }))
    },

    renewSubscription: (tenantId) => {
      set(state => ({
        subscriptions: state.subscriptions.map(s =>
          s.tenantId === tenantId
            ? {
                ...s,
                status: 'active',
                endDate: format(addDays(today, 30), 'yyyy-MM-dd'),
                invoices: [
                  ...s.invoices,
                  {
                    id: `inv-${Date.now()}`,
                    amount: s.price,
                    status: 'paid',
                    date: format(today, 'yyyy-MM-dd'),
                    period: format(today, 'MMM yyyy'),
                    type: 'subscription',
                  },
                ],
              }
            : s
        ),
      }))
    },

    addSubscription: (sub) => {
      set(state => ({
        subscriptions: [
          ...state.subscriptions,
          { ...sub, id: `sub-${Date.now()}`, extraBranches: 0 },
        ],
      }))
    },

    toggleAutoRenew: (tenantId) => {
      set(state => ({
        subscriptions: state.subscriptions.map(s =>
          s.tenantId === tenantId ? { ...s, autoRenew: !s.autoRenew } : s
        ),
      }))
    },

    // ── Branch addon billing ──────────────────────────────────────────────────
    // Dipanggil saat tenant menambah cabang di luar kuota paket
    recordBranchFee: (tenantId, branchName) => {
      const sub = get().subscriptions.find(s => s.tenantId === tenantId)
      const pkg = get().packages[sub?.package]
      if (!sub || !pkg || !pkg.branchAddonPrice) return

      set(state => ({
        subscriptions: state.subscriptions.map(s =>
          s.tenantId === tenantId
            ? {
                ...s,
                extraBranches: (s.extraBranches || 0) + 1,
                invoices: [
                  ...s.invoices,
                  {
                    id: `inv-${Date.now()}`,
                    amount: pkg.branchAddonPrice,
                    status: 'paid',
                    date: format(new Date(), 'yyyy-MM-dd'),
                    period: `Cabang: ${branchName}`,
                    type: 'branch_addon',
                  },
                ],
              }
            : s
        ),
      }))
    },

    getBranchAddonPrice: (tenantId) => {
      const sub  = get().subscriptions.find(s => s.tenantId === tenantId)
      const pkg  = get().packages[sub?.package]
      return pkg?.branchAddonPrice || 0
    },

    // Returns how many more branches tenant can add for free
    getRemainingFreeBranches: (tenantId, currentBranchCount) => {
      const sub = get().subscriptions.find(s => s.tenantId === tenantId)
      const pkg = get().packages[sub?.package]
      if (!pkg) return 0
      return Math.max(0, pkg.maxBranches - currentBranchCount)
    },
  }),
  { name: 'barberos-subscriptions' }
))
