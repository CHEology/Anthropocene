import type { SimulationConfig, SimulationGlobals } from './types';

export const DEFAULT_GLOBALS: SimulationGlobals = {
  G_birth: 0.035,
  G_death: 0.029,
  G_hostility: 0.2,
  G_disaster: 0.1,
  G_innovation: 0.002,
  G_cohesion: 0.9,
  G_temp: 15,
  G_migration: 0.1,
};

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  seed: 12045,
  worldPreset: 'old-world-corridor',
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
