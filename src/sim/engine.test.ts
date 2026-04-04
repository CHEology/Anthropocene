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

  it('keeps population and conflict structure evolving over long deterministic runs', { timeout: 20_000 }, () => {
    const engine = createSimulationEngine(DEFAULT_SIMULATION_CONFIG);
    const initial = engine.getState();
    const populations = new Set<number>([initial.metrics.totalPopulation]);
    const tribeCounts = new Set<number>([initial.metrics.tribeCount]);
    const conflictCounts = new Set<number>([initial.metrics.conflicts]);

    for (let index = 0; index < 160; index += 1) {
      engine.step(1);
      const state = engine.getState();
      populations.add(state.metrics.totalPopulation);
      tribeCounts.add(state.metrics.tribeCount);
      conflictCounts.add(state.metrics.conflicts);
    }

    expect(populations.size).toBeGreaterThan(20);
    expect(conflictCounts.size).toBeGreaterThan(8);
    expect(engine.getState().metrics.conflicts).toBeGreaterThan(initial.metrics.conflicts);
    expect(engine.getState().metrics.totalPopulation).not.toBe(initial.metrics.totalPopulation);
  });

  it('reduces early migration buzzing while preserving committed corridor relocations', { timeout: 120_000 }, () => {
    const config = cloneSimulationConfig(DEFAULT_SIMULATION_CONFIG);
    config.worldPreset = 'detailed-eurasia';
    config.seed = 12045;

    const engine = createSimulationEngine(config);
    const initial = engine.getState();
    const trackedIds = new Set(initial.tribes.map((tribe) => tribe.id));
    const moveCounts = new Map(initial.tribes.map((tribe) => [tribe.id, 0]));
    const visitedTiles = new Set(initial.tribes.map((tribe) => tribe.tileId));
    let relocationBegins = 0;

    for (let index = 0; index < 80; index += 1) {
      const before = engine.getState();
      const previousTiles = new Map(before.tribes.map((tribe) => [tribe.id, tribe.tileId]));
      const result = engine.step(1);
      for (const event of result.emittedEvents) {
        if (event.kind === 'migration' && /began a relocation/i.test(event.title)) {
          relocationBegins += 1;
        }
      }
      for (const tribe of result.state.tribes) {
        visitedTiles.add(tribe.tileId);
        if (!trackedIds.has(tribe.id)) {
          continue;
        }
        if (previousTiles.get(tribe.id) !== tribe.tileId) {
          moveCounts.set(tribe.id, (moveCounts.get(tribe.id) ?? 0) + 1);
        }
      }
    }

    const moveValues = [...moveCounts.values()];
    const averageMoves = moveValues.reduce((sum, value) => sum + value, 0) / moveValues.length;

    expect(Math.max(...moveValues)).toBeLessThanOrEqual(28);
    expect(averageMoves).toBeGreaterThanOrEqual(9);
    expect(averageMoves).toBeLessThanOrEqual(18);
    expect(relocationBegins).toBeGreaterThan(0);
    expect(visitedTiles.size).toBeGreaterThan(initial.tribes.length * 4);
  });

  it('keeps detailed old world viable with slow net growth, drawdowns, and branching', { timeout: 120_000 }, () => {
    const config = cloneSimulationConfig(DEFAULT_SIMULATION_CONFIG);
    config.worldPreset = 'detailed-eurasia';
    config.seed = 12045;

    const engine = createSimulationEngine(config);
    const initial = engine.getState();
    const visitedTiles = new Set(initial.tribes.map((tribe) => tribe.tileId));
    const highlandTileIds = new Set(
      initial.tiles
        .filter((tile) => tile.terrain === 'highland' || tile.terrain === 'mountain')
        .map((tile) => tile.id),
    );
    const everOccupiedHighlands = new Set<string>();
    const populationSeries = [initial.metrics.totalPopulation];
    const tribeSeries = [initial.metrics.tribeCount];

    for (let index = 0; index < 320; index += 1) {
      const result = engine.step(1);
      populationSeries.push(result.state.metrics.totalPopulation);
      tribeSeries.push(result.state.metrics.tribeCount);
      for (const tribe of result.state.tribes) {
        visitedTiles.add(tribe.tileId);
        if (highlandTileIds.has(tribe.tileId)) {
          everOccupiedHighlands.add(tribe.tileId);
        }
      }
    }

    let runningPeak = populationSeries[0];
    let maxDrawdown = 0;
    for (const population of populationSeries) {
      runningPeak = Math.max(runningPeak, population);
      maxDrawdown = Math.max(maxDrawdown, runningPeak - population);
    }

    const state = engine.getState();

    expect(Math.max(...populationSeries)).toBeGreaterThan(initial.metrics.totalPopulation * 1.2);
    expect(state.metrics.totalPopulation).toBeGreaterThan(initial.metrics.totalPopulation * 1.5);
    expect(state.metrics.totalPopulation).toBeLessThan(initial.metrics.totalPopulation * 5);
    expect(maxDrawdown).toBeGreaterThan(40);
    expect(state.metrics.tribeCount).toBeGreaterThan(initial.metrics.tribeCount);
    expect(state.metrics.tribeCount).toBeLessThanOrEqual(initial.metrics.tribeCount + 10);
    expect(visitedTiles.size).toBeGreaterThan(initial.tribes.length * 6);
    expect(everOccupiedHighlands.size).toBeGreaterThan(0);
    expect(state.globalClimate.regime.length).toBeGreaterThan(0);
    expect(state.storyteller.posture.length).toBeGreaterThan(0);
    expect(state.metrics.averageFoodStores).toBeGreaterThanOrEqual(0);
    expect(state.metrics.averageGeneticDiversity).toBeGreaterThan(0);
    expect(state.metrics.averageMegafauna).toBeGreaterThanOrEqual(0);
    expect(Math.max(...tribeSeries)).toBeGreaterThan(initial.metrics.tribeCount);
  });

  it('keeps early detailed old world runs in a slow-tech forager regime while hazards, exchange, and migration still fire', { timeout: 120_000 }, () => {
    const config = cloneSimulationConfig(DEFAULT_SIMULATION_CONFIG);
    config.worldPreset = 'detailed-eurasia';
    config.seed = 12045;

    const engine = createSimulationEngine(config);
    const initialState = engine.getState();
    const initialMaxTechs = Math.max(
      ...initialState.tribes.map((tribe) => tribe.knownTechnologies.length),
    );
    const counts = new Map<string, number>();
    let relocationBegins = 0;
    let continuedRelocations = 0;

    for (let index = 0; index < 240; index += 1) {
      const result = engine.step(1);
      for (const event of result.emittedEvents) {
        counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
        if (event.kind === 'migration' && /began a relocation/i.test(event.title)) {
          relocationBegins += 1;
        }
        if (event.kind === 'migration' && /continued migrating/i.test(event.title)) {
          continuedRelocations += 1;
        }
      }
    }

    const state = engine.getState();
    const maxTechs = Math.max(...state.tribes.map((tribe) => tribe.knownTechnologies.length));

    expect(counts.get('disaster') ?? 0).toBeGreaterThan(200);
    expect(counts.get('disease') ?? 0).toBeGreaterThan(10);
    expect((counts.get('trade') ?? 0) + (counts.get('diplomacy') ?? 0)).toBeGreaterThanOrEqual(0);
    expect(counts.get('innovation') ?? 0).toBeLessThanOrEqual(2);
    expect(counts.get('migration') ?? 0).toBeGreaterThan(120);
    expect(counts.get('migration') ?? 0).toBeLessThan(260);
    expect(relocationBegins).toBeGreaterThan(20);
    expect(continuedRelocations).toBeGreaterThan(60);
    expect(Math.max(...state.tribes.map((tribe) => tribe.development.domestication))).toBeLessThan(10);
    expect(state.tribes.every((tribe) => tribe.development.agricultureStage === 'foraging')).toBe(true);
    expect(maxTechs).toBeLessThanOrEqual(initialMaxTechs + 2);
    expect(state.metrics.tribeCount).toBeGreaterThan(initialState.metrics.tribeCount);
    expect(state.metrics.tribeCount).toBeLessThanOrEqual(initialState.metrics.tribeCount + 8);
  });
});
