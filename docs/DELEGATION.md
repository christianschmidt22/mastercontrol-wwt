# Personal-subscription delegation

> The user's stop condition: "I can log into my personal Claude subscription
> with the tool so you can use it to delegate future coding tasks." This is
> how that flow works.

## Login: setting your personal Anthropic API key

1. Start the app: `npm run dev` (backend on `:3001`, frontend on `:5173`).
2. Open `http://localhost:5173/settings`.
3. Scroll to **Personal Claude Subscription** (the last section).
4. Paste your personal Anthropic API key (`sk-ant-…`) and click **Save**.

The key is stored in `database/mastercontrol.db` under
`settings.personal_anthropic_api_key`, **DPAPI-encrypted on Windows**
(`@primno/dpapi` v1.1.x). On non-Windows it's stored in plaintext (the
no-op fallback path; flagged with a stderr warning at boot).

The **per-org chat key** (`anthropic_api_key`) is stored in a separate
slot. Both go through the same DPAPI chokepoint
(`backend/src/models/settings.model.ts` → `SECRET_KEYS` allowlist), and
both are masked (`***last4`) when read through `getMasked()` for any
frontend route.

After saving, the **AgentsPage tile** (header above the tab strip) shows:

- a green dot if the personal key is set, grey otherwise
- four periods (Session · Today · Week · All) with request count, token
  total, and cost in USD
- a "Recent activity" disclosure with the last 10 calls

## Delegating a coding task

Two surfaces, both backed by the same `personal_anthropic_api_key`:

### One-shot text delegation (`POST /api/subagent/delegate`)

Single round-trip — task in, text out, cost recorded. Best for "summarize
this," "draft this," or other tasks that don't need to read or edit files.

```bash
curl -X POST http://localhost:3001/api/subagent/delegate \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "Summarize the architecture of this app in 5 bullets.",
    "model": "claude-sonnet-4-6",
    "max_tokens": 4096,
    "task_summary": "architecture summary"
  }'
```

Response:

```jsonc
{
  "ok": true,
  "content": "<assistant text>",
  "model": "claude-sonnet-4-6",
  "usage": {
    "input_tokens": …,
    "output_tokens": …,
    "cache_read_input_tokens": …,
    "cache_creation_input_tokens": …
  },
  "request_id": "msg_…",
  "cost_usd": 0.0042
}
```

Failures (Anthropic 5xx, network) return `{ ok: false, error }` with
status 200 — the HTTP call succeeded; the upstream call did not.
Configuration errors (no key) return status 400.

### Agentic loop with file tools (`POST /api/subagent/delegate-agentic`)

Multi-turn loop with bounded tool execution. The agent can `read_file`,
`list_files`, `write_file`, `edit_file`, and (opt-in) `bash` inside a
constrained working directory — defaults to
`~/mastercontrol-delegate-workspace`, which is mkdir'd if missing.

```bash
curl -X POST http://localhost:3001/api/subagent/delegate-agentic \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "Read README.md and propose three improvements as a unified diff.",
    "tools": ["read_file", "list_files"],
    "max_iterations": 25,
    "max_tokens": 4096,
    "task_summary": "readme review"
  }'
```

Response shape:

```jsonc
{
  "ok": true,
  "transcript": [
    { "kind": "assistant_text",     "text": "I'll start by listing files…", "turn": 1 },
    { "kind": "assistant_tool_use", "tool": "list_files",  "input": { … }, "tool_use_id": "tu_1", "turn": 1 },
    { "kind": "tool_result",        "tool_use_id": "tu_1", "output": "README.md\nbackend/…", "is_error": false, "turn": 1 },
    …
  ],
  "total_usage": { … },
  "total_cost_usd": 0.018,
  "iterations": 3,
  "stopped_reason": "end_turn"
}
```

Hard limits:
- `max_iterations` — default 25, hard cap 50
- `max_tokens` — hard cap 8192 per turn
- `bash` is **opt-in**: only enabled if explicitly listed in `tools`
- `bash` stdout/stderr capped at 50 KB each, default timeout 60s, hard cap 600s
- file paths constrained to the working directory via `assertSafeRelPath`

### From the UI

`http://localhost:5173/agents` → **Delegate** tab. Lets you submit either
the one-shot or the agentic variant, see the transcript live, and watch
the cost meter update.

## How a future Claude Code session would call this

If the backend is running on this machine, any session can `curl` the
endpoints directly. Past-session usage in the AgentsPage tile becomes
context-free billing for whoever owns the personal key.

Recommended pattern for delegating a coding task from a Claude Code
session:

```bash
curl -s -X POST http://localhost:3001/api/subagent/delegate-agentic \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg task "$TASK" --arg dir "$WORKDIR" '{
    task: $task,
    working_dir: $dir,
    tools: ["read_file","list_files","write_file","edit_file","bash"],
    max_iterations: 30,
    task_summary: "delegated coding task"
  }')"
```

The transcript comes back as a single JSON body. Parse the final
`assistant_text` entry for the agent's summary; iterate the
`assistant_tool_use` + `tool_result` pairs to see what files it touched.

## Security notes

- The backend binds **127.0.0.1 only** (R-001). Nothing on the network
  can reach the delegation endpoints.
- The personal key is **never returned in plaintext** to the frontend.
  Routes only ever read `getMasked()`; the plaintext getter is callable
  only from `services/subagent.service.ts` (which constructs the
  Anthropic client and passes the key through to the SDK).
- The agentic loop's file tools resolve every path through
  `assertSafeRelPath` against the working directory — `..` traversal
  and absolute paths are rejected.
- `bash` is opt-in per request. Even when allowed, it runs with the
  user's local OS privileges; treat with the same trust boundary as
  any local terminal. Sandboxed only by the working-dir constraint.
- Every API call is recorded to `anthropic_usage_events` regardless of
  success/failure, so cost and error rate are auditable.

## Known gaps for next round

- **Streaming** — both delegation endpoints return the full transcript
  at the end of the run. Streaming SSE would let the UI show progress
  live for long-running agentic tasks. The frontend Console is already
  structured to receive incremental updates if/when this lands.
- **Per-call rate limits** — currently no cost-per-call cap. The 50-iter
  hard ceiling indirectly bounds runaway loops at ~50 × max_tokens.
- **Per-error retry on the activity feed** — usage rows with `error` are
  visible but not actionable. A "retry this task" button is a small
  follow-up.
