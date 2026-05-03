import * as fs from 'node:fs';
import * as path from 'node:path';
import { organizationModel } from '../models/organization.model.js';
import type { Organization } from '../models/organization.model.js';
import { HttpError } from '../middleware/errorHandler.js';
import { getOrgFolderPath } from './fileSpace.service.js';
import { runBomQuoteAnalysis } from './claude.service.js';
import { customerBomPreferenceModel } from '../models/customerBomPreference.model.js';
import type { CustomerBomPreference } from '../models/customerBomPreference.model.js';
import { bomAnalysisReportModel } from '../models/bomAnalysisReport.model.js';
import type { BomAnalysisReport } from '../models/bomAnalysisReport.model.js';
import type {
  BomToolUpload,
  BomToolAnalyze,
  BomToolMove,
  BomToolPreferencesSave,
} from '../schemas/bomTool.schema.js';

const QUOTES_CONFIGS_FOLDER = 'quotes_configs';
const MAX_BOM_UPLOAD_BYTES = 12 * 1024 * 1024;

export interface BomToolFile {
  name: string;
  extension: string;
  size_bytes: number;
  modified_at: string;
}

export interface BomToolFileList {
  organization_id: number;
  organization_name: string;
  directory: string;
  files: BomToolFile[];
}

export interface BomToolPreferenceList {
  organization_id: number;
  organization_name: string;
  preferences: CustomerBomPreference[];
}

export interface BomToolReportList {
  organization_id: number;
  organization_name: string;
  reports: BomAnalysisReport[];
}

function getCustomerOrThrow(id: number): Organization {
  const org = organizationModel.get(id);
  if (!org) throw new HttpError(404, 'Organization not found');
  if (org.type !== 'customer') {
    throw new HttpError(400, 'BOM Analyzer files must be stored under a customer');
  }
  return org;
}

export async function ensureBomToolDirectory(org: Organization): Promise<string> {
  const dir = path.join(getOrgFolderPath(org), QUOTES_CONFIGS_FOLDER);
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

function sanitizeFileName(name: string): string {
  const cleaned = path
    .basename(name)
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return cleaned || `bom-${Date.now()}`;
}

function assertStoredFileName(name: string): string {
  const base = path.basename(name);
  if (base !== name || base.trim().length === 0) {
    throw new HttpError(400, `Invalid stored file name: ${name}`);
  }
  return base;
}

async function uniqueFilePath(dir: string, safeName: string): Promise<string> {
  const ext = path.extname(safeName);
  const stem = path.basename(safeName, ext);
  let candidate = safeName;
  let index = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${stem} (${index})${ext}`;
    index += 1;
  }
  return path.join(dir, candidate);
}

async function toBomToolFile(filePath: string): Promise<BomToolFile> {
  const stat = await fs.promises.stat(filePath);
  return {
    name: path.basename(filePath),
    extension: path.extname(filePath).replace(/^\./, '').toLowerCase(),
    size_bytes: stat.size,
    modified_at: stat.mtime.toISOString(),
  };
}

export async function listBomToolFiles(orgId: number): Promise<BomToolFileList> {
  const org = getCustomerOrThrow(orgId);
  const dir = await ensureBomToolDirectory(org);
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => toBomToolFile(path.join(dir, entry.name))),
  );

  files.sort((a, b) => Date.parse(b.modified_at) - Date.parse(a.modified_at));
  return {
    organization_id: org.id,
    organization_name: org.name,
    directory: dir,
    files,
  };
}

export function listBomCustomerPreferences(orgId: number): BomToolPreferenceList {
  const org = getCustomerOrThrow(orgId);
  return {
    organization_id: org.id,
    organization_name: org.name,
    preferences: customerBomPreferenceModel.listForOrg(org.id),
  };
}

export function saveBomCustomerPreferences(
  input: BomToolPreferencesSave,
): BomToolPreferenceList {
  const org = getCustomerOrThrow(input.organization_id);
  return {
    organization_id: org.id,
    organization_name: org.name,
    preferences: customerBomPreferenceModel.replaceForOrg(org.id, input.preferences),
  };
}

export function listBomAnalysisReports(orgId: number): BomToolReportList {
  const org = getCustomerOrThrow(orgId);
  return {
    organization_id: org.id,
    organization_name: org.name,
    reports: bomAnalysisReportModel.listForOrg(org.id),
  };
}

function reportTitleFromOutput(output: string): string {
  const heading = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^#{1,3}\s+\S/.test(line));
  const cleaned = heading?.replace(/^#{1,3}\s+/, '').trim();
  if (cleaned) return cleaned.slice(0, 140);
  return 'BOM Analysis Report';
}

export async function uploadBomToolFiles(input: BomToolUpload): Promise<BomToolFileList> {
  const org = getCustomerOrThrow(input.organization_id);
  const dir = await ensureBomToolDirectory(org);

  for (const file of input.files) {
    const bytes = Buffer.from(file.data_base64, 'base64');
    if (bytes.length > MAX_BOM_UPLOAD_BYTES) {
      throw new HttpError(413, `${file.name} is larger than 12 MB`);
    }
    const target = await uniqueFilePath(dir, sanitizeFileName(file.name));
    await fs.promises.writeFile(target, bytes);
  }

  return listBomToolFiles(org.id);
}

export async function moveBomToolFiles(
  input: BomToolMove,
): Promise<{ from: BomToolFileList; to: BomToolFileList; moved_files: string[] }> {
  if (input.from_organization_id === input.to_organization_id) {
    throw new HttpError(400, 'Choose a different customer to move files');
  }

  const fromOrg = getCustomerOrThrow(input.from_organization_id);
  const toOrg = getCustomerOrThrow(input.to_organization_id);
  const fromDir = await ensureBomToolDirectory(fromOrg);
  const toDir = await ensureBomToolDirectory(toOrg);
  const movedFiles: string[] = [];

  for (const name of input.file_names) {
    const fileName = assertStoredFileName(name);
    const sourcePath = path.resolve(fromDir, fileName);
    const sourceRoot = path.resolve(fromDir);
    if (!sourcePath.startsWith(`${sourceRoot}${path.sep}`)) {
      throw new HttpError(400, `Invalid stored file name: ${name}`);
    }
    if (!fs.existsSync(sourcePath)) {
      throw new HttpError(404, `${fileName} was not found in source quotes_configs`);
    }

    const targetPath = await uniqueFilePath(toDir, fileName);
    await fs.promises.rename(sourcePath, targetPath);
    movedFiles.push(path.basename(targetPath));
  }

  return {
    from: await listBomToolFiles(fromOrg.id),
    to: await listBomToolFiles(toOrg.id),
    moved_files: movedFiles,
  };
}

export async function analyzeBomToolFiles(
  input: BomToolAnalyze,
): Promise<{ output: string; report: BomAnalysisReport }> {
  const org = getCustomerOrThrow(input.organization_id);
  const dir = await ensureBomToolDirectory(org);
  const preferences = customerBomPreferenceModel.listForOrg(org.id);
  const selectedFileNames: string[] = [];
  const selectedPaths = input.file_names.map((name) => {
    const fileName = assertStoredFileName(name);
    selectedFileNames.push(fileName);
    const filePath = path.resolve(dir, fileName);
    const root = path.resolve(dir);
    if (!filePath.startsWith(`${root}${path.sep}`)) {
      throw new HttpError(400, `Invalid stored file name: ${name}`);
    }
    if (!fs.existsSync(filePath)) {
      throw new HttpError(404, `${fileName} was not found in quotes_configs`);
    }
    return filePath;
  });

  const result = await runBomQuoteAnalysis({
    organization_id: org.id,
    organization_name: org.name,
    file_paths: selectedPaths,
    customer_preferences: preferences,
    prompt: input.prompt?.trim() || null,
  });

  const report = bomAnalysisReportModel.create({
    organization_id: org.id,
    title: reportTitleFromOutput(result.output),
    prompt: input.prompt?.trim() || null,
    file_names: selectedFileNames,
    output: result.output,
  });

  return { output: result.output, report };
}
