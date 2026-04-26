/**
 * oem-scan.route.test.ts — Phase 2 / Step 8.
 *
 * Coverage:
 *   - Happy path: tmp directory with 2 files + 1 subdirectory.
 *     Response has configured=true, files.length===3, directory classified
 *     correctly, two new file rows upserted into documents.
 *   - Not configured: org has no onedrive_folder → { configured: false, files: [] }.
 *   - Wrong org type: customer → 400.
 *   - Org not found → 404.
 *   - Safe-path rejection: onedrive_folder='../../etc' → 400.
 *
 * organizationModel.get and settingsModel.get are mocked via vi.mock so the
 * test never touches a real OneDrive folder or requires the DB to have org rows.
 * documentModel.upsertOneDriveFile uses the real in-memory DB.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { errorHandler } from '../middleware/errorHandler.js';
import { db } from '../db/database.js';
import type * as OrganizationModule from '../models/organization.model.js';
import type * as SettingsModule from '../models/settings.model.js';

// ---------------------------------------------------------------------------
// Mock organizationModel and settingsModel.
//
// vi.mock + vi.hoisted pattern: the mock factory is hoisted to the top of the
// compiled output, before any static imports resolve. vi.hoisted() gives us a
// stable reference we can mutate between tests.
// ---------------------------------------------------------------------------

const { mockOrgGet, mockSettingsGet } = vi.hoisted(() => ({
  mockOrgGet: vi.fn(),
  mockSettingsGet: vi.fn(),
}));

vi.mock('../models/organization.model.js', async (importOriginal) => {
  const actual = await importOriginal<typeof OrganizationModule>();
  return {
    ...actual,
    organizationModel: {
      ...actual.organizationModel,
      get: mockOrgGet,
    },
  };
});

vi.mock('../models/settings.model.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SettingsModule>();
  return {
    ...actual,
    settingsModel: {
      ...actual.settingsModel,
      get: mockSettingsGet,
    },
  };
});

// Import the router AFTER vi.mock declarations so the mocks are in place.
import { oemScanRouter } from './oem-scan.route.js';

// ---------------------------------------------------------------------------
// Tmp directory setup
// ---------------------------------------------------------------------------

let tmpRoot: string;
let tmpSubdir: string;
let tmpFile1: string;
let tmpFile2: string;

beforeAll(() => {
  // Create a tmp root dir with 2 files and 1 subdirectory.
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oem-scan-test-'));
  tmpSubdir = path.join(tmpRoot, 'subdir');
  fs.mkdirSync(tmpSubdir);

  tmpFile1 = path.join(tmpRoot, 'report-q1.pdf');
  tmpFile2 = path.join(tmpRoot, 'sow.docx');
  fs.writeFileSync(tmpFile1, 'PDF content for Q1');
  fs.writeFileSync(tmpFile2, 'SOW content');

  // The route handler upserts documents with organization_id = the org id
  // from the URL. We mock organizationModel.get so the route's existence
  // check passes, but the real `documents` table has a FK to `organizations`
  // — without an actual row, the upsert would silently fail (best-effort
  // try/catch in the route) and the assertions on `documents` would see 0
  // rows. Insert a real org row keyed at id=1 so the FK is satisfied.
  db.prepare(
    "INSERT OR IGNORE INTO organizations (id, type, name) VALUES (1, 'oem', 'Test OEM')",
  ).run();
});

afterAll(() => {
  // Clean up tmp dir.
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures
  }
});

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  // The router is mounted at /api/oem so /:id resolves correctly.
  app.use('/api/oem', oemScanRouter);
  app.use(errorHandler);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/oem/:id/documents/scan — happy path', () => {
  it('returns configured=true, 3 entries (2 files + 1 dir), upserts files to documents', async () => {
    mockOrgGet.mockReturnValue({
      id: 1,
      type: 'oem',
      name: 'Test OEM',
      metadata: { onedrive_folder: tmpRoot },
      created_at: '',
      updated_at: '',
    });
    // onedrive_folder is absolute, so settingsModel.get should not be needed
    // for the root resolution. Still mock it for robustness.
    mockSettingsGet.mockReturnValue(tmpRoot);

    const res = await request(app).get('/api/oem/1/documents/scan');
    expect(res.status).toBe(200);

    const body = res.body as {
      configured: boolean;
      root: string;
      files: Array<{ name: string; kind: 'file' | 'directory'; size?: number; mtime: string }>;
    };

    expect(body.configured).toBe(true);
    expect(body.root).toBeTruthy();
    expect(body.files).toHaveLength(3);

    const fileEntries = body.files.filter((f) => f.kind === 'file');
    const dirEntries = body.files.filter((f) => f.kind === 'directory');

    expect(fileEntries).toHaveLength(2);
    expect(dirEntries).toHaveLength(1);

    // Files should have size
    for (const f of fileEntries) {
      expect(f.size).toBeTypeOf('number');
      expect(f.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }

    // Directory should have mtime but no size
    expect(dirEntries[0].size).toBeUndefined();
    expect(dirEntries[0].name).toBe('subdir');

    // Confirm documents rows were upserted for the two files.
    const rows = db
      .prepare<[number], { url_or_path: string; source: string }>(
        "SELECT url_or_path, source FROM documents WHERE organization_id = ? AND source = 'onedrive_scan'",
      )
      .all(1);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const paths = rows.map((r) => r.url_or_path);
    expect(paths.some((p) => p.includes('report-q1.pdf'))).toBe(true);
    expect(paths.some((p) => p.includes('sow.docx'))).toBe(true);
  });
});

describe('GET /api/oem/:id/documents/scan — not configured', () => {
  it('returns { configured: false, files: [] } when onedrive_folder absent', async () => {
    mockOrgGet.mockReturnValue({
      id: 2,
      type: 'oem',
      name: 'No Folder OEM',
      metadata: {},
      created_at: '',
      updated_at: '',
    });
    mockSettingsGet.mockReturnValue(null);

    const res = await request(app).get('/api/oem/2/documents/scan');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ configured: false, files: [] });
  });

  it('returns { configured: false, files: [] } when onedrive_folder is empty string', async () => {
    mockOrgGet.mockReturnValue({
      id: 3,
      type: 'oem',
      name: 'Empty Folder OEM',
      metadata: { onedrive_folder: '' },
      created_at: '',
      updated_at: '',
    });
    mockSettingsGet.mockReturnValue(null);

    const res = await request(app).get('/api/oem/3/documents/scan');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ configured: false, files: [] });
  });
});

describe('GET /api/oem/:id/documents/scan — wrong org type', () => {
  it('returns 400 when org type is customer', async () => {
    mockOrgGet.mockReturnValue({
      id: 10,
      type: 'customer',
      name: 'A Customer',
      metadata: { onedrive_folder: tmpRoot },
      created_at: '',
      updated_at: '',
    });

    const res = await request(app).get('/api/oem/10/documents/scan');
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/not type oem/i);
  });
});

describe('GET /api/oem/:id/documents/scan — org not found', () => {
  it('returns 404 when org does not exist', async () => {
    mockOrgGet.mockReturnValue(undefined);

    const res = await request(app).get('/api/oem/9999/documents/scan');
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toMatch(/not found/i);
  });
});

describe('GET /api/oem/:id/documents/scan — safe-path rejection', () => {
  it('returns 400 with safe-path error when onedrive_folder escapes root', async () => {
    // onedrive_folder='../../etc' is relative; combined with a tmp root,
    // the resolved path escapes the root → safe-path-rejected.
    mockOrgGet.mockReturnValue({
      id: 20,
      type: 'oem',
      name: 'Escape Attempt OEM',
      metadata: { onedrive_folder: '../../etc' },
      created_at: '',
      updated_at: '',
    });
    // Provide a real tmp directory as the root so path resolution can proceed.
    mockSettingsGet.mockReturnValue(tmpRoot);

    const res = await request(app).get('/api/oem/20/documents/scan');
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/safe-path-rejected/i);
  });
});

describe('GET /api/oem/:id/documents/scan — invalid id', () => {
  it('returns 400 for non-numeric id', async () => {
    // mockOrgGet should not even be called.
    mockOrgGet.mockReturnValue(undefined);

    const res = await request(app).get('/api/oem/abc/documents/scan');
    expect(res.status).toBe(400);
  });

  it('returns 400 for id=0', async () => {
    const res = await request(app).get('/api/oem/0/documents/scan');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/oem/:id/documents/scan — missing onedrive_root for relative path', () => {
  it('returns 500 when folder is relative and onedrive_root not configured', async () => {
    mockOrgGet.mockReturnValue({
      id: 30,
      type: 'oem',
      name: 'Relative Folder OEM',
      metadata: { onedrive_folder: 'some/relative/folder' },
      created_at: '',
      updated_at: '',
    });
    mockSettingsGet.mockReturnValue(null); // onedrive_root not set

    const res = await request(app).get('/api/oem/30/documents/scan');
    expect(res.status).toBe(500);
    expect((res.body as { error: string }).error).toMatch(/onedrive_root not set/i);
  });
});
