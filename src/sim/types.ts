export type WorldPresetId = 'old-world-corridor' | 'detailed-eurasia';
export type TerrainType =
  | 'river_valley'
  | 'savanna'
  | 'coast'
  | 'forest'
  | 'desert'
  | 'plains'
  | 'steppe'
  | 'highland'
  | 'mountain'
  | 'sea';
export type MovementTag =
  | 'river-corridor'
  | 'coastal-corridor'
  | 'steppe-corridor'
  | 'desert-pass'
  | 'mountain-pass'
  | 'land-bridge'
  | 'strait';
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
export type TechnologyCategory = 'subsistence' | 'social' | 'military' | 'craft' | 'knowledge';
export type TechnologyId =
  | 'fire-mastery'
  | 'cooking'
  | 'hafted-tools'
  | 'composite-tools'
  | 'proto-cultivation'
  | 'irrigation'
  | 'animal-tracking'
  | 'pack-hunting'
  | 'early-domestication'
  | 'herding'
  | 'pottery'
  | 'weaving'
  | 'permanent-shelter'
  | 'fortification'
  | 'oral-tradition'
  | 'counting'
  | 'ritual-organization'
  | 'basic-medicine'
  | 'water-finding'
  | 'well-digging'
  | 'canal-building'
  | 'stone-working'
  | 'copper-working'
  | 'bronze-working'
  | 'boat-building'
  | 'navigation'
  | 'fermentation'
  | 'granary-storage'
  | 'tanning'
  | 'smelting';

export interface TechnologyDefinition {
  id: TechnologyId;
  name: string;
  category: TechnologyCategory;
  prerequisites: TechnologyId[];
  effects: Partial<Record<AbilityKey, number>>;
  populationRequirement: number;
  regressionChance: number;
  spreadWeight: number;
  discoveryWeight: number;
}

export type InterventionKind = 'climate-pulse' | 'observation-note';
export type LeaderArchetype = 'Pathfinder' | 'Steward' | 'Broker' | 'Sage';
export type ClimateRegime =
  | 'deep-glacial'
  | 'glacial'
  | 'cool-transition'
  | 'temperate-window'
  | 'warm-pulse'
  | 'volcanic-winter';
export type StorytellerPosture =
  | 'quiet'
  | 'balanced'
  | 'prosperity'
  | 'recovery'
  | 'crisis';
export type AgricultureStage =
  | 'foraging'
  | 'tending'
  | 'cultivation'
  | 'agropastoral'
  | 'settled-farming';
export type DisasterKind =
  | 'drought'
  | 'flood'
  | 'wildfire'
  | 'severe-winter'
  | 'earthquake'
  | 'eruption'
  | 'supervolcano'
  | 'megadrought';
export type PlagueKind = 'waterborne' | 'respiratory' | 'zoonotic';
export type SimulationEventKind =
  | 'system'
  | 'intervention'
  | 'innovation'
  | 'migration'
  | 'warning'
  | 'combat'
  | 'trade'
  | 'diplomacy'
  | 'disaster'
  | 'disease';
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
  archetype: LeaderArchetype;
  age: number;
  tenure: number;
  authority: number;
  legitimacy: number;
}

export interface TribePressureState {
  food: number;
  heat: number;
  cold: number;
  water: number;
  competition: number;
  organization: number;
  health: number;
  total: number;
}

export interface CarryingCapacityState {
  hunt: number;
  agri: number;
  water: number;
}

export interface ActiveDisasterState {
  kind: DisasterKind;
  severity: number;
  remainingYears: number;
}

export interface ActivePlagueState {
  kind: PlagueKind;
  severity: number;
  remainingYears: number;
}

export interface TribeDevelopmentState {
  agricultureStage: AgricultureStage;
  domestication: number;
  sedentism: number;
}

export interface TribeExchangeState {
  tradeVolume: number;
  diffusion: number;
  raidExposure: number;
  warExhaustion: number;
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
  activeDisasters: ActiveDisasterState[];
  activePlagues: ActivePlagueState[];
  isVolcanic: boolean;
  isTectonic: boolean;
  elevation: number;
  megafaunaIndex: number;
  coastal: boolean;
  movementTags: MovementTag[];
}

export interface TribeMigrationState {
  homeTileId: string;
  cooldownYears: number;
  destinationTileId: string | null;
  plannedRouteTileIds: string[];
  commitmentYears: number;
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
  development: TribeDevelopmentState;
  exchange: TribeExchangeState;
  geneticDiversity: number;
  foodStores: number;
  relationships: Record<string, number>;
  alliances: string[];
  knownTechnologies: TechnologyId[];
  migration: TribeMigrationState;
  statusFlags: {
    migrating: boolean;
    recovering: boolean;
    highlighted: boolean;
  };
}

export interface SimulationEvent {
  id: string;
  year: number;
  kind: SimulationEventKind;
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
  averageFoodStores: number;
  averageGeneticDiversity: number;
  averageMegafauna: number;
  activeHazards: number;
  activePlagues: number;
}

export interface MetricPoint {
  year: number;
  totalPopulation: number;
  tribeCount: number;
  innovations: number;
  conflicts: number;
}

export interface StorytellerState {
  prosperity: number;
  prosperityStreak: number;
  crisisStreak: number;
  quietStreak: number;
  disasterMultiplier: number;
  recoveryMultiplier: number;
  posture: StorytellerPosture;
}

export interface WorldState {
  year: number;
  seed: number;
  worldPreset: WorldPresetId;
  globalClimate: {
    baseline: number;
    anomaly: number;
    meanTemperature: number;
    regime: ClimateRegime;
  };
  storyteller: StorytellerState;
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
  riverLanes?: RouteLane[];
  regionLabels: RegionLabel[];
  startTileId: string;
  startTileName: string;
  startTribeId: string;
  startTribeName: string;
}
