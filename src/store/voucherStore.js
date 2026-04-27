import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useVoucherStore = create(persist(
  (set, get) => ({
    vouchers: [
      { id: 'v1', tenantId: 'barber-king', code: 'HEMAT20', type: 'percentage', value: 20, minOrder: 50000, maxUses: 100, usedCount: 23, active: true, expiresAt: '2026-12-31', description: 'Diskon 20% untuk semua layanan' },
      { id: 'v2', tenantId: 'barber-king', code: 'GRATIS10K', type: 'flat', value: 10000, minOrder: 75000, maxUses: 50, usedCount: 12, active: true, expiresAt: '2026-06-30', description: 'Potongan Rp 10.000' },
      { id: 'v3', tenantId: 'barber-king', code: 'VIP50', type: 'percentage', value: 50, minOrder: 100000, maxUses: 20, usedCount: 5, active: false, expiresAt: '2026-03-31', description: 'Diskon VIP 50%' },
      { id: 'v4', tenantId: 'oldboy-cuts', code: 'OB15', type: 'percentage', value: 15, minOrder: 40000, maxUses: 200, usedCount: 67, active: true, expiresAt: '2026-09-30', description: 'Diskon 15% OldBoy' },
    ],
    addVoucher: (v) => set(state => ({ vouchers: [...state.vouchers, { ...v, id: `v-${Date.now()}`, usedCount: 0 }] })),
    updateVoucher: (id, updates) => set(state => ({ vouchers: state.vouchers.map(v => v.id === id ? { ...v, ...updates } : v) })),
    deleteVoucher: (id) => set(state => ({ vouchers: state.vouchers.filter(v => v.id !== id) })),
    validateVoucher: (code, tenantId, orderTotal) => {
      const v = get().vouchers.find(v => v.code.toUpperCase() === code.toUpperCase() && v.tenantId === tenantId)
      if (!v) return { valid: false, error: 'Kode voucher tidak ditemukan' }
      if (!v.active) return { valid: false, error: 'Voucher sudah tidak aktif' }
      if (v.usedCount >= v.maxUses) return { valid: false, error: 'Voucher sudah habis digunakan' }
      if (new Date(v.expiresAt) < new Date()) return { valid: false, error: 'Voucher sudah kadaluarsa' }
      if (orderTotal < v.minOrder) return { valid: false, error: `Minimum order ${new Intl.NumberFormat('id-ID', {style:'currency',currency:'IDR',minimumFractionDigits:0}).format(v.minOrder)}` }
      return { valid: true, voucher: v }
    },
    useVoucher: (id) => set(state => ({ vouchers: state.vouchers.map(v => v.id === id ? { ...v, usedCount: v.usedCount + 1 } : v) })),
    getVouchersByTenant: (tenantId) => get().vouchers.filter(v => v.tenantId === tenantId),
  }),
  { name: 'barberos-vouchers' }
))
