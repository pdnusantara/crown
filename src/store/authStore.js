import { create } from 'zustand'
import api, { setTokens, clearTokens, getAccessToken, decodeAccessTokenPayload } from '../lib/api.js'
import { getBranchSlug } from '../utils/branchSlug.js'

const USER_CACHE_KEY = 'barberos_cached_user'

const cacheUser = (user) => {
  try {
    if (user) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_CACHE_KEY)
  } catch {}
}

const readCachedUser = () => {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const getRedirectPath = (user) => {
  switch (user.role) {
    case 'super_admin':  return '/super-admin/dashboard'
    case 'tenant_admin': return '/admin/dashboard'
    case 'kasir':        { const slug = getBranchSlug(user); return slug ? `/${slug}/kasir/pos` : '/login' }
    case 'barber':       return '/barber/dashboard'
    case 'customer':     return '/customer/booking'
    default:             return '/login'
  }
}

const userFromTokenPayload = (payload) => {
  if (!payload || !payload.role) return null
  return {
    id: payload.id,
    email: payload.email,
    role: payload.role,
    tenantId: payload.tenantId ?? null,
    branchId: payload.branchId ?? null,
  }
}

export const useAuthStore = create((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,
  impersonating: false,
  originalUser: null,
  impersonatedFrom: null,

  // Called on app start — restore session from stored token.
  // Strategi: kalau punya token + cached user, render optimistic dulu (isLoading=false),
  // lalu re-validate via /auth/me di background. Halaman tidak flash LoadingScreen.
  initialize: async () => {
    const token = getAccessToken()
    if (!token) {
      set({ isLoading: false, isAuthenticated: false })
      return
    }
    const tokenUser = userFromTokenPayload(decodeAccessTokenPayload(token))
    const cached = readCachedUser()
    if (cached) {
      // Optimistic restore — UI langsung tampil
      set({ user: cached, isAuthenticated: true, isLoading: false })
    } else if (tokenUser) {
      // Fallback saat cache user hilang namun access token masih valid.
      set({ user: tokenUser, isAuthenticated: true, isLoading: false })
    }
    try {
      const res = await api.get('/auth/me')
      const fresh = res.data.data
      cacheUser(fresh)
      set({ user: fresh, isAuthenticated: true, isLoading: false })
    } catch (err) {
      const status = err?.response?.status
      // Hanya paksa logout saat kredensial memang tidak valid/expired.
      // Untuk error sementara (429/5xx/network), pertahankan sesi lokal agar reload
      // tidak melempar user kembali ke login.
      if (status === 401) {
        clearTokens()
        cacheUser(null)
        set({ user: null, isAuthenticated: false, isLoading: false })
        return
      }
      set((state) => ({
        user: state.user || cached || tokenUser || null,
        isAuthenticated: Boolean(state.user || cached || tokenUser),
        isLoading: false,
      }))
    }
  },

  // Set auth langsung dari payload pre-fetched (dipakai self-service register).
  setAuth: ({ user, accessToken, refreshToken }) => {
    setTokens(accessToken, refreshToken)
    cacheUser(user)
    set({ user, isAuthenticated: true, isLoading: false, error: null })
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post('/auth/login', { email, password })
      const { accessToken, refreshToken, user } = res.data.data
      setTokens(accessToken, refreshToken)
      cacheUser(user)
      set({ user, isAuthenticated: true, isLoading: false, error: null })
      return { success: true, redirectTo: getRedirectPath(user) }
    } catch (err) {
      const data = err?.response?.data || {}
      const message = data.error || 'Email atau password salah'
      // Domain-mismatch responses include a `redirect` URL → expose to UI so
      // it can render a "Buka domain yang benar" button instead of just an
      // opaque error message.
      set({ isLoading: false, error: message })
      return {
        success: false,
        redirect: data.redirect || null,
        tenantSlug: data.tenantSlug || null,
      }
    }
  },

  // Pintasan login developer — masuk tanpa password sebagai peran tertentu.
  // Hanya berfungsi bila backend mengaktifkan ENABLE_DEV_LOGIN.
  devLogin: async (role) => {
    set({ isLoading: true, error: null })
    try {
      const res = await api.post('/auth/dev-login', { role })
      const { accessToken, refreshToken, user } = res.data.data
      setTokens(accessToken, refreshToken)
      cacheUser(user)
      set({ user, isAuthenticated: true, isLoading: false, error: null })
      return { success: true, redirectTo: getRedirectPath(user) }
    } catch (err) {
      const message = err?.response?.data?.error || 'Pintasan dev gagal'
      set({ isLoading: false, error: message })
      return { success: false }
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout', { refreshToken: localStorage.getItem('barberos_refresh_token') })
    } catch {}
    clearTokens()
    cacheUser(null)
    set({ user: null, isAuthenticated: false, error: null, impersonating: false, originalUser: null, impersonatedFrom: null })
  },

  updateProfile: async (data) => {
    const res = await api.patch('/auth/me', data)
    cacheUser(res.data.data)
    set({ user: res.data.data })
    return res.data.data
  },

  // Merge sebagian data tenant ke sesi (mis. wilayah toko yang baru disetel)
  // agar halaman lain langsung konsisten tanpa perlu login ulang.
  patchTenant: (partial) => {
    set(state => {
      if (!state.user) return {}
      const next = { ...state.user, tenant: { ...(state.user.tenant || {}), ...partial } }
      cacheUser(next)
      return { user: next }
    })
  },

  // Impersonation (super_admin only) — stores original user + switches view.
  // Does NOT touch the access token — all API calls continue to use the
  // super_admin token on the backend (which already has full access).
  impersonate: (tenantUser) => {
    const current = get().user
    // Use current stored originalUser if we're already mid-impersonation
    // (super_admin impersonated tenant A, now wants to impersonate tenant B).
    const alreadyImpersonating = !!get().impersonating
    if (!alreadyImpersonating && current?.role !== 'super_admin') return null
    if (!tenantUser?.role || !tenantUser?.tenantId) return null
    const original = alreadyImpersonating ? (get().originalUser || current) : current
    const virtualUser = { ...tenantUser, _impersonating: true }
    set({
      user: virtualUser,
      isAuthenticated: true,
      isLoading: false,
      impersonating: true,
      originalUser: original,
      impersonatedFrom: original,
    })
    return getRedirectPath(virtualUser)
  },

  stopImpersonation: () => {
    const original = get().originalUser || get().impersonatedFrom
    if (original) {
      set({ user: original, impersonating: false, originalUser: null, impersonatedFrom: null })
      return '/super-admin/dashboard'
    }
    return '/login'
  },

  stopImpersonating: () => {
    const original = get().impersonatedFrom || get().originalUser
    set({ user: original, impersonating: false, originalUser: null, impersonatedFrom: null })
  },

  clearError: () => set({ error: null }),

  // Kept for backward compat — returns mock-free list via API if needed
  getUsers: () => [],
}))
