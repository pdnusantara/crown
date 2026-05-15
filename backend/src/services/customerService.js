const prisma = require('../config/database');

// Normalisasi nomor HP — buang spasi, dash, +. Idealnya 0xx atau 62xx.
function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).trim().replace(/[\s\-+]/g, '');
  // 62812... → 0812...
  if (p.startsWith('62')) p = '0' + p.slice(2);
  return p;
}

/**
 * Upsert customer berdasar nomor telepon dalam tenant.
 * Dipakai oleh booking, queue, dan transaction agar setiap pelanggan yang
 * pernah dilayani — baik booking atau walk-in — otomatis tercatat di akun
 * admin (halaman /admin/customers).
 *
 * @param {object} client  Prisma client / transactional client.
 * @param {object} args
 * @param {string} args.tenantId
 * @param {string} args.name
 * @param {string} args.phone
 * @returns {Promise<{ id: string, name: string, phone: string, created: boolean }>}
 */
async function upsertCustomerByPhone(client, { tenantId, name, phone }) {
  if (!tenantId || !phone || !name) return null;
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  // Coba cari yang phone-nya match (baik raw atau normalized) supaya
  // tidak duplikat dengan record lama yang masih pakai format +62/62/0.
  const existing = await client.customer.findFirst({
    where: {
      tenantId,
      deletedAt: null,
      OR: [
        { phone },
        { phone: normalized },
      ],
    },
    select: { id: true, name: true, phone: true },
  });

  if (existing) {
    // Kalau sebelumnya cuma "Walk-in" / nama generik tapi sekarang ada nama
    // lebih bagus, update agar admin lihat info terbaru.
    if (name && existing.name && existing.name.toLowerCase() === 'walk-in' && name.trim() && name.trim().toLowerCase() !== 'walk-in') {
      await client.customer.update({
        where: { id: existing.id },
        data: { name: name.trim() },
      });
      return { ...existing, name: name.trim(), created: false };
    }
    return { ...existing, created: false };
  }

  const created = await client.customer.create({
    data: {
      tenantId,
      name: name.trim() || 'Pelanggan',
      phone: normalized,
    },
    select: { id: true, name: true, phone: true },
  });
  return { ...created, created: true };
}

module.exports = { upsertCustomerByPhone, normalizePhone };
