const crypto = require('crypto');
const prisma = require('../config/database');

const SANDBOX_BASE = 'https://api-sandbox.duitku.com/api/merchant';
const PROD_BASE    = 'https://passport.duitku.com/webapi/api/merchant';

async function getSettings() {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: ['duitku_merchant_code', 'duitku_api_key', 'duitku_environment', 'duitku_expiry_minutes', 'duitku_active'] } },
  });
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    merchantCode:   map.duitku_merchant_code  || '',
    apiKey:         map.duitku_api_key         || '',
    environment:    map.duitku_environment     || 'sandbox',
    expiryMinutes:  parseInt(map.duitku_expiry_minutes || '60', 10),
    active:         map.duitku_active          === 'true',
  };
}

function baseUrl(environment) {
  return environment === 'production' ? PROD_BASE : SANDBOX_BASE;
}

function makeHeaders(merchantCode, apiKey) {
  const timestamp = Date.now().toString();
  const signature = crypto.createHash('sha256').update(merchantCode + timestamp + apiKey).digest('hex');
  return {
    'Content-Type':          'application/json',
    'x-duitku-merchantcode': merchantCode,
    'x-duitku-timestamp':    timestamp,
    'x-duitku-signature':    signature,
  };
}

async function createInvoice({ merchantOrderId, amount, email, productDetails, callbackUrl, returnUrl, customerName }) {
  const settings = await getSettings();
  if (!settings.merchantCode || !settings.apiKey) throw new Error('Duitku belum dikonfigurasi');

  const body = {
    merchantCode:    settings.merchantCode,
    paymentAmount:   amount,
    merchantOrderId,
    productDetails,
    email,
    customerVaName:  customerName || 'Customer',
    callbackUrl,
    returnUrl,
    expiryPeriod:    settings.expiryMinutes,
  };

  const res = await fetch(`${baseUrl(settings.environment)}/createInvoice`, {
    method:  'POST',
    headers: makeHeaders(settings.merchantCode, settings.apiKey),
    body:    JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || !data.paymentUrl) {
    throw new Error(data.statusMessage || `Duitku error ${res.status}`);
  }
  return data; // { paymentUrl, reference, vaNumber, amount, statusMessage }
}

async function checkStatus(merchantOrderId) {
  const settings = await getSettings();
  if (!settings.merchantCode || !settings.apiKey) throw new Error('Duitku belum dikonfigurasi');

  const signature = crypto.createHash('md5')
    .update(settings.merchantCode + merchantOrderId + settings.apiKey)
    .digest('hex');

  const endpoint = settings.environment === 'production'
    ? 'https://passport.duitku.com/webapi/api/merchant/transactionStatus'
    : 'https://sandbox.duitku.com/webapi/api/merchant/transactionStatus';

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ merchantCode: settings.merchantCode, merchantOrderId, signature }),
  });

  return res.json();
}

function verifyCallback(payload, apiKey) {
  const { merchantCode, amount, merchantOrderId, signature } = payload;
  const expected = crypto.createHash('md5')
    .update(merchantCode + amount + merchantOrderId + apiKey)
    .digest('hex');
  return expected === signature;
}

module.exports = { getSettings, createInvoice, checkStatus, verifyCallback };
