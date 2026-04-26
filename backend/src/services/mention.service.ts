/**
 * mention.service.ts
 *
 * Cross-org mention extraction for WorkVault notes.
 *
 * Anthropic SDK calls must remain in claude.service.ts (layer rule). This
 * module imports `extractOrgMentions` from claude.service.ts rather than
 * calling the SDK directly.
 *
 * R-021: The extraction call sets `tools: []` (enforced inside
 *        extractOrgMentions in claude.service.ts).
 * R-026: Note content is wrapped in <untrusted_document> tags inside
 *        extractOrgMentions.
 */

import { noteMentionModel } from '../models/noteMention.model.js';
import { organizationModel } from '../models/organization.model.js';
import { extractOrgMentions } from './claude.service.js';
import type { Organization } from '../models/organization.model.js';

/** Confidence threshold below which a mention is discarded. */
const CONFIDENCE_THRESHOLD = 0.5;

/**
 * Cache of all org names for the current scan session. Populated once per
 * call to `loadOrgs()` and invalidated by reassigning the module-level var.
 * This avoids a DB round-trip per file during a scan.
 *
 * Note: module-level cache is safe because better-sqlite3 is synchronous and
 * `ingest.service.ts` calls `extractMentions` sequentially (no concurrency).
 */
let _orgCache: Organization[] | null = null;

/**
 * Clear the per-scan org name cache. Call this at the start of each scan
 * so that org additions since the last scan are picked up.
 */
export function clearOrgCache(): void {
  _orgCache = null;
}

function loadOrgs(): Organization[] {
  if (_orgCache !== null) return _orgCache;
  // Load all org types — mentions can target both customers and OEMs.
  const customers = organizationModel.listByType('customer');
  const oems = organizationModel.listByType('oem');
  _orgCache = [...customers, ...oems];
  return _orgCache;
}

/**
 * Extract organization mentions from a note's content and upsert them into
 * `note_mentions` with `source='ai_auto'`.
 *
 * - Loads org names once per scan (cached).
 * - Calls the Anthropic mention extractor (non-streaming, `tools: []`).
 * - Filters out candidates with confidence < 0.5.
 * - Upserts surviving rows so re-scans upgrade confidence scores.
 *
 * Errors from the Anthropic call are surfaced to the caller (ingest.service
 * logs them to ingest_errors and continues).
 */
export async function extractMentions(noteId: number, content: string): Promise<void> {
  const orgs = loadOrgs();
  if (orgs.length === 0) return; // no orgs to match — skip API call

  const candidateNames = orgs.map((o) => o.name);
  const mentions = await extractOrgMentions(content, candidateNames);

  for (const { name, confidence } of mentions) {
    if (confidence < CONFIDENCE_THRESHOLD) continue;

    const org = orgs.find((o) => o.name.toLowerCase() === name.toLowerCase());
    if (!org) continue;

    noteMentionModel.upsert({
      note_id: noteId,
      mentioned_org_id: org.id,
      source: 'ai_auto',
      confidence,
    });
  }
}
