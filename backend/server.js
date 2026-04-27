require('dotenv').config();
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const routes = require('./src/routes/index');
const errorHandler = require('./src/middleware/errorHandler');
const tenantResolver = require('./src/middleware/tenantResolver');
const { initSocket } = require('./src/config/socket');

const app = express();

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
  max: isDev ? 1000 : 100,  // loose in dev
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

// Login/refresh rate limiting — only on mutation endpoints, not /me
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 15,    // strict in prod only
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts, please try again later.' },
});

app.use('/api', generalLimiter);
// Apply strict limiter only to login & refresh — NOT to /me or /logout
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/refresh', loginLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// Resolve tenant from subdomain or X-Tenant-Slug header on every request
app.use(tenantResolver);

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
});

module.exports = app;
