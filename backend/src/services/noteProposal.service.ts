/**
 * noteProposal.service.ts
 *
 * Two responsibilities:
 *
 * 1. runLlmExtraction — async, fire-and-forget after note capture.
 *    Calls extractNoteProposals (in claude.service.ts) to replace the initial
 *    triage placeholder with real typed proposals.
 *
 * 2. applyApproval — sync, called from the route when a user approves a
 *    proposal. Creates the durable target record (task, note, or insight).
 *
 * Layer rule: all Anthropic SDK calls stay in claude.service.ts. This service
 * imports `extractNoteProposals` from there rather than calling the SDK directly.
 */

import type { Note } from '../models/note.model.js';
import { noteModel } from '../models/note.model.js';
import { taskModel } from '../models/task.model.js';
import { projectResourceModel } from '../models/projectResource.model.js';
import { organizationModel } from '../models/organization.model.js';
import type { Organization } from '../models/organization.model.js';
import type { Project } from '../models/project.model.js';
import { projectModel } from '../models/project.model.js';
import { contactModel } from '../models/contact.model.js';
import { noteProposalModel, type NoteProposal } from '../models/noteProposal.model.js';
import type { NoteProposalType } from '../models/noteProposal.model.js';
import { extractNoteProposals } from './claude.service.js';
import { HttpError } from '../middleware/errorHandler.js';

/**
 * Default due-date applied to task_follow_up proposals when the LLM didn't
 * pull a specific date out of the note: today + 7 days, ISO YYYY-MM-DD.
 * Local-date math (not UTC) so the date matches the user's calendar.
 */
function defaultDueDateOneWeekOut(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Run real LLM extraction for a captured note.
 *
 * On success (≥ 1 proposal): removes any pending triage proposals for this
 * note and inserts the real typed proposals in their place.
 * On failure or no proposals: leaves the initial triage proposal intact as
 * a fallback so the user can still review the note.
 *
 * Designed to be called as fire-and-forget from noteCapture.service:
 *   void runLlmExtraction(note, org, project).catch(warn)
 */
export async function runLlmExtraction(
  note: Note,
  org: Organization,
  project: Project | null,
): Promise<void> {
  // Provide OEM names so the LLM can identify oem_mention proposals.
  const oemOrgs = organizationModel.listByType('oem');
  const oemNames = oemOrgs.map((o) => o.name);

  // Provide known contacts on this org so the model can resolve names → ids.
  const knownContacts = contactModel.listFor(org.id).map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
  }));

  const raw = await extractNoteProposals({
    noteContent: note.content,
    orgName: org.name,
    orgType: org.type,
    projectName: project?.name ?? null,
    oemNames,
    knownContacts,
  });

  if (raw.length === 0) return;

  // Remove any legacy triage placeholder for this note before inserting real proposals.
  noteProposalModel.deleteBySourceNoteIfPending(note.id);

  for (const p of raw) {
    const resolved = resolveProposalPayload(p, oemOrgs, knownContacts);
    noteProposalModel.create({
      source_note_id: note.id,
      organization_id: org.id,
      project_id: project?.id ?? null,
      contact_id: resolved.contactId,
      type: p.type as NoteProposalType,
      title: p.title,
      summary: p.summary,
      evidence_quote: p.evidence_quote,
      confidence: p.confidence,
      proposed_payload: resolved.payload,
    });
  }
}

/**
 * Re-run extraction on a single existing proposal using user feedback. The
 * proposal is overwritten in place: same row id, new fields, status reset to
 * 'pending'. Returns the revised proposal, or null if the model concluded
 * (based on the feedback) that no proposal should be generated — in which
 * case the proposal is deleted.
 */
export async function reviseNoteProposal(
  proposal: NoteProposal,
  feedback: string,
): Promise<NoteProposal | null> {
  const note = noteModel.get(proposal.source_note_id);
  if (!note) throw new HttpError(404, 'Source note not found');

  const org = organizationModel.get(proposal.organization_id);
  if (!org) throw new HttpError(404, 'Organization not found');

  const project = proposal.project_id ? projectModel.get(proposal.project_id) ?? null : null;

  const oemOrgs = organizationModel.listByType('oem');
  const oemNames = oemOrgs.map((o) => o.name);

  const knownContacts = contactModel.listFor(org.id).map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
  }));

  const raw = await extractNoteProposals({
    noteContent: note.content,
    orgName: org.name,
    orgType: org.type,
    projectName: project?.name ?? null,
    oemNames,
    knownContacts,
    revise: {
      originalProposal: {
        type: proposal.type,
        title: proposal.title,
        summary: proposal.summary,
        payload: proposal.proposed_payload,
      },
      feedback,
    },
  });

  // The user said "this should not be a proposal" → delete it.
  if (raw.length === 0) {
    noteProposalModel.deleteById(proposal.id);
    return null;
  }

  // The revise contract is "produce ONE revised proposal" — take the first.
  const top = raw[0];
  if (!top) return null;
  const resolved = resolveProposalPayload(top, oemOrgs, knownContacts);

  return (
    noteProposalModel.replace(proposal.id, {
      type: top.type as NoteProposalType,
      title: top.title,
      summary: top.summary,
      evidence_quote: top.evidence_quote,
      proposed_payload: resolved.payload,
      confidence: top.confidence,
      contact_id: resolved.contactId,
    }) ?? null
  );
}

/**
 * Resolve OEM names and contact ids against the live data — extraction can
 * include "contact_id" in the payload directly (when the prompt's contact
 * list helped it match), or we infer it from common payload keys like
 * requested_by / name.
 */
function resolveProposalPayload(
  raw: { type: string; payload: Record<string, unknown> },
  oemOrgs: Organization[],
  knownContacts: Array<{ id: number; name: string }>,
): { payload: Record<string, unknown>; contactId: number | null } {
  const payload = { ...raw.payload };

  // OEM mention: resolve oem_name → target_org_id
  if (raw.type === 'oem_mention') {
    const oemName = typeof payload['oem_name'] === 'string' ? payload['oem_name'] : '';
    const targetOrg = oemOrgs.find((o) => o.name.toLowerCase() === oemName.toLowerCase());
    payload['target_org_id'] = targetOrg?.id ?? null;
  }

  // Resolve contact_id. The model may have already filled it; otherwise
  // try to infer it from common name-bearing payload fields.
  let contactId: number | null = null;
  const direct = payload['contact_id'];
  if (typeof direct === 'number' && direct > 0) {
    contactId = knownContacts.some((c) => c.id === direct) ? direct : null;
  } else {
    const candidateNames = ['requested_by', 'name', 'person', 'requester']
      .map((k) => {
        const v = payload[k];
        return typeof v === 'string' ? v.trim() : '';
      })
      .filter(Boolean);
    for (const candidate of candidateNames) {
      const match = knownContacts.find(
        (c) => c.name.toLowerCase() === candidate.toLowerCase(),
      );
      if (match) {
        contactId = match.id;
        break;
      }
    }
  }
  if (contactId !== null) payload['contact_id'] = contactId;

  return { payload, contactId };
}

/**
 * Apply an approved proposal by creating the appropriate durable record.
 *
 * - task_follow_up  → tasks row
 * - customer_ask    → user note with "Customer ask:" prefix
 * - project_update  → user note on the project
 * - risk_blocker    → user note + open task flagged as a risk
 * - oem_mention     → user note on the target OEM org (fallback: current org)
 * - customer_insight → confirmed agent_insight note
 *
 * Throws on unexpected DB errors so the route can return a 500 and keep
 * the proposal in 'pending' rather than marking it approved with no record.
 */
export function applyApproval(proposal: NoteProposal): void {
  const { organization_id, project_id, type, title, summary, proposed_payload: payload } = proposal;

  switch (type) {
    case 'task_follow_up': {
      // Default to one week out when the model didn't pull a date from the
      // note. Stored as YYYY-MM-DD to match the user-entered task format.
      const explicitDate =
        typeof payload['due_date'] === 'string' && payload['due_date'].trim() !== ''
          ? payload['due_date']
          : null;
      const dueDate = explicitDate ?? defaultDueDateOneWeekOut();
      taskModel.create({
        title,
        organization_id,
        project_id: project_id ?? null,
        due_date: dueDate,
      });
      break;
    }

    case 'customer_ask': {
      // Saved as a `customer_ask` role note: queryable internal memory for
      // the agents (search_notes still finds it), but filtered out of every
      // dashboard / Recent Notes feed.
      const description = typeof payload['description'] === 'string' ? payload['description'] : summary;
      const urgency = typeof payload['urgency'] === 'string' ? ` [${payload['urgency']} urgency]` : '';
      const requestedBy = typeof payload['requested_by'] === 'string' ? `\nRequested by: ${payload['requested_by']}` : '';
      noteModel.create({
        organization_id,
        project_id: project_id ?? null,
        content: `## Customer Ask: ${title}${urgency}\n\n${description}${requestedBy}`,
        role: 'customer_ask',
      });
      break;
    }

    case 'oem_mention': {
      const context = typeof payload['context'] === 'string' ? payload['context'] : summary;
      const sentiment = typeof payload['sentiment'] === 'string' ? ` (${payload['sentiment']})` : '';
      // Write to the target OEM org if resolved during extraction, else current org.
      const targetOrgId =
        typeof payload['target_org_id'] === 'number' && payload['target_org_id'] > 0
          ? payload['target_org_id']
          : organization_id;
      noteModel.create({
        organization_id: targetOrgId,
        content: `## OEM Mention${sentiment}: ${title}\n\n${context}`,
        role: 'user',
      });
      break;
    }

    case 'internal_resource': {
      if (!project_id) break; // internal_resource only makes sense on a project
      const name = typeof payload['name'] === 'string' ? payload['name'].trim() : '';
      if (!name) break;
      projectResourceModel.create({
        project_id,
        organization_id,
        name,
        role: typeof payload['role'] === 'string' ? payload['role'] : null,
        team: typeof payload['team'] === 'string' ? payload['team'] : null,
        notes: typeof payload['notes'] === 'string' ? payload['notes'] : null,
      });
      break;
    }

    default:
      break;
  }
}
