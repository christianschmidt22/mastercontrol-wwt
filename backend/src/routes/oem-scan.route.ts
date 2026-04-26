/**
 * Step 8 — OEM Project Documentation scan endpoint.
 *
 * GET /api/oem/:id/documents/scan
 *
 * Walks the OEM org's configured OneDrive folder (shallow, no recursion) and
 * returns a file listing. Optionally upserts new files into `documents` with
 * source='onedrive_scan'. Manual documents rows are never overwritten.
 *
 * Decision H: onedrive_folder in org metadata may be absolute or relative to
 * settings('onedrive_root'). If relative and onedrive_root is not configured,
 * the endpoint returns a 500 with a clear message.
 */

import { Router } from 'express';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { organizationModel } from '../models/organization.model.js';
import { documentModel } from '../models/document.model.js';
import { settingsModel } from '../models/settings.model.js';
import { HttpError } from '../middleware/errorHandler.js';

export const oemScanRouter = Router();

export interface ScanEntry {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  size?: number;
  mtime: string;
}

interface ScanResponse {
  configured: boolean;
  root?: string;
  files?: ScanEntry[];
}

/**
 * Verify that `target` is a strict descendant of `root`.
 * Resolves both to real paths (following symlinks) and checks the boundary.
 * Throws `Error('safe-path-rejected: …')` on any violation.
 */
function checkPathInRoot(target: string, root: string): string {
  const normRoot = path.resolve(root).replace(/[\\/]+$/, '');

  let resolvedTarget: string;
  try {
    resolvedTarget = fs.realpathSync(target);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error('safe-path-rejected: folder does not exist');
    }
    throw err;
  }

  const resolvedNorm = path.normalize(resolvedTarget);
  const rootBoundary = normRoot + path.sep;

  // Allow the target to equal root itself (the OEM folder IS the root child
  // we are checking) or be a strict descendant.
  if (resolvedNorm !== normRoot && !resolvedNorm.startsWith(rootBoundary)) {
    throw new Error(
      `safe-path-rejected: resolved path escapes root (root=${normRoot}, resolved=${resolvedNorm})`,
    );
  }

  return resolvedNorm;
}

// GET /api/oem/:id/documents/scan
oemScanRouter.get('/:id/documents/scan', (req, res, next) => {
  // Step 1: parse and validate :id
  const raw = req.params['id'];
  if (typeof raw !== 'string') {
    return next(new HttpError(400, 'Invalid id'));
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return next(new HttpError(400, 'Invalid id'));
  }

  // Step 2: load org, check it exists and is type='oem'
  const org = organizationModel.get(id);
  if (!org) {
    return next(new HttpError(404, 'Organization not found'));
  }
  if (org.type !== 'oem') {
    return next(new HttpError(400, 'Organization is not type oem'));
  }

  // Step 3: extract onedrive_folder from metadata
  const onedriveFolder = org.metadata['onedrive_folder'];
  if (typeof onedriveFolder !== 'string' || onedriveFolder.trim() === '') {
    const body: ScanResponse = { configured: false, files: [] };
    res.json(body);
    return;
  }

  // Step 4: read onedrive_root setting; required if folder is relative
  const onedriveRoot = settingsModel.get('onedrive_root');
  const folderIsAbsolute = path.isAbsolute(onedriveFolder);

  if (!folderIsAbsolute && !onedriveRoot) {
    return next(
      new HttpError(500, 'onedrive_root not set in Settings. Cannot resolve relative onedrive_folder.'),
    );
  }

  // Step 5: resolve full path and verify it stays within root
  const fullPath = folderIsAbsolute
    ? onedriveFolder
    : path.join(onedriveRoot!, onedriveFolder);

  // When the folder is absolute, we still need a root for the boundary check.
  // Use the folder's parent as the root boundary — or if onedrive_root is set,
  // use it so absolute paths inside the root are permitted but absolute paths
  // outside are rejected via safe-path.
  const boundaryRoot = onedriveRoot ?? path.dirname(fullPath);

  let resolvedFolder: string;
  try {
    resolvedFolder = checkPathInRoot(fullPath, boundaryRoot);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('safe-path-rejected:')) {
      return next(new HttpError(400, err.message));
    }
    return next(err);
  }

  // Step 6: shallow directory walk
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(resolvedFolder, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return next(new HttpError(400, `OEM folder not found or not a directory: ${resolvedFolder}`));
    }
    return next(err);
  }

  // Step 7: classify each entry
  const files: ScanEntry[] = [];

  for (const entry of entries) {
    const entryPath = path.join(resolvedFolder, entry.name);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(entryPath);
    } catch {
      // Entry disappeared between readdir and stat — skip it.
      continue;
    }

    const isDir = entry.isDirectory();
    const mtime = stat.mtime.toISOString();

    const scanEntry: ScanEntry = {
      name: entry.name,
      path: entryPath,
      kind: isDir ? 'directory' : 'file',
      mtime,
    };

    if (!isDir) {
      scanEntry.size = stat.size;

      // Step 8: upsert new file rows (skip directories)
      try {
        documentModel.upsertOneDriveFile({
          organization_id: id,
          label: entry.name,
          url_or_path: entryPath,
        });
      } catch {
        // Best-effort: don't fail the scan if the upsert fails.
      }
    }

    files.push(scanEntry);
  }

  // Step 9: return response
  const body: ScanResponse = {
    configured: true,
    root: resolvedFolder,
    files,
  };
  res.json(body);
});
