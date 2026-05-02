-- Add rank and total_spent columns to skill_unlocks
ALTER TABLE skill_unlocks ADD COLUMN rank INTEGER NOT NULL DEFAULT 1;
ALTER TABLE skill_unlocks ADD COLUMN total_spent INTEGER NOT NULL DEFAULT 0;

-- Backfill total_spent for existing rows (all are rank 1)
UPDATE skill_unlocks SET total_spent = CASE node_id
  WHEN 'fire.fireball' THEN 1
  WHEN 'fire.volatile_ember' THEN 1
  WHEN 'fire.seeking_flame' THEN 1
  WHEN 'fire.hellfire' THEN 2
  WHEN 'fire.pyroclasm' THEN 2
  WHEN 'fire.fire_wall' THEN 2
  WHEN 'fire.enduring_flames' THEN 1
  WHEN 'fire.searing_heat' THEN 2
  WHEN 'fire.meteor' THEN 3
  WHEN 'fire.molten_impact' THEN 2
  WHEN 'fire.blind_strike' THEN 2
  WHEN 'utility.teleport' THEN 1
  WHEN 'utility.phase_shift' THEN 2
  WHEN 'utility.ethereal_form' THEN 2
  WHEN 'utility.phantom_step' THEN 3
  ELSE 1
END;

-- Updated unlock_skill_node: supports first purchase (INSERT) and rank-up (UPDATE)
CREATE OR REPLACE FUNCTION unlock_skill_node(
  p_character_id UUID,
  p_node_id TEXT,
  p_cost INTEGER
) RETURNS VOID AS $$
DECLARE
  v_existing_rank INTEGER;
  v_user_id UUID;
BEGIN
  SELECT rank INTO v_existing_rank
  FROM skill_unlocks
  WHERE character_id = p_character_id AND node_id = p_node_id;

  IF v_existing_rank IS NULL THEN
    SELECT user_id INTO v_user_id
    FROM characters
    WHERE id = p_character_id;

    INSERT INTO skill_unlocks (character_id, node_id, rank, total_spent, user_id)
    VALUES (p_character_id, p_node_id, 1, p_cost, v_user_id);
  ELSE
    UPDATE skill_unlocks
    SET rank = rank + 1, total_spent = total_spent + p_cost
    WHERE character_id = p_character_id AND node_id = p_node_id;
  END IF;

  UPDATE characters
  SET skill_points_available = skill_points_available - p_cost
  WHERE id = p_character_id;
END;
$$ LANGUAGE plpgsql;

-- Updated respec_skills: refunds based on total_spent column
CREATE OR REPLACE FUNCTION respec_skills(
  p_character_id UUID
) RETURNS VOID AS $$
DECLARE
  v_refund INTEGER;
BEGIN
  SELECT COALESCE(SUM(total_spent), 0) INTO v_refund
  FROM skill_unlocks
  WHERE character_id = p_character_id;

  UPDATE characters
  SET skill_points_available = skill_points_available + v_refund
  WHERE id = p_character_id;

  DELETE FROM skill_unlocks
  WHERE character_id = p_character_id;
END;
$$ LANGUAGE plpgsql;
