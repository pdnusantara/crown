const PLATFORM_SUBDOMAINS = ['www', 'app', 'api', 'localhost']

export function getTenantSlug() {
  if (typeof window === 'undefined') return null
  const host = window.location.hostname.split(':')[0]
  const parts = host.split('.')
  const sub = parts[0]
  const isSubdomain =
    (parts.length >= 3) ||
    (parts.length === 2 && parts[1] === 'localhost')
  if (isSubdomain && !PLATFORM_SUBDOMAINS.includes(sub)) return sub
  return import.meta.env.VITE_TENANT_SLUG || null
}
