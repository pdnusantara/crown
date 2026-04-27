const { verifyAccess } = require('../config/jwt');
const prisma = require('../config/database');

/**
 * Verifies the Bearer token and attaches decoded user to req.user
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccess(token);

    // Fetch fresh user from DB to ensure still active
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        photo: true,
        tenantId: true,
        branchId: true,
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || !user.isActive || user.deletedAt) {
      return res.status(401).json({ success: false, error: 'User account is inactive or not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    next(err);
  }
}

/**
 * Middleware factory: require one of the given roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Required role(s): ${roles.join(', ')}`,
      });
    }
    next();
  };
}

/**
 * Ensures the authenticated user belongs to the resolved tenant.
 * Tenant is resolved (in order): req.tenant (from tenantResolver), then route/body/query param.
 * super_admin bypasses this check.
 */
function requireTenant(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  if (req.user.role === 'super_admin') {
    return next();
  }

  const resolvedTenantId =
    req.tenant?.id ||
    req.params.tenantId ||
    req.body.tenantId ||
    req.query.tenantId;

  if (resolvedTenantId && req.user.tenantId !== resolvedTenantId) {
    return res.status(403).json({ success: false, error: 'Access denied to this tenant' });
  }

  next();
}

module.exports = { authenticate, requireRole, requireTenant };
