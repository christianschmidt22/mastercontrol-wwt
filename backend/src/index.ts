import express from 'express';
import cors from 'cors';
import { initSchema } from './db/database.js';
import { errorHandler } from './middleware/errorHandler.js';

initSchema();

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Routes mounted in subsequent phases:
//   /api/organizations  (Phase 2)
//   /api/contacts       (Phase 2)
//   /api/projects       (Phase 2)
//   /api/apps           (Phase 2)
//   /api/notes          (Phase 3, includes /chat SSE endpoint)
//   /api/settings       (Phase 4)

app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`[mastercontrol] backend listening on http://localhost:${PORT}`);
});
