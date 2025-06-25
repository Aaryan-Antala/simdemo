/*
  # Add metadata column to channels table

  1. Changes
    - Add metadata jsonb column to channels table for storing passwords and other data
    - Set default value to empty object
    - Add index for better performance

  2. Security
    - No changes to RLS policies needed
*/

-- Add metadata column to channels table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'channels' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE channels ADD COLUMN metadata jsonb DEFAULT '{}';
  END IF;
END $$;

-- Add index for metadata queries
CREATE INDEX IF NOT EXISTS idx_channels_metadata ON channels USING gin(metadata);