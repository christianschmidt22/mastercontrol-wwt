/**
 * noteProposal.service.test.ts
 *
 * Tests for applyApproval() — verifies that each proposal type creates the
 * right durable record when a user clicks Approve.
 *
 * Uses the real in-memory SQLite DB (no Anthropic mock needed — applyApproval
 * is synchronous and never calls the Anthropic SDK).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../db/database.js';
import { applyApproval } from './noteProposal.service.js';
import { noteModel } from '../models/note.model.js';
import { taskModel } from '../models/task.model.js';
import { makeOrg, makeNote, makeProject } from '../test/factories.js';
import type { NoteProposal } from '../models/noteProposal.model.js';

// Ensure schema is initialised before tests run.
beforeAll(async () => {
  await import('../db/database.js');
});

function makeProposal(overrides: Partial<NoteProposal> = {}): NoteProposal {
  const org = overrides.organization_id
    ? { id: overrides.organization_id }
    : makeOrg();
  const note = makeNote(org.id);
  return {
    id: 999,
    source_note_id: note.id,
    organization_id: org.id,
    project_id: null,
    contact_id: null,
    type: 'customer_ask',
    title: 'Test proposal',
    summary: 'A test summary.',
    evidence_quote: 'Evidence quote.',
    proposed_payload: {},
    confidence: 0.8,
    status: 'pending',
    discussion: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// task_follow_up
// ---------------------------------------------------------------------------

describe('applyApproval: task_follow_up', () => {
  it('creates an open task linked to the org', () => {
    const org = makeOrg();
    const proposal = makeProposal({
      organization_id: org.id,
      type: 'task_follow_up',
      title: 'Send revised SOW',
      summary: 'AE should send the revised SOW by Thursday.',
      proposed_payload: { description: 'Send revised SOW to procurement.', due_date: '2026-05-01' },
    });

    applyApproval(proposal);

    const tasks = taskModel.list({ org_id: org.id });
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    const created = tasks.find((t) => t.title === 'Send revised SOW');
    expect(created).toBeDefined();
    expect(created!.status).toBe('open');
    expect(created!.due_date).toBe('2026-05-01');
    expect(created!.organization_id).toBe(org.id);
  });

  it('defaults due_date to 1 week out when payload omits it', () => {
    const org = makeOrg();
    const proposal = makeProposal({
      organization_id: org.id,
      type: 'task_follow_up',
      title: 'Follow up on pricing',
      proposed_payload: { description: 'Call back about pricing.' },
    });

    applyApproval(proposal);

    const tasks = taskModel.list({ org_id: org.id });
    const created = tasks.find((t) => t.title === 'Follow up on pricing');
    expect(created).toBeDefined();
    // Should be 7 days from today in YYYY-MM-DD form.
    const expected = new Date();
    expected.setDate(expected.getDate() + 7);
    const yyyy = expected.getFullYear();
    const mm = String(expected.getMonth() + 1).padStart(2, '0');
    const dd = String(expected.getDate()).padStart(2, '0');
    expect(created!.due_date).toBe(`${yyyy}-${mm}-${dd}`);
  });
});

// ---------------------------------------------------------------------------
// customer_ask
// ---------------------------------------------------------------------------

describe('applyApproval: customer_ask', () => {
  it('creates a customer_ask role note with Customer Ask prefix', () => {
    const org = makeOrg();
    const proposal = makeProposal({
      organization_id: org.id,
      type: 'customer_ask',
      title: 'Need a disaster recovery plan',
      proposed_payload: { description: 'Customer wants a DR plan before Q3.', urgency: 'high' },
    });

    applyApproval(proposal);

    const notes = noteModel.listFor(org.id);
    const created = notes.find((n) => n.content.includes('Customer Ask:'));
    expect(created).toBeDefined();
    expect(created!.content).toContain('Need a disaster recovery plan');
    expect(created!.content).toContain('[high urgency]');
    // Saved with the dedicated customer_ask role so feed queries hide it
    // while the search_notes tool can still surface it on demand.
    expect(created!.role).toBe('customer_ask');
    expect(created!.confirmed).toBe(true);
  });

  it('attaches note to project when project_id is set', () => {
    const org = makeOrg();
    const project = makeProject(org.id);
    const proposal = makeProposal({
      organization_id: org.id,
      project_id: project.id,
      type: 'customer_ask',
      title: 'Escalation to CIO',
      proposed_payload: { description: 'Route the escalation to the CIO.' },
    });

    applyApproval(proposal);

    const notes = noteModel.listFor(org.id);
    const created = notes.find((n) => n.content.includes('Escalation to CIO'));
    expect(created).toBeDefined();
    expect(created!.project_id).toBe(project.id);
  });
});

// ---------------------------------------------------------------------------
// oem_mention
// ---------------------------------------------------------------------------

describe('applyApproval: oem_mention', () => {
  it('creates a note on the target OEM org when target_org_id is in payload', () => {
    const customerOrg = makeOrg({ type: 'customer' });
    const oemOrg = makeOrg({ type: 'oem', name: 'Cisco' });
    const proposal = makeProposal({
      organization_id: customerOrg.id,
      type: 'oem_mention',
      title: 'Cisco competitive advantage mentioned',
      proposed_payload: {
        oem_name: 'Cisco',
        context: 'Customer said Cisco ACI is performing well.',
        sentiment: 'positive',
        target_org_id: oemOrg.id,
      },
    });

    applyApproval(proposal);

    const oemNotes = noteModel.listFor(oemOrg.id);
    const created = oemNotes.find((n) => n.content.includes('OEM Mention'));
    expect(created).toBeDefined();
    expect(created!.content).toContain('Cisco competitive advantage mentioned');
    expect(created!.content).toContain('(positive)');
  });

  it('falls back to current org when target_org_id is missing', () => {
    const org = makeOrg();
    const proposal = makeProposal({
      organization_id: org.id,
      type: 'oem_mention',
      title: 'NetApp storage deal',
      proposed_payload: { oem_name: 'NetApp', context: 'Evaluating NetApp for storage.' },
    });

    applyApproval(proposal);

    const notes = noteModel.listFor(org.id);
    const created = notes.find((n) => n.content.includes('OEM Mention'));
    expect(created).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DB-level: no records created for denied proposal (applyApproval not called)
// ---------------------------------------------------------------------------

describe('applyApproval: idempotency guard', () => {
  it('unknown type does not throw', () => {
    const org = makeOrg();
    const proposal = makeProposal({
      organization_id: org.id,
      // Cast to bypass TS so we can verify the default branch is safe.
      type: 'unknown_future_type' as NoteProposal['type'],
    });
    expect(() => applyApproval(proposal)).not.toThrow();
  });
});

// Ensure no DB connections leak between tests.
afterAll(() => {
  db.exec('DELETE FROM note_proposals WHERE 1=1');
});
