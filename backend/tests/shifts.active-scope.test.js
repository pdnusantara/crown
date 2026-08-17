// GET /api/shifts/active harus SELALU mengembalikan shift milik pengguna yang
// login — bukan shift terbaru siapa pun di cabang itu.
//
// Bug yang dikunci di sini nyata dan terbukti di produksi (tenant `termul`):
// `kasirId` dulu hanya disaring untuk peran `kasir`, sehingga tenant_admin
// menerima shift kasir lain (urutan `openedAt desc`). Dua akibatnya —
//   1. penjualan owner menempel ke laci kasir lain, jadi kasir itulah yang
//      mempertanggungjawabkan uang yang tak pernah ia terima;
//   2. shift owner sendiri menggantung berbulan-bulan tanpa transaksi karena
//      tak pernah muncul lagi di layar mana pun.
//
// Jalur pengawasan tetap ada lewat GET /api/shifts?status=open — itu juga
// diuji di bawah supaya perbaikan ini tidak menyembunyikan shift terlupa.
//
// Jalankan:
//   DATABASE_URL="postgresql://…/crown_apptest" npm test

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const bcrypt = require('bcryptjs');

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

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-only-refresh-secret';

const prisma = require('../src/config/database');
const tenantResolver = require('../src/middleware/tenantResolver');
const errorHandler = require('../src/middleware/errorHandler');
const authRouter = require('../src/routes/auth');
const shiftsRouter = require('../src/routes/shifts');

const PASSWORD = 'RahasiaUji123!';
const SLUG = 'ujishiftscope';
const PREFIX = 'apptest-scope-';
const EMAIL_OWNER = `${PREFIX}owner@uji.local`;
const EMAIL_KASIR = `${PREFIX}kasir@uji.local`;

let server;
let baseUrl;
let tenantId;
let branchId;
let ownerId;
let kasirId;
let token = null;

async function req(method, path, { body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Slug': SLUG,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* body non-JSON */ }
  return { status: res.status, body: json };
}

const post = (p, body) => req('POST', p, { body });
const get = (p) => req('GET', p);

async function loginSebagai(email) {
  token = null;
  const res = await post('/api/auth/app-login', { email, password: PASSWORD });
  assert.equal(res.status, 200, `login ${email} gagal: ${JSON.stringify(res.body)}`);
  token = res.body.data.accessToken;
}

async function bersihkanDataUji() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: SLUG }, select: { id: true },
  });
  if (tenant) {
    await prisma.transaction.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.expense.deleteMany({ where: { tenantId: tenant.id } });
  }
  await prisma.shift.deleteMany({ where: { branch: { tenant: { slug: SLUG } } } });
  await prisma.refreshToken.deleteMany({ where: { user: { email: { startsWith: PREFIX } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.branch.deleteMany({ where: { tenant: { slug: SLUG } } });
  await prisma.tenant.deleteMany({ where: { slug: SLUG } });
}

before(async () => {
  await bersihkanDataUji();

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Barbershop Uji Cakupan Shift',
      slug: SLUG,
      email: `${PREFIX}tenant@uji.local`,
      phone: '+628000000009',
      address: 'Jl. Uji Cakupan No. 1',
      timezone: 'Asia/Jakarta',
    },
  });
  tenantId = tenant.id;

  const branch = await prisma.branch.create({
    data: { tenantId, name: 'Cabang Cakupan', code: 'CKP', address: 'Jl. Uji Cakupan No. 1' },
  });
  branchId = branch.id;

  const hash = await bcrypt.hash(PASSWORD, 10);
  const owner = await prisma.user.create({
    data: {
      email: EMAIL_OWNER, password: hash, name: 'Owner Cakupan',
      role: 'tenant_admin', tenantId, isActive: true,
    },
  });
  ownerId = owner.id;
  const kasir = await prisma.user.create({
    data: {
      email: EMAIL_KASIR, password: hash, name: 'Kasir Cakupan',
      role: 'kasir', tenantId, branchId, isActive: true,
    },
  });
  kasirId = kasir.id;

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));
  app.use(tenantResolver);
  app.use('/api/auth', authRouter);
  app.use('/api/shifts', shiftsRouter);
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

test('shift kasir tidak pernah dianggap shift aktif milik owner', async () => {
  // Kasir membuka shiftnya lebih dulu — inilah urutan yang dulu menjebak
  // owner, karena `openedAt desc` membuat shift kasir menang.
  await loginSebagai(EMAIL_KASIR);
  const buka = await post('/api/shifts/open', { branchId, openingCash: 50_000 });
  assert.equal(buka.status === 201 || buka.status === 200, true,
    `kasir gagal buka shift: ${JSON.stringify(buka.body)}`);
  const shiftKasir = buka.body.data.id;

  // Kasir tetap melihat shiftnya sendiri.
  const aktifKasir = await get(`/api/shifts/active?branchId=${branchId}`);
  assert.equal(aktifKasir.status, 200);
  assert.equal(aktifKasir.body.data?.id, shiftKasir);

  // Owner belum membuka shift → HARUS null, bukan shift kasir.
  await loginSebagai(EMAIL_OWNER);
  const aktifOwner = await get(`/api/shifts/active?branchId=${branchId}`);
  assert.equal(aktifOwner.status, 200);
  assert.equal(aktifOwner.body.data, null,
    'owner masih memungut shift kasir lain — bug lama kembali');
});

test('owner mendapat shiftnya sendiri, atas namanya', async () => {
  await loginSebagai(EMAIL_OWNER);
  const buka = await post('/api/shifts/open', { branchId, openingCash: 10_000 });
  assert.equal(buka.status === 201 || buka.status === 200, true,
    `owner gagal buka shift: ${JSON.stringify(buka.body)}`);

  const aktif = await get(`/api/shifts/active?branchId=${branchId}`);
  assert.equal(aktif.status, 200);
  assert.equal(aktif.body.data.kasirId, ownerId,
    'shift aktif owner harus tercatat atas nama owner sendiri');
  assert.equal(aktif.body.data.openingCash, 10_000,
    'kas awal yang terbaca harus milik shift owner, bukan shift kasir');
});

test('kasir tetap hanya melihat shiftnya sendiri', async () => {
  await loginSebagai(EMAIL_KASIR);
  const aktif = await get(`/api/shifts/active?branchId=${branchId}`);
  assert.equal(aktif.status, 200);
  assert.equal(aktif.body.data.kasirId, kasirId);
});

test('owner tetap bisa melihat shift terbuka milik orang lain lewat daftar', async () => {
  // Perbaikan di atas mempersempit /active. Tanpa jalur ini, shift kasir yang
  // terlupa jadi tak terlihat sama sekali — masalah yang sama, arah berbeda.
  await loginSebagai(EMAIL_OWNER);
  const daftar = await get(`/api/shifts?status=open&branchId=${branchId}&limit=50`);
  assert.equal(daftar.status, 200);
  const items = daftar.body.data?.items || daftar.body.data?.data || daftar.body.data || [];
  const pemilik = items.map((s) => s.kasirId).sort();
  assert.deepEqual(pemilik, [ownerId, kasirId].sort(),
    'daftar shift terbuka harus memuat shift owner DAN kasir');
});
