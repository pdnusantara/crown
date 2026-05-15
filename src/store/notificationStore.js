import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useNotificationStore = create(persist(
  (set, get) => ({
    notifications: [],
    markAsRead: (id) => set(state => ({ notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n) })),
    markAllAsRead: (tenantId) => set(state => ({ notifications: state.notifications.map(n => n.tenantId === tenantId ? { ...n, read: true } : n) })),
    addNotification: (notif) => set(state => ({ notifications: [{ ...notif, id: `n-${Date.now()}`, read: false, createdAt: new Date().toISOString() }, ...state.notifications].slice(0, 100) })),
    deleteNotification: (id) => set(state => ({ notifications: state.notifications.filter(n => n.id !== id) })),
    getUnreadCount: (tenantId) => get().notifications.filter(n => n.tenantId === tenantId && !n.read).length,
    getByTenant: (tenantId) => get().notifications.filter(n => n.tenantId === tenantId).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)),
  }),
  {
    name: 'barberos-notifications',
    version: 2,
    migrate: () => ({ notifications: [] }),
  }
))
