import { describe, expect, it } from 'vitest';

import { DEFAULT_SIMULATION_CONFIG } from '../../sim/config';
import { createInitialWorldState, getWorldPresentation } from '../../world/oldWorld';
import { calculateMapFootprint, createMapLayout, placeMapLabels } from './mapLayout';

function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

describe('map layout', () => {
  it('fills the canvas footprint with a correctly scaled hex field', () => {
    const worldState = createInitialWorldState(DEFAULT_SIMULATION_CONFIG);
    const layout = createMapLayout(worldState.tiles, 1200, 760, 36);
    const footprint = calculateMapFootprint(layout.centers, layout.radius);

    expect(layout.radius).toBeGreaterThan(30);
    expect(footprint.width).toBeGreaterThan(780);
    expect(footprint.height).toBeGreaterThan(520);
  });

  it('places labels without collisions for the default world view', () => {
    const worldState = createInitialWorldState(DEFAULT_SIMULATION_CONFIG);
    const presentation = getWorldPresentation(DEFAULT_SIMULATION_CONFIG.worldPreset);
    const layout = createMapLayout(worldState.tiles, 1200, 760, 36);
    const labels = placeMapLabels(
      worldState.tiles,
      worldState.tribes,
      presentation.regionLabels,
      presentation.routeLanes,
      layout,
      1200,
      760,
      presentation.startTileId,
      null,
    );

    for (let index = 0; index < labels.length; index += 1) {
      for (let cursor = index + 1; cursor < labels.length; cursor += 1) {
        expect(intersects(labels[index], labels[cursor])).toBe(false);
      }
    }
  });
});
