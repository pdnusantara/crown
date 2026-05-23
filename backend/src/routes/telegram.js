const router = require('express').Router();
const { z } = require('zod');
const { authenticate, requireRole } = require('../middleware/auth');
const {
  getConfigPublic,
  updateConfig,
  testConnection,
} = require('../services/telegramService');

const TG_ERROR_STATUS = {
  NO_TOKEN: 400,
  NO_CHAT_ID: 400,
  INVALID_TOKEN: 400,
  CHAT_NOT_FOUND: 400,
  NO_PERMISSION: 400,
  TIMEOUT: 504,
  UNREACHABLE: 502,
};

function handleTelegramError(err, res, next) {
  const httpStatus = TG_ERROR_STATUS[err.code];
  if (httpStatus) {
    return res.status(httpStatus).json({ success: false, code: err.code, error: err.message });
  }
  // Error dari Telegram API (token salah, bot belum di grup, dst).
  if (typeof err?.message === 'string' && /telegram/i.test(err.message)) {
    return res.status(400).json({ success: false, code: err.code || 'TELEGRAM_ERROR', error: err.message });
  }
  return next(err);
}

// ── Konfigurasi notifikasi Telegram (super-admin) ─────────────────────────────

router.get('/config', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    res.json({ success: true, data: await getConfigPublic() });
  } catch (err) { next(err); }
});

router.put('/config', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    const payload = z.object({
      botToken:       z.string().max(255).optional(),
      chatId:         z.string().max(64).optional(),
      enabled:        z.boolean().optional(),
      notifyRegister: z.boolean().optional(),
      daily:          z.boolean().optional(),
      weekly:         z.boolean().optional(),
      monthly:        z.boolean().optional(),
    }).parse(req.body);
    await updateConfig(payload);
    res.json({ success: true, data: await getConfigPublic() });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message });
    next(err);
  }
});

router.post('/config/test', authenticate, requireRole('super_admin'), async (req, res, next) => {
  try {
    res.json({ success: true, data: await testConnection() });
  } catch (err) {
    handleTelegramError(err, res, next);
  }
});

module.exports = router;
