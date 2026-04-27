import axios from 'axios'
import { getTenantSlug } from './tenantSlug.js'

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
        const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })
        const { accessToken } = res.data.data
        setTokens(accessToken, null)
        window.dispatchEvent(new CustomEvent('auth:token-refreshed', { detail: { accessToken } }))
        processQueue(null, accessToken)
        original.headers.Authorization = `Bearer ${accessToken}`
        return api(original)
      } catch (refreshErr) {
        processQueue(refreshErr, null)
        clearTokens()
        window.dispatchEvent(new Event('auth:logout'))
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
