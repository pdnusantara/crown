import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter')
})

export const serviceSchema = z.object({
  name: z.string().min(2, 'Nama layanan minimal 2 karakter').max(50),
  category: z.enum(['Potong Rambut', 'Perawatan', 'Warna', 'Combo', 'Produk']),
  price: z.coerce.number().min(5000, 'Harga minimal Rp 5.000').max(10000000),
  duration: z.coerce.number().min(5, 'Durasi minimal 5 menit').max(480),
  description: z.string().optional(),
  icon: z.string().optional()
})

export const staffSchema = z.object({
  name: z.string().min(2).max(50),
  role: z.enum(['barber', 'kasir', 'manager']),
  phone: z.string().regex(/^(\+62|62|0)8[1-9][0-9]{6,10}$/, 'Nomor HP tidak valid').optional().or(z.literal('')),
  email: z.string().email('Email tidak valid').optional().or(z.literal('')),
  commissionRate: z.coerce.number().min(0).max(1).optional(),
  branchId: z.string().min(1, 'Pilih cabang'),
  specializations: z.array(z.string()).optional()
})

export const customerSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter').max(100),
  phone: z.string().regex(/^(\+62|62|0)8[1-9][0-9]{6,10}$/, 'Nomor HP tidak valid'),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().max(500).optional()
})

export const walkInSchema = z.object({
  customerName: z.string().min(2, 'Nama minimal 2 karakter'),
  phone: z.string().optional(),
  serviceId: z.string().min(1, 'Pilih layanan'),
  barberId: z.string().optional()
})

export const bookingSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().min(2),
  phone: z.string().regex(/^(\+62|62|0)8[1-9][0-9]{6,10}$/, 'Nomor HP tidak valid'),
  serviceIds: z.array(z.string()).min(1, 'Pilih minimal 1 layanan'),
  barberId: z.string().min(1, 'Pilih barber'),
  date: z.string().min(1, 'Pilih tanggal'),
  time: z.string().min(1, 'Pilih waktu')
})

export const branchSchema = z.object({
  name: z.string().min(2).max(100),
  address: z.string().min(5).max(200),
  phone: z.string().regex(/^(\+62|62|0)[0-9]{8,12}$/, 'Nomor telepon tidak valid'),
  openTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format jam: HH:MM'),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/, 'Format jam: HH:MM')
})

export const discountSchema = z.object({
  type: z.enum(['percentage', 'flat', 'voucher']),
  value: z.number().min(0),
  code: z.string().optional()
}).refine(data => {
  if (data.type === 'percentage') return data.value <= 100
  return true
}, { message: 'Diskon persentase tidak boleh lebih dari 100%' })
