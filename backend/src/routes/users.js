const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { recordAudit } = require('../utils/auditLog');
const { buildAddonCycleFilter } = require('../utils/branchLicense');
const { getIO, tenantRoom } = require('../config/socket');

// Realtime: kasir/barber lain ikut dapat update saat admin tambah/edit/hapus
// staf. Ke tenantRoom (semua user tenant) — tidak ke 'support' karena info
// internal tenant. Fail-silent kalau socket belum siap.
function emitStaffChanged(tenantId, payload) {
  if (!tenantId) return;
  try { getIO().to(tenantRoom(tenantId)).emit('staff:changed', payload); } catch (_) {}
}

// Charset menghindari karakter ambigu (0/O, 1/l/I) supaya gampang dibacakan
// admin ke staf via telepon/WA.
const TEMP_PASSWORD_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function generateTempPassword(len = 10) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += TEMP_PASSWORD_CHARSET[bytes[i] % TEMP_PASSWORD_CHARSET.length];
  }
  return out;
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  phone: true,
  photo: true,
  commissionRate: true,
  salaryType: true,
  baseSalary: true,
  isBarber: true,
  tenantId: true,
  branchId: true,
  isActive: true,
  lockedPendingAddon: true,
  createdAt: true,
  updatedAt: true,
  tenant: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
};

const createUserSchema = z.object({
  // Email dinormalkan lowercase+trim — login bersifat case-insensitive, jadi
  // simpan seragam agar tak ada akun "kembar" beda huruf besar/kecil.
  email: z.string().email().transform(e => e.trim().toLowerCase()),
  // Password opsional — kalau tidak dikirim, server generate otomatis dan
  // mengembalikannya satu kali di response (lihat POST handler).
  password: z.string().min(6).optional(),
  name: z.string().min(1),
  role: z.enum(['super_admin', 'tenant_admin', 'kasir', 'barber', 'customer']),
  phone: z.string().optional(),
  photo: z.string().optional(),
  commissionRate: z.number().min(0).max(1).optional(),
  salaryType: z.enum(['commission', 'fixed', 'hybrid']).optional(),
  baseSalary: z.number().int().min(0).max(1_000_000_000).optional(),
  isBarber: z.boolean().optional(),
  tenantId: z.string().optional(),
  branchId: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updateUserSchema = createUserSchema.partial().omit({ password: true }).extend({
  password: z.string().min(6).optional(),
  // photo: null = hapus foto, string = ganti, undefined = tak diubah. Frontend
  // kirim null saat user remove. createUserSchema.photo = string().optional()
  // (tak terima null) — di-override di sini supaya update bisa hapus foto.
  photo: z.string().nullable().optional(),
});

// Reset password — `password` opsional: kalau diisi, admin menentukan sendiri;
// kalau kosong, server generate otomatis.
const resetPasswordSchema = z.object({
  password: z.string().min(6).max(72).optional(),
});

// GET /api/users
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir', 'barber'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, role, tenantId, branchId, isActive } = req.query;

    const where = { deletedAt: null };
    const and = [];

    // "Barber-eligible" = role barber ATAU kasir/admin yang ditandai juga
    // barber (isBarber). Dipakai agar staf merangkap muncul di pilihan barber
    // POS & laporan komisi/rating tanpa akun terpisah.
    const barberEligible = { OR: [{ role: 'barber' }, { isBarber: true }] };

    if (req.user.role === 'kasir' || req.user.role === 'barber') {
      // Kasir and barber can only list barbers in their own branch
      where.tenantId = req.user.tenantId;
      where.branchId = req.user.branchId;
      and.push(barberEligible);
    } else if (req.user.role === 'tenant_admin') {
      where.tenantId = req.user.tenantId;
      if (branchId) where.branchId = branchId;
      if (role === 'barber') and.push(barberEligible);
      else if (role) where.role = role;
    } else {
      // super_admin: full access
      if (tenantId) where.tenantId = tenantId;
      if (branchId) where.branchId = branchId;
      if (role === 'barber') and.push(barberEligible);
      else if (role) where.role = role;
    }

    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      and.push({ OR: [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ] });
    }
    if (and.length) where.AND = and;

    const [data, total] = await Promise.all([
      prisma.user.findMany({ where, select: userSelect, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.user.count({ where }),
    ]);

    res.json({ success: true, data: paginatedResponse(data, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id
router.get('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: userSelect,
    });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // tenant_admin can only view users in same tenant
    if (req.user.role === 'tenant_admin' && user.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// POST /api/users
//
// Auto-generate staff_addon invoice saat tenant tambah staf di atas effective
// quota (mirror pola branch_addon di POST /branches). Effective quota:
//   maxStaff + (paidBranchAddonCount × staffPerExtraBranch)
// Kalau staffAddonPrice = 0 → tidak ada invoice (gratis tanpa batas).
// User tetap dibuat walaupun over kuota — invoice generated supaya tenant
// bisa bayar terpisah (sama dengan branch flow).
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const body = createUserSchema.parse(req.body);

    // tenant_admin can only create users in their tenant
    if (req.user.role === 'tenant_admin') {
      body.tenantId = req.user.tenantId;
      if (body.role === 'super_admin' || body.role === 'tenant_admin') {
        return res.status(403).json({ success: false, error: 'Cannot create admin users' });
      }
    }

    // Password yang dikirim admin (kalau ada) ditampilkan kembali ke admin
    // sekali supaya bisa diberikan ke staf; kalau tidak ada, server generate.
    const plaintextPassword = body.password || generateTempPassword();
    const generated = !body.password;
    const hashedPassword = await bcrypt.hash(plaintextPassword, 10);

    const { user, addonInvoice } = await prisma.$transaction(async (tx) => {
      // Existing user count BEFORE create (soft-deleted excluded)
      const existingCount = body.tenantId
        ? await tx.user.count({ where: { tenantId: body.tenantId, deletedAt: null } })
        : 0;

      let createdUser = await tx.user.create({
        data: { ...body, password: hashedPassword },
        select: userSelect,
      });

      // Cek effective quota (paket + bonus dari cabang add-on paid)
      let invoice = null;
      if (body.tenantId) {
        const subscription = await tx.subscription.findUnique({
          where: { tenantId: body.tenantId },
          select: { id: true, package: true, billingCycle: true, endDate: true },
        });
        if (subscription) {
          const pkg = await tx.package.findUnique({
            where: { name: subscription.package },
            select: { maxStaff: true, staffPerExtraBranch: true, staffAddonPrice: true, staffAddonType: true },
          });
          if (pkg && pkg.staffAddonPrice > 0) {
            // Bonus staf hanya untuk cabang add-on yang lisensinya masih aktif
            // di cycle berjalan (SUM quantity, bukan COUNT cumulative).
            const paidBranchAgg = await tx.invoice.aggregate({
              where: {
                subscriptionId: subscription.id,
                type: 'branch_addon',
                status: 'paid',
                ...buildAddonCycleFilter(subscription),
              },
              _sum: { quantity: true },
            });
            const paidBranchAddons = paidBranchAgg._sum.quantity || 0;
            const effectiveMaxStaff = (pkg.maxStaff || 0) + (paidBranchAddons * (pkg.staffPerExtraBranch || 0));
            // existingCount + 1 = total setelah create. Kalau melebihi quota → addon.
            if ((existingCount + 1) > effectiveMaxStaff) {
              const now = new Date();
              const period = pkg.staffAddonType === 'onetime'
                ? `Staf: ${createdUser.name} (one-time)`
                : `Staf: ${createdUser.name} — ${now.toLocaleString('en-US', { month: 'short', year: 'numeric' })}`;
              invoice = await tx.invoice.create({
                data: {
                  subscriptionId: subscription.id,
                  period,
                  amount: pkg.staffAddonPrice,
                  type: 'staff_addon',
                  status: 'pending',
                  staffUserId: createdUser.id,
                },
              });
              // Kunci staf sampai add-on dibayar: tak bisa login (isActive false)
              // & ditandai lockedPendingAddon. Dibuka otomatis saat invoice lunas
              // (lihat payment.js). Diaktifkan kembali via callback Duitku.
              createdUser = await tx.user.update({
                where: { id: createdUser.id },
                data: { isActive: false, lockedPendingAddon: true },
                select: userSelect,
              });
            }
          }
        }
      }

      return { user: createdUser, addonInvoice: invoice };
    });

    await recordAudit(req, {
      action: 'user.create',
      target: `user:${user.id}`,
      detail: `Staf baru: ${user.name} (${user.role}, ${user.email})${addonInvoice ? ` — staff_addon Rp ${addonInvoice.amount.toLocaleString('id-ID')} pending, akun terkunci sampai dibayar` : ''}`,
      severity: 'info',
      tenantId: user.tenantId,
    });
    emitStaffChanged(user.tenantId, { id: user.id, action: 'create' });
    res.status(201).json({
      success: true,
      data: { ...user, tempPassword: plaintextPassword, passwordGenerated: generated },
      meta: addonInvoice ? { addonInvoice } : undefined,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id
router.put('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'User not found' });

    if (req.user.role === 'tenant_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const body = updateUserSchema.parse(req.body);

    // Staf terkunci karena add-on belum dibayar tak boleh diaktifkan manual —
    // cegah bypass pembayaran. Aktivasi hanya via pelunasan invoice (payment.js).
    if (existing.lockedPendingAddon && body.isActive === true) {
      return res.status(402).json({
        success: false,
        error: 'Staf ini terkunci sampai add-on dibayar. Selesaikan pembayaran untuk mengaktifkan.',
      });
    }

    // tenant_admin TIDAK boleh memindahkan user antar-tenant atau menaikkan ke
    // peran admin (cegah eskalasi hak akses & injeksi akun lintas-tenant).
    // Sejalan dengan guard di handler POST.
    if (req.user.role === 'tenant_admin') {
      delete body.tenantId;
      if (body.role === 'super_admin' || body.role === 'tenant_admin') {
        return res.status(403).json({ success: false, error: 'Cannot assign admin roles' });
      }
    }

    const passwordChanged = !!body.password;

    if (body.password) {
      body.password = await bcrypt.hash(body.password, 10);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: body,
      select: userSelect,
    });

    const changedKeys = Object.keys(body).filter(k => k !== 'password');
    if (passwordChanged) changedKeys.push('password');
    await recordAudit(req, {
      action: 'user.update',
      target: `user:${user.id}`,
      detail: `Edit staf: ${user.name}${changedKeys.length ? ` (${changedKeys.join(', ')})` : ''}`,
      severity: passwordChanged ? 'warning' : 'info',
      tenantId: user.tenantId,
    });
    emitStaffChanged(user.tenantId, { id: user.id, action: 'update' });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/:id/reset-password — set password baru (kustom / otomatis), return sekali
router.post('/:id/reset-password', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Password minimal 6 karakter' });
    }

    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'User not found' });

    if (req.user.role === 'tenant_admin') {
      if (existing.tenantId !== req.user.tenantId) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      // Tenant admin tidak boleh me-reset password admin tenant lain atau super_admin
      if (existing.role === 'super_admin' || existing.role === 'tenant_admin') {
        return res.status(403).json({ success: false, error: 'Cannot reset admin password' });
      }
    }

    const customPw = parsed.data.password?.trim();
    const isCustom = !!customPw;
    const newPassword = isCustom ? customPw : generateTempPassword();
    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: existing.id },
      data: { password: hashed },
    });

    // Sekaligus invalidate refresh token aktif supaya sesi lama otomatis logout
    await prisma.refreshToken.deleteMany({ where: { userId: existing.id } });

    await recordAudit(req, {
      action: 'user.password_reset',
      target: `user:${existing.id}`,
      detail: `Reset password: ${existing.name} (${existing.email})${isCustom ? ' — kustom' : ' — otomatis'}`,
      severity: 'warning',
      tenantId: existing.tenantId,
    });
    emitStaffChanged(existing.tenantId, { id: existing.id, action: 'password_reset' });
    res.json({
      success: true,
      data: {
        userId: existing.id,
        email: existing.email,
        name: existing.name,
        tempPassword: newPassword,
        custom: isCustom,
      },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id (soft delete)
router.delete('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'User not found' });

    if (req.user.role === 'tenant_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await prisma.user.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    await recordAudit(req, {
      action: 'user.delete',
      target: `user:${existing.id}`,
      detail: `Hapus staf: ${existing.name} (${existing.email})`,
      severity: 'warning',
      tenantId: existing.tenantId,
    });
    emitStaffChanged(existing.tenantId, { id: existing.id, action: 'delete' });
    res.json({ success: true, data: { message: 'User deleted successfully' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
