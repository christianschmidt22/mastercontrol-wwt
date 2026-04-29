import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  masterNoteModel,
  type MasterNote,
} from '../models/masterNote.model.js';
import { organizationModel } from '../models/organization.model.js';
import { projectModel } from '../models/project.model.js';
import {
  ensureOrgFolder,
  ensureProjectFolder,
  isMastercontrolRootConfigured,
} from './fileSpace.service.js';
import { HttpError } from '../middleware/errorHandler.js';
import { noteModel } from '../models/note.model.js';
import { runLlmExtraction } from './noteProposal.service.js';
import { logAlert } from '../models/systemAlert.model.js';

const MASTER_NOTE_FILENAME = 'master-notes.md';

/**
 * Resolve the on-disk path for a master note. Returns `null` when the user
 * has not configured a vault root (in which case master notes still work,
 * they just live DB-only).
 */
function resolveFilePath(
  orgId: number,
  projectId: number | null,
): string | null {
  if (!isMastercontrolRootConfigured()) return null;
  const org = organizationModel.get(orgId);
  if (!org) return null;

  if (projectId === null) {
    const folder = ensureOrgFolder(org).path;
    return path.join(folder, MASTER_NOTE_FILENAME);
  }

  const project = projectModel.get(projectId);
  if (!project) return null;
  if (project.organization_id !== orgId) return null;
  const folder = ensureProjectFolder(org, project.name).path;
  return path.join(folder, MASTER_NOTE_FILENAME);
}

/** Mirror the master-note content to its on-disk file (if vault is set). */
function mirrorToFile(
  orgId: number,
  projectId: number | null,
  content: string,
): { path: string; mtime: string } | null {
  const filePath = resolveFilePath(orgId, projectId);
  if (!filePath) return null;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  const mtime = fs.statSync(filePath).mtime.toISOString();
  return { path: filePath, mtime };
}

/**
 * Upsert a master note from the UI — autosaved on every debounced edit.
 * Always writes to the DB; mirrors to a vault file as a side-effect when a
 * vault root is configured. Returns the persisted row.
 */
export function saveMasterNote(input: {
  organization_id: number;
  project_id: number | null;
  content: string;
}): MasterNote {
  const org = organizationModel.get(input.organization_id);
  if (!org) throw new HttpError(404, 'Organization not found');
  if (input.project_id !== null) {
    const project = projectModel.get(input.project_id);
    if (!project) throw new HttpError(404, 'Project not found');
    if (project.organization_id !== input.organization_id) {
      throw new HttpError(400, 'Project does not belong to organization');
    }
  }

  // File mirror is best-effort — DB write always succeeds even if the FS
  // call fails (e.g. permission error on a synced folder).
  let mirrored: { path: string; mtime: string } | null = null;
  try {
    mirrored = mirrorToFile(input.organization_id, input.project_id, input.content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[masterNote] vault mirror failed (non-fatal)', { message });
  }

  return masterNoteModel.upsert({
    organization_id: input.organization_id,
    project_id: input.project_id,
    content: input.content,
    file_path: mirrored?.path ?? null,
    file_mtime: mirrored?.mtime ?? null,
  });
}

/** Read the master note for (org, optional project). Creates an empty row
 *  on first read so the UI always has something to bind to. */
export function loadMasterNote(
  orgId: number,
  projectId: number | null,
): MasterNote {
  const existing =
    projectId === null
      ? masterNoteModel.getForOrg(orgId)
      : masterNoteModel.getForProject(orgId, projectId);
  if (existing) return existing;
  // Lazy-create so PUT semantics aren't required before first GET.
  return masterNoteModel.upsert({
    organization_id: orgId,
    project_id: projectId,
    content: '',
  });
}

/**
 * On-demand "process this master note now" — runs LLM extraction against
 * the current content. The captured-note layer already produces typed
 * proposals from arbitrary text, so we synthesize a transient `notes` row
 * and feed it through the same pipeline.
 *
 * Returns true if extraction ran, false if the content hasn't changed since
 * the last ingest (and force=false).
 */
export async function processMasterNote(
  masterNoteId: number,
  options: { force?: boolean } = {},
): Promise<{ ran: boolean }> {
  const mn = masterNoteModel.getById(masterNoteId);
  if (!mn) throw new HttpError(404, 'Master note not found');

  const trimmed = mn.content.trim();
  if (trimmed.length === 0) return { ran: false };

  if (!options.force && mn.last_ingested_sha256 === mn.content_sha256) {
    return { ran: false };
  }

  const org = organizationModel.get(mn.organization_id);
  if (!org) throw new HttpError(404, 'Organization not found');
  const project = mn.project_id ? projectModel.get(mn.project_id) ?? null : null;

  // Synthesize a `notes` row so runLlmExtraction has something to attach
  // its proposals to (proposals require source_note_id). The note is
  // marked confirmed and tagged so it doesn't pollute the user-facing feed
  // — the extraction queue points back to it for "from the note" evidence.
  const captureSource = `master_notes${mn.project_id ? '/project' : '/org'}`;
  const noteRow = noteModel.create({
    organization_id: mn.organization_id,
    project_id: mn.project_id ?? null,
    content: mn.content,
    role: 'imported',
    capture_source: captureSource,
  });

  await runLlmExtraction(noteRow, org, project);
  masterNoteModel.markIngested(mn.id, mn.content_sha256);
  return { ran: true };
}

/**
 * Hourly scanner: walk every master_notes row and check whether the on-disk
 * file has been edited externally (VS Code, OneDrive sync from another
 * device). When the disk mtime is newer than what we last recorded:
 *   - If the file's sha256 differs from `content_sha256`: pull the new
 *     content into the DB and re-run extraction.
 *   - If the sha is identical (e.g. OneDrive touched the file without
 *     changing bytes): just bump `file_mtime` so we stop re-reading it.
 *
 * Per-row failures never abort the loop — they're logged to system_alerts.
 */
export async function scanExternalMasterNoteEdits(): Promise<{
  scanned: number;
  updated: number;
  errors: number;
}> {
  let scanned = 0;
  let updated = 0;
  let errors = 0;

  for (const mn of masterNoteModel.listAll()) {
    if (!mn.file_path) continue;
    scanned += 1;

    try {
      let stat: fs.Stats;
      try {
        stat = fs.statSync(mn.file_path);
      } catch (err) {
        const code =
          err instanceof Error && 'code' in err
            ? (err as NodeJS.ErrnoException).code
            : undefined;
        if (code === 'ENOENT') {
          // File was deleted manually — skip silently; the user may rebuild
          // it on the next save.
          continue;
        }
        throw err;
      }

      const diskMtimeIso = stat.mtime.toISOString();
      const dbMtimeMs = mn.file_mtime ? new Date(mn.file_mtime).getTime() : 0;
      const diskMtimeMs = stat.mtime.getTime();
      if (diskMtimeMs <= dbMtimeMs) continue;

      const content = fs.readFileSync(mn.file_path, 'utf8');
      const diskSha = crypto.createHash('sha256').update(content, 'utf8').digest('hex');

      if (diskSha === mn.content_sha256) {
        // Content unchanged — just update mtime so we don't re-hash next tick.
        masterNoteModel.upsert({
          organization_id: mn.organization_id,
          project_id: mn.project_id,
          content: mn.content,
          file_path: mn.file_path,
          file_mtime: diskMtimeIso,
        });
        continue;
      }

      masterNoteModel.upsert({
        organization_id: mn.organization_id,
        project_id: mn.project_id,
        content,
        file_path: mn.file_path,
        file_mtime: diskMtimeIso,
      });
      updated += 1;
      await processMasterNote(mn.id, { force: false });
    } catch (err) {
      errors += 1;
      const message = err instanceof Error ? err.message : String(err);
      logAlert(
        'warn',
        'masterNoteScan',
        `External master-note scan failed: ${message}`,
        { master_note_id: mn.id },
      );
    }
  }

  return { scanned, updated, errors };
}
