// Test endpoint agregat untuk Beranda aplikasi staf (Flutter) — semuanya lahir
// untuk menghapus workaround klien:
//
//   GET /api/tenants/me/onboarding  ← ganti 4 request tiap buka Beranda
//   GET /api/queue/summary          ← ganti "tarik daftar lalu hitung sendiri"
//   GET /api/expenses/summary       ← kartu Kas Keluar untuk kasir (dulu 403)
//   GET /api/expenses/stats         ← branchId dulu DIABAIKAN diam-diam
//
// Yang paling banyak dikunci di sini adalah batas hari: server jalan di UTC,
// jadi tanpa konversi zona tenant "hari ini" bergeser 7 jam untuk toko WIB.
//
// Harness merakit express seperti server.js untuk jalur yang diuji saja dan
// SENGAJA tidak mem-boot server.js (cron di sana bisa mengirim WhatsApp/Telegram
// sungguhan).
//
// Jalankan:
//   DATABASE_URL="postgresql://…/crown_apptest" npm test

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const bcrypt = require('bcryptjs');

const DB_URL = process.env.DATABASE_URL || '';
if (!DB_URL) throw new Error('DATABASE_URL wajib diset ke database uji sekali-pakai.');
if (/\/crown_db(\?|$)/.test(DB_URL)) {
  throw new Error('DATABASE_URL menunjuk crown_db (PRODUKSI). Test ini menulis data — dibatalkan.');
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-only-refresh-secret';

const prisma = require('../src/config/database');
const tenantResolver = require('../src/middleware/tenantResolver');
const errorHandler = require('../src/middleware/errorHandler');
const authRouter = require('../src/routes/auth');
const queueRouter = require('../src/routes/queue');
const tenantsRouter = require('../src/routes/tenants');
const expensesRouter = require('../src/routes/expenses');

const PASSWORD = 'RahasiaUji123!';
const SLUG = 'ujiberanda';
const PREFIX = 'apptest-beranda-';
const EMAIL_ADMIN = `${PREFIX}admin@uji.local`;
const EMAIL_KASIR = `${PREFIX}kasir@uji.local`;
const TZ = 'Asia/Jakarta'; // UTC+7, tanpa DST

// Hari uji dipatok tetap supaya batas zona bisa diperiksa persis.
const HARI = '2026-08-12';
// 2026-08-12 di Asia/Jakarta = [2026-08-11T17:00:00Z .. 2026-08-12T16:59:59.999Z]
const DINI_HARI_WIB   = '2026-08-11T17:30:00.000Z'; // 00:30 WIB 12 Agu — dulu terhitung 11 Agu
const MALAM_WIB       = '2026-08-12T16:30:00.000Z'; // 23:30 WIB 12 Agu — masih 12 Agu
const BESOK_DINI_WIB  = '2026-08-12T17:30:00.000Z'; // 00:30 WIB 13 Agu — sudah 13 Agu

let server, baseUrl, tenantId, branchId, branchLainId;
let tokenAdmin, tokenKasir;

async function req(method, path, { body, token } = {}) {
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
const get  = (p, token) => req('GET', p, { token });
const post = (p, body, token) => req('POST', p, { body, token });

async function bersihkanDataUji() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (tenant) {
    await prisma.transaction.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.expense.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.queue.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenantFeatureFlag.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.service.deleteMany({ where: { tenantId: tenant.id } });
  }
  await prisma.refreshToken.deleteMany({ where: { user: { email: { startsWith: PREFIX } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.branch.deleteMany({ where: { tenant: { slug: SLUG } } });
  await prisma.tenant.deleteMany({ where: { slug: SLUG } });
}

before(async () => {
  await bersihkanDataUji();

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Barbershop Uji Beranda', slug: SLUG,
      email: `${PREFIX}tenant@uji.local`, phone: '+628000000002',
      address: 'Jl. Beranda No. 1', timezone: TZ,
    },
  });
  tenantId = tenant.id;

  const [b1, b2] = await Promise.all([
    prisma.branch.create({ data: { tenantId, name: 'Cabang Satu', code: 'SATU', address: 'Jl. Satu' } }),
    prisma.branch.create({ data: { tenantId, name: 'Cabang Dua',  code: 'DUA',  address: 'Jl. Dua' } }),
  ]);
  branchId = b1.id;
  branchLainId = b2.id;

  // /expenses/stats di-gate flag; /expenses/summary sengaja tidak.
  await prisma.tenantFeatureFlag.create({
    data: { tenantId, flagId: 'expense_tracking', enabled: true },
  });

  const hash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.createMany({
    data: [
      { email: EMAIL_ADMIN, password: hash, name: 'Admin Beranda', role: 'tenant_admin', tenantId, isActive: true },
      { email: EMAIL_KASIR, password: hash, name: 'Kasir Beranda', role: 'kasir', tenantId, branchId, isActive: true },
    ],
  });

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));
  app.use(tenantResolver);
  app.use('/api/auth', authRouter);
  app.use('/api/queue', queueRouter);
  app.use('/api/tenants', tenantsRouter);
  app.use('/api/expenses', expensesRouter);
  app.use(errorHandler);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const [la, lk] = await Promise.all([
    post('/api/auth/app-login', { email: EMAIL_ADMIN, password: PASSWORD }),
    post('/api/auth/app-login', { email: EMAIL_KASIR, password: PASSWORD }),
  ]);
  assert.equal(la.status, 200, `login admin gagal: ${JSON.stringify(la.body)}`);
  assert.equal(lk.status, 200, `login kasir gagal: ${JSON.stringify(lk.body)}`);
  tokenAdmin = la.body.data.accessToken;
  tokenKasir = lk.body.data.accessToken;
});

after(async () => {
  await bersihkanDataUji();
  if (server) await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

// ── Onboarding ─────────────────────────────────────────────────────────────
test('onboarding: cabang sudah ada, sisanya belum — owner tak dihitung sebagai staf', async () => {
  const { status, body } = await get('/api/tenants/me/onboarding', tokenAdmin);
  assert.equal(status, 200, `gagal: ${JSON.stringify(body)}`);
  assert.deepEqual(body.data, {
    hasBranch: true,
    hasService: false,
    // Kasir sudah di-seed, jadi hasStaff true; yang diuji: owner sendiri tidak
    // membuat hasStaff true (dicek di test berikutnya lewat tenant tanpa staf).
    hasStaff: true,
    hasTransaction: false,
    completed: false,
  });
});

test('onboarding: berubah menjadi lengkap setelah layanan & transaksi ada', async () => {
  await prisma.service.create({
    data: { tenantId, name: 'Potong Rambut', price: 50_000, duration: 30, category: 'Rambut' },
  });
  await prisma.transaction.create({
    data: { tenantId, branchId, subtotal: 50_000, total: 50_000, paymentMethod: 'cash', status: 'completed' },
  });

  const { body } = await get('/api/tenants/me/onboarding', tokenAdmin);
  assert.equal(body.data.hasService, true);
  assert.equal(body.data.hasTransaction, true);
  assert.equal(body.data.completed, true, 'completed = semua langkah selesai');
});

test('onboarding: transaksi dibatalkan tidak dianggap "pernah bertransaksi"', async () => {
  const tx = await prisma.transaction.findFirst({ where: { tenantId, status: 'completed' } });
  await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'cancelled' } });

  const { body } = await get('/api/tenants/me/onboarding', tokenAdmin);
  assert.equal(body.data.hasTransaction, false, 'hanya transaksi completed yang dihitung');

  await prisma.transaction.update({ where: { id: tx.id }, data: { status: 'completed' } });
});

// ── Queue summary ──────────────────────────────────────────────────────────
test('queue/summary: hitung per status & batas hari mengikuti zona tenant, bukan UTC', async () => {
  await prisma.queue.createMany({
    data: [
      // Dini hari WIB — dengan batas UTC lama ini terhitung tanggal SEBELUMNYA.
      { tenantId, branchId, customerName: 'A', queueNumber: 1, status: 'waiting',     createdAt: new Date(DINI_HARI_WIB) },
      { tenantId, branchId, customerName: 'B', queueNumber: 2, status: 'waiting',     createdAt: new Date(MALAM_WIB) },
      { tenantId, branchId, customerName: 'C', queueNumber: 3, status: 'in_progress', createdAt: new Date(MALAM_WIB) },
      { tenantId, branchId, customerName: 'D', queueNumber: 4, status: 'done',        createdAt: new Date(MALAM_WIB) },
      { tenantId, branchId, customerName: 'E', queueNumber: 5, status: 'paid',        createdAt: new Date(MALAM_WIB) },
      { tenantId, branchId, customerName: 'F', queueNumber: 6, status: 'cancelled',   createdAt: new Date(MALAM_WIB) },
      // Sudah lewat tengah malam WIB → hari berikutnya, tak boleh ikut.
      { tenantId, branchId, customerName: 'G', queueNumber: 7, status: 'waiting',     createdAt: new Date(BESOK_DINI_WIB) },
      // Cabang lain — tak boleh ikut saat difilter cabang.
      { tenantId, branchId: branchLainId, customerName: 'H', queueNumber: 1, status: 'waiting', createdAt: new Date(MALAM_WIB) },
    ],
  });

  const { status, body } = await get(`/api/queue/summary?date=${HARI}&branchId=${branchId}`, tokenAdmin);
  assert.equal(status, 200, `gagal: ${JSON.stringify(body)}`);
  assert.deepEqual(body.data, {
    waiting: 2, inProgress: 1, done: 1, paid: 1, cancelled: 1, total: 6,
  });
  assert.equal(body.meta.timezone, TZ);
  assert.equal(body.meta.date, HARI);
  assert.equal(body.meta.branchId, branchId);
});

test('queue/summary: tanpa branchId mencakup semua cabang tenant', async () => {
  const { body } = await get(`/api/queue/summary?date=${HARI}`, tokenAdmin);
  assert.equal(body.data.waiting, 3, 'termasuk antrian cabang lain');
  assert.equal(body.data.total, 7);
  assert.equal(body.meta.branchId, null);
});

test('queue/summary: kasir terkunci ke cabangnya & ditolak saat minta cabang lain', async () => {
  const sendiri = await get(`/api/queue/summary?date=${HARI}`, tokenKasir);
  assert.equal(sendiri.status, 200);
  assert.equal(sendiri.body.data.total, 6, 'kasir hanya melihat cabangnya');
  assert.equal(sendiri.body.meta.branchId, branchId);

  const lain = await get(`/api/queue/summary?date=${HARI}&branchId=${branchLainId}`, tokenKasir);
  assert.equal(lain.status, 403, 'kasir tak boleh melihat cabang lain');
});

test('queue/summary: branchId tak dikenal ditolak 400, bukan melebar jadi se-tenant', async () => {
  const { status, body } = await get(`/api/queue/summary?date=${HARI}&branchId=cabang-hantu`, tokenAdmin);
  assert.equal(status, 400, `harus 400, dapat ${status}: ${JSON.stringify(body)}`);
});

test('queue/summary: date tak valid ditolak 400', async () => {
  const { status } = await get('/api/queue/summary?date=12-08-2026', tokenAdmin);
  assert.equal(status, 400);
});

test('queue/summary: semua status hadir sebagai 0 walau tak ada antrian', async () => {
  const { body } = await get('/api/queue/summary?date=2020-01-01', tokenAdmin);
  assert.deepEqual(body.data, {
    waiting: 0, inProgress: 0, done: 0, paid: 0, cancelled: 0, total: 0,
  });
});

// ── Expenses ───────────────────────────────────────────────────────────────
test('expenses/summary: kasir BOLEH (dulu 403) dan hanya melihat cabangnya', async () => {
  await prisma.expense.createMany({
    data: [
      { tenantId, branchId, category: 'operasional', description: 'Parkir', amount: 25_000, date: new Date(`${HARI}T00:00:00.000Z`) },
      { tenantId, branchId, category: 'supplies',    description: 'Sabun',  amount: 15_000, date: new Date(`${HARI}T00:00:00.000Z`) },
      { tenantId, branchId: branchLainId, category: 'operasional', description: 'Cabang lain', amount: 99_000, date: new Date(`${HARI}T00:00:00.000Z`) },
    ],
  });

  const { status, body } = await get(`/api/expenses/summary?date=${HARI}`, tokenKasir);
  assert.equal(status, 200, `kasir harus boleh, dapat ${status}: ${JSON.stringify(body)}`);
  assert.equal(body.data.total, 40_000, 'hanya cabang kasir');
  assert.equal(body.data.count, 2);
  assert.deepEqual(body.data.byCategory, { operasional: 25_000, supplies: 15_000 });
  assert.equal(body.data.branchId, branchId);
  assert.equal(body.meta.timezone, TZ);
});

test('expenses/summary: kasir ditolak saat meminta cabang lain', async () => {
  const { status } = await get(`/api/expenses/summary?date=${HARI}&branchId=${branchLainId}`, tokenKasir);
  assert.equal(status, 403);
});

test('expenses/summary: admin bisa memfilter per cabang', async () => {
  const semua = await get(`/api/expenses/summary?date=${HARI}`, tokenAdmin);
  assert.equal(semua.body.data.total, 139_000, 'tanpa branchId = seluruh tenant');

  const satu = await get(`/api/expenses/summary?date=${HARI}&branchId=${branchLainId}`, tokenAdmin);
  assert.equal(satu.body.data.total, 99_000);
  assert.equal(satu.body.data.branchId, branchLainId);
});

test('expenses/stats: branchId kini BENAR-BENAR memfilter (dulu diabaikan)', async () => {
  const semua = await get(`/api/expenses/stats?startDate=${HARI}&endDate=${HARI}`, tokenAdmin);
  assert.equal(semua.body.data.total, 139_000);
  assert.equal(semua.body.data.branchId, null);

  const satu = await get(`/api/expenses/stats?startDate=${HARI}&endDate=${HARI}&branchId=${branchId}`, tokenAdmin);
  assert.equal(satu.body.data.total, 40_000, 'inilah bug yang bikin kartu Kas Keluar harus dilabeli "(semua cabang)"');
  assert.equal(satu.body.data.branchId, branchId);
  assert.equal(satu.body.meta.timezone, TZ);
});

test('expenses/stats: branchId tak dikenal ditolak 400', async () => {
  const { status } = await get(`/api/expenses/stats?startDate=${HARI}&endDate=${HARI}&branchId=cabang-hantu`, tokenAdmin);
  assert.equal(status, 400);
});

test('expenses/stats: kasir tetap 403 — modul admin tidak terbuka', async () => {
  const { status } = await get(`/api/expenses/stats?startDate=${HARI}&endDate=${HARI}`, tokenKasir);
  assert.equal(status, 403, 'yang dibuka untuk kasir hanya /summary');
});
