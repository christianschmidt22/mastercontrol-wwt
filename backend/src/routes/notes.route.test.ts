import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { db } from '../db/database.js';
import { buildApp } from '../test/app.js';
import { makeOrg, makeNote, makeProject, makeThread } from '../test/factories.js';
import { noteModel } from '../models/note.model.js';
import { noteProposalModel } from '../models/noteProposal.model.js';
import { taskModel } from '../models/task.model.js';
import { settingsModel } from '../models/settings.model.js';

let app: Express;
beforeAll(async () => {
  app = await buildApp();
});

// ---------------------------------------------------------------------------
// POST /api/notes
// ---------------------------------------------------------------------------

describe('POST /api/notes', () => {
  it('creates a user note with role=user and confirmed=true', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/notes')
      .send({ organization_id: org.id, content: 'Had a great call today.' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      organization_id: org.id,
      content: 'Had a great call today.',
      role: 'user',
      confirmed: true,
    });
    expect(res.body.id).toBeTypeOf('number');
  });

  it('allows specifying a different role', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/notes')
      .send({ organization_id: org.id, content: 'Imported note', role: 'imported' });

    expect(res.status).toBe(201);
    expect((res.body as { role: string }).role).toBe('imported');
  });

  it('rejects missing content with 400', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/notes')
      .send({ organization_id: org.id });

    expect(res.status).toBe(400);
  });

  it('rejects empty content with 400', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/notes')
      .send({ organization_id: org.id, content: '' });

    expect(res.status).toBe(400);
  });

  it('rejects missing organization_id with 400', async () => {
    const res = await request(app)
      .post('/api/notes')
      .send({ content: 'No org' });

    expect(res.status).toBe(400);
  });

  it('rejects invalid role with 400', async () => {
    const org = makeOrg();

    const res = await request(app)
      .post('/api/notes')
      .send({ organization_id: org.id, content: 'Bad role', role: 'system_hack' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/notes/capture
// ---------------------------------------------------------------------------

describe('POST /api/notes/capture', () => {
  it('writes a markdown note, indexes it, and queues a proposal', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mastercontrol-notes-'));
    settingsModel.set('mastercontrol_root', root);
    const org = makeOrg({ name: 'Capture Customer' });
    const project = makeProject(org.id, { name: 'Cutover Project' });

    const res = await request(app)
      .post('/api/notes/capture')
      .send({
        organization_id: org.id,
        project_id: project.id,
        content: 'Fairview needs a revised cutover plan by Friday.',
        capture_source: 'test_capture',
      });

    expect(res.status).toBe(201);
    expect(res.body.note).toMatchObject({
      organization_id: org.id,
      project_id: project.id,
      capture_source: 'test_capture',
      content: 'Fairview needs a revised cutover plan by Friday.',
      role: 'user',
      confirmed: true,
    });
    expect(typeof res.body.markdown_path).toBe('string');
    expect(fs.existsSync(res.body.markdown_path as string)).toBe(true);
    expect(fs.readFileSync(res.body.markdown_path as string, 'utf8')).toContain(
      'Fairview needs a revised cutover plan by Friday.',
    );

    const proposals = noteProposalModel.listByStatus('pending', 10);
    expect(proposals.some((proposal) => proposal.source_note_id === res.body.note.id))
      .toBe(true);
  });

  it('rejects a project that belongs to another organization', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mastercontrol-notes-'));
    settingsModel.set('mastercontrol_root', root);
    const org = makeOrg();
    const otherOrg = makeOrg();
    const project = makeProject(otherOrg.id);

    const res = await request(app)
      .post('/api/notes/capture')
      .send({
        organization_id: org.id,
        project_id: project.id,
        content: 'This should not attach cross-org.',
      });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET/POST /api/notes/proposals
// ---------------------------------------------------------------------------

describe('note proposals approval queue', () => {
  it('lists pending proposals and updates their status to discussing', async () => {
    const org = makeOrg();
    const note = makeNote(org.id, { content: 'Customer asked for a budget quote.' });
    const proposal = noteProposalModel.create({
      source_note_id: note.id,
      organization_id: org.id,
      type: 'customer_ask',
      title: 'Review ask',
      summary: 'Customer asked for a budget quote.',
      evidence_quote: 'Customer asked for a budget quote.',
    });

    const listRes = await request(app).get('/api/notes/proposals?status=pending');
    expect(listRes.status).toBe(200);
    expect((listRes.body as Array<{ id: number }>).some((row) => row.id === proposal.id))
      .toBe(true);

    const updateRes = await request(app)
      .post(`/api/notes/proposals/${proposal.id}/status`)
      .send({ status: 'discussing', discussion: 'Needs a task, not an insight.' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body).toMatchObject({
      id: proposal.id,
      status: 'discussing',
      discussion: 'Needs a task, not an insight.',
    });
  });

  it('approve task_follow_up creates a task and marks proposal approved', async () => {
    const org = makeOrg();
    const note = makeNote(org.id, { content: 'Need to send the revised SOW.' });
    const proposal = noteProposalModel.create({
      source_note_id: note.id,
      organization_id: org.id,
      type: 'task_follow_up',
      title: 'Send revised SOW',
      summary: 'AE should send the revised SOW.',
      evidence_quote: 'Need to send the revised SOW.',
      proposed_payload: { description: 'Send revised SOW to procurement.', due_date: '2026-05-15' },
    });

    const tasksBefore = taskModel.list({ org_id: org.id }).length;

    const res = await request(app)
      .post(`/api/notes/proposals/${proposal.id}/status`)
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: proposal.id, status: 'approved' });

    const tasksAfter = taskModel.list({ org_id: org.id });
    expect(tasksAfter.length).toBe(tasksBefore + 1);
    const created = tasksAfter.find((t) => t.title === 'Send revised SOW');
    expect(created).toBeDefined();
    expect(created!.due_date).toBe('2026-05-15');
  });

  it('approve customer_insight creates a confirmed agent_insight note', async () => {
    const org = makeOrg();
    const note = makeNote(org.id, { content: 'Budget resets every January.' });
    const proposal = noteProposalModel.create({
      source_note_id: note.id,
      organization_id: org.id,
      type: 'customer_insight',
      title: 'Budget cycle is January',
      summary: 'Budget resets every January.',
      evidence_quote: 'Budget resets every January.',
      proposed_payload: { insight: 'Customer budget cycle resets in January.' },
    });

    const res = await request(app)
      .post(`/api/notes/proposals/${proposal.id}/status`)
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    const insightNotes = noteModel.listFor(org.id).filter(
      (n) => n.role === 'agent_insight' && n.confirmed,
    );
    expect(insightNotes.some((n) => n.content.includes('Budget cycle is January'))).toBe(true);
  });

  it('returns 404 for a non-existent proposal', async () => {
    const res = await request(app)
      .post('/api/notes/proposals/999999/status')
      .send({ status: 'denied' });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/notes/:id/confirm  (R-002)
// ---------------------------------------------------------------------------

describe('POST /api/notes/:id/confirm', () => {
  it('sets confirmed=1 on an agent_insight note', async () => {
    const org = makeOrg();

    // Create an unconfirmed insight via the model
    const insight = noteModel.createInsight(org.id, 'Agent learned something.', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });

    // Should start as unconfirmed
    expect(insight.confirmed).toBe(false);

    const res = await request(app).post(`/api/notes/${insight.id}/confirm`);
    expect(res.status).toBe(200);

    // Verify in DB
    const row = db
      .prepare<[number], { confirmed: number }>('SELECT confirmed FROM notes WHERE id = ?')
      .get(insight.id);
    expect(row?.confirmed).toBe(1);
  });

  it('returns 404 for unknown note id', async () => {
    const res = await request(app).post('/api/notes/9999999/confirm');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/notes/:id  (hard delete; also serves as "reject" semantic)
// ---------------------------------------------------------------------------

describe('DELETE /api/notes/:id', () => {
  it('hard-deletes a note and returns 204', async () => {
    const org = makeOrg();
    const note = makeNote(org.id, { content: 'Delete me' });

    const res = await request(app).delete(`/api/notes/${note.id}`);
    expect(res.status).toBe(204);

    // Verify row is gone
    const row = db
      .prepare<[number], { id: number }>('SELECT id FROM notes WHERE id = ?')
      .get(note.id);
    expect(row).toBeUndefined();
  });

  it('serves as reject: deletes an agent_insight note', async () => {
    const org = makeOrg();
    const insight = noteModel.createInsight(org.id, 'Reject this insight.', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });

    const res = await request(app).delete(`/api/notes/${insight.id}`);
    expect(res.status).toBe(204);

    const row = db
      .prepare<[number], { id: number }>('SELECT id FROM notes WHERE id = ?')
      .get(insight.id);
    expect(row).toBeUndefined();
  });

  it('returns 404 for unknown note id', async () => {
    const res = await request(app).delete('/api/notes/9999999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/notes/unconfirmed — cross-org aggregator (Gap #2)
// ---------------------------------------------------------------------------

describe('GET /api/notes/unconfirmed', () => {
  it('returns unconfirmed agent_insight notes across all orgs', async () => {
    const org1 = makeOrg();
    const org2 = makeOrg();

    noteModel.createInsight(org1.id, 'Insight from org1', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org1.id,
    });
    noteModel.createInsight(org2.id, 'Insight from org2', {
      tool: 'record_insight',
      source_thread_id: 2,
      source_org_id: org2.id,
    });

    const res = await request(app).get('/api/notes/unconfirmed');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const contents = (res.body as Array<{ content: string }>).map((n) => n.content);
    expect(contents).toContain('Insight from org1');
    expect(contents).toContain('Insight from org2');
  });

  it('includes org_name and org_type on each row', async () => {
    const org = makeOrg({ name: 'Acme Corp', type: 'customer' });

    noteModel.createInsight(org.id, 'Typed insight', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });

    const res = await request(app).get('/api/notes/unconfirmed');
    expect(res.status).toBe(200);

    const row = (res.body as Array<{ org_name: string; org_type: string; content: string }>).find(
      (n) => n.content === 'Typed insight',
    );
    expect(row).toBeDefined();
    expect(row!.org_name).toBe('Acme Corp');
    expect(row!.org_type).toBe('customer');
  });

  it('excludes confirmed insights', async () => {
    const org = makeOrg();

    const insight = noteModel.createInsight(org.id, 'Already confirmed', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });
    noteModel.confirm(insight.id);

    const res = await request(app).get('/api/notes/unconfirmed');
    expect(res.status).toBe(200);

    const contents = (res.body as Array<{ content: string }>).map((n) => n.content);
    expect(contents).not.toContain('Already confirmed');
  });

  it('excludes non-insight notes', async () => {
    const org = makeOrg();
    makeNote(org.id, { content: 'Just a user note', role: 'user' });

    const res = await request(app).get('/api/notes/unconfirmed');
    expect(res.status).toBe(200);

    const contents = (res.body as Array<{ content: string }>).map((n) => n.content);
    expect(contents).not.toContain('Just a user note');
  });

  it('returns empty array when no unconfirmed insights exist', async () => {
    const res = await request(app).get('/api/notes/unconfirmed');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('respects ?limit= parameter', async () => {
    const org = makeOrg();
    for (let i = 0; i < 5; i++) {
      noteModel.createInsight(org.id, `Bulk insight ${i}`, {
        tool: 'record_insight',
        source_thread_id: 1,
        source_org_id: org.id,
      });
    }

    const res = await request(app).get('/api/notes/unconfirmed?limit=3');
    expect(res.status).toBe(200);
    expect((res.body as unknown[]).length).toBeLessThanOrEqual(3);
  });

  it('rejects limit > 200 with 400', async () => {
    const res = await request(app).get('/api/notes/unconfirmed?limit=201');
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/notes/cross-org-insights?org_id=X — cross-org panel
// ---------------------------------------------------------------------------

describe('GET /api/notes/cross-org-insights', () => {
  it('returns insights authored FROM another org that target this org', async () => {
    const sourceOrg = makeOrg({ type: 'oem', name: 'Cisco Source' });
    const targetOrg = makeOrg({ type: 'customer', name: 'Target Customer' });

    // Insight recorded FOR targetOrg but originated from sourceOrg's thread
    const thread = makeThread(sourceOrg.id);
    const insight = noteModel.createInsight(targetOrg.id, 'Cisco mentioned you in a thread', {
      tool: 'record_insight',
      source_thread_id: thread.id,
      source_org_id: sourceOrg.id,
    });
    // Manually set thread_id to link insight to sourceOrg's thread
    db.prepare('UPDATE notes SET thread_id = ? WHERE id = ?').run(thread.id, insight.id);

    const res = await request(app).get(
      `/api/notes/cross-org-insights?org_id=${targetOrg.id}`,
    );
    expect(res.status).toBe(200);
    const contents = (res.body as Array<{ content: string }>).map((n) => n.content);
    expect(contents).toContain('Cisco mentioned you in a thread');
  });

  it('includes org_name and org_type of the SOURCE org', async () => {
    const sourceOrg = makeOrg({ type: 'oem', name: 'NetApp OEM' });
    const targetOrg = makeOrg({ type: 'customer', name: 'Cross Org Target' });

    const thread = makeThread(sourceOrg.id);
    const insight = noteModel.createInsight(targetOrg.id, 'NetApp cross insight', {
      tool: 'record_insight',
      source_thread_id: thread.id,
      source_org_id: sourceOrg.id,
    });
    db.prepare('UPDATE notes SET thread_id = ? WHERE id = ?').run(thread.id, insight.id);

    const res = await request(app).get(
      `/api/notes/cross-org-insights?org_id=${targetOrg.id}`,
    );
    expect(res.status).toBe(200);
    const row = (res.body as Array<{ org_name: string; org_type: string; content: string }>).find(
      (n) => n.content === 'NetApp cross insight',
    );
    expect(row).toBeDefined();
    expect(row!.org_name).toBe('NetApp OEM');
    expect(row!.org_type).toBe('oem');
  });

  it('does NOT return self-authored insights (same org as thread)', async () => {
    const org = makeOrg({ type: 'customer', name: 'Self-authored Org' });

    // insight targeted at the same org whose thread produced it
    const thread = makeThread(org.id);
    const insight = noteModel.createInsight(org.id, 'Self insight', {
      tool: 'record_insight',
      source_thread_id: thread.id,
      source_org_id: org.id,
    });
    db.prepare('UPDATE notes SET thread_id = ? WHERE id = ?').run(thread.id, insight.id);

    const res = await request(app).get(
      `/api/notes/cross-org-insights?org_id=${org.id}`,
    );
    expect(res.status).toBe(200);
    const contents = (res.body as Array<{ content: string }>).map((n) => n.content);
    expect(contents).not.toContain('Self insight');
  });

  it('returns empty array when no cross-org insights exist', async () => {
    const org = makeOrg({ type: 'customer', name: 'No Cross Insights Org' });
    const res = await request(app).get(
      `/api/notes/cross-org-insights?org_id=${org.id}`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('requires org_id — rejects missing with 400', async () => {
    const res = await request(app).get('/api/notes/cross-org-insights');
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/notes/recent
// ---------------------------------------------------------------------------

describe('GET /api/notes/recent', () => {
  it('returns user notes joined with org_name', async () => {
    const org = makeOrg({ name: 'Recent Org Alpha', type: 'customer' });
    makeNote(org.id, { content: 'Alpha recent note', role: 'user' });

    const res = await request(app).get('/api/notes/recent');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const row = (res.body as Array<{ content: string; org_name: string; org_type: string }>)
      .find((n) => n.content === 'Alpha recent note');
    expect(row).toBeDefined();
    expect(row!.org_name).toBe('Recent Org Alpha');
    expect(row!.org_type).toBe('customer');
  });

  it('does NOT include agent_insight notes', async () => {
    const org = makeOrg();
    noteModel.createInsight(org.id, 'Insight must not appear in recent', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });

    const res = await request(app).get('/api/notes/recent');
    expect(res.status).toBe(200);

    const contents = (res.body as Array<{ content: string }>).map((n) => n.content);
    expect(contents).not.toContain('Insight must not appear in recent');
  });

  it('respects ?limit= parameter', async () => {
    const org = makeOrg();
    for (let i = 0; i < 5; i++) {
      makeNote(org.id, { content: `Limit test note ${i}` });
    }

    const res = await request(app).get('/api/notes/recent?limit=2');
    expect(res.status).toBe(200);
    expect((res.body as unknown[]).length).toBeLessThanOrEqual(2);
  });

  it('rejects limit > 50 with 400', async () => {
    const res = await request(app).get('/api/notes/recent?limit=51');
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Notes feed inclusion/exclusion via GET /api/organizations/:id/notes
// ---------------------------------------------------------------------------

describe('notes — unconfirmed filtering via org notes endpoint', () => {
  it('confirmed user note is always visible', async () => {
    const org = makeOrg();
    makeNote(org.id, { content: 'Always visible', role: 'user' });

    const res = await request(app).get(
      `/api/organizations/${org.id}/notes?include_unconfirmed=false`,
    );
    expect(res.status).toBe(200);
    const contents = (res.body as Array<{ content: string }>).map((n) => n.content);
    expect(contents).toContain('Always visible');
  });

  it('unconfirmed insight is excluded when include_unconfirmed=false', async () => {
    const org = makeOrg();
    noteModel.createInsight(org.id, 'Hidden insight', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });

    const res = await request(app).get(
      `/api/organizations/${org.id}/notes?include_unconfirmed=false`,
    );
    expect(res.status).toBe(200);
    const contents = (res.body as Array<{ content: string }>).map((n) => n.content);
    expect(contents).not.toContain('Hidden insight');
  });

  it('confirmed insight is visible even with include_unconfirmed=false', async () => {
    const org = makeOrg();
    const insight = noteModel.createInsight(org.id, 'Confirmed insight content', {
      tool: 'record_insight',
      source_thread_id: 1,
      source_org_id: org.id,
    });
    noteModel.confirm(insight.id);

    const res = await request(app).get(
      `/api/organizations/${org.id}/notes?include_unconfirmed=false`,
    );
    expect(res.status).toBe(200);
    const contents = (res.body as Array<{ content: string }>).map((n) => n.content);
    expect(contents).toContain('Confirmed insight content');
  });
});
