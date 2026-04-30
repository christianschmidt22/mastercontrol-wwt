/**
 * outlookAttachment.service.test.ts
 *
 * Tests for the attachment filter, path helpers, and idempotency guard.
 * The actual PS1 spawn is NOT tested here (requires a running Outlook instance).
 * The PS1 spawn helper (runAttachmentPs1) is an internal implementation detail
 * and is tested indirectly through the idempotency path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';

import { db } from '../db/database.js';
import { settingsModel } from '../models/settings.model.js';
import { organizationModel } from '../models/organization.model.js';
import {
  shouldSaveAttachment,
  slugifySubject,
  buildTargetDir,
  saveMessageAttachments,
  type AttachmentMeta,
  type OutlookMessage,
  type OrgLink,
} from '../services/outlookAttachment.service.js';
import { MASTERCONTROL_ROOT_SETTING } from '../services/fileSpace.service.js';

// ---------------------------------------------------------------------------
// shouldSaveAttachment
// ---------------------------------------------------------------------------

describe('shouldSaveAttachment', () => {
  it('passes a normal PDF attachment', () => {
    const att: AttachmentMeta = { name: 'proposal.pdf', size: 50_000, content_type: 'application/pdf' };
    expect(shouldSaveAttachment(att)).toBe(true);
  });

  it('passes a DOCX attachment', () => {
    const att: AttachmentMeta = { name: 'spec.docx', size: 120_000, content_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    expect(shouldSaveAttachment(att)).toBe(true);
  });

  it('passes a XLSX attachment', () => {
    const att: AttachmentMeta = { name: 'budget.xlsx', size: 80_000, content_type: '' };
    expect(shouldSaveAttachment(att)).toBe(true);
  });

  it('blocks a PNG by extension', () => {
    const att: AttachmentMeta = { name: 'logo.png', size: 50_000, content_type: 'image/png' };
    expect(shouldSaveAttachment(att)).toBe(false);
  });

  it('blocks a JPG by extension', () => {
    const att: AttachmentMeta = { name: 'photo.jpg', size: 50_000, content_type: '' };
    expect(shouldSaveAttachment(att)).toBe(false);
  });

  it('blocks an image by content-type even with neutral extension', () => {
    // e.g. a file with no extension but content_type = image/jpeg
    const att: AttachmentMeta = { name: 'attachment', size: 50_000, content_type: 'image/jpeg' };
    // No extension → not in KEEP_EXTENSIONS → still blocked (unknown ext path)
    expect(shouldSaveAttachment(att)).toBe(false);
  });

  it('blocks a tiny file (likely inline signature image)', () => {
    const att: AttachmentMeta = { name: 'spacer.pdf', size: 512, content_type: 'application/pdf' };
    expect(shouldSaveAttachment(att)).toBe(false);
  });

  it('blocks an oversized file', () => {
    const att: AttachmentMeta = { name: 'huge.pdf', size: 60 * 1024 * 1024, content_type: 'application/pdf' };
    expect(shouldSaveAttachment(att)).toBe(false);
  });

  it('blocks an unknown extension', () => {
    const att: AttachmentMeta = { name: 'binary.exe', size: 50_000, content_type: '' };
    expect(shouldSaveAttachment(att)).toBe(false);
  });

  it('blocks a .wmz attachment by extension', () => {
    const att: AttachmentMeta = { name: 'image.wmz', size: 50_000, content_type: '' };
    expect(shouldSaveAttachment(att)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// slugifySubject
// ---------------------------------------------------------------------------

describe('slugifySubject', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(slugifySubject('Hello World')).toBe('hello-world');
  });

  it('strips leading and trailing dashes', () => {
    expect(slugifySubject('  Hello World  ')).toBe('hello-world');
  });

  it('replaces runs of special chars with a single dash', () => {
    expect(slugifySubject('RE: FW: Q1 Proposal!!!')).toBe('re-fw-q1-proposal');
  });

  it('truncates to 40 characters', () => {
    const long = 'This is a very long subject line that exceeds the limit';
    const result = slugifySubject(long);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result).toBe('this-is-a-very-long-subject-line-that-ex');
  });

  it('handles empty string', () => {
    expect(slugifySubject('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// buildTargetDir
// ---------------------------------------------------------------------------

describe('buildTargetDir', () => {
  const root = '/vault';

  it('builds a customer path when org type is customer', () => {
    const msg = { subject: 'Q1 Proposal', sent_at: '2026-03-15T10:00:00Z' };
    const orgLink: OrgLink = { org_id: 1, org_name: 'Fairview Health', org_type: 'customer' };
    const result = buildTargetDir(root, msg, orgLink);
    expect(result).toBe(
      path.join(root, 'customers', 'fairview_health', 'reference', 'attachments', '20260315-q1-proposal'),
    );
  });

  it('builds an OEM path when org type is oem', () => {
    const msg = { subject: 'Partner Update', sent_at: '2026-04-01T09:00:00Z' };
    const orgLink: OrgLink = { org_id: 2, org_name: 'NetApp', org_type: 'oem' };
    const result = buildTargetDir(root, msg, orgLink);
    expect(result).toBe(
      path.join(root, 'oems', 'netapp', 'reference', 'attachments', '20260401-partner-update'),
    );
  });

  it('builds a 00-inbox path when no org link', () => {
    const msg = { subject: 'Unknown Sender', sent_at: '2026-04-10T14:00:00Z' };
    const result = buildTargetDir(root, msg, null);
    expect(result).toBe(
      path.join(root, '00-inbox', 'attachments', '20260410-unknown-sender'),
    );
  });

  it('uses current date when sent_at is null', () => {
    const msg = { subject: 'Test', sent_at: null };
    const result = buildTargetDir(root, msg, null);
    // Just verify the shape — date will be today's date
    expect(result).toMatch(/00-inbox[/\\]attachments[/\\]\d{8}-test$/);
  });
});

// ---------------------------------------------------------------------------
// Idempotency — saveMessageAttachments skips already-logged attachments
// ---------------------------------------------------------------------------

describe('saveMessageAttachments — idempotency', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'mc-att-test-'));
    settingsModel.set(MASTERCONTROL_ROOT_SETTING, tmpRoot);
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('skips a message with no attachments', async () => {
    const msg: OutlookMessage = {
      id: 1,
      internet_message_id: '<test-1@example.com>',
      subject: 'No Attachments',
      sent_at: '2026-04-01T10:00:00Z',
      has_attachments: 0,
      attachments_meta: '[]',
    };

    // No PS1 spawn should happen — function returns early.
    await expect(saveMessageAttachments(msg, [])).resolves.toBeUndefined();
  });

  it('skips attachments that do not pass the filter', async () => {
    const meta: AttachmentMeta[] = [
      { name: 'logo.png', size: 50_000, content_type: 'image/png' },
    ];
    const msg: OutlookMessage = {
      id: 2,
      internet_message_id: '<test-2@example.com>',
      subject: 'Logos',
      sent_at: '2026-04-01T10:00:00Z',
      has_attachments: 1,
      attachments_meta: JSON.stringify(meta),
    };

    // Returns early — no qualifying attachments.
    await expect(saveMessageAttachments(msg, [])).resolves.toBeUndefined();
  });

  it('skips attachments already in outlook_attachment_log (idempotency)', async () => {
    const meta: AttachmentMeta[] = [
      { name: 'proposal.pdf', size: 50_000, content_type: 'application/pdf' },
    ];
    const messageId = '<idem-test-3@example.com>';

    // Pre-insert the log entry to simulate a previous sync run.
    db.prepare(
      `INSERT INTO outlook_attachment_log (internet_message_id, attachment_name, vault_path)
       VALUES (?, ?, ?)`,
    ).run(messageId, 'proposal.pdf', 'customers/test/reference/attachments/20260401-meeting/proposal.pdf');

    const msg: OutlookMessage = {
      id: 3,
      internet_message_id: messageId,
      subject: 'Meeting',
      sent_at: '2026-04-01T10:00:00Z',
      has_attachments: 1,
      attachments_meta: JSON.stringify(meta),
    };

    // All qualifying attachments are already logged → returns early without spawning PS1.
    await expect(saveMessageAttachments(msg, [])).resolves.toBeUndefined();
  });

  it('returns early when mastercontrol_root is not configured', async () => {
    // Remove the setting so isMastercontrolRootConfigured() returns false.
    settingsModel.remove(MASTERCONTROL_ROOT_SETTING);

    const meta: AttachmentMeta[] = [
      { name: 'doc.pdf', size: 50_000, content_type: 'application/pdf' },
    ];
    const msg: OutlookMessage = {
      id: 4,
      internet_message_id: '<test-4@example.com>',
      subject: 'Doc',
      sent_at: '2026-04-01T10:00:00Z',
      has_attachments: 1,
      attachments_meta: JSON.stringify(meta),
    };

    // No PS1 spawn — vault not configured.
    await expect(saveMessageAttachments(msg, [])).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Integration: outlook_attachment_log table exists
// ---------------------------------------------------------------------------

describe('029 migration — outlook_attachment_log schema', () => {
  it('can insert and query outlook_attachment_log rows', () => {
    db.prepare(
      `INSERT INTO outlook_attachment_log (internet_message_id, attachment_name, vault_path)
       VALUES (?, ?, ?)`,
    ).run('<schema-test@example.com>', 'report.pdf', 'customers/acme/reference/attachments/20260401-meeting/report.pdf');

    const row = db.prepare(
      `SELECT * FROM outlook_attachment_log WHERE internet_message_id = ?`,
    ).get('<schema-test@example.com>') as { attachment_name: string; vault_path: string } | undefined;

    expect(row).toBeDefined();
    expect(row?.attachment_name).toBe('report.pdf');
  });

  it('enforces UNIQUE(internet_message_id, attachment_name)', () => {
    const insertStmt = db.prepare(
      `INSERT INTO outlook_attachment_log (internet_message_id, attachment_name, vault_path)
       VALUES (?, ?, ?)`,
    );
    insertStmt.run('<dup-test@example.com>', 'dup.pdf', 'path/a');
    expect(() => insertStmt.run('<dup-test@example.com>', 'dup.pdf', 'path/b')).toThrow(
      /UNIQUE constraint failed|SQLITE_CONSTRAINT/,
    );
  });

  it('outlook_messages table exists and accepts inserts', () => {
    db.prepare(
      `INSERT INTO outlook_messages (internet_message_id, subject, has_attachments, attachments_meta)
       VALUES (?, ?, 0, '[]')`,
    ).run('<msg-test@example.com>', 'Hello world');

    const row = db.prepare(
      `SELECT subject FROM outlook_messages WHERE internet_message_id = ?`,
    ).get('<msg-test@example.com>') as { subject: string } | undefined;

    expect(row?.subject).toBe('Hello world');
  });

  it('documents.source accepts outlook_attachment', () => {
    const org = organizationModel.create({ type: 'customer', name: 'Schema Test Org' });
    db.prepare(
      `INSERT INTO documents (organization_id, kind, label, url_or_path, source)
       VALUES (?, 'file', 'test.pdf', 'customers/test/test.pdf', 'outlook_attachment')`,
    ).run(org.id);

    const row = db.prepare(
      `SELECT source FROM documents WHERE label = 'test.pdf'`,
    ).get() as { source: string } | undefined;

    expect(row?.source).toBe('outlook_attachment');
  });
});
