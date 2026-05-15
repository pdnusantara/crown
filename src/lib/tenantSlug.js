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

  // Fallback: slug from URL path — supports sembapos.com/book/termul
  const pathMatch = window.location.pathname.match(/^\/book\/([^/?#]+)/)
  if (pathMatch?.[1]) return pathMatch[1]

  return import.meta.env.VITE_TENANT_SLUG || null
}
