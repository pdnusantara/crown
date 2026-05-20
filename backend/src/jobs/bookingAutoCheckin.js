'use strict';

// ── Job: Auto Check-in Booking ──────────────────────────────────────────────
// Saat jam booking tiba (waktu lokal tenant), booking yang masih
// pending/confirmed otomatis didorong ke antrian (Queue) — sehingga kasir
// tidak perlu klik "Check-in" manual. Mirror logika POST /bookings/:id/check-in.
//
// Cron jalan tiap menit; per-tenant cek jam dinding lokal supaya tenant di
// luar Asia/Jakarta tetap konsisten. Idempotent: skip booking yang sudah
// punya Queue dengan bookingId yang sama.

const cron = require('node-cron');
const prisma = require('../config/database');
const { emitQueueEvent, emitBookingEvent } = require('../config/socket');
const { upsertCustomerByPhone } = require('../services/customerService');

// "YYYY-MM-DD" tanggal lokal tenant saat ini.
function tenantTodayYmd(tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Jakarta' }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  }
}

// "HH:MM" jam lokal tenant saat ini.
function tenantNowHHMM(tz) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'Asia/Jakarta',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date());
  } catch {
    return '00:00';
  }
}

// Pakai helper bersama supaya dedupe room konsisten dengan endpoint lain.
const emitBookingChange = (booking) => emitBookingEvent('booking:updated', booking);

async function processTenant(tenant) {
  const todayYmd = tenantTodayYmd(tenant.timezone);
  const nowHHMM  = tenantNowHHMM(tenant.timezone);

  // Booking siap auto-checkin: hari ini, jam ≤ sekarang, status aktif.
  const rows = await prisma.booking.findMany({
    where: {
      tenantId: tenant.id,
      date:     todayYmd,
      time:     { lte: nowHHMM },
      status:   { in: ['pending', 'confirmed'] },
    },
    select: {
      id: true, tenantId: true, branchId: true, customerId: true,
      customerName: true, customerPhone: true,
      barberId: true, barberName: true, serviceName: true,
    },
  });
  if (rows.length === 0) return { moved: 0 };

  // Filter yang sudah punya queue dengan bookingId-nya (idempotent guard).
  // Queue.notes adalah JSON string yang menyimpan { bookingId }.
  const bookingIds = rows.map((b) => b.id);
  const existingQueues = await prisma.queue.findMany({
    where: {
      tenantId: tenant.id,
      type:     'booking',
      // String search untuk bookingId dalam notes JSON.
      notes:    { contains: '"bookingId":' },
    },
    select: { notes: true },
  });
  const alreadyQueued = new Set();
  for (const q of existingQueues) {
    try {
      const parsed = JSON.parse(q.notes || '{}');
      if (parsed?.bookingId && bookingIds.includes(parsed.bookingId)) {
        alreadyQueued.add(parsed.bookingId);
      }
    } catch { /* notes bukan JSON valid → biarkan */ }
  }
  const pending = rows.filter((b) => !alreadyQueued.has(b.id));
  if (pending.length === 0) return { moved: 0 };

  let moved = 0;
  for (const b of pending) {
    try {
      // Resolve customerId kalau belum ter-link.
      let customerId = b.customerId;
      if (!customerId && b.customerPhone && b.customerName) {
        const c = await upsertCustomerByPhone(prisma, {
          tenantId: tenant.id, name: b.customerName, phone: b.customerPhone,
        });
        if (c?.id) {
          customerId = c.id;
          await prisma.booking.update({ where: { id: b.id }, data: { customerId } }).catch(() => {});
        }
      }

      // Hitung queue number per cabang per hari.
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const count = await prisma.queue.count({
        where: { branchId: b.branchId, createdAt: { gte: todayStart } },
      });

      const queueNotes = JSON.stringify({
        services:  b.serviceName ? [b.serviceName] : ['Layanan'],
        phone:     b.customerPhone,
        type:      'booking',
        staffName: b.barberName || null,
        bookingId: b.id,
        autoCheckIn: true,
      });

      const queue = await prisma.queue.create({
        data: {
          tenantId: b.tenantId, branchId: b.branchId,
          customerId: customerId || null,
          customerName: b.customerName, customerPhone: b.customerPhone,
          barberId: b.barberId || null, barberName: b.barberName || null,
          serviceNames: b.serviceName || null,
          type: 'booking', notes: queueNotes,
          status: 'waiting', queueNumber: count + 1,
        },
        include: { branch: { select: { id: true, name: true } } },
      });

      const updated = await prisma.booking.update({
        where: { id: b.id }, data: { status: 'in_progress' },
        include: {
          branch:   { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, phone: true } },
        },
      });

      emitQueueEvent('queue:created', queue);
      emitBookingChange(updated);
      moved++;
    } catch (err) {
      console.error(`[BookingAutoCheckin] booking=${b.id} error:`, err?.message || err);
    }
  }
  return { moved };
}

async function runBookingAutoCheckinJob() {
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null, isSuspended: false },
    select: { id: true, timezone: true },
  });
  let totalMoved = 0;
  for (const tenant of tenants) {
    try {
      const r = await processTenant(tenant);
      totalMoved += r.moved;
    } catch (err) {
      console.error(`[BookingAutoCheckin] tenant=${tenant.id} error:`, err?.message || err);
    }
  }
  if (totalMoved > 0) {
    console.log(`[BookingAutoCheckin] ${totalMoved} booking didorong ke antrian otomatis`);
  }
  return { totalMoved };
}

function initBookingAutoCheckinJob() {
  // Tiap menit — granularitas yang masuk akal untuk auto-checkin sesuai jam.
  cron.schedule('* * * * *', () => {
    runBookingAutoCheckinJob().catch((err) =>
      console.error('[BookingAutoCheckin] unhandled error:', err)
    );
  });
  console.log('[BookingAutoCheckin] Scheduled: every minute (auto-push booking → queue saat jam tiba)');
}

module.exports = {
  initBookingAutoCheckinJob,
  runBookingAutoCheckinJob,
};
