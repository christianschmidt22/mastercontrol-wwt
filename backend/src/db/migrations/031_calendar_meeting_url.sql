-- 031_calendar_meeting_url
--
-- Adds meeting_url column for Teams/Zoom/Meet/Webex join links extracted from
-- ICS event descriptions or location fields during calendar sync.

ALTER TABLE calendar_events ADD COLUMN meeting_url TEXT;
