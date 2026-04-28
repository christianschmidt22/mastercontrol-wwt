import type { Note } from '../models/note.model.js';
import type { Organization } from '../models/organization.model.js';
import type { Project } from '../models/project.model.js';
import { noteProposalModel, type NoteProposal } from '../models/noteProposal.model.js';

function compact(value: string, max = 220): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

function initialProposalType(
  org: Organization,
  project: Project | null,
): NoteProposal['type'] {
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
