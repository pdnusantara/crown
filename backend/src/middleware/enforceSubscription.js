'use strict';

// Penegakan langganan di backend — defense-in-depth untuk SubscriptionGate /
// StaffSubscriptionGate di frontend. Saat langganan tenant berakhir, semua
// operasi TULIS (POST/PUT/PATCH/DELETE) ditolak. Operasi baca (GET) dibiarkan
// agar alur pemulihan & tampilan tidak rusak.

const { verifyAccess } = require('../config/jwt');
const prisma = require('../config/database');

// Path (relatif terhadap /api) yang TIDAK PERNAH diblokir. Wajib mencakup
// auth/langganan/pembayaran — kalau diblokir, tenant tak akan bisa membayar
// dan akun terkunci permanen.
const ALLOWLIST_PREFIXES = ['/auth', '/subscriptions', '/payment', '/public', '/landing'];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Cache status terkunci per-tenant. TTL pendek: hindari query DB tiap request,
// tapi tetap cepat menyesuaikan saat langganan diperpanjang.
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // tenantId -> { locked, expiresAt }

// Langganan terkunci bila status overdue/expired, ATAU status trial/active
// tapi endDate sudah lewat (efektif berakhir walau cron harian belum jalan).
// 'paused' tidak pernah mengunci. Logika ini disamakan dengan frontend
// (src/components/SubscriptionGate.jsx → isSubscriptionLocked).
function isSubscriptionLocked(sub) {
  if (!sub) return false;
  if (sub.status === 'paused') return false;
  if (sub.status === 'overdue' || sub.status === 'expired') return true;
  if ((sub.status === 'trial' || sub.status === 'active') && sub.endDate) {
    return new Date(sub.endDate).getTime() < Date.now();
  }
  return false;
}

async function getTenantLocked(tenantId) {
  const cached = cache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.locked;

  const sub = await prisma.subscription.findUnique({
    where:  { tenantId },
    select: { status: true, endDate: true },
  });
  const locked = isSubscriptionLocked(sub);
  cache.set(tenantId, { locked, expiresAt: Date.now() + CACHE_TTL_MS });
  return locked;
}

// Buang entri cache supaya keputusan berikutnya membaca DB segar — dipanggil
// saat pembayaran sukses agar buka-kunci terasa instan.
function invalidateSubscriptionCache(tenantId) {
  if (tenantId) cache.delete(tenantId);
}

async function enforceSubscription(req, res, next) {
  try {
    // Hanya jaga operasi tulis — GET/HEAD/OPTIONS dibiarkan lewat.
    if (!WRITE_METHODS.has(req.method)) return next();

    // Allowlist: auth, langganan, pembayaran, endpoint publik.
    if (ALLOWLIST_PREFIXES.some(p => req.path === p || req.path.startsWith(p + '/'))) {
      return next();
    }

    // Decode token sendiri — route tetap punya `authenticate` masing-masing
    // sebagai sumber kebenaran. Tanpa token / token invalid → biarkan route
    // yang menolak dengan 401.
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

    let decoded;
    try {
      decoded = verifyAccess(authHeader.slice(7));
    } catch {
      return next();
    }

    // super_admin tak pernah diblokir; user tanpa tenant juga dilewati.
    if (decoded.role === 'super_admin' || !decoded.tenantId) return next();

    if (await getTenantLocked(decoded.tenantId)) {
      return res.status(403).json({
        success: false,
        error:   'Langganan toko telah berakhir. Perpanjang langganan untuk melanjutkan.',
        code:    'SUBSCRIPTION_EXPIRED',
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { enforceSubscription, invalidateSubscriptionCache, isSubscriptionLocked };
