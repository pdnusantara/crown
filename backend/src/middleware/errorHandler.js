const { ZodError } = require('zod');
const { Prisma } = require('@prisma/client');
const prisma = require('../config/database');
const { notifyError } = require('../services/telegramService');

// Redaksi field sensitif sebelum body/query request disimpan ke ErrorLog —
// tanpa ini, 500 di /auth/* menyimpan password plaintext (& token) ke tabel
// yang bisa dibaca di /super-admin/error-logs.
const SENSITIVE_KEY = /pass|token|secret|api[-_]?key|authorization|otp|pin|cvv|card/i;
function redactSensitive(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return obj;
  if (Array.isArray(obj)) return obj.map((v) => redactSensitive(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY.test(k)) out[k] = '[REDACTED]';
    else if (v && typeof v === 'object') out[k] = redactSensitive(v, depth + 1);
    else out[k] = v;
  }
  return out;
}

function errorHandler(err, req, res, next) {
  // Zod validation errors
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    // Log validation failures — 4xx kalau tidak dilog, sangat sulit ditelusuri
    // dari sisi server. Kita cetak path + field-field yang gagal saja, BUKAN
    // request body (bisa berisi data sensitif seperti password).
    console.warn(
      `[Zod 400] ${req.method} ${req.path} —`,
      details.map((d) => `${d.field || '(root)'}: ${d.message}`).join('; '),
    );
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details,
    });
  }

  // Prisma known errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const fields = err.meta?.target || [];
      return res.status(409).json({
        success: false,
        error: `Duplicate value for unique field(s): ${fields.join(', ')}`,
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    if (err.code === 'P2003') {
      return res.status(400).json({ success: false, error: 'Referenced record does not exist' });
    }
    return res.status(400).json({ success: false, error: err.message });
  }

  // Prisma validation errors
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ success: false, error: 'Database validation error' });
  }

  // JWT errors (fallback)
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, error: 'Token expired' });
  }

  // Custom app errors with statusCode
  if (err.statusCode) {
    return res.status(err.statusCode).json({ success: false, error: err.message });
  }

  // Generic errors
  const statusCode = err.status || 500;
  const message =
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal server error'
      : err.message || 'Internal server error';

  if (statusCode >= 500) {
    console.error('[Error]', err);
    // Persist to ErrorLog table asynchronously — fire and forget
    prisma.errorLog.create({
      data: {
        level:      'error',
        type:       'api_error',
        message:    err.message || 'Internal server error',
        stack:      err.stack   || null,
        path:       req.path    || null,
        method:     req.method  || null,
        statusCode,
        tenantId:   req.user?.tenantId || null,
        userId:     req.user?.id       || null,
        metadata:   { query: redactSensitive(req.query), body: redactSensitive(req.body) },
      },
    }).catch(() => {}); // never throw from within error handler
    // Push alert ke grup Telegram — throttle/dedupe/rate-cap ditangani di dalam
    // service (crash loop tak akan spam), fire-and-forget supaya tak menunda
    // respons & tak pernah throw dari error handler. Frontend JS error sudah
    // lewat POST /error-logs; ini melengkapi sisi backend 5xx yang sebelumnya
    // hanya tercatat diam-diam ke tabel ErrorLog tanpa notifikasi.
    notifyError({
      level:    'error',
      type:     'api_error',
      message:  err.message || 'Internal server error',
      path:     req.path,
      tenantId: req.user?.tenantId || null,
    }).catch(() => {});
  }

  res.status(statusCode).json({ success: false, error: message });
}

module.exports = errorHandler;
// Diekspor agar endpoint lain (mis. POST /api/error-logs yang anonim) bisa
// memakai redaksi yang sama sebelum menyimpan data dari klien.
module.exports.redactSensitive = redactSensitive;
