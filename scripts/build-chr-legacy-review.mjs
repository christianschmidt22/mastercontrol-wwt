import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const WORKVAULT_ROOT = 'C:\\Users\\schmichr\\OneDrive - WWT\\Documents\\redqueen\\WorkVault';
const CHR_VAULT_ROOT = 'C:\\Users\\schmichr\\OneDrive - WWT\\Documents\\mastercontrol\\customers\\chr';
const OUTPUT_DIR = path.join(CHR_VAULT_ROOT, '_agent', 'legacy-import');
const LEDGER_PATH = path.join(OUTPUT_DIR, 'legacy-chr-review-ledger.json');

const INCLUDE_EXTENSIONS = new Set(['.md', '.txt', '.json']);
const USER_CONFIRMED_RULES = [
  {
    rule: 'source_precedence',
    decision: 'MasterControl notes and structured records win by default when they conflict with legacy RedQueen WorkVault notes.',
  },
  {
    rule: 'mvc_target',
    decision: 'Current MVC target score is 90 by October 2026, replacing older legacy references to target 80.',
  },
  {
    rule: 'budget_context',
    decision: 'The $22-24M budget reference is probably Cory Degerstrom budget context and should be treated as unverified until sourced better.',
  },
  {
    rule: 'cohesity_renewal',
    decision: 'User believes Cohesity renewal is June 26; legacy 2025 renewal dates should be treated as stale unless better evidence is found.',
  },
  {
    rule: 'contact_merge',
    decision: 'Use legacy CHR contacts to fill holes in existing MasterControl contacts. Do not overwrite populated current fields by default.',
  },
  {
    rule: 'technical_deep_dives',
    decision: 'Track technical deep dives separately and leave pointer notes from the CHR account summary instead of stuffing them into the main account note.',
  },
];
const MATCHERS = [
  { label: 'C.H. Robinson', regex: /\bC\.?\s*H\.?\s*Robinson\b/i },
  { label: 'CH Robinson', regex: /\bCH\s*Robinson\b/i },
  { label: 'CH-Robinson', regex: /\bCH[-_ ]Robinson\b/i },
  { label: 'CHRobinson', regex: /\bCHRobinson\b/i },
  { label: 'CHR account token', regex: /(^|[^A-Za-z0-9])CHR([^A-Za-z0-9]|$)/i },
  { label: 'Robinson', regex: /\bRobinson\b/i },
  { label: 'Cory Degerstrom', regex: /\bCory\s+Degerstrom\b/i },
  { label: 'Degerstrom', regex: /\bDegerstrom\b/i },
  { label: 'Mike Sebourn', regex: /\bMike\s+Sebourn\b/i },
  { label: 'Sebourn', regex: /\bSebourn\b/i },
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.obsidian' || entry.name === '.trash') continue;
      files.push(...walk(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!INCLUDE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    files.push(fullPath);
  }
  return files;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hasPathSignal(filePath) {
  return MATCHERS.some((matcher) => matcher.regex.test(filePath));
}

function matchedTerms(content, filePath) {
  const haystack = `${filePath}\n${content}`;
  return MATCHERS.filter((matcher) => matcher.regex.test(haystack)).map((matcher) => matcher.label);
}

function matchedLines(content) {
  const lines = content.split(/\r?\n/);
  const matches = [];
  lines.forEach((line, index) => {
    if (MATCHERS.some((matcher) => matcher.regex.test(line))) {
      matches.push({
        line_number: index + 1,
        text: line.trim().slice(0, 240),
      });
    }
  });
  return matches.slice(0, 10);
}

function parseDate(filePath) {
  const name = path.basename(filePath);
  const match = /(\d{4})-(\d{2})-(\d{2})/.exec(name);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function classify(filePath) {
  const relative = path.relative(WORKVAULT_ROOT, filePath);
  const parts = relative.split(path.sep);
  if (parts[0] === '02-Customers' && parts[1] === 'CH-Robinson') return 'customer-folder';
  if (parts[0] === '00-Inbox') return 'processed-inbox';
  if (parts[0] === '04-Notes') return 'dated-note';
  if (parts[0] === '05-Reports') return 'report';
  if (parts[0] === '05-Weekly-Reviews') return 'weekly-review';
  if (parts[0] === '_claude') return 'legacy-claude-memory';
  return parts[0] ?? 'other';
}

function candidateRecords() {
  const existingByHash = readExistingLedgerReviewState();
  return walk(WORKVAULT_ROOT)
    .map((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      const terms = matchedTerms(content, filePath);
      if (terms.length === 0 && !hasPathSignal(filePath)) return null;
      const stat = fs.statSync(filePath);
      const hash = sha256(content);
      const preserved = existingByHash.get(hash);
      return {
        id: `legacy-chr-${hash.slice(0, 12)}`,
        status: preserved?.status ?? 'unreviewed',
        read_at: preserved?.read_at ?? null,
        read_summary: preserved?.read_summary ?? null,
        questions_for_user: preserved?.questions_for_user ?? [],
        disposition: preserved?.disposition ?? null,
        disposition_reason: preserved?.disposition_reason ?? null,
        imported_note_id: preserved?.imported_note_id ?? null,
        reviewed_at: preserved?.reviewed_at ?? null,
        reviewed_by: preserved?.reviewed_by ?? null,
        bucket: classify(filePath),
        source_path: filePath,
        relative_path: path.relative(WORKVAULT_ROOT, filePath),
        title: path.basename(filePath, path.extname(filePath)),
        date_hint: parseDate(filePath),
        bytes: stat.size,
        modified_at: stat.mtime.toISOString(),
        sha256: hash,
        match_terms: [...new Set(terms)],
        matched_lines: matchedLines(content),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const dateA = a.date_hint ?? '9999-99-99';
      const dateB = b.date_hint ?? '9999-99-99';
      return dateA.localeCompare(dateB) || a.relative_path.localeCompare(b.relative_path);
    });
}

function readExistingLedgerReviewState() {
  if (!fs.existsSync(LEDGER_PATH)) return new Map();
  try {
    const existing = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    return new Map(
      (existing.records ?? [])
        .filter((record) => typeof record.sha256 === 'string')
        .map((record) => [record.sha256, {
          status: record.status,
          read_at: record.read_at,
          read_summary: record.read_summary,
          questions_for_user: Array.isArray(record.questions_for_user) ? record.questions_for_user : [],
          disposition: record.disposition,
          disposition_reason: record.disposition_reason,
          imported_note_id: record.imported_note_id,
          reviewed_at: record.reviewed_at,
          reviewed_by: record.reviewed_by,
        }]),
    );
  } catch {
    return new Map();
  }
}

function rulesMarkdown() {
  return USER_CONFIRMED_RULES
    .map((rule) => `- ${rule.rule}: ${rule.decision}`)
    .join('\n');
}

function reviewQueueMarkdown(records) {
  const byBucket = records.reduce((acc, record) => {
    acc.set(record.bucket, [...(acc.get(record.bucket) ?? []), record]);
    return acc;
  }, new Map());
  const bucketLines = [...byBucket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, bucketRecords]) => `- ${bucket}: ${bucketRecords.length}`)
    .join('\n');

  const rows = records
    .map((record) => {
      const evidence = record.matched_lines
        .slice(0, 3)
        .map((line) => `  - L${line.line_number}: ${line.text}`)
        .join('\n') || '  - Path-only match';
      return [
        `## ${record.title}`,
        '',
        `- ID: ${record.id}`,
        `- Status: ${record.status}`,
        `- Bucket: ${record.bucket}`,
        `- Date hint: ${record.date_hint ?? 'unknown'}`,
        `- Source: ${record.relative_path}`,
        `- Matched terms: ${record.match_terms.join(', ') || 'path signal'}`,
        '- Evidence:',
        evidence,
        '',
        'Decision:',
        '- [ ] Transfer into CHR master note',
        '- [ ] Import as source note only',
        '- [ ] Create/update task, question, contact, or project',
        '- [ ] Ignore as stale/noise',
        '',
        'Reviewer notes:',
        '',
      ].join('\n');
    })
    .join('\n---\n\n');

  return [
    '# CHR Legacy WorkVault Review Queue',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Source root: ${WORKVAULT_ROOT}`,
    `Candidate files: ${records.length}`,
    '',
    '## Buckets',
    '',
    bucketLines,
    '',
    '## Review Protocol',
    '',
    '### User Confirmed Migration Rules',
    '',
    rulesMarkdown(),
    '',
    'For each source, decide whether it is still true/relevant. Only validated knowledge should be promoted into CHR master notes, contacts, tasks, questions, projects, or documents. Leave stale, duplicate, or low-confidence material marked as ignored with a reason in the ledger.',
    '',
    rows,
    '',
  ].join('\n');
}

function masterNoteWorkingMarkdown(records) {
  return [
    '# CHR Legacy Import Working Master Note',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'This is the staging area for validated CHR knowledge from the RedQueen WorkVault. It should remain separate from `master-notes.md` until facts have been confirmed or explicitly accepted as historical context.',
    '',
    '## Source Coverage',
    '',
    `- Candidate files inventoried: ${records.length}`,
    '- Status: no source has been promoted yet',
    '',
    '## Migration Rules',
    '',
    rulesMarkdown(),
    '',
    '## Validated Account Facts',
    '',
    '- Current MVC target score is 90 by October 2026. Older legacy references to target 80 are stale.',
    '- Budget reference "$22-24M / 65% people" is unverified and may be Cory budget context.',
    '- Cohesity renewal is believed to be June 26, pending better evidence.',
    '- Current MasterControl notes and structured records win by default over conflicting legacy notes.',
    '',
    '## Current Projects And Motions',
    '',
    '_Nothing promoted yet._',
    '',
    '## People And Preferences',
    '',
    '_Nothing promoted yet._',
    '',
    '## Open Questions For Ryan',
    '',
    '_Questions will be added as sources are reviewed._',
    '',
    '## Ignored Or Stale Themes',
    '',
    '- Legacy 2025 Cohesity renewal/expiration dates are stale unless a newer source confirms relevance.',
    '',
  ].join('\n');
}

function technicalDeepDiveMarkdown(records) {
  const technicalNeedles = /\b(Hydra|Cilium|BGP|Kubernetes|K8s|Rancher|OpenShift|SAN|Brocade|PowerScale|VCF|Aria|Cohesity|PPBS|Azure|Entra|KeyVault)\b/i;
  const technicalRecords = records.filter((record) => {
    const haystack = [
      record.title,
      record.relative_path,
      ...record.matched_lines.map((line) => line.text),
    ].join('\n');
    return technicalNeedles.test(haystack);
  });

  const rows = technicalRecords
    .map((record) => [
      `## ${record.title}`,
      '',
      `- ID: ${record.id}`,
      `- Status: ${record.status}`,
      `- Date hint: ${record.date_hint ?? 'unknown'}`,
      `- Source: ${record.relative_path}`,
      '- Account-note handling: leave a short pointer in CHR account memory; keep details in a project/technical reference.',
      '',
      'Evidence:',
      ...(record.matched_lines.slice(0, 5).map((line) => `- L${line.line_number}: ${line.text}`)),
      '',
    ].join('\n'))
    .join('\n---\n\n');

  return [
    '# CHR Legacy Technical Deep Dives',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Technical details from the legacy vault should be tracked separately from the main CHR account summary. The account note should carry only a pointer and the business reason the topic matters.',
    '',
    `Candidate technical sources: ${technicalRecords.length}`,
    '',
    rows || '_No technical deep-dive candidates found._',
    '',
  ].join('\n');
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const records = candidateRecords();
const ledger = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source_root: WORKVAULT_ROOT,
  target_org: 'C.H. Robinson',
  target_vault_root: CHR_VAULT_ROOT,
  user_confirmed_rules: USER_CONFIRMED_RULES,
  status_values: ['unreviewed', 'transferred', 'imported_source_only', 'ignored', 'needs_user_review'],
  records,
};

fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
fs.writeFileSync(path.join(OUTPUT_DIR, 'legacy-chr-review-queue.md'), reviewQueueMarkdown(records), 'utf8');
fs.writeFileSync(path.join(OUTPUT_DIR, 'legacy-chr-master-note-working.md'), masterNoteWorkingMarkdown(records), 'utf8');
fs.writeFileSync(path.join(OUTPUT_DIR, 'legacy-chr-technical-deep-dives.md'), technicalDeepDiveMarkdown(records), 'utf8');

console.log(JSON.stringify({
  output_dir: OUTPUT_DIR,
  candidate_files: records.length,
  files: [
    LEDGER_PATH,
    path.join(OUTPUT_DIR, 'legacy-chr-review-queue.md'),
    path.join(OUTPUT_DIR, 'legacy-chr-master-note-working.md'),
    path.join(OUTPUT_DIR, 'legacy-chr-technical-deep-dives.md'),
  ],
}, null, 2));
