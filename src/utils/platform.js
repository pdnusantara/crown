// Konstanta platform — supaya domain & branding tidak ditulis ulang di mana-mana.
// Override via env saat dev/staging: `VITE_PLATFORM_DOMAIN=staging.sembapos.com`.

export const PLATFORM_DOMAIN = import.meta.env.VITE_PLATFORM_DOMAIN || 'sembapos.com'
export const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME || 'SembaPOS'

export function tenantHostname(slug) {
  return slug ? `${slug}.${PLATFORM_DOMAIN}` : PLATFORM_DOMAIN
}

export function tenantLoginUrl(slug) {
  if (!slug) return '#'
  return `https://${tenantHostname(slug)}`
}
