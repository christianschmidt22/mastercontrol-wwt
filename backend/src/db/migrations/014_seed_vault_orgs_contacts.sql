-- 014_seed_vault_orgs_contacts.sql
--
-- Seeds real organizations and contacts from the WorkVault.
-- All INSERTs are idempotent via WHERE NOT EXISTS.
--
-- Customer orgs added: Entegris, Land O'Lakes, APi Group
-- (Fairview Health Services and C.H. Robinson already exist from 009/010)
--
-- OEM orgs added: Dell Technologies, Cohesity, Commvault, HPE,
--   Broadcom (VCF), Pure Storage, Veeam, Red Hat, Semperis
-- (Cisco, NetApp, Nutanix already exist from 012)
--
-- Customer contacts added for: C.H. Robinson, Fairview, Entegris, Land O'Lakes
-- OEM contacts added for all new OEM orgs, with account assignments.
-- Account assignments recorded in contact_account_assignments.

-- =============================================================================
-- CUSTOMER ORGS
-- =============================================================================

INSERT INTO organizations (type, name, metadata)
SELECT 'customer', 'Entegris',
  '{"industry":"Semiconductor / Materials Manufacturing","website":"entegris.com"}'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'Entegris');

INSERT INTO organizations (type, name, metadata)
SELECT 'customer', 'Land O''Lakes',
  '{"industry":"Agricultural / Dairy Products Manufacturing"}'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'Land O''Lakes');

INSERT INTO organizations (type, name, metadata)
SELECT 'customer', 'APi Group',
  '{"industry":"Building services / Fire protection / Safety"}'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'APi Group');

-- =============================================================================
-- OEM ORGS
-- =============================================================================

INSERT INTO organizations (type, name, metadata)
SELECT 'oem', 'Dell Technologies',
  '{"summary":"VxRail, PowerEdge servers, PowerScale NAS, PowerProtect backup. Primary on CHR cyber resilience and Fairview ECS."}'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'Dell Technologies');

INSERT INTO organizations (type, name, metadata)
SELECT 'oem', 'Cohesity',
  '{"summary":"Data protection, backup, cyber recovery. Primary backup platform at CHR. FortKnox at APi Group."}'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'Cohesity');

INSERT INTO organizations (type, name, metadata)
SELECT 'oem', 'Commvault',
  '{"summary":"Data protection, backup, cyber resilience (CBR). Active at Fairview for capacity/licensing decisions."}'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'Commvault');

INSERT INTO organizations (type, name, metadata)
SELECT 'oem', 'HPE',
  '{"summary":"Servers, compute infrastructure, Alletra MP storage, StoreOnce. Active at Fairview for Synergy/compute refresh."}'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'HPE');

INSERT INTO organizations (type, name, metadata)
SELECT 'oem', 'Broadcom',
  '{"summary":"VMware Cloud Foundation (VCF), vSphere, NSX, Aria. VCF9 upgrade at Fairview; CHR Broadcom operations/logging."}'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'Broadcom');

INSERT INTO organizations (type, name, metadata)
SELECT 'oem', 'Pure Storage',
  '{"summary":"NVMe/all-flash arrays, FlashArray, FlashBlade, DRaaS. Core storage at CHR; SAN at Fairview."}'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'Pure Storage');

INSERT INTO organizations (type, name, metadata)
SELECT 'oem', 'Veeam',
  '{"summary":"Backup, disaster recovery, array orchestration. Primary VMware backup orchestration at CHR."}'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'Veeam');

INSERT INTO organizations (type, name, metadata)
SELECT 'oem', 'Red Hat',
  '{"summary":"RHEL, OpenShift, container orchestration, AI/GPU workloads. OpenShift evaluation at Entegris."}'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'Red Hat');

INSERT INTO organizations (type, name, metadata)
SELECT 'oem', 'Semperis',
  '{"summary":"Active Directory security, cyber resilience, ITDR. AD security evaluation at CHR."}'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE name = 'Semperis');

-- =============================================================================
-- C.H. ROBINSON — real customer contacts
-- (Demo contacts Karen Bergstrom / Mike Lindgren / Jenna Park from 010 remain)
-- =============================================================================

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Cory Degerstrom', 'IT Procurement', 'cory.degerstrom@chrobinson.com', '952-562-8915', 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'cory.degerstrom@chrobinson.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Michael Sebourn', 'Cyber Resilience Lead', 'Michael.Sebourn@chrobinson.com', '650-678-7107', 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'Michael.Sebourn@chrobinson.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Tom Gunstad', 'Infrastructure Engineering / Cloud', NULL, NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE name = 'Tom Gunstad'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Caleb Johnson', 'Manager, Cloud Teams', NULL, NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE name = 'Caleb Johnson'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Jeremy Cass', 'Security Architect', NULL, NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE name = 'Jeremy Cass'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Rex Hartland', 'SAN / Storage', 'rex.hartland@chrobinson.com', NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'rex.hartland@chrobinson.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Sean Christenson', 'Data Protection', 'Sean.Christenson@chrobinson.com', NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'Sean.Christenson@chrobinson.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Mihai Ambrozi', 'Senior Server Storage Admin', 'Mihai.Ambrozi@chrobinson.com', NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'Mihai.Ambrozi@chrobinson.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Michael Roberts', 'Network and Datacenter', 'michael.roberts@chrobinson.com', NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'michael.roberts@chrobinson.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'C.H. Robinson'),
  'Scott Greymont', 'Infrastructure', 'scott.greymont@chrobinson.com', NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'scott.greymont@chrobinson.com'
);

-- =============================================================================
-- FAIRVIEW HEALTH SERVICES — real customer contacts
-- =============================================================================

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'Justin Egge', 'Infrastructure / VCF Lead', 'justin.egge@fairview.org', NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'justin.egge@fairview.org'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'Dan Johnson', 'Principal Systems Engineer', 'dan.johnson@fairview.org', NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'dan.johnson@fairview.org'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'Paul Vang', 'Technology Delivery Manager', 'paul.vang@fairview.org', NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'paul.vang@fairview.org'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'Theo Henderson', 'Storage Services', 'theo.henderson@fairview.org', '629-234-4967', 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'theo.henderson@fairview.org'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'Jay Maxey', 'Storage / Networking', 'jay.maxey@fairview.org', NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'jay.maxey@fairview.org'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'Andrew Homich', 'Infrastructure', 'andrew.homich@fairview.org', NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'andrew.homich@fairview.org'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Fairview Health Services'),
  'Jason Brown', 'Networking', 'jason.brown@fairview.org', NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE email = 'jason.brown@fairview.org'
);

-- =============================================================================
-- ENTEGRIS — customer contacts
-- =============================================================================

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Entegris'),
  'Chris Ebright', 'Principal Server Architecture', NULL, NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE name = 'Chris Ebright'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Entegris')
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Entegris'),
  'Chris Weis', 'GSA Cloud / Infra Team Lead', NULL, NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE name = 'Chris Weis'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Entegris')
);

-- =============================================================================
-- LAND O'LAKES — customer contacts
-- =============================================================================

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Land O''Lakes'),
  'Taylor Martin', 'Chief Architect (OT)', NULL, NULL, 'account'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE name = 'Taylor Martin'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Land O''Lakes')
);

-- =============================================================================
-- DELL TECHNOLOGIES — OEM contacts
-- =============================================================================

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Dell Technologies'),
  'Nick Sampeck', 'Account Executive', 'Nick.Sampeck@Dell.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'Nick.Sampeck@Dell.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Dell Technologies'),
  'Marco Fedo', 'Account Executive, Enterprise', 'Marco.Fedo@Dell.com', '612-300-4773', 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'Marco.Fedo@Dell.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Dell Technologies'),
  'Jessica Murray', 'Direct Account Manager', 'Jessica.Murray@Dell.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'Jessica.Murray@Dell.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Dell Technologies'),
  'Paul Hokanson', 'Advisory SE, Security & Resilience', 'Paul.Hokanson@dell.com', '651-341-4615', 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'Paul.Hokanson@dell.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Dell Technologies'),
  'John Banks', 'Senior AE, Security & Resiliency', 'John.Banks@dell.com', '218-310-0985', 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'John.Banks@dell.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Dell Technologies'),
  'Rick Woo', 'Cyber Resiliency Field CISO', 'Rick.Woo@dell.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'Rick.Woo@dell.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Dell Technologies'),
  'Xavier Chapa', 'Resiliency Principal', 'Xavier.Chapa@Dell.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'Xavier.Chapa@Dell.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Dell Technologies'),
  'Brad Wenzel', 'Enterprise Innovation Architect', 'brad.wenzel@dell.com', '651-202-9917', 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'brad.wenzel@dell.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Dell Technologies'),
  'Justin W. Anderson', 'ECS Specialist', 'Justin.W.Anderson@Dell.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'Justin.W.Anderson@Dell.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Dell Technologies'),
  'Irma Widener', 'Quoting / Sales', 'Irma.Widener@Dell.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'Irma.Widener@Dell.com'
);

-- =============================================================================
-- COHESITY — OEM contacts
-- =============================================================================

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cohesity'),
  'Aaron Laine', 'Cyber Resilience Executive', 'aaron.laine@cohesity.com', '651-283-2135', 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'aaron.laine@cohesity.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cohesity'),
  'Ryan Linwood', 'Strategic Sales Engineer', 'ryan.linwood@cohesity.com', '612-206-1291', 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'ryan.linwood@cohesity.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cohesity'),
  'Robert Gibson', 'TAM', 'robert.gibson@cohesity.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'robert.gibson@cohesity.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cohesity'),
  'Lucas Broich', 'TAM', 'lbroich@cohesity.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'lbroich@cohesity.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cohesity'),
  'Casey Sofka', 'Renewal Account Rep', 'casey.sofka@cohesity.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'casey.sofka@cohesity.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cohesity'),
  'Tony VanDemark', 'Sales / Technical', 'tony.vandemark@cohesity.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'tony.vandemark@cohesity.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cohesity'),
  'Kelly Regan', 'Cyber Resilience Team', 'kelly.regan@cohesity.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'kelly.regan@cohesity.com'
);

-- =============================================================================
-- COMMVAULT — OEM contacts
-- =============================================================================

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Commvault'),
  'Steve Schmidt', 'Account Rep', 'sschmidt@commvault.com', '612-987-1936', 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'sschmidt@commvault.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Commvault'),
  'Nathan Schroeder', 'Sales Engineer', 'nschroeder@commvault.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'nschroeder@commvault.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Commvault'),
  'Pattie Piccinini', 'Licensing / Pricing', 'ppiccinini@commvault.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'ppiccinini@commvault.com'
);

-- =============================================================================
-- HPE — OEM contacts
-- =============================================================================

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'HPE'),
  'Matthew McGlothian', 'Presales Architect', 'mcglothian@hpe.com', '414-698-9981', 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'mcglothian@hpe.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'HPE'),
  'Sara Ellinwood', 'Compute Specialist', 'sara.ellinwood@hpe.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'sara.ellinwood@hpe.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'HPE'),
  'Sam Bohlin', 'Partner SA', 'sam.bohlin@hpe.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'sam.bohlin@hpe.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'HPE'),
  'Dean Zahratka', 'Storage Specialist', 'dean.zahratka@hpe.com', '763-229-6642', 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'dean.zahratka@hpe.com'
);

-- =============================================================================
-- BROADCOM — OEM contacts
-- =============================================================================

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Broadcom'),
  'Ryan Melton', 'VCF SE', 'ryan.melton@broadcom.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'ryan.melton@broadcom.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Broadcom'),
  'Derek DeHaan', 'VCF Technical', 'derek.dehaan@broadcom.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'derek.dehaan@broadcom.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Broadcom'),
  'Brock Peterson', 'VCF Operations / Logs / Automation', 'brock.peterson@broadcom.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'brock.peterson@broadcom.com'
);

-- =============================================================================
-- PURE STORAGE — OEM contacts
-- =============================================================================

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Pure Storage'),
  'AA Smith', 'Technical Account', 'aasmith@purestorage.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'aasmith@purestorage.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Pure Storage'),
  'Michelle Kuehn', 'Pricing / Commercial', 'mkuehn@purestorage.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'mkuehn@purestorage.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Pure Storage'),
  'Evan Mahlowitz', 'Technical Account', 'emahlowitz@purestorage.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'emahlowitz@purestorage.com'
);

-- =============================================================================
-- VEEAM — OEM contacts
-- =============================================================================

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Veeam'),
  'K. Piemonte', 'Licensing / Architecture', 'k.piemonte@veeam.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'k.piemonte@veeam.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Veeam'),
  'Bobby Barber', 'SQL Plugin Technical', 'Bobby.Barber@veeam.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'Bobby.Barber@veeam.com'
);

-- =============================================================================
-- RED HAT — OEM contacts
-- =============================================================================

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Red Hat'),
  'Christopher Marroquin', 'Account Executive', NULL, NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE name = 'Christopher Marroquin'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Red Hat')
);

-- =============================================================================
-- SEMPERIS — OEM contacts
-- =============================================================================

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Semperis'),
  'Steve Diamond', 'Account Lead', 'steved@semperis.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'steved@semperis.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Semperis'),
  'Dan Staples', 'Technical', 'dans@semperis.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'dans@semperis.com'
);

-- =============================================================================
-- CISCO — supplement existing demo contacts with real ones
-- (Demo contacts Diego Alvarez / Priya Subramanian / Bob Kosciak remain)
-- =============================================================================

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cisco'),
  'Brian Hoepner', 'Storage Networking (MDS/SAN)', 'brhoepne@cisco.com', NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'brhoepne@cisco.com'
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'Cisco'),
  'Jon Ebmeier', 'Technical Solutions Architect', 'jebmeier@cisco.com', '402-492-2933', 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts WHERE email = 'jebmeier@cisco.com'
);

-- =============================================================================
-- NETAPP — supplement existing demo contacts with real ones
-- (Demo contacts Tom Reed / Jenna Liu remain)
-- =============================================================================

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'NetApp'),
  'Todd Stand', 'Commercial', NULL, NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE name = 'Todd Stand'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'NetApp')
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'NetApp'),
  'Joe Knoblock', 'Commercial', NULL, NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE name = 'Joe Knoblock'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'NetApp')
);

INSERT INTO contacts (organization_id, name, title, email, phone, role)
SELECT
  (SELECT id FROM organizations WHERE name = 'NetApp'),
  'Tom Beaver', 'SE, Enterprise', NULL, NULL, 'channel'
WHERE NOT EXISTS (
  SELECT 1 FROM contacts
  WHERE name = 'Tom Beaver'
    AND organization_id = (SELECT id FROM organizations WHERE name = 'NetApp')
);

-- =============================================================================
-- CONTACT ACCOUNT ASSIGNMENTS
--
-- Maps OEM channel contacts to the customer accounts they cover.
-- Contacts without emails are referenced by (name, org).
-- =============================================================================

-- Dell → C.H. Robinson
INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
FROM contacts c WHERE c.email = 'Nick.Sampeck@Dell.com'
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);

INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
FROM contacts c WHERE c.email = 'Marco.Fedo@Dell.com'
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);

INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
FROM contacts c WHERE c.email = 'Jessica.Murray@Dell.com'
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);

INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
FROM contacts c WHERE c.email = 'Paul.Hokanson@dell.com'
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);

INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
FROM contacts c WHERE c.email = 'John.Banks@dell.com'
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);

INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
FROM contacts c WHERE c.email = 'Rick.Woo@dell.com'
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);

INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
FROM contacts c WHERE c.email = 'Xavier.Chapa@Dell.com'
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);

INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
FROM contacts c WHERE c.email = 'Irma.Widener@Dell.com'
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);

-- Dell → Fairview Health Services
INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
FROM contacts c WHERE c.email = 'Justin.W.Anderson@Dell.com'
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
);

-- Cohesity → C.H. Robinson
INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
FROM contacts c WHERE c.email IN (
  'aaron.laine@cohesity.com',
  'ryan.linwood@cohesity.com',
  'robert.gibson@cohesity.com',
  'lbroich@cohesity.com'
)
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);

-- Cohesity → APi Group
INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'APi Group')
FROM contacts c WHERE c.email = 'casey.sofka@cohesity.com'
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'APi Group')
);

-- Commvault → Fairview Health Services
INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
FROM contacts c WHERE c.email IN (
  'sschmidt@commvault.com',
  'nschroeder@commvault.com',
  'ppiccinini@commvault.com'
)
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
);

-- HPE → Fairview Health Services
INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
FROM contacts c WHERE c.email IN (
  'mcglothian@hpe.com',
  'sara.ellinwood@hpe.com'
)
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
);

-- Broadcom → Fairview Health Services (VCF adoption)
INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
FROM contacts c WHERE c.email IN (
  'ryan.melton@broadcom.com',
  'derek.dehaan@broadcom.com'
)
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
);

-- Broadcom → C.H. Robinson (operations/logs)
INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
FROM contacts c WHERE c.email = 'brock.peterson@broadcom.com'
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);

-- Pure Storage → C.H. Robinson
INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
FROM contacts c WHERE c.email IN (
  'aasmith@purestorage.com',
  'mkuehn@purestorage.com'
)
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);

-- Pure Storage → Fairview Health Services
INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
FROM contacts c WHERE c.email = 'emahlowitz@purestorage.com'
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Fairview Health Services')
);

-- Veeam → C.H. Robinson
INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
FROM contacts c WHERE c.email IN (
  'k.piemonte@veeam.com',
  'Bobby.Barber@veeam.com'
)
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);

-- Red Hat → Entegris
INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'Entegris')
FROM contacts c
WHERE c.name = 'Christopher Marroquin'
  AND c.organization_id = (SELECT id FROM organizations WHERE name = 'Red Hat')
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'Entegris')
);

-- Semperis → C.H. Robinson
INSERT INTO contact_account_assignments (contact_id, organization_id)
SELECT c.id, (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
FROM contacts c WHERE c.email IN (
  'steved@semperis.com',
  'dans@semperis.com'
)
AND NOT EXISTS (
  SELECT 1 FROM contact_account_assignments
  WHERE contact_id = c.id
    AND organization_id = (SELECT id FROM organizations WHERE name = 'C.H. Robinson')
);
