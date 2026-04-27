import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import seedData from '../data/seed.js'

export const useTenantStore = create(
  persist(
    (set, get) => ({
      tenants: seedData.tenants,
      branches: seedData.branches,
      staff: seedData.staff,
      services: seedData.services,
      customers: seedData.customers,
      products: seedData.products || [],
      initialized: true,

      // Tenant actions
      addTenant: (tenant) => {
        const newTenant = { ...tenant, id: `tenant-${Date.now()}`, status: 'active', createdAt: new Date().toISOString(), totalBranches: 0, totalStaff: 0, monthlyRevenue: 0 }
        set(state => ({ tenants: [...state.tenants, newTenant] }))
        return newTenant   // ← supaya caller bisa langsung pakai id-nya
      },

      updateTenant: (id, updates) => {
        set(state => ({ tenants: state.tenants.map(t => t.id === id ? { ...t, ...updates } : t) }))
      },

      deleteTenant: (id) => {
        set(state => ({ tenants: state.tenants.filter(t => t.id !== id) }))
      },

      // Branch actions
      addBranch: (branch) => {
        set(state => ({ branches: [...state.branches, { ...branch, id: `branch-${Date.now()}`, status: 'active' }] }))
      },

      updateBranch: (id, updates) => {
        set(state => ({ branches: state.branches.map(b => b.id === id ? { ...b, ...updates } : b) }))
      },

      deleteBranch: (id) => {
        set(state => ({ branches: state.branches.filter(b => b.id !== id) }))
      },

      // Service actions
      addService: (service) => {
        set(state => ({ services: [...state.services, { ...service, id: `svc-${Date.now()}`, active: true }] }))
      },

      updateService: (id, updates) => {
        set(state => ({ services: state.services.map(s => s.id === id ? { ...s, ...updates } : s) }))
      },

      deleteService: (id) => {
        set(state => ({ services: state.services.filter(s => s.id !== id) }))
      },

      // Staff actions
      addStaff: (member) => {
        set(state => ({ staff: [...state.staff, { ...member, id: `staff-${Date.now()}`, status: 'active' }] }))
      },

      updateStaff: (id, updates) => {
        set(state => ({ staff: state.staff.map(s => s.id === id ? { ...s, ...updates } : s) }))
      },

      deleteStaff: (id) => {
        set(state => ({ staff: state.staff.filter(s => s.id !== id) }))
      },

      // Customer actions
      addCustomer: (customer) => {
        const newCustomer = {
          ...customer,
          id: `cust-${Date.now()}`,
          totalVisits: 0,
          loyaltyPoints: 0,
          segment: 'New',
          lastVisit: new Date().toISOString(),
          favoriteBarber: null,
          notes: '',
        }
        set(state => ({ customers: [...state.customers, newCustomer] }))
        return newCustomer
      },

      updateCustomer: (id, updates) => {
        set(state => ({ customers: state.customers.map(c => c.id === id ? { ...c, ...updates } : c) }))
      },

      // Selectors
      getTenantById: (id) => get().tenants.find(t => t.id === id),
      getBranchesByTenant: (tenantId) => get().branches.filter(b => b.tenantId === tenantId),
      getBranchById: (id) => get().branches.find(b => b.id === id),
      getStaffByBranch: (branchId) => get().staff.filter(s => s.branchId === branchId),
      getStaffByTenant: (tenantId) => get().staff.filter(s => s.tenantId === tenantId),
      getBarbersByBranch: (branchId) => get().staff.filter(s => s.branchId === branchId && s.role === 'barber'),
      getServicesByTenant: (tenantId) => get().services.filter(s => s.tenantId === tenantId && s.active),
      getCustomersByTenant: (tenantId) => get().customers.filter(c => c.tenantId === tenantId),
      getStaffById: (id) => get().staff.find(s => s.id === id),
      getServiceById: (id) => get().services.find(s => s.id === id),
      getCustomerById: (id) => get().customers.find(c => c.id === id),
      getProductsByTenant: (tenantId) => get().products.filter(p => p.tenantId === tenantId),
      getLowStockProducts: (tenantId) => get().products.filter(p => p.tenantId === tenantId && p.stock <= p.minStock),
      updateProductStock: (id, newStock) => set(state => ({
        products: state.products.map(p => p.id === id ? { ...p, stock: newStock } : p)
      })),
      addProduct: (product) => set(state => ({
        products: [...state.products, { ...product, id: `prod-${Date.now()}` }]
      })),

      // CLV calculator
      getCustomerCLV: (customerId) => {
        const customer = get().customers.find(c => c.id === customerId)
        if (!customer) return 0
        const avgSpend = 75000
        const visitsPerMonth = customer.totalVisits / 6
        return Math.round(avgSpend * visitsPerMonth * 12)
      },

      // Auto-segmentation
      runAutoSegmentation: () => {
        set(state => {
          const updatedCustomers = state.customers.map(customer => {
            let newSegment = customer.segment
            const daysSinceVisit = customer.lastVisit
              ? Math.floor((Date.now() - new Date(customer.lastVisit).getTime()) / 86400000)
              : 999

            if (daysSinceVisit > 60) {
              newSegment = 'Inactive'
            } else if (customer.totalVisits >= 10) {
              newSegment = 'VIP'
            } else if (customer.totalVisits >= 3) {
              newSegment = 'Regular'
            } else {
              newSegment = 'New'
            }

            return { ...customer, segment: newSegment }
          })
          return { customers: updatedCustomers }
        })
      },

      // Rate barber
      rateBarber: (barberId, rating) => set(state => {
        const barber = state.staff.find(s => s.id === barberId)
        if (!barber) return state
        const totalRatings = (barber.totalRatings || 0) + 1
        const newRating = ((barber.rating || 0) * (totalRatings - 1) + rating) / totalRatings
        return {
          staff: state.staff.map(s => s.id === barberId
            ? { ...s, rating: Math.round(newRating * 10) / 10, totalRatings }
            : s
          )
        }
      }),
    }),
    {
      name: 'barberos-tenant',
    }
  )
)
