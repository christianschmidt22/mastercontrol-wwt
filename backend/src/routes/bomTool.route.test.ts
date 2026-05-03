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
    expect(res.body).toEqual({ output: '# Report\nLooks good.' });
    expect(runBomQuoteAnalysis).toHaveBeenCalledWith({
      organization_id: org.id,
      organization_name: 'C.H. Robinson',
      file_paths: [
        path.join(rootDir, 'customers', 'c_h_robinson', 'quotes_configs', 'chr-config.csv'),
      ],
      prompt: 'Find risks',
    });
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
