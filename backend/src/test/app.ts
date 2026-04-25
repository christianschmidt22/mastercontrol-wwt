/**
 * Test app builder — constructs a fresh Express app per test file so route
 * tests don't depend on `index.ts` boot side-effects (port bind, initSchema,
 * process.env reads that happen at module-load time).
 *
 * Usage (in a test file):
 *   import { buildApp } from '../test/app.js';
 *   let app: Express;
 *   beforeAll(async () => { app = await buildApp(); });
 *
 * Route modules that have not yet been created (or fail to import) are
 * silently skipped — tests for those routes will receive 404s and fail
 * deliberately, which is the correct behaviour during incremental delivery.
 *
 * Named-export convention:
 *   Route files export a named Router (e.g. `export const contactsRouter`).
 *   buildApp() locates the first Router-shaped export in each module.
 */

import express, { type Express, type Router } from 'express';
import { errorHandler } from '../middleware/errorHandler.js';

function isRouter(value: unknown): value is Router {
  // A Router is a function with `stack` array and Express router-specific props.
  if (typeof value !== 'function') return false;
  // `as unknown as` first because TS can narrow `value` to `Function` after
  // typeof === 'function', and Function is not directly index-signature-compatible.
  const fn = value as unknown as Record<string, unknown>;
  return (
    typeof fn['use'] === 'function' &&
    typeof fn['get'] === 'function' &&
    typeof fn['post'] === 'function'
  );
}

async function tryImportRouter(moduleSpecifier: string): Promise<Router | null> {
  try {
    // Dynamic import — vite-node resolves .js → .ts automatically.
    const mod = await import(moduleSpecifier) as Record<string, unknown>;

    // Prefer `default` export if it's a router.
    if (isRouter(mod.default)) return mod.default;

    // Fall back: find the first exported Router (named export convention).
    for (const value of Object.values(mod)) {
      if (isRouter(value)) return value;
    }

    return null;
  } catch {
    // Route file missing or fails to import — skip it silently.
    return null;
  }
}

export async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());

  // Health smoke-test
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Attempt to mount each route. Missing or broken files are silently skipped.
  const mounts: Array<[string, string]> = [
    ['/api/organizations', '../routes/organizations.route.js'],
    ['/api/contacts',      '../routes/contacts.route.js'],
    ['/api/projects',      '../routes/projects.route.js'],
    ['/api/documents',     '../routes/documents.route.js'],
    ['/api/notes',         '../routes/notes.route.js'],
    ['/api/tasks',         '../routes/tasks.route.js'],
    ['/api/agents',        '../routes/agents.route.js'],
    ['/api/settings',      '../routes/settings.route.js'],
  ];

  for (const [prefix, specifier] of mounts) {
    const router = await tryImportRouter(specifier);
    if (router) {
      app.use(prefix, router);
    }
  }

  app.use(errorHandler);

  return app;
}
