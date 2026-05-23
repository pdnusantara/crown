// Telegram notifier — kirim notifikasi pendaftaran tenant & ringkasan berkala
// ke grup Telegram. Kredensial disimpan di SystemSetting (bisa diatur dari
// /super-admin/telegram-settings) dengan fallback ke env. Pola dibuat
// menyerupai whatsappService: config cache, native fetch + timeout, secret
// di-mask, semua best-effort (tidak pernah menggagalkan alur utama).
const prisma = require('../config/database');

const SETTING_KEYS = [
  'telegram_bot_token',
  'telegram_chat_id',
  'telegram_enabled',
  'telegram_notify_register',
  'telegram_daily',
  'telegram_weekly',
  'telegram_monthly',
];

const API_BASE = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 12000;
const CONFIG_TTL_MS = 30000;

let configCache = null;
let configCacheAt = 0;

function asBool(v, def = false) {
  if (v === undefined || v === null || v === '') return def;
  return v === true || v === 'true';
}

// ── Konfigurasi (SystemSetting + fallback env) ───────────────────────────────
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
    botToken:       m.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '',
    chatId:         m.telegram_chat_id   || process.env.TELEGRAM_CHAT_ID   || '',
    // Master switch — default mati sampai super-admin mengaktifkan.
    enabled:        asBool(m.telegram_enabled, false),
    // Notifikasi instan tiap ada pendaftaran baru (default nyala bila master on).
    notifyRegister: asBool(m.telegram_notify_register, true),
    // Ringkasan berkala.
    daily:          asBool(m.telegram_daily,   true),
    weekly:         asBool(m.telegram_weekly,  true),
    monthly:        asBool(m.telegram_monthly, true),
  };
  configCacheAt = Date.now();
  return configCache;
}

async function updateConfig(patch) {
  const map = {
    botToken:       'telegram_bot_token',
    chatId:         'telegram_chat_id',
    enabled:        'telegram_enabled',
    notifyRegister: 'telegram_notify_register',
    daily:          'telegram_daily',
    weekly:         'telegram_weekly',
    monthly:        'telegram_monthly',
  };
  for (const [k, key] of Object.entries(map)) {
    if (patch[k] === undefined) continue;
    const value = (k === 'botToken' || k === 'chatId') ? String(patch[k]).trim() : String(!!patch[k]);
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

// Bentuk aman untuk halaman super-admin — token tidak pernah dikirim utuh.
async function getConfigPublic() {
  const c = await getConfig(true);
  return {
    enabled:        c.enabled,
    notifyRegister: c.notifyRegister,
    daily:          c.daily,
    weekly:         c.weekly,
    monthly:        c.monthly,
    chatId:         c.chatId,
    botTokenSet:    !!c.botToken,
    botTokenMasked: maskSecret(c.botToken),
    configured:     !!c.botToken && !!c.chatId,
  };
}

// ── HTTP helper ──────────────────────────────────────────────────────────────
async function tgFetch(token, method, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    const e = new Error(aborted
      ? `Timeout menghubungi Telegram (${REQUEST_TIMEOUT_MS / 1000}s).`
      : `Gagal menghubungi Telegram: ${err?.message || err}`);
    e.code = aborted ? 'TIMEOUT' : 'UNREACHABLE';
    throw e;
  } finally {
    clearTimeout(timer);
  }
  let json = null;
  try { json = await res.json(); } catch { /* sebagian respons bisa tanpa body */ }
  if (!res.ok || json?.ok === false) {
    const desc = json?.description || `HTTP ${res.status}`;
    const e = new Error(`Telegram error: ${desc}`);
    e.code = json?.error_code || `HTTP_${res.status}`;
    throw e;
  }
  return json?.result ?? json;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Kirim pesan ──────────────────────────────────────────────────────────────
// Kirim teks (HTML) ke chat default (atau chatId override). Best-effort: kalau
// belum dikonfigurasi / nonaktif, kembalikan {sent:false,reason} tanpa throw.
async function sendMessage(text, { chatId, silent = false } = {}) {
  const c = await getConfig();
  if (!c.enabled)  return { sent: false, reason: 'disabled' };
  if (!c.botToken) return { sent: false, reason: 'no_token' };
  const target = chatId || c.chatId;
  if (!target)     return { sent: false, reason: 'no_chat_id' };
  const result = await tgFetch(c.botToken, 'sendMessage', {
    chat_id: target,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    disable_notification: silent,
  });
  return { sent: true, messageId: result?.message_id || null };
}

const CHANNEL_LABEL = {
  facebook_ads: 'Iklan Facebook/Instagram',
  google_ads:   'Iklan Google',
  campaign:     'Kampanye/UTM',
  referral:     'Referral situs lain',
  direct:       'Langsung',
};

function channelLabel(ch) {
  return CHANNEL_LABEL[ch] || 'Langsung';
}

// Susun & kirim notifikasi pendaftaran tenant baru.
//   info = { name, slug, email, phone, packageName, channel, affiliate, meta, createdAt }
async function notifyNewTenant(info = {}) {
  const c = await getConfig();
  if (!c.enabled || !c.notifyRegister) return { sent: false, reason: 'disabled' };

  const lines = [];
  lines.push('🎉 <b>Pendaftaran Tenant Baru</b>');
  lines.push('');
  lines.push(`🏪 <b>${escapeHtml(info.name || '-')}</b>`);
  if (info.slug)  lines.push(`🔗 ${escapeHtml(info.slug)}.sembapos.com`);
  if (info.email) lines.push(`📧 ${escapeHtml(info.email)}`);
  if (info.phone) lines.push(`📱 ${escapeHtml(info.phone)}`);
  lines.push(`📦 Paket: <b>${escapeHtml(info.packageName || 'Basic')}</b>`);

  // Sumber: affiliate diutamakan, lalu kanal traffic.
  if (info.affiliate) {
    lines.push(`🤝 Via affiliate: <b>${escapeHtml(info.affiliate.name || info.affiliate.code)}</b> (${escapeHtml(info.affiliate.code)})`);
  } else {
    lines.push(`📈 Sumber: <b>${escapeHtml(channelLabel(info.channel))}</b>`);
  }
  const meta = info.meta || {};
  if (meta.utmSource || meta.utmCampaign) {
    const utm = [meta.utmSource, meta.utmMedium, meta.utmCampaign].filter(Boolean).join(' / ');
    if (utm) lines.push(`   <i>${escapeHtml(utm)}</i>`);
  }

  try {
    return await sendMessage(lines.join('\n'));
  } catch (err) {
    return { sent: false, reason: err?.message || 'send_error' };
  }
}

// Tes koneksi: validasi token via getMe, lalu kirim pesan uji ke grup.
async function testConnection() {
  const c = await getConfig(true);
  if (!c.botToken) { const e = new Error('Bot token belum diisi.'); e.code = 'NO_TOKEN'; throw e; }
  if (!c.chatId)   { const e = new Error('Chat ID grup belum diisi.'); e.code = 'NO_CHAT_ID'; throw e; }

  // 1) Validasi token via getMe — 404/401 dari Telegram = token salah.
  let me;
  try {
    me = await tgFetch(c.botToken, 'getMe', {});
  } catch (err) {
    if (err.code === 404 || err.code === 401 || err.code === 'HTTP_404' || err.code === 'HTTP_401') {
      const e = new Error('Token bot tidak valid — salin ulang token lengkap dari @BotFather (format: angka:huruf, mis. 8123456789:AAH...).');
      e.code = 'INVALID_TOKEN';
      throw e;
    }
    throw err;
  }

  // 2) Kirim pesan uji ke grup — bedakan "chat tidak ditemukan" vs "tak ada izin".
  try {
    await tgFetch(c.botToken, 'sendMessage', {
      chat_id: c.chatId,
      text: '✅ <b>SembaPOS terhubung</b>\nNotifikasi pendaftaran tenant akan dikirim ke grup ini.',
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (err) {
    const msg = err?.message || '';
    if (/chat not found/i.test(msg)) {
      const e = new Error('Chat ID salah, atau bot belum ditambahkan sebagai anggota grup tujuan.');
      e.code = 'CHAT_NOT_FOUND';
      throw e;
    }
    if (/kicked|not enough rights|chat_write_forbidden|not a member/i.test(msg)) {
      const e = new Error('Bot ada di grup tapi tidak boleh mengirim pesan — cek izin bot di grup.');
      e.code = 'NO_PERMISSION';
      throw e;
    }
    throw err;
  }

  return { ok: true, botUsername: me?.username || null };
}

module.exports = {
  getConfig,
  updateConfig,
  getConfigPublic,
  sendMessage,
  notifyNewTenant,
  testConnection,
  channelLabel,
  escapeHtml,
  CHANNEL_LABEL,
};
