import { describe, it, expect } from 'vitest';
import { getDungeonPressure } from './progression';

describe('getDungeonPressure', () => {
  it('is 0/0 through D:15', () => {
    expect(getDungeonPressure(5)).toEqual({ atk: 0, def: 0 });
    expect(getDungeonPressure(15)).toEqual({ atk: 0, def: 0 });
  });

  it('scales linearly from D:16', () => {
    expect(getDungeonPressure(16)).toEqual({ atk: 3, def: 2 });
    expect(getDungeonPressure(18)).toEqual({ atk: 9, def: 6 });
    expect(getDungeonPressure(25)).toEqual({ atk: 30, def: 20 });
    expect(getDungeonPressure(30)).toEqual({ atk: 45, def: 30 });
  });
});
