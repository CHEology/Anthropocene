import type { SimulationConfig, SimulationGlobals } from './types.js';

export const DEFAULT_GLOBALS: SimulationGlobals = {
  G_birth: 0.034,
  G_death: 0.024,
  G_hostility: 0.17,
  G_disaster: 0.12,
  G_innovation: 0.0022,
  G_cohesion: 0.88,
  G_temp: 15,
  G_migration: 0.18,
};

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  seed: 12045,
  worldPreset: 'detailed-eurasia',
  globals: { ...DEFAULT_GLOBALS },
  runtime: {
    yearsPerSecond: 8,
    snapshotThrottleMs: 80,
  },
  enabledSystems: {
    globalClimate: true,
    tileRecovery: true,
    tribeDynamics: true,
    interventions: true,
  },
};

export function cloneSimulationConfig(
  config: SimulationConfig = DEFAULT_SIMULATION_CONFIG,
): SimulationConfig {
  return structuredClone(config);
}
