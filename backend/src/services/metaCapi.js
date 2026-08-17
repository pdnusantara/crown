// Meta Conversions API (CAPI) — kirim event konversi dari SERVER, bukan browser.
//
// Kenapa perlu padahal pixel browser sudah ada: pixel diblokir ad-blocker dan
// dibatasi ITP/iOS, jadi sebagian konversi tak pernah sampai ke Meta. Akibatnya
// CPA terlihat lebih mahal dari kenyataan dan optimisasi Meta jadi meleset.
// Event dari server tidak kena blokir itu.
//
// Event yang sama dikirim DUA kali (browser + server) dengan `event_id` yang
// identik — Meta membuang duplikatnya. Tanpa event_id yang sama, konversi akan
// terhitung dobel.
//
// Semua fungsi di sini BEST-EFFORT: kegagalan dicatat ke log, tidak pernah
// dilempar ke pemanggil. Pendaftaran & pembayaran tidak boleh gagal gara-gara
// Meta sedang bermasalah.

const crypto = require('crypto');
const prisma = require('../config/database');

const GRAPH_VERSION = 'v21.0';
const TIMEOUT_MS = 4000;

const SETTING_PIXEL = 'landing_meta_pixel_id';
const SETTING_TOKEN = 'meta_capi_token';       // RAHASIA — jangan pernah masuk /api/landing publik
const SETTING_TEST  = 'meta_capi_test_code';   // opsional, untuk Test Events di Events Manager

// Cache config supaya tidak query DB tiap event. Di-invalidate lewat
// clearCapiConfigCache() saat super-admin menyimpan pengaturan.
let cache = null;
let cacheAt = 0;
const CACHE_MS = 60_000;

async function getConfig() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_MS) return cache;
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [SETTING_PIXEL, SETTING_TOKEN, SETTING_TEST] } },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  cache = {
    pixelId:  (map[SETTING_PIXEL] || '').trim(),
    token:    (map[SETTING_TOKEN] || '').trim(),
    testCode: (map[SETTING_TEST]  || '').trim(),
  };
  cacheAt = now;
  return cache;
}

function clearCapiConfigCache() { cache = null; cacheAt = 0; }

// Meta mensyaratkan data pribadi di-hash SHA-256 setelah dinormalisasi
// (trim + huruf kecil). Nilai kosong dilewati — mengirim hash dari string
// kosong justru merusak pencocokan.
function hash(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  return crypto.createHash('sha256').update(v).digest('hex');
}

// Nomor telepon harus E.164 tanpa "+" (mis. 6281234567890). Nomor lokal yang
// diawali 0 diasumsikan Indonesia karena seluruh tenant di sini berbasis ID.
function hashPhone(phone) {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  else if (!digits.startsWith('62') && digits.length <= 11) digits = `62${digits}`;
  return hash(digits);
}

// Susun blok user_data. Makin banyak sinyal, makin bagus pencocokannya —
// fbp/fbc (cookie pixel) adalah yang paling kuat, jadi selalu ikutkan bila ada.
function buildUserData({ email, phone, fbp, fbc, ip, userAgent, externalId }) {
  const ud = {};
  const em = hash(email);       if (em) ud.em = [em];
  const ph = hashPhone(phone);  if (ph) ud.ph = [ph];
  const ex = hash(externalId);  if (ex) ud.external_id = [ex];
  if (fbp) ud.fbp = fbp;
  if (fbc) ud.fbc = fbc;
  if (ip) ud.client_ip_address = ip;
  if (userAgent) ud.client_user_agent = userAgent;
  return ud;
}

// Kirim satu event ke Meta. Mengembalikan {ok, error?} — TIDAK pernah throw.
async function sendEvent({
  eventName,
  eventId,
  eventTime,
  eventSourceUrl,
  actionSource = 'website',
  user = {},
  customData,
}) {
  try {
    const { pixelId, token, testCode } = await getConfig();
    if (!pixelId || !token) return { ok: false, skipped: true, error: 'CAPI belum dikonfigurasi' };

    const userData = buildUserData(user);
    // Tanpa satu pun sinyal identitas, event tak bisa dicocokkan ke siapa pun —
    // percuma dikirim dan hanya menurunkan skor kualitas event.
    if (Object.keys(userData).length === 0) {
      return { ok: false, skipped: true, error: 'tidak ada data pencocokan' };
    }

    const payload = {
      data: [{
        event_name:       eventName,
        event_time:       Math.floor((eventTime || Date.now()) / 1000),
        event_id:         eventId || undefined,
        event_source_url: eventSourceUrl || undefined,
        action_source:    actionSource,
        user_data:        userData,
        custom_data:      customData || undefined,
      }],
    };
    if (testCode) payload.test_event_code = testCode;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error?.message || `HTTP ${res.status}`;
        console.error(`[meta-capi] ${eventName} gagal:`, msg);
        return { ok: false, error: msg };
      }
      return { ok: true, received: body?.events_received ?? 0 };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // Termasuk timeout (AbortError) & jaringan mati. Sengaja tidak dilempar.
    console.error(`[meta-capi] ${eventName} error:`, err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}

// Ambil IP asli pengunjung. Di belakang nginx, req.ip bisa jadi 127.0.0.1,
// jadi X-Forwarded-For didahulukan (ambil hop pertama = klien).
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
}

function clientUa(req) {
  return req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 500) : null;
}

module.exports = { sendEvent, clientIp, clientUa, clearCapiConfigCache, getConfig };
