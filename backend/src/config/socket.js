const { Server } = require('socket.io');
const { verifyAccess } = require('./jwt');
const prisma = require('./database');

let io = null;

function branchRoom(branchId) {
  return `branch:${branchId}`;
}

function tenantRoom(tenantId) {
  return `tenant:${tenantId}`;
}

function userRoom(userId) {
  return `user:${userId}`;
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token) return next(new Error('No token provided'));

      const decoded = verifyAccess(token);
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, role: true, tenantId: true, branchId: true, isActive: true, deletedAt: true },
      });
      if (!user || !user.isActive || user.deletedAt) {
        return next(new Error('User inactive or not found'));
      }
      socket.data.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;

    // Setiap user otomatis join personal room (untuk notifikasi tiket, dll)
    socket.join(userRoom(user.id));
    if (user.tenantId) socket.join(tenantRoom(user.tenantId));
    if (user.role === 'super_admin') socket.join('support');

    socket.on('queue:join', (branchId) => {
      if (!branchId || typeof branchId !== 'string') return;
      if (user.role !== 'super_admin') {
        if (user.role === 'barber' || user.role === 'kasir') {
          if (user.branchId && user.branchId !== branchId) return;
        }
      }
      socket.join(branchRoom(branchId));
    });

    socket.on('queue:leave', (branchId) => {
      if (!branchId || typeof branchId !== 'string') return;
      socket.leave(branchRoom(branchId));
    });

    socket.on('tenant:join', (tenantId) => {
      if (!tenantId || typeof tenantId !== 'string') return;
      if (user.role !== 'super_admin' && user.tenantId !== tenantId) return;
      socket.join(tenantRoom(tenantId));
    });

    socket.on('tenant:leave', (tenantId) => {
      if (!tenantId || typeof tenantId !== 'string') return;
      socket.leave(tenantRoom(tenantId));
    });
  });

  return io;
}

function getIO() {
  return io;
}

function emitQueueEvent(event, queueEntry) {
  if (!io || !queueEntry?.branchId) return;
  // Socket.io v4 `.to([rooms])` mengirim sekali ke setiap socket yang join
  // di salah satu room — auto-dedupe. Sebelumnya dua `.to().emit()` terpisah
  // bikin socket yang join keduanya (mis. kasir di branchRoom + tenantRoom)
  // menerima event GANDA → notifikasi & toast dobel.
  const rooms = [branchRoom(queueEntry.branchId)];
  if (queueEntry.tenantId) rooms.push(tenantRoom(queueEntry.tenantId));
  io.to(rooms).emit(event, queueEntry);
}

function emitBookingEvent(event, booking) {
  if (!io || !booking?.branchId) return;
  const rooms = [branchRoom(booking.branchId)];
  if (booking.tenantId) rooms.push(tenantRoom(booking.tenantId));
  // Barber yang ditugaskan: juga di-emit lewat personal room supaya tetap
  // dapat notifikasi saat sedang tidak join branch room. Tetap aman dari
  // dobel karena `.to([rooms])` dedupe per-socket.
  if (booking.barberId) rooms.push(userRoom(booking.barberId));
  io.to(rooms).emit(event, booking);
}

function emitTicketEvent(event, ticket, opts = {}) {
  if (!io || !ticket) return;
  // Gabung semua room target ke array supaya socket.io dedupe per-socket
  // (sebelumnya 4 panggilan .to().emit() terpisah → bisa dobel bila socket
  // pengguna join beberapa room sekaligus).
  const rooms = ['support'];
  if (ticket.createdById) rooms.push(userRoom(ticket.createdById));
  if (ticket.tenantId)    rooms.push(tenantRoom(ticket.tenantId));
  if (opts.toUserId)      rooms.push(userRoom(opts.toUserId));
  io.to(rooms).emit(event, ticket);
}

module.exports = {
  initSocket,
  getIO,
  emitQueueEvent,
  emitBookingEvent,
  emitTicketEvent,
  branchRoom,
  tenantRoom,
  userRoom,
};
