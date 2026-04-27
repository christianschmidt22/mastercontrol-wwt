/**
 * subagentTools.service.test.ts
 *
 * Unit tests for the five coding tools in subagentTools.service.ts.
 * fs calls are mocked via vi.mock('node:fs') so no real filesystem access.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock node:fs BEFORE importing the module under test.
// ---------------------------------------------------------------------------
vi.mock('node:fs');

// Mock child_process for bash tests. The service uses promisify(execFile) so
// the mock must work with the real promisify: execFile will receive a callback
// as the LAST argument (added by promisify's wrapper). We provide a factory
// that creates a proper vi.fn() for execFile.
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import * as fs from 'node:fs';
import * as childProcess from 'node:child_process';
import * as path from 'node:path';
import {
  assertSafeRelPath,
  SUBAGENT_TOOLS,
  buildToolDefinitions,
  ALLOWED_TOOL_NAMES,
  type ToolContext,
} from './subagentTools.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WORK_DIR = path.normalize('/workspace');

const auditLog = vi.fn();

function makeCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    working_dir: WORK_DIR,
     
    audit: (entry) => auditLog(entry),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  auditLog.mockReset();
});

// ---------------------------------------------------------------------------
// assertSafeRelPath
// ---------------------------------------------------------------------------

describe('assertSafeRelPath', () => {
  it('returns absolute path for a safe relative input', () => {
    const result = assertSafeRelPath('src/index.ts', WORK_DIR);
    expect(result).toBe(path.join(WORK_DIR, 'src', 'index.ts'));
  });

  it('rejects absolute paths', () => {
    expect(() => assertSafeRelPath('/etc/passwd', WORK_DIR)).toThrow('absolute paths not allowed');
  });

  it('rejects .. traversal that escapes working_dir', () => {
    expect(() => assertSafeRelPath('../../etc/passwd', WORK_DIR)).toThrow('escapes working_dir');
  });

  it('allows paths with .. that stay inside working_dir', () => {
    const result = assertSafeRelPath('src/../README.md', WORK_DIR);
    expect(result).toBe(path.join(WORK_DIR, 'README.md'));
  });
});

// ---------------------------------------------------------------------------
// read_file
// ---------------------------------------------------------------------------

describe('SUBAGENT_TOOLS.read_file', () => {
  const tool = SUBAGENT_TOOLS.read_file;

  it('returns file contents on happy path', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false, size: 11 } as fs.Stats);
    // readFileSync returns string when encoding is specified — cast to satisfy mock
    vi.mocked(fs.readFileSync).mockReturnValue('hello world');

    const result = JSON.parse(await tool.handler({ path: 'hello.txt' }, makeCtx())) as Record<string, unknown>;
    expect(result['content']).toBe('hello world');
    expect(result['truncated']).toBe(false);
    expect(result['bytes']).toBe(11);
  });

  it('truncates files larger than 200 KB', async () => {
    const bigContent = 'x'.repeat(300 * 1024);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false, size: bigContent.length } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue(bigContent);

    const result = JSON.parse(await tool.handler({ path: 'big.txt' }, makeCtx())) as Record<string, unknown>;
    expect(result['truncated']).toBe(true);
    expect(String(result['content'])).toContain('[...file truncated at 200 KB...]');
    expect(Buffer.byteLength(String(result['content']), 'utf8')).toBeLessThan(210 * 1024);
  });

  it('returns error JSON when path traverses outside working_dir', async () => {
    const result = JSON.parse(await tool.handler({ path: '../../etc/passwd' }, makeCtx())) as Record<string, unknown>;
    expect(String(result['error'])).toMatch(/escapes working_dir/);
  });

  it('returns error JSON for absolute path input', async () => {
    const result = JSON.parse(await tool.handler({ path: '/etc/passwd' }, makeCtx())) as Record<string, unknown>;
    expect(String(result['error'])).toMatch(/absolute paths not allowed/);
  });

  it('returns error JSON when file not found', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = JSON.parse(await tool.handler({ path: 'missing.txt' }, makeCtx())) as Record<string, unknown>;
    expect(String(result['error'])).toMatch(/file not found/);
  });

  it('records an audit entry on success', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false, size: 5 } as fs.Stats);
    vi.mocked(fs.readFileSync).mockReturnValue('hello');

    await tool.handler({ path: 'a.ts' }, makeCtx());
    expect(auditLog).toHaveBeenCalledOnce();
     
    expect((auditLog.mock.calls[0] as [Record<string,unknown>])[0]['tool']).toBe('read_file');
     
    expect((auditLog.mock.calls[0] as [Record<string,unknown>])[0]['result']).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// list_files
// ---------------------------------------------------------------------------

describe('SUBAGENT_TOOLS.list_files', () => {
  const tool = SUBAGENT_TOOLS.list_files;

  it('returns directory entries on happy path', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // First statSync call: root dir → isDirectory=true.
    // Subsequent calls (for child entries): isDirectory=false so walk doesn't recurse.
    let statCallCount = 0;
    vi.mocked(fs.statSync).mockImplementation(() => {
      statCallCount++;
      return { isDirectory: () => statCallCount === 1 } as fs.Stats;
    });
    vi.mocked(fs.readdirSync).mockReturnValue(['a.ts', 'b.ts'] as unknown as ReturnType<typeof fs.readdirSync>);

    const result = JSON.parse(await tool.handler({}, makeCtx())) as Record<string, unknown>;
    expect(result['entries']).toEqual(['a.ts', 'b.ts']);
    expect(result['capped']).toBe(false);
  });

  it('caps at 200 entries', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // First statSync: root dir (isDirectory=true). Remaining: files (isDirectory=false).
    let callCount = 0;
    vi.mocked(fs.statSync).mockImplementation(() => {
      callCount++;
      return { isDirectory: () => callCount === 1 } as fs.Stats;
    });
    const entries = Array.from({ length: 210 }, (_, i) => `file${i}.ts`);
    vi.mocked(fs.readdirSync).mockReturnValue(entries as unknown as ReturnType<typeof fs.readdirSync>);

    const result = JSON.parse(await tool.handler({}, makeCtx())) as Record<string, unknown>;
    expect((result['entries'] as string[]).length).toBeLessThanOrEqual(200);
  });

  it('rejects path traversal', async () => {
    const result = JSON.parse(await tool.handler({ path: '../../etc' }, makeCtx())) as Record<string, unknown>;
    expect(String(result['error'])).toMatch(/escapes working_dir/);
  });

  it('returns error when directory not found', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = JSON.parse(await tool.handler({ path: 'nosuchdir' }, makeCtx())) as Record<string, unknown>;
    expect(String(result['error'])).toMatch(/directory not found/);
  });
});

// ---------------------------------------------------------------------------
// write_file
// ---------------------------------------------------------------------------

describe('SUBAGENT_TOOLS.write_file', () => {
  const tool = SUBAGENT_TOOLS.write_file;

  it('writes a file and returns bytes_written', async () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    const result = JSON.parse(
      await tool.handler({ path: 'src/new.ts', content: 'export {}' }, makeCtx()),
    ) as Record<string, unknown>;
    expect(Number(result['bytes_written'])).toBeGreaterThan(0);
    expect(fs.writeFileSync).toHaveBeenCalledOnce();
  });

  it('rejects absolute path', async () => {
    const result = JSON.parse(
      await tool.handler({ path: '/etc/shadow', content: 'evil' }, makeCtx()),
    ) as Record<string, unknown>;
    expect(String(result['error'])).toMatch(/absolute paths not allowed/);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('rejects path traversal', async () => {
    const result = JSON.parse(
      await tool.handler({ path: '../outside.txt', content: 'evil' }, makeCtx()),
    ) as Record<string, unknown>;
    expect(String(result['error'])).toMatch(/escapes working_dir/);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('records an audit entry on success', async () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    await tool.handler({ path: 'out.js', content: 'hi' }, makeCtx());
    expect(auditLog).toHaveBeenCalledOnce();
     
    expect((auditLog.mock.calls[0] as [Record<string,unknown>])[0]['result']).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// edit_file
// ---------------------------------------------------------------------------

describe('SUBAGENT_TOOLS.edit_file', () => {
  const tool = SUBAGENT_TOOLS.edit_file;

  it('replaces a unique occurrence and returns { replacements: 1 }', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;\n');
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    const result = JSON.parse(
      await tool.handler(
        { path: 'a.ts', old_string: 'const x = 1;', new_string: 'const x = 2;' },
        makeCtx(),
      ),
    ) as Record<string, unknown>;
    expect(result['replacements']).toBe(1);
  });

  it('returns error when old_string not found', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('hello world');

    const result = JSON.parse(
      await tool.handler(
        { path: 'a.ts', old_string: 'notpresent', new_string: 'x' },
        makeCtx(),
      ),
    ) as Record<string, unknown>;
    expect(String(result['error'])).toMatch(/not found/);
  });

  it('returns error when old_string matches multiple times without replace_all', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('foo foo foo');

    const result = JSON.parse(
      await tool.handler(
        { path: 'a.ts', old_string: 'foo', new_string: 'bar' },
        makeCtx(),
      ),
    ) as Record<string, unknown>;
    expect(String(result['error'])).toMatch(/matches 3 times/);
  });

  it('replaces all occurrences when replace_all=true', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('foo foo foo');
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    const result = JSON.parse(
      await tool.handler(
        { path: 'a.ts', old_string: 'foo', new_string: 'bar', replace_all: true },
        makeCtx(),
      ),
    ) as Record<string, unknown>;
    expect(result['replacements']).toBe(3);
  });

  it('rejects path traversal', async () => {
    const result = JSON.parse(
      await tool.handler(
        { path: '../../etc/hosts', old_string: 'a', new_string: 'b' },
        makeCtx(),
      ),
    ) as Record<string, unknown>;
    expect(String(result['error'])).toMatch(/escapes working_dir/);
  });
});

// ---------------------------------------------------------------------------
// bash — execFile callback-style mock
//
// The service uses promisify(execFile). The real promisify wraps execFile and
// calls it with (shell, args, opts, callback). Our mock implementation receives
// the callback as the last argument and invokes it synchronously.
// ---------------------------------------------------------------------------

describe('SUBAGENT_TOOLS.bash', () => {
  const tool = SUBAGENT_TOOLS.bash;

  // Helper: simulate a successful execFile call.
  function mockExecSuccess(stdout: string, stderr = ''): void {
    // execFile signature: (file, args?, options?, callback?) — we match
    // the overloads by accepting any call and invoking the last argument.
    vi.mocked(childProcess.execFile).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (...allArgs: any[]) => {
         
        const cb = allArgs[allArgs.length - 1];
         
        cb(null, { stdout, stderr });
        return {} as ReturnType<typeof childProcess.execFile>;
      },
    );
  }

  function mockExecError(code: number, stderr: string): void {
    vi.mocked(childProcess.execFile).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (...allArgs: any[]) => {
         
        const cb = allArgs[allArgs.length - 1];
        const err = Object.assign(new Error('cmd failed'), { code, stdout: '', stderr, killed: false });
         
        cb(err);
        return {} as ReturnType<typeof childProcess.execFile>;
      },
    );
  }

  it('returns stdout, stderr, exit_code=0 on success', async () => {
    mockExecSuccess('hello\n');
    const result = JSON.parse(
      await tool.handler({ command: 'echo hello' }, makeCtx()),
    ) as Record<string, unknown>;
    expect(result['stdout']).toContain('hello');
    expect(result['exit_code']).toBe(0);
  });

  it('returns exit_code=1 when command fails', async () => {
    mockExecError(1, 'error msg');
    const result = JSON.parse(await tool.handler({ command: 'exit 1' }, makeCtx())) as Record<string, unknown>;
    expect(result['exit_code']).toBe(1);
  });

  it('clamps timeout_ms above 600 s to 600 s', async () => {
    let capturedTimeout: number | undefined;
    vi.mocked(childProcess.execFile).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (...allArgs: any[]) => {
        // options is the 3rd argument (index 2) when present; check each arg
        for (const arg of allArgs) {
          if (arg && typeof arg === 'object' && 'timeout' in (arg as object)) {
            capturedTimeout = (arg as { timeout: number }).timeout;
          }
        }
         
        const cb = allArgs[allArgs.length - 1];
         
        cb(null, { stdout: '', stderr: '' });
        return {} as ReturnType<typeof childProcess.execFile>;
      },
    );

    await tool.handler({ command: 'echo', timeout_ms: 9_999_999 }, makeCtx());
    expect(capturedTimeout).toBe(600_000);
  });

  it('truncates oversized stdout at 50 KB', async () => {
    const bigOutput = 'x'.repeat(60 * 1024);
    mockExecSuccess(bigOutput);
    const result = JSON.parse(await tool.handler({ command: 'cat big.txt' }, makeCtx())) as Record<string, unknown>;
    expect(Buffer.byteLength(String(result['stdout']), 'utf8')).toBeLessThan(55 * 1024);
    expect(String(result['stdout'])).toContain('[...truncated at 50 KB...]');
  });
});

// ---------------------------------------------------------------------------
// buildToolDefinitions
// ---------------------------------------------------------------------------

describe('buildToolDefinitions', () => {
  it('returns a definition for each requested tool', () => {
    const defs = buildToolDefinitions(['read_file', 'write_file']);
    expect(defs).toHaveLength(2);
    expect(defs.map((d) => d.name)).toEqual(['read_file', 'write_file']);
  });

  it('returns all five tools when all names are given', () => {
    const defs = buildToolDefinitions([...ALLOWED_TOOL_NAMES]);
    expect(defs).toHaveLength(5);
  });

  it('ignores unknown names gracefully', () => {
    const defs = buildToolDefinitions(['read_file', 'no_such_tool' as 'read_file']);
    expect(defs).toHaveLength(1);
  });
});
