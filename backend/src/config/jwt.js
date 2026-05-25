const jwt = require('jsonwebtoken');

// Secret WAJIB dari environment. Di PRODUKSI, ketiadaan secret = fatal: tanpa
// guard ini server diam-diam menandatangani & menerima token dengan secret
// default publik → siapa pun bisa memalsukan token (auth bypass total). Maka
// hentikan boot. Di non-produksi pakai fallback dev yang jelas (setup lokal).
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET)) {
  throw new Error('FATAL: JWT_SECRET & JWT_REFRESH_SECRET wajib diset di environment produksi.');
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-DO-NOT-USE-IN-PRODUCTION';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-only-refresh-secret-DO-NOT-USE-IN-PRODUCTION';
const ACCESS_EXPIRY = '15m';
const REFRESH_EXPIRY = '7d';

function signAccess(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRY });
}

function signRefresh(payload) {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
}

function verifyAccess(token) {
  return jwt.verify(token, JWT_SECRET);
}

function verifyRefresh(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh, REFRESH_EXPIRY };
