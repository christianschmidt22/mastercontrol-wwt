import { Router } from 'express';
import { spawn, spawnSync } from 'child_process';
import { z } from 'zod';
import path from 'path';
import { validateBody } from '../lib/validate.js';
import { organizationModel } from '../models/organization.model.js';
import { getOrgFolderPath } from '../services/fileSpace.service.js';
import { HttpError } from '../middleware/errorHandler.js';

export const shellRouter = Router();

const OpenSchema = z.object({
  path: z.string().min(1).max(1000),
});

const BrowseSchema = z.object({
  orgId: z.number().int().positive(),
  currentPath: z.string().optional(),
});

// POST /api/shell/open — open a local folder in the OS file explorer.
// Uses spawn (not exec) to avoid shell injection.
shellRouter.post('/open', validateBody(OpenSchema), (req, res) => {
  const { path: targetPath } = req.validated as { path: string };
  spawn('explorer.exe', [targetPath], { detached: true, stdio: 'ignore' }).unref();
  res.json({ ok: true });
});

// POST /api/shell/browse — show a Windows folder-picker dialog and return
// the selected path. Opens at `currentPath` if provided, otherwise at the
// org's vault projects folder. Blocks until the user closes the dialog.
// Path is passed via env var (BROWSE_INITIAL) to avoid any PS injection.
shellRouter.post('/browse', validateBody(BrowseSchema), (req, res, next) => {
  const { orgId, currentPath } = req.validated as { orgId: number; currentPath?: string };

  const org = organizationModel.get(orgId);
  if (!org) return next(new HttpError(404, 'Organization not found'));

  const initialPath = currentPath?.trim()
    || path.join(getOrgFolderPath(org), 'projects');

  const psScript = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$d.Description = 'Select project folder'",
    '$d.ShowNewFolderButton = $true',
    '$d.SelectedPath = $env:BROWSE_INITIAL',
    "if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }",
  ].join('; ');

  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', psScript],
    { env: { ...process.env, BROWSE_INITIAL: initialPath }, encoding: 'utf8', timeout: 120_000 },
  );

  const selected = result.stdout?.trim() || null;
  res.json({ path: selected });
});
