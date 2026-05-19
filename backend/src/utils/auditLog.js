// Centralized audit-log writer for super-admin Activity Log feature.
//
// Pemakaian:
//   const { recordAudit } = require('../utils/auditLog');
//   await recordAudit(req, { action: 'tenant.create', target: `tenant:${id}`,
//     detail: 'Created Pro tenant Barber King', severity: 'info' });
//
// Aturan action code: gunakan dot.notation namespaced (`<area>.<verb>`),
// lowercase. Hindari ALL_CAPS supaya konsisten dengan billing.* yang sudah ada.
//
// Severity: 'info' | 'success' | 'warning' | 'error'.

const prisma = require('../config/database');
const { getIO, tenantRoom } = require('../config/socket');

const SUPER_ADMIN_ROOM = 'support';

/**
 * @param {import('express').Request|null} req — boleh null untuk system event.
 * @param {{ action: string, target?: string, detail?: string, severity?: string,
 *           actorId?: string|null, actorName?: string|null }} payload
 */
async function recordAudit(req, payload) {
  const {
    action,
    target = '',
    detail = '',
    severity = 'info',
  } = payload || {};
  if (!action) return null;

  const actorId   = payload.actorId   ?? req?.user?.id   ?? null;
  const actorName = payload.actorName ?? req?.user?.name ?? 'system';
  // Tenant aktor — supaya log realtime sampai ke halaman /admin/settings tenant
  // (bukan hanya ke super-admin). Aksi super-admin tak punya tenant → null.
  const tenantId  = payload.tenantId  ?? req?.user?.tenantId ?? null;

  try {
    const log = await prisma.auditLog.create({
      data: { actorId, actorName, action, target, detail, severity },
    });
    try {
      const io = getIO();
      if (io) {
        io.to(SUPER_ADMIN_ROOM).emit('auditLog:created', { id: log.id, action, severity });
        if (tenantId) io.to(tenantRoom(tenantId)).emit('auditLog:created', { id: log.id, action, severity });
      }
    } catch { /* socket optional */ }
    return log;
  } catch (err) {
    // Audit logging is observability — never break the main flow.
    console.warn('[audit] failed:', err?.message || err);
    return null;
  }
}

module.exports = { recordAudit };
