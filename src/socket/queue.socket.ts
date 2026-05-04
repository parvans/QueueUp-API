// src/sockets/queue.socket.ts
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

let io: Server;

export function initSocket(server: Server) {
  io = server;

  io.use((socket, next) => {
    // Authenticate socket connection using JWT
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
        id: string; email: string; role: string;
      };
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user;
    console.log(`Socket connected: ${user.id}`);

    // Join personal room — for private notifications ("your turn!")
    socket.join(`user:${user.id}`);

    // Client sends this when they open a queue screen
    socket.on('queue:join_room', (queueId: string) => {
      socket.join(`queue:${queueId}`);
      console.log(`User ${user.id} joined room queue:${queueId}`);
    });

    // Client sends this when they leave a queue screen
    socket.on('queue:leave_room', (queueId: string) => {
      socket.leave(`queue:${queueId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${user.id}`);
    });
  });
}

// Export io so controllers can emit events
export function getIO(): Server {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}