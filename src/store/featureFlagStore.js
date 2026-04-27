import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const ALL_FLAGS = [
  { id: 'pos',           label: 'POS Kasir',           description: 'Sistem kasir point-of-sale untuk transaksi',        category: 'Core' },
  { id: 'booking',       label: 'Booking Online',      description: 'Pelanggan bisa booking jadwal secara online',      category: 'Core' },
  { id: 'loyalty',       label: 'Loyalty Program',     description: 'Sistem poin dan reward untuk pelanggan',            category: 'Core' },
  { id: 'voucher',       label: 'Voucher & Promo',      description: 'Buat dan kelola kode diskon',                       category: 'Core' },
  { id: 'queue',         label: 'Manajemen Antrian',   description: 'Papan antrian realtime kasir & barber',             category: 'Core' },
  { id: 'reports',         label: 'Laporan Lanjutan',      description: 'Grafik analitik, export PDF/CSV, forecasting',             category: 'Analytics' },
  { id: 'heatmap',         label: 'Heatmap Jam Sibuk',   description: 'Visualisasi jam tersibuk per hari',                        category: 'Analytics' },
  { id: 'clv',             label: 'Customer CLV',        description: 'Hitung customer lifetime value otomatis',                  category: 'Analytics' },
  { id: 'wilayah_report',  label: 'Laporan Wilayah',     description: 'Analisis kunjungan per kecamatan dan desa/kelurahan',      category: 'Analytics' },
  { id: 'schedule',         label: 'Jadwal Shift',        description: 'Kalender jadwal kerja barber mingguan',             category: 'Operations' },
  { id: 'multi_branch',    label: 'Multi-Cabang',        description: 'Kelola lebih dari satu cabang',                     category: 'Operations' },
  { id: 'expense_tracking', label: 'Manajemen Pengeluaran', description: 'Catat biaya operasional & hitung laba bersih',   category: 'Operations' },
  { id: 'pwa',           label: 'Install Aplikasi',    description: 'Banner pasang sebagai PWA di HP',                  category: 'UX' },
  { id: 'whatsapp',      label: 'Struk WhatsApp',      description: 'Kirim struk via WhatsApp langsung dari POS',        category: 'UX' },
  { id: 'barber_rating', label: 'Rating Barber',       description: 'Pelanggan beri bintang setelah transaksi',          category: 'UX' },
  { id: 'api_access',    label: 'API Access',          description: 'Akses API untuk integrasi pihak ketiga',            category: 'Enterprise' },
  { id: 'white_label',   label: 'White Label',         description: 'Custom domain & branding tanpa logo BarberOS',      category: 'Enterprise' },
  { id: 'backup',        label: 'Backup & Restore',    description: 'Export dan import data tenant',                     category: 'Enterprise' },
]

// Default flags per package
const PACKAGE_DEFAULTS = {
  Basic:      ['pos', 'queue', 'booking', 'loyalty', 'pwa'],
  Pro:        ['pos', 'queue', 'booking', 'loyalty', 'voucher', 'reports', 'schedule', 'multi_branch', 'expense_tracking', 'whatsapp', 'barber_rating', 'heatmap', 'clv', 'wilayah_report', 'pwa', 'backup'],
  Enterprise: ALL_FLAGS.map(f => f.id),
}

const INITIAL_TENANT_FLAGS = {
  'barber-king': [...PACKAGE_DEFAULTS.Pro],
  'oldboy-cuts': [...PACKAGE_DEFAULTS.Basic],
}

export const ALL_FEATURE_FLAGS = ALL_FLAGS
export const PACKAGE_FLAG_DEFAULTS = PACKAGE_DEFAULTS

export const useFeatureFlagStore = create(persist(
  (set, get) => ({
    tenantFlags: INITIAL_TENANT_FLAGS,

    isEnabled: (tenantId, flagId) => {
      const flags = get().tenantFlags[tenantId] || []
      return flags.includes(flagId)
    },

    toggle: (tenantId, flagId) => {
      set(state => {
        const current = state.tenantFlags[tenantId] || []
        const updated = current.includes(flagId)
          ? current.filter(f => f !== flagId)
          : [...current, flagId]
        return { tenantFlags: { ...state.tenantFlags, [tenantId]: updated } }
      })
    },

    setFromPackage: (tenantId, packageName) => {
      const defaults = PACKAGE_DEFAULTS[packageName] || []
      set(state => ({ tenantFlags: { ...state.tenantFlags, [tenantId]: [...defaults] } }))
    },

    // Returns stored flags for tenant. If no explicit entry yet and a
    // fallbackPackage is provided, returns the package defaults so new
    // tenants (from API) show their expected feature set.
    getTenantFlags: (tenantId, fallbackPackage) => {
      const explicit = get().tenantFlags[tenantId]
      if (explicit) return explicit
      if (fallbackPackage && PACKAGE_DEFAULTS[fallbackPackage]) {
        return [...PACKAGE_DEFAULTS[fallbackPackage]]
      }
      return []
    },

    initTenant: (tenantId, packageName) => {
      set(state => ({
        tenantFlags: {
          ...state.tenantFlags,
          [tenantId]: [...(PACKAGE_DEFAULTS[packageName] || PACKAGE_DEFAULTS.Basic)]
        }
      }))
    },
  }),
  { name: 'barberos-feature-flags' }
))
