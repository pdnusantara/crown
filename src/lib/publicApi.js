import axios from 'axios'
import { getTenantSlug } from './tenantSlug.js'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// Axios tanpa auth token — hanya sertakan tenant slug via header
const publicApi = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
})

publicApi.interceptors.request.use(config => {
  const slug = getTenantSlug()
  if (slug) config.headers['X-Tenant-Slug'] = slug
  return config
})

export default publicApi
