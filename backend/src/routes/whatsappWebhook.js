// Penerima webhook WA Gateway (wagat.web.id).
//
// Gateway mem-POST event ke sini: whatsapp.status_changed, message.sent,
// message.delivered, message.failed. Tiap request ditandatangani HMAC-SHA256
// di header `x-webhook-signature` (dihitung dari raw body memakai
// webhookSecret tenant). Route ini di-mount di server.js SEBELUM express.json
// global, dengan parser ber-`verify` yang menaruh raw body di req.rawBody.
//
// Endpoint ini publik (dipanggil server eksternal) — tidak ada autentikasi
// JWT; integritas dijamin murni oleh verifikasi tanda tangan.

const router = require('express').Router();
const prisma = require('../config/database');
const wa = require('../services/whatsappService');
const { getIO, tenantRoom } = require('../config/socket');

router.post('/', async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'] || '';
    const valid = await wa.verifyWebhookSignature(req.rawBody || '', signature);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }

    const event = req.body || {};
    const type = event.event || 'unknown';
    const deviceId = event.deviceId || event.device?.id || null;

    // Selalu balas cepat — pemrosesan ringan & tidak boleh memblokir gateway.
    res.json({ success: true });

    if (type === 'whatsapp.status_changed') {
      // Status koneksi berubah → buang cache supaya poll berikutnya akurat,
      // lalu dorong update realtime ke dashboard tenant.
      const tenantId = await wa.findTenantByDeviceId(deviceId);
      if (tenantId) {
        wa.invalidateStatus(tenantId);
        try {
          const io = getIO();
          if (io) {
            const payload = { tenantId, status: event.status || null, phoneNumber: event.phoneNumber || null };
            io.to(tenantRoom(tenantId)).emit('whatsapp:status', payload);
            io.to('support').emit('whatsapp:status', payload);
          }
        } catch { /* observability — jangan throw */ }
      } else {
        // deviceId tak dikenal → segarkan semua agar tidak ada yang basi.
        wa.invalidateStatus();
      }
      console.log(`[WA webhook] ${type} device=${deviceId || '?'} status=${event.status || '?'}`);
      return;
    }

    if (type.startsWith('message.')) {
      // Perbarui status log pesan keluar (dicocokkan via messageId gateway).
      // Guard `notIn` mencegah downgrade kalau webhook tiba tak berurutan
      // (mis. 'delivered' lalu 'sent' yang terlambat).
      const statusMap = { 'message.sent': 'sent', 'message.delivered': 'delivered', 'message.read': 'read', 'message.failed': 'failed' };
      const guardNotIn = { sent: ['sent', 'delivered', 'read', 'failed'], delivered: ['delivered', 'read'], read: ['read'], failed: [] };
      const newStatus = statusMap[type];
      if (newStatus && event.messageId) {
        try {
          await prisma.whatsappMessageLog.updateMany({
            where: {
              messageId: String(event.messageId),
              ...(guardNotIn[newStatus].length ? { status: { notIn: guardNotIn[newStatus] } } : {}),
            },
            data: {
              status: newStatus,
              ...(newStatus === 'delivered' || newStatus === 'read' ? { deliveredAt: new Date() } : {}),
              ...(event.error || event.reason ? { reason: String(event.error || event.reason).slice(0, 250) } : {}),
            },
          });
          const tenantId = await wa.findTenantByDeviceId(deviceId);
          if (tenantId) {
            try { getIO()?.to(tenantRoom(tenantId)).emit('whatsapp:message', { messageId: event.messageId, status: newStatus }); } catch { /* socket opsional */ }
          }
        } catch (e) { /* observability — jangan throw */ }
      }
      console.log(`[WA webhook] ${type} messageId=${event.messageId || '?'} to=${event.to || '?'} status=${event.status || '?'}`);
      return;
    }

    console.log(`[WA webhook] event tak dikenal: ${type}`);
  } catch (err) {
    // Respons mungkin sudah terkirim — cukup catat.
    console.error('[WA webhook] error:', err.message);
    if (!res.headersSent) res.status(200).json({ success: true });
  }
});

module.exports = router;
