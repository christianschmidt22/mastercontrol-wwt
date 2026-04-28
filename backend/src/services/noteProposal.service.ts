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
import { noteProposalModel, type NoteProposal } from '../models/noteProposal.model.js';
import type { NoteProposalType } from '../models/noteProposal.model.js';
import { extractNoteProposals } from './claude.service.js';

function compact(value: string, max = 220): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

function initialProposalType(
  org: Organization,
  project: Project | null,
): NoteProposalType {
  if (project) return 'project_update';
  if (org.type === 'oem') return 'oem_mention';
  return 'customer_insight';
}

export function createInitialNoteProposal(
  note: Note,
  org: Organization,
  project: Project | null,
): NoteProposal {
  const type = initialProposalType(org, project);
  const target = project ? `${org.name} / ${project.name}` : org.name;
  const title =
    type === 'project_update'
      ? `Review project update for ${project!.name}`
      : type === 'oem_mention'
        ? `Review OEM note for ${org.name}`
        : `Review customer insight for ${org.name}`;

  return noteProposalModel.create({
    source_note_id: note.id,
    organization_id: org.id,
    project_id: project?.id ?? null,
    type,
    title,
    summary: compact(note.content),
    evidence_quote: compact(note.content, 500),
    confidence: 0.45,
    proposed_payload: {
      target,
      source_path: note.source_path,
      source_note_id: note.id,
      extraction_stage: 'initial_capture_triage',
    },
  });
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

  const raw = await extractNoteProposals({
    noteContent: note.content,
    orgName: org.name,
    orgType: org.type,
    projectName: project?.name ?? null,
    oemNames,
  });

  if (raw.length === 0) return; // keep initial triage

  // Resolve oem_mention oem_name → org id so applyApproval can create the
  // note on the correct org without a second lookup.
  const resolvedProposals = raw.map((p) => {
    if (p.type !== 'oem_mention') return p;
    const oemName = typeof p.payload['oem_name'] === 'string' ? p.payload['oem_name'] : '';
    const targetOrg = oemOrgs.find((o) => o.name.toLowerCase() === oemName.toLowerCase());
    return {
      ...p,
      payload: { ...p.payload, target_org_id: targetOrg?.id ?? null },
    };
  });

  // Replace pending triage with real proposals atomically-enough:
  // delete triage (only if still pending — safe if user already acted), then create.
  noteProposalModel.deleteBySourceNoteIfPending(note.id);

  for (const p of resolvedProposals) {
    noteProposalModel.create({
      source_note_id: note.id,
      organization_id: org.id,
      project_id: project?.id ?? null,
      type: p.type as NoteProposalType,
      title: p.title,
      summary: p.summary,
      evidence_quote: p.evidence_quote,
      confidence: p.confidence,
      proposed_payload: p.payload,
    });
  }
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
      const dueDate = typeof payload['due_date'] === 'string' ? payload['due_date'] : null;
      taskModel.create({
        title,
        organization_id,
        project_id: project_id ?? null,
        due_date: dueDate,
      });
      break;
    }

    case 'customer_ask': {
      const description = typeof payload['description'] === 'string' ? payload['description'] : summary;
      const urgency = typeof payload['urgency'] === 'string' ? ` [${payload['urgency']} urgency]` : '';
      const requestedBy = typeof payload['requested_by'] === 'string' ? `\nRequested by: ${payload['requested_by']}` : '';
      noteModel.create({
        organization_id,
        project_id: project_id ?? null,
        content: `## Customer Ask: ${title}${urgency}\n\n${description}${requestedBy}`,
        role: 'user',
      });
      break;
    }

    case 'project_update': {
      const content = typeof payload['content'] === 'string' ? payload['content'] : summary;
      const statusNote = typeof payload['new_status'] === 'string'
        ? `\nStatus: ${payload['new_status']}`
        : '';
      noteModel.create({
        organization_id,
        project_id: project_id ?? null,
        content: `## Project Update: ${title}${statusNote}\n\n${content}`,
        role: 'user',
      });
      break;
    }

    case 'risk_blocker': {
      const description = typeof payload['description'] === 'string' ? payload['description'] : summary;
      const severity = typeof payload['severity'] === 'string' ? ` [${payload['severity']} severity]` : '';
      noteModel.create({
        organization_id,
        project_id: project_id ?? null,
        content: `## Risk/Blocker: ${title}${severity}\n\n${description}`,
        role: 'user',
      });
      // Also create a task so it surfaces in the task list.
      taskModel.create({
        title: `[Risk] ${title}`,
        organization_id,
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

    case 'customer_insight': {
      const insight = typeof payload['insight'] === 'string' ? payload['insight'] : summary;
      // createInsight inserts with confirmed=0; we immediately confirm since the
      // user just approved this from the proposal queue.
      const created = noteModel.createInsight(organization_id, `## Customer Insight: ${title}\n\n${insight}`, {
        tool: 'note_proposal_approval',
        source_org_id: organization_id,
      });
      noteModel.confirm(created.id);
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
