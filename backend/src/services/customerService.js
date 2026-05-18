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
// Alamat dianggap "berisi wilayah" kalau minimal kecamatan/kabupaten terisi.
function hasWilayah(addr) {
  return !!(addr && typeof addr === 'object' && (addr.kecamatanId || addr.kabupatenId));
}

async function upsertCustomerByPhone(client, { tenantId, name, phone, address }) {
  if (!tenantId || !phone || !name) return null;
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const incomingAddr = hasWilayah(address) ? address : null;

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
    select: { id: true, name: true, phone: true, address: true },
  });

  if (existing) {
    const data = {};
    // Kalau sebelumnya cuma "Walk-in" / nama generik tapi sekarang ada nama
    // lebih bagus, update agar admin lihat info terbaru.
    if (name && existing.name && existing.name.toLowerCase() === 'walk-in' && name.trim() && name.trim().toLowerCase() !== 'walk-in') {
      data.name = name.trim();
    }
    // Isi wilayah HANYA kalau pelanggan belum punya — jangan timpa data lama.
    if (incomingAddr && !hasWilayah(existing.address)) {
      data.address = incomingAddr;
    }
    if (Object.keys(data).length > 0) {
      await client.customer.update({ where: { id: existing.id }, data });
    }
    return { ...existing, ...data, created: false };
  }

  const created = await client.customer.create({
    data: {
      tenantId,
      name: name.trim() || 'Pelanggan',
      phone: normalized,
      ...(incomingAddr ? { address: incomingAddr } : {}),
    },
    select: { id: true, name: true, phone: true },
  });
  return { ...created, created: true };
}

module.exports = { upsertCustomerByPhone, normalizePhone };
