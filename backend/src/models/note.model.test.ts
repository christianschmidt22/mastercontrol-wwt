/**
 * note.model.test.ts
 *
 * Tests for createInsight, confirm, and listRecent (confirmedOnly filtering).
 */

import { describe, it, expect } from 'vitest';
import { noteModel } from './note.model.js';
import { makeOrg, makeNote } from '../test/factories.js';
import type { NoteProvenance } from './note.model.js';

// ---------------------------------------------------------------------------
// createInsight
// ---------------------------------------------------------------------------

describe('noteModel.createInsight', () => {
  it('creates a note with role=agent_insight and confirmed=false', () => {
    const org = makeOrg({ type: 'customer', name: 'Insight Target' });

    const provenance: NoteProvenance = {
      tool: 'record_insight',
      source_thread_id: 7,
      source_org_id: org.id,
    };

    const note = noteModel.createInsight(org.id, 'Something interesting happened.', provenance);

    expect(note.role).toBe('agent_insight');
    expect(note.confirmed).toBe(false);
    expect(note.organization_id).toBe(org.id);
    expect(note.content).toBe('Something interesting happened.');
  });

  it('persists provenance JSON round-trip correctly', () => {
    const org = makeOrg({ type: 'customer', name: 'Provenance Org' });

    const provenance: NoteProvenance = {
      tool: 'record_insight',
      source_thread_id: 42,
      source_org_id: org.id,
      web_citations: ['https://example.com/a', 'https://example.com/b'],
    };

    const note = noteModel.createInsight(org.id, 'Insight with citations', provenance);

    expect(note.provenance).not.toBeNull();
    expect(note.provenance!.tool).toBe('record_insight');
    expect(note.provenance!.source_thread_id).toBe(42);
    expect(note.provenance!.source_org_id).toBe(org.id);
    expect(note.provenance!.web_citations).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ]);
  });

  it('sets confirmed=false (not confirmed=true like user notes)', () => {
    const org = makeOrg({ type: 'customer', name: 'Unconfirmed Org' });
    const note = noteModel.createInsight(org.id, 'Unconfirmed text', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });
    expect(note.confirmed).toBe(false);
  });

  it('user notes created via create() have confirmed=true by default', () => {
    const org = makeOrg({ type: 'customer', name: 'User Note Org' });
    const note = makeNote(org.id, { content: 'Regular user note', role: 'user' });
    expect(note.confirmed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// confirm
// ---------------------------------------------------------------------------

describe('noteModel.confirm', () => {
  it('flips confirmed from false to true', () => {
    const org = makeOrg({ type: 'customer', name: 'Confirm Org' });

    const insight = noteModel.createInsight(org.id, 'Needs confirmation', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });

    expect(insight.confirmed).toBe(false);

    const changed = noteModel.confirm(insight.id);
    expect(changed).toBe(true);

    const fetched = noteModel.get(insight.id);
    expect(fetched!.confirmed).toBe(true);
  });

  it('returns false when note id does not exist', () => {
    const changed = noteModel.confirm(9999999);
    expect(changed).toBe(false);
  });

  it('is idempotent — confirming an already-confirmed note returns true', () => {
    const org = makeOrg({ type: 'customer', name: 'Idempotent Org' });
    const insight = noteModel.createInsight(org.id, 'Already confirmed', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });

    noteModel.confirm(insight.id);
    const second = noteModel.confirm(insight.id);
    // SQLite UPDATE on confirmed=1 still changes 1 row — changes=1
    expect(second).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// listRecent — confirmedOnly filter
// ---------------------------------------------------------------------------

describe('noteModel.listRecent — confirmedOnly', () => {
  it('includes unconfirmed insights when confirmedOnly=false (default)', () => {
    const org = makeOrg({ type: 'customer', name: 'List Org Default' });

    makeNote(org.id, { content: 'confirmed user note', role: 'user' }); // confirmed=true
    noteModel.createInsight(org.id, 'unconfirmed insight', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    }); // confirmed=false

    const notes = noteModel.listRecent(org.id, 10, { confirmedOnly: false });
    const contents = notes.map((n) => n.content);
    expect(contents).toContain('confirmed user note');
    expect(contents).toContain('unconfirmed insight');
  });

  it('excludes unconfirmed insights when confirmedOnly=true', () => {
    const org = makeOrg({ type: 'customer', name: 'List Org Confirmed' });

    makeNote(org.id, { content: 'confirmed note', role: 'user' });
    noteModel.createInsight(org.id, 'unconfirmed insight text', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });

    const notes = noteModel.listRecent(org.id, 10, { confirmedOnly: true });
    const contents = notes.map((n) => n.content);
    expect(contents).toContain('confirmed note');
    expect(contents).not.toContain('unconfirmed insight text');
  });

  it('includes a confirmed insight when confirmedOnly=true', () => {
    const org = makeOrg({ type: 'customer', name: 'Confirmed Insight Org' });

    const insight = noteModel.createInsight(org.id, 'confirmed insight text', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });
    noteModel.confirm(insight.id);

    const notes = noteModel.listRecent(org.id, 10, { confirmedOnly: true });
    const contents = notes.map((n) => n.content);
    expect(contents).toContain('confirmed insight text');
  });

  it('respects the limit parameter', () => {
    const org = makeOrg({ type: 'customer', name: 'Limit Org' });

    for (let i = 0; i < 5; i++) {
      makeNote(org.id, { content: `note ${i}` });
    }

    const notes = noteModel.listRecent(org.id, 3);
    expect(notes.length).toBeLessThanOrEqual(3);
  });

  it('default (no opts) includes unconfirmed notes', () => {
    const org = makeOrg({ type: 'customer', name: 'Default Opts Org' });

    noteModel.createInsight(org.id, 'default opts insight', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });

    const notes = noteModel.listRecent(org.id, 10);
    expect(notes.some((n) => n.content === 'default opts insight')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// reject
// ---------------------------------------------------------------------------

describe('noteModel.reject', () => {
  it('hard-deletes the note row', () => {
    const org = makeOrg({ type: 'customer', name: 'Reject Org' });
    const insight = noteModel.createInsight(org.id, 'To be rejected', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });

    const removed = noteModel.reject(insight.id);
    expect(removed).toBe(true);

    const fetched = noteModel.get(insight.id);
    expect(fetched).toBeUndefined();
  });

  it('returns false when note id does not exist', () => {
    expect(noteModel.reject(9999999)).toBe(false);
  });
});
