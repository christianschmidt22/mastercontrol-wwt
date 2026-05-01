import express from 'express';
import cors from 'cors';
import { runMigrations } from './db/database.js';
import { warmDpapi } from './models/settings.model.js';
import { errorHandler } from './middleware/errorHandler.js';
import { organizationsRouter } from './routes/organizations.route.js';
import { contactsRouter } from './routes/contacts.route.js';
import { projectsRouter } from './routes/projects.route.js';
import { documentsRouter } from './routes/documents.route.js';
import { notesRouter } from './routes/notes.route.js';
import { tasksRouter } from './routes/tasks.route.js';
import { agentsRouter } from './routes/agents.route.js';
import { settingsRouter } from './routes/settings.route.js';
import { reportsRouter } from './routes/reports.route.js';
import { ingestRouter } from './routes/ingest.route.js';
import { oemScanRouter } from './routes/oem-scan.route.js';
import { subagentRouter } from './routes/subagent.route.js';
import { shellRouter } from './routes/shell.route.js';
import { calendarRouter } from './routes/calendar.route.js';
import { alertsRouter } from './routes/alerts.route.js';
import { projectResourcesRouter } from './routes/projectResources.route.js';
import { masterNotesRouter } from './routes/masterNotes.route.js';
import { backlogItemsRouter } from './routes/backlogItems.route.js';
import { outlookRouter } from './routes/outlook.route.js';
import { m365Router } from './routes/m365.route.js';
import { captureActionRouter } from './routes/captureAction.route.js';
import { heartbeatRouter } from './routes/heartbeat.route.js';
import { seedDailyTaskReview } from './services/reports.service.js';
import {
  runMissedJobs,
  startInProcessScheduler,
} from './services/scheduler.service.js';
import { scheduleCalendarSync } from './services/calendarSync.service.js';

runMigrations();

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

app.use(express.json({ limit: '16mb' }));

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
app.use('/api/reports', reportsRouter);
app.use('/api/ingest', ingestRouter);
app.use('/api/oem', oemScanRouter);
app.use('/api/subagent', subagentRouter);
app.use('/api/shell', shellRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/projects/:projectId/resources', projectResourcesRouter);
app.use('/api/master-notes', masterNotesRouter);
app.use('/api/backlog-items', backlogItemsRouter);
app.use('/api/outlook', outlookRouter);
app.use('/api/m365', m365Router);
app.use('/api/capture-action', captureActionRouter);
app.use('/api/heartbeat', heartbeatRouter);

app.use(errorHandler);

// R-003: Pre-warm DPAPI so the native module is resolved before the first
// PUT /api/settings request arrives. A failure here (e.g. on non-Windows CI)
// is non-fatal — the model falls back to no-op encryption and logs a warning.
try {
  await warmDpapi();
} catch (err) {
  console.warn(
    '[mastercontrol] warmDpapi failed at boot — DPAPI unavailable, API key will be stored without encryption.',
    err instanceof Error ? err.message : String(err),
  );
}

// Phase 2 startup sequence: seed default reports, catch up any missed
// scheduler runs (e.g. machine was suspended past a cron fire-time), then
// register the in-process node-cron jobs. Each step is best-effort; logging
// the failure is preferable to refusing to boot the HTTP server.
try {
  seedDailyTaskReview();
} catch (err) {
  console.warn(
    '[mastercontrol] seedDailyTaskReview failed — Reports page will start empty.',
    err instanceof Error ? err.message : String(err),
  );
}
try {
  await runMissedJobs();
} catch (err) {
  console.warn(
    '[mastercontrol] runMissedJobs failed at boot — missed schedules will not be caught up until the next tick.',
    err instanceof Error ? err.message : String(err),
  );
}
try {
  startInProcessScheduler();
} catch (err) {
  console.warn(
    '[mastercontrol] startInProcessScheduler failed — scheduled reports will not fire from this process.',
    err instanceof Error ? err.message : String(err),
  );
}
try {
  scheduleCalendarSync();
} catch (err) {
  console.warn(
    '[mastercontrol] scheduleCalendarSync failed — calendar sync will not run.',
    err instanceof Error ? err.message : String(err),
  );
}

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
