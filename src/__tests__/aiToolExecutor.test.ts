import { describe, expect, it } from 'vitest';
import { createFootballQuota } from '../../api/lib/ai-tool-executor';

describe('createFootballQuota', () => {
  it('stops after max calls', () => {
    const q = createFootballQuota(3);
    expect(q.tryConsume()).toBe(true);
    expect(q.tryConsume()).toBe(true);
    expect(q.tryConsume()).toBe(true);
    expect(q.tryConsume()).toBe(false);
    expect(q.used).toBe(3);
    expect(q.max).toBe(3);
  });
});
