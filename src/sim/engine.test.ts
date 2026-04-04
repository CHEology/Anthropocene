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
      label: 'Climate Pulse -1.2?C',
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

    for (let index = 0; index < 400; index += 1) {
      engine.step(1);
      const state = engine.getState();
      populations.add(state.metrics.totalPopulation);
      tribeCounts.add(state.metrics.tribeCount);
    }

    expect(populations.size).toBeGreaterThan(40);
    expect(Math.max(...tribeCounts)).toBeGreaterThan(initial.metrics.tribeCount);
    expect(engine.getState().metrics.totalPopulation).not.toBe(initial.metrics.totalPopulation);
  });

  it('keeps detailed eurasia viable over long deterministic runs with the new ecology contract', { timeout: 45_000 }, () => {
    const config = cloneSimulationConfig(DEFAULT_SIMULATION_CONFIG);
    config.worldPreset = 'detailed-eurasia';
    config.seed = 12045;

    const engine = createSimulationEngine(config);
    const initial = engine.getState();
    const visitedTiles = new Set(initial.tribes.map((tribe) => tribe.tileId));

    let peakPop = initial.metrics.totalPopulation;
    for (let index = 0; index < 800; index += 1) {
      const result = engine.step(1);
      for (const tribe of result.state.tribes) {
        visitedTiles.add(tribe.tileId);
      }
      peakPop = Math.max(peakPop, result.state.metrics.totalPopulation);
    }

    const state = engine.getState();
    const occupiedTileIds = new Set(state.tribes.map((tribe) => tribe.tileId));
    const occupiedHuntRatios = state.tiles
      .filter((tile) => occupiedTileIds.has(tile.id))
      .map((tile) => tile.carryingCapacity.hunt / Math.max(tile.baseCarryingCapacity.hunt, 1));
    const averageOccupiedHuntRatio =
      occupiedHuntRatios.reduce((sum, ratio) => sum + ratio, 0) /
      Math.max(occupiedHuntRatios.length, 1);

    expect(peakPop).toBeGreaterThan(initial.metrics.totalPopulation * 2.5);
    expect(state.metrics.totalPopulation).toBeGreaterThan(initial.metrics.totalPopulation * 0.45);
    expect(state.metrics.tribeCount).toBeGreaterThan(initial.metrics.tribeCount * 4);
    expect(visitedTiles.size).toBeGreaterThan(initial.tribes.length * 5);
    expect(averageOccupiedHuntRatio).toBeGreaterThan(0.3);
    expect(state.globalClimate.regime.length).toBeGreaterThan(0);
    expect(state.storyteller.posture.length).toBeGreaterThan(0);
    expect(state.metrics.averageFoodStores).toBeGreaterThanOrEqual(0);
    expect(state.metrics.averageGeneticDiversity).toBeGreaterThan(0);
    expect(state.metrics.averageMegafauna).toBeGreaterThanOrEqual(0);
  });

  it('activates hazard, exchange, combat, and diplomacy loops on the detailed preset', { timeout: 30_000 }, () => {
    const config = cloneSimulationConfig(DEFAULT_SIMULATION_CONFIG);
    config.worldPreset = 'detailed-eurasia';
    config.seed = 12045;

    const engine = createSimulationEngine(config);
    const initialMaxDomestication = Math.max(
      ...engine.getState().tribes.map((tribe) => tribe.development.domestication),
    );
    const counts = new Map<string, number>();

    for (let index = 0; index < 500; index += 1) {
      const result = engine.step(1);
      for (const event of result.emittedEvents) {
        counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
      }
    }

    const state = engine.getState();
    const occupiedTileIds = new Set(state.tribes.map((tribe) => tribe.tileId));
    const occupiedHighlandTiles = state.tiles.filter((tile) => occupiedTileIds.has(tile.id) && (tile.terrain === 'highland' || tile.terrain === 'mountain')).length;

    // Core event systems should all fire over 500 years
    expect(counts.get('disaster') ?? 0).toBeGreaterThan(10);
    expect(counts.get('disease') ?? 0).toBeGreaterThan(2);
    expect((counts.get('trade') ?? 0) + (counts.get('diplomacy') ?? 0) + (counts.get('combat') ?? 0)).toBeGreaterThan(5);
    expect(occupiedHighlandTiles).toBeGreaterThan(0);
    expect(
      state.tiles.some((tile) => tile.activeDisasters.length > 0 || tile.activePlagues.length > 0),
    ).toBe(true);
    expect(
      Math.max(...state.tribes.map((tribe) => tribe.development.domestication)),
    ).toBeGreaterThan(initialMaxDomestication);
  });
});
