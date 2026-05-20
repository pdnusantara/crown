const prisma = require('../config/database');

const PLATFORM_SUBDOMAINS = ['www', 'app', 'api', 'localhost'];

function extractSubdomain(hostname) {
  const host = hostname.split(':')[0];
  const parts = host.split('.');
  const sub = parts[0];
  const isSubdomain =
    (parts.length >= 3) ||
    (parts.length === 2 && parts[1] === 'localhost');
  if (!isSubdomain || PLATFORM_SUBDOMAINS.includes(sub)) return null;
  return sub;
}

// In-memory cache slug → tenant metadata. Setiap request HTTP hit middleware ini,
// dan tanpa cache, satu request normal bisa langsung memicu beberapa query
// findFirst('tenant'). TTL 5 menit cukup pendek supaya perubahan tenant (logo,
// timezone, suspend) sampai ke user dalam waktu wajar; mutasi yang relevan
// memanggil invalidateTenantCache(slug) supaya update instan.
const cache = new Map(); // slug → { tenant, expiresAt }
const NEGATIVE_TTL = 30_000;   // 30s — tenant tidak ditemukan
const POSITIVE_TTL = 5 * 60_000; // 5m — tenant valid

function invalidateTenantCache(slug) {
  if (!slug) {
    cache.clear();
    return;
  }
  cache.delete(slug);
}

async function tenantResolver(req, res, next) {
  try {
    const slug = req.headers['x-tenant-slug'] || extractSubdomain(req.hostname);
    if (!slug) {
      req.tenant = null;
      return next();
    }

    const cached = cache.get(slug);
    if (cached && cached.expiresAt > Date.now()) {
      req.tenant = cached.tenant;
      return next();
    }

    const tenant = await prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true, name: true, slug: true, logo: true, timezone: true, isSuspended: true },
    });

    cache.set(slug, {
      tenant: tenant || null,
      expiresAt: Date.now() + (tenant ? POSITIVE_TTL : NEGATIVE_TTL),
    });

    req.tenant = tenant || null;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = tenantResolver;
module.exports.invalidateTenantCache = invalidateTenantCache;
