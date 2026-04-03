import { describe, expect, it } from 'vitest';

import { DEFAULT_SIMULATION_CONFIG, cloneSimulationConfig } from './config';
import { createSimulationEngine } from './engine';

describe('simulation engine', () => {
  it('stays deterministic for the same seed and intervention sequence', () => {
    const config = cloneSimulationConfig(DEFAULT_SIMULATION_CONFIG);
    const engineA = createSimulationEngine(config);
    const engineB = createSimulationEngine(config);
    const command = {
      id: 'cmd-1',
      label: 'Climate Pulse -1.2°C',
      kind: 'climate-pulse' as const,
      scheduledYear: 10,
      payload: {
        temperatureDelta: -1.2,
        duration: 80,
      },
    };

    engineA.enqueueIntervention(command);
    engineB.enqueueIntervention(command);
    engineA.step(36);
    engineB.step(36);

    expect(JSON.stringify(engineA.getState())).toBe(JSON.stringify(engineB.getState()));
  });

  it('reports the planned phase ordering each tick', () => {
    const result = createSimulationEngine(DEFAULT_SIMULATION_CONFIG).step();

    expect(result.phases).toEqual([
      'global-events',
      'tile-update',
      'tribe-update',
      'interaction',
      'migration',
      'fission',
      'extinction',
    ]);
  });

  it('applies queued interventions only from their target year onward', () => {
    const engine = createSimulationEngine(DEFAULT_SIMULATION_CONFIG);
    engine.enqueueIntervention({
      id: 'cmd-2',
      label: 'Pulse',
      kind: 'climate-pulse',
      scheduledYear: 5,
      payload: {
        temperatureDelta: 2,
        duration: 40,
      },
    });

    engine.step(4);
    expect(engine.getState().globalClimate.anomaly).toBe(0);

    engine.step(1);
    expect(engine.getState().globalClimate.anomaly).toBe(2);
  });

  it('keeps population and tribe structure evolving over long deterministic runs', () => {
    const engine = createSimulationEngine(DEFAULT_SIMULATION_CONFIG);
    const initial = engine.getState();
    const populations = new Set<number>([initial.metrics.totalPopulation]);
    const tribeCounts = new Set<number>([initial.metrics.tribeCount]);

    for (let index = 0; index < 240; index += 1) {
      engine.step(1);
      const state = engine.getState();
      populations.add(state.metrics.totalPopulation);
      tribeCounts.add(state.metrics.tribeCount);
    }

    expect(populations.size).toBeGreaterThan(40);
    expect(Math.max(...tribeCounts)).toBeGreaterThan(initial.metrics.tribeCount);
    expect(engine.getState().metrics.totalPopulation).not.toBe(initial.metrics.totalPopulation);
  });

  it('maintains long-run population growth without collapsing occupied tiles into resource floors', { timeout: 15_000 }, () => {
    const config = cloneSimulationConfig(DEFAULT_SIMULATION_CONFIG);
    config.seed = 12045;

    const engine = createSimulationEngine(config);
    const initial = engine.getState();
    const visitedTiles = new Set(initial.tribes.map((tribe) => tribe.tileId));

    for (let index = 0; index < 1200; index += 1) {
      const result = engine.step(1);
      for (const tribe of result.state.tribes) {
        visitedTiles.add(tribe.tileId);
      }
    }

    const state = engine.getState();
    const occupiedTileIds = new Set(state.tribes.map((tribe) => tribe.tileId));
    const occupiedHuntRatios = state.tiles
      .filter((tile) => occupiedTileIds.has(tile.id))
      .map((tile) => tile.carryingCapacity.hunt / Math.max(tile.baseCarryingCapacity.hunt, 1));
    const averageOccupiedHuntRatio =
      occupiedHuntRatios.reduce((sum, ratio) => sum + ratio, 0) /
      Math.max(occupiedHuntRatios.length, 1);

    expect(state.metrics.totalPopulation).toBeGreaterThan(initial.metrics.totalPopulation * 2);
    expect(visitedTiles.has('levant-corridor')).toBe(true);
    expect(averageOccupiedHuntRatio).toBeGreaterThan(0.75);
  });
});


