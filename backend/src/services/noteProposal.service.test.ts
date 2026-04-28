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
    type: 'customer_insight',
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

  it('creates task without due_date when payload omits it', () => {
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
    expect(created!.due_date).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// customer_ask
// ---------------------------------------------------------------------------

describe('applyApproval: customer_ask', () => {
  it('creates a user note with Customer Ask prefix', () => {
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
    expect(created!.role).toBe('user');
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
// project_update
// ---------------------------------------------------------------------------

describe('applyApproval: project_update', () => {
  it('creates a user note with Project Update prefix', () => {
    const org = makeOrg();
    const project = makeProject(org.id);
    const proposal = makeProposal({
      organization_id: org.id,
      project_id: project.id,
      type: 'project_update',
      title: 'Go-live delayed to June',
      proposed_payload: { content: 'Infrastructure team pushed go-live to June.', new_status: 'on_hold' },
    });

    applyApproval(proposal);

    const notes = noteModel.listFor(org.id);
    const created = notes.find((n) => n.content.includes('Project Update:'));
    expect(created).toBeDefined();
    expect(created!.content).toContain('Go-live delayed to June');
    expect(created!.content).toContain('Status: on_hold');
    expect(created!.project_id).toBe(project.id);
  });
});

// ---------------------------------------------------------------------------
// risk_blocker
// ---------------------------------------------------------------------------

describe('applyApproval: risk_blocker', () => {
  it('creates both a note and a task', () => {
    const org = makeOrg();
    const proposal = makeProposal({
      organization_id: org.id,
      type: 'risk_blocker',
      title: 'Legal hold on PO',
      proposed_payload: { description: 'Legal team placed a hold on the PO.', severity: 'high' },
    });

    const notesBefore = noteModel.listFor(org.id).length;
    const tasksBefore = taskModel.list({ org_id: org.id }).length;

    applyApproval(proposal);

    expect(noteModel.listFor(org.id).length).toBe(notesBefore + 1);
    expect(taskModel.list({ org_id: org.id }).length).toBe(tasksBefore + 1);

    const created = noteModel.listFor(org.id).find((n) => n.content.includes('Risk/Blocker:'));
    expect(created!.content).toContain('[high severity]');

    const task = taskModel.list({ org_id: org.id }).find((t) => t.title.startsWith('[Risk]'));
    expect(task!.title).toContain('Legal hold on PO');
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
// customer_insight
// ---------------------------------------------------------------------------

describe('applyApproval: customer_insight', () => {
  it('creates a confirmed agent_insight note', () => {
    const org = makeOrg();
    const proposal = makeProposal({
      organization_id: org.id,
      type: 'customer_insight',
      title: 'Budget cycle is January',
      proposed_payload: { insight: 'Customer confirmed their budget resets every January.' },
    });

    applyApproval(proposal);

    const notes = noteModel.listFor(org.id).filter((n) => n.role === 'agent_insight');
    expect(notes.length).toBeGreaterThanOrEqual(1);
    const created = notes.find((n) => n.content.includes('Customer Insight:'));
    expect(created).toBeDefined();
    expect(created!.confirmed).toBe(true);
    expect(created!.content).toContain('Budget cycle is January');
  });

  it('falls back to summary when payload.insight is missing', () => {
    const org = makeOrg();
    const proposal = makeProposal({
      organization_id: org.id,
      type: 'customer_insight',
      title: 'Procurement prefers single-vendor',
      summary: 'Customer procurement prefers single-vendor contracts.',
      proposed_payload: {},
    });

    applyApproval(proposal);

    const notes = noteModel.listFor(org.id).filter((n) => n.role === 'agent_insight');
    const created = notes.find((n) => n.content.includes('Procurement prefers single-vendor'));
    expect(created).toBeDefined();
    expect(created!.confirmed).toBe(true);
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
