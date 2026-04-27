import path from 'node:path';
import { getMastercontrolRoot } from '../services/fileSpace.service.js';

export function getRepoRoot(): string {
  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === 'backend'
    ? path.dirname(cwd)
    : cwd;
}

export function getReportsRoot(): string {
  return path.join(getMastercontrolRoot(), 'reports');
}
