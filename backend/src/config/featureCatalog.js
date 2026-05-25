// SUMBER TUNGGAL katalog feature-flag (single source of truth).
//
// Mau menambah fitur baru ber-flag? Cukup tambahkan SATU entri di array ini.
// Otomatis ikut ke seluruh sistem:
//   - AVAILABLE_FLAGS (routes/featureFlags.js) → dikembalikan GET /api/feature-flags
//   - KNOWN_FLAG_IDS (services/featureFlagSync.js) → seed flag tenant & propagasi
//   - Halaman /super-admin/packages + UI flag lain (frontend fetch GET
//     /api/feature-flags lewat useFeatureCatalog; src/store/featureFlagStore.js
//     ALL_FEATURE_FLAGS kini HANYA fallback awal, bukan sumber kebenaran).
//
// Catatan: kalau fitur baru perlu AKTIF DEFAULT di paket Basic/Pro, tambahkan
// id-nya ke PACKAGE_FLAG_DEFAULTS di services/featureFlagSync.js. Enterprise
// otomatis mendapat semua flag.
const FEATURE_CATALOG = [
  { id: 'pos',              label: 'POS Kasir',             description: 'Sistem kasir point-of-sale untuk transaksi',          category: 'Core' },
  { id: 'booking',          label: 'Booking Online',        description: 'Pelanggan bisa booking jadwal secara online',         category: 'Core' },
  { id: 'loyalty',          label: 'Loyalty Program',       description: 'Sistem poin dan reward untuk pelanggan',              category: 'Core' },
  { id: 'voucher',          label: 'Voucher & Promo',       description: 'Buat dan kelola kode diskon',                         category: 'Core' },
  { id: 'queue',            label: 'Manajemen Antrian',     description: 'Papan antrian realtime kasir & barber',               category: 'Core' },
  { id: 'reports',          label: 'Laporan Lanjutan',      description: 'Grafik analitik, export PDF/CSV, forecasting',        category: 'Analytics' },
  { id: 'heatmap',          label: 'Heatmap Jam Sibuk',     description: 'Visualisasi jam tersibuk per hari',                   category: 'Analytics' },
  { id: 'clv',              label: 'Customer CLV',          description: 'Hitung customer lifetime value otomatis',             category: 'Analytics' },
  { id: 'wilayah_report',   label: 'Laporan Wilayah',       description: 'Analisis kunjungan per kecamatan dan desa/kelurahan', category: 'Analytics' },
  { id: 'schedule',         label: 'Jadwal Shift',          description: 'Kalender jadwal kerja barber mingguan',               category: 'Operations' },
  { id: 'multi_branch',     label: 'Multi-Cabang',          description: 'Kelola lebih dari satu cabang',                       category: 'Operations' },
  { id: 'expense_tracking', label: 'Manajemen Pengeluaran', description: 'Catat biaya operasional & hitung laba bersih',       category: 'Operations' },
  { id: 'attendance',       label: 'Absensi Digital',       description: 'Absen GPS staf kasir & barber + laporan kehadiran',   category: 'Operations' },
  { id: 'pwa',              label: 'Install Aplikasi',      description: 'Banner pasang sebagai PWA di HP',                     category: 'UX' },
  { id: 'whatsapp',         label: 'Struk WhatsApp',        description: 'Kirim struk via WhatsApp langsung dari POS',          category: 'UX' },
  { id: 'whatsapp_logs',    label: 'Laporan Pesan WhatsApp', description: 'Pantau status terkirim/sampai/gagal pesan WhatsApp ke pelanggan', category: 'UX' },
  { id: 'barber_rating',    label: 'Rating Barber',         description: 'Pelanggan beri bintang setelah transaksi',            category: 'UX' },
  { id: 'api_access',       label: 'API Access',            description: 'Akses API untuk integrasi pihak ketiga',              category: 'Enterprise' },
  { id: 'white_label',      label: 'White Label',           description: 'Custom domain & branding tanpa logo SembaPOS',        category: 'Enterprise' },
  { id: 'backup',           label: 'Backup & Restore',      description: 'Export dan import data tenant',                       category: 'Enterprise' },
];

const FEATURE_FLAG_IDS = FEATURE_CATALOG.map((f) => f.id);

module.exports = { FEATURE_CATALOG, FEATURE_FLAG_IDS };
