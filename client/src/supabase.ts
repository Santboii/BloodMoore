import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, key);

export type UserProfile = {
  username: string;
  skill_points_available: number;
  skill_points_total: number;
  matches_played: number;
  matches_won: number;
};

export async function fetchProfile(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('username, skill_points_available, skill_points_total, matches_played, matches_won')
    .eq('user_id', user.id)
    .single();
  return data ?? null;
}
