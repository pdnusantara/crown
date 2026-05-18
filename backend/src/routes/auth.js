const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../config/database');
const { signAccess, signRefresh, verifyRefresh, REFRESH_EXPIRY } = require('../config/jwt');
const { authenticate } = require('../middleware/auth');
const { recordAudit } = require('../utils/auditLog');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Self-service trial registration — public.
// Creates Tenant + tenant_admin User + 14-day trial Subscription in one transaction.
// Slug harus minimal punya 1 huruf/angka, boleh hyphen di tengah, tidak boleh
// double-hyphen atau hyphen di awal/akhir (mencegah `---`, `-toko`, dst).
const slugRegex = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const RESERVED_SLUGS = new Set(['www', 'app', 'api', 'localhost', 'admin', 'mail', 'staging', 'sembapos', 'crown']);
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);

const registerSchema = z.object({
  businessName: z.string().min(2).max(200),
  slug:         z.string().min(2).max(40).regex(slugRegex, 'Slug hanya boleh huruf kecil, angka, dan tanda hubung'),
  ownerName:    z.string().min(2).max(150),
  email:        z.string().email(),
  phone:        z.string().min(8).max(20),
  password:     z.string().min(8, 'Password minimal 8 karakter').max(72),
  packageName:  z.enum(['Basic', 'Pro', 'Enterprise']).default('Basic'),
});

// GET /api/auth/check-slug?slug=xxx — preflight ke frontend
router.get('/check-slug', async (req, res, next) => {
  try {
    const slug = String(req.query.slug || '').trim().toLowerCase();
    if (!slug || !slugRegex.test(slug)) {
      return res.json({ success: true, data: { available: false, reason: 'invalid' } });
    }
    if (RESERVED_SLUGS.has(slug)) {
      return res.json({ success: true, data: { available: false, reason: 'reserved' } });
    }
    const exists = await prisma.tenant.findFirst({ where: { slug, deletedAt: null }, select: { id: true } });
    res.json({ success: true, data: { available: !exists, reason: exists ? 'taken' : 'ok' } });
  } catch (err) { next(err); }
});

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const slug = body.slug.toLowerCase();

    if (RESERVED_SLUGS.has(slug)) {
      return res.status(400).json({ success: false, error: 'Slug sudah dipakai sistem, pilih yang lain' });
    }

    const [emailExists, tenantEmailExists, slugExists] = await Promise.all([
      prisma.user.findUnique({ where: { email: body.email }, select: { id: true } }),
      prisma.tenant.findUnique({ where: { email: body.email }, select: { id: true } }),
      prisma.tenant.findFirst({ where: { slug, deletedAt: null }, select: { id: true } }),
    ]);
    if (emailExists || tenantEmailExists) return res.status(409).json({ success: false, error: 'Email sudah terdaftar' });
    if (slugExists)  return res.status(409).json({ success: false, error: 'Slug sudah dipakai' });

    const pkg = await prisma.package.findUnique({ where: { name: body.packageName } });
    const pkgPrice = pkg?.price ?? 0;

    const passwordHash = await bcrypt.hash(body.password, 10);
    const now = new Date();
    const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 86400 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name:  body.businessName,
          slug,
          email: body.email,
          phone: body.phone,
        },
        select: { id: true, name: true, slug: true, email: true },
      });

      const user = await tx.user.create({
        data: {
          email:    body.email,
          password: passwordHash,
          name:     body.ownerName,
          role:     'tenant_admin',
          phone:    body.phone,
          tenantId: tenant.id,
          isActive: true,
        },
        select: {
          id: true, email: true, name: true, role: true, phone: true, photo: true,
          tenantId: true, branchId: true, commissionRate: true,
        },
      });

      await tx.subscription.create({
        data: {
          tenantId:  tenant.id,
          package:   body.packageName,
          status:    'trial',
          price:     pkgPrice,
          startDate: now,
          endDate:   trialEnd,
          autoRenew: false,
        },
      });

      // Audit
      await tx.auditLog.create({
        data: {
          actorId: user.id, actorName: user.name,
          action: 'tenant.register',
          target: `tenant:${tenant.id}`,
          detail: `Self-service trial registration: pkg=${body.packageName} slug=${slug}`,
          severity: 'info',
        },
      });

      return { tenant, user };
    });

    const payload = {
      id:       result.user.id,
      email:    result.user.email,
      role:     result.user.role,
      tenantId: result.user.tenantId,
      branchId: result.user.branchId,
    };
    const accessToken  = signAccess(payload);
    const refreshToken = signRefresh({ id: result.user.id });
    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: result.user.id, expiresAt: new Date(Date.now() + 7 * 86400 * 1000) },
    });

    res.status(201).json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: result.user,
        tenant: result.tenant,
        trial: { endsAt: trialEnd, days: TRIAL_DAYS },
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    // Prisma unique constraint race — pemeriksaan eksplisit di atas sudah lolos,
    // berarti tabrakan terjadi antara findFirst & create. Beritahu user dengan jelas.
    if (err?.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(',') : String(err.meta?.target || '');
      const field = /slug/i.test(target) ? 'Slug' : /email/i.test(target) ? 'Email' : 'Data';
      return res.status(409).json({ success: false, error: `${field} sudah dipakai (terjadi konflik). Coba lagi.` });
    }
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        name: true,
        role: true,
        phone: true,
        photo: true,
        commissionRate: true,
        tenantId: true,
        branchId: true,
        branch: { select: { id: true, code: true, name: true } },
        isActive: true,
        deletedAt: true,
      },
    });

    if (!user || user.deletedAt) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, error: 'Account is inactive' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    // Domain-bound login policy:
    //   • Subdomain login (req.tenant set):
    //       - super_admin tidak boleh login dari sini (mereka pakai domain utama)
    //       - akun tenant LAIN tidak boleh login (must match req.tenant.id)
    //   • Main-domain login (no req.tenant):
    //       - hanya super_admin
    //       - akun tenant ditolak; respons membawa `redirect` ke subdomain
    //         tenant tersebut supaya UI bisa menampilkan tombol "Login di X"
    //
    // Tujuannya: setiap tenant punya pintu login terpisah dan tidak bocor ke
    // `sembapos.com`. Audit log SA juga jadi konsisten (selalu dari main domain).
    const PUBLIC_HOST = process.env.PUBLIC_HOST || 'sembapos.com';
    if (req.tenant) {
      if (user.role === 'super_admin') {
        return res.status(403).json({
          success: false,
          error: `Super-admin harus login dari ${PUBLIC_HOST}`,
          redirect: `https://${PUBLIC_HOST}/login`,
        });
      }
      if (user.tenantId !== req.tenant.id) {
        return res.status(403).json({ success: false, error: 'Akun ini tidak terdaftar di tenant ini' });
      }
    } else {
      if (user.role !== 'super_admin') {
        // Resolve tenant slug for the redirect link
        let slug = null;
        if (user.tenantId) {
          const t = await prisma.tenant.findUnique({
            where: { id: user.tenantId },
            select: { slug: true },
          });
          slug = t?.slug || null;
        }
        return res.status(403).json({
          success: false,
          error: slug
            ? `Akun tenant harus login dari ${slug}.${PUBLIC_HOST}`
            : `Akun tenant harus login dari subdomain tenant Anda`,
          redirect: slug ? `https://${slug}.${PUBLIC_HOST}/login` : null,
          tenantSlug: slug,
        });
      }
    }

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      branchId: user.branchId,
    };

    const accessToken = signAccess(payload);
    const refreshToken = signRefresh({ id: user.id });

    // Parse REFRESH_EXPIRY '7d' into ms
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    });

    const { password: _, ...userWithoutPassword } = user;

    // Log super-admin logins to the platform audit trail. Tenant logins are
    // intentionally not logged here — they belong in tenant-side analytics.
    if (user.role === 'super_admin') {
      await recordAudit(
        { user: { id: user.id, name: user.name } },
        {
          action: 'auth.login',
          target: `user:${user.id}`,
          detail: `Super-admin login (${user.email})`,
          severity: 'info',
        }
      );
    }

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: userWithoutPassword,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Refresh token required' });
    }

    let decoded;
    try {
      decoded = verifyRefresh(refreshToken);
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ success: false, error: 'Refresh token not found or expired' });
    }

    if (!stored.user.isActive || stored.user.deletedAt) {
      return res.status(401).json({ success: false, error: 'User account is inactive' });
    }

    // Mirror the login-time domain policy on refresh. Mismatch is logged with
    // the requesting hostname + slug header so cases like "tenant requesting
    // refresh against main domain" surface in observability instead of
    // silently logging users out every ~15 min (which was the 2026-05-14 bug).
    const denyReason = (() => {
      if (req.tenant) {
        if (stored.user.role === 'super_admin') return 'super_admin_on_subdomain';
        if (stored.user.tenantId !== req.tenant.id) return 'tenant_mismatch';
        return null;
      }
      if (stored.user.role !== 'super_admin') return 'tenant_on_main_domain';
      return null;
    })();
    if (denyReason) {
      try {
        await recordAudit(
          { user: { id: stored.user.id, name: stored.user.name } },
          {
            action: 'auth.refresh_denied',
            target: `user:${stored.user.id}`,
            detail: `reason=${denyReason} host=${req.hostname} tenantHeader=${req.headers['x-tenant-slug'] || '-'}`,
            severity: 'warning',
          }
        );
      } catch { /* observability — never break refresh */ }
      const msg = denyReason === 'tenant_on_main_domain'
        ? 'Refresh ditolak: akun tenant harus pakai subdomain'
        : 'Refresh ditolak: domain tidak cocok dengan akun';
      return res.status(403).json({ success: false, error: msg });
    }

    const payload = {
      id: stored.user.id,
      email: stored.user.email,
      role: stored.user.role,
      tenantId: stored.user.tenantId,
      branchId: stored.user.branchId,
    };

    const newAccessToken = signAccess(payload);

    res.json({
      success: true,
      data: { accessToken: newAccessToken },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken, userId: req.user.id },
      });
    }
    res.json({ success: true, data: { message: 'Logged out successfully' } });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        photo: true,
        commissionRate: true,
        tenantId: true,
        branchId: true,
        isActive: true,
        createdAt: true,
        tenant: { select: { id: true, name: true, logo: true, timezone: true, wilayah: true } },
        branch: { select: { id: true, code: true, name: true } },
      },
    });

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/auth/me — self-service profile update.
// Tidak bisa ubah role/tenant/branch/email — itu domain admin. Password lama
// wajib bila ingin ganti password. Photo diterima sebagai data URL (base64) yang
// sudah di-resize di client (lihat PhotoPicker di tenant-admin/staff).
const updateMeSchema = z.object({
  name:           z.string().min(1).max(150).optional(),
  phone:          z.string().max(20).optional(),
  photo:          z.string().nullable().optional(),
  currentPassword:z.string().optional(),
  newPassword:    z.string().min(6).max(72).optional(),
}).refine(
  (data) => !data.newPassword || !!data.currentPassword,
  { message: 'currentPassword wajib bila mengganti password', path: ['currentPassword'] },
);

router.patch('/me', authenticate, async (req, res, next) => {
  try {
    const body = updateMeSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'User not found' });

    const data = {};
    if (body.name !== undefined)  data.name = body.name.trim();
    if (body.phone !== undefined) data.phone = body.phone.trim() || null;
    if (body.photo !== undefined) data.photo = body.photo || null;

    if (body.newPassword) {
      const ok = await bcrypt.compare(body.currentPassword || '', existing.password);
      if (!ok) return res.status(400).json({ success: false, error: 'Password lama salah' });
      data.password = await bcrypt.hash(body.newPassword, 10);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, error: 'Tidak ada perubahan' });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
        id: true, email: true, name: true, role: true, phone: true, photo: true,
        commissionRate: true, tenantId: true, branchId: true, isActive: true, createdAt: true,
        tenant: { select: { id: true, name: true, logo: true, timezone: true, wilayah: true } },
        branch: { select: { id: true, code: true, name: true } },
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
