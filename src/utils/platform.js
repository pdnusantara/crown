// Konstanta platform — supaya domain & branding tidak ditulis ulang di mana-mana.
// Override via env saat dev/staging: `VITE_PLATFORM_DOMAIN=staging.barberos.id`.

export const PLATFORM_DOMAIN = import.meta.env.VITE_PLATFORM_DOMAIN || 'barberos.id'
export const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME || 'barberos.id'

export function tenantHostname(slug) {
  return slug ? `${slug}.${PLATFORM_DOMAIN}` : PLATFORM_DOMAIN
}

export function tenantLoginUrl(slug) {
  if (!slug) return '#'
  return `https://${tenantHostname(slug)}`
}
