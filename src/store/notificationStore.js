import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const INITIAL_NOTIFICATIONS = [
  { id: 'n1', type: 'low_stock', title: 'Stok Hampir Habis', message: 'Pomade Murrays tersisa 3 pcs (min: 5)', read: false, createdAt: new Date(Date.now() - 1800000).toISOString(), tenantId: 'barber-king', severity: 'warning' },
  { id: 'n2', type: 'new_booking', title: 'Booking Baru', message: 'Fajar Nugroho booking untuk besok 10:00 — Potong Reguler', read: false, createdAt: new Date(Date.now() - 3600000).toISOString(), tenantId: 'barber-king', severity: 'info' },
  { id: 'n3', type: 'birthday', title: 'Ulang Tahun Pelanggan', message: '3 pelanggan berulang tahun hari ini: Ahmad, Sari, Doni', read: false, createdAt: new Date(Date.now() - 7200000).toISOString(), tenantId: 'barber-king', severity: 'success' },
  { id: 'n4', type: 'revenue_milestone', title: 'Milestone Revenue!', message: 'Cabang Jakarta Pusat mencapai Rp 50jt bulan ini!', read: true, createdAt: new Date(Date.now() - 86400000).toISOString(), tenantId: 'barber-king', severity: 'gold' },
  { id: 'n5', type: 'low_stock', title: 'Stok Habis', message: 'After Shave Lotion sudah habis (stok: 0)', read: false, createdAt: new Date(Date.now() - 900000).toISOString(), tenantId: 'barber-king', severity: 'error' },
]

export const useNotificationStore = create(persist(
  (set, get) => ({
    notifications: INITIAL_NOTIFICATIONS,
    markAsRead: (id) => set(state => ({ notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n) })),
    markAllAsRead: (tenantId) => set(state => ({ notifications: state.notifications.map(n => n.tenantId === tenantId ? { ...n, read: true } : n) })),
    addNotification: (notif) => set(state => ({ notifications: [{ ...notif, id: `n-${Date.now()}`, read: false, createdAt: new Date().toISOString() }, ...state.notifications] })),
    deleteNotification: (id) => set(state => ({ notifications: state.notifications.filter(n => n.id !== id) })),
    getUnreadCount: (tenantId) => get().notifications.filter(n => n.tenantId === tenantId && !n.read).length,
    getByTenant: (tenantId) => get().notifications.filter(n => n.tenantId === tenantId).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)),
  }),
  { name: 'barberos-notifications' }
))
