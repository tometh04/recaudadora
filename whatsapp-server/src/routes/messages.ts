import { Router, type Request, type Response } from 'express';
import type { SessionManager } from '../session-manager.js';

export function messagesRouter(manager: SessionManager): Router {
  const router = Router();

  // GET / - List messages with filters
  router.get('/', (req: Request, res: Response) => {
    const query = {
      sessionId: req.query.sessionId as string | undefined,
      phone: req.query.phone as string | undefined,
      since: req.query.since ? parseInt(req.query.since as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    };

    const result = manager.getMessages(query);
    res.json(result);
  });

  // GET /:id - Get single message
  router.get('/:id', (req: Request, res: Response) => {
    const id = req.params.id as string;
    const message = manager.getMessage(id);
    if (!message) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    res.json(message);
  });

  return router;
}
