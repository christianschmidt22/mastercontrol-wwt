/**
 * subagentTools.service.ts — file-coding tools for the agentic delegation loop.
 *
 * Five tools:
 *   read_file    — return file contents (capped at 200 KB).
 *   list_files   — list up to 200 entries under a directory.
 *   write_file   — create or replace a file.
 *   edit_file    — exact-string replace inside a file.
 *   bash         — run a shell command inside working_dir.
 *
 * Path safety:
 *   All file-touching tools use assertSafeRelPath() which rejects absolute
 *   paths, paths containing `..`, and any path that resolves outside
 *   working_dir after normalization. We deliberately do NOT reuse the
 *   existing resolveSafePath() from lib/safePath.ts because that function
 *   has an extension allowlist and calls fs.realpathSync which requires the
 *   file to already exist — both wrong for write tools. Instead we implement
 *   a lightweight containment check here.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fg from 'fast-glob';
import type Anthropic from '@anthropic-ai/sdk';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const READ_CAP_BYTES = 200 * 1024; // 200 KB
const TRUNCATION_MARKER = '\n\n[...file truncated at 200 KB...]';
const LIST_MAX_ENTRIES = 200;
const BASH_DEFAULT_TIMEOUT_MS = 60_000;
const BASH_MAX_TIMEOUT_MS = 600_000;
const BASH_OUTPUT_CAP_BYTES = 50 * 1024; // 50 KB per stream

// ---------------------------------------------------------------------------
// Context + audit types
// ---------------------------------------------------------------------------

export interface AuditEntry {
  tool: string;
  input: Record<string, unknown>;
  result: 'ok' | 'error' | 'rejected';
  detail?: string;
}

export interface ToolContext {
  working_dir: string;
  audit: (entry: AuditEntry) => void;
}

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

/**
 * Validate that a caller-supplied relative path resolves to a descendant of
 * working_dir without following symlinks or escaping via `..`.
 *
 * Rules:
 *   1. Reject absolute paths (start with / or drive letter on Windows).
 *   2. Reject paths containing `..` segments after normalization.
 *   3. The normalized join of (working_dir, input) must start with
 *      working_dir + path.sep to ensure strict descendancy.
 *
 * Returns the absolute path if safe; throws otherwise.
 *
 * NOTE: unlike lib/safePath.ts this function does NOT require the path to
 * exist (needed for write_file) and does NOT enforce an extension allowlist
 * (needed for code files like .ts/.js).
 */
export function assertSafeRelPath(input: string, workingDir: string): string {
  // 1. Reject absolute paths.
  if (path.isAbsolute(input)) {
    throw new Error(`safe-path-rejected: absolute paths not allowed (got: ${input})`);
  }

  // 2. Build candidate by joining with working_dir, then normalize.
  const candidate = path.normalize(path.join(workingDir, input));
  const normRoot = path.normalize(workingDir).replace(/[\\/]+$/, '');
  const boundary = normRoot + path.sep;

  // 3. Strict descendant check.
  if (!candidate.startsWith(boundary) && candidate !== normRoot) {
    throw new Error(
      `safe-path-rejected: path escapes working_dir (working_dir=${normRoot}, resolved=${candidate})`,
    );
  }

  return candidate;
}

/**
 * Truncate a buffer or string to cap bytes, appending a truncation marker if
 * the content was cut.
 */
function capString(content: string, capBytes: number, marker: string): string {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes <= capBytes) return content;
  // Slice by byte position; convert back to string safely.
  const buf = Buffer.from(content, 'utf8').subarray(0, capBytes);
  return buf.toString('utf8') + marker;
}

// ---------------------------------------------------------------------------
// Tool result types (internal)
// ---------------------------------------------------------------------------

interface ReadFileResult {
  content: string;
  bytes: number;
  truncated: boolean;
}

interface ListFilesResult {
  entries: string[];
  count: number;
  capped: boolean;
}

interface WriteFileResult {
  bytes_written: number;
}

interface EditFileResult {
  replacements: number;
}

interface BashResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function readFileImpl(
  input: { path: string },
  ctx: ToolContext,
): Promise<ReadFileResult> {
  const abs = assertSafeRelPath(input.path, ctx.working_dir);

  // File must exist to read.
  if (!fs.existsSync(abs)) {
    throw new Error(`file not found: ${input.path}`);
  }

  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    throw new Error(`path is a directory, not a file: ${input.path}`);
  }

  const raw = fs.readFileSync(abs, 'utf8');
  const truncated = Buffer.byteLength(raw, 'utf8') > READ_CAP_BYTES;
  const content = truncated ? capString(raw, READ_CAP_BYTES, TRUNCATION_MARKER) : raw;

  return { content, bytes: stat.size, truncated };
}

async function listFilesImpl(
  input: { path?: string; pattern?: string },
  ctx: ToolContext,
): Promise<ListFilesResult> {
  const baseRaw = input.path ?? '.';
  const absBase = assertSafeRelPath(baseRaw, ctx.working_dir);

  if (!fs.existsSync(absBase)) {
    throw new Error(`directory not found: ${baseRaw}`);
  }
  if (!fs.statSync(absBase).isDirectory()) {
    throw new Error(`path is not a directory: ${baseRaw}`);
  }

  let entries: string[];
  if (input.pattern) {
    // fast-glob returns paths relative to cwd option.
    const matches = await fg(input.pattern, {
      cwd: absBase,
      dot: true,
      onlyFiles: false,
    });
    entries = matches.sort();
  } else {
    // Recursive walk — collect relative paths from absBase.
    const results: string[] = [];
    function walk(dir: string, prefix: string): void {
      if (results.length >= LIST_MAX_ENTRIES + 1) return; // +1 to detect capping
      const children = fs.readdirSync(dir);
      for (const child of children) {
        if (results.length >= LIST_MAX_ENTRIES + 1) return;
        const childRel = prefix ? `${prefix}/${child}` : child;
        const childAbs = path.join(dir, child);
        results.push(childRel);
        try {
          if (fs.statSync(childAbs).isDirectory()) {
            walk(childAbs, childRel);
          }
        } catch {
          // stat failed — skip
        }
      }
    }
    walk(absBase, '');
    entries = results;
  }

  const capped = entries.length > LIST_MAX_ENTRIES;
  return {
    entries: entries.slice(0, LIST_MAX_ENTRIES),
    count: Math.min(entries.length, LIST_MAX_ENTRIES),
    capped,
  };
}

async function writeFileImpl(
  input: { path: string; content: string },
  ctx: ToolContext,
): Promise<WriteFileResult> {
  const abs = assertSafeRelPath(input.path, ctx.working_dir);

  // Create parent directories as needed.
  const dir = path.dirname(abs);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(abs, input.content, 'utf8');
  const bytes_written = Buffer.byteLength(input.content, 'utf8');
  return { bytes_written };
}

async function editFileImpl(
  input: { path: string; old_string: string; new_string: string; replace_all?: boolean },
  ctx: ToolContext,
): Promise<EditFileResult> {
  const abs = assertSafeRelPath(input.path, ctx.working_dir);

  if (!fs.existsSync(abs)) {
    throw new Error(`file not found: ${input.path}`);
  }

  const original = fs.readFileSync(abs, 'utf8');
  const { old_string, new_string, replace_all } = input;

  // Count occurrences.
  let count = 0;
  let idx = original.indexOf(old_string);
  while (idx !== -1) {
    count++;
    idx = original.indexOf(old_string, idx + old_string.length);
  }

  if (count === 0) {
    throw new Error(`edit_file: old_string not found in ${input.path}`);
  }
  if (count > 1 && !replace_all) {
    throw new Error(
      `edit_file: old_string matches ${count} times in ${input.path}. ` +
      `Set replace_all=true to replace all occurrences.`,
    );
  }

  let updated: string;
  if (replace_all) {
    // Replace all occurrences.
    updated = original.split(old_string).join(new_string);
  } else {
    // Replace first (and only) occurrence.
    updated = original.replace(old_string, new_string);
  }

  fs.writeFileSync(abs, updated, 'utf8');
  return { replacements: count };
}

async function bashImpl(
  input: { command: string; timeout_ms?: number },
  ctx: ToolContext,
): Promise<BashResult> {
  const timeoutMs = Math.min(
    input.timeout_ms ?? BASH_DEFAULT_TIMEOUT_MS,
    BASH_MAX_TIMEOUT_MS,
  );

  let stdout = '';
  let stderr = '';
  let exit_code = 0;

  try {
    // Use cmd.exe on Windows, sh on Unix.
    const isWindows = process.platform === 'win32';
    const [shell, args]: [string, string[]] = isWindows
      ? ['cmd.exe', ['/c', input.command]]
      : ['sh', ['-c', input.command]];

    const result = await execFileAsync(shell, args, {
      cwd: ctx.working_dir,
      timeout: timeoutMs,
      maxBuffer: BASH_OUTPUT_CAP_BYTES * 2, // execFile buffer (we cap after)
    });

    stdout = capString(result.stdout ?? '', BASH_OUTPUT_CAP_BYTES, '\n[...truncated at 50 KB...]');
    stderr = capString(result.stderr ?? '', BASH_OUTPUT_CAP_BYTES, '\n[...truncated at 50 KB...]');
    exit_code = 0;
  } catch (err) {
    // execFile throws on non-zero exit or timeout.
    const e = err as { stdout?: string; stderr?: string; code?: number | string; signal?: string; killed?: boolean };
    stdout = capString(e.stdout ?? '', BASH_OUTPUT_CAP_BYTES, '\n[...truncated at 50 KB...]');
    stderr = capString(e.stderr ?? '', BASH_OUTPUT_CAP_BYTES, '\n[...truncated at 50 KB...]');

    if (e.killed || e.signal === 'SIGTERM') {
      exit_code = -1;
      stderr = `[bash: command timed out after ${timeoutMs}ms]\n` + stderr;
    } else {
      exit_code = typeof e.code === 'number' ? e.code : 1;
    }
  }

  return { stdout, stderr, exit_code };
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

export type AllowedToolName = 'read_file' | 'list_files' | 'write_file' | 'edit_file' | 'bash';

export const ALLOWED_TOOL_NAMES: ReadonlyArray<AllowedToolName> = [
  'read_file',
  'list_files',
  'write_file',
  'edit_file',
  'bash',
];

export interface SubagentTool {
  name: AllowedToolName;
  description: string;
  /** Anthropic-compatible input schema (type: 'object' ...). */
  input_schema: Anthropic.Tool['input_schema'];
  handler: (input: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
}

/**
 * Wrap a typed implementation so it returns a JSON string and records an audit
 * entry. Errors are caught and returned as JSON `{ error: "..." }`.
 */
function makeHandler<T extends Record<string, unknown>, R>(
  name: AllowedToolName,
  impl: (input: T, ctx: ToolContext) => Promise<R>,
): (input: Record<string, unknown>, ctx: ToolContext) => Promise<string> {
  return async (raw: Record<string, unknown>, ctx: ToolContext): Promise<string> => {
    // Cast: the Anthropic SDK delivers tool inputs as Record<string,unknown>;
    // we trust that the schema enforces the right shape before the handler runs.
    const input = raw as T;
    try {
      const result = await impl(input, ctx);
      ctx.audit({ tool: name, input: raw, result: 'ok', detail: JSON.stringify(result) });
      return JSON.stringify(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.audit({ tool: name, input: raw, result: 'error', detail: message });
      return JSON.stringify({ error: message });
    }
  };
}

export const SUBAGENT_TOOLS: Record<AllowedToolName, SubagentTool> = {
  read_file: {
    name: 'read_file',
    description:
      'Read the contents of a file at the given path (relative to working_dir). ' +
      'Returns the text content, capped at 200 KB with a truncation marker.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file, relative to working_dir. No absolute paths.',
        },
      },
      required: ['path'],
    },
    handler: makeHandler('read_file', readFileImpl),
  },

  list_files: {
    name: 'list_files',
    description:
      'List files and directories under a path (relative to working_dir). ' +
      'Returns up to 200 entries. Optionally filter with a glob pattern.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Directory to list, relative to working_dir. Defaults to "." (working_dir itself).',
        },
        pattern: {
          type: 'string',
          description: 'Optional glob pattern to filter entries (e.g. "**/*.ts").',
        },
      },
      required: [],
    },
    handler: makeHandler('list_files', listFilesImpl),
  },

  write_file: {
    name: 'write_file',
    description:
      'Create or replace a file at the given path (relative to working_dir). ' +
      'Creates parent directories as needed. Returns { bytes_written }.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Path to write, relative to working_dir. No absolute paths.',
        },
        content: {
          type: 'string',
          description: 'Full file content to write.',
        },
      },
      required: ['path', 'content'],
    },
    handler: makeHandler('write_file', writeFileImpl),
  },

  edit_file: {
    name: 'edit_file',
    description:
      'Perform an exact-string replacement inside a file (relative to working_dir). ' +
      'If old_string appears more than once and replace_all is not true, returns an error. ' +
      'Returns { replacements: N }.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Path to edit, relative to working_dir.',
        },
        old_string: {
          type: 'string',
          description: 'Exact text to find. Must match literally.',
        },
        new_string: {
          type: 'string',
          description: 'Replacement text.',
        },
        replace_all: {
          type: 'boolean',
          description: 'If true, replace every occurrence. Default false.',
        },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    handler: makeHandler('edit_file', editFileImpl),
  },

  bash: {
    name: 'bash',
    description:
      'Run a shell command in working_dir. Returns { stdout, stderr, exit_code }. ' +
      'Default timeout 60 s, max 600 s. Output capped at 50 KB per stream.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to execute.',
        },
        timeout_ms: {
          type: 'integer',
          description: 'Timeout in milliseconds. Default 60000, max 600000.',
        },
      },
      required: ['command'],
    },
    handler: makeHandler('bash', bashImpl),
  },
};

/**
 * Build the Anthropic tool definitions array for a given subset of tool names.
 * Only names in ALLOWED_TOOL_NAMES are accepted; unknown names are silently
 * dropped (the caller validates the request-level subset beforehand).
 */
export function buildToolDefinitions(names: AllowedToolName[]): Anthropic.Tool[] {
  return names
    .filter((n) => n in SUBAGENT_TOOLS)
    .map((n) => {
      const t = SUBAGENT_TOOLS[n];
      return {
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      };
    });
}
