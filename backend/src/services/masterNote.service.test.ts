/**
 * masterNote.service.test.ts
 *
 * Tests for `scanExternalMasterNoteEdits()` — the hourly job that catches
 * master_notes.md files edited outside the app (VS Code, OneDrive sync
 * from another device).
 *
 * `runLlmExtraction` is module-mocked so we don't try to talk to Claude.
 * The DB is the per-test in-memory SQLite from test/setup.ts.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Stub Claude-touching extraction so the scanner can drive processMasterNote
// to completion without an Anthropic call.
vi.mock('./noteProposal.service.js', () => ({
  runLlmExtraction: vi.fn(async () => undefined),
}));

import { scanExternalMasterNoteEdits } from './masterNote.service.js';
import { masterNoteModel } from '../models/masterNote.model.js';
import { systemAlertModel } from '../models/systemAlert.model.js';
import { runLlmExtraction } from './noteProposal.service.js';
import { makeOrg } from '../test/factories.js';

function tmpFile(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnscan-'));
  return path.join(dir, name);
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

beforeEach(() => {
  vi.mocked(runLlmExtraction).mockClear();
});

describe('scanExternalMasterNoteEdits', () => {
  it('runs extraction when disk mtime is newer and sha differs', async () => {
    const org = makeOrg();
    const filePath = tmpFile('master-notes.md');

    // Seed the row with old content + an old recorded mtime.
    const initial = masterNoteModel.upsert({
      organization_id: org.id,
      project_id: null,
      content: 'old content',
      file_path: filePath,
      file_mtime: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(initial.content_sha256).toBe(sha256('old content'));

    // Write fresh content to disk (mtime = now, > db mtime).
    fs.writeFileSync(filePath, 'fresh external content', 'utf8');

    const result = await scanExternalMasterNoteEdits();

    expect(result.scanned).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.errors).toBe(0);
    expect(runLlmExtraction).toHaveBeenCalledTimes(1);

    const after = masterNoteModel.getById(initial.id)!;
    expect(after.content).toBe('fresh external content');
    expect(after.content_sha256).toBe(sha256('fresh external content'));
    // processMasterNote ran -> last_ingested_sha256 should match new sha.
    expect(after.last_ingested_sha256).toBe(after.content_sha256);
  });

  it('only bumps file_mtime when disk content sha is unchanged', async () => {
    const org = makeOrg();
    const filePath = tmpFile('master-notes.md');
    const content = 'identical content';
    fs.writeFileSync(filePath, content, 'utf8');

    // Seed with the same content but a stale mtime so the scanner re-reads it.
    const initial = masterNoteModel.upsert({
      organization_id: org.id,
      project_id: null,
      content,
      file_path: filePath,
      file_mtime: new Date(Date.now() - 60_000).toISOString(),
    });

    const newDiskMtimeMs = fs.statSync(filePath).mtime.getTime();

    const result = await scanExternalMasterNoteEdits();

    expect(result.scanned).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.errors).toBe(0);
    expect(runLlmExtraction).not.toHaveBeenCalled();

    const after = masterNoteModel.getById(initial.id)!;
    expect(after.content).toBe(content);
    expect(after.file_mtime).not.toBeNull();
    expect(new Date(after.file_mtime!).getTime()).toBe(newDiskMtimeMs);
  });

  it('silently skips rows whose file is missing from disk', async () => {
    const org = makeOrg();
    const missing = path.join(
      os.tmpdir(),
      `mnscan-missing-${Date.now()}`,
      'master-notes.md',
    );

    masterNoteModel.upsert({
      organization_id: org.id,
      project_id: null,
      content: 'whatever',
      file_path: missing,
      file_mtime: new Date(0).toISOString(),
    });

    const beforeAlerts = systemAlertModel.listRecent(100).length;
    const result = await scanExternalMasterNoteEdits();

    expect(result.scanned).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.errors).toBe(0);
    expect(runLlmExtraction).not.toHaveBeenCalled();
    // No alert logged for the missing file — it's an expected user action.
    expect(systemAlertModel.listRecent(100).length).toBe(beforeAlerts);
  });

  it('keeps scanning after a per-row failure and logs an alert', async () => {
    const orgA = makeOrg();
    const orgB = makeOrg();

    // Row A: file_path points at a directory. statSync succeeds (mtime is
    // newer than the seeded epoch mtime so the scanner advances past the
    // mtime check), then readFileSync throws EISDIR — exercises the
    // try/catch around an actual read failure rather than ENOENT.
    const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnscan-bad-'));
    masterNoteModel.upsert({
      organization_id: orgA.id,
      project_id: null,
      content: 'old',
      file_path: badDir,
      file_mtime: new Date(0).toISOString(),
    });

    // Row B: a healthy file with newer mtime + new content -> should still
    // run despite Row A failing.
    const goodPath = tmpFile('master-notes.md');
    const goodInitial = masterNoteModel.upsert({
      organization_id: orgB.id,
      project_id: null,
      content: 'old B',
      file_path: goodPath,
      file_mtime: new Date(Date.now() - 60_000).toISOString(),
    });
    fs.writeFileSync(goodPath, 'new B content', 'utf8');

    const result = await scanExternalMasterNoteEdits();

    expect(result.scanned).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.errors).toBe(1);
    expect(runLlmExtraction).toHaveBeenCalledTimes(1);

    // Row B got processed.
    const after = masterNoteModel.getById(goodInitial.id)!;
    expect(after.content).toBe('new B content');

    // Alert was written for the failing row.
    const alerts = systemAlertModel
      .listRecent(100)
      .filter((a) => a.source === 'masterNoteScan');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0]?.severity).toBe('warn');
  });
});
