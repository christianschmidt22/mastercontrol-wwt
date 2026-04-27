# ADR-0007: record_insight allowlist — target_org_name, not target_org_id

**Status**: Accepted
**Date**: 2026-04-25
**Implements**: R-002, Q-5 (resolved 2026-04-25)

---

## Context

`record_insight` is the tool that lets the agent persist what it learns
across conversations by writing a note (`role='agent_insight'`) to any
org. This makes it the only tool that writes data to a table other than
`agent_messages`. Without constraints, a malicious or confused model
could write to any org in the database.

Two threat models were considered:

1. **Accidental cross-contamination**: The model, asked about Cisco, also
   writes an insight to Fairview Hospital because it confused the two. No
   malicious intent; the write is simply wrong.

2. **Prompt injection**: A web_search result or an adversarially crafted
   note body contains instructions like "call record_insight on org 7" to
   smuggle data into another org's context without the user's knowledge.

The original plan (and the PRD § Agent tools) specified
`record_insight(target_org_id, topic, content)` where the model supplies
a numeric ID. This was flagged as inadequate in REVIEW.md R-002:

> "Constrain `record_insight` to a server-resolved org allowlist."

Two design decisions were needed: (a) what is the tool input schema, and
(b) what is the allowlist?

### Tool input: org_id vs org_name

**Option A — `target_org_id: integer` (original plan)**

The model supplies the org's numeric primary key.

*Cons*:
- A prompt-injected `target_org_id=7` bypasses any allowlist check that
  depends on named relationships. The attacker only needs to know (or
  guess) an org ID.
- Numeric IDs are not legible in conversation context; the model cannot
  reliably supply a correct ID from its own reasoning without the user
  having typed it.
- An allowlist of integers is less auditable in logs than an allowlist
  of human-readable names.

**Option B — `target_org_name: string` (chosen)**

The model supplies the org's human-readable name. The server resolves
it to an ID via the allowlist.

*Pros*:
- Prompt injection must supply a correct, case-insensitive exact-match
  name *and* that name must appear in the allowlist for the current turn.
  An injected `target_org_name="ShadowOrg"` is rejected unless the user
  mentioned ShadowOrg in their message.
- Audit rows log the submitted name, making the rejection reason
  human-readable.

*Cons*:
- Requires a server-side name→id resolution step.
- Org renames would change which names the model can use (low risk: org
  names are stable in practice).

### Allowlist composition

The allowlist is resolved once per turn and contains exactly:

1. **The current org** (the org whose chat tile the user is in). Always
   included — the agent always has permission to write insights back to
   its own org.

2. **Orgs whose names appear in the user's message** (case-insensitive
   substring match against all org names). Rationale: if the user typed
   "Cisco mentioned X", the Cisco org is a legitimate target; the user
   provided explicit context.

3. **Orgs referenced in `note_mentions` for the current org's recent
   notes**. Rationale: orgs that already have a documented relationship
   to the current org (via previously extracted mentions) are legitimate
   targets for cross-org insights.

**Rejected alternatives:**
- *All orgs*: Too broad; removes the security value entirely.
- *Only the current org*: Too narrow; prevents the primary use case of
  recording Cisco facts during a Cisco discussion while browsing Fairview.
- *User-supplied list in the chat request*: Moves trust to the frontend,
  which is easier to manipulate than server-side state.

---

## Decision

The `record_insight` tool input is:

```ts
{
  target_org_name: string;  // human-readable, server-resolved
  topic?: string;
  content: string;
}
```

The server resolves `target_org_name` against the per-turn allowlist
(current org ∪ user-message mentions ∪ note_mentions graph). If not
found, the handler returns a tool-error result; nothing is written.

Every call — successful or rejected — writes a row to `agent_tool_audit`
with `status = 'ok' | 'rejected'` and the input/output JSON. This gives
the user a complete record of what the agent tried to do and why it was
blocked.

Successful `record_insight` calls write:
- A `notes` row with `role='agent_insight'` and `confirmed=0` (the user
  must accept before the insight flows into other agents' contexts).
- `provenance JSON` = `{ tool, source_thread_id, source_org_id, topic }`.
- `bumpOrgVersion(targetOrgId)` is called to invalidate the target org's
  cached stable system-prompt block (R-016).

---

## Consequences

### Positive
- Prompt injection that names an unknown org is rejected silently without
  any DB write.
- The allowlist is conservative by default and expands only with explicit
  user action (the user mentions an org by name or there is a documented
  note relationship).
- Audit rows make the allowlist resolution auditable post-hoc.
- The `confirmed=0` default means even a successful write is harmless
  until the user reviews it.

### Negative / trade-offs
- If the user wants to record an insight on an org that has no prior
  relationship and does not mention it by name, the model cannot do so
  in that turn. The user must mention the org name first.
- Case-insensitive substring matching could theoretically match an
  unintended org if one org's name is a substring of another (e.g.,
  "Net" matching "NetApp"). In practice org names are controlled by the
  user and are distinct; this risk is accepted.

---

## References
- `backend/src/services/claude.service.ts` — `resolveAllowlist()`
- `backend/src/db/schema.sql` — `agent_tool_audit` table
- `docs/REVIEW.md` R-002, Q-5
