const router = require('express').Router();
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { isValidTimezone, DEFAULT_TZ, SUPPORTED_TIMEZONES } = require('../utils/timezone');
const { getIO, tenantRoom, userRoom } = require('../config/socket');
const { recordAudit } = require('../utils/auditLog');
const { seedTenantFlags } = require('../services/featureFlagSync');
const { invalidateTenantCache } = require('../middleware/tenantResolver');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const tzSchema = z.string().refine(isValidTimezone, {
  message: 'Invalid IANA timezone string',
});

// Lookup paket dari DB — fallback ke angka default kalau row tidak ada
async function getPackagePrice(packageName) {
  const pkg = await prisma.package.findUnique({
    where: { name: packageName },
    select: { price: true },
  });
  if (pkg) return pkg.price;
  // Fallback kalau seed belum ter-apply
  const FALLBACK = { Basic: 299000, Pro: 599000, Enterprise: 1299000 };
  return FALLBACK[packageName] ?? 0;
}

const tenantSelect = {
  id: true,
  name: true,
  slug: true,
  email: true,
  phone: true,
  address: true,
  logo: true,
  companyName: true,
  npwp: true,
  taxAddress: true,
  timezone: true,
  bookingPage: true,
  wilayah: true,
  transactionMessages: true,
  visitReminder: true,
  attendanceConfig: true,
  shiftPresets: true,
  ratingConfig: true,
  receiptSettings: true,
  loyaltyConfig: true,
  isSuspended: true,
  createdAt: true,
  updatedAt: true,
  // Hitung hanya entitas yang belum di-soft-delete supaya angka "Cabang"/"Staf"
  // di super-admin konsisten dengan daftar nyata (yang memfilter deletedAt:null).
  // Tanpa filter, cabang/staf yang sudah dihapus ikut terhitung → angka inflated.
  _count: { select: { branches: { where: { deletedAt: null } }, users: { where: { deletedAt: null } } } },
  subscription: {
    select: { package: true, status: true, endDate: true, price: true, autoRenew: true },
  },
};

// Shared slug validator — lowercase letters, numbers, hyphens only
const slugSchema = z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug may contain only lowercase letters, numbers, and hyphens');

const createTenantSchema = z.object({
  name: z.string().min(1).max(255),
  slug: slugSchema,
  // Lowercase+trim agar seragam dengan login yang case-insensitive.
  email: z.string().email().transform(e => e.trim().toLowerCase()).optional(),
  ownerEmail: z.string().email().transform(e => e.trim().toLowerCase()).optional(),
  ownerName: z.string().min(1).optional(),
  ownerPassword: z.string().min(8).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  logo: z.string().optional(),
  timezone: tzSchema.optional(),
  package: z.enum(['Basic', 'Pro', 'Enterprise']).optional(),
}).refine(
  (v) => !!(v.email || v.ownerEmail),
  { message: 'email or ownerEmail is required', path: ['email'] }
);

const updateTenantSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: slugSchema.optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  logo: z.string().optional(),
  // Tax / billing identity
  companyName: z.string().max(255).nullish(),
  npwp: z.string().max(50).nullish(),
  taxAddress: z.string().max(500).nullish(),
  timezone: tzSchema.optional(),
  isSuspended: z.boolean().optional(),
  package: z.enum(['Basic', 'Pro', 'Enterprise']).optional(),
});

// Revenue this month per tenant (sum Transaction.total via branch.tenantId)
async function computeMonthlyRevenue(tenantIds) {
  if (!tenantIds.length) return {};
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const rows = await prisma.transaction.findMany({
    where: {
      status: 'completed',
      createdAt: { gte: start },
      branch: { tenantId: { in: tenantIds } },
    },
    select: { total: true, branch: { select: { tenantId: true } } },
  });
  const map = {};
  for (const r of rows) {
    const tid = r.branch.tenantId;
    map[tid] = (map[tid] || 0) + r.total;
  }
  return map;
}

function mapPrismaError(err) {
  if (err?.code === 'P2002') {
    const target = err.meta?.target || [];
    const field = Array.isArray(target) ? target.join(', ') : String(target);
    return { status: 409, error: `Duplicate value on ${field}` };
  }
  return null;
}

// Seeding flag default per paket dipindah ke services/featureFlagSync.js
// (`seedTenantFlags`) supaya dipakai bersama oleh super-admin create-tenant
// dan self-service /register — satu sumber kebenaran.

// GET /api/tenants/timezones — public; daftar IANA timezone yang didukung untuk selector.
router.get('/timezones', (req, res) => {
  res.json({ success: true, data: SUPPORTED_TIMEZONES });
});

// GET /api/tenants/resolve — public; returns basic tenant info from X-Tenant-Slug / subdomain
router.get('/resolve', async (req, res) => {
  if (!req.tenant) {
    return res.status(404).json({ success: false, error: 'Tenant not found' });
  }
  res.json({
    success: true,
    data: {
      id: req.tenant.id,
      name: req.tenant.name,
      slug: req.tenant.slug,
      logo: req.tenant.logo || null,
      timezone: req.tenant.timezone || DEFAULT_TZ,
      isSuspended: req.tenant.isSuspended,
    },
  });
});

// GET /api/tenants
router.get('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, isSuspended } = req.query;

    const where = { deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (isSuspended !== undefined) where.isSuspended = isSuspended === 'true';

    const [data, total] = await Promise.all([
      prisma.tenant.findMany({ where, select: tenantSelect, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.tenant.count({ where }),
    ]);

    const revenues = await computeMonthlyRevenue(data.map((t) => t.id));
    const enriched = data.map((t) => ({ ...t, monthlyRevenue: revenues[t.id] || 0 }));

    res.json({ success: true, data: paginatedResponse(enriched, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.role !== 'tenant_admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    if (req.user.role === 'tenant_admin' && req.user.tenantId !== req.params.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const tenant = await prisma.tenant.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: tenantSelect,
    });

    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const revenues = await computeMonthlyRevenue([tenant.id]);
    res.json({ success: true, data: { ...tenant, monthlyRevenue: revenues[tenant.id] || 0 } });
  } catch (err) {
    next(err);
  }
});

// POST /api/tenants — creates tenant + subscription + optional owner user in one transaction
router.post('/', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const body = createTenantSchema.parse(req.body);
    const primaryEmail = body.email || body.ownerEmail;
    const packageName = body.package || 'Basic';
    const price = await getPackagePrice(packageName);

    // Pre-check duplicates to return 409 with useful message
    const conflict = await prisma.tenant.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { email: { equals: primaryEmail, mode: 'insensitive' } },
          body.slug ? { slug: body.slug } : undefined,
        ].filter(Boolean),
      },
      select: { id: true, email: true, slug: true },
    });
    if (conflict) {
      const field = conflict.email?.toLowerCase() === primaryEmail?.toLowerCase() ? 'email' : 'slug';
      return res.status(409).json({ success: false, error: `Tenant with this ${field} already exists` });
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 14); // 14-day trial

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: body.name,
          slug: body.slug || null,
          email: primaryEmail,
          phone: body.phone || null,
          address: body.address || null,
          logo: body.logo || null,
          timezone: body.timezone || DEFAULT_TZ,
        },
        select: tenantSelect,
      });

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          package: packageName,
          status: 'trial',
          price,
          startDate: now,
          endDate,
          autoRenew: true,
        },
      });

      // Create owner admin user if ownerEmail supplied
      if (body.ownerEmail) {
        const passwordHash = await bcrypt.hash(body.ownerPassword || 'ChangeMe123!', 10);
        await tx.user.create({
          data: {
            email: body.ownerEmail,
            password: passwordHash,
            name: body.ownerName || tenant.name + ' Admin',
            role: 'tenant_admin',
            tenantId: tenant.id,
            isActive: true,
          },
        });
      }

      // Seed default feature flags so the tenant's UI has a sensible baseline
      // immediately. Super-admin can adjust later via /super-admin/feature-flags.
      await seedTenantFlags(tx, tenant.id, packageName);

      // Re-fetch with subscription included in select
      return tx.tenant.findUnique({ where: { id: tenant.id }, select: tenantSelect });
    });

    await recordAudit(req, {
      action: 'tenant.create',
      target: `tenant:${result.id}`,
      detail: `${result.name} (${packageName}) — ${primaryEmail}`,
      severity: 'success',
    });

    res.status(201).json({ success: true, data: { ...result, monthlyRevenue: 0 } });
  } catch (err) {
    const mapped = mapPrismaError(err);
    if (mapped) return res.status(mapped.status).json({ success: false, error: mapped.error });
    next(err);
  }
});

// PATCH /api/tenants/me — tenant_admin update profil tenant sendiri (non-sensitive fields).
// Tidak mengubah package / suspend / slug — itu wewenang super_admin.
// Konfigurasi booking page — semua opsional & ringan agar tenant bisa
// inkremental customize tanpa wajib mengisi semuanya. Ukuran image dibatasi
// supaya payload tidak meledak (~1.5MB per image base64).
const MAX_IMAGE_LEN = 2_000_000; // ≈1.5 MB base64
const bookingPageSchema = z.object({
  tagline:        z.string().max(140).nullish(),
  description:    z.string().max(2000).nullish(),
  heroImage:      z.string().max(MAX_IMAGE_LEN).nullish(),
  showLogo:       z.boolean().optional(),
  showHero:       z.boolean().optional(),
  showGallery:    z.boolean().optional(),
  showAddress:    z.boolean().optional(),
  showHours:      z.boolean().optional(),
  showSocial:     z.boolean().optional(),
  // 'dark' = default luxury black, 'light' = clean white surface.
  mode:           z.enum(['dark', 'light']).optional(),
  primaryColor:   z.string().regex(/^#?[0-9a-fA-F]{6}$/).nullish(),
  gallery:        z.array(z.string().max(MAX_IMAGE_LEN)).max(12).optional(),
  instagram:      z.string().max(80).nullish(),
  tiktok:         z.string().max(80).nullish(),
  facebook:       z.string().max(200).nullish(),
  whatsapp:       z.string().max(40).nullish(),
  googleMapsUrl:  z.string().url().max(500).nullish().or(z.literal('')),
  testimonials:   z.array(z.object({
    name:   z.string().max(100),
    text:   z.string().max(500),
    rating: z.number().int().min(1).max(5).optional(),
  })).max(20).optional(),
}).strict().nullish();

// Wilayah fokus toko — provinsi & kabupaten/kota acuan. Kecamatan & desa
// tidak disimpan di sini; itu per-pelanggan.
const wilayahSchema = z.object({
  provinsiId:  z.string().max(10).nullish(),
  provinsi:    z.string().max(100).nullish(),
  kabupatenId: z.string().max(10).nullish(),
  kabupaten:   z.string().max(120).nullish(),
}).strict().nullish();

// Teks/pesan otomatis setelah transaksi. Dibatasi panjangnya supaya pesan WA
// tetap ringkas; placeholder {nama}/{toko} di-render saat pengiriman.
const transactionMessagesSchema = z.object({
  waCustomerMessage: z.string().max(500).nullish(),
  waShareMessage:    z.string().max(500).nullish(),
}).strict().nullish();

// Pengingat kunjungan otomatis via WhatsApp. inactiveDays = ambang hari tanpa
// kunjungan; repeat = kirim ulang tiap ambang vs sekali; sendHour = jam (zona
// waktu tenant) job dijalankan; message mendukung {nama} {toko} {hari}.
const visitReminderSchema = z.object({
  enabled:      z.boolean().optional(),
  inactiveDays: z.number().int().min(1).max(365).optional(),
  repeat:       z.boolean().optional(),
  sendHour:     z.number().int().min(0).max(23).optional(),
  // Jeda acak antar pesan (detik) — anti-blokir WhatsApp.
  minDelaySec:  z.number().int().min(1).max(600).optional(),
  maxDelaySec:  z.number().int().min(1).max(600).optional(),
  message:      z.string().max(600).nullish(),
}).strict().nullish();

// Konfigurasi absensi digital. lateToleranceMin = toleransi menit sebelum
// dihitung terlambat; autoCheckOut = job menutup absen yang lupa di-checkout.
const attendanceConfigSchema = z.object({
  enabled:          z.boolean().optional(),
  lateToleranceMin: z.number().int().min(0).max(120).optional(),
  autoCheckOut:     z.boolean().optional(),
  maxAccuracyM:     z.number().int().min(20).max(500).optional(),
  requireSelfie:    z.boolean().optional(),
}).strict().nullish();

// Preset shift untuk /admin/schedule: label + jam mulai/akhir. Maks 6 preset.
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Format jam HH:MM');
const shiftPresetsSchema = z.array(z.object({
  value:     z.string().trim().min(1).max(20),
  startTime: hhmm,
  endTime:   hhmm,
}).strict()).max(6).nullish();

// Konfigurasi rating otomatis via WhatsApp setelah transaksi.
// autoSendMinutes 1..1440 (1 menit – 1 hari). Template max 2000 char.
const ratingConfigSchema = z.object({
  enabled:         z.boolean().default(false),
  autoSendMinutes: z.number().int().min(1).max(1440).default(15),
  messageTemplate: z.string().trim().max(2000).optional().nullable(),
}).strict().nullish();

// Pengaturan cetak struk kasir. footer max 500 char (placeholder {toko});
// paperWidth dibatasi ke lebar printer thermal umum (58/80mm).
const receiptSettingsSchema = z.object({
  footer:     z.string().max(500).nullish(),
  paperWidth: z.union([z.literal(58), z.literal(80)]).optional(),
  showLogo:   z.boolean().optional(),
}).strict().nullish();

// Konfigurasi sistem poin loyalti per-tenant. Batas atas wajar supaya tak ada
// nilai ekstrem yang merusak ekonomi poin / kalkulasi.
const loyaltyConfigSchema = z.object({
  enabled:              z.boolean().optional(),
  earnRupiahPerPoint:   z.number().int().min(1).max(100_000_000).optional(),
  redeemRupiahPerPoint: z.number().int().min(1).max(1_000_000).optional(),
  minRedeemPoints:      z.number().int().min(1).max(1_000_000).optional(),
  maxRedeemPercent:     z.number().int().min(1).max(100).optional(),
}).strict().nullish();

const selfUpdateSchema = z.object({
  name:        z.string().min(1).max(255).optional(),
  phone:       z.string().max(50).nullish(),
  address:     z.string().max(500).nullish(),
  logo:        z.string().nullish(),
  companyName: z.string().max(255).nullish(),
  npwp:        z.string().max(50).nullish(),
  taxAddress:  z.string().max(500).nullish(),
  timezone:    tzSchema.optional(),
  bookingPage: bookingPageSchema,
  wilayah:     wilayahSchema,
  transactionMessages: transactionMessagesSchema,
  visitReminder: visitReminderSchema,
  attendanceConfig: attendanceConfigSchema,
  shiftPresets: shiftPresetsSchema,
  ratingConfig: ratingConfigSchema,
  receiptSettings: receiptSettingsSchema,
  loyaltyConfig: loyaltyConfigSchema,
});
// ── Upload gambar tenant (hero & galeri halaman booking) ───────────────────────
// Gambar disimpan sebagai FILE di disk, bukan base64 di JSON tenant — supaya
// payload `bookingPage` tetap kecil & tak menabrak limit body request.
const TENANT_UPLOAD_DIR = path.join(__dirname, '../../uploads/tenant');
fs.mkdirSync(TENANT_UPLOAD_DIR, { recursive: true });

const ALLOWED_IMG_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const uploadTenantImage = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, TENANT_UPLOAD_DIR),
    filename:    (req, file, cb) => {
      // Ekstensi dari MIME tervalidasi, BUKAN nama file klien — cegah simpan
      // nama .html/.svg yang lalu disajikan inline (stored-XSS). fileFilter
      // di bawah sudah membatasi mimetype ke daftar gambar.
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[file.mimetype] || '.jpg';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMG_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format gambar harus JPG, PNG, WebP, atau GIF'));
  },
}).single('image');

// POST /api/tenants/upload-image — unggah satu gambar, balas URL publiknya.
router.post('/upload-image', authenticate, requireRole('tenant_admin', 'super_admin'), (req, res) => {
  uploadTenantImage(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran gambar maksimal 5 MB' : err.message;
      return res.status(400).json({ success: false, error: msg });
    }
    if (!req.file) return res.status(400).json({ success: false, error: 'File gambar wajib diunggah (field "image")' });
    res.json({ success: true, data: { url: `/api/uploads/tenant/${req.file.filename}` } });
  });
});

router.patch('/me', authenticate, requireRole('tenant_admin', 'super_admin'), async (req, res, next) => {
  try {
    const tenantId = req.user.role === 'super_admin' ? req.body.tenantId : req.user.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const before = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true, ratingConfig: true },
    });
    const body = selfUpdateSchema.parse(req.body);
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: body,
      select: tenantSelect,
    });

    invalidateTenantCache(tenant.slug);

    // Aktivasi pertama kali "Rating Otomatis": cegah spam dengan menandai semua
    // transaksi lama yang belum punya `ratingLinkSentAt` sebagai sudah dikirim.
    // Tanpa ini, cron berikutnya akan blast link rating ke pelanggan dari 24 jam
    // terakhir. Hanya transaksi yang BARU completed setelah toggle ON yang
    // boleh menerima link.
    if (body.ratingConfig !== undefined) {
      const wasEnabled = !!(before?.ratingConfig && before.ratingConfig.enabled);
      const nowEnabled = !!(body.ratingConfig && body.ratingConfig.enabled);
      if (nowEnabled && !wasEnabled) {
        const stampedAt = new Date();
        try {
          const r = await prisma.transaction.updateMany({
            where: {
              tenantId,
              status: 'completed',
              ratingLinkSentAt: null,
              createdAt: { lt: stampedAt },
            },
            data: { ratingLinkSentAt: stampedAt },
          });
          if (r.count > 0) {
            console.log(`[RatingLink] Aktivasi tenant=${tenantId}: ${r.count} transaksi lama di-skip dari antrian`);
          }
        } catch (err) {
          console.error(`[RatingLink] Gagal backfill saat aktivasi tenant=${tenantId}:`, err.message);
        }
      }
    }

    const io = getIO();
    if (io && body.timezone && body.timezone !== before?.timezone) {
      io.to(tenantRoom(tenant.id)).emit('tenant:updated', {
        id: tenant.id,
        timezone: tenant.timezone,
      });
    }

    // Audit log — supaya tab Log Aktivitas /admin/settings menerima entri
    // realtime tiap kali tenant_admin simpan pengaturan. Ringkas: satu entri per
    // PATCH, detail menyebut bagian yang diubah supaya bermakna tanpa spam.
    const sectionMap = {
      ratingConfig:        'Rating Otomatis',
      visitReminder:       'Pengingat Kunjungan',
      attendanceConfig:    'Absensi',
      transactionMessages: 'Pesan Transaksi',
      shiftPresets:        'Preset Shift',
      bookingPage:         'Halaman Booking',
      wilayah:             'Wilayah',
      timezone:            'Zona Waktu',
      logo:                'Logo',
    };
    const identityKeys = ['name', 'phone', 'address', 'companyName', 'npwp', 'taxAddress'];
    const sections = [];
    for (const [k, label] of Object.entries(sectionMap)) {
      if (body[k] !== undefined) sections.push(label);
    }
    if (identityKeys.some(k => body[k] !== undefined)) sections.push('Identitas Toko');

    // Sebutkan transisi enabled Rating Otomatis biar log informatif.
    let ratingToggleNote = '';
    if (body.ratingConfig !== undefined) {
      const was = !!(before?.ratingConfig && before.ratingConfig.enabled);
      const now = !!(body.ratingConfig && body.ratingConfig.enabled);
      if (was !== now) ratingToggleNote = now ? ' — Rating Otomatis: AKTIF' : ' — Rating Otomatis: NONAKTIF';
    }

    if (sections.length > 0) {
      await recordAudit(req, {
        action: 'tenant.settings_update',
        target: `tenant:${tenant.id}`,
        detail: `Memperbarui pengaturan: ${sections.join(', ')}${ratingToggleNote}`,
        severity: 'info',
      });
    }

    res.json({ success: true, data: tenant });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// PUT /api/tenants/:id — partial update; also handles package change (upsert subscription)
router.put('/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.tenant.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const body = updateTenantSchema.parse(req.body);

    // Detect conflict before mutating
    const uniqueChecks = [];
    if (body.email && body.email !== existing.email) uniqueChecks.push({ email: body.email });
    if (body.slug && body.slug !== existing.slug)   uniqueChecks.push({ slug: body.slug });
    if (uniqueChecks.length) {
      const conflict = await prisma.tenant.findFirst({
        where: { deletedAt: null, id: { not: existing.id }, OR: uniqueChecks },
        select: { id: true, email: true, slug: true },
      });
      if (conflict) {
        const field = body.email && conflict.email === body.email ? 'email' : 'slug';
        return res.status(409).json({ success: false, error: `Another tenant already uses this ${field}` });
      }
    }

    const { package: packageName, ...tenantFields } = body;

    const tenant = await prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id: req.params.id },
        data: tenantFields,
        select: tenantSelect,
      });

      if (packageName) {
        const price = await getPackagePrice(packageName);
        await tx.subscription.upsert({
          where: { tenantId: req.params.id },
          update: { package: packageName, price },
          create: {
            tenantId: req.params.id,
            package: packageName,
            status: 'trial',
            price,
            startDate: new Date(),
            endDate: new Date(Date.now() + 14 * 86400 * 1000),
            autoRenew: true,
          },
        });
      }

      return tx.tenant.findUnique({ where: { id: req.params.id }, select: tenantSelect });
    });

    // Slug bisa berubah — invalidate baik slug lama (existing) maupun yang baru
    // supaya tenantResolver tidak memakai data basi.
    invalidateTenantCache(existing.slug);
    if (tenant.slug && tenant.slug !== existing.slug) invalidateTenantCache(tenant.slug);

    // Notifikasi real-time bila ada perubahan signifikan (suspend / timezone).
    const io = getIO();
    if (io) {
      const significantChange =
        (body.isSuspended !== undefined && body.isSuspended !== existing.isSuspended) ||
        (body.timezone && body.timezone !== existing.timezone);
      if (significantChange) {
        io.to(tenantRoom(tenant.id)).emit('tenant:updated', {
          id: tenant.id,
          isSuspended: tenant.isSuspended,
          timezone: tenant.timezone,
        });
      }
    }

    if (packageName) {
      await recordAudit(req, {
        action: 'tenant.package.change',
        target: `tenant:${tenant.id}`,
        detail: `${tenant.name} → ${packageName}`,
        severity: 'success',
      });
    }
    if (body.isSuspended !== undefined && body.isSuspended !== existing.isSuspended) {
      await recordAudit(req, {
        action: tenant.isSuspended ? 'tenant.suspend' : 'tenant.activate',
        target: `tenant:${tenant.id}`,
        detail: `${tenant.name}`,
        severity: tenant.isSuspended ? 'error' : 'success',
      });
    }

    const revenues = await computeMonthlyRevenue([tenant.id]);
    res.json({ success: true, data: { ...tenant, monthlyRevenue: revenues[tenant.id] || 0 } });
  } catch (err) {
    const mapped = mapPrismaError(err);
    if (mapped) return res.status(mapped.status).json({ success: false, error: mapped.error });
    next(err);
  }
});

// PATCH /api/tenants/:id/suspend — toggle suspension
router.patch('/:id/suspend', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const updated = await prisma.tenant.update({
      where: { id: req.params.id },
      data: { isSuspended: !tenant.isSuspended },
      select: tenantSelect,
    });

    invalidateTenantCache(updated.slug);

    // Notify users di tenant ini bahwa status berubah, supaya UI mereka refresh
    // (atau auto-logout kalau di-suspend) tanpa nunggu request berikutnya.
    const io = getIO();
    if (io) {
      io.to(tenantRoom(updated.id)).emit('tenant:status-changed', {
        id: updated.id,
        isSuspended: updated.isSuspended,
        name: updated.name,
      });
    }

    await recordAudit(req, {
      action: updated.isSuspended ? 'tenant.suspend' : 'tenant.activate',
      target: `tenant:${updated.id}`,
      detail: `${updated.name}`,
      severity: updated.isSuspended ? 'error' : 'success',
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/tenants/:id/reset-password — set / reset password akun owner tenant
router.post('/:id/reset-password', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const { newPassword } = req.body;
    const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
    const plain = newPassword && newPassword.length >= 8
      ? newPassword
      : Array.from({ length: 12 }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]).join('');

    // orderBy createdAt asc → selalu pilih owner asli (tenant_admin tertua) bila
    // tenant punya >1 admin, supaya reset deterministik & tak salah akun.
    const owner = await prisma.user.findFirst({
      where: { tenantId: req.params.id, role: 'tenant_admin', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    });
    if (!owner) return res.status(404).json({ success: false, error: 'Owner user not found for this tenant' });

    const hash = await bcrypt.hash(plain, 10);
    await prisma.user.update({
      where: { id: owner.id },
      data: { password: hash },
    });

    await recordAudit(req, {
      action: 'tenant.password.reset',
      target: `tenant:${tenant.id}`,
      detail: `Owner ${owner.email} password reset`,
      severity: 'warning',
    });

    res.json({ success: true, data: { email: owner.email, password: plain } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tenants/:id (soft delete)
router.delete('/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.tenant.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Tenant not found' });

    await prisma.tenant.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    invalidateTenantCache(existing.slug);

    // Lepas device WhatsApp tenant dari WA Gateway agar tidak jadi device
    // hantu yang menumpuk & memakan kuota plan. Best-effort — kegagalan di
    // sini tidak boleh menggagalkan penghapusan tenant.
    require('../services/whatsappService')
      .removeTenantDevice(existing.id)
      .catch((err) => console.error(`[WA] cleanup device tenant=${existing.id} gagal:`, err.message));

    await recordAudit(req, {
      action: 'tenant.delete',
      target: `tenant:${existing.id}`,
      detail: `${existing.name} (${existing.email}) — soft delete`,
      severity: 'error',
    });

    // Realtime: tenant hilang → halaman SA (dashboard/tenants/billing) refresh, dan
    // bila tenant ini rujukan affiliate, beri tahu affiliatenya supaya hilang dari
    // daftar rujukan miliknya tanpa reload. Baris referral TIDAK dihapus (histori
    // komisi utuh) — hanya disembunyikan via filter tenant.deletedAt di endpoint.
    try {
      const io = getIO();
      if (io) {
        io.emit('tenant:updated', { tenantId: existing.id, deleted: true });
        io.to('support').emit('tenant:status-changed', { tenantId: existing.id, deleted: true });
        const ref = await prisma.affiliateReferral.findUnique({
          where: { tenantId: existing.id },
          include: { affiliate: { select: { userId: true } } },
        });
        if (ref?.affiliate?.userId) {
          io.to(userRoom(ref.affiliate.userId)).emit('affiliate:referral_updated', { tenantId: existing.id, deleted: true });
        }
      }
    } catch { /* observability — never block delete */ }

    res.json({ success: true, data: { message: 'Tenant deleted successfully' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
