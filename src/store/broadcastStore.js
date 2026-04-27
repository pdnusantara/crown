import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { format, subDays } from 'date-fns'

const today = new Date()

const INITIAL_BROADCASTS = [
  {
    id: 'bc-1',
    title: 'Maintenance Terjadwal',
    message: 'Sistem akan mengalami maintenance pada Minggu, 20 April 2026 pukul 02:00–04:00 WIB. Harap simpan semua pekerjaan sebelum waktu tersebut.',
    type: 'warning',
    targetTenants: 'all',
    sentAt: format(subDays(today, 2), 'yyyy-MM-dd HH:mm'),
    sentBy: 'Platform Admin',
    read: ['barber-king'],
    active: true,
  },
  {
    id: 'bc-2',
    title: 'Fitur Baru: Barber Rating',
    message: 'Kami meluncurkan fitur Barber Rating! Pelanggan kini bisa memberikan bintang setelah transaksi. Pantau performa barber Anda di halaman Laporan.',
    type: 'info',
    targetTenants: 'all',
    sentAt: format(subDays(today, 7), 'yyyy-MM-dd HH:mm'),
    sentBy: 'Platform Admin',
    read: ['barber-king', 'oldboy-cuts'],
    active: true,
  },
  {
    id: 'bc-3',
    title: 'Pengingat Pembayaran',
    message: 'Subscription Anda akan berakhir dalam 3 hari. Harap segera lakukan perpanjangan untuk menghindari gangguan layanan.',
    type: 'error',
    targetTenants: ['oldboy-cuts'],
    sentAt: format(subDays(today, 1), 'yyyy-MM-dd HH:mm'),
    sentBy: 'Platform Admin',
    read: [],
    active: true,
  },
]

export const useBroadcastStore = create(persist(
  (set, get) => ({
    broadcasts: INITIAL_BROADCASTS,

    sendBroadcast: (broadcast) => {
      const newBc = {
        ...broadcast,
        id: `bc-${Date.now()}`,
        sentAt: format(new Date(), 'yyyy-MM-dd HH:mm'),
        sentBy: 'Platform Admin',
        read: [],
        active: true,
      }
      set(state => ({ broadcasts: [newBc, ...state.broadcasts] }))
      return newBc
    },

    deleteBroadcast: (id) => {
      set(state => ({ broadcasts: state.broadcasts.filter(b => b.id !== id) }))
    },

    deactivateBroadcast: (id) => {
      set(state => ({
        broadcasts: state.broadcasts.map(b => b.id === id ? { ...b, active: false } : b)
      }))
    },

    markRead: (id, tenantId) => {
      set(state => ({
        broadcasts: state.broadcasts.map(b =>
          b.id === id && !b.read.includes(tenantId)
            ? { ...b, read: [...b.read, tenantId] }
            : b
        )
      }))
    },

    getForTenant: (tenantId) => {
      return get().broadcasts.filter(b =>
        b.active && (b.targetTenants === 'all' || b.targetTenants.includes(tenantId))
      )
    },

    getAll: () => get().broadcasts,

    getUnreadCount: (tenantId) => {
      return get().broadcasts.filter(b =>
        b.active &&
        (b.targetTenants === 'all' || b.targetTenants.includes(tenantId)) &&
        !b.read.includes(tenantId)
      ).length
    },
  }),
  { name: 'barberos-broadcasts' }
))
