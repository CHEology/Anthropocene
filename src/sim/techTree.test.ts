import { describe, expect, it } from 'vitest';

import {
  STARTING_TECHS_FORAGER,
  STARTING_TECHS_TENDING,
  TECH_TREE,
  getDiscoverableTechs,
  hasAllPrerequisites,
} from './techTree';

describe('tech tree', () => {
  it('exposes concrete next-step discoveries from the starting tiers', () => {
    const foragerDiscoveries = new Set(getDiscoverableTechs(STARTING_TECHS_FORAGER));
    const tendingDiscoveries = new Set(getDiscoverableTechs(STARTING_TECHS_TENDING));

    expect(foragerDiscoveries.has('cooking')).toBe(true);
    expect(foragerDiscoveries.has('hafted-tools')).toBe(true);
    expect(foragerDiscoveries.has('stone-working')).toBe(true);
    expect(tendingDiscoveries.has('proto-cultivation')).toBe(true);
    expect(tendingDiscoveries.has('pottery')).toBe(true);
    expect(tendingDiscoveries.has('permanent-shelter')).toBe(true);
  });

  it('enforces prerequisites for advanced technologies', () => {
    expect(hasAllPrerequisites(['copper-working'], 'bronze-working')).toBe(false);
    expect(hasAllPrerequisites(['stone-working', 'pottery'], 'copper-working')).toBe(true);
    expect(TECH_TREE['bronze-working'].prerequisites).toEqual(['copper-working', 'counting']);
  });
});
