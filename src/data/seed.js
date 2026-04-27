import { subDays, addDays, format, setHours, setMinutes } from 'date-fns'

// ─── TENANTS ────────────────────────────────────────────────────────────────
export const tenants = [
  {
    id: 'barber-king',
    name: 'Barber King',
    slug: 'barber-king',
    package: 'Pro',
    status: 'active',
    ownerEmail: 'owner@barberking.id',
    logo: null,
    primaryColor: '#C9A84C',
    createdAt: '2023-01-15',
    monthlyRevenue: 48500000,
    totalStaff: 21,
    totalBranches: 3,
  },
  {
    id: 'oldboy-cuts',
    name: 'OldBoy Cuts',
    slug: 'oldboy-cuts',
    package: 'Basic',
    status: 'active',
    ownerEmail: 'owner@oldboy.id',
    logo: null,
    primaryColor: '#7C3AED',
    createdAt: '2023-06-20',
    monthlyRevenue: 28200000,
    totalStaff: 21,
    totalBranches: 3,
  },
]

// ─── BRANCHES ───────────────────────────────────────────────────────────────
export const branches = [
  // Barber King
  { id: 'bk-jakarta', tenantId: 'barber-king', name: 'Jakarta Pusat', address: 'Jl. Thamrin No. 12, Jakarta Pusat', phone: '021-5551234', status: 'active', openTime: '09:00', closeTime: '21:00', monthlyRevenue: 18500000 },
  { id: 'bk-sudirman', tenantId: 'barber-king', name: 'Sudirman', address: 'Jl. Sudirman Kav. 52, Jakarta Selatan', phone: '021-5555678', status: 'active', openTime: '09:00', closeTime: '21:00', monthlyRevenue: 16200000 },
  { id: 'bk-kemang', tenantId: 'barber-king', name: 'Kemang', address: 'Jl. Kemang Raya No. 45, Jakarta Selatan', phone: '021-5559012', status: 'active', openTime: '10:00', closeTime: '22:00', monthlyRevenue: 13800000 },
  // OldBoy Cuts
  { id: 'ob-bandung', tenantId: 'oldboy-cuts', name: 'Bandung Kota', address: 'Jl. Asia Afrika No. 8, Bandung', phone: '022-4201234', status: 'active', openTime: '09:00', closeTime: '20:00', monthlyRevenue: 11200000 },
  { id: 'ob-dago', tenantId: 'oldboy-cuts', name: 'Dago', address: 'Jl. Dago No. 56, Bandung', phone: '022-4205678', status: 'active', openTime: '09:00', closeTime: '21:00', monthlyRevenue: 9800000 },
  { id: 'ob-buahbatu', tenantId: 'oldboy-cuts', name: 'Buah Batu', address: 'Jl. Buah Batu No. 123, Bandung', phone: '022-4209012', status: 'active', openTime: '10:00', closeTime: '20:00', monthlyRevenue: 7200000 },
]

// ─── STAFF ──────────────────────────────────────────────────────────────────
export const staff = [
  // Barber King - Jakarta Pusat
  { id: 'staff-001', tenantId: 'barber-king', branchId: 'bk-jakarta', name: 'Rizky Pratama', role: 'barber', photo: 'https://i.pravatar.cc/150?img=1', specializations: ['Fade', 'Pompadour'], rating: 4.9, totalClients: 312, commissionRate: 0.4, status: 'active' },
  { id: 'staff-002', tenantId: 'barber-king', branchId: 'bk-jakarta', name: 'Dani Saputra', role: 'barber', photo: 'https://i.pravatar.cc/150?img=2', specializations: ['Undercut', 'Textured Crop'], rating: 4.7, totalClients: 245, commissionRate: 0.35, status: 'active' },
  { id: 'staff-003', tenantId: 'barber-king', branchId: 'bk-jakarta', name: 'Eko Budi', role: 'barber', photo: 'https://i.pravatar.cc/150?img=3', specializations: ['Classic Cut', 'Beard Trim'], rating: 4.5, totalClients: 189, commissionRate: 0.35, status: 'active' },
  { id: 'staff-004', tenantId: 'barber-king', branchId: 'bk-jakarta', name: 'Fahri Hidayat', role: 'barber', photo: 'https://i.pravatar.cc/150?img=4', specializations: ['Coloring', 'Hair Mask'], rating: 4.8, totalClients: 278, commissionRate: 0.38, status: 'active' },
  { id: 'staff-005', tenantId: 'barber-king', branchId: 'bk-jakarta', name: 'Gilang Nugraha', role: 'barber', photo: 'https://i.pravatar.cc/150?img=5', specializations: ['Skin Fade', 'Design'], rating: 4.6, totalClients: 201, commissionRate: 0.35, status: 'active' },
  { id: 'staff-006', tenantId: 'barber-king', branchId: 'bk-jakarta', name: 'Siti Rahayu', role: 'kasir', photo: 'https://i.pravatar.cc/150?img=48', specializations: [], rating: null, totalClients: null, commissionRate: 0, status: 'active' },
  { id: 'staff-007', tenantId: 'barber-king', branchId: 'bk-jakarta', name: 'Hendra Wijaya', role: 'manager', photo: 'https://i.pravatar.cc/150?img=7', specializations: [], rating: null, totalClients: null, commissionRate: 0, status: 'active' },

  // Barber King - Sudirman
  { id: 'staff-011', tenantId: 'barber-king', branchId: 'bk-sudirman', name: 'Irfan Maulana', role: 'barber', photo: 'https://i.pravatar.cc/150?img=8', specializations: ['Fade', 'Mohawk'], rating: 4.8, totalClients: 289, commissionRate: 0.4, status: 'active' },
  { id: 'staff-012', tenantId: 'barber-king', branchId: 'bk-sudirman', name: 'Joko Susilo', role: 'barber', photo: 'https://i.pravatar.cc/150?img=9', specializations: ['Classic Cut'], rating: 4.4, totalClients: 167, commissionRate: 0.33, status: 'active' },
  { id: 'staff-013', tenantId: 'barber-king', branchId: 'bk-sudirman', name: 'Kurnia Adi', role: 'barber', photo: 'https://i.pravatar.cc/150?img=10', specializations: ['Undercut', 'Pompadour'], rating: 4.7, totalClients: 234, commissionRate: 0.37, status: 'active' },
  { id: 'staff-014', tenantId: 'barber-king', branchId: 'bk-sudirman', name: 'Lutfi Rahman', role: 'barber', photo: 'https://i.pravatar.cc/150?img=11', specializations: ['Beard Design'], rating: 4.5, totalClients: 198, commissionRate: 0.35, status: 'active' },
  { id: 'staff-015', tenantId: 'barber-king', branchId: 'bk-sudirman', name: 'Mustafa Karim', role: 'barber', photo: 'https://i.pravatar.cc/150?img=12', specializations: ['Coloring', 'Keratin'], rating: 4.6, totalClients: 215, commissionRate: 0.36, status: 'active' },
  { id: 'staff-016', tenantId: 'barber-king', branchId: 'bk-sudirman', name: 'Nita Permata', role: 'kasir', photo: 'https://i.pravatar.cc/150?img=49', specializations: [], rating: null, totalClients: null, commissionRate: 0, status: 'active' },
  { id: 'staff-017', tenantId: 'barber-king', branchId: 'bk-sudirman', name: 'Oscar Firmansyah', role: 'manager', photo: 'https://i.pravatar.cc/150?img=14', specializations: [], rating: null, totalClients: null, commissionRate: 0, status: 'active' },

  // Barber King - Kemang
  { id: 'staff-021', tenantId: 'barber-king', branchId: 'bk-kemang', name: 'Pandu Setiawan', role: 'barber', photo: 'https://i.pravatar.cc/150?img=15', specializations: ['Fade', 'Textured'], rating: 4.9, totalClients: 301, commissionRate: 0.4, status: 'active' },
  { id: 'staff-022', tenantId: 'barber-king', branchId: 'bk-kemang', name: 'Qodir Halim', role: 'barber', photo: 'https://i.pravatar.cc/150?img=16', specializations: ['Classic', 'Slickback'], rating: 4.6, totalClients: 223, commissionRate: 0.35, status: 'active' },
  { id: 'staff-023', tenantId: 'barber-king', branchId: 'bk-kemang', name: 'Rama Putra', role: 'barber', photo: 'https://i.pravatar.cc/150?img=17', specializations: ['Design', 'Pattern'], rating: 4.7, totalClients: 256, commissionRate: 0.37, status: 'active' },
  { id: 'staff-024', tenantId: 'barber-king', branchId: 'bk-kemang', name: 'Sandi Kurnia', role: 'barber', photo: 'https://i.pravatar.cc/150?img=18', specializations: ['Hair Mask', 'Spa'], rating: 4.5, totalClients: 178, commissionRate: 0.35, status: 'active' },
  { id: 'staff-025', tenantId: 'barber-king', branchId: 'bk-kemang', name: 'Taufik Ismail', role: 'barber', photo: 'https://i.pravatar.cc/150?img=19', specializations: ['Coloring', 'Highlight'], rating: 4.8, totalClients: 267, commissionRate: 0.38, status: 'active' },
  { id: 'staff-026', tenantId: 'barber-king', branchId: 'bk-kemang', name: 'Ucu Rahayu', role: 'kasir', photo: 'https://i.pravatar.cc/150?img=47', specializations: [], rating: null, totalClients: null, commissionRate: 0, status: 'active' },
  { id: 'staff-027', tenantId: 'barber-king', branchId: 'bk-kemang', name: 'Vino Bastian', role: 'manager', photo: 'https://i.pravatar.cc/150?img=21', specializations: [], rating: null, totalClients: null, commissionRate: 0, status: 'active' },

  // OldBoy Cuts - Bandung
  { id: 'staff-031', tenantId: 'oldboy-cuts', branchId: 'ob-bandung', name: 'Wahyu Santoso', role: 'barber', photo: 'https://i.pravatar.cc/150?img=22', specializations: ['Fade', 'Classic'], rating: 4.7, totalClients: 198, commissionRate: 0.35, status: 'active' },
  { id: 'staff-032', tenantId: 'oldboy-cuts', branchId: 'ob-bandung', name: 'Xandra Putra', role: 'barber', photo: 'https://i.pravatar.cc/150?img=23', specializations: ['Pompadour', 'Quiff'], rating: 4.5, totalClients: 156, commissionRate: 0.33, status: 'active' },
  { id: 'staff-033', tenantId: 'oldboy-cuts', branchId: 'ob-bandung', name: 'Yoga Pratama', role: 'barber', photo: 'https://i.pravatar.cc/150?img=24', specializations: ['Undercut'], rating: 4.6, totalClients: 178, commissionRate: 0.34, status: 'active' },
  { id: 'staff-034', tenantId: 'oldboy-cuts', branchId: 'ob-bandung', name: 'Zaki Ramadhan', role: 'barber', photo: 'https://i.pravatar.cc/150?img=25', specializations: ['Beard Trim', 'Shave'], rating: 4.4, totalClients: 134, commissionRate: 0.32, status: 'active' },
  { id: 'staff-035', tenantId: 'oldboy-cuts', branchId: 'ob-bandung', name: 'Agus Mardian', role: 'barber', photo: 'https://i.pravatar.cc/150?img=26', specializations: ['Coloring'], rating: 4.8, totalClients: 212, commissionRate: 0.38, status: 'active' },
  { id: 'staff-036', tenantId: 'oldboy-cuts', branchId: 'ob-bandung', name: 'Bayu Lestari', role: 'kasir', photo: 'https://i.pravatar.cc/150?img=50', specializations: [], rating: null, totalClients: null, commissionRate: 0, status: 'active' },
  { id: 'staff-037', tenantId: 'oldboy-cuts', branchId: 'ob-bandung', name: 'Candra Wijaya', role: 'manager', photo: 'https://i.pravatar.cc/150?img=28', specializations: [], rating: null, totalClients: null, commissionRate: 0, status: 'active' },

  // OldBoy Cuts - Dago
  { id: 'staff-041', tenantId: 'oldboy-cuts', branchId: 'ob-dago', name: 'Dimas Aditya', role: 'barber', photo: 'https://i.pravatar.cc/150?img=29', specializations: ['Fade', 'Taper'], rating: 4.7, totalClients: 187, commissionRate: 0.36, status: 'active' },
  { id: 'staff-042', tenantId: 'oldboy-cuts', branchId: 'ob-dago', name: 'Edi Prasetyo', role: 'barber', photo: 'https://i.pravatar.cc/150?img=30', specializations: ['Classic Cut'], rating: 4.3, totalClients: 123, commissionRate: 0.31, status: 'active' },
  { id: 'staff-043', tenantId: 'oldboy-cuts', branchId: 'ob-dago', name: 'Faisal Akbar', role: 'barber', photo: 'https://i.pravatar.cc/150?img=31', specializations: ['Textured', 'Messy'], rating: 4.6, totalClients: 165, commissionRate: 0.34, status: 'active' },
  { id: 'staff-044', tenantId: 'oldboy-cuts', branchId: 'ob-dago', name: 'Galih Permana', role: 'barber', photo: 'https://i.pravatar.cc/150?img=32', specializations: ['Design'], rating: 4.8, totalClients: 201, commissionRate: 0.38, status: 'active' },
  { id: 'staff-045', tenantId: 'oldboy-cuts', branchId: 'ob-dago', name: 'Hadi Suprapto', role: 'barber', photo: 'https://i.pravatar.cc/150?img=33', specializations: ['Hair Mask'], rating: 4.5, totalClients: 145, commissionRate: 0.33, status: 'active' },
  { id: 'staff-046', tenantId: 'oldboy-cuts', branchId: 'ob-dago', name: 'Indah Sari', role: 'kasir', photo: 'https://i.pravatar.cc/150?img=46', specializations: [], rating: null, totalClients: null, commissionRate: 0, status: 'active' },
  { id: 'staff-047', tenantId: 'oldboy-cuts', branchId: 'ob-dago', name: 'Jaya Kusuma', role: 'manager', photo: 'https://i.pravatar.cc/150?img=35', specializations: [], rating: null, totalClients: null, commissionRate: 0, status: 'active' },

  // OldBoy Cuts - Buah Batu
  { id: 'staff-051', tenantId: 'oldboy-cuts', branchId: 'ob-buahbatu', name: 'Krisna Bayu', role: 'barber', photo: 'https://i.pravatar.cc/150?img=36', specializations: ['Fade'], rating: 4.6, totalClients: 145, commissionRate: 0.34, status: 'active' },
  { id: 'staff-052', tenantId: 'oldboy-cuts', branchId: 'ob-buahbatu', name: 'Leo Santana', role: 'barber', photo: 'https://i.pravatar.cc/150?img=37', specializations: ['Classic', 'Undercut'], rating: 4.4, totalClients: 112, commissionRate: 0.32, status: 'active' },
  { id: 'staff-053', tenantId: 'oldboy-cuts', branchId: 'ob-buahbatu', name: 'Mario Baskara', role: 'barber', photo: 'https://i.pravatar.cc/150?img=38', specializations: ['Textured'], rating: 4.5, totalClients: 128, commissionRate: 0.33, status: 'active' },
  { id: 'staff-054', tenantId: 'oldboy-cuts', branchId: 'ob-buahbatu', name: 'Nanda Putra', role: 'barber', photo: 'https://i.pravatar.cc/150?img=39', specializations: ['Beard'], rating: 4.3, totalClients: 98, commissionRate: 0.31, status: 'active' },
  { id: 'staff-055', tenantId: 'oldboy-cuts', branchId: 'ob-buahbatu', name: 'Omar Faruk', role: 'barber', photo: 'https://i.pravatar.cc/150?img=40', specializations: ['Coloring'], rating: 4.7, totalClients: 167, commissionRate: 0.36, status: 'active' },
  { id: 'staff-056', tenantId: 'oldboy-cuts', branchId: 'ob-buahbatu', name: 'Putri Ayu', role: 'kasir', photo: 'https://i.pravatar.cc/150?img=45', specializations: [], rating: null, totalClients: null, commissionRate: 0, status: 'active' },
  { id: 'staff-057', tenantId: 'oldboy-cuts', branchId: 'ob-buahbatu', name: 'Reza Pahlevi', role: 'manager', photo: 'https://i.pravatar.cc/150?img=42', specializations: [], rating: null, totalClients: null, commissionRate: 0, status: 'active' },
]

// ─── SERVICES ───────────────────────────────────────────────────────────────
export const services = [
  // Barber King Services
  { id: 'bk-svc-1', tenantId: 'barber-king', category: 'Potong Rambut', name: 'Potong Reguler', price: 35000, duration: 30, description: 'Potong rambut standar sesuai permintaan', icon: '✂️', active: true },
  { id: 'bk-svc-2', tenantId: 'barber-king', category: 'Potong Rambut', name: 'Potong + Cuci', price: 55000, duration: 45, description: 'Potong rambut + cuci rambut dengan sampo premium', icon: '🚿', active: true },
  { id: 'bk-svc-3', tenantId: 'barber-king', category: 'Potong Rambut', name: 'Premium Cut', price: 85000, duration: 45, description: 'Potong presisi dengan konsultasi gaya rambut', icon: '👑', active: true },
  { id: 'bk-svc-4', tenantId: 'barber-king', category: 'Potong Rambut', name: 'Skin Fade', price: 65000, duration: 40, description: 'Fade presisi dari skin hingga atas', icon: '⚡', active: true },
  { id: 'bk-svc-5', tenantId: 'barber-king', category: 'Potong Rambut', name: 'Undercut Design', price: 75000, duration: 50, description: 'Undercut dengan desain custom di sisi', icon: '🎨', active: true },
  { id: 'bk-svc-6', tenantId: 'barber-king', category: 'Perawatan', name: 'Cukur Jenggot', price: 25000, duration: 20, description: 'Cukur dan rapikan jenggot', icon: '🪒', active: true },
  { id: 'bk-svc-7', tenantId: 'barber-king', category: 'Perawatan', name: 'Beard Styling', price: 45000, duration: 30, description: 'Styling jenggot dengan wax dan produk premium', icon: '💈', active: true },
  { id: 'bk-svc-8', tenantId: 'barber-king', category: 'Perawatan', name: 'Hair Mask', price: 75000, duration: 60, description: 'Perawatan rambut dengan masker protein', icon: '💊', active: true },
  { id: 'bk-svc-9', tenantId: 'barber-king', category: 'Perawatan', name: 'Scalp Treatment', price: 95000, duration: 60, description: 'Perawatan kulit kepala intensif', icon: '🌿', active: true },
  { id: 'bk-svc-10', tenantId: 'barber-king', category: 'Perawatan', name: 'Hot Towel Shave', price: 55000, duration: 40, description: 'Cukur tradisional dengan handuk panas', icon: '🔥', active: true },
  { id: 'bk-svc-11', tenantId: 'barber-king', category: 'Warna', name: 'Coloring Full', price: 150000, duration: 120, description: 'Warna rambut full dengan cat premium', icon: '🎨', active: true },
  { id: 'bk-svc-12', tenantId: 'barber-king', category: 'Warna', name: 'Highlight', price: 120000, duration: 90, description: 'Highlight 5-10 lembar rambut pilihan', icon: '✨', active: true },
  { id: 'bk-svc-13', tenantId: 'barber-king', category: 'Warna', name: 'Bleaching', price: 200000, duration: 150, description: 'Bleaching rambut untuk hasil warna cerah', icon: '💫', active: true },
  { id: 'bk-svc-14', tenantId: 'barber-king', category: 'Combo', name: 'Potong + Jenggot', price: 55000, duration: 50, description: 'Paket hemat potong rambut dan jenggot', icon: '✂️', active: true },
  { id: 'bk-svc-15', tenantId: 'barber-king', category: 'Combo', name: 'Premium Package', price: 185000, duration: 120, description: 'Potong + Cuci + Hair Mask + Jenggot', icon: '⭐', active: true },
  { id: 'bk-svc-16', tenantId: 'barber-king', category: 'Combo', name: 'King Package', price: 350000, duration: 180, description: 'All-inclusive luxury barbering experience', icon: '👑', active: true },
  { id: 'bk-svc-17', tenantId: 'barber-king', category: 'Potong Rambut', name: 'Kids Cut', price: 30000, duration: 25, description: 'Potong rambut untuk anak-anak usia 2-12 tahun', icon: '👦', active: true },
  { id: 'bk-svc-18', tenantId: 'barber-king', category: 'Perawatan', name: 'Head Massage', price: 45000, duration: 30, description: 'Pijat kepala relaksasi 30 menit', icon: '😌', active: true },
  { id: 'bk-svc-19', tenantId: 'barber-king', category: 'Warna', name: 'Color Correction', price: 250000, duration: 180, description: 'Koreksi warna rambut', icon: '🔧', active: true },
  { id: 'bk-svc-20', tenantId: 'barber-king', category: 'Perawatan', name: 'Keratin Treatment', price: 180000, duration: 120, description: 'Smoothing keratin untuk rambut lurus berkilau', icon: '💎', active: true },

  // OldBoy Cuts Services (similar structure)
  { id: 'ob-svc-1', tenantId: 'oldboy-cuts', category: 'Potong Rambut', name: 'Potong Reguler', price: 30000, duration: 30, description: 'Potong rambut standar', icon: '✂️', active: true },
  { id: 'ob-svc-2', tenantId: 'oldboy-cuts', category: 'Potong Rambut', name: 'Potong + Cuci', price: 48000, duration: 45, description: 'Potong + cuci rambut', icon: '🚿', active: true },
  { id: 'ob-svc-3', tenantId: 'oldboy-cuts', category: 'Potong Rambut', name: 'Oldboy Signature Cut', price: 75000, duration: 45, description: 'Signature cut dengan teknik oldboy', icon: '✨', active: true },
  { id: 'ob-svc-4', tenantId: 'oldboy-cuts', category: 'Potong Rambut', name: 'Fade Cut', price: 55000, duration: 40, description: 'Fade presisi', icon: '⚡', active: true },
  { id: 'ob-svc-5', tenantId: 'oldboy-cuts', category: 'Potong Rambut', name: 'Textured Cut', price: 65000, duration: 40, description: 'Potongan bertekstur modern', icon: '🎯', active: true },
  { id: 'ob-svc-6', tenantId: 'oldboy-cuts', category: 'Perawatan', name: 'Cukur Jenggot', price: 22000, duration: 20, description: 'Cukur jenggot', icon: '🪒', active: true },
  { id: 'ob-svc-7', tenantId: 'oldboy-cuts', category: 'Perawatan', name: 'Hair Mask', price: 65000, duration: 60, description: 'Masker rambut', icon: '💊', active: true },
  { id: 'ob-svc-8', tenantId: 'oldboy-cuts', category: 'Perawatan', name: 'Scalp Treatment', price: 85000, duration: 60, description: 'Perawatan kulit kepala', icon: '🌿', active: true },
  { id: 'ob-svc-9', tenantId: 'oldboy-cuts', category: 'Perawatan', name: 'Hot Towel Shave', price: 50000, duration: 40, description: 'Shave tradisional', icon: '🔥', active: true },
  { id: 'ob-svc-10', tenantId: 'oldboy-cuts', category: 'Perawatan', name: 'Head Massage', price: 40000, duration: 30, description: 'Pijat kepala', icon: '😌', active: true },
  { id: 'ob-svc-11', tenantId: 'oldboy-cuts', category: 'Warna', name: 'Coloring Full', price: 130000, duration: 120, description: 'Cat rambut full', icon: '🎨', active: true },
  { id: 'ob-svc-12', tenantId: 'oldboy-cuts', category: 'Warna', name: 'Highlight', price: 100000, duration: 90, description: 'Highlight rambut', icon: '✨', active: true },
  { id: 'ob-svc-13', tenantId: 'oldboy-cuts', category: 'Warna', name: 'Bleaching', price: 175000, duration: 150, description: 'Bleaching rambut', icon: '💫', active: true },
  { id: 'ob-svc-14', tenantId: 'oldboy-cuts', category: 'Combo', name: 'Potong + Jenggot', price: 48000, duration: 45, description: 'Paket potong + jenggot', icon: '✂️', active: true },
  { id: 'ob-svc-15', tenantId: 'oldboy-cuts', category: 'Combo', name: 'Classic Package', price: 150000, duration: 100, description: 'Potong + Cuci + Hair Mask', icon: '⭐', active: true },
  { id: 'ob-svc-16', tenantId: 'oldboy-cuts', category: 'Combo', name: 'OldBoy Deluxe', price: 280000, duration: 150, description: 'Paket lengkap OldBoy', icon: '👑', active: true },
  { id: 'ob-svc-17', tenantId: 'oldboy-cuts', category: 'Potong Rambut', name: 'Kids Cut', price: 25000, duration: 25, description: 'Potong anak', icon: '👦', active: true },
  { id: 'ob-svc-18', tenantId: 'oldboy-cuts', category: 'Perawatan', name: 'Beard Styling', price: 38000, duration: 25, description: 'Styling jenggot', icon: '💈', active: true },
  { id: 'ob-svc-19', tenantId: 'oldboy-cuts', category: 'Warna', name: 'Color Correction', price: 220000, duration: 180, description: 'Koreksi warna', icon: '🔧', active: true },
  { id: 'ob-svc-20', tenantId: 'oldboy-cuts', category: 'Perawatan', name: 'Keratin Treatment', price: 160000, duration: 120, description: 'Keratin smoothing', icon: '💎', active: true },
]

// ─── CUSTOMERS ──────────────────────────────────────────────────────────────
export const customers = [
  { id: 'cust-001', tenantId: 'barber-king', name: 'Fajar Nugroho', phone: '081234567890', email: 'fajar@gmail.com', totalVisits: 24, loyaltyPoints: 480, segment: 'VIP', lastVisit: subDays(new Date(), 3).toISOString(), favoriteBarber: 'staff-001', notes: 'Suka fade rendah, tidak suka terlalu pendek di atas' },
  { id: 'cust-002', tenantId: 'barber-king', name: 'Bram Kusuma', phone: '081234567891', email: 'bram@gmail.com', totalVisits: 8, loyaltyPoints: 160, segment: 'Regular', lastVisit: subDays(new Date(), 7).toISOString(), favoriteBarber: 'staff-002', notes: '' },
  { id: 'cust-003', tenantId: 'barber-king', name: 'Daud Hakim', phone: '081234567892', email: 'daud@gmail.com', totalVisits: 1, loyaltyPoints: 20, segment: 'New', lastVisit: subDays(new Date(), 1).toISOString(), favoriteBarber: null, notes: 'Pertama kali ke sini' },
  { id: 'cust-004', tenantId: 'barber-king', name: 'Eko Prasetyo', phone: '081234567893', email: 'eko@gmail.com', totalVisits: 30, loyaltyPoints: 500, segment: 'VIP', lastVisit: subDays(new Date(), 2).toISOString(), favoriteBarber: 'staff-001', notes: 'Pelanggan setia sejak 2022. Suka coloring' },
  { id: 'cust-005', tenantId: 'barber-king', name: 'Fandi Ahmad', phone: '081234567894', email: 'fandi@gmail.com', totalVisits: 5, loyaltyPoints: 100, segment: 'Regular', lastVisit: subDays(new Date(), 14).toISOString(), favoriteBarber: 'staff-003', notes: '' },
  { id: 'cust-006', tenantId: 'barber-king', name: 'Guntur Wibowo', phone: '081234567895', email: null, totalVisits: 12, loyaltyPoints: 240, segment: 'Regular', lastVisit: subDays(new Date(), 10).toISOString(), favoriteBarber: 'staff-004', notes: '' },
  { id: 'cust-007', tenantId: 'barber-king', name: 'Heri Susanto', phone: '081234567896', email: 'heri@gmail.com', totalVisits: 0, loyaltyPoints: 0, segment: 'Inactive', lastVisit: subDays(new Date(), 60).toISOString(), favoriteBarber: 'staff-002', notes: 'Sudah lama tidak datang' },
  { id: 'cust-008', tenantId: 'barber-king', name: 'Ivan Budiman', phone: '081234567897', email: 'ivan@gmail.com', totalVisits: 18, loyaltyPoints: 360, segment: 'VIP', lastVisit: subDays(new Date(), 5).toISOString(), favoriteBarber: 'staff-001', notes: 'Selalu ambil Premium Package' },
  { id: 'cust-009', tenantId: 'barber-king', name: 'Joni Arif', phone: '081234567898', email: null, totalVisits: 3, loyaltyPoints: 60, segment: 'Regular', lastVisit: subDays(new Date(), 21).toISOString(), favoriteBarber: null, notes: '' },
  { id: 'cust-010', tenantId: 'barber-king', name: 'Kevin Angga', phone: '081234567899', email: 'kevin@gmail.com', totalVisits: 2, loyaltyPoints: 40, segment: 'New', lastVisit: subDays(new Date(), 4).toISOString(), favoriteBarber: 'staff-005', notes: '' },
  { id: 'cust-011', tenantId: 'barber-king', name: 'Lukas Santoso', phone: '082111111111', email: 'lukas@gmail.com', totalVisits: 15, loyaltyPoints: 300, segment: 'Regular', lastVisit: subDays(new Date(), 8).toISOString(), favoriteBarber: 'staff-002', notes: '' },
  { id: 'cust-012', tenantId: 'barber-king', name: 'Mirza Akbar', phone: '082111111112', email: null, totalVisits: 25, loyaltyPoints: 450, segment: 'VIP', lastVisit: subDays(new Date(), 1).toISOString(), favoriteBarber: 'staff-004', notes: 'Selalu datang Sabtu pagi' },
  { id: 'cust-013', tenantId: 'barber-king', name: 'Niko Putra', phone: '082111111113', email: 'niko@gmail.com', totalVisits: 6, loyaltyPoints: 120, segment: 'Regular', lastVisit: subDays(new Date(), 16).toISOString(), favoriteBarber: 'staff-003', notes: '' },
  { id: 'cust-014', tenantId: 'barber-king', name: 'Oscar Setiawan', phone: '082111111114', email: null, totalVisits: 1, loyaltyPoints: 20, segment: 'New', lastVisit: new Date().toISOString(), favoriteBarber: null, notes: '' },
  { id: 'cust-015', tenantId: 'barber-king', name: 'Prima Atmaja', phone: '082111111115', email: 'prima@gmail.com', totalVisits: 20, loyaltyPoints: 400, segment: 'VIP', lastVisit: subDays(new Date(), 3).toISOString(), favoriteBarber: 'staff-001', notes: 'Alergi tertentu, hindari produk mengandung parfum kuat' },
  { id: 'cust-016', tenantId: 'barber-king', name: 'Qadri Alawy', phone: '082111111116', email: null, totalVisits: 4, loyaltyPoints: 80, segment: 'Regular', lastVisit: subDays(new Date(), 12).toISOString(), favoriteBarber: 'staff-005', notes: '' },
  { id: 'cust-017', tenantId: 'barber-king', name: 'Rio Harmawan', phone: '082111111117', email: 'rio@gmail.com', totalVisits: 0, loyaltyPoints: 0, segment: 'Inactive', lastVisit: subDays(new Date(), 90).toISOString(), favoriteBarber: 'staff-003', notes: '' },
  { id: 'cust-018', tenantId: 'barber-king', name: 'Seno Prabowo', phone: '082111111118', email: null, totalVisits: 11, loyaltyPoints: 220, segment: 'Regular', lastVisit: subDays(new Date(), 9).toISOString(), favoriteBarber: 'staff-002', notes: '' },
  { id: 'cust-019', tenantId: 'barber-king', name: 'Toni Wijaya', phone: '082111111119', email: 'toni@gmail.com', totalVisits: 28, loyaltyPoints: 490, segment: 'VIP', lastVisit: subDays(new Date(), 2).toISOString(), favoriteBarber: 'staff-004', notes: 'Suka warna terang, biasanya coloring setiap 2 bulan' },
  { id: 'cust-020', tenantId: 'barber-king', name: 'Ucup Somantri', phone: '082111111120', email: null, totalVisits: 7, loyaltyPoints: 140, segment: 'Regular', lastVisit: subDays(new Date(), 18).toISOString(), favoriteBarber: null, notes: '' },
  // More customers...
  { id: 'cust-021', tenantId: 'barber-king', name: 'Vino Kartika', phone: '083111111121', email: null, totalVisits: 9, loyaltyPoints: 180, segment: 'Regular', lastVisit: subDays(new Date(), 11).toISOString(), favoriteBarber: 'staff-001', notes: '' },
  { id: 'cust-022', tenantId: 'barber-king', name: 'Wahid Nurdin', phone: '083111111122', email: 'wahid@gmail.com', totalVisits: 22, loyaltyPoints: 440, segment: 'VIP', lastVisit: subDays(new Date(), 4).toISOString(), favoriteBarber: 'staff-005', notes: '' },
  { id: 'cust-023', tenantId: 'barber-king', name: 'Xando Bahri', phone: '083111111123', email: null, totalVisits: 3, loyaltyPoints: 60, segment: 'Regular', lastVisit: subDays(new Date(), 22).toISOString(), favoriteBarber: 'staff-003', notes: '' },
  { id: 'cust-024', tenantId: 'barber-king', name: 'Yuda Prakasa', phone: '083111111124', email: 'yuda@gmail.com', totalVisits: 16, loyaltyPoints: 320, segment: 'Regular', lastVisit: subDays(new Date(), 6).toISOString(), favoriteBarber: 'staff-002', notes: '' },
  { id: 'cust-025', tenantId: 'barber-king', name: 'Zulfikar Amri', phone: '083111111125', email: null, totalVisits: 1, loyaltyPoints: 20, segment: 'New', lastVisit: new Date().toISOString(), favoriteBarber: null, notes: '' },
  // OldBoy customers
  { id: 'cust-026', tenantId: 'oldboy-cuts', name: 'Aldi Mardika', phone: '085111111126', email: 'aldi@gmail.com', totalVisits: 14, loyaltyPoints: 280, segment: 'Regular', lastVisit: subDays(new Date(), 5).toISOString(), favoriteBarber: 'staff-031', notes: '' },
  { id: 'cust-027', tenantId: 'oldboy-cuts', name: 'Bagas Surya', phone: '085111111127', email: null, totalVisits: 27, loyaltyPoints: 495, segment: 'VIP', lastVisit: subDays(new Date(), 2).toISOString(), favoriteBarber: 'staff-032', notes: 'Pelanggan VIP, selalu minta Oldboy Signature' },
  { id: 'cust-028', tenantId: 'oldboy-cuts', name: 'Cakra Dewa', phone: '085111111128', email: 'cakra@gmail.com', totalVisits: 2, loyaltyPoints: 40, segment: 'New', lastVisit: subDays(new Date(), 7).toISOString(), favoriteBarber: null, notes: '' },
  { id: 'cust-029', tenantId: 'oldboy-cuts', name: 'Doni Ramadhan', phone: '085111111129', email: null, totalVisits: 10, loyaltyPoints: 200, segment: 'Regular', lastVisit: subDays(new Date(), 13).toISOString(), favoriteBarber: 'staff-033', notes: '' },
  { id: 'cust-030', tenantId: 'oldboy-cuts', name: 'Emil Hartono', phone: '085111111130', email: 'emil@gmail.com', totalVisits: 18, loyaltyPoints: 360, segment: 'VIP', lastVisit: subDays(new Date(), 3).toISOString(), favoriteBarber: 'staff-031', notes: '' },
  { id: 'cust-031', tenantId: 'oldboy-cuts', name: 'Faisal Burhan', phone: '085111111131', email: null, totalVisits: 5, loyaltyPoints: 100, segment: 'Regular', lastVisit: subDays(new Date(), 19).toISOString(), favoriteBarber: 'staff-034', notes: '' },
  { id: 'cust-032', tenantId: 'oldboy-cuts', name: 'Galang Pratama', phone: '085111111132', email: null, totalVisits: 0, loyaltyPoints: 0, segment: 'Inactive', lastVisit: subDays(new Date(), 75).toISOString(), favoriteBarber: 'staff-032', notes: '' },
  { id: 'cust-033', tenantId: 'oldboy-cuts', name: 'Hasan Basri', phone: '085111111133', email: 'hasan@gmail.com', totalVisits: 23, loyaltyPoints: 460, segment: 'VIP', lastVisit: subDays(new Date(), 1).toISOString(), favoriteBarber: 'staff-035', notes: '' },
  { id: 'cust-034', tenantId: 'oldboy-cuts', name: 'Ibnu Hajar', phone: '085111111134', email: null, totalVisits: 7, loyaltyPoints: 140, segment: 'Regular', lastVisit: subDays(new Date(), 15).toISOString(), favoriteBarber: null, notes: '' },
  { id: 'cust-035', tenantId: 'oldboy-cuts', name: 'Jefri Alamsyah', phone: '085111111135', email: 'jefri@gmail.com', totalVisits: 1, loyaltyPoints: 20, segment: 'New', lastVisit: new Date().toISOString(), favoriteBarber: null, notes: '' },
  { id: 'cust-036', tenantId: 'oldboy-cuts', name: 'Kiki Amara', phone: '085111111136', email: null, totalVisits: 12, loyaltyPoints: 240, segment: 'Regular', lastVisit: subDays(new Date(), 8).toISOString(), favoriteBarber: 'staff-033', notes: '' },
  { id: 'cust-037', tenantId: 'oldboy-cuts', name: 'Lukman Hakim', phone: '085111111137', email: 'lukman@gmail.com', totalVisits: 19, loyaltyPoints: 380, segment: 'VIP', lastVisit: subDays(new Date(), 4).toISOString(), favoriteBarber: 'staff-031', notes: '' },
  { id: 'cust-038', tenantId: 'oldboy-cuts', name: 'Malik Ibrahim', phone: '085111111138', email: null, totalVisits: 4, loyaltyPoints: 80, segment: 'Regular', lastVisit: subDays(new Date(), 23).toISOString(), favoriteBarber: 'staff-034', notes: '' },
  { id: 'cust-039', tenantId: 'oldboy-cuts', name: 'Naufal Aziz', phone: '085111111139', email: 'naufal@gmail.com', totalVisits: 6, loyaltyPoints: 120, segment: 'Regular', lastVisit: subDays(new Date(), 17).toISOString(), favoriteBarber: 'staff-032', notes: '' },
  { id: 'cust-040', tenantId: 'oldboy-cuts', name: 'Oki Setiana', phone: '085111111140', email: null, totalVisits: 26, loyaltyPoints: 480, segment: 'VIP', lastVisit: subDays(new Date(), 2).toISOString(), favoriteBarber: 'staff-035', notes: 'Selalu ambil Coloring' },
  { id: 'cust-041', tenantId: 'oldboy-cuts', name: 'Putu Agus', phone: '085111111141', email: null, totalVisits: 3, loyaltyPoints: 60, segment: 'Regular', lastVisit: subDays(new Date(), 26).toISOString(), favoriteBarber: null, notes: '' },
  { id: 'cust-042', tenantId: 'oldboy-cuts', name: 'Raka Budi', phone: '085111111142', email: 'raka@gmail.com', totalVisits: 9, loyaltyPoints: 180, segment: 'Regular', lastVisit: subDays(new Date(), 10).toISOString(), favoriteBarber: 'staff-031', notes: '' },
  { id: 'cust-043', tenantId: 'oldboy-cuts', name: 'Sigit Wahyu', phone: '085111111143', email: null, totalVisits: 15, loyaltyPoints: 300, segment: 'Regular', lastVisit: subDays(new Date(), 6).toISOString(), favoriteBarber: 'staff-033', notes: '' },
  { id: 'cust-044', tenantId: 'oldboy-cuts', name: 'Teguh Prasetyo', phone: '085111111144', email: 'teguh@gmail.com', totalVisits: 0, loyaltyPoints: 0, segment: 'Inactive', lastVisit: subDays(new Date(), 120).toISOString(), favoriteBarber: 'staff-032', notes: '' },
  { id: 'cust-045', tenantId: 'oldboy-cuts', name: 'Usman Ali', phone: '085111111145', email: null, totalVisits: 21, loyaltyPoints: 420, segment: 'VIP', lastVisit: subDays(new Date(), 3).toISOString(), favoriteBarber: 'staff-035', notes: '' },
  { id: 'cust-046', tenantId: 'oldboy-cuts', name: 'Vicky Prasetya', phone: '085111111146', email: null, totalVisits: 2, loyaltyPoints: 40, segment: 'New', lastVisit: subDays(new Date(), 9).toISOString(), favoriteBarber: null, notes: '' },
  { id: 'cust-047', tenantId: 'oldboy-cuts', name: 'Wahyu Hidayat', phone: '085111111147', email: 'wahyu@gmail.com', totalVisits: 13, loyaltyPoints: 260, segment: 'Regular', lastVisit: subDays(new Date(), 11).toISOString(), favoriteBarber: 'staff-031', notes: '' },
  { id: 'cust-048', tenantId: 'oldboy-cuts', name: 'Yanuar Saputra', phone: '085111111148', email: null, totalVisits: 8, loyaltyPoints: 160, segment: 'Regular', lastVisit: subDays(new Date(), 20).toISOString(), favoriteBarber: 'staff-034', notes: '' },
  { id: 'cust-049', tenantId: 'oldboy-cuts', name: 'Zaki Hamdani', phone: '085111111149', email: 'zaki@gmail.com', totalVisits: 17, loyaltyPoints: 340, segment: 'Regular', lastVisit: subDays(new Date(), 7).toISOString(), favoriteBarber: 'staff-033', notes: '' },
  { id: 'cust-050', tenantId: 'oldboy-cuts', name: 'Agung Perkasa', phone: '085111111150', email: null, totalVisits: 29, loyaltyPoints: 498, segment: 'VIP', lastVisit: subDays(new Date(), 1).toISOString(), favoriteBarber: 'staff-035', notes: 'VIP terlama, suka promo' },
]

// ─── GENERATE TRANSACTIONS ───────────────────────────────────────────────────
const generateTransactions = () => {
  const txns = []
  const paymentMethods = ['cash', 'transfer', 'qris']
  const bkBarbers = ['staff-001', 'staff-002', 'staff-003', 'staff-004', 'staff-005']
  const bkServices = ['bk-svc-1', 'bk-svc-2', 'bk-svc-3', 'bk-svc-6', 'bk-svc-8', 'bk-svc-11', 'bk-svc-14', 'bk-svc-15']
  const bkCustomers = ['cust-001', 'cust-002', 'cust-003', 'cust-004', 'cust-005', 'cust-008', 'cust-011', 'cust-012', 'cust-015']

  for (let i = 1; i <= 100; i++) {
    const daysAgo = Math.floor(Math.random() * 30)
    const hoursAgo = Math.floor(Math.random() * 12) + 9
    const date = setHours(subDays(new Date(), daysAgo), hoursAgo)
    const numServices = Math.floor(Math.random() * 3) + 1
    const selectedServices = []
    let totalAmount = 0

    for (let s = 0; s < numServices; s++) {
      const svcId = bkServices[Math.floor(Math.random() * bkServices.length)]
      const svc = services.find(sv => sv.id === svcId)
      if (svc && !selectedServices.find(ss => ss.serviceId === svcId)) {
        selectedServices.push({ serviceId: svcId, name: svc.name, price: svc.price })
        totalAmount += svc.price
      }
    }

    const tax = Math.round(totalAmount * 0.1)
    const finalAmount = totalAmount + tax
    const staffId = bkBarbers[Math.floor(Math.random() * bkBarbers.length)]
    const staffMember = staff.find(s => s.id === staffId)

    txns.push({
      id: `txn-${String(i).padStart(4, '0')}`,
      tenantId: 'barber-king',
      branchId: 'bk-jakarta',
      customerId: bkCustomers[Math.floor(Math.random() * bkCustomers.length)],
      staffId,
      staffName: staffMember?.name || 'Unknown',
      services: selectedServices,
      subtotal: totalAmount,
      tax,
      discount: 0,
      total: finalAmount,
      paymentMethod: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
      status: 'completed',
      createdAt: date.toISOString(),
      commission: Math.round(finalAmount * (staffMember?.commissionRate || 0.35)),
    })
  }
  return txns
}

export const transactions = generateTransactions()

// ─── QUEUE (today) ──────────────────────────────────────────────────────────
export const initialQueue = [
  { id: 'q-001', tenantId: 'barber-king', branchId: 'bk-jakarta', ticketNumber: 'A001', customerName: 'Bram Kusuma', customerId: 'cust-002', phone: '081234567891', services: ['Potong Reguler'], staffId: 'staff-001', staffName: 'Rizky Pratama', status: 'waiting', type: 'booking', waitTime: 45, createdAt: setHours(new Date(), 9).toISOString() },
  { id: 'q-002', tenantId: 'barber-king', branchId: 'bk-jakarta', ticketNumber: 'A002', customerName: 'Fajar Nugroho', customerId: 'cust-001', phone: '081234567890', services: ['Premium Cut', 'Cukur Jenggot'], staffId: 'staff-001', staffName: 'Rizky Pratama', status: 'in-progress', type: 'walk-in', waitTime: 30, createdAt: setHours(new Date(), 9).toISOString() },
  { id: 'q-003', tenantId: 'barber-king', branchId: 'bk-jakarta', ticketNumber: 'A003', customerName: 'Daud Hakim', customerId: 'cust-003', phone: '081234567892', services: ['Skin Fade'], staffId: 'staff-002', staffName: 'Dani Saputra', status: 'waiting', type: 'walk-in', waitTime: 20, createdAt: setHours(new Date(), 10).toISOString() },
  { id: 'q-004', tenantId: 'barber-king', branchId: 'bk-jakarta', ticketNumber: 'A004', customerName: 'Eko Prasetyo', customerId: 'cust-004', phone: '081234567893', services: ['Coloring Full'], staffId: 'staff-004', staffName: 'Fahri Hidayat', status: 'in-progress', type: 'booking', waitTime: 15, createdAt: setHours(new Date(), 10).toISOString() },
  { id: 'q-005', tenantId: 'barber-king', branchId: 'bk-jakarta', ticketNumber: 'A005', customerName: 'Fandi Ahmad', customerId: 'cust-005', phone: '081234567894', services: ['Potong + Cuci'], staffId: 'staff-003', staffName: 'Eko Budi', status: 'done', type: 'walk-in', waitTime: 0, createdAt: setHours(new Date(), 9).toISOString() },
  { id: 'q-006', tenantId: 'barber-king', branchId: 'bk-jakarta', ticketNumber: 'A006', customerName: 'Guntur Wibowo', customerId: 'cust-006', phone: '081234567895', services: ['Hair Mask'], staffId: 'staff-004', staffName: 'Fahri Hidayat', status: 'done', type: 'booking', waitTime: 0, createdAt: setHours(new Date(), 10).toISOString() },
  { id: 'q-007', tenantId: 'barber-king', branchId: 'bk-jakarta', ticketNumber: 'A007', customerName: 'Heri Susanto', customerId: 'cust-007', phone: '081234567896', services: ['Potong Reguler'], staffId: 'staff-005', staffName: 'Gilang Nugraha', status: 'waiting', type: 'walk-in', waitTime: 60, createdAt: setHours(new Date(), 11).toISOString() },
  { id: 'q-008', tenantId: 'barber-king', branchId: 'bk-jakarta', ticketNumber: 'A008', customerName: 'Ivan Budiman', customerId: 'cust-008', phone: '081234567897', services: ['Premium Package'], staffId: 'staff-001', staffName: 'Rizky Pratama', status: 'waiting', type: 'booking', waitTime: 75, createdAt: setHours(new Date(), 11).toISOString() },
]

// ─── BOOKINGS (next 7 days) ──────────────────────────────────────────────────
export const initialBookings = [
  { id: 'book-001', tenantId: 'barber-king', branchId: 'bk-jakarta', customerId: 'cust-001', customerName: 'Fajar Nugroho', services: ['Premium Cut'], staffId: 'staff-001', staffName: 'Rizky Pratama', date: format(addDays(new Date(), 1), 'yyyy-MM-dd'), time: '10:00', status: 'confirmed', notes: '' },
  { id: 'book-002', tenantId: 'barber-king', branchId: 'bk-jakarta', customerId: 'cust-004', customerName: 'Eko Prasetyo', services: ['Coloring Full'], staffId: 'staff-004', staffName: 'Fahri Hidayat', date: format(addDays(new Date(), 1), 'yyyy-MM-dd'), time: '13:00', status: 'confirmed', notes: 'Mau cat hitam' },
  { id: 'book-003', tenantId: 'barber-king', branchId: 'bk-jakarta', customerId: 'cust-008', customerName: 'Ivan Budiman', services: ['Premium Package'], staffId: 'staff-001', staffName: 'Rizky Pratama', date: format(addDays(new Date(), 2), 'yyyy-MM-dd'), time: '09:00', status: 'pending', notes: '' },
  { id: 'book-004', tenantId: 'barber-king', branchId: 'bk-jakarta', customerId: 'cust-012', customerName: 'Mirza Akbar', services: ['Skin Fade', 'Beard Styling'], staffId: 'staff-005', staffName: 'Gilang Nugraha', date: format(addDays(new Date(), 2), 'yyyy-MM-dd'), time: '11:00', status: 'confirmed', notes: '' },
  { id: 'book-005', tenantId: 'barber-king', branchId: 'bk-jakarta', customerId: 'cust-015', customerName: 'Prima Atmaja', services: ['Hair Mask'], staffId: 'staff-004', staffName: 'Fahri Hidayat', date: format(addDays(new Date(), 3), 'yyyy-MM-dd'), time: '14:00', status: 'confirmed', notes: 'Hindari produk parfum' },
  { id: 'book-006', tenantId: 'barber-king', branchId: 'bk-jakarta', customerId: 'cust-019', customerName: 'Toni Wijaya', services: ['Coloring Full', 'Hair Mask'], staffId: 'staff-004', staffName: 'Fahri Hidayat', date: format(addDays(new Date(), 3), 'yyyy-MM-dd'), time: '16:00', status: 'pending', notes: '' },
  { id: 'book-007', tenantId: 'barber-king', branchId: 'bk-jakarta', customerId: 'cust-002', customerName: 'Bram Kusuma', services: ['Potong Reguler'], staffId: 'staff-002', staffName: 'Dani Saputra', date: format(addDays(new Date(), 4), 'yyyy-MM-dd'), time: '10:00', status: 'confirmed', notes: '' },
  { id: 'book-008', tenantId: 'barber-king', branchId: 'bk-jakarta', customerId: 'cust-022', customerName: 'Wahid Nurdin', services: ['Premium Cut', 'Beard Styling'], staffId: 'staff-005', staffName: 'Gilang Nugraha', date: format(addDays(new Date(), 4), 'yyyy-MM-dd'), time: '15:00', status: 'confirmed', notes: '' },
  { id: 'book-009', tenantId: 'barber-king', branchId: 'bk-jakarta', customerId: 'cust-024', customerName: 'Yuda Prakasa', services: ['Undercut Design'], staffId: 'staff-003', staffName: 'Eko Budi', date: format(addDays(new Date(), 5), 'yyyy-MM-dd'), time: '11:00', status: 'pending', notes: '' },
  { id: 'book-010', tenantId: 'barber-king', branchId: 'bk-jakarta', customerId: 'cust-011', customerName: 'Lukas Santoso', services: ['Potong + Cuci'], staffId: 'staff-002', staffName: 'Dani Saputra', date: format(addDays(new Date(), 5), 'yyyy-MM-dd'), time: '13:00', status: 'confirmed', notes: '' },
  { id: 'book-011', tenantId: 'barber-king', branchId: 'bk-jakarta', customerId: 'cust-021', customerName: 'Vino Kartika', services: ['Hot Towel Shave'], staffId: 'staff-003', staffName: 'Eko Budi', date: format(addDays(new Date(), 6), 'yyyy-MM-dd'), time: '09:30', status: 'confirmed', notes: '' },
  { id: 'book-012', tenantId: 'barber-king', branchId: 'bk-jakarta', customerId: 'cust-018', customerName: 'Seno Prabowo', services: ['Potong Reguler', 'Cukur Jenggot'], staffId: 'staff-001', staffName: 'Rizky Pratama', date: format(addDays(new Date(), 6), 'yyyy-MM-dd'), time: '14:00', status: 'pending', notes: '' },
  { id: 'book-013', tenantId: 'barber-king', branchId: 'bk-jakarta', customerId: 'cust-016', customerName: 'Qadri Alawy', services: ['Skin Fade'], staffId: 'staff-005', staffName: 'Gilang Nugraha', date: format(addDays(new Date(), 7), 'yyyy-MM-dd'), time: '10:00', status: 'confirmed', notes: '' },
  { id: 'book-014', tenantId: 'barber-king', branchId: 'bk-jakarta', customerId: 'cust-006', customerName: 'Guntur Wibowo', services: ['Scalp Treatment'], staffId: 'staff-004', staffName: 'Fahri Hidayat', date: format(addDays(new Date(), 7), 'yyyy-MM-dd'), time: '15:30', status: 'confirmed', notes: '' },
  { id: 'book-015', tenantId: 'barber-king', branchId: 'bk-jakarta', customerId: 'cust-013', customerName: 'Niko Putra', services: ['Potong + Cuci', 'Beard Styling'], staffId: 'staff-002', staffName: 'Dani Saputra', date: format(addDays(new Date(), 1), 'yyyy-MM-dd'), time: '15:00', status: 'confirmed', notes: '' },
  { id: 'book-016', tenantId: 'barber-king', branchId: 'bk-sudirman', customerId: 'cust-002', customerName: 'Bram Kusuma', services: ['Potong Reguler'], staffId: 'staff-011', staffName: 'Irfan Maulana', date: format(addDays(new Date(), 2), 'yyyy-MM-dd'), time: '10:00', status: 'confirmed', notes: '' },
  { id: 'book-017', tenantId: 'barber-king', branchId: 'bk-kemang', customerId: 'cust-004', customerName: 'Eko Prasetyo', services: ['Premium Cut'], staffId: 'staff-021', staffName: 'Pandu Setiawan', date: format(addDays(new Date(), 3), 'yyyy-MM-dd'), time: '11:00', status: 'pending', notes: '' },
  { id: 'book-018', tenantId: 'oldboy-cuts', branchId: 'ob-bandung', customerId: 'cust-027', customerName: 'Bagas Surya', services: ['Oldboy Signature Cut'], staffId: 'staff-031', staffName: 'Wahyu Santoso', date: format(addDays(new Date(), 1), 'yyyy-MM-dd'), time: '10:00', status: 'confirmed', notes: '' },
  { id: 'book-019', tenantId: 'oldboy-cuts', branchId: 'ob-dago', customerId: 'cust-033', customerName: 'Hasan Basri', services: ['Fade Cut', 'Beard Styling'], staffId: 'staff-041', staffName: 'Dimas Aditya', date: format(addDays(new Date(), 2), 'yyyy-MM-dd'), time: '13:00', status: 'confirmed', notes: '' },
  { id: 'book-020', tenantId: 'oldboy-cuts', branchId: 'ob-buahbatu', customerId: 'cust-040', customerName: 'Oki Setiana', services: ['Coloring Full'], staffId: 'staff-055', staffName: 'Omar Faruk', date: format(addDays(new Date(), 3), 'yyyy-MM-dd'), time: '14:00', status: 'pending', notes: 'Warna merah marun' },
]

// ─── REVENUE CHART DATA ──────────────────────────────────────────────────────
export const generateRevenueData = (days = 30) => {
  const data = []
  for (let i = days; i >= 0; i--) {
    const date = subDays(new Date(), i)
    data.push({
      date: format(date, 'dd MMM'),
      fullDate: date.toISOString(),
      'barber-king': Math.floor(Math.random() * 3000000) + 1000000,
      'oldboy-cuts': Math.floor(Math.random() * 2000000) + 600000,
      total: 0,
    })
  }
  data.forEach(d => { d.total = d['barber-king'] + d['oldboy-cuts'] })
  return data
}

export const revenueData = generateRevenueData()

// ─── PRODUCTS ───────────────────────────────────────────────────────────────
export const products = [
  { id: 'prod-001', tenantId: 'barber-king', name: 'Pomade Murrays Superior', category: 'Pomade', stock: 3, minStock: 5, price: 85000, costPrice: 45000, unit: 'pcs', branchId: 'bk-jakarta' },
  { id: 'prod-002', tenantId: 'barber-king', name: 'Shampoo Head & Shoulders Men', category: 'Shampo', stock: 12, minStock: 5, price: 45000, costPrice: 22000, unit: 'botol', branchId: 'bk-jakarta' },
  { id: 'prod-003', tenantId: 'barber-king', name: 'Hair Wax Gatsby Moving Rubber', category: 'Wax', stock: 2, minStock: 6, price: 65000, costPrice: 32000, unit: 'pcs', branchId: 'bk-jakarta' },
  { id: 'prod-004', tenantId: 'barber-king', name: 'Beard Oil Premium', category: 'Perawatan', stock: 8, minStock: 3, price: 120000, costPrice: 65000, unit: 'botol', branchId: 'bk-jakarta' },
  { id: 'prod-005', tenantId: 'barber-king', name: 'Clay Wax Uppercut Deluxe', category: 'Wax', stock: 1, minStock: 4, price: 145000, costPrice: 85000, unit: 'pcs', branchId: 'bk-jakarta' },
  { id: 'prod-006', tenantId: 'barber-king', name: 'Tonic Rambut Makarizo', category: 'Tonic', stock: 6, minStock: 3, price: 55000, costPrice: 28000, unit: 'botol', branchId: 'bk-jakarta' },
  { id: 'prod-007', tenantId: 'barber-king', name: 'Kondisioner Pantene', category: 'Shampo', stock: 4, minStock: 4, price: 38000, costPrice: 18000, unit: 'botol', branchId: 'bk-jakarta' },
  { id: 'prod-008', tenantId: 'barber-king', name: 'After Shave Lotion', category: 'Perawatan', stock: 0, minStock: 3, price: 75000, costPrice: 40000, unit: 'botol', branchId: 'bk-jakarta' },
  { id: 'prod-009', tenantId: 'oldboy-cuts', name: 'Pomade Suavecito Original', category: 'Pomade', stock: 5, minStock: 4, price: 95000, costPrice: 55000, unit: 'pcs', branchId: 'ob-bandung' },
  { id: 'prod-010', tenantId: 'oldboy-cuts', name: 'Shampo Rejoice', category: 'Shampo', stock: 9, minStock: 5, price: 35000, costPrice: 17000, unit: 'botol', branchId: 'ob-bandung' },
  { id: 'prod-011', tenantId: 'oldboy-cuts', name: 'Hair Spray Finisher', category: 'Styling', stock: 2, minStock: 5, price: 78000, costPrice: 42000, unit: 'kaleng', branchId: 'ob-bandung' },
  { id: 'prod-012', tenantId: 'oldboy-cuts', name: 'Beard Balm Natural', category: 'Perawatan', stock: 7, minStock: 3, price: 110000, costPrice: 58000, unit: 'pcs', branchId: 'ob-bandung' },
]

// ─── DEFAULT EXPORT ──────────────────────────────────────────────────────────
export default {
  tenants,
  branches,
  staff,
  services,
  customers,
  transactions,
  initialQueue,
  initialBookings,
  revenueData,
  products,
}
