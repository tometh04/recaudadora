import { Router, type Request, type Response } from 'express';
import type { SessionManager } from '../session-manager.js';

export function sessionsRouter(manager: SessionManager): Router {
  const router = Router();

  // GET / - List all sessions
  router.get('/', (_req: Request, res: Response) => {
    const sessions = manager.getAllSessions();
    res.json(sessions);
  });

  // GET /:id - Get single session
  router.get('/:id', (req: Request, res: Response) => {
    const session = manager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  });

  // POST / - Create new session
  router.post('/', async (req: Request, res: Response) => {
    const { id } = req.body;

    if (!id || typeof id !== 'string') {
      res.status(400).json({ error: 'Session ID is required' });
      return;
    }

    // Validate ID format (alphanumeric + hyphens + underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      res.status(400).json({ error: 'ID must only contain letters, numbers, hyphens, and underscores' });
      return;
    }

    try {
      const session = await manager.createSession(id);
      res.status(201).json(session);
    } catch (err: any) {
      console.error('Create session error:', err);
      res.status(500).json({ error: err.message || 'Failed to create session' });
    }
  });

  // DELETE /:id - Delete session
  router.delete('/:id', async (req: Request, res: Response) => {
    const session = manager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    try {
      await manager.deleteSession(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      console.error('Delete session error:', err);
      res.status(500).json({ error: err.message || 'Failed to delete session' });
    }
  });

  // POST /:id/restart - Restart session
  router.post('/:id/restart', async (req: Request, res: Response) => {
    try {
      const session = await manager.restartSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      res.json(session);
    } catch (err: any) {
      console.error('Restart session error:', err);
      res.status(500).json({ error: err.message || 'Failed to restart session' });
    }
  });

  return router;
}
