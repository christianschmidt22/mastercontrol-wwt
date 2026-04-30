/**
 * outlookMessage.model.test.ts
 *
 * Tests for outlookMessageModel against the in-memory SQLite DB provisioned
 * by the vitest setup file (backend/src/test/setup.ts).
 *
 * Pattern: same as note.model.test.ts — the setup file runs runMigrations()
 * so the schema (including 026_outlook_messages.sql) is in place before any
 * model code runs its db.prepare() calls.
 */

import { describe, it, expect } from 'vitest';
import { outlookMessageModel } from '../models/outlookMessage.model.js';
import { makeOrg } from '../test/factories.js';

// ---------------------------------------------------------------------------
// upsert
// ---------------------------------------------------------------------------

describe('outlookMessageModel.upsert', () => {
  it('inserts a new message and returns it with defaults', () => {
    const msg = outlookMessageModel.upsert({
      internet_message_id: '<test-001@example.com>',
      subject: 'Hello World',
      from_email: 'alice@example.com',
      from_name: 'Alice',
      to_emails: ['bob@example.com'],
      cc_emails: [],
      sent_at: '2026-04-01T10:00:00Z',
      has_attachments: false,
      body_preview: 'This is a preview.',
    });

    expect(msg.id).toBeTypeOf('number');
    expect(msg.internet_message_id).toBe('<test-001@example.com>');
    expect(msg.subject).toBe('Hello World');
    expect(msg.from_email).toBe('alice@example.com');
    expect(msg.from_name).toBe('Alice');
    expect(msg.to_emails).toEqual(['bob@example.com']);
    expect(msg.cc_emails).toEqual([]);
    expect(msg.has_attachments).toBe(false);
    expect(msg.body_preview).toBe('This is a preview.');
    expect(msg.synced_at).toBeTruthy();
  });

  it('updates an existing message on conflict (internet_message_id)', () => {
    outlookMessageModel.upsert({
      internet_message_id: '<test-002@example.com>',
      subject: 'Original subject',
      body_preview: 'Original preview',
    });

    const updated = outlookMessageModel.upsert({
      internet_message_id: '<test-002@example.com>',
      subject: 'Updated subject',
      body_preview: 'Updated preview',
    });

    expect(updated.subject).toBe('Updated subject');
    expect(updated.body_preview).toBe('Updated preview');
  });

  it('stores to_emails and cc_emails as JSON arrays', () => {
    const msg = outlookMessageModel.upsert({
      internet_message_id: '<test-003@example.com>',
      to_emails: ['a@x.com', 'b@x.com'],
      cc_emails: ['c@x.com'],
    });

    expect(msg.to_emails).toEqual(['a@x.com', 'b@x.com']);
    expect(msg.cc_emails).toEqual(['c@x.com']);
  });

  it('handles missing arrays gracefully (defaults to empty)', () => {
    const msg = outlookMessageModel.upsert({
      internet_message_id: '<test-004@example.com>',
    });

    expect(msg.to_emails).toEqual([]);
    expect(msg.cc_emails).toEqual([]);
  });

  it('stores has_attachments correctly', () => {
    const withAttachment = outlookMessageModel.upsert({
      internet_message_id: '<test-005@example.com>',
      has_attachments: true,
    });
    expect(withAttachment.has_attachments).toBe(true);

    const withoutAttachment = outlookMessageModel.upsert({
      internet_message_id: '<test-006@example.com>',
      has_attachments: false,
    });
    expect(withoutAttachment.has_attachments).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// upsertOrgLink + findByOrg
// ---------------------------------------------------------------------------

describe('outlookMessageModel.upsertOrgLink + findByOrg', () => {
  it('links a message to an org and findByOrg returns it', () => {
    const org = makeOrg({ name: 'Link Test Org' });

    const msg = outlookMessageModel.upsert({
      internet_message_id: '<link-test-001@example.com>',
      subject: 'Deal discussion',
      sent_at: '2026-04-02T09:00:00Z',
    });

    outlookMessageModel.upsertOrgLink(msg.id, org.id, 0.8);

    const found = outlookMessageModel.findByOrg(org.id, 10);
    expect(found.length).toBe(1);
    expect(found[0].internet_message_id).toBe('<link-test-001@example.com>');
  });

  it('returns an empty array for an org with no linked messages', () => {
    const org = makeOrg({ name: 'Empty Org' });
    const found = outlookMessageModel.findByOrg(org.id, 10);
    expect(found).toEqual([]);
  });

  it('limits results to the specified count', () => {
    const org = makeOrg({ name: 'Limit Org' });

    for (let i = 1; i <= 5; i++) {
      const msg = outlookMessageModel.upsert({
        internet_message_id: `<limit-test-00${i}@example.com>`,
        sent_at: `2026-04-0${i}T10:00:00Z`,
      });
      outlookMessageModel.upsertOrgLink(msg.id, org.id, 0.9);
    }

    const found = outlookMessageModel.findByOrg(org.id, 3);
    expect(found.length).toBe(3);
  });

  it('updates confidence on upsertOrgLink conflict', () => {
    const org = makeOrg({ name: 'Confidence Org' });

    const msg = outlookMessageModel.upsert({
      internet_message_id: '<confidence-test@example.com>',
    });

    // Insert with low confidence, then update with higher.
    outlookMessageModel.upsertOrgLink(msg.id, org.id, 0.6);
    outlookMessageModel.upsertOrgLink(msg.id, org.id, 0.95);

    // The linked message should still be found exactly once.
    const found = outlookMessageModel.findByOrg(org.id, 10);
    expect(found.length).toBe(1);
    expect(found[0].id).toBe(msg.id);
  });

  it('does not return messages from other orgs', () => {
    const orgA = makeOrg({ name: 'Org A' });
    const orgB = makeOrg({ name: 'Org B' });

    const msg = outlookMessageModel.upsert({
      internet_message_id: '<cross-org-test@example.com>',
    });
    outlookMessageModel.upsertOrgLink(msg.id, orgA.id, 0.8);

    const foundB = outlookMessageModel.findByOrg(orgB.id, 10);
    expect(foundB.length).toBe(0);

    const foundA = outlookMessageModel.findByOrg(orgA.id, 10);
    expect(foundA.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getRecentByOrg (alias for findByOrg)
// ---------------------------------------------------------------------------

describe('outlookMessageModel.getRecentByOrg', () => {
  it('returns the same results as findByOrg', () => {
    const org = makeOrg({ name: 'Recent Org' });

    const msg = outlookMessageModel.upsert({
      internet_message_id: '<recent-test@example.com>',
    });
    outlookMessageModel.upsertOrgLink(msg.id, org.id, 0.7);

    const recent = outlookMessageModel.getRecentByOrg(org.id, 5);
    const direct = outlookMessageModel.findByOrg(org.id, 5);

    expect(recent).toEqual(direct);
  });
});
