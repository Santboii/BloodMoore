export type CharacterClass = 'mage';

export type CharacterRecord = {
  id: string;
  user_id: string;
  name: string;
  class: CharacterClass;
  xp: number;
  level: number;
  skill_points_available: number;
  skill_points_total: number;
  created_at: string;
};

export const MAX_CHARACTERS_PER_ACCOUNT = 6;

export const CHARACTER_CLASSES: { id: CharacterClass; label: string; enabled: boolean }[] = [
  { id: 'mage', label: 'Mage', enabled: true },
];

export const XP_PER_MATCH_BASE = 50;
export const XP_PER_MATCH_WIN_BONUS = 100;

export function xpToNextLevel(currentLevel: number): number {
  return Math.floor(100 * Math.pow(currentLevel, 1.5));
}
