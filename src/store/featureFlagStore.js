// Katalog feature-flag — KONSTANTA SAJA.
//
// Dulu file ini juga mengekspor `useFeatureFlagStore` (zustand + localStorage)
// yang dipakai untuk feature-gating. Itu sumber bug: seed-nya hanya kenal slug
// dummy `barber-king`/`oldboy-cuts`, jadi tenant nyata selalu jatuh ke `[]` →
// fitur dianggap mati walau super-admin menyalakannya.
//
// Gating fitur SEKARANG WAJIB lewat `useFeatureFlags(tenantId)` /
// `useIsFeatureEnabled(tenantId, flagId)` di `src/hooks/useFeatureFlags.js`
// yang membaca `TenantFeatureFlag` dari backend. Jangan buat store seed lagi.

// ⚠️ SUMBER KEBENARAN katalog kini di BACKEND: backend/src/config/featureCatalog.js
// (disajikan GET /api/feature-flags, dibaca via hooks/useFeatureCatalog.js).
// List di bawah HANYA fallback awal (initialData saat fetch & bila API gagal)
// dan dipakai useFeatureFlags. Menambah fitur baru: cukup di featureCatalog.js
// backend → otomatis muncul di /super-admin/packages dll. Menyamakan list ini
// opsional (biar fallback rapi), tapi tidak lagi wajib/menahan beban.
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
  { id: 'attendance',       label: 'Absensi Digital',     description: 'Absen GPS staf kasir & barber + laporan kehadiran', category: 'Operations' },
  { id: 'pwa',           label: 'Install Aplikasi',    description: 'Banner pasang sebagai PWA di HP',                  category: 'UX' },
  { id: 'whatsapp',      label: 'Struk WhatsApp',      description: 'Kirim struk via WhatsApp langsung dari POS',        category: 'UX' },
  { id: 'whatsapp_logs', label: 'Laporan Pesan WhatsApp', description: 'Pantau status terkirim/sampai/gagal pesan WhatsApp ke pelanggan', category: 'UX' },
  { id: 'barber_rating', label: 'Rating Barber',       description: 'Pelanggan beri bintang setelah transaksi',          category: 'UX' },
  { id: 'api_access',    label: 'API Access',          description: 'Akses API untuk integrasi pihak ketiga',            category: 'Enterprise' },
  { id: 'backup',        label: 'Backup & Restore',    description: 'Export dan import data tenant',                     category: 'Enterprise' },
]

// Default fitur per paket — fallback tampilan saja (mis. /super-admin/feature-flags).
// Kebenaran per-tenant tetap di TenantFeatureFlag (backend).
const PACKAGE_DEFAULTS = {
  Basic:      ['pos', 'queue', 'booking', 'loyalty', 'voucher', 'barber_rating', 'schedule', 'attendance', 'expense_tracking', 'pwa'],
  Pro:        ['pos', 'queue', 'booking', 'loyalty', 'voucher', 'reports', 'schedule', 'expense_tracking', 'attendance', 'whatsapp', 'whatsapp_logs', 'barber_rating', 'heatmap', 'clv', 'wilayah_report', 'pwa'],
  Enterprise: ALL_FLAGS.map(f => f.id),
}

export const ALL_FEATURE_FLAGS = ALL_FLAGS
export const PACKAGE_FLAG_DEFAULTS = PACKAGE_DEFAULTS
