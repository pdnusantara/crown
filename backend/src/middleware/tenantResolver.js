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

async function tenantResolver(req, res, next) {
  try {
    const slug = req.headers['x-tenant-slug'] || extractSubdomain(req.hostname);
    if (!slug) {
      req.tenant = null;
      return next();
    }

    const tenant = await prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true, name: true, slug: true, logo: true, isSuspended: true },
    });

    req.tenant = tenant || null;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = tenantResolver;
