import { supabase } from '../supabase.ts';
import type { NodeId } from '@arena/shared';

export type SkillLoadResult =
  | { ok: true; userId: string; skills: Set<NodeId> }
  | { ok: false; error: string };

export async function loadSkillsForToken(accessToken: string): Promise<SkillLoadResult> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser(accessToken);
  if (authErr || !user) return { ok: false, error: authErr?.message ?? 'Invalid token' };

  const { data, error } = await supabase
    .from('skill_unlocks')
    .select('node_id')
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };

  const skills = new Set<NodeId>((data ?? []).map((row: { node_id: string }) => row.node_id as NodeId));
  return { ok: true, userId: user.id, skills };
}

export async function creditMatchResult(
  userId: string,
  won: boolean,
): Promise<void> {
  const pointsEarned = won ? 3 : 1;
  await supabase.rpc('credit_match_result', { p_user_id: userId, p_won: won, p_points: pointsEarned });
}
