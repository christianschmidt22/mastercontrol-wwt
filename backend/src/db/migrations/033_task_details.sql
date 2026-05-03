-- 033_task_details
--
-- Add a free-form task details field for working notes, context, and
-- next-action tracking.

ALTER TABLE tasks ADD COLUMN details TEXT;
