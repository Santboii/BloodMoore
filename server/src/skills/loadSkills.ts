import { supabase } from '../supabase.ts';
import type { NodeId } from '@arena/shared';
import { XP_PER_MATCH_BASE, XP_PER_MATCH_WIN_BONUS } from '@arena/shared';

export type SkillLoadResult =
  | { ok: true; userId: string; skills: Map<NodeId, number> }
  | { ok: false; error: string };

export async function loadSkillsForCharacter(
  accessToken: string,
  characterId: string,
): Promise<SkillLoadResult> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken);
  if (authErr || !user) return { ok: false, error: authErr?.message ?? 'Invalid token' };

  const { data: charData, error: charErr } = await supabase
    .from('characters')
    .select('id, class')
    .eq('id', characterId)
    .eq('user_id', user.id)
    .single();

  if (charErr || !charData) return { ok: false, error: 'Character not found or unauthorized' };

  const { data, error } = await supabase
    .from('skill_unlocks')
    .select('node_id, rank')
    .eq('character_id', characterId);

  if (error) return { ok: false, error: error.message };

  const skills = new Map<NodeId, number>(
    (data ?? []).map((row: { node_id: string; rank: number }) => [row.node_id as NodeId, row.rank ?? 1])
  );
  const defaultSkill: NodeId = charData.class === 'amazon' ? 'archer.power_shot' : 'fire.fireball';
  if (!skills.has(defaultSkill)) skills.set(defaultSkill, 1);
  return { ok: true, userId: user.id, skills };
}

export type MatchCreditResult = {
  xpGained: number;
  levelsGained: number;
  newLevel: number;
  newXp: number;
};

export async function creditMatchResult(
  userId: string,
  characterId: string,
  won: boolean,
): Promise<MatchCreditResult> {
  const xp = XP_PER_MATCH_BASE + (won ? XP_PER_MATCH_WIN_BONUS : 0);
  const { data, error } = await supabase.rpc('credit_match_result', {
    p_user_id: userId,
    p_character_id: characterId,
    p_won: won,
    p_xp: xp,
  });

  if (error) {
    console.error('credit_match_result failed:', error.message);
    return { xpGained: xp, levelsGained: 0, newLevel: 0, newXp: 0 };
  }

  return data as MatchCreditResult;
}

export async function loadUserFromToken(
  accessToken: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken);
  if (authErr || !user) return { ok: false, error: authErr?.message ?? 'Invalid token' };
  return { ok: true, userId: user.id };
}
