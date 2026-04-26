/**
 * ingestSource.model.test.ts
 *
 * Tests for getOrCreate idempotency, updateLastScanAt, and
 * recordError + listErrors.
 */

import { describe, it, expect } from 'vitest';
import { ingestSourceModel } from './ingestSource.model.js';

// ---------------------------------------------------------------------------
// getOrCreate — idempotency
// ---------------------------------------------------------------------------

describe('ingestSourceModel.getOrCreate', () => {
  it('creates a new row on first call', () => {
    const src = ingestSourceModel.getOrCreate('/tmp/vault-a', 'workvault');
    expect(src.id).toBeTypeOf('number');
    expect(src.root_path).toBe('/tmp/vault-a');
    expect(src.kind).toBe('workvault');
    expect(src.last_scan_at).toBeNull();
  });

  it('returns the same row on a second call with the same args (idempotent)', () => {
    const a = ingestSourceModel.getOrCreate('/tmp/vault-b', 'workvault');
    const b = ingestSourceModel.getOrCreate('/tmp/vault-b', 'workvault');
    expect(a.id).toBe(b.id);
  });

  it('creates distinct rows for different (rootPath, kind) pairs', () => {
    const x = ingestSourceModel.getOrCreate('/tmp/vault-c', 'workvault');
    const y = ingestSourceModel.getOrCreate('/tmp/vault-c', 'onedrive');
    expect(x.id).not.toBe(y.id);
  });

  it('creates distinct rows for different root paths of the same kind', () => {
    const p = ingestSourceModel.getOrCreate('/tmp/p1', 'workvault');
    const q = ingestSourceModel.getOrCreate('/tmp/p2', 'workvault');
    expect(p.id).not.toBe(q.id);
  });
});

// ---------------------------------------------------------------------------
// updateLastScanAt
// ---------------------------------------------------------------------------

describe('ingestSourceModel.updateLastScanAt', () => {
  it('sets last_scan_at and the value round-trips', () => {
    const src = ingestSourceModel.getOrCreate('/tmp/scan-ts', 'workvault');
    expect(src.last_scan_at).toBeNull();

    const ts = new Date().toISOString();
    ingestSourceModel.updateLastScanAt(src.id, ts);

    const refreshed = ingestSourceModel.get(src.id);
    expect(refreshed).toBeDefined();
    expect(refreshed!.last_scan_at).toBe(ts);
  });

  it('can be called multiple times (overwrites previous value)', () => {
    const src = ingestSourceModel.getOrCreate('/tmp/scan-ts2', 'workvault');
    const first = '2024-01-01T00:00:00.000Z';
    const second = '2025-06-01T12:00:00.000Z';

    ingestSourceModel.updateLastScanAt(src.id, first);
    ingestSourceModel.updateLastScanAt(src.id, second);

    const refreshed = ingestSourceModel.get(src.id);
    expect(refreshed!.last_scan_at).toBe(second);
  });
});

// ---------------------------------------------------------------------------
// recordError + listErrors
// ---------------------------------------------------------------------------

describe('ingestSourceModel.recordError and listErrors', () => {
  it('records an error row and listErrors returns it', () => {
    const src = ingestSourceModel.getOrCreate('/tmp/err-vault', 'workvault');
    const err = ingestSourceModel.recordError(src.id, '/tmp/err-vault/note.md', 'read failed');

    expect(err.id).toBeTypeOf('number');
    expect(err.source_id).toBe(src.id);
    expect(err.path).toBe('/tmp/err-vault/note.md');
    expect(err.error).toBe('read failed');

    const errors = ingestSourceModel.listErrors(src.id, 20);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.id === err.id)).toBe(true);
  });

  it('listErrors respects the limit parameter', () => {
    const src = ingestSourceModel.getOrCreate('/tmp/limit-vault', 'workvault');

    for (let i = 0; i < 5; i++) {
      ingestSourceModel.recordError(src.id, `/tmp/limit-vault/note-${i}.md`, `error ${i}`);
    }

    const limited = ingestSourceModel.listErrors(src.id, 3);
    expect(limited.length).toBeLessThanOrEqual(3);
  });

  it('listErrors returns newest first (DESC by occurred_at)', () => {
    const src = ingestSourceModel.getOrCreate('/tmp/order-vault', 'workvault');

    ingestSourceModel.recordError(src.id, '/tmp/order-vault/a.md', 'first error');
    ingestSourceModel.recordError(src.id, '/tmp/order-vault/b.md', 'second error');

    const errors = ingestSourceModel.listErrors(src.id, 20);
    // At least 2 rows; the most recent should be "second error".
    const relevant = errors.filter(
      (e) => e.path === '/tmp/order-vault/a.md' || e.path === '/tmp/order-vault/b.md',
    );
    expect(relevant.length).toBe(2);
    // Newest first — "second error" (b.md) appears before "first error" (a.md)
    // since they are inserted in sequence and ordered by occurred_at DESC.
    expect(relevant[0].path).toBe('/tmp/order-vault/b.md');
    expect(relevant[1].path).toBe('/tmp/order-vault/a.md');
  });

  it('listErrors returns empty array when no errors exist for that source', () => {
    const src = ingestSourceModel.getOrCreate('/tmp/no-errors-vault', 'workvault');
    const errors = ingestSourceModel.listErrors(src.id, 20);
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('ingestSourceModel.list', () => {
  it('returns all sources (at least those created in this test)', () => {
    ingestSourceModel.getOrCreate('/tmp/list-vault-1', 'workvault');
    ingestSourceModel.getOrCreate('/tmp/list-vault-2', 'oem_docs');

    const all = ingestSourceModel.list();
    const paths = all.map((s) => s.root_path);
    expect(paths).toContain('/tmp/list-vault-1');
    expect(paths).toContain('/tmp/list-vault-2');
  });
});
