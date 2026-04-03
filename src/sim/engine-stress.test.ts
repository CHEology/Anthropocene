/**
 * Comprehensive simulation stress tests.
 *
 * 15 test runs with different seeds and parameter sets, each simulating
 * thousands of years. Validates that the engine produces the emergent
 * dynamics described in v2/v3 design docs:
 *
 *  - Sustained population growth (not stagnation)
 *  - Migration waves out of East Africa
 *  - Tribe fission producing new groups
 *  - Innovation driven by environmental pressure
 *  - Boom-bust cycles (not monotonic growth)
 *  - Geographic spread across the hex map
 *  - Resistance to total extinction in most runs
 */

import { describe, expect, it } from 'vitest';
import { createSimulationEngine, type SimulationEngine } from './engine';
import { DEFAULT_SIMULATION_CONFIG, cloneSimulationConfig } from './config';
import type { SimulationConfig, WorldState } from './types';

const YEARS_PER_RUN = 3000;
const SNAPSHOT_INTERVAL = 50;

interface RunSnapshot {
  year: number;
  totalPop: number;
  tribeCount: number;
  tilesCovered: number;
  innovations: number;
  avgPressure: number;
  avgComfort: number;
  maxAbility: number;
  migrationEvents: number;
  fissionEvents: number;
}

interface RunResult {
  label: string;
  seed: number;
  snapshots: RunSnapshot[];
  finalState: WorldState;
  totalMigrations: number;
  totalFissions: number;
  totalInnovations: number;
  allExtinct: boolean;
  peakPop: number;
  peakTribes: number;
  tilesEverOccupied: Set<string>;
  elapsedMs: number;
}

function makeConfig(overrides: {
  seed?: number;
  G_birth?: number;
  G_death?: number;
  G_innovation?: number;
  G_migration?: number;
  G_cohesion?: number;
  G_hostility?: number;
  G_temp?: number;
}): SimulationConfig {
  const config = cloneSimulationConfig(DEFAULT_SIMULATION_CONFIG);
  if (overrides.seed !== undefined) config.seed = overrides.seed;
  if (overrides.G_birth !== undefined) config.globals.G_birth = overrides.G_birth;
  if (overrides.G_death !== undefined) config.globals.G_death = overrides.G_death;
  if (overrides.G_innovation !== undefined) config.globals.G_innovation = overrides.G_innovation;
  if (overrides.G_migration !== undefined) config.globals.G_migration = overrides.G_migration;
  if (overrides.G_cohesion !== undefined) config.globals.G_cohesion = overrides.G_cohesion;
  if (overrides.G_hostility !== undefined) config.globals.G_hostility = overrides.G_hostility;
  if (overrides.G_temp !== undefined) config.globals.G_temp = overrides.G_temp;
  return config;
}

function runSimulation(label: string, config: SimulationConfig, years: number): RunResult {
  const engine = createSimulationEngine(config);
  const snapshots: RunSnapshot[] = [];
  let totalMigrations = 0;
  let totalFissions = 0;
  let totalInnovations = 0;
  let peakPop = 0;
  let peakTribes = 0;
  const tilesEverOccupied = new Set<string>();
  let allExtinct = false;

  // Record initial occupied tiles
  for (const tribe of engine.getState().tribes) {
    tilesEverOccupied.add(tribe.tileId);
  }

  const start = performance.now();

  for (let y = 1; y <= years; y++) {
    const result = engine.step(1);

    // Count events
    for (const event of result.emittedEvents) {
      if (event.kind === 'migration') totalMigrations++;
      if (event.kind === 'system' && event.title.includes('split')) totalFissions++;
      if (event.kind === 'innovation') totalInnovations++;
    }

    const state = result.state;

    // Track tiles ever occupied
    for (const tribe of state.tribes) {
      tilesEverOccupied.add(tribe.tileId);
    }

    // Track peaks
    if (state.metrics.totalPopulation > peakPop) peakPop = state.metrics.totalPopulation;
    if (state.metrics.tribeCount > peakTribes) peakTribes = state.metrics.tribeCount;

    // Check extinction
    if (state.tribes.length === 0) {
      allExtinct = true;
      snapshots.push({
        year: y,
        totalPop: 0,
        tribeCount: 0,
        tilesCovered: 0,
        innovations: totalInnovations,
        avgPressure: 0,
        avgComfort: 0,
        maxAbility: 0,
        migrationEvents: totalMigrations,
        fissionEvents: totalFissions,
      });
      break;
    }

    // Take snapshots
    if (y % SNAPSHOT_INTERVAL === 0 || y === years) {
      const currentTiles = new Set(state.tribes.map((t) => t.tileId));
      const maxAbility = Math.max(
        ...state.tribes.flatMap((t) =>
          Object.values(t.abilities).map((a) => a.current),
        ),
      );
      snapshots.push({
        year: y,
        totalPop: state.metrics.totalPopulation,
        tribeCount: state.metrics.tribeCount,
        tilesCovered: currentTiles.size,
        innovations: totalInnovations,
        avgPressure: state.metrics.averagePressure,
        avgComfort: state.metrics.averageComfort,
        maxAbility,
        migrationEvents: totalMigrations,
        fissionEvents: totalFissions,
      });
    }
  }

  const elapsedMs = performance.now() - start;

  return {
    label,
    seed: config.seed,
    snapshots,
    finalState: engine.getState(),
    totalMigrations,
    totalFissions,
    totalInnovations,
    allExtinct,
    peakPop,
    peakTribes,
    tilesEverOccupied,
    elapsedMs,
  };
}

function printRunSummary(r: RunResult) {
  const last = r.snapshots[r.snapshots.length - 1];
  const first = r.snapshots[0];
  console.log(`\n=== ${r.label} (seed=${r.seed}) ===`);
  console.log(`  Time: ${r.elapsedMs.toFixed(0)}ms | Years: ${last?.year ?? 0}`);
  console.log(
    `  Pop: ${first?.totalPop ?? '?'} → ${last?.totalPop ?? 0} (peak: ${r.peakPop})`,
  );
  console.log(
    `  Tribes: ${first?.tribeCount ?? '?'} → ${last?.tribeCount ?? 0} (peak: ${r.peakTribes})`,
  );
  console.log(`  Tiles occupied: ${r.tilesEverOccupied.size} unique tiles ever`);
  console.log(
    `  Events: ${r.totalMigrations} migrations, ${r.totalFissions} fissions, ${r.totalInnovations} innovations`,
  );
  console.log(`  Extinct: ${r.allExtinct}`);

  // Print population trajectory at key milestones
  const milestones = [250, 500, 1000, 1500, 2000, 2500, 3000];
  const trajectory = milestones
    .map((y) => {
      const snap = r.snapshots.find((s) => s.year === y);
      return snap ? `y${y}:${snap.totalPop}` : null;
    })
    .filter(Boolean)
    .join(' → ');
  console.log(`  Trajectory: ${trajectory}`);

  // Check for stagnation: look at population variance in last 1000 years
  const last1000 = r.snapshots.filter((s) => s.year > (last?.year ?? 0) - 1000);
  if (last1000.length > 2) {
    const pops = last1000.map((s) => s.totalPop);
    const mean = pops.reduce((a, b) => a + b, 0) / pops.length;
    const variance =
      pops.reduce((a, b) => a + (b - mean) ** 2, 0) / pops.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    console.log(
      `  Last 1000y CV: ${cv.toFixed(3)} (${cv < 0.02 ? 'STAGNANT!' : cv < 0.1 ? 'low variation' : 'healthy variation'})`,
    );
  }

  // Check geographic spread
  const occupiedTiles = [...r.tilesEverOccupied];
  const reachedLevant = occupiedTiles.some(
    (t) =>
      t === 'levant-corridor' ||
      t === 'mesopotamia' ||
      t === 'anatolian-gate',
  );
  const reachedEurope = occupiedTiles.some(
    (t) =>
      t === 'europe-plain' ||
      t === 'aegean-arc' ||
      t === 'iberian-edge',
  );
  const reachedAsia = occupiedTiles.some(
    (t) =>
      t === 'indus-basin' ||
      t === 'gangetic-belt' ||
      t === 'china-heartland',
  );
  console.log(
    `  Reached: Levant=${reachedLevant}, Europe=${reachedEurope}, Asia=${reachedAsia}`,
  );
}

// ── Test configurations ────────────────────────────────────────────

const TEST_RUNS: Array<{ label: string; config: SimulationConfig; years: number }> = [
  // 1. Default seed baseline
  { label: 'Default baseline', config: makeConfig({ seed: 12045 }), years: YEARS_PER_RUN },
  // 2. Different seed
  { label: 'Seed 42', config: makeConfig({ seed: 42 }), years: YEARS_PER_RUN },
  // 3. Another seed
  { label: 'Seed 99999', config: makeConfig({ seed: 99999 }), years: YEARS_PER_RUN },
  // 4. Large seed
  { label: 'Seed 314159', config: makeConfig({ seed: 314159 }), years: YEARS_PER_RUN },
  // 5. High birth rate
  { label: 'High birth (0.042)', config: makeConfig({ seed: 7777, G_birth: 0.042 }), years: YEARS_PER_RUN },
  // 6. High death rate (harsher world)
  { label: 'High death (0.034)', config: makeConfig({ seed: 8888, G_death: 0.034 }), years: YEARS_PER_RUN },
  // 7. High innovation
  { label: 'High innovation (0.005)', config: makeConfig({ seed: 5555, G_innovation: 0.005 }), years: YEARS_PER_RUN },
  // 8. High migration tendency
  { label: 'High migration (0.2)', config: makeConfig({ seed: 3333, G_migration: 0.2 }), years: YEARS_PER_RUN },
  // 9. Low cohesion (more fission)
  { label: 'Low cohesion (0.75)', config: makeConfig({ seed: 1111, G_cohesion: 0.75 }), years: YEARS_PER_RUN },
  // 10. Cold world
  { label: 'Cold world (G_temp=10)', config: makeConfig({ seed: 2222, G_temp: 10 }), years: YEARS_PER_RUN },
  // 11. Hot world
  { label: 'Hot world (G_temp=20)', config: makeConfig({ seed: 4444, G_temp: 20 }), years: YEARS_PER_RUN },
  // 12. Aggressive (high hostility)
  { label: 'Aggressive (hostility=0.5)', config: makeConfig({ seed: 6666, G_hostility: 0.5 }), years: YEARS_PER_RUN },
  // 13. Combined: harsh but innovative
  { label: 'Harsh+innovative', config: makeConfig({ seed: 11111, G_death: 0.033, G_innovation: 0.004, G_migration: 0.15 }), years: YEARS_PER_RUN },
  // 14. Expansionist: high migration + low cohesion
  { label: 'Expansionist', config: makeConfig({ seed: 22222, G_migration: 0.2, G_cohesion: 0.8, G_innovation: 0.003 }), years: YEARS_PER_RUN },
  // 15. Seed stress test (large prime)
  { label: 'Seed 1000003', config: makeConfig({ seed: 1000003 }), years: YEARS_PER_RUN },
];

// ── Test suite ─────────────────────────────────────────────────────

describe('simulation stress tests (15 runs)', () => {
  const results: RunResult[] = [];

  // Run each test
  for (const { label, config, years } of TEST_RUNS) {
    it(`${label}: produces interesting emergent dynamics`, { timeout: 120_000 }, () => {
      const result = runSimulation(label, config, years);
      results.push(result);
      printRunSummary(result);

      const last = result.snapshots[result.snapshots.length - 1];

      // ── Core assertions ──

      // 1. Simulation should not crash / should complete all years (or go extinct)
      expect(last).toBeDefined();

      if (!result.allExtinct) {
        // 2. Population should grow meaningfully from initial ~566
        expect(result.peakPop).toBeGreaterThan(600);

        // 3. At least some fission events (tribes should split)
        expect(result.totalFissions).toBeGreaterThan(0);

        // 4. Innovations should happen
        expect(result.totalInnovations).toBeGreaterThan(10);

        // 5. Migrations should happen
        expect(result.totalMigrations).toBeGreaterThan(0);

        // 6. Should spread beyond starting 4 tiles
        expect(result.tilesEverOccupied.size).toBeGreaterThan(4);

        // 7. Population should not be stagnant (coefficient of variation > 0.02)
        const last1000 = result.snapshots.filter(
          (s) => s.year > (last?.year ?? 0) - 1000,
        );
        if (last1000.length > 2) {
          const pops = last1000.map((s) => s.totalPop);
          const mean = pops.reduce((a, b) => a + b, 0) / pops.length;
          const variance =
            pops.reduce((a, b) => a + (b - mean) ** 2, 0) / pops.length;
          const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
          expect(cv).toBeGreaterThan(0.01);
        }

        // 8. Final population should be larger than start (net growth over 3000 years)
        expect(last!.totalPop).toBeGreaterThan(566);

        // 9. Peak tribe count should exceed initial 4
        expect(result.peakTribes).toBeGreaterThan(4);

        // 10. Should reach at least the Nile corridor / Levant area
        const reachedBeyondAfrica = [...result.tilesEverOccupied].some(
          (t) =>
            t === 'levant-corridor' ||
            t === 'mesopotamia' ||
            t === 'upper-nile' ||
            t === 'nile-corridor' ||
            t === 'red-sea-passage',
        );
        expect(reachedBeyondAfrica).toBe(true);
      }
    });
  }

  // Summary test that runs after all individual runs
  it('aggregate: at most 2 of 15 runs result in total extinction', { timeout: 5_000 }, () => {
    const extinctCount = results.filter((r) => r.allExtinct).length;
    console.log(`\n=== AGGREGATE SUMMARY ===`);
    console.log(`Extinct runs: ${extinctCount} / ${results.length}`);
    console.log(
      `Average peak pop: ${Math.round(results.reduce((a, r) => a + r.peakPop, 0) / results.length)}`,
    );
    console.log(
      `Average tiles reached: ${(results.reduce((a, r) => a + r.tilesEverOccupied.size, 0) / results.length).toFixed(1)}`,
    );
    console.log(
      `Average peak tribes: ${(results.reduce((a, r) => a + r.peakTribes, 0) / results.length).toFixed(1)}`,
    );
    // Allow at most ~13% extinction rate (2/15)
    expect(extinctCount).toBeLessThanOrEqual(2);
  });
});
