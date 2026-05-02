-- Allow 'amazon' as a character class
-- Drop existing constraint if it exists and re-create with amazon included
DO $$
BEGIN
  -- Try to drop the old check constraint (name may vary)
  BEGIN
    ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_class_check;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER TABLE characters DROP CONSTRAINT IF EXISTS valid_class;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END $$;

-- Add updated constraint allowing both mage and amazon
ALTER TABLE characters ADD CONSTRAINT characters_class_check
  CHECK (class IN ('mage', 'amazon'));

-- Update create_character RPC to accept amazon class
CREATE OR REPLACE FUNCTION create_character(
  p_user_id UUID,
  p_name TEXT,
  p_class TEXT
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_count INTEGER;
BEGIN
  IF p_class NOT IN ('mage', 'amazon') THEN
    RAISE EXCEPTION 'Invalid class: %', p_class;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM characters
  WHERE user_id = p_user_id;

  IF v_count >= 6 THEN
    RAISE EXCEPTION 'Maximum characters reached';
  END IF;

  INSERT INTO characters (user_id, name, class, xp, level, skill_points_available, skill_points_total)
  VALUES (p_user_id, p_name, p_class, 0, 1, 1, 1)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
