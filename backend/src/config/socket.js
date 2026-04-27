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
  io.to(branchRoom(queueEntry.branchId)).emit(event, queueEntry);
  // Tenant-level dashboards (mis. TADashboard) ikut menerima
  if (queueEntry.tenantId) {
    io.to(tenantRoom(queueEntry.tenantId)).emit(event, queueEntry);
  }
}

function emitTicketEvent(event, ticket, opts = {}) {
  if (!io || !ticket) return;
  // Broadcast ke pembuat tiket (siapa pun perannya)
  if (ticket.createdById) {
    io.to(userRoom(ticket.createdById)).emit(event, ticket);
  }
  // Broadcast ke semua super_admin via tenant room global; untuk simplicity,
  // emit ke tenant room tiket itu (super_admin biasanya tidak join tenant room).
  // Solusi: tambahkan room khusus 'support'. Lihat di bawah.
  io.to('support').emit(event, ticket);
  // Tenant admin yang login (di-room tenant) juga ikut menerima
  if (ticket.tenantId) {
    io.to(tenantRoom(ticket.tenantId)).emit(event, ticket);
  }
  if (opts.toUserId) {
    io.to(userRoom(opts.toUserId)).emit(event, ticket);
  }
}

module.exports = {
  initSocket,
  getIO,
  emitQueueEvent,
  emitTicketEvent,
  branchRoom,
  tenantRoom,
  userRoom,
};
