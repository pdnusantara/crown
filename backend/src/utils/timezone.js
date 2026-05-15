// Timezone helpers — convert tenant-local YYYY-MM-DD boundaries to UTC,
// dan grouping by tenant-local day pada laporan.
//
// Pendekatan native Intl tanpa dependency tambahan. Aman untuk zona tanpa DST
// (semua zona Indonesia: WIB/WITA/WIT). Kalau di masa depan ada tenant di zona
// dengan DST (mis. Australia/Sydney), perhatikan bahwa hari transisi DST bisa
// off-by-1-jam — selesaikan dengan migrasi ke `date-fns-tz` saat itu tiba.

const DEFAULT_TZ = 'Asia/Jakarta';

const SUPPORTED_TIMEZONES = [
  // Indonesia (3 zona)
  { value: 'Asia/Jakarta',   label: 'WIB (Jakarta) — UTC+7',   offsetHours: 7 },
  { value: 'Asia/Pontianak', label: 'WIB (Pontianak) — UTC+7', offsetHours: 7 },
  { value: 'Asia/Makassar',  label: 'WITA (Bali, Makassar) — UTC+8', offsetHours: 8 },
  { value: 'Asia/Jayapura',  label: 'WIT (Jayapura, Papua) — UTC+9', offsetHours: 9 },
  // Asia tetangga (siapa tahu ekspansi)
  { value: 'Asia/Singapore', label: 'Singapore — UTC+8', offsetHours: 8 },
  { value: 'Asia/Kuala_Lumpur', label: 'Kuala Lumpur — UTC+8', offsetHours: 8 },
  { value: 'Asia/Tokyo',     label: 'Tokyo — UTC+9',     offsetHours: 9 },
  { value: 'UTC',            label: 'UTC',               offsetHours: 0 },
];

const SUPPORTED_TZ_VALUES = SUPPORTED_TIMEZONES.map((t) => t.value);

function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function normalizeTimezone(tz) {
  return isValidTimezone(tz) ? tz : DEFAULT_TZ;
}

// Berapa menit offset zona `tz` dari UTC pada instan `date` tertentu
// (positif = ahead of UTC).
function getOffsetMinutes(tz, date = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const asUTC = Date.UTC(
    Number(get('year')), Number(get('month')) - 1, Number(get('day')),
    Number(get('hour')) % 24, Number(get('minute')), Number(get('second'))
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

// "2026-05-08" + tz → Date instance yang sama dengan 2026-05-08 00:00 di TZ tsb (UTC).
function tenantDayStart(yyyymmdd, tz) {
  const naive = new Date(`${yyyymmdd}T00:00:00.000Z`);
  const offset = getOffsetMinutes(tz, naive);
  return new Date(naive.getTime() - offset * 60000);
}

// Akhir hari (23:59:59.999) di TZ tenant.
function tenantDayEnd(yyyymmdd, tz) {
  const start = tenantDayStart(yyyymmdd, tz);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

// Range "YYYY-MM-DD" → { gte, lte } UTC, mengasumsikan input adalah tenant-local date.
// Bila input ISO datetime utuh (mis. "2026-05-08T10:00:00Z"), kita pass-through.
function buildTenantDateRange(startDate, endDate, tz) {
  const tzSafe = normalizeTimezone(tz);
  const range = {};
  if (startDate) {
    range.gte = /^\d{4}-\d{2}-\d{2}$/.test(startDate)
      ? tenantDayStart(startDate, tzSafe)
      : new Date(startDate);
  }
  if (endDate) {
    range.lte = /^\d{4}-\d{2}-\d{2}$/.test(endDate)
      ? tenantDayEnd(endDate, tzSafe)
      : new Date(endDate);
  }
  return range;
}

// Format Date → "YYYY-MM-DD" di TZ tenant (untuk grouping).
function formatYmdInTz(date, tz) {
  const tzSafe = normalizeTimezone(tz);
  // en-CA selalu kasih "YYYY-MM-DD"
  return new Intl.DateTimeFormat('en-CA', { timeZone: tzSafe }).format(new Date(date));
}

// Format Date → ISO-like string lengkap di TZ tenant (untuk display di backend kalau perlu).
function formatInTz(date, tz, opts = {}) {
  const tzSafe = normalizeTimezone(tz);
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: tzSafe,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
    ...opts,
  }).format(new Date(date));
}

module.exports = {
  DEFAULT_TZ,
  SUPPORTED_TIMEZONES,
  SUPPORTED_TZ_VALUES,
  isValidTimezone,
  normalizeTimezone,
  getOffsetMinutes,
  tenantDayStart,
  tenantDayEnd,
  buildTenantDateRange,
  formatYmdInTz,
  formatInTz,
};
