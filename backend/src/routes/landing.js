const router = require('express').Router();
const { z }  = require('zod');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { getIO } = require('../config/socket');

// Broadcast ke pengunjung yang sedang membuka landing supaya kontennya segar
// tanpa reload — sejalan dengan `package:updated` di routes/packages.js.
function emitLandingUpdate() {
  const io = getIO();
  if (io) io.emit('landing:updated');
}

// Setting keys for hero / branding text. Disimpan sebagai SystemSetting biar
// editable real-time tanpa migrasi schema.
const SETTING_KEYS = {
  heroTitle:    'landing_hero_title',
  heroSubtitle: 'landing_hero_subtitle',
  heroCtaLabel: 'landing_hero_cta',
  showStats:    'landing_show_stats',
  brandTagline: 'landing_brand_tagline',
  whatsappCta:  'landing_whatsapp_cta', // nomor WA buat tombol "konsultasi"
  heroBadge:    'landing_hero_badge',   // teks pil "Baru" di atas judul
  footerText:   'landing_footer_text',  // deskripsi singkat di footer
  features:     'landing_features',     // JSON: array fitur
  trustItems:   'landing_trust_items',  // JSON: array string trust-line hero
  steps:        'landing_steps',        // JSON: array {title,desc} "cara mulai"
  sections:     'landing_sections',     // JSON: heading per-section
  closingCta:   'landing_closing_cta',  // JSON: {title,subtitle,ctaLabel}
};

// Keys yang nilainya JSON-encoded — di-parse saat baca, di-stringify saat tulis.
const JSON_KEYS = ['features', 'trustItems', 'steps', 'sections', 'closingCta'];

const DEFAULTS = {
  heroTitle:    'Kelola barbershop, tanpa ribet.',
  heroSubtitle: 'Kasir, antrian, booking online, sampai laporan pemilik — semua jadi satu aplikasi. Tinggal pakai, langsung jalan hari ini juga.',
  heroCtaLabel: 'Coba Gratis 14 Hari',
  showStats:    'true',
  brandTagline: 'Dipercaya barbershop di seluruh Indonesia',
  whatsappCta:  '',
  heroBadge:    'Baru',
  footerText:   'Sistem manajemen barbershop modern: kasir, antrian, booking online, multi-cabang, dan laporan pintar dalam satu aplikasi.',
  features: JSON.stringify([
    { icon: 'Scissors',      title: 'Kasir khusus barbershop', desc: 'Catat layanan, produk, sampai komisi barber sekali tap. Cepat, antrean nggak numpuk.' },
    { icon: 'CalendarClock', title: 'Booking & antrian online', desc: 'Pelanggan booking sendiri lewat link toko. Giliran rapi, nggak ada rebutan.' },
    { icon: 'Building2',     title: 'Banyak cabang, satu layar', desc: 'Pantau semua cabang dari satu dashboard. Kelihatan mana yang paling cuan.' },
    { icon: 'TrendingUp',    title: 'Laporan yang ngerti sendiri', desc: 'Omzet harian, layanan terlaris, performa barber — kebaca otomatis tanpa Excel.' },
    { icon: 'MessageCircle', title: 'WhatsApp otomatis', desc: 'Konfirmasi booking dan struk langsung mampir ke WhatsApp pelanggan.' },
    { icon: 'ShieldCheck',   title: 'Aman & sesuai peran', desc: 'Owner, kasir, barber — tiap orang punya akses sendiri. Data toko tetap aman.' },
  ]),
  trustItems: JSON.stringify(['Gratis 14 hari', 'Tanpa kartu kredit', 'Aktif langsung']),
  steps: JSON.stringify([
    { title: 'Daftar gratis',   desc: 'Bikin akun toko cuma semenit. Langsung dapat masa coba 14 hari, tanpa kartu kredit.' },
    { title: 'Atur toko kamu',  desc: 'Tambah cabang, layanan, dan tim. Ada checklist panduan biar nggak ada yang kelewat.' },
    { title: 'Mulai melayani',  desc: 'Buka kasir, terima booking, pantau omzet. Sisanya biar aplikasi yang urus.' },
  ]),
  sections: JSON.stringify({
    features:     { kicker: 'Fitur Lengkap',  title: 'Semua yang barbershop kamu butuhin', subtitle: 'Nggak perlu spreadsheet atau aplikasi terpisah. Dari kasir sampai laporan pemilik, semua sudah satu paket.' },
    steps:        { kicker: 'Gampang Banget', title: 'Mulai cuma 3 langkah', subtitle: 'Dari daftar sampai toko jalan, bisa kelar hari ini juga. Beneran.' },
    pricing:      { kicker: 'Paket Harga',    title: 'Harga jelas, tanpa kejutan', subtitle: 'Mulai gratis 14 hari. Bayar cuma kalau toko kamu makin ramai — bisa naik paket kapan saja.' },
    testimonials: { kicker: 'Testimoni',      title: 'Kata para owner barbershop', subtitle: 'Mereka sudah pindah dari catatan manual ke SembaPOS — dan nggak mau balik lagi.' },
    faq:          { kicker: 'Tanya Jawab',    title: 'Masih ragu? Wajar kok', subtitle: 'Belum nemu jawabannya? Chat tim kami langsung lewat WhatsApp.' },
  }),
  closingCta: JSON.stringify({
    title:    'Yuk, rapikan barbershop kamu',
    subtitle: 'Coba gratis 14 hari. Tanpa kartu kredit, tanpa biaya tersembunyi. Kalau cocok, lanjut — kalau enggak, ya sudah.',
    ctaLabel: 'Daftar Sekarang',
  }),
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

// Parse JSON value; jatuh ke default kalau row rusak/format lama.
function safeParse(raw, fallbackJson) {
  try { return JSON.parse(raw); }
  catch {
    try { return JSON.parse(fallbackJson); } catch { return null; }
  }
}

async function getAllHero() {
  const out = {};
  for (const [name, key] of Object.entries(SETTING_KEYS)) {
    out[name] = await getSetting(key);
  }
  for (const k of JSON_KEYS) {
    out[k] = safeParse(out[k], DEFAULTS[k]);
  }
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

const sectionHeadingSchema = z.object({
  kicker:   z.string().max(80),
  title:    z.string().max(160),
  subtitle: z.string().max(400),
});

const heroUpdateSchema = z.object({
  heroTitle:    z.string().max(200).optional(),
  heroSubtitle: z.string().max(500).optional(),
  heroCtaLabel: z.string().max(50).optional(),
  brandTagline: z.string().max(200).optional(),
  whatsappCta:  z.string().max(20).optional(),
  heroBadge:    z.string().max(40).optional(),
  footerText:   z.string().max(600).optional(),
  showStats:    z.boolean().optional(),
  features:     z.array(z.object({
    icon:  z.string().max(40),
    title: z.string().max(120),
    desc:  z.string().max(400),
  })).optional(),
  trustItems:   z.array(z.string().max(60)).max(6).optional(),
  steps:        z.array(z.object({
    title: z.string().max(120),
    desc:  z.string().max(400),
  })).max(6).optional(),
  sections:     z.record(sectionHeadingSchema).optional(),
  closingCta:   z.object({
    title:    z.string().max(160),
    subtitle: z.string().max(400),
    ctaLabel: z.string().max(50),
  }).optional(),
});

// PATCH /api/landing/hero — super_admin update branding/hero
router.patch('/hero', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const body = heroUpdateSchema.parse(req.body);
    for (const [field, value] of Object.entries(body)) {
      const key = SETTING_KEYS[field];
      if (!key) continue;
      const v = JSON_KEYS.includes(field) ? JSON.stringify(value) : value;
      await setSetting(key, v);
    }
    emitLandingUpdate();
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
    emitLandingUpdate();
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
    emitLandingUpdate();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});
router.delete('/testimonials/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    await prisma.landingTestimonial.delete({ where: { id: req.params.id } });
    emitLandingUpdate();
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
    emitLandingUpdate();
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
    emitLandingUpdate();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});
router.delete('/faqs/:id', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    await prisma.landingFAQ.delete({ where: { id: req.params.id } });
    emitLandingUpdate();
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
