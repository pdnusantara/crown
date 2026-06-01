import { create } from 'zustand'
import axios from 'axios'
import { getTenantSlug } from '../lib/tenantSlug.js'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// status: 'idle' | 'loading' | 'found' | 'not_found' | 'suspended' | 'no_tenant'
export const usePublicTenantStore = create((set) => ({
  slug: null,
  name: null,
  ownerName: null,   // nama akun pemilik — dipakai /book sebagai nama tampil
  logo: null,
  timezone: null,
  address: null,
  phone: null,
  bookingPage: null, // { tagline, description, heroImage, gallery, … }
  wilayah: null,     // { provinsiId, provinsi, kabupatenId, kabupaten }
  devLogin: false,   // true kalau backend mengaktifkan dev-login (env DEV_LOGIN=1)
  status: 'idle',

  resolve: async () => {
    const slug = getTenantSlug()
    if (!slug) {
      set({ status: 'no_tenant', slug: null })
      return
    }
    // Tampilkan 'loading' HANYA saat muat pertama (status idle). Re-resolve latar
    // (mis. dipanggil setelah simpan pengaturan via useUpdateMyTenant) tidak boleh
    // membalik status ke 'loading' — itu memicu LoadingScreen di TenantGate yang
    // me-remount seluruh app → tab/scroll ter-reset (terasa "lompat ke halaman lain").
    set((s) => (s.status === 'idle' ? { status: 'loading', slug } : { slug }))
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
        ownerName: info.ownerName || null,
        logo: t.logo || info.logo || null,
        timezone: t.timezone || 'Asia/Jakarta',
        address: info.address || null,
        phone: info.phone || null,
        bookingPage: info.bookingPage || null,
        wilayah: info.wilayah || null,
        devLogin: info.devLogin === true,
        slug,
      })
    } catch {
      // Error transien saat re-resolve latar tak boleh melempar app yang sedang
      // berjalan ke layar "Tenant Tidak Ditemukan" — pertahankan status baik.
      set((s) => (s.status === 'found' || s.status === 'suspended' ? {} : { status: 'not_found', slug }))
    }
  },
}))
