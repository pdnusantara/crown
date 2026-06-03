'use strict';

// Job: kunci trial WhatsApp yang sudah habis. Tiap jam memeriksa tenant yang
// flag `whatsapp`-nya masih menyala dari trial tapi window-nya sudah lewat &
// tidak upgrade ke paket ber-WhatsApp → matikan flag + lepas device (revoke).
// Lihat services/whatsappTrial.js (expireDueTrials) untuk detail logika.

const cron = require('node-cron');
const { expireDueTrials } = require('../services/whatsappTrial');

function initWhatsappTrialExpiryJob() {
  // Sekali saat boot — jaga-jaga downtime melewati jadwal jam.
  expireDueTrials().catch((err) => console.error('[WATrial] boot run failed:', err.message));

  // Tiap jam di menit ke-10 (granularitas hari, tak perlu sering).
  cron.schedule('10 * * * *', () => {
    expireDueTrials().catch((err) => console.error('[WATrial] cron run failed:', err.message));
  });
  console.log('[WATrial] Scheduled: hourly trial expiry check');
}

module.exports = { initWhatsappTrialExpiryJob, expireDueTrials };
