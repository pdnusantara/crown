import axios from 'axios'
import { getTenantSlug } from './tenantSlug.js'

// Build the headers a raw (interceptor-bypass) axios call must carry so the
// backend tenantResolver can still resolve the tenant. Used by the refresh
// flow where we intentionally do not go through the `api` instance (to avoid
// infinite recursion on 401).
function buildAuxHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  const slug = getTenantSlug()
  if (slug) headers['X-Tenant-Slug'] = slug
  return headers
}

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// Token helpers
export const getAccessToken  = () => localStorage.getItem('barberos_access_token')
export const getRefreshToken = () => localStorage.getItem('barberos_refresh_token')
export const setTokens = (access, refresh) => {
  localStorage.setItem('barberos_access_token', access)
  if (refresh) localStorage.setItem('barberos_refresh_token', refresh)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth:token-set', { detail: { accessToken: access } }))
  }
}
export const clearTokens = () => {
  localStorage.removeItem('barberos_access_token')
  localStorage.removeItem('barberos_refresh_token')
}

export const decodeAccessTokenPayload = (token) => {
  try {
    if (!token || typeof token !== 'string') return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const normalized = b64 + '='.repeat((4 - (b64.length % 4 || 4)) % 4)
    const json = atob(normalized)
    const payload = JSON.parse(json)
    return payload && typeof payload === 'object' ? payload : null
  } catch {
    return null
  }
}

// Request interceptor - attach token + tenant slug
api.interceptors.request.use(config => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  const slug = getTenantSlug()
  if (slug) config.headers['X-Tenant-Slug'] = slug
  return config
})

// Response interceptor - handle 401 + refresh
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => error ? prom.reject(error) : prom.resolve(token))
  failedQueue = []
}

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        })
      }
      original._retry = true
      isRefreshing = true
      const refreshToken = getRefreshToken()
      if (!refreshToken) {
        clearTokens()
        window.dispatchEvent(new Event('auth:logout'))
        return Promise.reject(err)
      }
      try {
        // BUG FIX (2026-05-14): raw axios bypasses our request interceptor, so
        // X-Tenant-Slug was never sent on refresh. Backend tenantResolver fell
        // back to hostname; since VITE_API_URL points at the main domain, the
        // backend saw `req.tenant=null` and refused tenant refreshes with 403,
        // logging users out every ~15 minutes. We now attach the slug header
        // explicitly so the tenantResolver can still route the refresh.
        const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken }, {
          headers: buildAuxHeaders(),
        })
        const { accessToken } = res.data.data
        setTokens(accessToken, null)
        window.dispatchEvent(new CustomEvent('auth:token-refreshed', { detail: { accessToken } }))
        processQueue(null, accessToken)
        original.headers.Authorization = `Bearer ${accessToken}`
        return api(original)
      } catch (refreshErr) {
        processQueue(refreshErr, null)
        const refreshStatus = refreshErr?.response?.status
        // Logout kalau refresh ditolak permanen:
        //   400/401 — refresh token invalid/expired
        //   403 — domain mismatch (tenant_admin token coba refresh dari main
        //         domain, atau super_admin coba refresh dari subdomain).
        //         Tanpa handle ini user stuck dengan 401 berulang.
        // Untuk error sementara (429/5xx/network), pertahankan sesi.
        if (refreshStatus === 400 || refreshStatus === 401 || refreshStatus === 403) {
          clearTokens()
          window.dispatchEvent(new Event('auth:logout'))
        }
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(err)
  }
)

export const get   = (url, params) => api.get(url, { params })
export const post  = (url, data)   => api.post(url, data)
export const put   = (url, data)   => api.put(url, data)
export const patch = (url, data)   => api.patch(url, data)
export const del   = (url)         => api.delete(url)

export default api
