import { db } from '../db/database.js';

interface BomAnalysisReportRow {
  id: number;
  organization_id: number;
  title: string;
  prompt: string | null;
  file_names: string;
  output: string;
  created_at: string;
}

export interface BomAnalysisReport {
  id: number;
  organization_id: number;
  title: string;
  prompt: string | null;
  file_names: string[];
  output: string;
  created_at: string;
}

export interface BomAnalysisReportInput {
  organization_id: number;
  title: string;
  prompt?: string | null;
  file_names: string[];
  output: string;
}

const getStmt = db.prepare<[number], BomAnalysisReportRow>(
  'SELECT * FROM bom_analysis_reports WHERE id = ?',
);

const listForOrgStmt = db.prepare<[number], BomAnalysisReportRow>(
  `SELECT *
   FROM bom_analysis_reports
   WHERE organization_id = ?
   ORDER BY created_at DESC, id DESC`,
);

const insertStmt = db.prepare<[number, string, string | null, string, string]>(
  `INSERT INTO bom_analysis_reports
     (organization_id, title, prompt, file_names, output)
   VALUES (?, ?, ?, ?, ?)`,
);

function parseFileNames(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function hydrate(row: BomAnalysisReportRow): BomAnalysisReport {
  return {
    ...row,
    file_names: parseFileNames(row.file_names),
  };
}

export const bomAnalysisReportModel = {
  get: (id: number): BomAnalysisReport | undefined => {
    const row = getStmt.get(id);
    return row ? hydrate(row) : undefined;
  },

  listForOrg: (organizationId: number): BomAnalysisReport[] =>
    listForOrgStmt.all(organizationId).map(hydrate),

  create: (input: BomAnalysisReportInput): BomAnalysisReport => {
    const result = insertStmt.run(
      input.organization_id,
      input.title,
      input.prompt ?? null,
      JSON.stringify(input.file_names),
      input.output,
    );
    return hydrate(getStmt.get(Number(result.lastInsertRowid))!);
  },
};
