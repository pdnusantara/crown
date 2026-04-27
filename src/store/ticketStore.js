import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { format, subDays, subHours } from 'date-fns'

const now = new Date()

const INITIAL_TICKETS = [
  {
    id: 'tkt-1', tenantId: 'barber-king', tenantName: 'Barber King',
    subject: 'Laporan tidak bisa di-export PDF',
    description: 'Saat klik tombol Download PDF di halaman laporan, tidak ada yang terjadi. Sudah dicoba di Chrome dan Firefox.',
    category: 'Bug', priority: 'high', status: 'open',
    createdBy: 'Budi Santoso', createdAt: format(subHours(now, 3), 'yyyy-MM-dd HH:mm'),
    replies: [],
    updatedAt: format(subHours(now, 3), 'yyyy-MM-dd HH:mm'),
  },
  {
    id: 'tkt-2', tenantId: 'oldboy-cuts', tenantName: 'OldBoy Cuts',
    subject: 'Request fitur: cetak struk otomatis',
    description: 'Bisa tambahkan fitur agar struk tercetak otomatis setelah pembayaran tanpa harus klik tombol Cetak lagi?',
    category: 'Feature Request', priority: 'medium', status: 'in_progress',
    createdBy: 'Andi Wijaya', createdAt: format(subDays(now, 1), 'yyyy-MM-dd HH:mm'),
    replies: [
      { id: 'r1', author: 'Platform Admin', message: 'Terima kasih atas masukkannya. Kami sedang evaluasi feasibility fitur ini dan akan update dalam 3-5 hari kerja.', createdAt: format(subHours(now, 20), 'yyyy-MM-dd HH:mm'), isAdmin: true }
    ],
    updatedAt: format(subHours(now, 20), 'yyyy-MM-dd HH:mm'),
  },
  {
    id: 'tkt-3', tenantId: 'barber-king', tenantName: 'Barber King',
    subject: 'Pertanyaan tentang upgrade ke Enterprise',
    description: 'Kami tertarik upgrade ke paket Enterprise. Apa saja fitur tambahan yang didapat dan bagaimana proses migrasinya?',
    category: 'Billing', priority: 'low', status: 'resolved',
    createdBy: 'Budi Santoso', createdAt: format(subDays(now, 3), 'yyyy-MM-dd HH:mm'),
    replies: [
      { id: 'r2', author: 'Platform Admin', message: 'Paket Enterprise memberikan: unlimited branches, API access, white label, dan priority support. Migrasi bisa dilakukan kapan saja tanpa downtime. Silakan hubungi kami untuk proses selanjutnya.', createdAt: format(subDays(now, 2), 'yyyy-MM-dd HH:mm'), isAdmin: true },
      { id: 'r3', author: 'Budi Santoso', message: 'Terima kasih infonya, kami akan diskusikan internal dulu.', createdAt: format(subDays(now, 1), 'yyyy-MM-dd HH:mm'), isAdmin: false },
    ],
    updatedAt: format(subDays(now, 1), 'yyyy-MM-dd HH:mm'),
  },
]

export const useTicketStore = create(persist(
  (set, get) => ({
    tickets: INITIAL_TICKETS,

    addTicket: (ticket) => {
      const newTicket = {
        ...ticket,
        id: `tkt-${Date.now()}`,
        status: 'open',
        replies: [],
        createdAt: format(new Date(), 'yyyy-MM-dd HH:mm'),
        updatedAt: format(new Date(), 'yyyy-MM-dd HH:mm'),
      }
      set(state => ({ tickets: [newTicket, ...state.tickets] }))
      return newTicket
    },

    addReply: (ticketId, reply) => {
      set(state => ({
        tickets: state.tickets.map(t =>
          t.id === ticketId
            ? {
                ...t,
                replies: [...t.replies, { ...reply, id: `r-${Date.now()}`, createdAt: format(new Date(), 'yyyy-MM-dd HH:mm') }],
                updatedAt: format(new Date(), 'yyyy-MM-dd HH:mm'),
              }
            : t
        )
      }))
    },

    updateStatus: (ticketId, status) => {
      set(state => ({
        tickets: state.tickets.map(t =>
          t.id === ticketId
            ? { ...t, status, updatedAt: format(new Date(), 'yyyy-MM-dd HH:mm') }
            : t
        )
      }))
    },

    getAll: () => get().tickets,
    getByTenant: (tenantId) => get().tickets.filter(t => t.tenantId === tenantId),
    getOpenCount: () => get().tickets.filter(t => t.status === 'open').length,

    getStats: () => {
      const all = get().tickets
      return {
        open: all.filter(t => t.status === 'open').length,
        in_progress: all.filter(t => t.status === 'in_progress').length,
        resolved: all.filter(t => t.status === 'resolved').length,
        total: all.length,
      }
    },
  }),
  { name: 'barberos-tickets' }
))
