const router = require('express').Router();
const { z } = require('zod');
const { Prisma } = require('@prisma/client');
const prisma = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { recordAudit } = require('../utils/auditLog');
const { getIO, tenantRoom } = require('../config/socket');
const { runForTenant, previewForTenant } = require('../jobs/visitReminder');

const emitCustomer = (event, customer) => {
  if (!customer?.tenantId) return;
  try {
    const io = getIO();
    if (io) io.to(tenantRoom(customer.tenantId)).emit(event, customer);
  } catch { /* socket optional */ }
};

const customerSelect = {
  id: true,
  tenantId: true,
  name: true,
  phone: true,
  email: true,
  gender: true,
  birthDate: true,
  address: true,
  loyaltyPoints: true,
  visitCount: true,
  notes: true,
  createdAt: true,
};

const addressSchema = z.object({
  provinsiId:  z.string().optional(),
  provinsi:    z.string().optional(),
  kabupatenId: z.string().optional(),
  kabupaten:   z.string().optional(),
  kecamatanId: z.string().optional(),
  kecamatan:   z.string().optional(),
  kelurahanId: z.string().optional(),
  kelurahan:   z.string().optional(),
  detail:      z.string().max(500).optional(),
}).optional();

const createCustomerSchema = z.object({
  tenantId:      z.string().optional(),
  name:          z.string().min(1),
  phone:         z.string().min(1),
  email:         z.string().email().optional().or(z.literal('')),
  gender:        z.enum(['L', 'P']).optional(),
  birthDate:     z.string().optional().transform(v => v ? new Date(v) : undefined),
  address:       addressSchema,
  loyaltyPoints: z.number().int().min(0).optional(),
  notes:         z.string().max(1000).optional(),
});

const updateCustomerSchema = createCustomerSchema.partial().omit({ tenantId: true });

// GET /api/customers
router.get('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, provinsi, segment, gender, sortBy, sortDir, dormantDays, birthMonth } = req.query;

    const where = { deletedAt: null };

    if (req.user.role !== 'super_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }

    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (provinsi) {
      where.address = { path: ['provinsi'], string_contains: provinsi };
    }

    if (gender === 'L' || gender === 'P') {
      where.gender = gender;
    }

    // Segment filter — time-aware (RFM). Backward compat: 'Regular' → 'loyal',
    // 'Inactive' → 'never'. Segment baru: vip, loyal, new, atRisk, lost, never.
    // Untuk segment yang butuh lastVisit (atRisk, lost, dan time-cutoff untuk
    // vip/loyal/new), kita compute IDs via groupBy lalu where.id IN.
    const seg = String(segment || '').toLowerCase();
    const segMap = { regular: 'loyal', inactive: 'never', vip: 'vip', loyal: 'loyal', new: 'new', atrisk: 'atrisk', lost: 'lost', never: 'never' };
    const segNorm = segMap[seg] || (seg ? seg : '');
    if (segNorm === 'never') {
      where.visitCount = { lte: 0 };
    } else if (segNorm && where.tenantId) {
      // Hitung ID yang match segmen via lastVisit groupBy
      const lvRows = await prisma.transaction.groupBy({
        by: ['customerId'],
        where: { tenantId: where.tenantId, status: 'completed', customerId: { not: null } },
        _max: { createdAt: true },
      });
      const customers = await prisma.customer.findMany({
        where: { tenantId: where.tenantId, deletedAt: null },
        select: { id: true, visitCount: true },
      });
      const lvMap = {};
      lvRows.forEach(r => { if (r.customerId) lvMap[r.customerId] = r._max?.createdAt; });
      const now = Date.now();
      const matchIds = customers
        .filter(c => {
          const cls = classifySegment(c.visitCount, lvMap[c.id], now);
          // 'atrisk' (lowercase from URL) maps to 'atRisk' classifier output
          const target = segNorm === 'atrisk' ? 'atRisk' : segNorm;
          return cls === target;
        })
        .map(c => c.id);
      where.id = { in: matchIds.length ? matchIds : ['__none__'] };
    }

    // Dormant filter: customer dengan visitCount > 0 tetapi transaksi terakhir
    // sudah > N hari. Untuk "Inactive" (belum pernah tx) gunakan segment.
    // Hitung ID dormant via groupBy(transaction).max(createdAt) di tenant ybs.
    const idRestrictions = [];
    if (dormantDays && Number(dormantDays) > 0 && where.tenantId) {
      const days = Math.min(3650, Math.max(1, Number(dormantDays)));
      const threshold = new Date(Date.now() - days * 86400 * 1000);
      const recent = await prisma.transaction.groupBy({
        by: ['customerId'],
        where: { tenantId: where.tenantId, status: 'completed', customerId: { not: null } },
        _max: { createdAt: true },
      });
      const dormantIds = recent
        .filter(r => r.customerId && r._max?.createdAt && r._max.createdAt < threshold)
        .map(r => r.customerId);
      idRestrictions.push(dormantIds.length ? dormantIds : ['__none__']);
    }

    // Birthday filter: customer dengan birthDate di bulan tertentu (default = bulan ini).
    // Pakai raw SQL EXTRACT karena Prisma tidak punya date-part operator native.
    if (birthMonth && where.tenantId) {
      const month = birthMonth === 'current'
        ? (new Date().getMonth() + 1)
        : Math.min(12, Math.max(1, Number(birthMonth)));
      if (month >= 1 && month <= 12) {
        const rows = await prisma.$queryRaw`
          SELECT id FROM "Customer"
          WHERE "tenantId" = ${where.tenantId}
            AND "birthDate" IS NOT NULL
            AND "deletedAt" IS NULL
            AND EXTRACT(MONTH FROM "birthDate") = ${month}
        `;
        const birthdayIds = rows.map(r => r.id);
        idRestrictions.push(birthdayIds.length ? birthdayIds : ['__none__']);
      }
    }

    // Intersect ID restrictions kalau ada beberapa filter ID-based.
    if (idRestrictions.length === 1) {
      where.id = { in: idRestrictions[0] };
    } else if (idRestrictions.length > 1) {
      const intersect = idRestrictions.reduce((a, b) => a.filter(id => b.includes(id)));
      where.id = { in: intersect.length ? intersect : ['__none__'] };
    }

    // Sort whitelist: name | createdAt | visitCount | loyaltyPoints
    const allowedSort = new Set(['name', 'createdAt', 'visitCount', 'loyaltyPoints']);
    const dir = sortDir === 'asc' ? 'asc' : 'desc';
    const orderBy = allowedSort.has(sortBy)
      ? { [sortBy]: dir }
      : { createdAt: 'desc' };

    const [data, total] = await Promise.all([
      prisma.customer.findMany({ where, select: customerSelect, skip, take: limit, orderBy }),
      prisma.customer.count({ where }),
    ]);

    // Enrich dengan lifetime value (sum total transaksi completed) per customer.
    // Hanya untuk page yang aktif → jumlah ID ≤ limit (default 20), murah.
    const ids = data.map(c => c.id).filter(Boolean);
    let lvMap = {};
    let lastVisitMap = {};
    if (ids.length) {
      const tenantOf = data[0].tenantId;
      const [lvAgg, lastAgg] = await Promise.all([
        prisma.transaction.groupBy({
          by: ['customerId'],
          where: { tenantId: tenantOf, status: 'completed', customerId: { in: ids } },
          _sum: { total: true },
          _count: { _all: true },
        }),
        prisma.transaction.groupBy({
          by: ['customerId'],
          where: { tenantId: tenantOf, status: 'completed', customerId: { in: ids } },
          _max: { createdAt: true },
        }),
      ]);
      lvMap = lvAgg.reduce((m, r) => {
        if (r.customerId) m[r.customerId] = { sum: r._sum?.total || 0, count: r._count?._all || 0 };
        return m;
      }, {});
      lastVisitMap = lastAgg.reduce((m, r) => {
        if (r.customerId) m[r.customerId] = r._max?.createdAt || null;
        return m;
      }, {});
    }
    const enriched = data.map(c => ({
      ...c,
      lifetimeValue:   lvMap[c.id]?.sum   || 0,
      lifetimeTxCount: lvMap[c.id]?.count || 0,
      lastVisitAt:     lastVisitMap[c.id] || null,
    }));

    res.json({ success: true, data: paginatedResponse(enriched, total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// Threshold segmentasi RFM time-aware (single source of truth).
// Diekspos juga ke FE via response stats supaya UI bisa tampilkan tooltip
// dengan angka yang persis sama (tidak ada drift FE/BE).
const SEGMENT_THRESHOLDS = {
  vipMinVisits:    10,   // ≥10 = VIP
  loyalMinVisits:  3,    // 3-9 = Loyal
  recentDays:      90,   // ≤90d = aktif (VIP/Loyal/Baru)
  atRiskMinDays:   90,   // 90-180d = at-risk
  lostMinDays:     180,  // >180d = lost
};

function classifySegment(visitCount, lastVisitAt, now = Date.now()) {
  if (!visitCount || visitCount <= 0) return 'never';
  if (!lastVisitAt) return 'never'; // safety; visitCount>0 tanpa lastVisit shouldn't happen
  const daysSince = (now - new Date(lastVisitAt).getTime()) / (86400 * 1000);
  if (daysSince > SEGMENT_THRESHOLDS.lostMinDays)   return 'lost';
  if (daysSince > SEGMENT_THRESHOLDS.atRiskMinDays) return 'atRisk';
  // recent (≤90 hari)
  if (visitCount >= SEGMENT_THRESHOLDS.vipMinVisits)   return 'vip';
  if (visitCount >= SEGMENT_THRESHOLDS.loyalMinVisits) return 'loyal';
  return 'new';
}

// GET /api/customers/stats — agregat per-tenant (untuk header tiles)
router.get('/stats', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const tenantId = req.user.role === 'super_admin'
      ? (req.query.tenantId || null)
      : req.user.tenantId;
    if (!tenantId) return res.json({ success: true, data: {
      total: 0, vip: 0, loyal: 0, new: 0, atRisk: 0, lost: 0, never: 0,
      avgLoyalty: 0, avgVisits: 0, withEmail: 0, withAddress: 0, byProvince: [],
      thresholds: SEGMENT_THRESHOLDS,
    } });

    const where = { tenantId, deletedAt: null };
    const [allCustomers, avgAgg, withEmail, withAddress, addressRows, lastVisitRows] = await Promise.all([
      prisma.customer.findMany({
        where,
        select: { id: true, visitCount: true },
      }),
      prisma.customer.aggregate({ where, _avg: { loyaltyPoints: true, visitCount: true } }),
      prisma.customer.count({ where: { ...where, NOT: { email: null }, email: { not: '' } } }),
      // Prisma 5: JSON null filter pakai Prisma.AnyNull (DB-null) + Prisma.JsonNull (literal null)
      prisma.customer.count({ where: { ...where, address: { not: Prisma.AnyNull } } }),
      prisma.customer.findMany({
        where: { ...where, address: { not: Prisma.AnyNull } },
        select: { address: true },
      }),
      // Last visit per customer (semua tx completed di tenant ybs)
      prisma.transaction.groupBy({
        by: ['customerId'],
        where: { tenantId, status: 'completed', customerId: { not: null } },
        _max: { createdAt: true },
      }),
    ]);

    const lastVisitMap = {};
    for (const r of lastVisitRows) {
      if (r.customerId) lastVisitMap[r.customerId] = r._max?.createdAt || null;
    }

    // Hitung segment counts dengan time-aware classifier
    const counts = { vip: 0, loyal: 0, new: 0, atRisk: 0, lost: 0, never: 0 };
    const now = Date.now();
    for (const c of allCustomers) {
      const seg = classifySegment(c.visitCount, lastVisitMap[c.id], now);
      counts[seg]++;
    }

    const provinceCount = {};
    for (const row of addressRows) {
      const prov = row.address?.provinsi;
      if (prov && typeof prov === 'string') {
        provinceCount[prov] = (provinceCount[prov] || 0) + 1;
      }
    }
    const byProvince = Object.entries(provinceCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      data: {
        total: allCustomers.length,
        ...counts,
        // Backward-compat alias supaya client lama tidak break
        regular:  counts.loyal,
        inactive: counts.never,
        avgLoyalty: Math.round(avgAgg._avg?.loyaltyPoints || 0),
        avgVisits:  Number((avgAgg._avg?.visitCount || 0).toFixed(1)),
        withEmail,
        withAddress,
        byProvince,
        thresholds: SEGMENT_THRESHOLDS,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Pengingat kunjungan otomatis (WhatsApp) ─────────────────────────────────
// Endpoint khusus untuk halaman Pengaturan → Pengingat Kunjungan.

// GET /api/customers/visit-reminder/preview — perkiraan jumlah pelanggan yang
// akan diingatkan dengan konfigurasi saat ini (tidak mengirim apa pun).
router.get('/visit-reminder/preview', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = req.user.role === 'super_admin' ? req.query.tenantId : req.user.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });
    const result = await previewForTenant(tenantId);
    res.json({
      success: true,
      data: { eligible: result.eligible, connected: result.connected, config: result.config },
    });
  } catch (err) {
    if (err.code === 'TENANT_NOT_FOUND') {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// POST /api/customers/visit-reminder/run — kirim pengingat sekarang juga,
// mengabaikan jadwal jam. Pengiriman berjalan di LATAR BELAKANG karena jeda
// acak antar pesan bisa membuat durasi total panjang — respons langsung
// dikembalikan setelah pra-pemeriksaan.
router.post('/visit-reminder/run', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const tenantId = req.user.role === 'super_admin' ? req.body.tenantId : req.user.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId wajib' });

    const preview = await previewForTenant(tenantId);
    if (!preview.connected) {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp belum tersambung. Hubungkan WhatsApp dulu di tab WhatsApp Beta.',
        code: 'NOT_CONNECTED',
      });
    }
    if (preview.eligible === 0) {
      return res.json({ success: true, data: { eligible: 0, started: false } });
    }
    // Fire-and-forget — pengiriman + jeda acak berjalan di latar belakang.
    runForTenant(tenantId, {}).catch((err) =>
      console.error('[VisitReminder] run latar belakang gagal:', err?.message || err)
    );
    res.json({ success: true, data: { eligible: preview.eligible, started: true } });
  } catch (err) {
    if (err.code === 'TENANT_NOT_FOUND') {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

// GET /api/customers/:id — detail + ringkasan transaksi (LV, last visit, top services)
router.get('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: {
        ...customerSelect,
        notes: true,
        transactions: {
          where: { status: 'completed' },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true, total: true, subtotal: true, discountAmount: true,
            paymentMethod: true, createdAt: true, status: true,
            branch: { select: { id: true, name: true } },
            items: { select: { id: true, name: true, price: true } },
          },
        },
        bookings: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, date: true, time: true, serviceName: true, status: true, createdAt: true },
        },
      },
    });
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    if (req.user.role !== 'super_admin' && customer.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Aggregated lifetime value (akurat di seluruh history, tidak hanya 20 tx terakhir)
    const lvAgg = await prisma.transaction.aggregate({
      where: { tenantId: customer.tenantId, customerId: customer.id, status: 'completed' },
      _sum: { total: true, discountAmount: true },
      _count: { _all: true },
      _max: { createdAt: true },
      _avg: { total: true },
    });

    res.json({
      success: true,
      data: {
        ...customer,
        lifetimeValue:    lvAgg._sum?.total || 0,
        lifetimeDiscount: lvAgg._sum?.discountAmount || 0,
        lifetimeTxCount:  lvAgg._count?._all || 0,
        avgTicket:        Math.round(lvAgg._avg?.total || 0),
        lastVisitAt:      lvAgg._max?.createdAt || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers
router.post('/', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const body = createCustomerSchema.parse(req.body);
    if (req.user.role !== 'super_admin') body.tenantId = req.user.tenantId;
    if (!body.tenantId) return res.status(400).json({ success: false, error: 'tenantId is required' });

    const customer = await prisma.customer.create({ data: body, select: customerSelect });
    emitCustomer('customer:created', customer);
    recordAudit(req, {
      action: 'customer.create',
      target: `customer:${customer.id}`,
      detail: `Created customer ${customer.name}${customer.phone ? ` (${customer.phone})` : ''}`,
      severity: 'info',
    });
    res.status(201).json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
});

// PUT /api/customers/:id
router.put('/:id', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const existing = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Customer not found' });
    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const body = updateCustomerSchema.parse(req.body);
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: body,
      select: customerSelect,
    });
    emitCustomer('customer:updated', customer);
    recordAudit(req, {
      action: 'customer.update',
      target: `customer:${customer.id}`,
      detail: `Updated customer ${customer.name}`,
      severity: 'info',
    });
    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/customers/:id (soft delete)
router.delete('/:id', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Customer not found' });
    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    await prisma.customer.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    emitCustomer('customer:deleted', { id: existing.id, tenantId: existing.tenantId });
    recordAudit(req, {
      action: 'customer.delete',
      target: `customer:${existing.id}`,
      detail: `Deleted customer ${existing.name}`,
      severity: 'warning',
    });
    res.json({ success: true, data: { message: 'Customer deleted' } });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/export — semua data terfilter (untuk CSV ekspor lengkap)
// Cap di 5000 baris untuk safety; admin cap besar diberi peringatan di klien.
router.get('/export/all', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const { search, provinsi, segment, gender, dormantDays, birthMonth } = req.query;
    const where = { deletedAt: null };
    if (req.user.role !== 'super_admin') {
      where.tenantId = req.user.tenantId;
    } else if (req.query.tenantId) {
      where.tenantId = req.query.tenantId;
    }
    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (provinsi) where.address = { path: ['provinsi'], string_contains: provinsi };
    if (gender === 'L' || gender === 'P') where.gender = gender;
    // Segment filter time-aware — sama logic dengan list endpoint
    const seg = String(segment || '').toLowerCase();
    const segMap = { regular: 'loyal', inactive: 'never', vip: 'vip', loyal: 'loyal', new: 'new', atrisk: 'atrisk', lost: 'lost', never: 'never' };
    const segNorm = segMap[seg] || (seg ? seg : '');
    if (segNorm === 'never') {
      where.visitCount = { lte: 0 };
    } else if (segNorm && where.tenantId) {
      const lvRows = await prisma.transaction.groupBy({
        by: ['customerId'],
        where: { tenantId: where.tenantId, status: 'completed', customerId: { not: null } },
        _max: { createdAt: true },
      });
      const customers = await prisma.customer.findMany({
        where: { tenantId: where.tenantId, deletedAt: null },
        select: { id: true, visitCount: true },
      });
      const lvMap = {};
      lvRows.forEach(r => { if (r.customerId) lvMap[r.customerId] = r._max?.createdAt; });
      const now = Date.now();
      const matchIds = customers
        .filter(c => {
          const cls = classifySegment(c.visitCount, lvMap[c.id], now);
          const target = segNorm === 'atrisk' ? 'atRisk' : segNorm;
          return cls === target;
        })
        .map(c => c.id);
      where.id = { in: matchIds.length ? matchIds : ['__none__'] };
    }

    const idRestrictions = [];
    if (dormantDays && Number(dormantDays) > 0 && where.tenantId) {
      const days = Math.min(3650, Math.max(1, Number(dormantDays)));
      const threshold = new Date(Date.now() - days * 86400 * 1000);
      const recent = await prisma.transaction.groupBy({
        by: ['customerId'],
        where: { tenantId: where.tenantId, status: 'completed', customerId: { not: null } },
        _max: { createdAt: true },
      });
      const dormantIds = recent
        .filter(r => r.customerId && r._max?.createdAt && r._max.createdAt < threshold)
        .map(r => r.customerId);
      idRestrictions.push(dormantIds.length ? dormantIds : ['__none__']);
    }
    if (birthMonth && where.tenantId) {
      const month = birthMonth === 'current'
        ? (new Date().getMonth() + 1)
        : Math.min(12, Math.max(1, Number(birthMonth)));
      if (month >= 1 && month <= 12) {
        const rows = await prisma.$queryRaw`
          SELECT id FROM "Customer"
          WHERE "tenantId" = ${where.tenantId}
            AND "birthDate" IS NOT NULL
            AND "deletedAt" IS NULL
            AND EXTRACT(MONTH FROM "birthDate") = ${month}
        `;
        const birthdayIds = rows.map(r => r.id);
        idRestrictions.push(birthdayIds.length ? birthdayIds : ['__none__']);
      }
    }
    if (idRestrictions.length === 1) {
      where.id = { in: idRestrictions[0] };
    } else if (idRestrictions.length > 1) {
      const intersect = idRestrictions.reduce((a, b) => a.filter(id => b.includes(id)));
      where.id = { in: intersect.length ? intersect : ['__none__'] };
    }

    const data = await prisma.customer.findMany({
      where, select: customerSelect, orderBy: { createdAt: 'desc' }, take: 5000,
    });
    const ids = data.map(c => c.id);
    let lvMap = {};
    if (ids.length) {
      const lvAgg = await prisma.transaction.groupBy({
        by: ['customerId'],
        where: { tenantId: data[0].tenantId, status: 'completed', customerId: { in: ids } },
        _sum: { total: true },
        _count: { _all: true },
      });
      lvMap = lvAgg.reduce((m, r) => {
        if (r.customerId) m[r.customerId] = { sum: r._sum?.total || 0, count: r._count?._all || 0 };
        return m;
      }, {});
    }
    const enriched = data.map(c => ({
      ...c,
      lifetimeValue: lvMap[c.id]?.sum   || 0,
      lifetimeTxCount: lvMap[c.id]?.count || 0,
    }));
    res.json({ success: true, data: enriched, meta: { count: enriched.length, capped: enriched.length >= 5000 } });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers/bulk-delete — soft-delete banyak ID sekaligus (cap 200)
router.post('/bulk-delete', authenticate, requireRole('super_admin', 'tenant_admin'), async (req, res, next) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) }).parse(req.body);
    const tenantId = req.user.role === 'super_admin'
      ? (req.body.tenantId || null)
      : req.user.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, error: 'tenantId required' });

    // Force tenant scope — cegah hapus lintas tenant.
    const targets = await prisma.customer.findMany({
      where: { id: { in: ids }, tenantId, deletedAt: null },
      select: { id: true, name: true, tenantId: true },
    });
    if (!targets.length) return res.json({ success: true, data: { count: 0 } });

    const targetIds = targets.map(t => t.id);
    await prisma.customer.updateMany({
      where: { id: { in: targetIds }, tenantId },
      data:  { deletedAt: new Date() },
    });

    // Emit per-tenant deleted untuk semua ID — cukup satu event ringan agar
    // klien refetch (invalidate query). Audit single line per batch.
    targets.forEach(t => emitCustomer('customer:deleted', { id: t.id, tenantId }));
    recordAudit(req, {
      action: 'customer.bulk_delete',
      target: `customer:bulk(${targetIds.length})`,
      detail: `Bulk deleted ${targetIds.length} customers`,
      severity: 'warning',
    });

    res.json({ success: true, data: { count: targetIds.length, ids: targetIds } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/customers/:id/loyalty
// Body: { points: int, reason?: string }
// Adjust manual oleh admin. Negative untuk kurangi, positive untuk tambah.
// Saldo tidak bisa < 0 (di-clamp). Setiap operasi tercatat di PointHistory
// dengan delta nyata (setelah clamp) supaya saldo & ledger selalu konsisten.
router.patch('/:id/loyalty', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const { points, reason } = z.object({
      points: z.number().int(),
      reason: z.string().trim().max(200).optional().nullable(),
    }).parse(req.body);

    const existing = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Customer not found' });
    if (req.user.role !== 'super_admin' && existing.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const newBalance = Math.max(0, existing.loyaltyPoints + points);
    const realDelta  = newBalance - existing.loyaltyPoints; // delta actual setelah clamp

    // Atomic: update saldo + tulis ledger dalam 1 transaksi
    const customer = await prisma.$transaction(async (tx) => {
      const c = await tx.customer.update({
        where: { id: req.params.id },
        data:  { loyaltyPoints: newBalance },
        select: customerSelect,
      });
      // Skip ledger kalau delta 0 (mis. user input -100 padahal saldo 0)
      if (realDelta !== 0) {
        await tx.pointHistory.create({
          data: {
            tenantId: existing.tenantId,
            customerId: existing.id,
            delta: realDelta,
            balanceAfter: newBalance,
            type: 'adjust',
            refType: 'admin',
            refId: req.user.id,
            reason: reason || null,
            actorId: req.user.id,
          },
        });
      }
      return c;
    });

    emitCustomer('customer:updated', customer);
    recordAudit(req, {
      action: 'customer.loyalty',
      target: `customer:${customer.id}`,
      detail: `${realDelta > 0 ? '+' : ''}${realDelta} pts → ${customer.name} (now ${customer.loyaltyPoints})${reason ? ` — reason: ${reason}` : ''}`,
      severity: 'info',
    });
    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id/point-history
// Pagination cursor-based, default limit 50.
router.get('/:id/point-history', authenticate, requireRole('super_admin', 'tenant_admin', 'kasir'), async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: { id: true, tenantId: true, name: true, loyaltyPoints: true },
    });
    if (!customer) return res.status(404).json({ success: false, error: 'Customer not found' });
    if (req.user.role !== 'super_admin' && customer.tenantId !== req.user.tenantId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const limit  = Math.min(Number(req.query.limit) || 50, 200);
    const cursor = req.query.cursor || undefined;

    const items = await prisma.pointHistory.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    // Enrich dengan info aktor (untuk type adjust) & transaksi (untuk type earn)
    const actorIds = [...new Set(items.filter(i => i.actorId).map(i => i.actorId))];
    const txIds    = [...new Set(items.filter(i => i.refType === 'transaction' && i.refId).map(i => i.refId))];

    const [actors, txs] = await Promise.all([
      actorIds.length
        ? prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
        : [],
      txIds.length
        ? prisma.transaction.findMany({ where: { id: { in: txIds } }, select: { id: true, total: true, createdAt: true } })
        : [],
    ]);
    const actorMap = Object.fromEntries(actors.map(a => [a.id, a.name]));
    const txMap    = Object.fromEntries(txs.map(t => [t.id, t]));

    const hasMore = items.length > limit;
    const slice   = hasMore ? items.slice(0, limit) : items;
    const enriched = slice.map(i => ({
      ...i,
      actorName: i.actorId ? (actorMap[i.actorId] || null) : null,
      transaction: i.refType === 'transaction' && i.refId ? (txMap[i.refId] || null) : null,
    }));

    res.json({
      success: true,
      data: enriched,
      meta: {
        balance: customer.loyaltyPoints,
        hasMore,
        nextCursor: hasMore ? slice[slice.length - 1].id : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
