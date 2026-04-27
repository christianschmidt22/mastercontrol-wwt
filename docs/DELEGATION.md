# Personal-subscription delegation

> The user's stop condition: "I can log into my personal Claude subscription
> with the tool so you can use it to delegate future coding tasks." This is
> how that flow works.

## Authentication modes

Two modes are supported. The **Delegate** tab in `/agents` lets you pick per-session; your choice is stored in `localStorage` and persists across reloads.

### Mode 1 — Subscription login (recommended)

Uses your **Claude.ai Pro/Max/Team subscription** via the Agent SDK and OAuth credentials stored by `claude /login`. Usage counts against your subscription allotment, not metered tokens. No API key required.

**When to use:** You have an active Claude.ai subscription and want to delegate tasks without accumulating per-token charges.

#### One-time setup

```bash
# From any terminal on this machine:
claude /login
```

The CLI writes OAuth credentials to `~/.claude/.credentials.json`. The backend reads them from there — MasterControl never stores or proxies them.

After running `claude /login`, open Settings → **Delegation Authentication** → click **Re-check status**. The pill should turn green.

### Mode 2 — API key (fallback)

Uses the `personal_anthropic_api_key` stored in Settings. Pay-per-token billing via the Anthropic Console.

**When to use:** You don't have a Claude.ai subscription, or you want to isolate per-token costs from subscription quota.

#### Setup

1. Start the app: `npm run dev`.
2. Open `http://localhost:5173/settings`.
3. Scroll to **Delegation Authentication → API key (fallback)**.
4. Paste your personal Anthropic API key (`sk-ant-…`) and click **Save Key**.

The key is stored in `database/mastercontrol.db` under
`settings.personal_anthropic_api_key`, **DPAPI-encrypted on Windows**
(`@primno/dpapi` v1.1.x). On non-Windows it's stored in plaintext (the
no-op fallback path; flagged with a stderr warning at boot).

---

## Delegating a coding task

### Subscription mode — agentic loop (`POST /api/subagent/delegate-sdk`)

Same request/response shape as `/delegate-agentic` (see below), but uses
OAuth credentials from `~/.claude/.credentials.json` rather than the stored API key.

```bash
curl -X POST http://localhost:3001/api/subagent/delegate-sdk \
  -H 'Content-Type: application/json' \
  -d '{
    "task": "Read README.md and propose three improvements as a unified diff.",
    "tools": ["read_file", "list_files"],
    "max_iterations": 25,
    "max_tokens": 4096,
    "task_summary": "readme review"
  }'
```

If `~/.claude/.credentials.json` is missing, the endpoint returns:
```jsonc
{ "ok": false, "error": "Claude.ai subscription not authenticated. Run `claude /login` first…" }
```
with HTTP 200 — the HTTP call succeeded; the auth check did not.

### One-shot text delegation (`POST /api/subagent/delegate`)

Single round-trip — task in, text out, cost recorded. Best for "summarize
this," "draft this," or other tasks that don't need to read or edit files.
Backed by the API key (`personal_anthropic_api_key`).

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

Multi-turn loop with bounded tool execution (API-key billing). The agent can `read_file`,
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
- `max_cost_usd` — optional per-call USD cost cap (positive number, max $100). After each turn the cumulative cost is compared against this value. If it is exceeded the loop aborts immediately (before executing any pending tool calls) and returns `{ ok: false, error: 'Max cost exceeded ($X.XXXX of $Y.YY budget)', transcript_so_far, total_usage }`. The abort is also written to `anthropic_usage_events` with the error string so runaway spend is fully auditable. If the model reaches `end_turn` naturally the cap is not applied to that final turn (the run succeeds). Omitting `max_cost_usd` disables enforcement entirely.
- `bash` is **opt-in**: only enabled if explicitly listed in `tools`
- `bash` stdout/stderr capped at 50 KB each, default timeout 60s, hard cap 600s
- file paths constrained to the working directory via `assertSafeRelPath`

### From the UI

`http://localhost:5173/agents` → **Delegate** tab.

1. Pick **Authentication** — Subscription (default) or API key.
2. Subscription mode: if the status shows "Not authenticated", run `claude /login` in a terminal and click Re-check in Settings.
3. Fill in the task, choose tools, and click **Run Agent**.

The transcript appears after the run completes; cost is reflected in the live meter.

## How a future Claude Code session would call this

Recommended pattern — subscription mode:

```bash
curl -s -X POST http://localhost:3001/api/subagent/delegate-sdk \
  -H 'Content-Type: application/json' \
  -d "$(jq -n --arg task "$TASK" --arg dir "$WORKDIR" '{
    task: $task,
    working_dir: $dir,
    tools: ["read_file","list_files","write_file","edit_file","bash"],
    max_iterations: 30,
    task_summary: "delegated coding task"
  }')"
```

Fallback — API-key mode (same body, different endpoint):

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

## Auth status probe (`GET /api/subagent/auth-status`)

The Settings page polls this endpoint every 30 s to show a live status badge.

Response:
```jsonc
{ "subscription_authenticated": true, "api_key_configured": false }
```

If the endpoint returns 404 (backend agent hasn't deployed it yet), the
frontend degrades gracefully: the badge shows "Status unknown — try
delegating to verify" and does not block any functionality.

## Security notes

- The backend binds **127.0.0.1 only** (R-001). Nothing on the network
  can reach the delegation endpoints.
- OAuth credentials (`~/.claude/.credentials.json`) are read server-side
  only, never returned to the frontend.
- The personal API key is **never returned in plaintext** to the frontend.
  Routes only ever read `getMasked()`; the plaintext getter is callable
  only from `services/subagent.service.ts`.
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
