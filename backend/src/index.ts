import express from 'express';
import cors from 'cors';
import { initSchema } from './db/database.js';
import { errorHandler } from './middleware/errorHandler.js';
import { organizationsRouter } from './routes/organizations.route.js';
import { contactsRouter } from './routes/contacts.route.js';
import { projectsRouter } from './routes/projects.route.js';
import { documentsRouter } from './routes/documents.route.js';
import { notesRouter } from './routes/notes.route.js';
import { tasksRouter } from './routes/tasks.route.js';
import { agentsRouter } from './routes/agents.route.js';
import { settingsRouter } from './routes/settings.route.js';

initSchema();

// R-013: explicit allowlist of origins. Backend is loopback-only (R-001), so
// only the local Vite dev server and the production frontend served on the
// same host are allowed. No env override; there's no legitimate cross-origin
// case in this single-user-localhost app.
const ALLOWED_ORIGINS = new Set<string>([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const app = express();

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow no-origin requests (curl, same-origin) and explicit allowlist.
      if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true);
      return cb(new Error(`origin not allowed: ${origin}`));
    },
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  })
);

app.use(express.json());

// R-013: belt-and-braces Origin check on every mutating request. Drive-by
// CSRF from any malicious page the user happens to visit while the backend
// is running otherwise succeeds because there's no auth.
app.use((req, _res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const origin = req.get('origin') ?? req.get('referer');
    if (origin) {
      try {
        const o = new URL(origin).origin;
        if (!ALLOWED_ORIGINS.has(o)) return next(new Error(`origin not allowed: ${o}`));
      } catch {
        return next(new Error('malformed origin'));
      }
    }
  }
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/organizations', organizationsRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/notes', notesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/settings', settingsRouter);

app.use(errorHandler);

// R-001: bind loopback only. `0.0.0.0` would expose the backend on every
// network the laptop joins (coffee shops, hotels, conference Wi-Fi) — once
// the Phase 2 Windows Service starts the process at logon, that becomes a
// permanent exposure. Localhost-only enforced here and at the Vite dev
// server (frontend/vite.config.ts).
const PORT = Number(process.env.PORT ?? 3001);
const HOST = '127.0.0.1';
app.listen(PORT, HOST, () => {
  console.log(`[mastercontrol] backend listening on http://${HOST}:${PORT}`);
});
