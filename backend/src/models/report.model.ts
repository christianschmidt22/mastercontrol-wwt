import { db } from '../db/database.js';

/**
 * Phase 2 / Step 5a — reports model.
 *
 * Backed by the `reports` table from migration 006_reports.sql:
 *   id, name, prompt_template, target (JSON text), output_format,
 *   enabled (0|1), created_at, updated_at.
 *
 * `target` stored on disk as a JSON string; deserialised on read,
 * serialised on write. Shape: array of org-id numbers OR the literal
 * `["all"]` to include every org.
 */

export type ReportTarget = number[] | ['all'];

interface ReportRow {
  id: number;
  name: string;
  prompt_template: string;
  target: string;
  output_format: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: number;
  name: string;
  prompt_template: string;
  target: ReportTarget;
  output_format: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReportInput {
  name: string;
  prompt_template: string;
  target?: ReportTarget;
  output_format?: string;
  enabled?: boolean;
}

export interface ReportUpdate {
  name?: string;
  prompt_template?: string;
  target?: ReportTarget;
  output_format?: string;
  enabled?: boolean;
}

const listStmt = db.prepare<[], ReportRow>(
  'SELECT * FROM reports ORDER BY created_at DESC',
);
const getStmt = db.prepare<[number], ReportRow>(
  'SELECT * FROM reports WHERE id = ?',
);
const insertStmt = db.prepare<
  [string, string, string, string, number]
>(
  `INSERT INTO reports (name, prompt_template, target, output_format, enabled)
   VALUES (?, ?, ?, ?, ?)`,
);
const updateStmt = db.prepare<
  [string, string, string, string, number, number]
>(
  `UPDATE reports
     SET name = ?,
         prompt_template = ?,
         target = ?,
         output_format = ?,
         enabled = ?,
         updated_at = datetime('now')
   WHERE id = ?`,
);
const deleteStmt = db.prepare<[number]>('DELETE FROM reports WHERE id = ?');

function parseTarget(raw: string): ReportTarget {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      // ["all"] or number[] — accept both shapes.
      if (parsed.length === 1 && parsed[0] === 'all') return ['all'];
      const nums = parsed.filter((x): x is number => typeof x === 'number');
      return nums;
    }
  } catch {
    // fall through
  }
  return ['all'];
}

function hydrate(row: ReportRow): Report {
  return {
    id: row.id,
    name: row.name,
    prompt_template: row.prompt_template,
    target: parseTarget(row.target),
    output_format: row.output_format,
    enabled: row.enabled === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const reportModel = {
  list: (): Report[] => listStmt.all().map(hydrate),

  get: (id: number): Report | undefined => {
    const row = getStmt.get(id);
    return row ? hydrate(row) : undefined;
  },

  create: (input: ReportInput): Report => {
    const target = input.target ?? ['all'];
    const result = insertStmt.run(
      input.name,
      input.prompt_template,
      JSON.stringify(target),
      input.output_format ?? 'markdown',
      input.enabled === false ? 0 : 1,
    );
    return hydrate(getStmt.get(Number(result.lastInsertRowid))!);
  },

  update: (id: number, patch: ReportUpdate): Report | undefined => {
    const current = getStmt.get(id);
    if (!current) return undefined;
    const next: ReportRow = {
      ...current,
      name: patch.name ?? current.name,
      prompt_template: patch.prompt_template ?? current.prompt_template,
      target:
        patch.target !== undefined
          ? JSON.stringify(patch.target)
          : current.target,
      output_format: patch.output_format ?? current.output_format,
      enabled:
        patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : current.enabled,
    };
    updateStmt.run(
      next.name,
      next.prompt_template,
      next.target,
      next.output_format,
      next.enabled,
      id,
    );
    return hydrate(getStmt.get(id)!);
  },

  remove: (id: number): boolean => deleteStmt.run(id).changes > 0,
};
