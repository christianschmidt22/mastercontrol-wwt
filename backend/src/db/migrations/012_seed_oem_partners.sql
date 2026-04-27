-- 012_seed_oem_partners.sql
--
-- Seeds three OEM partner orgs so the OEM page renders with realistic data
-- instead of the empty-state on first boot.
--
-- Inserted per org:
--   Cisco:   1 org · 3 contacts · 2 projects · 2 documents · 5 notes
--            1 agent thread
--   NetApp:  1 org · 2 contacts · 1 project  · 1 document  · 4 notes
--            1 agent thread
--   Nutanix: 1 org · 2 contacts · 1 project  · 0 documents · 3 notes
--            1 agent thread
--
-- note_mentions cross-refs:
--   Fairview note 'Sent Tom Reed updated NetApp AFF quote...' → NetApp
--   C.H. Robinson note 'Diego confirmed Cisco can hold...' → Cisco
--   These are seeded via subquery so they resolve the correct row IDs
--   without hardcoding autoincrement values.
--
-- note_mentions table exists in schema.sql (PRIMARY KEY (note_id, mentioned_org_id))
-- and is used by the CrossRefsPanel on the OEM page.
--
-- Every INSERT is guarded by WHERE NOT EXISTS — idempotent on re-run.
-- Time-relative timestamps use datetime('now', '-N days').

-- =============================================================================
-- ORG 1: Cisco
-- =============================================================================

INSERT INTO organizations (type, name, metadata)
SELECT
  'oem',
  'Cisco',
  '{"summary":"Cisco Systems. Switching/routing/Catalyst, Meraki, SD-WAN, UCS. Strongest leverage for Fairview network refresh and C.H. Robinson SD-WAN rollout."}'
WHERE NOT EXISTS (
  SELECT 1 FROM organizations WHERE name = 'Cisco'
);

-- Contacts ---------------------------------------------------------------

INSERT INTO contacts (organization_id, name, title, email, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cisco'),
  'Diego Alvarez',
  'Channel Account Manager',
  'diego.alvarez@cisco.com',
  'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'diego.alvarez@cisco.com'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Cisco')
);

INSERT INTO contacts (organization_id, name, title, email, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cisco'),
  'Priya Subramanian',
  'Technical Solutions Architect',
  'priya.subramanian@cisco.com',
  'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'priya.subramanian@cisco.com'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Cisco')
);

INSERT INTO contacts (organization_id, name, title, email, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cisco'),
  'Bob Kosciak',
  'Catalyst Product Specialist',
  'bob.kosciak@cisco.com',
  'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'bob.kosciak@cisco.com'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Cisco')
);

-- Projects ---------------------------------------------------------------

INSERT INTO projects (organization_id, name, status, description)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cisco'),
  'C9300 / C9500 BoM Modeling for Fairview',
  'active',
  'Build phased BoM for Fairview''s hospital campus refresh. Diego owns channel registration.'
WHERE NOT EXISTS (
  SELECT 1 FROM projects
  WHERE name = 'C9300 / C9500 BoM Modeling for Fairview'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Cisco')
);

INSERT INTO projects (organization_id, name, status, description)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cisco'),
  'Meraki Sizing Pass for C.H. Robinson SD-WAN',
  'planning',
  'Spec MX appliances for ~120 distribution centers. Mike Lindgren is the customer-side lead.'
WHERE NOT EXISTS (
  SELECT 1 FROM projects
  WHERE name = 'Meraki Sizing Pass for C.H. Robinson SD-WAN'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Cisco')
);

-- Documents --------------------------------------------------------------

INSERT INTO documents (organization_id, kind, label, url_or_path, source)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cisco'),
  'link',
  'Cisco Refresh Program — current promo terms',
  'https://example.com/cisco-promos',
  'manual'
WHERE NOT EXISTS (
  SELECT 1 FROM documents
  WHERE url_or_path = 'https://example.com/cisco-promos'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Cisco')
);

INSERT INTO documents (organization_id, kind, label, url_or_path, source)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cisco'),
  'link',
  'Catalyst 9300/9500 datasheets',
  'https://example.com/cisco-c9300-datasheet',
  'manual'
WHERE NOT EXISTS (
  SELECT 1 FROM documents
  WHERE url_or_path = 'https://example.com/cisco-c9300-datasheet'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Cisco')
);

-- Notes ------------------------------------------------------------------

INSERT INTO notes (organization_id, role, confirmed, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cisco'),
  'user',
  1,
  'Diego confirmed Q3 promo terms hold through 9/30. Sent to Mike for budget.',
  datetime('now', '-28 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Cisco')
    AND content LIKE 'Diego confirmed Q3 promo terms hold%'
);

INSERT INTO notes (organization_id, role, confirmed, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cisco'),
  'user',
  1,
  'Bob walked me through C9500-32C upgrade path for Fairview''s distribution layer. Sent specs to Sarah.',
  datetime('now', '-14 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Cisco')
    AND content LIKE 'Bob walked me through C9500-32C%'
);

INSERT INTO notes (organization_id, role, confirmed, provenance, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cisco'),
  'agent_insight',
  1,
  '{"tool":"record_insight","source_thread_id":null}',
  'Cisco''s channel-incentive cycle resets each fiscal quarter (Aug, Nov, Feb, May). Time the BoM submissions inside those windows for max margin.',
  datetime('now', '-10 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Cisco')
    AND content LIKE 'Cisco''s channel-incentive cycle resets%'
);

INSERT INTO notes (organization_id, role, confirmed, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cisco'),
  'user',
  1,
  'Priya offered to do a Meraki demo for C.H. Robinson. Need to coordinate with Diego on registration.',
  datetime('now', '-3 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Cisco')
    AND content LIKE 'Priya offered to do a Meraki demo%'
);

INSERT INTO notes (organization_id, role, confirmed, provenance, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cisco'),
  'agent_insight',
  0,
  '{"tool":"record_insight","source_thread_id":null}',
  'Priya is moving to Arista in Q3 per LinkedIn. Worth raising channel-relationship plan with Diego before that handover.',
  datetime('now', '-1 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Cisco')
    AND content LIKE 'Priya is moving to Arista%'
);

-- Agent thread -----------------------------------------------------------

INSERT INTO agent_threads (organization_id, title, last_message_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cisco'),
  'Channel strategy and BoM planning',
  datetime('now', '-3 days')
WHERE NOT EXISTS (
  SELECT 1 FROM agent_threads
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Cisco')
);

-- =============================================================================
-- ORG 2: NetApp
-- =============================================================================

INSERT INTO organizations (type, name, metadata)
SELECT
  'oem',
  'NetApp',
  '{"summary":"NetApp. ONTAP / AFF storage. Active on Fairview DR refresh; under evaluation against Pure for C.H. Robinson Navisphere refresh."}'
WHERE NOT EXISTS (
  SELECT 1 FROM organizations WHERE name = 'NetApp'
);

-- Contacts ---------------------------------------------------------------

INSERT INTO contacts (organization_id, name, title, email, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'NetApp'),
  'Tom Reed',
  'Account Manager',
  'tom.reed@netapp.com',
  'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'tom.reed@netapp.com'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'NetApp')
);

INSERT INTO contacts (organization_id, name, title, email, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'NetApp'),
  'Jenna Liu',
  'Storage Specialist SE',
  'jenna.liu@netapp.com',
  'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'jenna.liu@netapp.com'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'NetApp')
);

-- Projects ---------------------------------------------------------------

INSERT INTO projects (organization_id, name, status, description)
SELECT
  (SELECT id FROM organizations WHERE name = 'NetApp'),
  'AFF Sizing for C.H. Robinson Navisphere',
  'active',
  'Sizing & TCO model. Tom is leading. Pure Storage is a competing track — see C.H. Robinson notes.'
WHERE NOT EXISTS (
  SELECT 1 FROM projects
  WHERE name = 'AFF Sizing for C.H. Robinson Navisphere'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'NetApp')
);

-- Documents --------------------------------------------------------------

INSERT INTO documents (organization_id, kind, label, url_or_path, source)
SELECT
  (SELECT id FROM organizations WHERE name = 'NetApp'),
  'link',
  'NetApp AFF C-series datasheet',
  'https://example.com/netapp-aff-c',
  'manual'
WHERE NOT EXISTS (
  SELECT 1 FROM documents
  WHERE url_or_path = 'https://example.com/netapp-aff-c'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'NetApp')
);

-- Notes ------------------------------------------------------------------

INSERT INTO notes (organization_id, role, confirmed, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'NetApp'),
  'user',
  1,
  'Tom committed FY27 budget pricing through Sept end. Sent to Karen at C.H. Robinson.',
  datetime('now', '-22 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'NetApp')
    AND content LIKE 'Tom committed FY27 budget pricing%'
);

INSERT INTO notes (organization_id, role, confirmed, provenance, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'NetApp'),
  'agent_insight',
  1,
  '{"tool":"record_insight","source_thread_id":null}',
  'NetApp''s quote held flat for 90 days; Pure''s typically 60. Use that as a closing wedge if pricing gets close.',
  datetime('now', '-10 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'NetApp')
    AND content LIKE 'NetApp''s quote held flat for 90 days%'
);

INSERT INTO notes (organization_id, role, confirmed, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'NetApp'),
  'user',
  1,
  'Jenna ran the AFF C800 demo for C.H. Robinson. Karen raised performance-vs-cost tradeoff questions.',
  datetime('now', '-5 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'NetApp')
    AND content LIKE 'Jenna ran the AFF C800 demo%'
);

INSERT INTO notes (organization_id, role, confirmed, provenance, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'NetApp'),
  'agent_insight',
  0,
  '{"tool":"record_insight","source_thread_id":null}',
  'C.H. Robinson''s Jenna Park has been historically pro-Pure. Worth checking Tom''s view before pushing AFF as the only option.',
  datetime('now', '-1 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'NetApp')
    AND content LIKE 'C.H. Robinson''s Jenna Park has been historically pro-Pure%'
);

-- Agent thread -----------------------------------------------------------

INSERT INTO agent_threads (organization_id, title, last_message_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'NetApp'),
  'Storage competitive positioning',
  datetime('now', '-5 days')
WHERE NOT EXISTS (
  SELECT 1 FROM agent_threads
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'NetApp')
);

-- =============================================================================
-- ORG 3: Nutanix
-- =============================================================================

INSERT INTO organizations (type, name, metadata)
SELECT
  'oem',
  'Nutanix',
  '{"summary":"Nutanix. AHV / Prism. Discussion with C.H. Robinson stalled but warm — they declined the pilot but kept the door open for FY28."}'
WHERE NOT EXISTS (
  SELECT 1 FROM organizations WHERE name = 'Nutanix'
);

-- Contacts ---------------------------------------------------------------

INSERT INTO contacts (organization_id, name, title, email, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Nutanix'),
  'Anders Nilsson',
  'Channel Systems Engineer',
  'anders.nilsson@nutanix.com',
  'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'anders.nilsson@nutanix.com'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Nutanix')
);

INSERT INTO contacts (organization_id, name, title, email, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Nutanix'),
  'Carla Sosa',
  'Account Director',
  'carla.sosa@nutanix.com',
  'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'carla.sosa@nutanix.com'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Nutanix')
);

-- Projects ---------------------------------------------------------------

INSERT INTO projects (organization_id, name, status, description)
SELECT
  (SELECT id FROM organizations WHERE name = 'Nutanix'),
  'C.H. Robinson AHV Re-engagement (FY28)',
  'on_hold',
  'Re-open the conversation in Q1 FY28 once VMware ELA decision is locked. Anders has the relationship.'
WHERE NOT EXISTS (
  SELECT 1 FROM projects
  WHERE name = 'C.H. Robinson AHV Re-engagement (FY28)'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Nutanix')
);

-- Notes ------------------------------------------------------------------

INSERT INTO notes (organization_id, role, confirmed, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Nutanix'),
  'user',
  1,
  'Anders ran AHV demo for C.H. Robinson. Raj liked the one-click upgrades; Karen wanted more on TCO.',
  datetime('now', '-60 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Nutanix')
    AND content LIKE 'Anders ran AHV demo for C.H. Robinson%'
);

INSERT INTO notes (organization_id, role, confirmed, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Nutanix'),
  'user',
  1,
  'C.H. Robinson chose to stay on VMware through current ELA. Re-evaluate Q1 FY28.',
  datetime('now', '-45 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Nutanix')
    AND content LIKE 'C.H. Robinson chose to stay on VMware%'
);

INSERT INTO notes (organization_id, role, confirmed, provenance, content, created_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Nutanix'),
  'agent_insight',
  1,
  '{"tool":"record_insight","source_thread_id":null}',
  'Nutanix''s strongest pitch with C.H. Robinson is operational simplicity, not raw cost. Don''t lead with TCO numbers; lead with Day-2 ops story.',
  datetime('now', '-30 days')
WHERE NOT EXISTS (
  SELECT 1 FROM notes
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Nutanix')
    AND content LIKE 'Nutanix''s strongest pitch with C.H. Robinson%'
);

-- Agent thread -----------------------------------------------------------

INSERT INTO agent_threads (organization_id, title, last_message_at)
SELECT
  (SELECT id FROM organizations WHERE name = 'Nutanix'),
  'FY28 re-engagement planning',
  datetime('now', '-30 days')
WHERE NOT EXISTS (
  SELECT 1 FROM agent_threads
  WHERE organization_id = (SELECT id FROM organizations WHERE name = 'Nutanix')
);

-- =============================================================================
-- note_mentions cross-refs
--
-- Wire up existing customer notes that mention OEM partners so the OEM
-- CrossRefsPanel has content to display.
--
-- 1. Fairview note 'Sent Tom Reed updated NetApp AFF quote...' → NetApp
-- 2. C.H. Robinson note 'Diego confirmed Cisco can hold...' → Cisco
-- =============================================================================

INSERT INTO note_mentions (note_id, mentioned_org_id)
SELECT n.id, (SELECT id FROM organizations WHERE name = 'NetApp')
FROM notes n
WHERE n.content LIKE 'Sent Tom Reed updated NetApp AFF quote%'
  AND (SELECT id FROM organizations WHERE name = 'NetApp') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM note_mentions
    WHERE note_id = n.id
      AND mentioned_org_id = (SELECT id FROM organizations WHERE name = 'NetApp')
  );

INSERT INTO note_mentions (note_id, mentioned_org_id)
SELECT n.id, (SELECT id FROM organizations WHERE name = 'Cisco')
FROM notes n
WHERE n.content LIKE 'Diego confirmed Cisco can hold%'
  AND (SELECT id FROM organizations WHERE name = 'Cisco') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM note_mentions
    WHERE note_id = n.id
      AND mentioned_org_id = (SELECT id FROM organizations WHERE name = 'Cisco')
  );
