const { ZodError } = require('zod');
const { Prisma } = require('@prisma/client');
const prisma = require('../config/database');

function errorHandler(err, req, res, next) {
  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // Prisma known errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const fields = err.meta?.target || [];
      return res.status(409).json({
        success: false,
        error: `Duplicate value for unique field(s): ${fields.join(', ')}`,
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    if (err.code === 'P2003') {
      return res.status(400).json({ success: false, error: 'Referenced record does not exist' });
    }
    return res.status(400).json({ success: false, error: err.message });
  }

  // Prisma validation errors
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ success: false, error: 'Database validation error' });
  }

  // JWT errors (fallback)
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, error: 'Token expired' });
  }

  // Custom app errors with statusCode
  if (err.statusCode) {
    return res.status(err.statusCode).json({ success: false, error: err.message });
  }

  // Generic errors
  const statusCode = err.status || 500;
  const message =
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal server error'
      : err.message || 'Internal server error';

  if (statusCode >= 500) {
    console.error('[Error]', err);
    // Persist to ErrorLog table asynchronously — fire and forget
    prisma.errorLog.create({
      data: {
        level:      'error',
        type:       'api_error',
        message:    err.message || 'Internal server error',
        stack:      err.stack   || null,
        path:       req.path    || null,
        method:     req.method  || null,
        statusCode,
        tenantId:   req.user?.tenantId || null,
        userId:     req.user?.id       || null,
        metadata:   { query: req.query, body: req.body },
      },
    }).catch(() => {}); // never throw from within error handler
  }

  res.status(statusCode).json({ success: false, error: message });
}

module.exports = errorHandler;
