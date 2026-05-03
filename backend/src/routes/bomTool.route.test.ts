import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildApp } from '../test/app.js';
import { makeOrg } from '../test/factories.js';
import { settingsModel } from '../models/settings.model.js';

vi.mock('../services/claude.service.js', () => ({
  runBomQuoteAnalysis: vi.fn(),
}));

import { runBomQuoteAnalysis } from '../services/claude.service.js';

let app: Express;
let rootDir: string;

beforeAll(async () => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mastercontrol-bom-tool-'));
  settingsModel.set('mastercontrol_root', rootDir);
  app = await buildApp();
});

beforeEach(() => {
  vi.mocked(runBomQuoteAnalysis).mockReset();
});

afterAll(() => {
  fs.rmSync(rootDir, { recursive: true, force: true });
  settingsModel.remove('mastercontrol_root');
});

describe('BOM tool files', () => {
  it('uploads files into the customer quotes_configs folder and lists them', async () => {
    const org = makeOrg({ name: 'Fairview Health Services' });

    const res = await request(app)
      .post('/api/tools/bom/upload')
      .send({
        organization_id: org.id,
        files: [
          {
            name: '../server quote.xlsx',
            mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            data_base64: Buffer.from('part,qty\nDL380,2').toString('base64'),
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.directory).toContain('quotes_configs');
    expect(res.body.files).toEqual([
      expect.objectContaining({
        name: 'server quote.xlsx',
        extension: 'xlsx',
        size_bytes: expect.any(Number),
      }),
    ]);
    expect(
      fs.existsSync(path.join(rootDir, 'customers', 'fairview_health_services', 'quotes_configs', 'server quote.xlsx')),
    ).toBe(true);

    const listRes = await request(app).get(`/api/tools/bom/files?org_id=${org.id}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.files).toHaveLength(1);
  });

  it('passes selected stored files to the Claude BOM analyzer', async () => {
    const org = makeOrg({ name: 'C.H. Robinson' });
    await request(app)
      .post('/api/tools/bom/upload')
      .send({
        organization_id: org.id,
        files: [
          {
            name: 'chr-config.csv',
            mime_type: 'text/csv',
            data_base64: Buffer.from('sku,qty\nabc,1').toString('base64'),
          },
        ],
      });

    vi.mocked(runBomQuoteAnalysis).mockResolvedValue({ output: '# Report\nLooks good.' });

    const res = await request(app)
      .post('/api/tools/bom/analyze')
      .send({
        organization_id: org.id,
        file_names: ['chr-config.csv'],
        prompt: 'Find risks',
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      output: '# Report\nLooks good.',
      report: {
        organization_id: org.id,
        title: 'Report',
        file_names: ['chr-config.csv'],
        output: '# Report\nLooks good.',
      },
    });
    expect(runBomQuoteAnalysis).toHaveBeenCalledWith({
      organization_id: org.id,
      organization_name: 'C.H. Robinson',
      file_paths: [
        path.join(rootDir, 'customers', 'c_h_robinson', 'quotes_configs', 'chr-config.csv'),
      ],
      customer_preferences: expect.any(Array),
      prompt: 'Find risks',
    });

    const reportsRes = await request(app).get(`/api/tools/bom/reports?org_id=${org.id}`);
    expect(reportsRes.status).toBe(200);
    expect(reportsRes.body.reports).toEqual([
      expect.objectContaining({
        title: 'Report',
        output: '# Report\nLooks good.',
        file_names: ['chr-config.csv'],
      }),
    ]);
  });

  it('returns standard customer preferences and saves manual additions', async () => {
    const org = makeOrg({ name: 'Preference Customer' });

    const defaultRes = await request(app).get(`/api/tools/bom/preferences?org_id=${org.id}`);
    expect(defaultRes.status).toBe(200);
    expect(defaultRes.body.preferences).toEqual([
      expect.objectContaining({ label: 'Support type', value: '', is_standard: true }),
      expect.objectContaining({ label: 'Support term', value: '', is_standard: true }),
      expect.objectContaining({ label: 'Optics for switch included', value: '', is_standard: true }),
      expect.objectContaining({ label: 'Optics for server included', value: '', is_standard: true }),
      expect.objectContaining({ label: 'Bezel', value: '', is_standard: true }),
      expect.objectContaining({ label: 'Rail types', value: '', is_standard: true }),
      expect.objectContaining({ label: 'Cable management', value: '', is_standard: true }),
    ]);

    const saveRes = await request(app)
      .put('/api/tools/bom/preferences')
      .send({
        organization_id: org.id,
        preferences: [
          { label: 'Support type', value: 'Foundation Care', is_standard: true },
          { label: 'Support term', value: '5 years', is_standard: true },
          { label: 'Unexpected cabling preference', value: 'Use blue DACs when available' },
        ],
      });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.preferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Support type', value: 'Foundation Care', is_standard: true }),
        expect.objectContaining({ label: 'Support term', value: '5 years', is_standard: true }),
        expect.objectContaining({ label: 'Unexpected cabling preference', value: 'Use blue DACs when available', is_standard: false }),
      ]),
    );
  });

  it('moves selected files between customer quotes_configs folders', async () => {
    const apiGroup = makeOrg({ name: 'APi Group' });
    const fairview = makeOrg({
      name: 'Fairview Health Services Move Target',
      metadata: { mastercontrol_folder_slug: 'fairview_move_target' },
    });

    await request(app)
      .post('/api/tools/bom/upload')
      .send({
        organization_id: apiGroup.id,
        files: [
          {
            name: 'misfiled-quote.pdf',
            mime_type: 'application/pdf',
            data_base64: Buffer.from('%PDF fake').toString('base64'),
          },
        ],
      });

    const res = await request(app)
      .post('/api/tools/bom/move')
      .send({
        from_organization_id: apiGroup.id,
        to_organization_id: fairview.id,
        file_names: ['misfiled-quote.pdf'],
      });

    expect(res.status).toBe(200);
    expect(res.body.from.files).toEqual([]);
    expect(res.body.to.files).toEqual([
      expect.objectContaining({ name: 'misfiled-quote.pdf' }),
    ]);
    expect(
      fs.existsSync(path.join(rootDir, 'customers', 'api_group', 'quotes_configs', 'misfiled-quote.pdf')),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(rootDir, 'customers', 'fairview_move_target', 'quotes_configs', 'misfiled-quote.pdf')),
    ).toBe(true);
  });
});
