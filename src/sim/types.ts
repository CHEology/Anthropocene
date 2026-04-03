export type WorldPresetId = 'old-world-corridor';
export type TerrainType =
  | 'river_valley'
  | 'savanna'
  | 'coast'
  | 'forest'
  | 'desert'
  | 'plains'
  | 'steppe'
  | 'highland'
  | 'mountain';
export type KoppenClimate =
  | 'Af'
  | 'Aw'
  | 'BWh'
  | 'BSh'
  | 'BSk'
  | 'BWk'
  | 'Csa'
  | 'Csb'
  | 'Cfa'
  | 'Cfb'
  | 'Cwa'
  | 'Dwa'
  | 'Dfc'
  | 'ET';
export type AbilityKey =
  | 'foraging'
  | 'agriculture'
  | 'heatTolerance'
  | 'coldTolerance'
  | 'waterEngineering'
  | 'attack'
  | 'organization';
export type InterventionKind = 'climate-pulse' | 'observation-note';
export type SimulationPhase =
  | 'global-events'
  | 'tile-update'
  | 'tribe-update'
  | 'interaction'
  | 'migration'
  | 'fission'
  | 'extinction';

export interface AbilityState {
  cap: number;
  current: number;
}

export interface LeaderState {
  name: string;
  archetype: 'Pathfinder' | 'Steward' | 'Broker' | 'Sage';
  age: number;
}

export interface TribePressureState {
  food: number;
  heat: number;
  cold: number;
  water: number;
  competition: number;
  organization: number;
  total: number;
}

export interface CarryingCapacityState {
  hunt: number;
  agri: number;
  water: number;
}

export interface TileState {
  id: string;
  name: string;
  region: string;
  q: number;
  r: number;
  neighbors: string[];
  climate: KoppenClimate;
  terrain: TerrainType;
  water: number;
  habitability: number;
  baseTemperature: number;
  temperature: number;
  baseComfort: number;
  comfort: number;
  baseCarryingCapacity: CarryingCapacityState;
  carryingCapacity: CarryingCapacityState;
  activeDisasters: string[];
  activePlagues: string[];
  isVolcanic: boolean;
  isTectonic: boolean;
}

export interface TribeState {
  id: string;
  name: string;
  tileId: string;
  ancestryId: string;
  pop: number;
  color: string;
  leader: LeaderState | null;
  abilities: Record<AbilityKey, AbilityState>;
  pressures: TribePressureState;
  relationships: Record<string, number>;
  alliances: string[];
  statusFlags: {
    migrating: boolean;
    recovering: boolean;
    highlighted: boolean;
  };
}

export interface SimulationEvent {
  id: string;
  year: number;
  kind: 'system' | 'intervention' | 'innovation' | 'migration' | 'warning';
  title: string;
  detail: string;
  tileId?: string;
  tribeId?: string;
}

export interface ClimatePulseEffect {
  commandId: string;
  label: string;
  remainingYears: number;
  temperatureDelta: number;
}

export interface InterventionCommand {
  id: string;
  label: string;
  kind: InterventionKind;
  scheduledYear: number;
  payload: {
    temperatureDelta?: number;
    duration?: number;
    note?: string;
  };
}

export interface WorldMetrics {
  totalPopulation: number;
  tribeCount: number;
  innovations: number;
  conflicts: number;
  averageComfort: number;
  averagePressure: number;
}

export interface MetricPoint {
  year: number;
  totalPopulation: number;
  tribeCount: number;
  innovations: number;
  conflicts: number;
}

export interface WorldState {
  year: number;
  seed: number;
  worldPreset: WorldPresetId;
  globalClimate: {
    baseline: number;
    anomaly: number;
    meanTemperature: number;
  };
  tiles: TileState[];
  tribes: TribeState[];
  eventLog: SimulationEvent[];
  metrics: WorldMetrics;
  history: MetricPoint[];
  pendingInterventions: InterventionCommand[];
  executedInterventions: InterventionCommand[];
  activeClimatePulses: ClimatePulseEffect[];
}

export interface SimulationGlobals {
  G_birth: number;
  G_death: number;
  G_hostility: number;
  G_disaster: number;
  G_innovation: number;
  G_cohesion: number;
  G_temp: number;
  G_migration: number;
}

export interface RuntimeConfig {
  yearsPerSecond: number;
  snapshotThrottleMs: number;
}

export interface EnabledSystems {
  globalClimate: boolean;
  tileRecovery: boolean;
  tribeDynamics: boolean;
  interventions: boolean;
}

export interface SimulationConfig {
  seed: number;
  worldPreset: WorldPresetId;
  globals: SimulationGlobals;
  runtime: RuntimeConfig;
  enabledSystems: EnabledSystems;
}

export interface SimulationStepResult {
  previousYear: number;
  nextYear: number;
  emittedEvents: SimulationEvent[];
  changedTileIds: string[];
  changedTribeIds: string[];
  metricsDelta: Partial<WorldMetrics>;
  phases: SimulationPhase[];
  state: WorldState;
}

export interface RouteLane {
  id: string;
  label: string;
  tileIds: string[];
}

export interface RegionLabel {
  id: string;
  tileId: string;
  label: string;
  detail: string;
}

export interface WorldPresentation {
  name: string;
  description: string;
  routeLanes: RouteLane[];
  regionLabels: RegionLabel[];
  startTileId: string;
  startTribeId: string;
}
