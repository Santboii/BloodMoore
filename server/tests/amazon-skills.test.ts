import { describe, it, expect } from 'vitest';
import { CHARACTER_CLASSES } from '@arena/shared';

describe('Amazon character class', () => {
  it('includes amazon in CHARACTER_CLASSES', () => {
    const amazon = CHARACTER_CLASSES.find(c => c.id === 'amazon');
    expect(amazon).toBeDefined();
    expect(amazon!.label).toBe('Amazon');
    expect(amazon!.enabled).toBe(true);
  });
});
