/**
 * safePath.test.ts  — R-024 prep
 *
 * Tests for resolveSafePath and enforceSizeLimit.
 * All fs calls are mocked so no real files are required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Mock the `node:fs` module before importing the module under test.
// ---------------------------------------------------------------------------
vi.mock('node:fs');

import * as fs from 'node:fs';
import { resolveSafePath, enforceSizeLimit } from './safePath.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = path.resolve('/vault');
const SEP = path.sep;

/** Make realpathSync return the provided resolved path. */
function mockRealpath(resolvedTo: string) {
  vi.mocked(fs.realpathSync).mockReturnValue(resolvedTo);
}

/** Make lstatSync return a non-symlink for all checked paths. */
function mockLstatNotSymlink() {
  vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => false } as fs.Stats);
}

/** Make lstatSync claim the provided path is a symlink. */
function mockLstatSymlinkAt(symlinkPath: string) {
  vi.mocked(fs.lstatSync).mockImplementation((p: fs.PathLike): fs.Stats => {
    const pStr = p.toString();
    if (pStr === symlinkPath || path.normalize(pStr) === path.normalize(symlinkPath)) {
      return { isSymbolicLink: () => true } as fs.Stats;
    }
    return { isSymbolicLink: () => false } as fs.Stats;
  });
}

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('resolveSafePath — happy path', () => {
  it('returns the normalised absolute path when file is inside root', () => {
    const file = 'notes' + SEP + 'file.md';
    const expected = path.normalize(ROOT + SEP + file);

    mockRealpath(expected);
    mockLstatNotSymlink();

    const result = resolveSafePath(file, ROOT);
    expect(result).toBe(expected);
  });

  it('accepts .txt and .pdf extensions in addition to .md', () => {
    for (const ext of ['.txt', '.pdf']) {
      vi.clearAllMocks();
      const expected = path.normalize(ROOT + SEP + `doc${ext}`);
      mockRealpath(expected);
      mockLstatNotSymlink();
      expect(() => resolveSafePath(`doc${ext}`, ROOT)).not.toThrow();
    }
  });

  it('allows custom extension allowlist', () => {
    const expected = path.normalize(ROOT + SEP + 'report.csv');
    mockRealpath(expected);
    mockLstatNotSymlink();
    expect(() =>
      resolveSafePath('report.csv', ROOT, { allowedExtensions: ['.csv'] })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Path traversal
// ---------------------------------------------------------------------------

describe('resolveSafePath — traversal rejection', () => {
  it('rejects a classic ../ traversal that escapes root', () => {
    // input: ../../etc/passwd  →  candidate resolves outside /vault
    const escaped = path.normalize('/etc/passwd');
    mockRealpath(escaped);
    mockLstatNotSymlink();

    expect(() => resolveSafePath('../../etc/passwd', ROOT)).toThrow(
      /safe-path-rejected: resolved path escapes root/,
    );
  });

  it('rejects root/../root/file.md style traversal (still escapes momentarily)', () => {
    // path.resolve(root, root + '/../vault/file.md') would produce root/file.md
    // but the traversal path itself should be rejected because realpathSync
    // resolves the actual file system path; we simulate the resolved path
    // landing inside root but via an external symlink
    const escaped = path.normalize('/other/file.md');
    mockRealpath(escaped);
    mockLstatNotSymlink();

    expect(() => resolveSafePath('../vault/file.md', ROOT)).toThrow(
      /safe-path-rejected/,
    );
  });

  it('rejects when candidate resolves to root itself (not a strict descendant)', () => {
    // realpathSync returns root exactly — no trailing sep, so startsWith check fails
    mockRealpath(ROOT);
    mockLstatNotSymlink();

    expect(() => resolveSafePath('.', ROOT)).toThrow(/safe-path-rejected/);
  });
});

// ---------------------------------------------------------------------------
// Extension allowlist
// ---------------------------------------------------------------------------

describe('resolveSafePath — extension rejection', () => {
  it('rejects .exe files', () => {
    const resolved = path.normalize(ROOT + SEP + 'malware.exe');
    mockRealpath(resolved);
    mockLstatNotSymlink();

    expect(() => resolveSafePath('malware.exe', ROOT)).toThrow(
      /safe-path-rejected: extension '.exe' not in allowlist/,
    );
  });

  it('rejects files with no extension', () => {
    const resolved = path.normalize(ROOT + SEP + 'no-extension');
    mockRealpath(resolved);
    mockLstatNotSymlink();

    expect(() => resolveSafePath('no-extension', ROOT)).toThrow(
      /safe-path-rejected: extension '' not in allowlist/,
    );
  });

  it('rejects .js even with a .md prefix in the name', () => {
    const resolved = path.normalize(ROOT + SEP + 'README.md.js');
    mockRealpath(resolved);
    mockLstatNotSymlink();

    expect(() => resolveSafePath('README.md.js', ROOT)).toThrow(
      /safe-path-rejected: extension '.js' not in allowlist/,
    );
  });
});

// ---------------------------------------------------------------------------
// Symlink in ancestry chain
// ---------------------------------------------------------------------------

describe('resolveSafePath — symlink in ancestry chain', () => {
  it('rejects when an intermediate directory is a symlink', () => {
    // e.g. /vault/link-dir is a symlink, but realpathSync resolves past it
    const resolved = path.normalize(ROOT + SEP + 'link-dir' + SEP + 'file.md');
    mockRealpath(resolved);

    // Make the parent directory appear as a symlink
    const symlinkDir = path.normalize(ROOT + SEP + 'link-dir');
    mockLstatSymlinkAt(symlinkDir);

    expect(() => resolveSafePath('link-dir/file.md', ROOT)).toThrow(
      /safe-path-rejected: symlink found in ancestry chain/,
    );
  });

  it('rejects when the file itself is a symlink', () => {
    const resolved = path.normalize(ROOT + SEP + 'file.md');
    mockRealpath(resolved);

    // Make the file itself appear as a symlink
    mockLstatSymlinkAt(resolved);

    expect(() => resolveSafePath('file.md', ROOT)).toThrow(
      /safe-path-rejected: symlink found in ancestry chain/,
    );
  });
});

// ---------------------------------------------------------------------------
// ENOENT propagation
// ---------------------------------------------------------------------------

describe('resolveSafePath — file not found', () => {
  it('throws safe-path-rejected when realpathSync throws ENOENT', () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    vi.mocked(fs.realpathSync).mockImplementation(() => {
      throw err;
    });

    expect(() => resolveSafePath('ghost.md', ROOT)).toThrow(
      /safe-path-rejected: file does not exist/,
    );
  });
});

// ---------------------------------------------------------------------------
// enforceSizeLimit
// ---------------------------------------------------------------------------

describe('enforceSizeLimit', () => {
  const ABS_PATH = path.normalize(ROOT + SEP + 'file.md');

  it('does not throw when file is exactly at the cap', () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 1_048_576 } as fs.Stats);
    expect(() => enforceSizeLimit(ABS_PATH, 1_048_576)).not.toThrow();
  });

  it('does not throw when file is under the cap', () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as fs.Stats);
    expect(() => enforceSizeLimit(ABS_PATH)).not.toThrow();
  });

  it('throws when file exceeds the cap', () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 2_000_000 } as fs.Stats);
    expect(() => enforceSizeLimit(ABS_PATH, 1_048_576)).toThrow(
      /safe-path-rejected: file size 2000000 bytes exceeds limit/,
    );
  });

  it('throws when file exceeds a custom cap', () => {
    vi.mocked(fs.statSync).mockReturnValue({ size: 501 } as fs.Stats);
    expect(() => enforceSizeLimit(ABS_PATH, 500)).toThrow(
      /safe-path-rejected: file size 501 bytes exceeds limit of 500 bytes/,
    );
  });
});
