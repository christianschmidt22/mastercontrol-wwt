import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { noteModel, type Note } from '../models/note.model.js';
import { organizationModel } from '../models/organization.model.js';
import { projectModel } from '../models/project.model.js';
import { HttpError } from '../middleware/errorHandler.js';
import {
  ensureOrgNotesFolder,
  ensureProjectNotesFolder,
  isMastercontrolRootConfigured,
  slugifyFolderName,
} from './fileSpace.service.js';
import { runLlmExtraction } from './noteProposal.service.js';
import { logAlert } from '../models/systemAlert.model.js';

export interface CaptureNoteInput {
  organization_id: number;
  project_id?: number | null;
  content: string;
  capture_source?: string | null;
}

export interface CaptureNoteResult {
  note: Note;
  markdown_path: string;
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function localTimestamp(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function markdownEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildMarkdown(input: {
  noteId: string;
  orgName: string;
  orgType: string;
  projectName: string | null;
  captureSource: string;
  createdAt: string;
  content: string;
}): string {
  const projectLine = input.projectName
    ? `project: "${markdownEscape(input.projectName)}"\n`
    : '';
  return `---\n` +
    `id: ${input.noteId}\n` +
    `created: ${input.createdAt}\n` +
    `org: "${markdownEscape(input.orgName)}"\n` +
    `org_type: ${input.orgType}\n` +
    projectLine +
    `source: ${input.captureSource}\n` +
    `tags:\n` +
    `  - org/${slugifyFolderName(input.orgName)}\n` +
    (input.projectName ? `  - project/${slugifyFolderName(input.projectName)}\n` : '') +
    `---\n\n` +
    `${input.content.trim()}\n`;
}

export function captureMarkdownNote(input: CaptureNoteInput): CaptureNoteResult {
  const org = organizationModel.get(input.organization_id);
  if (!org) throw new HttpError(404, 'Organization not found');

  const project = input.project_id ? projectModel.get(input.project_id) ?? null : null;
  if (input.project_id && !project) throw new HttpError(404, 'Project not found');
  if (project && project.organization_id !== org.id) {
    throw new HttpError(400, 'Project does not belong to organization');
  }

  const content = input.content.trim();
  if (!content) throw new HttpError(400, 'Note content is required');

  const now = new Date();
  const createdAt = now.toISOString();
  const noteFileId = `note_${crypto.randomUUID()}`;
  const captureSource = input.capture_source?.trim() || 'mastercontrol';

  // If the vault root isn't configured, save to the DB only (no markdown file).
  // The note is still fully functional; the file is just a backup/export artifact.
  let filePath: string | null = null;
  let fileMtime: string | null = null;

  if (isMastercontrolRootConfigured()) {
    const folder = project
      ? ensureProjectNotesFolder(org, project.name).path
      : ensureOrgNotesFolder(org).path;

    fs.mkdirSync(folder, { recursive: true });

    const filenameStem = [
      localTimestamp(now),
      project ? slugifyFolderName(project.name) : slugifyFolderName(org.name),
      noteFileId.slice(-8),
    ].join('-');
    filePath = path.join(folder, `${filenameStem}.md`);

    const markdown = buildMarkdown({
      noteId: noteFileId,
      orgName: org.name,
      orgType: org.type,
      projectName: project?.name ?? null,
      captureSource,
      createdAt,
      content,
    });
    fs.writeFileSync(filePath, markdown, 'utf8');
    fileMtime = fs.statSync(filePath).mtime.toISOString();
  }

  const note = noteModel.createCaptured({
    organization_id: org.id,
    project_id: project?.id ?? null,
    capture_source: captureSource,
    content,
    source_path: filePath ?? null,
    file_mtime: fileMtime ?? null,
    file_id: noteFileId,
    content_sha256: sha256(content),
  });

  // Fire LLM extraction async — extracts tasks, people, insights from the note.
  // Non-fatal: if extraction fails the note is still saved and visible.
  void runLlmExtraction(note, org, project).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[noteCapture] runLlmExtraction failed (non-fatal)', { note_id: note.id, message });
    logAlert('warn', 'noteExtraction', `Note extraction failed: ${message}`, { note_id: note.id });
  });

  return { note, markdown_path: filePath ?? '' };
}
