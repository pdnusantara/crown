const PLATFORM_SUBDOMAINS = ['www', 'app', 'api', 'localhost']

// True kalau host saat ini adalah subdomain tenant (mis. mahkota.sembapos.com),
// bukan apex domain (sembapos.com) atau subdomain platform (www/app/api).
export function isTenantSubdomain() {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname.split(':')[0]
  const parts = host.split('.')
  const sub = parts[0]
  const isSubdomain =
    (parts.length >= 3) ||
    (parts.length === 2 && parts[1] === 'localhost')
  return isSubdomain && !PLATFORM_SUBDOMAINS.includes(sub)
}

export function getTenantSlug() {
  if (typeof window === 'undefined') return null

  if (isTenantSubdomain()) {
    return window.location.hostname.split(':')[0].split('.')[0]
  }

  // Fallback: slug from URL path — supports sembapos.com/book/termul
  const pathMatch = window.location.pathname.match(/^\/book\/([^/?#]+)/)
  if (pathMatch?.[1]) return pathMatch[1]

  return import.meta.env.VITE_TENANT_SLUG || null
}
