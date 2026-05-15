const router = require('express').Router();
const { z }  = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

// Setting keys for hero / branding text. Disimpan sebagai SystemSetting biar
// editable real-time tanpa migrasi schema.
const SETTING_KEYS = {
  heroTitle:    'landing_hero_title',
  heroSubtitle: 'landing_hero_subtitle',
  heroCtaLabel: 'landing_hero_cta',
  showStats:    'landing_show_stats',
  brandTagline: 'landing_brand_tagline',
  whatsappCta:  'landing_whatsapp_cta', // nomor WA buat tombol "konsultasi"
  features:     'landing_features',     // JSON-encoded array
};

const DEFAULTS = {
  heroTitle:    'Sistem Manajemen Barbershop yang Profesional',
  heroSubtitle: 'Kasir, antrian, booking online, multi-cabang, & laporan pintar — semua dalam satu aplikasi yang dirancang khusus untuk barbershop modern.',
  heroCtaLabel: 'Mulai Uji Coba Gratis',
  showStats:    'true',
  brandTagline: 'Dipercaya barbershop di seluruh Indonesia',
  whatsappCta:  '',
  features: JSON.stringify([
    { icon: 'Scissors',     title: 'POS Khusus Barbershop', desc: 'Kasir cepat dengan layanan, produk, voucher & komisi barber otomatis.' },
    { icon: 'Users',        title: 'Antrian Walk-in & Booking', desc: 'Customer bisa booking online lewat link tenant Anda — tanpa aplikasi tambahan.' },
    { icon: 'Building2',    title: 'Multi-Cabang Terpusat', desc: 'Pantau semua cabang dalam satu dashboard, bandingkan kinerja real-time.' },
    { icon: 'BarChart3',    title: 'Laporan & Analitik',    desc: 'Omzet harian, layanan terlaris, performa barber, semua otomatis.' },
    { icon: 'MessageCircle',title: 'Notifikasi WhatsApp',   desc: 'Konfirmasi booking & struk transaksi otomatis dikirim ke pelanggan.' },
    { icon: 'Shield',       title: 'Multi-Role & Aman',     desc: 'Owner, kasir, barber, customer — masing-masing punya akses sendiri.' },
  ]),
};

async function getSetting(key) {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[Object.keys(SETTING_KEYS).find(k => SETTING_KEYS[k] === key)];
}
async function setSetting(key, value) {
  return prisma.systemSetting.upsert({
    where:  { key },
    update: { value: String(value) },
    create: { key, value: String(value) },
  });
}

async function getAllHero() {
  const out = {};
  for (const [name, key] of Object.entries(SETTING_KEYS)) {
    out[name] = await getSetting(key);
  }
  // Parse features JSON
  try {
    out.features = JSON.parse(out.features);
  } catch { out.features = []; }
  out.showStats = out.showStats === 'true';
  return out;
}

// ── Public read endpoint ──────────────────────────────────────────────────

// GET /api/landing — semua konten landing untuk render publik
router.get('/', async (req, res, next) => {
  try {
    // Stats selalu dihitung — frontend yang memutuskan tampil-atau-tidak
    // berdasarkan hero.showStats (lebih murah daripada double-await).
    const [hero, testimonials, faqs, packages, stats] = await Promise.all([
      getAllHero(),
      prisma.landingTestimonial.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.landingFAQ.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.package.findMany({ orderBy: { price: 'asc' } }),
      computeStats(),
    ]);

    res.json({
      success: true,
      data: { hero, testimonials, faqs, packages, stats },
    });
  } catch (err) { next(err); }
});

async function computeStats() {
  const [tenantCount, transactionCount, branchCount, customerCount] = await Promise.all([
    prisma.tenant.count({ where: { deletedAt: null, isSuspended: false } }),
    prisma.transaction.count({ where: { status: 'completed' } }),
    prisma.branch.count({ where: { isActive: true, deletedAt: null } }),
    prisma.customer.count({ where: { deletedAt: null } }),
  ]);
  return { tenantCount, transactionCount, branchCount, customerCount };
}

// ── Super-admin write endpoints ───────────────────────────────────────────

const heroUpdateSchema = z.object({
  heroTitle:    z.string().max(200).optional(),
  heroSubtitle: z.string().max(500).optional(),
  heroCtaLabel: z.string().max(50).optional(),
  brandTagline: z.string().max(200).optional(),
  whatsappCta:  z.string().max(20).optional(),
  showStats:    z.boolean().optional(),
  features:     z.array(z.object({
    icon:  z.string().max(40),
    title: z.string().max(120),
    desc:  z.string().max(400),
  })).optional(),
});

// PATCH /api/landing/hero — super_admin update branding/hero
router.patch('/hero', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const body = heroUpdateSchema.parse(req.body);
    for (const [field, value] of Object.entries(body)) {
      const key = SETTING_KEYS[field];
      if (!key) continue;
      const v = field === 'features' ? JSON.stringify(value) : value;
      await setSetting(key, v);
    }
    res.json({ success: true, data: await getAllHero() });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// ── Testimonials CRUD ─────────────────────────────────────────────────────

const testimonialSchema = z.object({
  name:         z.string().min(1).max(150),
  role:         z.string().max(150).nullish(),
  businessName: z.string().max(200).nullish(),
  message:      z.string().min(5).max(1000),
  rating:       z.number().int().min(1).max(5).default(5),
  photoUrl:     z.string().nullish(),
  displayOrder: z.number().int().default(0),
  isActive:     z.boolean().default(true),
});

router.get('/testimonials', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const data = await prisma.landingTestimonial.findMany({ orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }] });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});
router.post('/testimonials', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const body = testimonialSchema.parse(req.body);
    const data = await prisma.landingTestimonial.create({ data: body });
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});
router.put('/testimonials/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const body = testimonialSchema.partial().parse(req.body);
    const data = await prisma.landingTestimonial.update({ where: { id: req.params.id }, data: body });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});
router.delete('/testimonials/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    await prisma.landingTestimonial.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── FAQs CRUD ─────────────────────────────────────────────────────────────

const faqSchema = z.object({
  question:     z.string().min(3).max(300),
  answer:       z.string().min(3).max(2000),
  displayOrder: z.number().int().default(0),
  isActive:     z.boolean().default(true),
});

router.get('/faqs', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const data = await prisma.landingFAQ.findMany({ orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }] });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});
router.post('/faqs', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const body = faqSchema.parse(req.body);
    const data = await prisma.landingFAQ.create({ data: body });
    res.status(201).json({ success: true, data });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});
router.put('/faqs/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const body = faqSchema.partial().parse(req.body);
    const data = await prisma.landingFAQ.update({ where: { id: req.params.id }, data: body });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});
router.delete('/faqs/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    await prisma.landingFAQ.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
