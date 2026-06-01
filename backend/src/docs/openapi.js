// OpenAPI 3.0 document — dibangun secara data-driven dari daftar endpoint
// (./endpoints.js) supaya selalu lengkap & gampang dirawat. Disajikan sebagai
// Swagger UI di GET /api/docs dan JSON mentah di GET /api/openapi.json.
//
// Dipakai terutama oleh tim aplikasi Android: autentikasi pakai JWT (Bearer)
// yang sama dengan web, konteks tenant via subdomain atau header X-Tenant-Slug.

const endpoints = require('./endpoints');

const pkgVersion = (() => {
  try { return require('../../package.json').version || '1.0.0'; } catch { return '1.0.0'; }
})();

// path prefix → tag (judul grup di Swagger UI)
const TAG_MAP = [
  ['/api/auth', 'Auth'],
  ['/api/users', 'Staff & Users'],
  ['/api/services', 'Services'],
  ['/api/branches', 'Branches'],
  ['/api/customers', 'Customers & Loyalty'],
  ['/api/transactions', 'POS Transactions'],
  ['/api/queue', 'Queue'],
  ['/api/shifts', 'Shifts'],
  ['/api/bookings', 'Bookings'],
  ['/api/vouchers', 'Vouchers'],
  ['/api/promotions', 'Promotions'],
  ['/api/barber-schedules', 'Barber Schedules'],
  ['/api/barber-ratings', 'Barber Ratings'],
  ['/api/shop-ratings', 'Shop Ratings'],
  ['/api/attendance', 'Attendance'],
  ['/api/reports', 'Reports'],
  ['/api/expenses', 'Expenses'],
  ['/api/packages', 'Packages'],
  ['/api/subscriptions', 'Subscriptions & Billing'],
  ['/api/payment', 'Payment'],
  ['/api/public', 'Public (Customer)'],
];
function tagFor(path) {
  const m = TAG_MAP.find(([p]) => path.startsWith(p));
  return m ? m[1] : 'Other';
}

// Tipe ringkas dari inventaris → JSON Schema.
function mapType(t) {
  const base = String(t || 'string').toLowerCase();
  const nullable = base.includes('null');
  let schema;
  if (base.startsWith('integer')) schema = { type: 'integer' };
  else if (base.startsWith('number')) schema = { type: 'number' };
  else if (base.startsWith('boolean')) schema = { type: 'boolean' };
  else if (base.includes('[]') || base.startsWith('array')) schema = { type: 'array', items: { type: 'string' } };
  else if (base.startsWith('object')) schema = { type: 'object', additionalProperties: true };
  else schema = { type: 'string' };
  if (nullable) schema.nullable = true;
  return schema;
}

// :id → {id} untuk format OpenAPI.
function toOpenapiPath(p) {
  return p.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function opId(method, path) {
  return (method + path).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function buildBodySchema(fields) {
  const properties = {};
  const required = [];
  for (const f of fields) {
    if (f.field.includes('[].')) continue; // sub-field penjelas, sudah tercakup parent array
    properties[f.field] = { ...mapType(f.type), description: f.desc };
    if (f.required) required.push(f.field);
  }
  const schema = { type: 'object', properties };
  if (required.length) schema.required = required;
  return schema;
}

function successCode(ep) {
  if (ep.method === 'POST' && /\b201\b|created/i.test(ep.notes || '')) return '201';
  return '200';
}

const paths = {};
for (const ep of endpoints) {
  const oapiPath = toOpenapiPath(ep.path);
  paths[oapiPath] = paths[oapiPath] || {};

  const parameters = [{ $ref: '#/components/parameters/TenantSlug' }];
  for (const pp of ep.pathParams || []) {
    parameters.push({ name: pp.name, in: 'path', required: true, description: pp.desc, schema: { type: 'string' } });
  }
  for (const qp of ep.queryParams || []) {
    parameters.push({ name: qp.name, in: 'query', required: !!qp.required, description: qp.desc, schema: mapType(qp.type) });
  }

  const op = {
    tags: [tagFor(ep.path)],
    summary: ep.summary,
    description: ep.notes || ep.summary,
    operationId: opId(ep.method, ep.path),
    parameters,
    responses: {
      [successCode(ep)]: {
        description: 'Berhasil',
        content: { 'application/json': { example: ep.responseExample || { success: true } } },
      },
      400: { $ref: '#/components/responses/BadRequest' },
      401: { $ref: '#/components/responses/Unauthorized' },
      403: { $ref: '#/components/responses/Forbidden' },
      404: { $ref: '#/components/responses/NotFound' },
    },
  };
  if (ep.auth === 'bearer') op.security = [{ bearerAuth: [] }];
  if (ep.requestBody && ep.requestBody.length) {
    op.requestBody = { required: true, content: { 'application/json': { schema: buildBodySchema(ep.requestBody) } } };
  }
  paths[oapiPath][ep.method.toLowerCase()] = op;
}

const tagDescriptions = {
  'Auth': 'Login, refresh token, dan profil akun. Mulai dari sini.',
  'Staff & Users': 'Kelola akun staf (admin). Tambah staf di atas kuota → invoice add-on & akun terkunci sampai dibayar.',
  'Services': 'Layanan/jasa yang ditawarkan toko.',
  'Branches': 'Cabang toko (geofence absensi, lisensi cabang).',
  'Customers & Loyalty': 'Pelanggan, poin loyalti, dan riwayat poin.',
  'POS Transactions': 'Transaksi kasir (POS): buat transaksi, ringkasan, batal/refund.',
  'Queue': 'Papan antrian per cabang.',
  'Shifts': 'Buka/tutup shift kasir & ringkasan kas.',
  'Bookings': 'Booking/janji temu (internal & check-in ke antrian).',
  'Vouchers': 'Voucher diskon toko (validasi & redeem di POS).',
  'Promotions': 'Promo platform (super-admin).',
  'Barber Schedules': 'Jadwal kerja barber per minggu.',
  'Barber Ratings': 'Rating per barber + moderasi.',
  'Shop Ratings': 'Rating toko secara keseluruhan.',
  'Attendance': 'Absensi staf berbasis GPS (check-in/out, jadwal, rekap).',
  'Reports': 'Laporan omzet, barber, pelanggan, payroll, wilayah.',
  'Expenses': 'Pencatatan pengeluaran toko (fitur expense_tracking).',
  'Packages': 'Daftar paket langganan.',
  'Subscriptions & Billing': 'Langganan, invoice, pause/resume, renew.',
  'Payment': 'Order pembayaran Duitku (subscription/upgrade/add-on).',
  'Public (Customer)': 'Endpoint publik tanpa login untuk aplikasi/halaman pelanggan: booking online, ketersediaan slot, lookup, rating via link. Wajib konteks tenant (X-Tenant-Slug).',
};
const tags = [...new Set(endpoints.map((e) => tagFor(e.path)))].map((name) => ({
  name,
  description: tagDescriptions[name] || undefined,
}));

const description = `
Dokumentasi REST API **SembaPOS** untuk kebutuhan aplikasi **Android** (semua peran: kasir/POS, barber, owner/admin, pelanggan).

## Autentikasi (JWT)
1. **Login** \`POST /api/auth/login\` dengan \`{ email, password }\` → dapat \`accessToken\` (umur pendek) + \`refreshToken\` (7 hari).
2. Sertakan access token di setiap request: header **\`Authorization: Bearer <accessToken>\`**.
3. Saat access token kedaluwarsa (401), tukar dengan **\`POST /api/auth/refresh\`** \`{ refreshToken }\` → \`accessToken\` baru. Refresh token tidak dirotasi.
4. **Logout** \`POST /api/auth/logout\` mencabut refresh token.

> Tekan tombol **Authorize** di kanan atas, tempel access token (tanpa kata "Bearer"), lalu coba endpoint langsung dari halaman ini.

## Konteks Tenant (WAJIB)
Setiap toko = satu *tenant*. Tentukan tenant dengan salah satu cara:
- **Subdomain** (disarankan untuk web): panggil \`https://<slug>.sembapos.com/api/...\`
- **Header** (disarankan untuk Android): panggil base \`https://sembapos.com/api/...\` + header **\`X-Tenant-Slug: <slug>\`** (mis. \`termul\`).

Kebijakan login terikat domain: akun tenant **harus** login lewat tenant-nya (subdomain atau X-Tenant-Slug yang benar), bukan domain utama polos.

## Format Respons
- Sukses: \`{ "success": true, "data": ... }\` (beberapa menambah \`meta\`).
- Gagal: \`{ "success": false, "error": "<pesan>" }\` dengan kode HTTP yang sesuai (400/401/403/404/409/422/402).
- Pagination umum: \`data: { data: [...], total, page, limit, totalPages }\` (sebagian pakai cursor: \`meta.nextCursor\`, \`meta.hasMore\`).

## Peran (role)
\`super_admin\` (platform) · \`tenant_admin\` (owner toko) · \`kasir\` · \`barber\` · \`customer\`. Tiap endpoint mencantumkan peran yang diizinkan; pelanggaran → 403. Banyak endpoint juga membatasi data ke tenant/cabang milik pemanggil.

## Catatan tambahan
- Rupiah disimpan sebagai **integer** (tanpa desimal).
- Upload (mis. selfie absensi) pakai \`multipart/form-data\`.
- Realtime: server mem-broadcast event via Socket.IO (\`/socket.io/\`) ke room tenant — opsional untuk Android.
`;

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'SembaPOS API',
    version: pkgVersion,
    description,
    contact: { name: 'SembaPOS', url: 'https://sembapos.com' },
  },
  servers: [
    { url: 'https://{tenant}.sembapos.com/api', description: 'Produksi via subdomain tenant', variables: { tenant: { default: 'demo', description: 'Slug tenant toko' } } },
    { url: 'https://sembapos.com/api', description: 'Produksi via header X-Tenant-Slug' },
  ],
  tags,
  paths,
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Access token JWT dari /api/auth/login. Tempel token mentah (tanpa "Bearer ").' },
    },
    parameters: {
      TenantSlug: {
        name: 'X-Tenant-Slug', in: 'header', required: false,
        description: 'Slug tenant (mis. "termul"). WAJIB jika memanggil base domain sembapos.com. Tidak perlu bila memakai subdomain tenant.',
        schema: { type: 'string' },
      },
    },
    responses: {
      BadRequest: { description: 'Input tidak valid / aturan bisnis dilanggar', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { success: false, error: 'Invalid input' } } } },
      Unauthorized: { description: 'Token tidak ada / kedaluwarsa', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { success: false, error: 'Unauthorized' } } } },
      Forbidden: { description: 'Tidak berhak (peran/tenant/cabang)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { success: false, error: 'Access denied' } } } },
      NotFound: { description: 'Sumber daya tidak ditemukan', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { success: false, error: 'Not found' } } } },
    },
    schemas: {
      Error: { type: 'object', properties: { success: { type: 'boolean', example: false }, error: { type: 'string' } } },
      Success: { type: 'object', properties: { success: { type: 'boolean', example: true }, data: {} } },
    },
  },
  security: [{ bearerAuth: [] }],
};
