import { describe, expect, it } from 'vitest';

import { DEFAULT_SIMULATION_CONFIG, cloneSimulationConfig } from '../sim/config';
import { ALL_TECH_IDS } from '../sim/techTree';
import { createInitialWorldState, getWorldPresentation } from './oldWorld';

function hasTraversablePath(startTileId: string, targetRegion: string, state: ReturnType<typeof createInitialWorldState>) {
  const tileById = new Map(state.tiles.map((tile) => [tile.id, tile] as const));
  const queue = [startTileId];
  const visited = new Set([startTileId]);

  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId) {
      continue;
    }

    const currentTile = tileById.get(currentId);
    if (!currentTile) {
      continue;
    }
    if (currentTile.region === targetRegion) {
      return true;
    }

    for (const neighborId of currentTile.neighbors) {
      if (visited.has(neighborId)) {
        continue;
      }
      const neighbor = tileById.get(neighborId);
      if (!neighbor) {
        continue;
      }
      if (neighbor.terrain === 'mountain' && !neighbor.movementTags.includes('mountain-pass')) {
        continue;
      }

      visited.add(neighborId);
      queue.push(neighborId);
    }
  }

  return false;
}

describe('world presets', () => {
  it('builds the detailed old world preset with authored corridors, sparse Sahara, and East African starts', () => {
    const config = cloneSimulationConfig(DEFAULT_SIMULATION_CONFIG);
    config.worldPreset = 'detailed-eurasia';

    const state = createInitialWorldState(config);
    const presentation = getWorldPresentation(config.worldPreset);
    const tileIds = new Set(state.tiles.map((tile) => tile.id));
    const tribeIds = new Set(state.tribes.map((tribe) => tribe.id));
    const africaTiles = state.tiles.filter(
      (tile) =>
        tile.region.includes('Africa') ||
        tile.region === 'Congo Basin' ||
        tile.region === 'Nile Basin' ||
        tile.region === 'Sahara' ||
        tile.region === 'Madagascar',
    );
    const southernAfricaTiles = state.tiles.filter((tile) => tile.region === 'Southern Africa');
    const saharaTiles = state.tiles.filter((tile) => tile.region === 'Sahara');
    const sparseSaharaTiles = saharaTiles.filter(
      (tile) => tile.terrain === 'desert' || tile.habitability <= 1.6 || tile.water <= 1,
    );
    const startingRegions = new Set(
      state.tribes.map((tribe) => state.tiles.find((tile) => tile.id === tribe.tileId)?.region ?? ''),
    );
    const landBridgeTiles = state.tiles.filter((tile) => tile.movementTags.includes('land-bridge'));
    const desertPassTiles = state.tiles.filter((tile) => tile.movementTags.includes('desert-pass'));
    const mountainPassTiles = state.tiles.filter((tile) => tile.movementTags.includes('mountain-pass'));
    const eastAfricaToLevantRoute = presentation.routeLanes.find((route) => route.id === 'east-africa-to-levant');
    const validTechIds = new Set(ALL_TECH_IDS);
    const allowedLandBridgeRegions = new Set(['East Africa', 'Nile Basin', 'Sahara', 'Arabia', 'West Asia', 'Levant']);

    const landTiles = state.tiles.filter((t) => t.terrain !== 'sea');
    const seaTiles = state.tiles.filter((t) => t.terrain === 'sea');
    expect(landTiles.length).toBeGreaterThanOrEqual(400);
    expect(landTiles.length).toBeLessThanOrEqual(620);
    expect(seaTiles.length).toBeGreaterThan(0);
    expect(presentation.name).toBe('Detailed Old World');
    expect(africaTiles.length).toBeGreaterThanOrEqual(120);
    expect(southernAfricaTiles.length).toBeGreaterThan(0);
    expect(state.tribes).toHaveLength(5);
    expect([...startingRegions].every((region) => region === 'East Africa')).toBe(true);
    expect(state.tribes.every((tribe) => tribe.development.agricultureStage === 'foraging')).toBe(true);
    expect(tileIds.has(presentation.startTileId)).toBe(true);
    expect(tribeIds.has(presentation.startTribeId)).toBe(true);
    expect(state.tribes.every((tribe) => tribe.knownTechnologies.length > 0)).toBe(true);
    expect(
      state.tribes.every((tribe) =>
        tribe.knownTechnologies.every((technologyId) => validTechIds.has(technologyId)),
      ),
    ).toBe(true);
    expect(state.tiles.every((tile) => tile.neighbors.every((neighborId) => tileIds.has(neighborId)))).toBe(true);
    expect(presentation.routeLanes.every((route) => route.tileIds.every((tileId) => tileIds.has(tileId)))).toBe(true);
    expect((presentation.riverLanes ?? []).every((route) => route.tileIds.every((tileId) => tileIds.has(tileId)))).toBe(true);
    expect((presentation.riverLanes ?? []).length).toBeGreaterThanOrEqual(6);
    expect(
      (presentation.riverLanes ?? []).every((route) =>
        route.tileIds.every((tileId, index) =>
          index === 0 || state.tiles.find((tile) => tile.id === route.tileIds[index - 1])?.neighbors.includes(tileId),
        ),
      ),
    ).toBe(true);
    expect(
      (presentation.riverLanes ?? []).every((route) =>
        route.tileIds.every((tileId) => state.tiles.find((tile) => tile.id === tileId)?.terrain === 'river_valley'),
      ),
    ).toBe(true);
    expect(presentation.regionLabels.every((label) => tileIds.has(label.tileId))).toBe(true);
    expect(saharaTiles.length).toBeGreaterThan(20);
    expect(sparseSaharaTiles.length).toBeGreaterThanOrEqual(Math.ceil(saharaTiles.length * 0.7));
    expect(desertPassTiles.length).toBeGreaterThan(0);
    expect(mountainPassTiles.length).toBeGreaterThan(0);
    expect(landBridgeTiles.length).toBeGreaterThan(0);
    expect(landBridgeTiles.every((tile) => allowedLandBridgeRegions.has(tile.region))).toBe(true);
    expect(eastAfricaToLevantRoute?.tileIds.at(-1)).toMatch(/^levant-/);
    expect(hasTraversablePath(presentation.startTileId, 'Levant', state)).toBe(true);
  });
});
