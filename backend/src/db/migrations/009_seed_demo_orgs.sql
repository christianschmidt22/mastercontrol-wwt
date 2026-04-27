-- 009_seed_demo_orgs.sql
--
-- Seeds realistic demo data for two customer accounts: Fairview Health Services
-- and CHR (Catholic Health Initiatives Regional). Every INSERT is wrapped in
-- WHERE NOT EXISTS so re-running this migration (or starting a DB that already
-- has these orgs) is a safe no-op.
--
-- Inserted per org:
--   Fairview: 1 org · 4 contacts · 3 projects · 3 documents · 6 notes
--             1 agent thread · 4 agent messages (2 user/assistant pairs)
--   CHR:      1 org · 3 contacts · 2 projects · 2 documents · 5 notes
--             1 agent thread · 2 agent messages (1 user/assistant pair)
--
-- Time-relative timestamps use datetime('now', '-N days') so the dashboard's
-- "recent" feeds populate with sensibly aged entries on first boot.

-- =============================================================================
-- ORG 1: Fairview Health Services
-- =============================================================================

INSERT INTO organizations (type, name, metadata)
SELECT
  'customer',
  'Fairview Health Services',
  '{"summary":"Twin Cities health system. Active EHR migration. Network refresh pending."}'
WHERE NOT EXISTS (
  SELECT 1 FROM organizations WHERE name = 'Fairview Health Services'
);

-- Contacts ---------------------------------------------------------------

INSERT INTO contacts (organization_id, name, title, email, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'Sarah Chen',
  'Director of Infrastructure',
  'sarah.chen@fairview.org',
  'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'sarah.chen@fairview.org'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
);

INSERT INTO contacts (organization_id, name, title, email, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'Marcus Webb',
  'VP Networking',
  'marcus.webb@fairview.org',
  'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'marcus.webb@fairview.org'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
);

INSERT INTO contacts (organization_id, name, title, email, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'Priya Subramanian',
  'Cisco Technical Solutions Architect',
  'priya.subramanian@external.com',
  'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'priya.subramanian@external.com'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
);

INSERT INTO contacts (organization_id, name, title, email, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'Tom Reed',
  'NetApp Account Manager',
  'tom.reed@netapp.com',
  'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'tom.reed@netapp.com'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
);

-- Projects ---------------------------------------------------------------

INSERT INTO projects (organization_id, name, status, description)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'Network Refresh — Hospital Campus',
  'active',
  'Replace 2014-era Catalyst switches with C9300/C9500. Phased over Q3-Q4.'
WHERE NOT EXISTS (
  SELECT 1 FROM projects
  WHERE name = 'Network Refresh — Hospital Campus'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
);

INSERT INTO projects (organization_id, name, status, description)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'Epic EHR Bandwidth Upgrade',
  'planning',
  'Pre-cutover capacity planning. WAN circuits to upgrade by August.'
WHERE NOT EXISTS (
  SELECT 1 FROM projects
  WHERE name = 'Epic EHR Bandwidth Upgrade'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
);

INSERT INTO projects (organization_id, name, status, description)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'DR Site Refresh',
  'done',
  'Completed 2026-01. NetApp AFF + UCS replaced legacy SAN.'
WHERE NOT EXISTS (
  SELECT 1 FROM projects
  WHERE name = 'DR Site Refresh'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
);

-- Documents --------------------------------------------------------------

INSERT INTO documents (organization_id, kind, label, url_or_path)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'link',
  'BoM — Q3 Network Refresh',
  'https://example.com/fairview-bom-q3'
WHERE NOT EXISTS (
  SELECT 1 FROM documents
  WHERE url_or_path = 'https://example.com/fairview-bom-q3'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
);

INSERT INTO documents (organization_id, kind, label, url_or_path)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'link',
  'Epic Bandwidth Capacity Plan',
  'https://example.com/fairview-epic-cap'
WHERE NOT EXISTS (
  SELECT 1 FROM documents
  WHERE url_or_path = 'https://example.com/fairview-epic-cap'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
);

INSERT INTO documents (organization_id, kind, label, url_or_path)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'link',
  'DR Site Acceptance Doc',
  'https://example.com/fairview-dr'
WHERE NOT EXISTS (
  SELECT 1 FROM documents
  WHERE url_or_path = 'https://example.com/fairview-dr'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
);

-- Notes ------------------------------------------------------------------

INSERT INTO notes (organization_id, role, confirmed, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'user',
  1,
  'Initial discovery call. Sarah confirmed Q3 budget allocated. Asked for Cisco SmartNet quote within 2 weeks.',
  datetime('now', '-30 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
    AND created_at = datetime('now', '-30 days')
    AND role = 'user'
    AND content LIKE 'Initial discovery call%'
);

INSERT INTO notes (organization_id, role, confirmed, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'user',
  1,
  'Follow-up: Sarah needs the BoM split between capex and opex line items per their accounting team.',
  datetime('now', '-22 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
    AND created_at = datetime('now', '-22 days')
    AND role = 'user'
    AND content LIKE 'Follow-up: Sarah%'
);

INSERT INTO notes (organization_id, role, confirmed, provenance, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'agent_insight',
  1,
  '{"tool":"record_insight","source_thread_id":1}',
  'Fairview consistently prefers Cisco gear for switching. Avoid leading with Arista even on greenfield asks.',
  datetime('now', '-14 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
    AND created_at = datetime('now', '-14 days')
    AND role = 'agent_insight'
    AND content LIKE 'Fairview consistently prefers Cisco%'
);

INSERT INTO notes (organization_id, role, confirmed, provenance, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'agent_insight',
  0,
  '{"tool":"record_insight","source_thread_id":1}',
  'Marcus has been pushing for a NetApp + Cisco UCS refresh in DR. Worth a follow-up call to scope.',
  datetime('now', '-3 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
    AND created_at = datetime('now', '-3 days')
    AND role = 'agent_insight'
    AND content LIKE 'Marcus has been pushing%'
);

INSERT INTO notes (organization_id, role, confirmed, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'user',
  1,
  'Sent Tom Reed updated NetApp AFF quote for FY27 budget cycle. Awaiting his channel registration.',
  datetime('now', '-2 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
    AND created_at = datetime('now', '-2 days')
    AND role = 'user'
    AND content LIKE 'Sent Tom Reed%'
);

INSERT INTO notes (organization_id, role, confirmed, provenance, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'agent_insight',
  0,
  '{"tool":"record_insight","source_thread_id":1}',
  'Sarah mentioned at the lunch meeting that Fairview''s CFO wants a 3-year roadmap presentation. We should propose a discovery week.',
  datetime('now', '-1 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
    AND created_at = datetime('now', '-1 days')
    AND role = 'agent_insight'
    AND content LIKE 'Sarah mentioned at the lunch%'
);

-- Agent thread + messages ------------------------------------------------

INSERT INTO agent_threads (organization_id, title, last_message_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'Network refresh scope + EHR prep',
  datetime('now', '-1 days')
WHERE NOT EXISTS (
  SELECT 1 FROM agent_threads
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
    AND title = 'Network refresh scope + EHR prep'
);

INSERT INTO agent_messages (thread_id, role, content, tool_calls, created_at)
SELECT
  (SELECT id FROM agent_threads
   WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
     AND title = 'Network refresh scope + EHR prep'),
  'user',
  'What should I prioritize in my next call with Sarah — the BoM detail request or locking down the EHR cutover timeline?',
  NULL,
  datetime('now', '-1 days', '-10 minutes')
WHERE NOT EXISTS (
  SELECT 1 FROM agent_messages
  WHERE thread_id = (
    SELECT id FROM agent_threads
    WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
      AND title = 'Network refresh scope + EHR prep'
  )
  AND role = 'user'
  AND content LIKE 'What should I prioritize%'
);

INSERT INTO agent_messages (thread_id, role, content, tool_calls, created_at)
SELECT
  (SELECT id FROM agent_threads
   WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
     AND title = 'Network refresh scope + EHR prep'),
  'assistant',
  'Given the timelines, I''d lead with the BoM capex/opex split — Sarah''s accounting team is the blockers on Q3 budget approval, and without that sign-off the hardware PO won''t move. The EHR cutover is August, so you have a few more weeks before that becomes urgent. Lock the BoM first, then pivot to the EHR bandwidth scope at the end of the call while you have her attention.',
  NULL,
  datetime('now', '-1 days', '-9 minutes')
WHERE NOT EXISTS (
  SELECT 1 FROM agent_messages
  WHERE thread_id = (
    SELECT id FROM agent_threads
    WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
      AND title = 'Network refresh scope + EHR prep'
  )
  AND role = 'assistant'
  AND content LIKE 'Given the timelines%'
);

INSERT INTO agent_messages (thread_id, role, content, tool_calls, created_at)
SELECT
  (SELECT id FROM agent_threads
   WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
     AND title = 'Network refresh scope + EHR prep'),
  'user',
  'Marcus mentioned DR in passing last week. Is there an upsell angle there?',
  NULL,
  datetime('now', '-1 days', '-5 minutes')
WHERE NOT EXISTS (
  SELECT 1 FROM agent_messages
  WHERE thread_id = (
    SELECT id FROM agent_threads
    WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
      AND title = 'Network refresh scope + EHR prep'
  )
  AND role = 'user'
  AND content LIKE 'Marcus mentioned DR%'
);

INSERT INTO agent_messages (thread_id, role, content, tool_calls, created_at)
SELECT
  (SELECT id FROM agent_threads
   WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
     AND title = 'Network refresh scope + EHR prep'),
  'assistant',
  'Yes — the completed DR Site Refresh (NetApp AFF + UCS) sets up a natural follow-on conversation. Marcus has been signaling interest in expanding that footprint. A good angle is a "DR readiness review" framed around the EHR go-live: hospitals typically want a tested DR run within 90 days of an EHR cutover. That gives you a concrete hook to scope a phase 2 without it feeling like a cold upsell.',
  NULL,
  datetime('now', '-1 days', '-4 minutes')
WHERE NOT EXISTS (
  SELECT 1 FROM agent_messages
  WHERE thread_id = (
    SELECT id FROM agent_threads
    WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
      AND title = 'Network refresh scope + EHR prep'
  )
  AND role = 'assistant'
  AND content LIKE 'Yes — the completed DR%'
);

-- =============================================================================
-- ORG 2: CHR (Catholic Health Initiatives Regional)
-- =============================================================================

INSERT INTO organizations (type, name, metadata)
SELECT
  'customer',
  'CHR (Catholic Health Initiatives Regional)',
  '{"summary":"Multi-state Catholic health system. Active VMware-to-Nutanix migration discussion. Renewal cycle in Q4."}'
WHERE NOT EXISTS (
  SELECT 1 FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)'
);

-- Contacts ---------------------------------------------------------------

INSERT INTO contacts (organization_id, name, title, email, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)'),
  'Diane Kowalski',
  'IT Operations Director',
  'diane.kowalski@chr.org',
  'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'diane.kowalski@chr.org'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
);

INSERT INTO contacts (organization_id, name, title, email, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)'),
  'Raj Patel',
  'Senior Network Engineer',
  'raj.patel@chr.org',
  'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'raj.patel@chr.org'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
);

INSERT INTO contacts (organization_id, name, title, email, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)'),
  'Anders Nilsson',
  'Nutanix Channel SE',
  'anders.nilsson@nutanix.com',
  'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'anders.nilsson@nutanix.com'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
);

-- Projects ---------------------------------------------------------------

INSERT INTO projects (organization_id, name, status, description)
SELECT
  (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)'),
  'Nutanix Cluster Pilot',
  'active',
  'Pilot deployment in regional data center. 6-node AHV cluster, target go-live Q3.'
WHERE NOT EXISTS (
  SELECT 1 FROM projects
  WHERE name = 'Nutanix Cluster Pilot'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
);

INSERT INTO projects (organization_id, name, status, description)
SELECT
  (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)'),
  'VMware ELA Renewal Decision',
  'planning',
  'Diane wants migration scenarios costed before signing the 3-year ELA in November.'
WHERE NOT EXISTS (
  SELECT 1 FROM projects
  WHERE name = 'VMware ELA Renewal Decision'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
);

-- Documents --------------------------------------------------------------

INSERT INTO documents (organization_id, kind, label, url_or_path)
SELECT
  (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)'),
  'link',
  'Nutanix Pilot Architecture',
  'https://example.com/chr-nutanix-arch'
WHERE NOT EXISTS (
  SELECT 1 FROM documents
  WHERE url_or_path = 'https://example.com/chr-nutanix-arch'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
);

INSERT INTO documents (organization_id, kind, label, url_or_path)
SELECT
  (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)'),
  'link',
  'VMware vs Nutanix TCO Model',
  'https://example.com/chr-tco'
WHERE NOT EXISTS (
  SELECT 1 FROM documents
  WHERE url_or_path = 'https://example.com/chr-tco'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
);

-- Notes ------------------------------------------------------------------

INSERT INTO notes (organization_id, role, confirmed, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)'),
  'user',
  1,
  'First Nutanix briefing with Diane and Raj. Raj is technical and asks pointed performance questions. Diane is decision-maker.',
  datetime('now', '-45 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
    AND created_at = datetime('now', '-45 days')
    AND role = 'user'
    AND content LIKE 'First Nutanix briefing%'
);

INSERT INTO notes (organization_id, role, confirmed, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)'),
  'user',
  1,
  'Anders ran the demo on AHV. Raj was impressed with one-click upgrades. Cost question still open — Diane wants 3-year TCO.',
  datetime('now', '-28 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
    AND created_at = datetime('now', '-28 days')
    AND role = 'user'
    AND content LIKE 'Anders ran the demo%'
);

INSERT INTO notes (organization_id, role, confirmed, provenance, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)'),
  'agent_insight',
  1,
  '{"tool":"record_insight","source_thread_id":2}',
  'CHR is highly cost-sensitive. Lead with TCO modeling, not feature comparisons. Their CFO has explicit veto on infrastructure spend over $1M.',
  datetime('now', '-20 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
    AND created_at = datetime('now', '-20 days')
    AND role = 'agent_insight'
    AND content LIKE 'CHR is highly cost-sensitive%'
);

INSERT INTO notes (organization_id, role, confirmed, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)'),
  'user',
  1,
  'Sent the TCO model with 3 scenarios (replace 100%, hybrid, status-quo). Diane will review with finance and respond by month-end.',
  datetime('now', '-7 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
    AND created_at = datetime('now', '-7 days')
    AND role = 'user'
    AND content LIKE 'Sent the TCO model%'
);

INSERT INTO notes (organization_id, role, confirmed, provenance, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)'),
  'agent_insight',
  0,
  '{"tool":"record_insight","source_thread_id":2}',
  'Diane''s brother-in-law works at Pure Storage. Worth checking whether Pure has been in any of these conversations.',
  datetime('now', '-2 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
    AND created_at = datetime('now', '-2 days')
    AND role = 'agent_insight'
    AND content LIKE 'Diane''s brother-in-law%'
);

-- Agent thread + messages ------------------------------------------------

INSERT INTO agent_threads (organization_id, title, last_message_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)'),
  'VMware migration cost modeling',
  datetime('now', '-2 days')
WHERE NOT EXISTS (
  SELECT 1 FROM agent_threads
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
    AND title = 'VMware migration cost modeling'
);

INSERT INTO agent_messages (thread_id, role, content, tool_calls, created_at)
SELECT
  (SELECT id FROM agent_threads
   WHERE organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
     AND title = 'VMware migration cost modeling'),
  'user',
  'Diane has not responded to the TCO model yet. How should I follow up without being pushy?',
  NULL,
  datetime('now', '-2 days', '-8 minutes')
WHERE NOT EXISTS (
  SELECT 1 FROM agent_messages
  WHERE thread_id = (
    SELECT id FROM agent_threads
    WHERE organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
      AND title = 'VMware migration cost modeling'
  )
  AND role = 'user'
  AND content LIKE 'Diane has not responded%'
);

INSERT INTO agent_messages (thread_id, role, content, tool_calls, created_at)
SELECT
  (SELECT id FROM agent_threads
   WHERE organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
     AND title = 'VMware migration cost modeling'),
  'assistant',
  'Diane said "respond by month-end" — so the first move is to wait until month-end passes before nudging. When you do follow up, anchor to the VMware ELA deadline in November rather than to your sales cycle. Something like: "Wanted to check in since the ELA decision window is tightening — happy to walk through any of the three scenarios with finance if that''s useful." That keeps the pressure on the business timeline, not on you.',
  NULL,
  datetime('now', '-2 days', '-7 minutes')
WHERE NOT EXISTS (
  SELECT 1 FROM agent_messages
  WHERE thread_id = (
    SELECT id FROM agent_threads
    WHERE organization_id = (SELECT id FROM organizations WHERE name = 'CHR (Catholic Health Initiatives Regional)')
      AND title = 'VMware migration cost modeling'
  )
  AND role = 'assistant'
  AND content LIKE 'Diane said "respond by month-end"%'
);
