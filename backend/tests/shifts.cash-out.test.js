// Test siklus kas laci kasir: buka shift → catat kas keluar → tutup shift dengan
// selisih disengaja. Menguji kontrak yang dipakai aplikasi staf (Flutter):
//
//   POST   /api/shifts/:id/cash-out
//   DELETE /api/shifts/:id/cash-out/:expenseId
//   GET    /api/shifts/:id/summary        (expectedCash live)
//   POST   /api/shifts/:id/close          (retainedFloat, varianceReason)
//
// Yang dikunci di sini adalah janji-janji yang tertulis di openapi.json dan
// dipakai klien untuk memutuskan perilakunya:
//   - kas keluar SUDAH dikurangi server → klien tak boleh mengoreksi lagi
//   - branchId/date/category/barberId diturunkan server, kiriman klien diabaikan
//   - varianceReason hanya disimpan saat ada selisih (UI menyembunyikan input
//     kolomnya saat selisih 0 — perilaku itu bergantung pada aturan ini)
//   - kasir DITOLAK di /api/expenses, jadi cash-out satu-satunya jalur yang sah
//
// Harness merakit express seperti server.js untuk jalur yang diuji saja dan
// SENGAJA tidak mem-boot server.js (cron di sana bisa mengirim WhatsApp/Telegram
// sungguhan). Test tidak boleh punya efek keluar.
//
// Jalankan:
//   DATABASE_URL="postgresql://…/crown_apptest" npm test

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

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-only-refresh-secret';

const prisma = require('../src/config/database');
const tenantResolver = require('../src/middleware/tenantResolver');
const errorHandler = require('../src/middleware/errorHandler');
const authRouter = require('../src/routes/auth');
const shiftsRouter = require('../src/routes/shifts');
const expensesRouter = require('../src/routes/expenses');
const { formatYmdInTz } = require('../src/utils/timezone');

const PASSWORD = 'RahasiaUji123!';
const SLUG = 'ujikaskeluar';
const PREFIX = 'apptest-cashout-';
const EMAIL_KASIR = `${PREFIX}kasir@uji.local`;
const TZ = 'Asia/Jakarta';

// Angka skenario — dipilih supaya setiap komponen rumus terlihat terpisah.
const KAS_AWAL       = 100_000;
const PENJUALAN_TUNAI = 150_000;
const PENJUALAN_QRIS  = 100_000; // tidak boleh masuk hitungan kas laci
const KAS_KELUAR_1    = 25_000;
const KAS_KELUAR_2    = 15_000;
const TOTAL_KAS_KELUAR = KAS_KELUAR_1 + KAS_KELUAR_2;
const KAS_SEHARUSNYA  = KAS_AWAL + PENJUALAN_TUNAI - TOTAL_KAS_KELUAR; // 210.000
const KAS_FISIK       = 205_000;                                       // sengaja kurang
const SELISIH         = KAS_FISIK - KAS_SEHARUSNYA;                    // -5.000
const MODAL_DITAHAN   = 100_000;
const SETORAN         = KAS_FISIK - MODAL_DITAHAN;                     // 105.000

let server;
let baseUrl;
let tenantId;
let branchId;
let token;

async function req(method, path, { body, headers = {} } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Slug': SLUG,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* body non-JSON */ }
  return { status: res.status, body: json };
}

const post   = (p, body, o) => req('POST', p, { body, ...o });
const get    = (p, o)       => req('GET', p, o);
const del    = (p, o)       => req('DELETE', p, o);

/** Buka shift baru + seed transaksi tunai & non-tunai yang terikat ke shift itu. */
async function bukaShiftDenganPenjualan(openingCash = KAS_AWAL) {
  const res = await post('/api/shifts/open', { branchId, openingCash });
  assert.equal(res.status === 201 || res.status === 200, true,
    `buka shift gagal (${res.status}): ${JSON.stringify(res.body)}`);
  const shiftId = res.body.data.id;

  await prisma.transaction.createMany({
    data: [
      { tenantId, branchId, shiftId, subtotal: PENJUALAN_TUNAI, total: PENJUALAN_TUNAI, paymentMethod: 'cash',  status: 'completed' },
      { tenantId, branchId, shiftId, subtotal: PENJUALAN_QRIS,  total: PENJUALAN_QRIS,  paymentMethod: 'qris',  status: 'completed' },
    ],
  });
  return shiftId;
}

async function bersihkanDataUji() {
  // Transaction hanya punya `tenantId` skalar (tanpa relasi `tenant`), jadi
  // tenant di-resolve dulu dari slug — cleanup ini juga dipanggil SEBELUM seed,
  // saat tenant bisa saja belum ada.
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG }, select: { id: true } });
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
      name: 'Barbershop Uji Kas',
      slug: SLUG,
      email: `${PREFIX}tenant@uji.local`,
      phone: '+628000000001',
      address: 'Jl. Uji Kas No. 1',
      timezone: TZ,
    },
  });
  tenantId = tenant.id;

  const branch = await prisma.branch.create({
    data: { tenantId, name: 'Cabang Kas', code: 'KAS', address: 'Jl. Uji Kas No. 1' },
  });
  branchId = branch.id;

  // Tenant tanpa subscription → semua cabang dianggap berlisensi
  // (lihat utils/branchLicense.js), jadi requireLicensedBranch lolos.

  const hash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.create({
    data: {
      email: EMAIL_KASIR, password: hash, name: 'Kasir Kas', role: 'kasir',
      tenantId, branchId, isActive: true,
    },
  });

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));
  app.use(tenantResolver);
  app.use('/api/auth', authRouter);
  app.use('/api/shifts', shiftsRouter);
  app.use('/api/expenses', expensesRouter);
  app.use(errorHandler);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const login = await post('/api/auth/app-login', { email: EMAIL_KASIR, password: PASSWORD });
  assert.equal(login.status, 200, `login kasir gagal: ${JSON.stringify(login.body)}`);
  token = login.body.data.accessToken;
});

after(async () => {
  await bersihkanDataUji();
  if (server) await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

// ── (a) Server menurunkan branchId/date/category, kiriman klien diabaikan ───
test('(a) cash-out menurunkan branchId/date/category sendiri & mengabaikan kiriman klien', async () => {
  const shiftId = await bukaShiftDenganPenjualan();

  const res = await post(`/api/shifts/${shiftId}/cash-out`, {
    amount: KAS_KELUAR_1,
    description: 'Parkir & konsumsi',
    // Empat field berikut SENGAJA dikirim dengan nilai ngawur — kontrak
    // menjanjikan server yang menentukan, bukan klien.
    branchId: 'cabang-palsu',
    category: 'gaji',
    date: '2020-01-01',
    barberId: 'barber-palsu',
  });

  assert.equal(res.status, 201, `harus 201, dapat ${res.status}: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.data.category, 'operasional', 'category wajib dipaksa "operasional"');
  assert.equal(res.body.data.branchId, branchId, 'branchId wajib dari shift, bukan kiriman klien');
  assert.equal(res.body.data.tenantId, tenantId);
  assert.equal(res.body.data.amount, KAS_KELUAR_1);
  assert.equal(res.body.data.note, null);
  assert.ok(!Number.isNaN(Date.parse(res.body.data.createdAt)), 'createdAt harus ISO-8601 valid');

  // date ditetapkan server = hari ini di zona tenant, disimpan UTC-midnight.
  const row = await prisma.expense.findUnique({ where: { id: res.body.data.id } });
  assert.equal(row.date.toISOString(), `${formatYmdInTz(new Date(), TZ)}T00:00:00.000Z`);
  assert.equal(row.barberId, null, 'barberId kiriman klien tidak boleh tersimpan');
  assert.equal(row.shiftId, shiftId, 'shiftId wajib terisi — inilah yang membuatnya mengurangi kas');
});

// ── (b) summary menghitung expectedCash live, sudah dikurangi kas keluar ────
test('(b) summary: expectedCash live sudah dikurangi kas keluar, QRIS tidak ikut', async () => {
  const shift = await prisma.shift.findFirst({
    where: { branchId, status: 'open' }, orderBy: { openedAt: 'desc' },
  });
  await post(`/api/shifts/${shift.id}/cash-out`, { amount: KAS_KELUAR_2, description: 'Galon air' });

  const { status, body } = await get(`/api/shifts/${shift.id}/summary`);
  assert.equal(status, 200, `summary gagal: ${JSON.stringify(body)}`);

  const s = body.data.summary;
  assert.equal(s.totalCash, PENJUALAN_TUNAI, 'totalCash hanya transaksi tunai');
  assert.equal(s.totalRevenue, PENJUALAN_TUNAI + PENJUALAN_QRIS, 'omzet tetap menghitung QRIS');
  assert.equal(s.totalCashOut, TOTAL_KAS_KELUAR);
  assert.equal(s.cashOut.length, 2);
  assert.equal(s.expectedCash, KAS_SEHARUSNYA,
    'expectedCash live WAJIB sudah dikurangi kas keluar — klien tak boleh mengoreksi lagi');
  // Selagi open, shift.expectedCash jatuh ke nilai live yang sama.
  assert.equal(body.data.shift.expectedCash, KAS_SEHARUSNYA);
});

// ── (c) Hapus entri salah input selagi shift terbuka ────────────────────────
test('(c) DELETE cash-out mengembalikan kas keluar & menolak expense di luar shift', async () => {
  const shift = await prisma.shift.findFirst({
    where: { branchId, status: 'open' }, orderBy: { openedAt: 'desc' },
  });

  const salah = await post(`/api/shifts/${shift.id}/cash-out`, { amount: 99_000, description: 'Salah input' });
  assert.equal(salah.status, 201);

  const sesudahSalah = await get(`/api/shifts/${shift.id}/summary`);
  assert.equal(sesudahSalah.body.data.summary.totalCashOut, TOTAL_KAS_KELUAR + 99_000);

  const hapus = await del(`/api/shifts/${shift.id}/cash-out/${salah.body.data.id}`);
  assert.equal(hapus.status, 200, `hapus gagal: ${JSON.stringify(hapus.body)}`);
  assert.equal(hapus.body.data.id, salah.body.data.id);

  const sesudahHapus = await get(`/api/shifts/${shift.id}/summary`);
  assert.equal(sesudahHapus.body.data.summary.totalCashOut, TOTAL_KAS_KELUAR, 'kas keluar kembali seperti semula');

  // Pengeluaran admin biasa (tanpa shiftId) tak boleh bisa dihapus lewat sini.
  const expenseAdmin = await prisma.expense.create({
    data: { tenantId, branchId, category: 'sewa', description: 'Sewa ruko', amount: 500_000, date: new Date('2026-08-01T00:00:00.000Z') },
  });
  const tolak = await del(`/api/shifts/${shift.id}/cash-out/${expenseAdmin.id}`);
  assert.equal(tolak.status, 404, 'expense tanpa shiftId harus 404, bukan terhapus');
  assert.ok(await prisma.expense.findUnique({ where: { id: expenseAdmin.id } }), 'expense admin harus tetap ada');
});

// ── (d) Kasir memang ditolak di /api/expenses ───────────────────────────────
test('(d) kasir DITOLAK di POST /api/expenses — cash-out satu-satunya jalur sah', async () => {
  const { status } = await post('/api/expenses', {
    category: 'operasional', description: 'Coba lewat jalur admin', amount: 10_000, date: '2026-08-12',
  });
  assert.equal(status, 403, 'kasir harus 403 di /api/expenses (inilah alasan cash-out ada)');
});

// ── (e) Tutup shift dengan selisih disengaja ────────────────────────────────
test('(e) close: selisih, modal ditahan, setoran, dan alasan selisih tersimpan', async () => {
  const shift = await prisma.shift.findFirst({
    where: { branchId, status: 'open' }, orderBy: { openedAt: 'desc' },
  });

  const alasan = 'Kembalian kurang hitung saat ramai';
  const { status, body } = await post(`/api/shifts/${shift.id}/close`, {
    closingCash: KAS_FISIK,
    retainedFloat: MODAL_DITAHAN,
    varianceReason: alasan,
  });

  assert.equal(status, 200, `close gagal: ${JSON.stringify(body)}`);
  const d = body.data;
  assert.equal(d.status, 'closed');
  assert.equal(d.expectedCash, KAS_SEHARUSNYA, 'expectedCash tersimpan = rumus final');
  assert.equal(d.closingCash, KAS_FISIK);
  assert.equal(d.cashDifference, SELISIH, 'selisih = closingCash - expectedCash (kas keluar TIDAK dikurangi dua kali)');
  assert.equal(d.retainedFloat, MODAL_DITAHAN);
  assert.equal(d.depositedAmount, SETORAN, 'setoran = closingCash - modal ditahan');
  assert.equal(d.cashVarianceReason, alasan, 'alasan wajib tersimpan saat ada selisih');
  assert.equal(d.totalRevenue, PENJUALAN_TUNAI + PENJUALAN_QRIS);
});

// ── (f) Shift tertutup menolak kas keluar susulan ───────────────────────────
test('(f) cash-out ke shift yang sudah ditutup ditolak 400', async () => {
  const shift = await prisma.shift.findFirst({
    where: { branchId, status: 'closed' }, orderBy: { closedAt: 'desc' },
  });
  const { status } = await post(`/api/shifts/${shift.id}/cash-out`, { amount: 10_000, description: 'Terlambat' });
  assert.equal(status, 400, 'kas keluar harus dikirim SEBELUM close, bukan sesudah');
});

// ── (g) Tanpa selisih, alasan tidak disimpan ────────────────────────────────
test('(g) varianceReason TIDAK disimpan saat selisih 0 (UI menyembunyikan inputnya)', async () => {
  const shiftId = await bukaShiftDenganPenjualan();
  await post(`/api/shifts/${shiftId}/cash-out`, { amount: KAS_KELUAR_1, description: 'Bensin' });

  const pas = KAS_AWAL + PENJUALAN_TUNAI - KAS_KELUAR_1; // kas fisik tepat
  const { status, body } = await post(`/api/shifts/${shiftId}/close`, {
    closingCash: pas,
    varianceReason: 'alasan ini seharusnya diabaikan',
  });

  assert.equal(status, 200, `close gagal: ${JSON.stringify(body)}`);
  assert.equal(body.data.cashDifference, 0);
  assert.equal(body.data.cashVarianceReason, null, 'tanpa selisih, alasan tidak disimpan');
});

// ── (h) Validasi body ───────────────────────────────────────────────────────
test('(h) cash-out menolak body tak valid', async () => {
  const shiftId = await bukaShiftDenganPenjualan();

  const tanpaDeskripsi = await post(`/api/shifts/${shiftId}/cash-out`, { amount: 5_000 });
  assert.equal(tanpaDeskripsi.status, 400, 'description wajib');

  const nolRupiah = await post(`/api/shifts/${shiftId}/cash-out`, { amount: 0, description: 'Nol' });
  assert.equal(nolRupiah.status, 400, 'amount minimal 1');

  const pecahan = await post(`/api/shifts/${shiftId}/cash-out`, { amount: 1500.5, description: 'Pecahan' });
  assert.equal(pecahan.status, 400, 'amount harus bilangan bulat');

  const tidakAda = await post(`/api/shifts/tidak-ada/cash-out`, { amount: 5_000, description: 'Hantu' });
  assert.equal(tidakAda.status, 404, 'shift tak dikenal harus 404');
});
