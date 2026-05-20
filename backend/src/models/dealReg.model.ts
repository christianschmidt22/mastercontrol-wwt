import { db } from '../db/database.js';

interface DealRegRow {
  id: number;
  vendor: string;
  customer: string;
  deal_reg_number: string;
  project: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface DealReg {
  id: number;
  vendor: string;
  customer: string;
  deal_reg_number: string;
  project: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface DealRegInput {
  vendor?: string | null;
  customer?: string | null;
  deal_reg_number?: string | null;
  project?: string | null;
  notes?: string | null;
}

const listStmt = db.prepare<[], DealRegRow>(
  `SELECT *
   FROM deal_regs
   ORDER BY updated_at DESC, id DESC`,
);

const getStmt = db.prepare<[number], DealRegRow>(
  'SELECT * FROM deal_regs WHERE id = ?',
);

const insertStmt = db.prepare<[string, string, string, string, string]>(
  `INSERT INTO deal_regs (vendor, customer, deal_reg_number, project, notes)
   VALUES (?, ?, ?, ?, ?)`,
);

const updateStmt = db.prepare<[string, string, string, string, string, number]>(
  `UPDATE deal_regs
      SET vendor = ?,
          customer = ?,
          deal_reg_number = ?,
          project = ?,
          notes = ?,
          updated_at = datetime('now')
    WHERE id = ?`,
);

const deleteStmt = db.prepare<[number]>('DELETE FROM deal_regs WHERE id = ?');

function clean(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function hydrate(row: DealRegRow): DealReg {
  return { ...row };
}

export const dealRegModel = {
  list: (): DealReg[] => listStmt.all().map(hydrate),

  get: (id: number): DealReg | undefined => {
    const row = getStmt.get(id);
    return row ? hydrate(row) : undefined;
  },

  create: (input: DealRegInput = {}): DealReg => {
    const result = insertStmt.run(
      clean(input.vendor),
      clean(input.customer),
      clean(input.deal_reg_number),
      clean(input.project),
      clean(input.notes),
    );
    const created = dealRegModel.get(Number(result.lastInsertRowid));
    if (!created) throw new Error('Failed to create deal registration');
    return created;
  },

  update: (id: number, input: DealRegInput): DealReg | undefined => {
    const existing = dealRegModel.get(id);
    if (!existing) return undefined;
    updateStmt.run(
      clean(input.vendor ?? existing.vendor),
      clean(input.customer ?? existing.customer),
      clean(input.deal_reg_number ?? existing.deal_reg_number),
      clean(input.project ?? existing.project),
      clean(input.notes ?? existing.notes),
      id,
    );
    return dealRegModel.get(id);
  },

  delete: (id: number): boolean => deleteStmt.run(id).changes > 0,
};
