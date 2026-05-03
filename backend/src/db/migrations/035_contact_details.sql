-- 035_contact_details
--
-- Store persistent contact-card notes/details in the local contact datastore.

ALTER TABLE contacts ADD COLUMN details TEXT;
