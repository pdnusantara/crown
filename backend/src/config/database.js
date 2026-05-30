const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
});

// Catatan: penanganan SIGINT/SIGTERM dipusatkan di server.js (graceful
// shutdown terkoordinasi: tutup HTTP/Socket dulu, baru $disconnect). Dulu di
// sini ada handler yang langsung process.exit(0) — itu balapan dengan, dan
// mematikan, drain koneksi sebelum selesai. prisma.$disconnect() dipanggil
// dari server.js shutdown().

module.exports = prisma;
