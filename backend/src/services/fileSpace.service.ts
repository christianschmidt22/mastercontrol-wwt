import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Organization } from '../models/organization.model.js';
import { settingsModel } from '../models/settings.model.js';

export const MASTERCONTROL_ROOT_SETTING = 'mastercontrol_root';
export const DEFAULT_MASTERCONTROL_ROOT =
  'C:\\Users\\schmichr\\OneDrive - WWT\\Documents\\mastercontrol';

interface FileSpacePath {
  path: string;
  created: boolean;
}

function configuredRoot(): string | null {
  const value = settingsModel.get(MASTERCONTROL_ROOT_SETTING);
  return value && value.trim() ? value.trim() : null;
}

export function getMastercontrolRoot(): string {
  return configuredRoot() ?? DEFAULT_MASTERCONTROL_ROOT;
}

export function slugifyFolderName(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
  return slug || 'untitled';
}

function acronym(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toLowerCase();
}

function orgCollection(type: Organization['type']): 'customers' | 'oems' {
  return type === 'customer' ? 'customers' : 'oems';
}

function metadataPath(org: Organization): string | null {
  const candidate = org.metadata['mastercontrol_folder_path'];
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

function metadataSlug(org: Organization): string | null {
  const candidate = org.metadata['mastercontrol_folder_slug'];
  return typeof candidate === 'string' && candidate.trim()
    ? slugifyFolderName(candidate)
    : null;
}

function discoverExistingOrgFolder(parent: string, org: Organization): string | null {
  if (!existsSync(parent)) return null;
  const orgSlug = slugifyFolderName(org.name);
  const orgAcronym = acronym(org.name);
  const candidates = readdirSync(parent)
    .filter((entry) => {
      try {
        return statSync(path.join(parent, entry)).isDirectory();
      } catch {
        return false;
      }
    });

  // Match exact slug, exact acronym, or folder being a prefix of the org slug
  // (e.g. folder "fairview" matches org "Fairview Health Services").
  // Do NOT match the reverse (folder extending the org slug) — that risks
  // "cohesity_backup" matching an org named "Cohesity".
  for (const candidate of candidates) {
    const candidateSlug = slugifyFolderName(candidate);
    if (
      candidateSlug === orgSlug ||
      candidateSlug === orgAcronym ||
      orgSlug.startsWith(`${candidateSlug}_`)
    ) {
      return candidate;
    }
  }
  return null;
}

function ensureDirectory(targetPath: string): boolean {
  if (existsSync(targetPath)) return false;
  mkdirSync(targetPath, { recursive: true });
  return true;
}

export function getOrgFolderPath(org: Organization): string {
  const explicitPath = metadataPath(org);
  if (explicitPath) return explicitPath;

  const root = getMastercontrolRoot();
  const parent = path.join(root, orgCollection(org.type));
  const folder =
    metadataSlug(org) ??
    discoverExistingOrgFolder(parent, org) ??
    slugifyFolderName(org.name);
  return path.join(parent, folder);
}

export function ensureOrgFolder(org: Organization): FileSpacePath {
  const orgPath = getOrgFolderPath(org);
  const rootWasConfigured = configuredRoot() !== null;
  return {
    path: orgPath,
    created: rootWasConfigured ? ensureDirectory(orgPath) : false,
  };
}

export function getProjectFolderPath(org: Organization, projectName: string): string {
  return path.join(getOrgFolderPath(org), 'projects', slugifyFolderName(projectName));
}

export function ensureProjectFolder(
  org: Organization,
  projectName: string,
): FileSpacePath {
  const projectPath = getProjectFolderPath(org, projectName);
  const rootWasConfigured = configuredRoot() !== null;
  return {
    path: projectPath,
    created: rootWasConfigured ? ensureDirectory(projectPath) : false,
  };
}
