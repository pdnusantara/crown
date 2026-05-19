// WhatsApp notifikasi — provider: WA Gateway (wagat.web.id, berbasis Baileys).
//
// Sebelumnya tiap tenant menjalankan satu instance Chrome (whatsapp-web.js +
// Puppeteer) DI SERVER UTAMA — berat di RAM/CPU dan dibatasi WA_MAX_CLIENTS.
// Sekarang seluruh sesi WhatsApp dijalankan oleh gateway eksternal; server
// utama hanya memanggil REST API. Tidak ada Chrome yang dijalankan di sini.
//
// Arsitektur: satu akun wagat (satu API key) dipakai bersama. Tiap tenant
// Crown punya satu "device" sendiri di akun itu — jadi tiap tenant kirim dari
// nomor WhatsApp masing-masing. Pesan dirutekan via `deviceId`.
//
// Konfigurasi gateway (apiKey, baseUrl, webhookSecret, enabled) disimpan di
// tabel SystemSetting dan dikelola lewat halaman super-admin; env hanya jadi
// fallback awal. Signature fungsi yang diekspor dipertahankan supaya route
// dan pemanggil notifikasi tidak perlu diubah.

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const prisma = require('../config/database');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const STORAGE_DIR = path.join(ROOT_DIR, 'storage');
// Pengaturan yang dikontrol pengguna (boleh ditampilkan ke UI).
const SETTINGS_FILE = path.join(STORAGE_DIR, 'whatsapp-settings.json');
// Pemetaan tenant → deviceId di gateway.
const DEVICES_FILE = path.join(STORAGE_DIR, 'wagat-devices.json');

const REQUEST_TIMEOUT_MS = Number(process.env.WAGAT_TIMEOUT_MS) || 15000;
const CONFIG_TTL_MS = 30000; // cache config SystemSetting
const STATUS_TTL_MS = 2000;  // cache status per-tenant agar polling FE ringan

// wagat state machine: DISCONNECTED → CONNECTING → QR_READY → CONNECTED,
// plus LOGGED_OUT/AUTH_FAILED. Dipetakan ke kosakata status yang sudah
// dipahami UI lama supaya WhatsAppCard tidak perlu diubah.
const STATUS_MAP = {
  CONNECTED: 'connected',
  CONNECTING: 'connecting',
  INITIALIZING: 'connecting',
  QR_READY: 'awaiting_qr',
  DISCONNECTED: 'disconnected',
  LOGGED_OUT: 'disconnected',
  AUTH_FAILED: 'auth_failed',
};

const LIMITATIONS = [
  'Sesi WhatsApp dapat logout jika Anda logout dari aplikasi WhatsApp di HP.',
  'Wajib scan ulang QR jika sesi terputus.',
  'Gunakan nomor khusus operasional agar risiko blokir lebih kecil.',
  'Notifikasi dikirim lewat WA Gateway (layanan pihak ketiga).',
];

const SETTING_KEYS = ['wagat_api_key', 'wagat_base_url', 'wagat_webhook_secret', 'wagat_enabled'];

let settingsCache = null;
let devicesCache = null;
let configCache = null;
let configCacheAt = 0;
const statusCache = new Map(); // tenantId → { at, data }

// ── Konfigurasi gateway (SystemSetting + fallback env) ────────────────────────

async function getConfig(force = false) {
  if (!force && configCache && Date.now() - configCacheAt < CONFIG_TTL_MS) {
    return configCache;
  }
  let rows = [];
  try {
    rows = await prisma.systemSetting.findMany({ where: { key: { in: SETTING_KEYS } } });
  } catch {
    /* DB belum siap — pakai env saja */
  }
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  configCache = {
    apiKey: m.wagat_api_key || process.env.WAGAT_API_KEY || '',
    baseUrl: (m.wagat_base_url || process.env.WAGAT_BASE_URL || 'https://wagat.web.id/api/v1').replace(/\/+$/, ''),
    webhookSecret: m.wagat_webhook_secret || process.env.WAGAT_WEBHOOK_SECRET || '',
    // Default aktif bila baris belum pernah dibuat.
    enabled: m.wagat_enabled === undefined ? true : m.wagat_enabled === 'true',
  };
  configCacheAt = Date.now();
  return configCache;
}

async function updateConfig(patch) {
  const entries = [];
  if (patch.apiKey !== undefined) entries.push(['wagat_api_key', String(patch.apiKey).trim()]);
  if (patch.baseUrl !== undefined) entries.push(['wagat_base_url', String(patch.baseUrl).trim()]);
  if (patch.webhookSecret !== undefined) entries.push(['wagat_webhook_secret', String(patch.webhookSecret).trim()]);
  if (patch.enabled !== undefined) entries.push(['wagat_enabled', String(!!patch.enabled)]);
  for (const [key, value] of entries) {
    await prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  configCache = null;
  return getConfig(true);
}

function maskSecret(s) {
  if (!s) return '';
  if (s.length <= 12) return '••••••';
  return `${s.slice(0, 6)}••••${s.slice(-4)}`;
}

// Bentuk aman untuk halaman super-admin — secret tidak pernah dikirim utuh.
async function getConfigPublic() {
  const c = await getConfig(true);
  return {
    baseUrl: c.baseUrl,
    enabled: c.enabled,
    apiKeySet: !!c.apiKey,
    apiKeyMasked: maskSecret(c.apiKey),
    webhookSecretSet: !!c.webhookSecret,
    webhookSecretMasked: maskSecret(c.webhookSecret),
    configured: !!c.apiKey,
  };
}

// Cek koneksi ke gateway dengan kredensial saat ini.
async function testConfig() {
  const config = await getConfig(true);
  if (!config.apiKey) {
    const e = new Error('API key belum diisi.');
    e.code = 'NOT_CONFIGURED';
    throw e;
  }
  const list = unwrap(await wagatFetch(config, '/me/devices', { headers: apiHeaders(config) }));
  const devices = Array.isArray(list) ? list : list?.devices || [];
  return { ok: true, deviceCount: devices.length };
}

// ── Penyimpanan file ──────────────────────────────────────────────────────────

async function ensureStorage() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

async function readJsonFile(file) {
  await ensureStorage();
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return {};
  }
}

async function writeJsonFile(file, data) {
  await ensureStorage();
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

async function readSettings() {
  if (!settingsCache) settingsCache = await readJsonFile(SETTINGS_FILE);
  return settingsCache;
}

async function readDevices() {
  if (!devicesCache) devicesCache = await readJsonFile(DEVICES_FILE);
  return devicesCache;
}

function defaultTenantSettings() {
  return {
    enabled: false,
    notifyAdminPhone: '',
    notifyCustomer: false,
    updatedAt: null,
  };
}

async function getTenantSettings(tenantId) {
  const all = await readSettings();
  return { ...defaultTenantSettings(), ...(all[tenantId] || {}) };
}

async function updateTenantSettings(tenantId, patch) {
  const all = await readSettings();
  const merged = {
    ...defaultTenantSettings(),
    ...(all[tenantId] || {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  all[tenantId] = merged;
  settingsCache = all;
  await writeJsonFile(SETTINGS_FILE, all);
  invalidateStatus(tenantId); // status memuat settings → segarkan
  return merged;
}

async function getTenantDevice(tenantId) {
  const all = await readDevices();
  return all[tenantId] || null;
}

async function saveTenantDevice(tenantId, record) {
  const all = await readDevices();
  all[tenantId] = { ...(all[tenantId] || {}), ...record };
  devicesCache = all;
  await writeJsonFile(DEVICES_FILE, all);
  return all[tenantId];
}

// ── Util nomor ────────────────────────────────────────────────────────────────

function normalizePhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

// ── Klien HTTP gateway ────────────────────────────────────────────────────────

function unwrap(json) {
  return json && typeof json === 'object' && json.data !== undefined ? json.data : json;
}

function apiHeaders(config, extra = {}) {
  return { 'x-api-key': config.apiKey, ...extra };
}

// Pastikan gateway siap dipakai: aktif + API key terisi.
function assertReady(config) {
  if (!config.enabled) {
    const e = new Error('Integrasi WhatsApp Gateway dinonaktifkan oleh admin.');
    e.code = 'NOT_CONFIGURED';
    throw e;
  }
  if (!config.apiKey) {
    const e = new Error('WhatsApp Gateway belum dikonfigurasi (API key kosong).');
    e.code = 'NOT_CONFIGURED';
    throw e;
  }
}

async function wagatFetch(config, pathname, { method = 'GET', headers = {}, body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${config.baseUrl}${pathname}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    const e = new Error(
      aborted
        ? `Timeout menghubungi WA Gateway (${REQUEST_TIMEOUT_MS / 1000}s).`
        : `Gagal menghubungi WA Gateway: ${err?.message || err}`
    );
    e.code = aborted ? 'TIMEOUT' : 'GATEWAY_UNREACHABLE';
    throw e;
  } finally {
    clearTimeout(timer);
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* sebagian respons (mis. 202) bisa tanpa body JSON */
  }

  if (!res.ok) {
    const e = new Error(json?.message || json?.error || `WA Gateway error HTTP ${res.status}`);
    e.code = json?.error || `HTTP_${res.status}`;
    e.httpStatus = res.status;
    throw e;
  }
  return json;
}

// ── Device per-tenant ─────────────────────────────────────────────────────────

// Pastikan tenant punya satu device di gateway. Idempoten: jika deviceId
// sudah tersimpan, atau sudah ada device dengan nama yang sama di akun,
// dipakai ulang — tidak membuat device baru.
async function ensureDevice(tenantId) {
  const existing = await getTenantDevice(tenantId);
  if (existing?.deviceId) return existing;

  const config = await getConfig();
  assertReady(config);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true },
  });
  if (!tenant) {
    const e = new Error('Tenant tidak ditemukan.');
    e.code = 'TENANT_NOT_FOUND';
    throw e;
  }

  // slug tenant nullable — pakai fallback berbasis id agar nama device unik.
  const deviceName = (tenant.slug || `t-${tenant.id}`).toLowerCase();

  // Cek apakah device dengan nama ini sudah ada (mis. file pemetaan hilang).
  const list = unwrap(await wagatFetch(config, '/me/devices', { headers: apiHeaders(config) }));
  const devices = Array.isArray(list) ? list : list?.devices || [];
  let device = devices.find((d) => d.name === deviceName);

  if (!device) {
    device = unwrap(
      await wagatFetch(config, '/me/devices', {
        method: 'POST',
        headers: apiHeaders(config),
        body: { name: deviceName },
      })
    );
  }

  const deviceId = device?.id || device?.deviceId;
  if (!deviceId) {
    const e = new Error('WA Gateway tidak mengembalikan deviceId.');
    e.code = 'PROVISION_FAILED';
    throw e;
  }

  return saveTenantDevice(tenantId, {
    deviceId,
    deviceName,
    createdAt: existing?.createdAt || new Date().toISOString(),
  });
}

// ── Koneksi (QR pairing) ──────────────────────────────────────────────────────

async function connectTenant(tenantId) {
  const config = await getConfig();
  assertReady(config);
  const device = await ensureDevice(tenantId);
  await wagatFetch(config, `/me/devices/${encodeURIComponent(device.deviceId)}/whatsapp/connect`, {
    method: 'POST',
    headers: apiHeaders(config),
  });
  invalidateStatus(tenantId);
  return getTenantStatus(tenantId);
}

async function disconnectTenant(tenantId) {
  const config = await getConfig();
  const device = await getTenantDevice(tenantId);
  if (device?.deviceId && config.apiKey) {
    try {
      await wagatFetch(config, `/me/devices/${encodeURIComponent(device.deviceId)}/whatsapp/disconnect`, {
        method: 'POST',
        headers: apiHeaders(config),
      });
    } catch (err) {
      console.error(`[WA] disconnect tenant=${tenantId} gagal:`, err.message);
    }
  }
  invalidateStatus(tenantId);
  return getTenantStatus(tenantId);
}

// Lepas device tenant dari gateway sepenuhnya — dipakai saat tenant dihapus.
// Best-effort: kegagalan jaringan tidak boleh menghambat penghapusan tenant.
async function removeTenantDevice(tenantId) {
  const device = await getTenantDevice(tenantId);
  invalidateStatus(tenantId);
  if (!device?.deviceId) return { removed: false, reason: 'no_device' };

  const config = await getConfig();
  if (config.apiKey) {
    const dev = encodeURIComponent(device.deviceId);
    try {
      await wagatFetch(config, `/me/devices/${dev}/whatsapp/disconnect`, {
        method: 'POST',
        headers: apiHeaders(config),
      });
    } catch { /* sudah disconnect / tak terjangkau — abaikan */ }
    try {
      await wagatFetch(config, `/me/devices/${dev}`, {
        method: 'DELETE',
        headers: apiHeaders(config),
      });
    } catch (err) {
      console.error(`[WA] hapus device tenant=${tenantId} gagal:`, err.message);
    }
  }

  // Lepas pemetaan lokal apa pun hasil panggilan gateway.
  const all = await readDevices();
  delete all[tenantId];
  devicesCache = all;
  await writeJsonFile(DEVICES_FILE, all);
  return { removed: true };
}

function mapWagatStatus(raw) {
  if (!raw) return 'idle';
  return STATUS_MAP[String(raw).toUpperCase()] || 'idle';
}

function invalidateStatus(tenantId) {
  if (tenantId) statusCache.delete(tenantId);
  else statusCache.clear();
}

async function getTenantStatus(tenantId) {
  // Cache singkat: polling FE (tiap 2,5–10 dtk dari banyak admin) tidak perlu
  // memicu panggilan keluar ke gateway tiap kali.
  const cached = statusCache.get(tenantId);
  if (cached && Date.now() - cached.at < STATUS_TTL_MS) {
    return cached.data;
  }

  const settings = await getTenantSettings(tenantId);
  const config = await getConfig();
  const base = {
    status: 'idle',
    qrDataUrl: null,
    lastError: null,
    lastConnectedAt: null,
    phoneNumber: null,
    // dipertahankan agar bentuk respons kompatibel dengan UI lama
    loadingPercent: null,
    loadingMessage: null,
    settings,
    notifyAdminPhoneNormalized: normalizePhone(settings.notifyAdminPhone),
    provider: 'wagat',
    beta: true,
    limitations: LIMITATIONS,
  };

  let result = base;
  const device = await getTenantDevice(tenantId);

  if (!config.enabled) {
    result = { ...base, status: 'idle', lastError: 'Integrasi WhatsApp dinonaktifkan oleh admin.' };
  } else if (!config.apiKey) {
    result = { ...base, status: 'idle', lastError: 'WhatsApp Gateway belum dikonfigurasi.' };
  } else if (device?.deviceId) {
    try {
      const data = unwrap(
        await wagatFetch(config, `/me/devices/${encodeURIComponent(device.deviceId)}/whatsapp/status`, {
          headers: apiHeaders(config),
        })
      );
      result = {
        ...base,
        status: mapWagatStatus(data?.status),
        qrDataUrl: data?.qrDataUrl || null,
        phoneNumber: data?.phoneNumber || null,
        lastConnectedAt: data?.connectedAt || data?.waConnectedAt || null,
      };
    } catch (err) {
      result = { ...base, status: 'error', lastError: err.message };
    }
  }

  statusCache.set(tenantId, { at: Date.now(), data: result });
  return result;
}

// ── Webhook ───────────────────────────────────────────────────────────────────

// Verifikasi tanda tangan HMAC-SHA256 (header x-webhook-signature) dari raw
// body webhook gateway. timing-safe comparison.
async function verifyWebhookSignature(rawBody, signature) {
  const config = await getConfig();
  if (!config.webhookSecret || !signature) return false;
  const expected = crypto
    .createHmac('sha256', config.webhookSecret)
    .update(rawBody || '')
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function findTenantByDeviceId(deviceId) {
  if (!deviceId) return null;
  const all = await readDevices();
  for (const [tid, d] of Object.entries(all)) {
    if (d.deviceId === deviceId) return tid;
  }
  return null;
}

// ── Pengiriman pesan ──────────────────────────────────────────────────────────

function buildTransactionMessage(transaction) {
  const lines = [
    'Transaksi baru (MVP Beta)',
    `ID: ${transaction.id}`,
    `Cabang: ${transaction.branch?.name || '-'}`,
    `Total: Rp ${Number(transaction.total || 0).toLocaleString('id-ID')}`,
    `Pembayaran: ${transaction.paymentMethod || '-'}`,
    `Waktu: ${new Date(transaction.createdAt || Date.now()).toLocaleString('id-ID')}`,
  ];
  if (transaction.customer?.name) lines.push(`Pelanggan: ${transaction.customer.name}`);
  return lines.join('\n');
}

// Kirim satu pesan via gateway dari device milik tenant ini. `idempotencyKey`
// mencegah duplikasi saat pemanggil melakukan retry.
async function dispatchMessage(tenantId, phone, text, idempotencyKey) {
  const to = normalizePhone(phone);
  if (!to) return { sent: false, reason: 'invalid_phone' };

  const config = await getConfig();
  if (!config.enabled) return { sent: false, reason: 'disabled_global' };
  if (!config.apiKey) return { sent: false, reason: 'not_configured' };

  const device = await getTenantDevice(tenantId);
  if (!device?.deviceId) return { sent: false, reason: 'not_connected' };

  const headers = apiHeaders(config);
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const resp = unwrap(
    await wagatFetch(config, '/send', {
      method: 'POST',
      headers,
      // deviceId eksplisit → pesan dikirim dari nomor WhatsApp tenant ini.
      body: { to, message: text, deviceId: device.deviceId, source: 'pos' },
    })
  );
  return { sent: true, messageId: resp?.messageId || null, status: resp?.status || 'queued' };
}

async function sendTransactionNotification(tenantId, transaction) {
  const settings = await getTenantSettings(tenantId);
  const txId = transaction?.id || '?';

  if (!settings.enabled) {
    console.log(`[WA] tx=${txId} tenant=${tenantId} → SKIP (notifikasi disabled)`);
    return { sent: false, reason: 'disabled' };
  }

  const summary = buildTransactionMessage(transaction);
  const sentTargets = [];

  if (settings.notifyAdminPhone) {
    try {
      const r = await dispatchMessage(tenantId, settings.notifyAdminPhone, summary, `tx-${txId}-admin`);
      if (r.sent) {
        sentTargets.push('admin');
        console.log(`[WA] tx=${txId} → admin OK (${r.messageId || 'queued'})`);
      } else {
        console.log(`[WA] tx=${txId} → admin SKIP (${r.reason})`);
      }
    } catch (err) {
      console.error(`[WA] tx=${txId} → admin GAGAL:`, err.message);
    }
  } else {
    console.log(`[WA] tx=${txId} → admin SKIP (nomor admin kosong)`);
  }

  if (settings.notifyCustomer && transaction.customer?.phone) {
    try {
      const r = await dispatchMessage(
        tenantId,
        transaction.customer.phone,
        `Terima kasih sudah bertransaksi.\n${summary}`,
        `tx-${txId}-cust`
      );
      if (r.sent) {
        sentTargets.push('customer');
        console.log(`[WA] tx=${txId} → customer OK`);
      }
    } catch (err) {
      console.error(`[WA] tx=${txId} → customer GAGAL:`, err.message);
    }
  }

  return { sent: sentTargets.length > 0, targets: sentTargets };
}

// Tombol "Kirim Pesan Tes" di Settings → WhatsApp.
async function sendTestMessage(tenantId) {
  const settings = await getTenantSettings(tenantId);
  if (!normalizePhone(settings.notifyAdminPhone)) {
    const err = new Error('Nomor admin belum diisi atau formatnya tidak valid.');
    err.code = 'INVALID_PHONE';
    throw err;
  }

  const status = await getTenantStatus(tenantId);
  if (status.status !== 'connected') {
    const err = new Error('WhatsApp belum tersambung. Hubungkan dan scan QR dulu.');
    err.code = 'NOT_CONNECTED';
    throw err;
  }

  const body = [
    'Pesan tes BarberOS',
    '',
    'Jika Anda menerima pesan ini, integrasi WhatsApp sudah berfungsi.',
    `Waktu kirim: ${new Date().toLocaleString('id-ID')}`,
  ].join('\n');

  const r = await dispatchMessage(tenantId, settings.notifyAdminPhone, body, `test-${tenantId}-${Date.now()}`);
  if (!r.sent) {
    const err = new Error(`Gagal mengirim pesan tes (${r.reason || 'unknown'}).`);
    err.code = 'NOT_CONNECTED';
    throw err;
  }
  return { sent: true, target: normalizePhone(settings.notifyAdminPhone) };
}

// Kirim pesan sistem sembarang (mis. notifikasi langganan). Best-effort —
// tidak melempar error, hanya mengembalikan {sent:false} bila gagal.
async function sendSystemMessage(tenantId, phone, text) {
  try {
    return await dispatchMessage(tenantId, phone, text);
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

module.exports = {
  connectTenant,
  disconnectTenant,
  removeTenantDevice,
  getTenantStatus,
  getTenantSettings,
  updateTenantSettings,
  sendTransactionNotification,
  sendTestMessage,
  sendSystemMessage,
  // konfigurasi gateway (super-admin)
  getConfig,
  getConfigPublic,
  updateConfig,
  testConfig,
  // webhook
  verifyWebhookSignature,
  findTenantByDeviceId,
  invalidateStatus,
};
