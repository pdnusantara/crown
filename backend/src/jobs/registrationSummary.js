'use strict';

// Ringkasan pendaftaran tenant berkala (harian/mingguan/bulanan) → grup Telegram.
// Tiap job mengecek toggle config Telegram sebelum kirim; semua best-effort.
const cron = require('node-cron');
const prisma = require('../config/database');
const telegram = require('../services/telegramService');
const { tenantDayStart, tenantDayEnd, formatYmdInTz } = require('../utils/timezone');

const TZ = process.env.REPORT_TZ || 'Asia/Jakarta';

function addDaysYmd(ymd, n) {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Hitung agregat pendaftaran pada rentang [gte, lte].
async function aggregate(gte, lte) {
  const where = { deletedAt: null, createdAt: { gte, lte } };
  const [total, affiliateCount, byChannelRaw] = await Promise.all([
    prisma.tenant.count({ where }),
    prisma.tenant.count({ where: { ...where, affiliateReferral: { isNot: null } } }),
    prisma.tenant.groupBy({ by: ['signupChannel'], where, _count: { _all: true } }),
  ]);
  const byChannel = {};
  for (const row of byChannelRaw) byChannel[row.signupChannel || 'unknown'] = row._count._all;
  return { total, affiliateCount, byChannel };
}

function buildMessage(title, periodLabel, agg) {
  const lines = [];
  lines.push(`📊 <b>${title}</b>`);
  lines.push(`<i>${telegram.escapeHtml(periodLabel)}</i>`);
  lines.push('');
  lines.push(`Total pendaftar baru: <b>${agg.total}</b>`);
  if (agg.total > 0) {
    lines.push('');
    lines.push('Sumber:');
    if (agg.affiliateCount > 0) lines.push(`• Affiliate: <b>${agg.affiliateCount}</b>`);
    for (const [ch, n] of Object.entries(agg.byChannel)) {
      lines.push(`• ${telegram.escapeHtml(telegram.channelLabel(ch))}: <b>${n}</b>`);
    }
  }
  return lines.join('\n');
}

// Kirim ringkasan satu periode bila toggle terkait aktif.
async function runSummary({ flag, title, gte, lte, periodLabel }) {
  try {
    const cfg = await telegram.getConfig(true);
    if (!cfg.enabled || !cfg[flag]) return;
    const agg = await aggregate(gte, lte);
    const res = await telegram.sendMessage(buildMessage(title, periodLabel, agg));
    if (!res.sent) console.error(`[RegSummary:${flag}] not sent:`, res.reason);
  } catch (err) {
    console.error(`[RegSummary:${flag}] error:`, err?.message || err);
  }
}

async function runDaily() {
  const todayYmd = formatYmdInTz(new Date(), TZ);
  const yYmd = addDaysYmd(todayYmd, -1);
  return runSummary({
    flag: 'daily',
    title: 'Laporan Pendaftaran Harian',
    gte: tenantDayStart(yYmd, TZ),
    lte: tenantDayEnd(yYmd, TZ),
    periodLabel: yYmd,
  });
}

async function runWeekly() {
  const todayYmd = formatYmdInTz(new Date(), TZ); // dijalankan Senin
  const prevMonday = addDaysYmd(todayYmd, -7);
  const prevSunday = addDaysYmd(todayYmd, -1);
  return runSummary({
    flag: 'weekly',
    title: 'Laporan Pendaftaran Mingguan',
    gte: tenantDayStart(prevMonday, TZ),
    lte: tenantDayEnd(prevSunday, TZ),
    periodLabel: `${prevMonday} s/d ${prevSunday}`,
  });
}

async function runMonthly() {
  const todayYmd = formatYmdInTz(new Date(), TZ); // dijalankan tgl 1
  const lastDayPrev = addDaysYmd(`${todayYmd.slice(0, 7)}-01`, -1);
  const firstDayPrev = `${lastDayPrev.slice(0, 7)}-01`;
  return runSummary({
    flag: 'monthly',
    title: 'Laporan Pendaftaran Bulanan',
    gte: tenantDayStart(firstDayPrev, TZ),
    lte: tenantDayEnd(lastDayPrev, TZ),
    periodLabel: lastDayPrev.slice(0, 7),
  });
}

function initRegistrationSummaryJob() {
  // Harian 09:00 WIB → ringkasan kemarin
  cron.schedule('0 9 * * *', () => { runDaily(); }, { timezone: TZ });
  // Mingguan Senin 08:00 WIB → ringkasan minggu lalu
  cron.schedule('0 8 * * 1', () => { runWeekly(); }, { timezone: TZ });
  // Bulanan tgl 1, 08:00 WIB → ringkasan bulan lalu
  cron.schedule('0 8 1 * *', () => { runMonthly(); }, { timezone: TZ });
  console.log('[RegSummary] Scheduled: daily 09:00, weekly Mon 08:00, monthly 1st 08:00 ' + TZ);
}

module.exports = { initRegistrationSummaryJob, runDaily, runWeekly, runMonthly };
