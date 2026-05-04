// src/index.ts
import 'dotenv/config';
import 'express-async-errors';    // makes async errors go to Express error handler
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes   from './routes/auth.routes';
import queueRoutes  from './routes/queue.routes';
import ticketRoutes from './routes/ticket.routes';
import { initSocket } from './socket/queue.socket';

const app = express();
const httpServer = createServer(app);

// ── Socket.io ─────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});
initSocket(io);

// ── Middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));  // 100 req / 15 min

// ── Routes ────────────────────────────────────────────────────────
app.use('/api/v1/auth',    authRoutes);
app.use('/api/v1/queues',  queueRoutes);
app.use('/api/v1/tickets', ticketRoutes);

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ── Error handler ─────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.message);
  const status = err.message.includes('not found') ? 404
  : err.message.includes('Invalid')   ? 401
  : err.message.includes('already')   ? 409
  : 500;
  res.status(status).json({ error: err.message });
});

// ── Start ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});