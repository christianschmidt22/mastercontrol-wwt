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
import {
  extractOrgMentions,
  extractPrimaryOrgAndMentions,
} from './claude.service.js';
import type { Organization } from '../models/organization.model.js';

/** Confidence threshold below which a mention is discarded. */
const CONFIDENCE_THRESHOLD = 0.5;

export interface ExtractedOrgMention {
  org: Organization;
  confidence: number;
}

export interface ExtractedPrimaryOrgAndMentions {
  primary: ExtractedOrgMention | null;
  mentions: ExtractedOrgMention[];
}

/**
 * Cache of all org names for the current scan session. Populated once per
 * call to `loadOrgs()` and invalidated by reassigning the module-level var.
 * This avoids a DB round-trip per file during a scan.
 *
 * Note: module-level cache is safe because better-sqlite3 is synchronous and
 * `ingest.service.ts` calls extraction sequentially (no concurrency).
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
  // Load all org types. Mentions can target both customers and OEMs.
  const customers = organizationModel.listByType('customer');
  const oems = organizationModel.listByType('oem');
  _orgCache = [...customers, ...oems];
  return _orgCache;
}

function resolveMentionCandidates(
  orgs: Organization[],
  mentions: Array<{ name: string; confidence: number }>,
): ExtractedOrgMention[] {
  const candidates: ExtractedOrgMention[] = [];
  const seen = new Set<number>();

  for (const { name, confidence } of mentions) {
    if (confidence < CONFIDENCE_THRESHOLD) continue;

    const org = orgs.find((o) => o.name.toLowerCase() === name.toLowerCase());
    if (!org || seen.has(org.id)) continue;
    seen.add(org.id);

    candidates.push({ org, confidence });
  }

  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.org.name.localeCompare(b.org.name);
  });

  return candidates;
}

export async function extractMentionCandidates(content: string): Promise<ExtractedOrgMention[]> {
  const orgs = loadOrgs();
  if (orgs.length === 0) return [];

  const candidateNames = orgs.map((o) => o.name);
  const mentions = await extractOrgMentions(content, candidateNames);
  return resolveMentionCandidates(orgs, mentions);
}

export async function extractPrimaryOrgCandidates(
  content: string,
): Promise<ExtractedPrimaryOrgAndMentions> {
  const orgs = loadOrgs();
  if (orgs.length === 0) return { primary: null, mentions: [] };

  const candidateNames = orgs.map((o) => o.name);
  const extracted = await extractPrimaryOrgAndMentions(content, candidateNames);
  const primary =
    extracted.primary_org_name !== null &&
    (extracted.primary_confidence ?? 0) >= CONFIDENCE_THRESHOLD
      ? orgs.find(
          (org) => org.name.toLowerCase() === extracted.primary_org_name!.toLowerCase(),
        ) ?? null
      : null;

  return {
    primary:
      primary === null
        ? null
        : {
            org: primary,
            confidence: extracted.primary_confidence ?? 1,
          },
    mentions: resolveMentionCandidates(orgs, extracted.mentions),
  };
}

export function upsertMentionCandidates(
  noteId: number,
  candidates: ExtractedOrgMention[],
): void {
  for (const { org, confidence } of candidates) {
    noteMentionModel.upsert({
      note_id: noteId,
      mentioned_org_id: org.id,
      source: 'ai_auto',
      confidence,
    });
  }
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
  const candidates = await extractMentionCandidates(content);
  noteMentionModel.deleteByNoteAndSource(noteId, 'ai_auto');
  upsertMentionCandidates(noteId, candidates);
}
