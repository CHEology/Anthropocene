import { describe, expect, it } from 'vitest';

import { DEFAULT_SIMULATION_CONFIG, cloneSimulationConfig } from '../sim/config';
import { createInitialWorldState, getWorldPresentation } from './oldWorld';

describe('world presets', () => {
  it('builds the detailed Eurasia preset with valid tile and presentation references', () => {
    const config = cloneSimulationConfig(DEFAULT_SIMULATION_CONFIG);
    config.worldPreset = 'detailed-eurasia';

    const state = createInitialWorldState(config);
    const presentation = getWorldPresentation(config.worldPreset);
    const tileIds = new Set(state.tiles.map((tile) => tile.id));
    const tribeIds = new Set(state.tribes.map((tribe) => tribe.id));

    expect(state.tiles.length).toBeGreaterThanOrEqual(390);
    expect(state.tiles.length).toBeLessThanOrEqual(430);
    expect(tileIds.has(presentation.startTileId)).toBe(true);
    expect(tribeIds.has(presentation.startTribeId)).toBe(true);
    expect(state.tiles.every((tile) => tile.neighbors.every((neighborId) => tileIds.has(neighborId)))).toBe(true);
    expect(presentation.routeLanes.every((route) => route.tileIds.every((tileId) => tileIds.has(tileId)))).toBe(true);
    expect(presentation.regionLabels.every((label) => tileIds.has(label.tileId))).toBe(true);
  });
});
