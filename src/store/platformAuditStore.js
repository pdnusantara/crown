import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { format, subDays, subHours, subMinutes } from 'date-fns'

const now = new Date()

const INITIAL_LOGS = [
  { id: 'pal-1',  actor: 'Platform Admin', action: 'TENANT_CREATED',    target: 'Barber King',  detail: 'Tenant baru dibuat dengan paket Pro',         timestamp: format(subDays(now, 90), 'yyyy-MM-dd HH:mm'), severity: 'info' },
  { id: 'pal-2',  actor: 'Platform Admin', action: 'TENANT_CREATED',    target: 'OldBoy Cuts',  detail: 'Tenant baru dibuat dengan paket Basic',        timestamp: format(subDays(now, 60), 'yyyy-MM-dd HH:mm'), severity: 'info' },
  { id: 'pal-3',  actor: 'Platform Admin', action: 'PACKAGE_CHANGED',   target: 'Barber King',  detail: 'Package diubah: Basic → Pro',                  timestamp: format(subDays(now, 45), 'yyyy-MM-dd HH:mm'), severity: 'success' },
  { id: 'pal-4',  actor: 'Platform Admin', action: 'BROADCAST_SENT',    target: 'All Tenants',  detail: 'Broadcast: "Fitur Baru: Barber Rating"',        timestamp: format(subDays(now, 7), 'yyyy-MM-dd HH:mm'),  severity: 'info' },
  { id: 'pal-5',  actor: 'System',         action: 'SUBSCRIPTION_OVERDUE', target: 'OldBoy Cuts', detail: 'Subscription jatuh tempo, belum dibayar',     timestamp: format(subDays(now, 2), 'yyyy-MM-dd HH:mm'),  severity: 'warning' },
  { id: 'pal-6',  actor: 'Platform Admin', action: 'BROADCAST_SENT',    target: 'OldBoy Cuts',  detail: 'Broadcast: "Pengingat Pembayaran"',             timestamp: format(subDays(now, 1), 'yyyy-MM-dd HH:mm'),  severity: 'warning' },
  { id: 'pal-7',  actor: 'Platform Admin', action: 'TICKET_REPLIED',    target: 'Tkt #tkt-2',  detail: 'Reply ke tiket OldBoy Cuts: request struk',     timestamp: format(subHours(now, 20), 'yyyy-MM-dd HH:mm'), severity: 'info' },
  { id: 'pal-8',  actor: 'Platform Admin', action: 'FLAG_TOGGLED',      target: 'OldBoy Cuts',  detail: 'Feature flag "voucher" diaktifkan',             timestamp: format(subHours(now, 5), 'yyyy-MM-dd HH:mm'),  severity: 'info' },
  { id: 'pal-9',  actor: 'Platform Admin', action: 'TENANT_SUSPENDED',  target: 'OldBoy Cuts',  detail: 'Tenant di-suspend: subscription overdue',       timestamp: format(subHours(now, 2), 'yyyy-MM-dd HH:mm'),  severity: 'error' },
  { id: 'pal-10', actor: 'Platform Admin', action: 'TENANT_ACTIVATED',  target: 'OldBoy Cuts',  detail: 'Tenant diaktifkan kembali setelah pembayaran',  timestamp: format(subMinutes(now, 30), 'yyyy-MM-dd HH:mm'), severity: 'success' },
]

export const usePlatformAuditStore = create(persist(
  (set, get) => ({
    logs: INITIAL_LOGS,

    addLog: (log) => {
      set(state => ({
        logs: [{
          ...log,
          id: `pal-${Date.now()}`,
          timestamp: format(new Date(), 'yyyy-MM-dd HH:mm'),
        }, ...state.logs].slice(0, 1000)
      }))
    },

    getLogs: (filters = {}) => {
      let logs = get().logs
      if (filters.action) logs = logs.filter(l => l.action === filters.action)
      if (filters.severity) logs = logs.filter(l => l.severity === filters.severity)
      if (filters.actor) logs = logs.filter(l => l.actor.toLowerCase().includes(filters.actor.toLowerCase()))
      return logs
    },
  }),
  { name: 'barberos-platform-audit' }
))
