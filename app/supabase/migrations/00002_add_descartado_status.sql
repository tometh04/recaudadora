-- Add 'descartado' value to inbox_status enum
-- Used for images that are not payment receipts (filtered by AI classification)
ALTER TYPE inbox_status ADD VALUE IF NOT EXISTS 'descartado';
