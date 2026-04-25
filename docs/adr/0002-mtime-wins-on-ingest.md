# ADR-0002: mtime-wins conflict resolution for WorkVault ingest

**Status**: Accepted
**Date**: 2026-04-25

---

## Context

Phase 2 will ingest the user's existing note archive from:
`C:\Users\schmichr\OneDrive - WWT\Documents\redqueen\WorkVault`

These files are markdown, externally editable on OneDrive. MasterControl will
also write new notes as markdown files to OneDrive paths and index them in the
DB — the file is the source of truth, the DB row is an index. This creates
three conflict scenarios:

1. A note is edited externally (OneDrive sync, mobile, another editor) while
   the DB has a stale copy.
2. MasterControl writes a note to disk; OneDrive sync produces a conflict copy
   (`filename (conflict copy date).md`).
3. The DB is cleared and re-seeded from disk (Phase 1 → Phase 2 cutover).

Single-user: simultaneous edits by two actors on the same file at the same
instant are essentially impossible in practice.

**Option A — Explicit conflict UI**
Surface a diff view when `mtime` on disk differs from the DB's last-known
`mtime`. User resolves manually.

Expensive to build. The user's editing patterns (one machine, OneDrive sync
latency) make real conflicts rare enough that a conflict UI would almost never
appear, but the machinery must be written and maintained regardless.

**Option B — Last-write-wins (silent)**
Whichever version was written most recently wins, with no signal to the user.

Simple, but risks silent data loss if the wrong version wins without the user
noticing.

**Option C — mtime-wins** (chosen)
On every open / focus / background scan, re-read any file whose disk `mtime` is
newer than the DB's stored `mtime`. The DB row is updated silently. No conflict
UI. OneDrive conflict copies (different filenames) are left alone — they show
up as new files and are ingested separately, linked to the original via
`notes.conflict_of_note_id` (R-023, Phase 2).

**Option D — Content-hash three-way merge**
Hash both the DB content and the file content; if they diverge, attempt a
three-way merge using the last-common-ancestor hash.

Correct in theory; overkill for a single-user local app with a rare conflict
pattern. Content-hash columns (`content_sha256`) are planned (R-023) but for
conflict detection, not for merging.

---

## Decision

**mtime-wins.** On scan or open, if `disk mtime > notes.file_mtime`, re-read
and update the DB row. The `file_mtime` column is updated to the new value.
OneDrive conflict copies are ingested as separate notes linked via
`conflict_of_note_id`. No merge, no conflict UI.

---

## Consequences

**Simpler now**
- No conflict resolution UI to build or maintain.
- Ingest scanner is a single loop: stat each file, compare mtime, update if
  newer. Idempotent; safe to re-run.
- Works correctly for the actual editing pattern: one user, one primary machine,
  OneDrive sync running in the background.

**Risks and mitigations**
- Relies on filesystem mtime accuracy. OneDrive sync preserves mtime on
  download; NTFS mtime is reliable. Risk is low but real on some network
  shares or cross-OS sync.
- If the OS clock is adjusted backwards between writes, the newer version could
  lose. Accepted for a local personal tool.

**What this defers to Phase 2**
- `notes.content_sha256` and `notes.last_seen_at` columns (R-023) are required
  before the ingest scanner runs against real user data. Without them,
  disappearing files (moved, renamed) would silently leave orphan DB rows
  instead of getting tombstoned.
- `notes.conflict_of_note_id FK` links OneDrive conflict copies to their origin.
- `notes.deleted_at` soft-delete column tombstones rows whose source file has
  disappeared.

The ingest scanner must not run against real WorkVault data until R-023 columns
are in place. Phase 1 stores notes as DB rows only; file-backed storage begins
with the Phase 2 ingest.
