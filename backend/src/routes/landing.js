const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const multer = require('multer');
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
  contactPhone:   'landing_contact_phone',   // nomor telepon/WA kontak di footer
  contactEmail:   'landing_contact_email',   // alamat email kontak di footer
  contactAddress: 'landing_contact_address', // alamat fisik di footer
  features:     'landing_features',     // JSON: array fitur
  trustItems:   'landing_trust_items',  // JSON: array string trust-line hero
  steps:        'landing_steps',        // JSON: array {title,desc} "cara mulai"
  sections:     'landing_sections',     // JSON: heading per-section
  closingCta:   'landing_closing_cta',  // JSON: {title,subtitle,ctaLabel}
  metaPixelId:  'landing_meta_pixel_id',// Meta (Facebook) Pixel ID untuk iklan
  seoTitle:       'landing_seo_title',       // <title> & og:title landing
  seoDescription: 'landing_seo_description', // meta description & og:description
  seoKeywords:    'landing_seo_keywords',    // meta keywords (dipisah koma)
  seoOgImage:     'landing_seo_og_image',    // URL gambar share (og:image)
  siteName:       'landing_site_name',       // teks nama brand di header/footer/judul
  siteLogo:       'landing_site_logo',       // URL logo header & footer landing
  siteFavicon:    'landing_site_favicon',    // URL favicon (ikon tab browser)
};

// Keys yang nilainya JSON-encoded — di-parse saat baca, di-stringify saat tulis.
const JSON_KEYS = ['features', 'trustItems', 'steps', 'sections', 'closingCta'];

// ── Block layout (block builder) ───────────────────────────────────────────
// Tata letak landing disimpan sebagai JSON array di SystemSetting. Hero & Footer
// TIDAK masuk array (posisinya terkunci di renderer). Blok "core" = singleton,
// kontennya dari sumber lama (hero/sections/testimoni/dll); blok "free" bisa
// banyak instance dengan konten inline di `config`.
const LAYOUT_KEY = 'landing_layout';
const ORDERABLE_CORE_TYPES = ['stats', 'features', 'steps', 'pricing', 'testimonials', 'faq', 'closingCta'];
const FREE_BLOCK_TYPES = ['gallery', 'video', 'logoStrip', 'banner', 'richText'];
const ALL_BLOCK_TYPES = [...ORDERABLE_CORE_TYPES, ...FREE_BLOCK_TYPES];

// Urutan default = tampilan landing saat ini (tanpa hero/footer yang terkunci).
const DEFAULT_LAYOUT = ORDERABLE_CORE_TYPES.map(t => ({ id: t, type: t, visible: true }));

const DEFAULTS = {
  heroTitle:    'Kelola barbershop, tanpa ribet.',
  heroSubtitle: 'Kasir, antrian, booking online, sampai laporan pemilik — semua jadi satu aplikasi. Tinggal pakai, langsung jalan hari ini juga.',
  heroCtaLabel: 'Coba Gratis 14 Hari',
  showStats:    'true',
  brandTagline: 'Dipercaya barbershop di seluruh Indonesia',
  whatsappCta:  '',
  heroBadge:    'Baru',
  footerText:   'Sistem manajemen barbershop modern: kasir, antrian, booking online, multi-cabang, dan laporan pintar dalam satu aplikasi.',
  contactPhone:   '',
  contactEmail:   '',
  contactAddress: 'Indonesia',
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
  metaPixelId: '',
  seoTitle:       'SembaPOS — Sistem Manajemen Barbershop Modern',
  seoDescription: 'Kasir, antrian, booking online, multi-cabang, dan laporan pintar — semua dalam satu aplikasi yang dirancang khusus untuk barbershop. Coba gratis 14 hari, tanpa kartu kredit.',
  seoKeywords:    'aplikasi barbershop, POS barbershop, manajemen barbershop, kasir barbershop, booking barbershop, antrian barbershop',
  seoOgImage:     '',
  siteName:       'SembaPOS',
  siteLogo:       '',
  siteFavicon:    '',
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

// Baca layout blok; fallback ke DEFAULT_LAYOUT kalau belum diset / rusak.
async function getLayout() {
  const row = await prisma.systemSetting.findUnique({ where: { key: LAYOUT_KEY } });
  if (!row) return DEFAULT_LAYOUT;
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? parsed : DEFAULT_LAYOUT;
  } catch { return DEFAULT_LAYOUT; }
}

// ── Public read endpoint ──────────────────────────────────────────────────

// GET /api/landing — semua konten landing untuk render publik
router.get('/', async (req, res, next) => {
  try {
    // Stats selalu dihitung — frontend yang memutuskan tampil-atau-tidak
    // berdasarkan hero.showStats (lebih murah daripada double-await).
    const [hero, testimonials, faqs, packages, stats, layout] = await Promise.all([
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
      getLayout(),
    ]);

    res.json({
      success: true,
      data: { hero, testimonials, faqs, packages, stats, layout },
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
  image:    z.string().max(500).optional(),  // gambar opsional (dipakai section "Cara Mulai")
});

const heroUpdateSchema = z.object({
  heroTitle:    z.string().max(200).optional(),
  heroSubtitle: z.string().max(500).optional(),
  heroCtaLabel: z.string().max(50).optional(),
  brandTagline: z.string().max(200).optional(),
  whatsappCta:  z.string().max(20).optional(),
  heroBadge:    z.string().max(40).optional(),
  footerText:   z.string().max(600).optional(),
  contactPhone:   z.string().max(40).optional(),
  contactEmail:   z.string().max(120).optional(),
  contactAddress: z.string().max(300).optional(),
  showStats:    z.boolean().optional(),
  features:     z.array(z.object({
    icon:  z.string().max(40),
    title: z.string().max(120),
    desc:  z.string().max(400),
    image: z.string().max(500).optional(),  // URL screenshot/foto opsional per fitur
    video: z.string().max(500).optional(),  // URL video opsional per fitur (diunggah)
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
    image:    z.string().max(500).optional(),  // gambar opsional di CTA penutup
  }).optional(),
  metaPixelId:  z.string().regex(/^\d*$/, 'Pixel ID hanya boleh berisi angka').max(20).optional(),
  seoTitle:       z.string().max(120).optional(),
  seoDescription: z.string().max(320).optional(),
  seoKeywords:    z.string().max(400).optional(),
  seoOgImage:     z.string().max(500).optional(),
  siteName:       z.string().max(60).optional(),
  siteLogo:       z.string().max(500).optional(),
  siteFavicon:    z.string().max(500).optional(),
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

// ── Block layout: PATCH /api/landing/layout ───────────────────────────────

const layoutBlockSchema = z.object({
  id:      z.string().min(1).max(64),
  type:    z.enum(ALL_BLOCK_TYPES),
  visible: z.boolean(),
  // Konten blok free (gallery/banner/dll). Permissif — struktur diatur FE.
  config:  z.record(z.any()).optional(),
});
const layoutSchema = z.array(layoutBlockSchema).max(40);

// PATCH /api/landing/layout — super_admin simpan urutan & visibilitas blok.
router.patch('/layout', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const layout = layoutSchema.parse(req.body?.layout ?? req.body);

    // Blok core bersifat singleton — tidak boleh ada tipe core ganda.
    const seenCore = new Set();
    for (const b of layout) {
      if (ORDERABLE_CORE_TYPES.includes(b.type)) {
        if (seenCore.has(b.type)) {
          return res.status(400).json({ success: false, error: `Blok "${b.type}" tidak boleh muncul lebih dari sekali` });
        }
        seenCore.add(b.type);
      }
    }

    await setSetting(LAYOUT_KEY, JSON.stringify(layout));
    emitLandingUpdate();
    gcUploads(layout); // bersihkan gambar yatim (best-effort, non-blocking)
    res.json({ success: true, data: layout });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

// ── Image upload: POST /api/landing/upload ────────────────────────────────
// Simpan ke disk (backend/uploads/landing) lalu balas URL. Dipakai blok free
// (galeri/banner/logo). Disajikan via express.static di /api/uploads (server.js).

const UPLOAD_DIR = path.join(__dirname, '../../uploads/landing');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const uploadImage = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename:    (req, file, cb) => {
      // Ekstensi dari MIME tervalidasi, BUKAN nama file klien — cegah simpan
      // nama .html/.svg yang lalu disajikan inline (stored-XSS). fileFilter
      // di bawah sudah membatasi mimetype ke daftar gambar.
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[file.mimetype] || '.jpg';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024 }, // 12 MB — cukup utk gambar AI res-tinggi
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format gambar harus JPG, PNG, WebP, atau GIF'));
  },
}).single('image');

router.post('/upload', authenticate, requireRole('super_admin'), (req, res) => {
  uploadImage(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran gambar maksimal 12 MB' : err.message;
      return res.status(400).json({ success: false, error: msg });
    }
    if (!req.file) return res.status(400).json({ success: false, error: 'File gambar wajib diunggah (field "image")' });
    res.json({ success: true, data: { url: `/api/uploads/landing/${req.file.filename}` } });
  });
});

// ── Video upload: POST /api/landing/upload-video ──────────────────────────────
// Untuk mockup fitur format video (rekaman layar). Disimpan di disk yg sama,
// disajikan via /api/uploads. Maks 30 MB; MP4/WebM/MOV.
const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime'];
const uploadVideo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename:    (req, file, cb) => {
      const ext = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' }[file.mimetype] || '.mp4';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_VIDEO_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format video harus MP4, WebM, atau MOV'));
  },
}).single('video');

router.post('/upload-video', authenticate, requireRole('super_admin'), (req, res) => {
  uploadVideo(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran video maksimal 30 MB' : err.message;
      return res.status(400).json({ success: false, error: msg });
    }
    if (!req.file) return res.status(400).json({ success: false, error: 'File video wajib diunggah (field "video")' });
    res.json({ success: true, data: { url: `/api/uploads/landing/${req.file.filename}` } });
  });
});

// Kumpulkan nama file `/api/uploads/landing/<file>` yang masih dipakai layout.
function collectUploadFilenames(value, set = new Set()) {
  if (typeof value === 'string') {
    const m = value.match(/\/api\/uploads\/landing\/([\w.-]+)/);
    if (m) set.add(m[1]);
  } else if (Array.isArray(value)) {
    value.forEach(v => collectUploadFilenames(v, set));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(v => collectUploadFilenames(v, set));
  }
  return set;
}

// Hapus gambar yatim — file di uploads/landing yang tidak lagi dirujuk layout.
// Best-effort & non-blocking. File berumur < 1 jam dilewati supaya gambar yang
// baru diunggah tapi belum sempat disimpan ke layout tidak ikut terhapus.
async function gcUploads(layout) {
  try {
    const referenced = collectUploadFilenames(layout);
    // Gambar yang disimpan TERPISAH dari layout (di SystemSetting hero) juga
    // harus dihitung agar tak terhapus sebagai "yatim": gambar per-fitur,
    // logo, favicon, OG image, dan heading section. getAllHero() mencakup
    // semuanya (features, siteLogo, siteFavicon, seoOgImage, sections).
    const hero = await getAllHero().catch(() => null);
    if (hero) collectUploadFilenames(hero, referenced);
    const files = await fs.promises.readdir(UPLOAD_DIR);
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const f of files) {
      if (referenced.has(f)) continue;
      const fp = path.join(UPLOAD_DIR, f);
      const stat = await fs.promises.stat(fp).catch(() => null);
      if (stat && stat.isFile() && stat.mtimeMs < cutoff) {
        await fs.promises.unlink(fp).catch(() => {});
      }
    }
  } catch { /* GC best-effort — jangan ganggu request */ }
}

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
