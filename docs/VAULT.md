# MasterControl Vault Contract

**Status**: Living contract for where user-facing markdown and day-to-day
files live.

The MasterControl app keeps structured CRM state in SQLite and keeps durable
human-readable working files in the OneDrive-backed MasterControl vault.
Agents should use this document when deciding where to create, move, import,
or index files.

## Root

Default vault root:

```text
C:\Users\schmichr\OneDrive - WWT\Documents\mastercontrol
```

Runtime setting:

```text
settings.mastercontrol_root
```

If `mastercontrol_root` is unset, code may compute default paths but should
not write outside the repo merely because the default exists in code. Once the
user saves the setting in Settings, MasterControl may create missing
directories under that root.

## Final Folder Layout

```text
mastercontrol/
  00-inbox/

  customers/
    <customer_slug>/
      _notes/
      _agent/
      projects/
        <project_slug>/
      reference/

  oems/
    <oem_slug>/
      _notes/
      _agent/
      projects/
        <project_slug>/
      reference/

  reports/
    <report_slug>/

  reference/
  ai/
  _archive/
```

Known existing folders should be reused when they match the org name or
acronym:

```text
customers/chr
customers/fairview
oems/cohesity
oems/commvault
```

New folder names are lowercase snake-case slugs, for example:

```text
VCF9 Adoption -> vcf9_adoption
```

## What Lives Where

| Thing | Final resting place | Source of truth |
|---|---|---|
| Loose capture, unsorted research, dropped files | `00-inbox/` | File until triaged |
| Customer notes | `customers/<customer_slug>/_notes/` | Markdown file, DB indexes it |
| OEM notes | `oems/<oem_slug>/_notes/` | Markdown file, DB indexes it |
| Customer project files | `customers/<customer_slug>/projects/<project_slug>/` | File, DB `documents` rows index important files |
| OEM project files | `oems/<oem_slug>/projects/<project_slug>/` | File, DB `documents` rows index important files |
| Customer/OEM reference docs | `customers/<slug>/reference/` or `oems/<slug>/reference/` | File/link, DB `documents` rows index important files |
| Global reference docs | `reference/` | File/link, indexed only when useful |
| Agent memory/state | SQLite: `agent_threads`, `agent_messages`, `notes`, `agent_tool_audit` | DB |
| Accepted agent insights or durable agent summaries | `customers/<slug>/_agent/` or `oems/<slug>/_agent/` | DB first, optional markdown export |
| Global AI prompts/playbooks/import aids | `ai/` | File |
| Legacy `_claude` material | `_archive/legacy_claude/` or triaged into scoped `_agent/` folders | Imported/triaged files |
| Tasks | SQLite `tasks` | DB only |
| Contacts | SQLite `contacts` | DB only |
| Report schedules/runs metadata | SQLite `reports`, `report_schedules`, `report_runs` | DB |
| Report markdown outputs | `reports/<report_slug>/` | Markdown file, DB indexes run metadata |

## Notes

Customer and OEM notes are entity-scoped. Do not create a top-level
`04-Notes` replacement in the new vault. A note about Fairview belongs under
`customers/fairview/_notes/`; a note about Commvault belongs under
`oems/commvault/_notes/`. If a note mentions multiple orgs, file it under the
primary org and let `note_mentions` carry cross-org visibility.

Recommended file name:

```text
YYYY-MM-DD-short-topic.md
```

Each note file should eventually have frontmatter with a stable `file_id` so
the ingest pipeline can reconcile moves/edits without duplicating DB rows.

## Agent Memory

Do not recreate a top-level `_claude` folder as the live agent memory store.

Canonical agent state is structured and queryable in SQLite:

- `agent_threads`
- `agent_messages`
- `agent_tool_audit`
- `notes` rows with `role='agent_insight'`

Markdown under `_agent/` is for durable summaries, accepted insights, research
briefs, and exports that the user may want to read or reuse outside the app.
Use the scoped folder for the org the output concerns:

```text
customers/fairview/_agent/
oems/cohesity/_agent/
```

If an agent output is global and not about a specific org, use:

```text
ai/
```

## Research Output

When research is done, store the durable artifact where the user would look
for it later:

1. If it is for a project, save it under that project folder.
2. If it is for a customer but not a project, save it under that customer's
   `_notes/`, `_agent/`, or `reference/` folder depending on the content.
3. If it is for an OEM but not a project, save it under that OEM's `_notes/`,
   `_agent/`, or `reference/` folder.
4. If it is not tied to an org, save it under `00-inbox/` for later triage or
   `reference/` when it is clearly evergreen.

After saving a useful file, create or update a `documents` row so
MasterControl can show it in the UI and agent tools can discover it.

## Reports

Final report markdown location:

```text
reports/<report_slug>/<run_id>.md
```

Example:

```text
reports/daily_task_review/123.md
```

Report definitions, schedules, run status, hashes, summaries, and output paths
remain in SQLite. The markdown file is the readable artifact.

Implementation note: earlier code wrote report markdown under the repo-level
`C:\mastercontrol\reports`. The final vault contract is the OneDrive-backed
`<mastercontrol_root>\reports` tree above. Agents touching report output
plumbing should migrate code toward this contract and keep existing safe-path
checks.

## Legacy WorkVault Migration

The old WorkVault layout was type-first:

```text
_claude/
00-Inbox/
01-Tasks/
02-Customers/
03-OEMs/
04-Notes/
05-Reports/
05-Weekly-Reviews/
06-Reference/
08-AI/
```

The new vault is entity-first. During migration:

- `00-Inbox` maps to `00-inbox/`.
- `01-Tasks` should be imported into SQLite tasks or archived; tasks are not
  markdown source-of-truth going forward.
- `02-Customers` maps into `customers/<customer_slug>/`.
- `03-OEMs` maps into `oems/<oem_slug>/`.
- `04-Notes` should be split by primary org into `_notes/`.
- `05-Reports` and `05-Weekly-Reviews` map into `reports/`.
- `06-Reference` maps into either global `reference/` or scoped
  `customers/<slug>/reference/` / `oems/<slug>/reference/`.
- `08-AI` maps into `ai/`, except org-specific artifacts move into scoped
  `_agent/` folders.
- `_claude` is legacy import material; triage it into scoped `_agent/`
  folders or `_archive/legacy_claude/`.

## Current Code Hooks

- `backend/src/services/fileSpace.service.ts` owns root/path derivation.
- `settings.mastercontrol_root` is editable on the Settings page.
- Creating a project through `/api/projects` fills `doc_url` with the
  computed project folder when no explicit link is supplied.
- `documents` rows index important files and links.
- `read_document` must keep using safe-path checks before reading local files.
