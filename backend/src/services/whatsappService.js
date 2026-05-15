const fs = require('fs/promises');
const path = require('path');

let waLib = null;
let qrcodeLib = null;

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const STORAGE_DIR = path.join(ROOT_DIR, 'storage');
const SETTINGS_FILE = path.join(STORAGE_DIR, 'whatsapp-settings.json');
const SESSION_DIR = path.join(STORAGE_DIR, 'wa-sessions');

// Resource budget — bisa di-override via env. Defaults disetel konservatif
// untuk VPS kecil.
const IDLE_TIMEOUT_MS = (Number(process.env.WA_IDLE_TIMEOUT_MINUTES) || 30) * 60 * 1000;
const MAX_ACTIVE_CLIENTS = Number(process.env.WA_MAX_CLIENTS) || 8;
const RECONNECT_WAIT_MS = (Number(process.env.WA_RECONNECT_WAIT_SECONDS) || 25) * 1000;

const ACTIVE_STATUSES = new Set(['connecting', 'awaiting_qr', 'authenticated', 'loading', 'connected']);

const clients = new Map();
let settingsCache = null;

async function ensureStorage() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  await fs.mkdir(SESSION_DIR, { recursive: true });
}

async function readSettings() {
  if (settingsCache) return settingsCache;
  await ensureStorage();
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    settingsCache = JSON.parse(raw);
  } catch {
    settingsCache = {};
  }
  return settingsCache;
}

async function writeSettings(next) {
  settingsCache = next;
  await ensureStorage();
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
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
  await writeSettings(all);
  return merged;
}

function normalizePhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

function toWhatsappJid(input) {
  const normalized = normalizePhone(input);
  if (!normalized) return null;
  return `${normalized}@c.us`;
}

function getClientState(tenantId) {
  if (!clients.has(tenantId)) {
    clients.set(tenantId, {
      client: null,
      status: 'idle',
      qrDataUrl: null,
      lastError: null,
      lastConnectedAt: null,
      lastActivityAt: null,
      loadingPercent: null,
      loadingMessage: null,
      idleTimer: null,
    });
  }
  return clients.get(tenantId);
}

function countActiveClients(excludeTenantId = null) {
  let n = 0;
  for (const [tid, s] of clients.entries()) {
    if (tid === excludeTenantId) continue;
    if (ACTIVE_STATUSES.has(s.status)) n += 1;
  }
  return n;
}

function clearIdleTimer(state) {
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }
}

// Reset timer setelah aktivitas: client baru ready / setiap kirim pesan sukses.
// Setelah idle, client di-destroy untuk membebaskan Chrome (sesi tetap di disk).
function armIdleTimer(tenantId) {
  const state = getClientState(tenantId);
  clearIdleTimer(state);
  state.lastActivityAt = new Date().toISOString();
  if (!IDLE_TIMEOUT_MS) return;
  state.idleTimer = setTimeout(async () => {
    if (state.status !== 'connected') return;
    console.log(`[WA:${tenantId}] idle ${IDLE_TIMEOUT_MS / 60000} menit → sleep (sesi tersimpan)`);
    if (state.client) {
      try { await state.client.destroy(); } catch {}
    }
    state.client = null;
    state.status = 'idle_sleeping';
    state.qrDataUrl = null;
    state.loadingPercent = null;
    state.loadingMessage = null;
  }, IDLE_TIMEOUT_MS);
}

async function ensureWhatsappLibs() {
  if (!waLib) waLib = require('whatsapp-web.js');
  if (!qrcodeLib) qrcodeLib = require('qrcode');
  return { waLib, qrcodeLib };
}

async function connectTenant(tenantId) {
  const state = getClientState(tenantId);
  // Jangan bikin client baru kalau sudah ada proses berjalan / sudah online —
  // termasuk state intermediate authenticated/loading.
  if (ACTIVE_STATUSES.has(state.status)) {
    return state;
  }

  // Resource budget: tolak kalau sudah di kapasitas. Tenant ini sendiri
  // dikecualikan dari hitungan supaya reconnect dari status idle/error tetap
  // boleh.
  const active = countActiveClients(tenantId);
  if (active >= MAX_ACTIVE_CLIENTS) {
    state.status = 'capacity_exceeded';
    state.lastError = `Server sedang melayani ${active} tenant WhatsApp aktif (maks ${MAX_ACTIVE_CLIENTS}). Coba lagi nanti.`;
    const err = new Error(state.lastError);
    err.code = 'WA_CAPACITY';
    throw err;
  }

  try {
    const { waLib: wwebjs, qrcodeLib: qrcode } = await ensureWhatsappLibs();
    const { Client, LocalAuth } = wwebjs;

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: `tenant-${tenantId}`,
        dataPath: SESSION_DIR,
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          // Hemat RAM/CPU: tidak butuh GPU/3D di headless WhatsApp Web.
          '--disable-gpu',
          '--disable-software-rasterizer',
          // Cegah Chrome download font/asset besar yg tidak perlu.
          '--disable-extensions',
          '--disable-component-update',
          '--disable-default-apps',
          '--disable-sync',
          '--disable-translate',
          '--mute-audio',
          // Cap heap V8 di renderer Chrome supaya tidak meledak ke 1GB+.
          '--js-flags=--max-old-space-size=160',
        ],
        executablePath: process.env.WA_CHROME_PATH || undefined,
      },
    });

    state.client = client;
    state.status = 'connecting';
    state.qrDataUrl = null;
    state.lastError = null;
    state.loadingPercent = null;
    state.loadingMessage = null;

    const log = (...args) => console.log(`[WA:${tenantId}]`, ...args);

    client.on('qr', async (qr) => {
      // Setelah authenticated, jangan turunkan status balik ke awaiting_qr —
      // WA web kadang re-emit qr saat re-pairing meski sebenarnya sudah linked.
      if (state.status === 'authenticated' || state.status === 'loading' || state.status === 'connected') {
        log('qr event diabaikan — sudah authenticated');
        return;
      }
      state.status = 'awaiting_qr';
      state.lastError = null;
      state.qrDataUrl = await qrcode.toDataURL(qr);
      log('qr emitted (menunggu scan)');
    });

    // Fired setelah scan QR sukses, sebelum ready. Pesan belum bisa dikirim
    // di state ini, tapi user sudah selesai scan — UI harus berhenti
    // menampilkan QR.
    client.on('authenticated', () => {
      state.status = 'authenticated';
      state.qrDataUrl = null;
      state.lastError = null;
      log('authenticated — scan sukses, menunggu loading_screen');
    });

    // Fired berulang dengan progress 0..100 saat WA web memuat chat.
    client.on('loading_screen', (percent, message) => {
      state.status = 'loading';
      state.qrDataUrl = null;
      state.loadingPercent = Number(percent) || 0;
      state.loadingMessage = message || null;
      log(`loading_screen ${percent}% ${message || ''}`);
    });

    client.on('ready', () => {
      state.status = 'connected';
      state.qrDataUrl = null;
      state.lastError = null;
      state.loadingPercent = null;
      state.loadingMessage = null;
      state.lastConnectedAt = new Date().toISOString();
      armIdleTimer(tenantId);
      log(`READY — siap kirim pesan (idle timeout ${IDLE_TIMEOUT_MS / 60000}m)`);
    });

    client.on('auth_failure', (message) => {
      state.status = 'auth_failed';
      state.lastError = message || 'Authentication failed';
      state.qrDataUrl = null;
      log('auth_failure:', message);
    });

    client.on('disconnected', (reason) => {
      state.status = 'disconnected';
      state.lastError = reason || 'Disconnected';
      state.qrDataUrl = null;
      state.client = null;
      clearIdleTimer(state);
      log('disconnected:', reason);
    });

    client.on('change_state', (s) => log('change_state →', s));

    await client.initialize();
  } catch (err) {
    state.status = 'error';
    state.lastError = err?.message || 'Failed to initialize WhatsApp client';
    state.qrDataUrl = null;
    state.client = null;
  }

  return state;
}

async function disconnectTenant(tenantId) {
  const state = getClientState(tenantId);
  clearIdleTimer(state);
  if (state.client) {
    try {
      await state.client.destroy();
    } catch {}
  }
  state.client = null;
  state.status = 'disconnected';
  state.qrDataUrl = null;
  state.loadingPercent = null;
  state.loadingMessage = null;
  return state;
}

// Pastikan tenant terhubung. Kalau idle_sleeping/disconnected/error, coba
// connect ulang (sesi LocalAuth restore otomatis — tidak perlu QR). Kalau
// jadi masuk awaiting_qr berarti sesi tidak valid lagi → throw, jangan tunggu.
async function ensureConnected(tenantId, timeoutMs = RECONNECT_WAIT_MS) {
  const state = getClientState(tenantId);
  if (state.status === 'connected' && state.client) return state;

  // Status final yang butuh aksi admin manual.
  if (state.status === 'awaiting_qr') {
    const e = new Error('WhatsApp menunggu scan QR. Hubungkan kembali via Settings.');
    e.code = 'NEEDS_QR';
    throw e;
  }
  if (state.status === 'auth_failed') {
    const e = new Error('Autentikasi WhatsApp gagal. Hubungkan kembali via Settings.');
    e.code = 'AUTH_FAILED';
    throw e;
  }

  if (!ACTIVE_STATUSES.has(state.status)) {
    // capacity error langsung naik ke caller
    await connectTenant(tenantId);
  }

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (state.status === 'connected' && state.client) return state;
    if (state.status === 'awaiting_qr') {
      const e = new Error('Sesi WhatsApp expired. Scan ulang QR via Settings.');
      e.code = 'NEEDS_QR';
      throw e;
    }
    if (state.status === 'auth_failed' || state.status === 'error' || state.status === 'capacity_exceeded') {
      const e = new Error(state.lastError || 'WhatsApp gagal terhubung.');
      e.code = state.status.toUpperCase();
      throw e;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const e = new Error(`Timeout reconnect WhatsApp (${timeoutMs / 1000}s). Coba lagi.`);
  e.code = 'TIMEOUT';
  throw e;
}

async function getTenantStatus(tenantId) {
  const state = getClientState(tenantId);
  const settings = await getTenantSettings(tenantId);
  return {
    status: state.status,
    qrDataUrl: state.qrDataUrl,
    lastError: state.lastError,
    lastConnectedAt: state.lastConnectedAt,
    loadingPercent: state.loadingPercent,
    loadingMessage: state.loadingMessage,
    settings,
    // Normalisasi nomor admin supaya UI bisa menampilkan format yang akan
    // dipakai sebenarnya (62xxx) — membantu deteksi salah ketik sebelum kirim.
    notifyAdminPhoneNormalized: normalizePhone(settings.notifyAdminPhone),
    beta: true,
    limitations: [
      'Sesi WhatsApp Web dapat logout sewaktu-waktu.',
      'Wajib scan ulang jika perangkat utama WhatsApp berubah.',
      'Gunakan nomor khusus operasional agar risiko blokir lebih kecil.',
    ],
  };
}

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

async function sendTransactionNotification(tenantId, transaction) {
  const settings = await getTenantSettings(tenantId);
  const txId = transaction?.id || '?';

  if (!settings.enabled) {
    console.log(`[WA] tx=${txId} tenant=${tenantId} → SKIP (notifikasi disabled)`);
    return { sent: false, reason: 'disabled' };
  }

  // Reconnect on-demand kalau client di-sleep oleh idle timer.
  let state = getClientState(tenantId);
  if (state.status !== 'connected' || !state.client) {
    console.log(`[WA] tx=${txId} tenant=${tenantId} → status=${state.status}, ensureConnected…`);
    try {
      state = await ensureConnected(tenantId);
    } catch (err) {
      console.error(`[WA] tx=${txId} tenant=${tenantId} → ensureConnected GAGAL (${err.code}):`, err.message);
      return { sent: false, reason: err.code || 'reconnect_failed', error: err.message };
    }
  }

  const summary = buildTransactionMessage(transaction);
  const sentTargets = [];

  const adminJid = toWhatsappJid(settings.notifyAdminPhone);
  if (adminJid) {
    try {
      await state.client.sendMessage(adminJid, summary);
      sentTargets.push('admin');
      console.log(`[WA] tx=${txId} → admin ${adminJid} OK`);
      armIdleTimer(tenantId);
    } catch (err) {
      console.error(`[WA] tx=${txId} → admin ${adminJid} GAGAL:`, err?.message || err);
    }
  } else {
    console.log(`[WA] tx=${txId} → admin SKIP (nomor tidak valid: "${settings.notifyAdminPhone}")`);
  }

  if (settings.notifyCustomer && transaction.customer?.phone) {
    const customerJid = toWhatsappJid(transaction.customer.phone);
    if (customerJid) {
      try {
        await state.client.sendMessage(
          customerJid,
          `Terima kasih sudah bertransaksi.\n${summary}`
        );
        sentTargets.push('customer');
        console.log(`[WA] tx=${txId} → customer ${customerJid} OK`);
        armIdleTimer(tenantId);
      } catch (err) {
        console.error(`[WA] tx=${txId} → customer ${customerJid} GAGAL:`, err?.message || err);
      }
    }
  }

  return { sent: sentTargets.length > 0, targets: sentTargets };
}

// Kirim pesan tes ke nomor admin yang sedang dikonfigurasi. Dipakai tombol
// "Kirim Pesan Tes" di Settings → WhatsApp untuk verifikasi end-to-end tanpa
// harus menunggu transaksi nyata.
async function sendTestMessage(tenantId) {
  const settings = await getTenantSettings(tenantId);
  const adminJid = toWhatsappJid(settings.notifyAdminPhone);
  if (!adminJid) {
    const err = new Error('Nomor admin belum diisi atau formatnya tidak valid.');
    err.code = 'INVALID_PHONE';
    throw err;
  }

  // Wake-up otomatis kalau client sedang di-sleep — admin tidak perlu klik
  // Hubungkan ulang hanya untuk kirim tes.
  let state = getClientState(tenantId);
  if (state.status !== 'connected' || !state.client) {
    state = await ensureConnected(tenantId);
  }

  const body = [
    'Pesan tes BarberOS',
    '',
    'Jika Anda menerima pesan ini, integrasi WhatsApp sudah berfungsi.',
    `Waktu kirim: ${new Date().toLocaleString('id-ID')}`,
  ].join('\n');
  await state.client.sendMessage(adminJid, body);
  armIdleTimer(tenantId);
  return { sent: true, target: adminJid };
}

// Send an arbitrary text message to a specific phone number if the tenant's
// WA client is currently connected. Silently returns {sent:false} if not.
async function sendSystemMessage(tenantId, phone, text) {
  const state = getClientState(tenantId);
  if (state.status !== 'connected' || !state.client) {
    return { sent: false, reason: 'not_connected' };
  }
  const jid = toWhatsappJid(phone);
  if (!jid) return { sent: false, reason: 'invalid_phone' };
  try {
    await state.client.sendMessage(jid, text);
    armIdleTimer(tenantId);
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

module.exports = {
  connectTenant,
  disconnectTenant,
  getTenantStatus,
  getTenantSettings,
  updateTenantSettings,
  sendTransactionNotification,
  sendTestMessage,
  sendSystemMessage,
};
