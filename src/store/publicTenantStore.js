import { create } from 'zustand'
import axios from 'axios'
import { getTenantSlug } from '../lib/tenantSlug.js'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// status: 'idle' | 'loading' | 'found' | 'not_found' | 'suspended' | 'no_tenant'
export const usePublicTenantStore = create((set) => ({
  slug: null,
  name: null,
  logo: null,
  status: 'idle',

  resolve: async () => {
    const slug = getTenantSlug()
    if (!slug) {
      set({ status: 'no_tenant', slug: null })
      return
    }
    set({ status: 'loading', slug })
    try {
      const res = await axios.get(`${BASE_URL}/tenants/resolve`, {
        headers: { 'X-Tenant-Slug': slug },
      })
      const t = res.data.data
      set({
        status: t.isSuspended ? 'suspended' : 'found',
        name: t.name,
        logo: t.logo,
        slug,
      })
    } catch {
      set({ status: 'not_found', slug })
    }
  },
}))
