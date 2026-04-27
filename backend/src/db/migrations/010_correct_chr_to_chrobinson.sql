-- 010_correct_chr_to_chrobinson.sql
--
-- Correction migration. The original 009 seed used "CHR" as shorthand for a
-- fictional Catholic Health Initiatives Regional. The real customer is C.H.
-- Robinson — the 3PL / logistics giant headquartered in Eden Prairie, MN.
-- Completely different industry (supply chain / freight, not healthcare),
-- different stack, different contacts.
--
-- This migration reseats all CHR-related rows to C.H. Robinson context. It's
-- idempotent: anchored on the org's CURRENT name so re-running after the
-- correction is a no-op. If the user has manually renamed the org since,
-- the migration silently no-ops.

-- =============================================================================
-- 1. Rename the organization + replace its summary
-- =============================================================================

UPDATE organizations
SET
  name = 'C.H. Robinson',
  metadata = '{"summary": "Eden Prairie 3PL. Navisphere TMS modernization in flight. Distribution-center SD-WAN refresh on the table."}',
  updated_at = datetime('now')
WHERE name = 'CHR (Catholic Health Initiatives Regional)';

-- Capture the org id once so all the child-row clean-ups are anchored to it.
-- We use a name-based lookup throughout — if the org doesn't exist (e.g. a
-- fresh DB that ran 009 + 010 without the wrong-name in between), the
-- WHERE clauses naturally find zero rows and these are all no-ops.

-- =============================================================================
-- 2. Wipe the wrong-CHR child rows so we can reseed clean
-- =============================================================================

-- Delete contacts that match the original 009 fictional names.
DELETE FROM contacts
WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
  AND name IN ('Diane Kowalski', 'Raj Patel', 'Anders Nilsson');

-- Delete projects from the 009 seed.
DELETE FROM projects
WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
  AND name IN ('Nutanix Cluster Pilot', 'VMware ELA Renewal Decision');

-- Delete documents from 009.
DELETE FROM documents
WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
  AND label IN ('Nutanix Pilot Architecture', 'VMware vs Nutanix TCO Model');

-- Delete the original notes (anchored on the distinctive wording from 009).
DELETE FROM notes
WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
  AND (
    content LIKE 'First Nutanix briefing%'
    OR content LIKE 'Anders ran the demo%'
    OR content LIKE 'CHR is highly cost-sensitive%'
    OR content LIKE 'Sent the TCO model%'
    OR content LIKE 'Diane''s brother-in-law%'
  );

-- Delete the agent thread + messages for this org so we can reseed cleanly.
-- Messages cascade via FK on agent_threads.
DELETE FROM agent_messages
WHERE thread_id IN (
  SELECT id FROM agent_threads
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);
DELETE FROM agent_threads
WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson');

-- =============================================================================
-- 3. Reseed C.H. Robinson with logistics/3PL-appropriate data
-- =============================================================================

-- Contacts. WHERE NOT EXISTS guards make this idempotent on re-run.

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Karen Bergstrom', 'Sr. Director of IT Infrastructure',
  'karen.bergstrom@chrobinson.com', NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    AND name = 'Karen Bergstrom'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Mike Lindgren', 'VP, Network Engineering',
  'mike.lindgren@chrobinson.com', NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    AND name = 'Mike Lindgren'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Jenna Park', 'Director, Application Platforms',
  'jenna.park@chrobinson.com', NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    AND name = 'Jenna Park'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Diego Alvarez', 'Cisco Channel Account Manager',
  'diego.alvarez@external.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    AND name = 'Diego Alvarez'
);

-- Projects.

INSERT INTO projects (organization_id, name, status, description)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Navisphere Platform Refresh',
  'active',
  'Refactor the Navisphere TMS data plane onto Cisco UCS X-series + NetApp ONTAP. Phased cutover Q3-Q4. Karen owns. Mike sponsoring on the network side.'
WHERE NOT EXISTS (
  SELECT 1 FROM projects
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    AND name = 'Navisphere Platform Refresh'
);

INSERT INTO projects (organization_id, name, status, description)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'DC SD-WAN Rollout',
  'planning',
  '~120 distribution centers + cross-dock terminals onto Cisco SD-WAN with Meraki edge. Phase 1 scoping in progress. Mike is technical lead.'
WHERE NOT EXISTS (
  SELECT 1 FROM projects
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    AND name = 'DC SD-WAN Rollout'
);

INSERT INTO projects (organization_id, name, status, description)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Eden Prairie HQ Wi-Fi 7 Refresh',
  'done',
  'Completed 2026-02. Catalyst 9166I throughout HQ campus. Drove a small attached UCS edge order.'
WHERE NOT EXISTS (
  SELECT 1 FROM projects
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    AND name = 'Eden Prairie HQ Wi-Fi 7 Refresh'
);

-- Documents.

INSERT INTO documents (organization_id, kind, label, url_or_path, source)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'link',
  'Navisphere Refresh — High-Level Design',
  'https://example.com/chr-navisphere-hld',
  'manual'
WHERE NOT EXISTS (
  SELECT 1 FROM documents
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    AND label = 'Navisphere Refresh — High-Level Design'
);

INSERT INTO documents (organization_id, kind, label, url_or_path, source)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'link',
  'SD-WAN Site Survey Template',
  'https://example.com/chr-sdwan-survey',
  'manual'
WHERE NOT EXISTS (
  SELECT 1 FROM documents
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    AND label = 'SD-WAN Site Survey Template'
);

INSERT INTO documents (organization_id, kind, label, url_or_path, source)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'link',
  'Wi-Fi 7 Acceptance Test Results',
  'https://example.com/chr-wifi7-acceptance',
  'manual'
WHERE NOT EXISTS (
  SELECT 1 FROM documents
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    AND label = 'Wi-Fi 7 Acceptance Test Results'
);

-- Notes (mix of user + agent_insight, ages spanning ~45 days).

INSERT INTO notes (organization_id, content, role, confirmed, provenance, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'First scoping meeting on Navisphere refresh. Karen confirmed Q3 budget locked. Mike pushed back on UCS X-series timing — wants pricing held through Sept fiscal-year-end.',
  'user', 1, NULL, datetime('now', '-44 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    AND content LIKE 'First scoping meeting on Navisphere refresh%'
);

INSERT INTO notes (organization_id, content, role, confirmed, provenance, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Diego confirmed Cisco can hold C-series quotes through 9/30. Sent updated bundle pricing back to Mike with the held config. Asked Karen to copy procurement.',
  'user', 1, NULL, datetime('now', '-31 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    AND content LIKE 'Diego confirmed Cisco can hold%'
);

INSERT INTO notes (organization_id, content, role, confirmed, provenance, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'C.H. Robinson''s decision rhythm: Mike (network) gates technical, Karen (infra) gates capex. Jenna (apps) is consulted on platform fit but not blocking. Plan for two-tier signoff on Navisphere.',
  'agent_insight', 1, '{"tool":"record_insight","source_thread_id":2}', datetime('now', '-20 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    AND content LIKE 'C.H. Robinson''s decision rhythm%'
);

INSERT INTO notes (organization_id, content, role, confirmed, provenance, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'SD-WAN site count clarified at 122 (108 DCs + 14 cross-dock terminals). Sent Meraki sizing spreadsheet to Mike. Asked for circuit list to scope WAN bandwidth.',
  'user', 1, NULL, datetime('now', '-12 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    AND content LIKE 'SD-WAN site count clarified%'
);

INSERT INTO notes (organization_id, content, role, confirmed, provenance, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Karen mentioned in passing that the board is pushing for measurable shipment-visibility latency improvements. Worth framing the Navisphere refresh story around end-customer SLA, not just infra cost.',
  'agent_insight', 0, '{"tool":"record_insight","source_thread_id":2}', datetime('now', '-3 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    AND content LIKE 'Karen mentioned in passing%'
);

INSERT INTO notes (organization_id, content, role, confirmed, provenance, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Pure Storage was in the room at the last QBR via Jenna''s team. Worth checking whether they''re influencing the storage tier decision before we lock NetApp ONTAP.',
  'agent_insight', 0, '{"tool":"record_insight","source_thread_id":2}', datetime('now', '-2 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    AND content LIKE 'Pure Storage was in the room%'
);

-- Agent thread + a couple of messages.

INSERT INTO agent_threads (organization_id, title, last_message_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Navisphere refresh planning',
  datetime('now', '-2 days')
WHERE NOT EXISTS (
  SELECT 1 FROM agent_threads
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);

INSERT INTO agent_messages (thread_id, role, content)
SELECT
  (SELECT id FROM agent_threads
   WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
   ORDER BY id LIMIT 1),
  'user',
  'Summarize where we are on the Navisphere refresh and what to drive this week.'
WHERE EXISTS (
  SELECT 1 FROM agent_threads
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
)
AND NOT EXISTS (
  SELECT 1 FROM agent_messages
  WHERE thread_id = (
    SELECT id FROM agent_threads
    WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    ORDER BY id LIMIT 1
  )
  AND content LIKE 'Summarize where we are%'
);

INSERT INTO agent_messages (thread_id, role, content)
SELECT
  (SELECT id FROM agent_threads
   WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
   ORDER BY id LIMIT 1),
  'assistant',
  'Active: Navisphere Platform Refresh (Karen, capex locked Q3; Cisco quotes held through 9/30 via Diego). Open: Pure Storage influence on storage tier — the unconfirmed insight from 2 days ago is worth chasing before the NetApp ONTAP design is signed off. This week: confirm the SLA framing Karen alluded to (measurable shipment-visibility latency) and re-pitch the refresh story to that angle, then send Mike the SD-WAN bandwidth scoping based on the 122-site count. Risk: Pure could derail storage choice if not addressed.'
WHERE EXISTS (
  SELECT 1 FROM agent_threads
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
)
AND NOT EXISTS (
  SELECT 1 FROM agent_messages
  WHERE thread_id = (
    SELECT id FROM agent_threads
    WHERE organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
    ORDER BY id LIMIT 1
  )
  AND content LIKE 'Active: Navisphere Platform Refresh%'
);
