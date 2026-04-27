-- 011_seed_tasks.sql
-- Seed a handful of open tasks so the HomePage "Today's Tasks" tile is
-- populated on first boot.  All INSERTs guard with WHERE NOT EXISTS on
-- the title AND require the target org row to exist, making this
-- idempotent and safe against in-memory test databases that have no
-- pre-seeded orgs.

-- Fairview Health Services (org_id = 1)
INSERT INTO tasks (organization_id, title, status, due_date)
SELECT 1, 'Send Cisco SmartNet quote to Sarah', 'open', date('now')
WHERE NOT EXISTS (
  SELECT 1 FROM tasks WHERE title = 'Send Cisco SmartNet quote to Sarah'
) AND EXISTS (
  SELECT 1 FROM organizations WHERE id = 1
);

INSERT INTO tasks (organization_id, title, status, due_date)
SELECT 1, 'Schedule DR architecture review with Marcus', 'open', date('now', '+1 day')
WHERE NOT EXISTS (
  SELECT 1 FROM tasks WHERE title = 'Schedule DR architecture review with Marcus'
) AND EXISTS (
  SELECT 1 FROM organizations WHERE id = 1
);

-- C.H. Robinson (org_id = 2)
INSERT INTO tasks (organization_id, title, status, due_date)
SELECT 2, 'Confirm circuit list with Mike before QBR', 'open', date('now')
WHERE NOT EXISTS (
  SELECT 1 FROM tasks WHERE title = 'Confirm circuit list with Mike before QBR'
) AND EXISTS (
  SELECT 1 FROM organizations WHERE id = 2
);

INSERT INTO tasks (organization_id, title, status, due_date)
SELECT 2, 'Send NetApp ONTAP sizing worksheet to Karen', 'open', date('now', '+3 days')
WHERE NOT EXISTS (
  SELECT 1 FROM tasks WHERE title = 'Send NetApp ONTAP sizing worksheet to Karen'
) AND EXISTS (
  SELECT 1 FROM organizations WHERE id = 2
);
