// Test untuk POST /api/auth/app-login — login aplikasi staf (email + password
// saja, tanpa "Kode Toko"). Pakai test runner bawaan Node (`node --test`), jadi
// tidak menambah dependensi apa pun ke backend produksi.
//
// Harness ini merakit express seperti server.js untuk jalur auth (express.json →
// tenantResolver → router auth → errorHandler) TAPI SENGAJA tidak mem-boot
// server.js utuh: server.js menyalakan cron job (rating link, WA trial, renewal)
// yang bisa mengirim WhatsApp/Telegram sungguhan. Test tidak boleh punya efek
// keluar.
//
// Jalankan:
//   DATABASE_URL="postgresql://…/crown_apptest" npm test
//
// DATABASE_URL WAJIB menunjuk database sekali-pakai. Test ini menulis & menghapus
// baris; ada guard di bawah yang menolak jalan bila diarahkan ke crown_db (prod).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const bcrypt = require('bcryptjs');

// ── Guard: jangan pernah jalan di database produksi ────────────────────────
const DB_URL = process.env.DATABASE_URL || '';
if (!DB_URL) {
  throw new Error('DATABASE_URL wajib diset ke database uji sekali-pakai.');
}
if (/\/crown_db(\?|$)/.test(DB_URL)) {
  throw new Error(
    'DATABASE_URL menunjuk crown_db (PRODUKSI). Test ini menulis data — dibatalkan. ' +
    'Pakai database sekali-pakai, mis. crown_apptest.'
  );
}

// JWT secret dummy khusus test, diset SEBELUM require config/jwt (yang membaca
// env saat load dan fatal di NODE_ENV=production tanpa secret).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-only-refresh-secret';

const prisma = require('../src/config/database');
const tenantResolver = require('../src/middleware/tenantResolver');
const errorHandler = require('../src/middleware/errorHandler');
const authRouter = require('../src/routes/auth');

const PASSWORD = 'RahasiaUji123!';
const SLUG = 'ujiapplogin';
// Email diberi prefix seragam supaya cleanup bisa menyapu semuanya walau test
// gagal di tengah jalan.
// Prefix HARUS lebih spesifik dari 'apptest-'. Cleanup di bawah menghapus
// user berdasarkan awalan email, dan 'apptest-' juga cocok dengan milik
// berkas tes lain (apptest-cashout-, apptest-beranda-, apptest-scope-).
// Karena node --test menjalankan berkas secara paralel, cleanup ini pernah
// menghapus user berkas lain di tengah jalan — seluruh tesnya gagal login
// dengan 401 yang menyesatkan.
const PREFIX = 'apptest-applogin-';
const EMAIL_KASIR = `${PREFIX}kasir@uji.local`;
const EMAIL_NONAKTIF = `${PREFIX}nonaktif@uji.local`;
const EMAIL_SUPERADMIN = `${PREFIX}sa@uji.local`;
const EMAIL_TIDAK_ADA = `${PREFIX}tidak-ada@uji.local`;

let server;
let baseUrl;
let tenantId;

/** POST JSON ke harness. `headers` untuk menguji ada/tidaknya X-Tenant-Slug. */
async function post(path, body, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* body non-JSON */ }
  return { status: res.status, body: json };
}

async function get(path, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  let json = null;
  try { json = await res.json(); } catch { /* body non-JSON */ }
  return { status: res.status, body: json };
}

async function bersihkanDataUji() {
  await prisma.refreshToken.deleteMany({ where: { user: { email: { startsWith: PREFIX } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.branch.deleteMany({ where: { tenant: { slug: SLUG } } });
  await prisma.tenant.deleteMany({ where: { slug: SLUG } });
}

before(async () => {
  await bersihkanDataUji();

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Barbershop Uji App',
      slug: SLUG,
      email: `${PREFIX}tenant@uji.local`,
      phone: '+628000000000',
      address: 'Jl. Uji No. 1',
      timezone: 'Asia/Jakarta',
    },
  });
  tenantId = tenant.id;

  const branch = await prisma.branch.create({
    data: { tenantId, name: 'Cabang Uji', code: 'UJI', address: 'Jl. Uji No. 1' },
  });

  const hash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.createMany({
    data: [
      { email: EMAIL_KASIR, password: hash, name: 'Kasir Uji', role: 'kasir', tenantId, branchId: branch.id, isActive: true },
      { email: EMAIL_NONAKTIF, password: hash, name: 'Nonaktif Uji', role: 'kasir', tenantId, branchId: branch.id, isActive: false },
      // super_admin: tanpa tenant — dipakai memastikan app-login menolaknya
      // dengan pesan jelas, bukan 200 tanpa tenant.slug.
      { email: EMAIL_SUPERADMIN, password: hash, name: 'SA Uji', role: 'super_admin', isActive: true },
    ],
  });

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));
  app.use(tenantResolver);
  app.use('/api/auth', authRouter);
  app.use(errorHandler);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await bersihkanDataUji();
  if (server) await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

// ── (a) login sukses tanpa header tenant, response memuat tenant.slug ──────
test('(a) app-login sukses TANPA header X-Tenant-Slug dan mengembalikan tenant.slug', async () => {
  const { status, body } = await post('/api/auth/app-login', {
    email: EMAIL_KASIR,
    password: PASSWORD,
  }); // sengaja tanpa header X-Tenant-Slug

  assert.equal(status, 200, `harus 200, dapat ${status}: ${JSON.stringify(body)}`);
  assert.equal(body.success, true);
  assert.ok(body.data.accessToken, 'accessToken harus ada');
  assert.ok(body.data.refreshToken, 'refreshToken harus ada');

  // Inti dari BACKEND_GAPS #7: app memakai ini sebagai X-Tenant-Slug.
  assert.equal(body.data.user.tenant.slug, SLUG);
  assert.equal(body.data.user.tenant.timezone, 'Asia/Jakarta');
  assert.equal(body.data.user.role, 'kasir');
  assert.equal(body.data.user.email, EMAIL_KASIR);
  assert.ok(Object.hasOwn(body.data.user.tenant, 'logo'), 'tenant.logo harus disertakan');

  // Password tidak boleh ikut terkirim.
  assert.equal(body.data.user.password, undefined, 'password tidak boleh ada di response');
});

test('(a2) slug dari response app-login benar-benar bisa dipakai sebagai X-Tenant-Slug di /auth/me', async () => {
  const login = await post('/api/auth/app-login', { email: EMAIL_KASIR, password: PASSWORD });
  const { accessToken, user } = login.body.data;

  const me = await get('/api/auth/me', {
    Authorization: `Bearer ${accessToken}`,
    'X-Tenant-Slug': user.tenant.slug,
  });

  assert.equal(me.status, 200, `/auth/me harus 200, dapat ${me.status}: ${JSON.stringify(me.body)}`);
  assert.equal(me.body.data.email, EMAIL_KASIR);
  // /auth/me juga harus membawa slug agar app tak kehilangan konteks saat refresh profil.
  assert.equal(me.body.data.tenant.slug, SLUG);
});

test('(a3) email case-insensitive: huruf besar tetap bisa login', async () => {
  const { status, body } = await post('/api/auth/app-login', {
    email: EMAIL_KASIR.toUpperCase(),
    password: PASSWORD,
  });
  assert.equal(status, 200, `harus 200, dapat ${status}: ${JSON.stringify(body)}`);
  assert.equal(body.data.user.tenant.slug, SLUG);
});

// ── (b) 401 generik & tidak membocorkan keberadaan email ──────────────────
test('(b) email tidak ada DAN password salah → 401 dengan pesan IDENTIK', async () => {
  const emailTidakAda = await post('/api/auth/app-login', {
    email: EMAIL_TIDAK_ADA,
    password: PASSWORD,
  });
  const passwordSalah = await post('/api/auth/app-login', {
    email: EMAIL_KASIR,
    password: 'PasswordSalahSekali!',
  });

  assert.equal(emailTidakAda.status, 401);
  assert.equal(passwordSalah.status, 401);
  assert.equal(emailTidakAda.body.success, false);
  assert.equal(passwordSalah.body.success, false);

  // Justru INI yang menutup kebocoran: dua kasus berbeda harus tak bisa dibedakan.
  assert.equal(
    emailTidakAda.body.error,
    passwordSalah.body.error,
    'pesan error harus identik agar tidak membocorkan email mana yang terdaftar'
  );
  assert.equal(emailTidakAda.body.error, 'Email atau kata sandi salah');

  // Tidak boleh ada bocoran lewat field tambahan.
  assert.deepEqual(Object.keys(emailTidakAda.body).sort(), Object.keys(passwordSalah.body).sort());
});

test('(b2) akun nonaktif → 403 dengan pesan jelas, dan HANYA setelah password benar', async () => {
  const passwordBenar = await post('/api/auth/app-login', {
    email: EMAIL_NONAKTIF,
    password: PASSWORD,
  });
  assert.equal(passwordBenar.status, 403);
  assert.match(passwordBenar.body.error, /tidak aktif/i);

  // Password salah pada akun nonaktif harus tetap 401 generik — kalau di sini
  // muncul "akun tidak aktif", keberadaan email itu bocor.
  const passwordSalah = await post('/api/auth/app-login', {
    email: EMAIL_NONAKTIF,
    password: 'PasswordSalahSekali!',
  });
  assert.equal(passwordSalah.status, 401);
  assert.equal(passwordSalah.body.error, 'Email atau kata sandi salah');
});

test('(b3) akun tanpa tenant (super_admin) ditolak 403, bukan 200 tanpa tenant.slug', async () => {
  const { status, body } = await post('/api/auth/app-login', {
    email: EMAIL_SUPERADMIN,
    password: PASSWORD,
  });
  assert.equal(status, 403, `harus 403, dapat ${status}: ${JSON.stringify(body)}`);
  assert.match(body.error, /bukan akun staf/i);
});

// ── (c) email unik lintas tenant ───────────────────────────────────────────
test('(c) email unik global: tidak bisa dipakai di tenant lain', async () => {
  const tenantLain = await prisma.tenant.create({
    data: {
      name: 'Barbershop Uji Dua',
      slug: `${SLUG}2`,
      email: `${PREFIX}tenant2@uji.local`,
      phone: '+628000000001',
      address: 'Jl. Uji No. 2',
    },
  });

  try {
    await assert.rejects(
      prisma.user.create({
        data: {
          email: EMAIL_KASIR, // email yang sama, tenant berbeda
          password: 'x',
          name: 'Duplikat',
          role: 'kasir',
          tenantId: tenantLain.id,
          isActive: true,
        },
      }),
      (err) => err.code === 'P2002',
      'User.email harus unik lintas tenant — tanpa ini, resolusi tenant dari email tidak sah'
    );
  } finally {
    await prisma.tenant.delete({ where: { id: tenantLain.id } });
  }
});

test('(c2) tidak ada email duplikat case-insensitive di antara user aktif', async () => {
  const dup = await prisma.$queryRawUnsafe(
    'SELECT lower(email) e, count(*) c FROM "User" WHERE "deletedAt" IS NULL GROUP BY 1 HAVING count(*) > 1'
  );
  assert.equal(dup.length, 0, `ada email duplikat case-insensitive: ${JSON.stringify(dup)}`);
});

// ── Regresi: dua login serentak tidak boleh bentrok refresh token ─────────
test('(e) dua login akun yang sama pada detik yang sama sama-sama sukses (token unik)', async () => {
  // Ini pernah gagal 409 "Duplicate value for unique field(s): token": refresh
  // token hanya {id, iat, exp} dengan iat presisi detik, jadi dua login dalam
  // satu detik menghasilkan string identik. Skenario nyata: satu akun staf di
  // dua perangkat, atau login app bersamaan dengan login web.
  const [a, b] = await Promise.all([
    post('/api/auth/app-login', { email: EMAIL_KASIR, password: PASSWORD }),
    post('/api/auth/app-login', { email: EMAIL_KASIR, password: PASSWORD }),
  ]);

  assert.equal(a.status, 200, `login pertama harus 200, dapat ${a.status}: ${JSON.stringify(a.body)}`);
  assert.equal(b.status, 200, `login kedua harus 200, dapat ${b.status}: ${JSON.stringify(b.body)}`);
  assert.notEqual(
    a.body.data.refreshToken,
    b.body.data.refreshToken,
    'refresh token dua login harus berbeda'
  );
});

// ── Regresi: /auth/login TIDAK berubah ────────────────────────────────────
test('(d) /auth/login tetap menolak akun tenant dari main domain (kebijakan domain utuh)', async () => {
  const { status, body } = await post('/api/auth/login', {
    email: EMAIL_KASIR,
    password: PASSWORD,
  }); // tanpa X-Tenant-Slug = main domain

  assert.equal(status, 403, `kebijakan domain harus tetap berlaku, dapat ${status}`);
  assert.equal(body.tenantSlug, SLUG, 'response 403 tetap memberi slug untuk redirect UI');
});

test('(d2) /auth/login tetap sukses dari subdomain (X-Tenant-Slug benar) dan membawa tenant.slug', async () => {
  const { status, body } = await post(
    '/api/auth/login',
    { email: EMAIL_KASIR, password: PASSWORD },
    { 'X-Tenant-Slug': SLUG }
  );

  assert.equal(status, 200, `harus 200, dapat ${status}: ${JSON.stringify(body)}`);
  assert.equal(body.data.user.tenant.slug, SLUG);
});
