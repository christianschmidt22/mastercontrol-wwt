import { db } from '../db/database.js';

export const STANDARD_BOM_PREFERENCE_LABELS = [
  'Support type',
  'Support term',
  'Optics for switch included',
  'Optics for server included',
  'Bezel',
  'Rail types',
  'Cable management',
] as const;

const STANDARD_LABEL_SET = new Set<string>(STANDARD_BOM_PREFERENCE_LABELS);

interface CustomerBomPreferenceRow {
  id: number;
  organization_id: number;
  label: string;
  value: string;
  is_standard: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerBomPreference {
  id: number | null;
  organization_id: number;
  label: string;
  value: string;
  is_standard: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface CustomerBomPreferenceInput {
  label: string;
  value?: string | null;
  is_standard?: boolean;
  sort_order?: number;
}

const listForOrgStmt = db.prepare<[number], CustomerBomPreferenceRow>(
  `SELECT *
   FROM customer_bom_preferences
   WHERE organization_id = ?
   ORDER BY sort_order ASC, id ASC`,
);

const deleteForOrgStmt = db.prepare<[number]>(
  'DELETE FROM customer_bom_preferences WHERE organization_id = ?',
);

const insertStmt = db.prepare<[number, string, string, number, number]>(
  `INSERT INTO customer_bom_preferences
     (organization_id, label, value, is_standard, sort_order)
   VALUES (?, ?, ?, ?, ?)`,
);

function hydrate(row: CustomerBomPreferenceRow): CustomerBomPreference {
  return {
    ...row,
    is_standard: row.is_standard === 1,
  };
}

function normalizeInput(input: CustomerBomPreferenceInput): CustomerBomPreferenceInput | null {
  const label = input.label.trim();
  if (!label) return null;
  return {
    label,
    value: input.value?.trim() ?? '',
    is_standard: STANDARD_LABEL_SET.has(label) || input.is_standard === true,
    sort_order: input.sort_order,
  };
}

function mergedWithStandardRows(
  orgId: number,
  rows: CustomerBomPreference[],
): CustomerBomPreference[] {
  const byLabel = new Map<string, CustomerBomPreference>();
  for (const row of rows) {
    if (!byLabel.has(row.label)) byLabel.set(row.label, row);
  }

  const standardRows = STANDARD_BOM_PREFERENCE_LABELS.map((label, index) => {
    const existing = byLabel.get(label);
    return {
      id: existing?.id ?? null,
      organization_id: orgId,
      label,
      value: existing?.value ?? '',
      is_standard: true,
      sort_order: index,
      created_at: existing?.created_at,
      updated_at: existing?.updated_at,
    };
  });

  const customRows = rows
    .filter((row) => !STANDARD_LABEL_SET.has(row.label))
    .map((row, index) => ({
      ...row,
      is_standard: false,
      sort_order: STANDARD_BOM_PREFERENCE_LABELS.length + index,
    }));

  return [...standardRows, ...customRows];
}

export const customerBomPreferenceModel = {
  listForOrg: (orgId: number): CustomerBomPreference[] =>
    mergedWithStandardRows(orgId, listForOrgStmt.all(orgId).map(hydrate)),

  replaceForOrg: (
    orgId: number,
    preferences: CustomerBomPreferenceInput[],
  ): CustomerBomPreference[] => {
    const normalized = preferences
      .map(normalizeInput)
      .filter((pref): pref is CustomerBomPreferenceInput => pref !== null);
    const byLabel = new Map<string, CustomerBomPreferenceInput>();
    for (const pref of normalized) {
      if (!byLabel.has(pref.label)) byLabel.set(pref.label, pref);
    }

    const ordered: CustomerBomPreferenceInput[] = [
      ...STANDARD_BOM_PREFERENCE_LABELS.map((label) => byLabel.get(label) ?? { label, value: '', is_standard: true }),
      ...normalized.filter((pref) => !STANDARD_LABEL_SET.has(pref.label)),
    ];

    db.transaction(() => {
      deleteForOrgStmt.run(orgId);
      ordered.forEach((pref, index) => {
        insertStmt.run(
          orgId,
          pref.label,
          pref.value?.trim() ?? '',
          STANDARD_LABEL_SET.has(pref.label) || pref.is_standard === true ? 1 : 0,
          index,
        );
      });
    })();

    return customerBomPreferenceModel.listForOrg(orgId);
  },
};
