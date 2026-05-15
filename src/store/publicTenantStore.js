import { create } from 'zustand'
import axios from 'axios'
import { getTenantSlug } from '../lib/tenantSlug.js'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// status: 'idle' | 'loading' | 'found' | 'not_found' | 'suspended' | 'no_tenant'
export const usePublicTenantStore = create((set) => ({
  slug: null,
  name: null,
  logo: null,
  timezone: null,
  address: null,
  phone: null,
  bookingPage: null, // { tagline, description, heroImage, gallery, … }
  status: 'idle',

  resolve: async () => {
    const slug = getTenantSlug()
    if (!slug) {
      set({ status: 'no_tenant', slug: null })
      return
    }
    set({ status: 'loading', slug })
    try {
      const [resolveRes, infoRes] = await Promise.all([
        axios.get(`${BASE_URL}/tenants/resolve`, { headers: { 'X-Tenant-Slug': slug } }),
        // /public/info returns the bookingPage config and richer contact info.
        // Fail-soft if it errors so existing logo/name behavior still works.
        axios.get(`${BASE_URL}/public/info`, { headers: { 'X-Tenant-Slug': slug } }).catch(() => null),
      ])
      const t = resolveRes.data.data
      const info = infoRes?.data?.data || {}
      set({
        status: t.isSuspended ? 'suspended' : 'found',
        name: t.name,
        logo: t.logo || info.logo || null,
        timezone: t.timezone || 'Asia/Jakarta',
        address: info.address || null,
        phone: info.phone || null,
        bookingPage: info.bookingPage || null,
        slug,
      })
    } catch {
      set({ status: 'not_found', slug })
    }
  },
}))
