import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { settingsModel } from '../models/settings.model.js';
import { organizationModel } from '../models/organization.model.js';
import {
  ensureProjectFolder,
  getOrgFolderPath,
  MASTERCONTROL_ROOT_SETTING,
  slugifyFolderName,
} from './fileSpace.service.js';

const root = path.join(process.cwd(), '.tmp-file-space-test');

describe('fileSpace.service', () => {
  beforeEach(() => {
    rmSync(root, { recursive: true, force: true });
    mkdirSync(path.join(root, 'customers', 'fairview'), { recursive: true });
    mkdirSync(path.join(root, 'customers', 'chr'), { recursive: true });
    mkdirSync(path.join(root, 'oems', 'cohesity'), { recursive: true });
    settingsModel.set(MASTERCONTROL_ROOT_SETTING, root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('slugifies project names for stable folder paths', () => {
    expect(slugifyFolderName('VCF9 Adoption')).toBe('vcf9_adoption');
    expect(slugifyFolderName('vcf9_adoption')).toBe('vcf9_adoption');
  });

  it('discovers existing short customer and OEM folders', () => {
    const fairview = organizationModel.create({
      type: 'customer',
      name: 'Fairview Health Services',
    });
    const chr = organizationModel.create({
      type: 'customer',
      name: 'C.H. Robinson',
    });
    const cohesity = organizationModel.create({
      type: 'oem',
      name: 'Cohesity',
    });

    expect(getOrgFolderPath(fairview)).toBe(path.join(root, 'customers', 'fairview'));
    expect(getOrgFolderPath(chr)).toBe(path.join(root, 'customers', 'chr'));
    expect(getOrgFolderPath(cohesity)).toBe(path.join(root, 'oems', 'cohesity'));
  });

  it('creates project subfolders under the customer folder when root is configured', () => {
    const fairview = organizationModel.create({
      type: 'customer',
      name: 'Fairview Health Services',
    });

    const result = ensureProjectFolder(fairview, 'VCF9 Adoption');

    expect(result.path).toBe(path.join(root, 'customers', 'fairview', 'projects', 'vcf9_adoption'));
    expect(result.created).toBe(true);
  });
});
