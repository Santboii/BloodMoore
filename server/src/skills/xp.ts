import { xpToNextLevel } from '@arena/shared';

export { xpToNextLevel };

export function computeLevelUp(
  currentLevel: number,
  currentXp: number,
  xpGained: number,
): { newLevel: number; newXp: number; levelsGained: number } {
  let level = currentLevel;
  let xp = currentXp + xpGained;
  let levelsGained = 0;

  while (xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level);
    level++;
    levelsGained++;
  }

  return { newLevel: level, newXp: xp, levelsGained };
}
