require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const routes = require('./src/routes/index');
const errorHandler = require('./src/middleware/errorHandler');
const tenantResolver = require('./src/middleware/tenantResolver');
const { resolveBranchAliasMiddleware } = require('./src/utils/branchResolver');
const { initSocket } = require('./src/config/socket');
const { initRenewalJob } = require('./src/jobs/subscriptionRenewal');

const app = express();
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS — allow exact FRONTEND_URL and any subdomain of it
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin === frontendUrl) return callback(null, true);
    try {
      const allowedHost = new URL(frontendUrl).hostname;
      const originHost = new URL(origin).hostname;
      if (originHost === allowedHost || originHost.endsWith(`.${allowedHost}`)) {
        return callback(null, true);
      }
    } catch {}
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Slug'],
}));

// Webhook WA Gateway — dipasang SEBELUM express.json global karena verifikasi
// HMAC butuh raw body. Parser khusus di sini menyimpan raw body di req.rawBody;
// express.json global setelahnya akan melewati request yang sudah ter-parse.
const whatsappWebhookRoutes = require('./src/routes/whatsappWebhook');
app.use(
  '/api/whatsapp/webhook',
  express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }),
  whatsappWebhookRoutes
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

const isDev = process.env.NODE_ENV !== 'production';

// General rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Aplikasi dashboard cukup "chatty" (polling, beberapa query paralel).
  // Batas 100/15m terlalu cepat mentok di production dan memicu 429 palsu.
  max: isDev ? 2000 : 1200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => (
    req.path === '/auth/me' ||
    req.path === '/auth/refresh'
  ),
  message: { success: false, error: 'Too many requests, please try again later.' },
});

// Login rate limiting — brute-force protection on /auth/login only.
// `skipSuccessfulRequests` means we only count failed attempts, so legit users
// in a shared office (multiple admin/kasir/barber on one NAT IP) don't get
// blocked by each other's successful logins.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, error: 'Too many authentication attempts, please try again later.' },
});

// Refresh rate limiting — separate, much more lenient bucket. Refresh fires
// automatically every ~15min per active user; sharing the login bucket meant
// 4 users on one IP could exhaust it in a single window before anyone tried
// to actually log in. Successful refreshes don't count against the budget.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 1000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, error: 'Too many refresh attempts, please try again later.' },
});

// Gambar yang diunggah builder landing — disajikan statis dari disk.
// Dipasang sebelum rate limiter & tenantResolver supaya akses gambar tidak
// terbatas kuota dan tidak butuh konteks tenant. Lewat prefix /api supaya
// ikut proxy nginx yang sudah ada (tanpa perubahan nginx).
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api', generalLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/refresh', refreshLimiter);
// Trial signup juga dibatasi (lebih ketat lagi: maks 5/IP/15m di prod)
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 50 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Terlalu banyak pendaftaran. Coba lagi 15 menit.' },
});
app.use('/api/auth/register', registerLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});
app.get('/api/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// Resolve tenant from subdomain or X-Tenant-Slug header on every request
app.use(tenantResolver);

// Allow URL/query/body to pass branchId as either CUID or human-friendly code.
// Replaces with the real id so downstream handlers can keep using `branchId` as-is.
app.use(resolveBranchAliasMiddleware());

// Block all non-public requests for suspended tenants
// Auth + resolve are exempted so users can still log in and see the suspension message
app.use((req, res, next) => {
  if (!req.tenant?.isSuspended) return next();
  const exempt = req.path.startsWith('/api/auth/') || req.path === '/api/tenants/resolve' || req.path === '/health';
  if (exempt) return next();
  return res.status(403).json({ success: false, error: 'Tenant account is suspended. Please contact support.' });
});

// Mount routes
app.use('/api', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

const httpServer = http.createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`BarberOS backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}] (HTTP + Socket.io)`);
  initRenewalJob();
});

module.exports = app;
