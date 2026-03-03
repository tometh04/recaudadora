import express from 'express';
import cors from 'cors';

import { config } from './config.js';
import { SessionManager } from './session-manager.js';
import { sessionsRouter } from './routes/sessions.js';
import { messagesRouter } from './routes/messages.js';

const app = express();

// Middleware
app.use(cors({
  origin: config.CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Session manager (core)
const manager = new SessionManager();

// API Routes
app.use('/api/sessions', sessionsRouter(manager));
app.use('/api/messages', messagesRouter(manager));

// Serve downloaded media files
app.use('/media', express.static(config.MEDIA_DIR));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    sessions: manager.getAllSessions().length,
    uptime: process.uptime(),
  });
});

// Startup
async function start() {
  console.log('========================================');
  console.log('  WhatsApp Baileys Server');
  console.log('========================================');
  console.log(`  CORS Origin: ${config.CORS_ORIGIN}`);
  console.log(`  Auth Dir:    ${config.AUTH_DIR}`);
  console.log(`  Media Dir:   ${config.MEDIA_DIR}`);
  console.log(`  Max Messages: ${config.MAX_MESSAGES}`);
  console.log('========================================');

  // Restore existing sessions
  await manager.restoreAllSessions();

  app.listen(config.PORT, () => {
    console.log(`\n  Server running on http://localhost:${config.PORT}`);
    console.log(`  API: http://localhost:${config.PORT}/api/sessions`);
    console.log('========================================\n');
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
