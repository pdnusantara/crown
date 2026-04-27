import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuditStore = create(persist(
  (set, get) => ({
    logs: [
      { id: 'a1', tenantId: 'barber-king', userId: 'ta1', userName: 'Budi Santoso', action: 'CREATE_SERVICE', entity: 'Service', entityId: 'svc-1', details: 'Membuat layanan: Potong Reguler', timestamp: new Date(Date.now() - 3600000).toISOString() },
      { id: 'a2', tenantId: 'barber-king', userId: 'k1', userName: 'Siti Rahayu', action: 'CREATE_TRANSACTION', entity: 'Transaction', entityId: 'txn-100', details: 'Transaksi Rp 85.000 — Rizky Pratama', timestamp: new Date(Date.now() - 1800000).toISOString() },
      { id: 'a3', tenantId: 'barber-king', userId: 'ta1', userName: 'Budi Santoso', action: 'UPDATE_STAFF', entity: 'Staff', entityId: 'staff-001', details: 'Update komisi Rizky Pratama: 35% → 40%', timestamp: new Date(Date.now() - 7200000).toISOString() },
    ],
    addLog: (log) => set(state => ({
      logs: [{ ...log, id: `audit-${Date.now()}`, timestamp: new Date().toISOString() }, ...state.logs].slice(0, 500)
    })),
    getLogs: (tenantId, limit = 50) => get().logs.filter(l => l.tenantId === tenantId).slice(0, limit),
  }),
  { name: 'barberos-audit' }
))
