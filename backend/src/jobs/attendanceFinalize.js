'use strict';

// ── Job: Finalisasi Absensi ─────────────────────────────────────────────────
// Menutup catatan absensi yang sudah check-in tapi staf lupa check-out.
// Cron berjalan tiap jam; sebuah catatan difinalisasi hanya setelah hari
// kalendernya (zona waktu tenant) BERLALU — sehingga absen hari berjalan tidak
// ditutup terlalu dini.
//
// Saat finalisasi: checkOutAt = jam pulang terjadwal (scheduleEnd) pada tanggal
// itu; lokasi check-out dikosongkan; catatan diberi tanda auto-checkout.
// Hanya aktif bila Tenant.attendanceConfig.autoCheckOut !== false.

const cron = require('node-cron');
const prisma = require('../config/database');

// "HH:MM" → menit sejak tengah malam.
function hmToMin(hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
  if (!m) return 17 * 60; // fallback 17:00
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// Tanggal lokal tenant ("YYYY-MM-DD") saat ini.
function tenantTodayYmd(tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Jakarta' }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  }
}

function autoCheckOutEnabled(raw) {
  return !raw || typeof raw !== 'object' || raw.autoCheckOut !== false;
}

// Proses satu tenant — tutup absen menggantung dari hari-hari yang sudah lewat.
async function processTenant(tenant) {
  if (!autoCheckOutEnabled(tenant.attendanceConfig)) return 0;

  const todayYmd = tenantTodayYmd(tenant.timezone);
  const todayStartUTC = new Date(`${todayYmd}T00:00:00.000Z`);

  // Absen yang masih terbuka & tanggalnya sebelum hari ini (tenant-local).
  const open = await prisma.attendance.findMany({
    where: {
      tenantId: tenant.id,
      checkInAt: { not: null },
      checkOutAt: null,
      date: { lt: todayStartUTC },
    },
    select: { id: true, date: true, checkInAt: true, scheduleEnd: true },
  });
  if (open.length === 0) return 0;

  let closed = 0;
  for (const rec of open) {
    const endMin = hmToMin(rec.scheduleEnd);
    // date disimpan sebagai UTC-instant dari tengah malam lokal → tambah menit
    // scheduleEnd menghasilkan instan jam pulang terjadwal.
    let checkOutAt = new Date(new Date(rec.date).getTime() + endMin * 60000);
    const checkInAt = new Date(rec.checkInAt);
    if (checkOutAt <= checkInAt) checkOutAt = checkInAt;
    const workedMinutes = Math.max(0, Math.round((checkOutAt - checkInAt) / 60000));

    await prisma.attendance.update({
      where: { id: rec.id },
      data: {
        checkOutAt,
        workedMinutes,
        note: 'Auto check-out (staf lupa absen pulang)',
      },
    }).catch(() => {});
    closed++;
  }
  return closed;
}

async function runAttendanceFinalizeJob() {
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null, isSuspended: false },
    select: { id: true, timezone: true, attendanceConfig: true },
  });

  let totalClosed = 0;
  for (const tenant of tenants) {
    try {
      totalClosed += await processTenant(tenant);
    } catch (err) {
      console.error(`[AttendanceFinalize] tenant=${tenant.id} error:`, err?.message || err);
    }
  }
  if (totalClosed > 0) {
    console.log(`[AttendanceFinalize] ${totalClosed} absen ditutup otomatis`);
  }
  return { totalClosed };
}

function initAttendanceFinalizeJob() {
  // Tiap jam tepat — perbandingan hari per-tenant dilakukan di dalam job.
  cron.schedule('5 * * * *', () => {
    runAttendanceFinalizeJob().catch((err) =>
      console.error('[AttendanceFinalize] unhandled error:', err)
    );
  });
  console.log('[AttendanceFinalize] Scheduled: hourly (auto check-out absen menggantung)');
}

module.exports = {
  initAttendanceFinalizeJob,
  runAttendanceFinalizeJob,
};
