import type {
  AbilityKey,
  AbilityState,
  RegionLabel,
  RouteLane,
  SimulationConfig,
  TileState,
  TribeState,
  WorldPresentation,
  WorldState,
} from '../sim/types';

interface TileSeed {
  id: string;
  name: string;
  region: string;
  q: number;
  r: number;
  climate: TileState['climate'];
  terrain: TileState['terrain'];
  water: number;
  habitability: number;
  baseTemperature: number;
  baseComfort: number;
  hunt: number;
  agri: number;
  isVolcanic?: boolean;
  isTectonic?: boolean;
}

interface TribeSeed {
  id: string;
  name: string;
  tileId: string;
  ancestryId: string;
  pop: number;
  color: string;
  leader: TribeState['leader'];
  abilityBias?: Partial<Record<AbilityKey, number>>;
  relationships?: Record<string, number>;
}

const HEX_DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

const TILE_SEEDS: TileSeed[] = [
  { id: 'congo-basin', name: 'Congo Basin', region: 'Equatorial Africa', q: -2, r: 1, climate: 'Af', terrain: 'forest', water: 6, habitability: 4.4, baseTemperature: 25, baseComfort: 4.4, hunt: 250, agri: 50 },
  { id: 'great-lakes', name: 'Great Lakes', region: 'East Africa', q: -1, r: 1, climate: 'Af', terrain: 'river_valley', water: 6, habitability: 5.0, baseTemperature: 23, baseComfort: 4.8, hunt: 220, agri: 70 },
  { id: 'rift-cradle', name: 'Rift Cradle', region: 'East Africa', q: 0, r: 0, climate: 'Aw', terrain: 'savanna', water: 5, habitability: 5.1, baseTemperature: 24, baseComfort: 4.9, hunt: 235, agri: 55 },
  { id: 'horn-gate', name: 'Horn Gate', region: 'East Africa', q: 1, r: 0, climate: 'BSh', terrain: 'coast', water: 3, habitability: 3.3, baseTemperature: 27, baseComfort: 3.0, hunt: 145, agri: 35 },
  { id: 'swahili-coast', name: 'Swahili Coast', region: 'Indian Ocean Rim', q: 0, r: 1, climate: 'Aw', terrain: 'coast', water: 4, habitability: 4.2, baseTemperature: 25, baseComfort: 4.0, hunt: 175, agri: 50 },
  { id: 'zambezian-frontier', name: 'Zambezian Frontier', region: 'Southern Africa', q: -1, r: 2, climate: 'Aw', terrain: 'savanna', water: 3, habitability: 3.7, baseTemperature: 24, baseComfort: 3.6, hunt: 150, agri: 35 },
  { id: 'cape-route', name: 'Cape Route', region: 'Southern Africa', q: -1, r: 3, climate: 'Cfb', terrain: 'coast', water: 4, habitability: 3.8, baseTemperature: 17, baseComfort: 3.6, hunt: 145, agri: 45 },
  { id: 'upper-nile', name: 'Upper Nile', region: 'Nile Basin', q: 1, r: -1, climate: 'Aw', terrain: 'river_valley', water: 6, habitability: 5.0, baseTemperature: 25, baseComfort: 4.9, hunt: 210, agri: 80 },
  { id: 'red-sea-passage', name: 'Red Sea Passage', region: 'Arabian Bridge', q: 2, r: -1, climate: 'BSh', terrain: 'coast', water: 2, habitability: 2.9, baseTemperature: 28, baseComfort: 2.8, hunt: 110, agri: 20 },
  { id: 'nile-corridor', name: 'Nile Corridor', region: 'Nile Basin', q: 1, r: -2, climate: 'BSh', terrain: 'river_valley', water: 6, habitability: 4.1, baseTemperature: 24, baseComfort: 4.0, hunt: 165, agri: 95 },
  { id: 'sahara-east', name: 'Sahara East', region: 'Sahara', q: 0, r: -2, climate: 'BWh', terrain: 'desert', water: 1, habitability: 1.0, baseTemperature: 31, baseComfort: 0.9, hunt: 30, agri: 5 },
  { id: 'sahara-core', name: 'Sahara Core', region: 'Sahara', q: -1, r: -2, climate: 'BWh', terrain: 'desert', water: 0, habitability: 0.6, baseTemperature: 33, baseComfort: 0.6, hunt: 12, agri: 0 },
  { id: 'sahara-west', name: 'Sahara West', region: 'Sahara', q: -2, r: -2, climate: 'BWh', terrain: 'desert', water: 0, habitability: 0.5, baseTemperature: 32, baseComfort: 0.6, hunt: 10, agri: 0 },
  { id: 'maghreb', name: 'Maghreb', region: 'North Africa', q: -2, r: -3, climate: 'BSh', terrain: 'coast', water: 3, habitability: 2.8, baseTemperature: 22, baseComfort: 2.6, hunt: 95, agri: 35 },
  { id: 'atlantic-step', name: 'Atlantic Step', region: 'Atlantic Fringe', q: -3, r: -3, climate: 'BSk', terrain: 'steppe', water: 2, habitability: 2.2, baseTemperature: 19, baseComfort: 2.1, hunt: 80, agri: 20 },
  { id: 'med-coast', name: 'Mediterranean Coast', region: 'Mediterranean', q: 0, r: -3, climate: 'Csa', terrain: 'coast', water: 3, habitability: 3.6, baseTemperature: 18, baseComfort: 3.5, hunt: 120, agri: 55 },
  { id: 'levant-corridor', name: 'Levant Corridor', region: 'Levant', q: 2, r: -2, climate: 'Csa', terrain: 'plains', water: 3, habitability: 3.9, baseTemperature: 20, baseComfort: 3.7, hunt: 135, agri: 60 },
  { id: 'anatolian-gate', name: 'Anatolian Gate', region: 'Anatolia', q: 2, r: -3, climate: 'Csb', terrain: 'highland', water: 3, habitability: 3.3, baseTemperature: 16, baseComfort: 3.1, hunt: 110, agri: 45 },
  { id: 'aegean-arc', name: 'Aegean Arc', region: 'Southern Europe', q: 1, r: -4, climate: 'Csa', terrain: 'coast', water: 3, habitability: 3.7, baseTemperature: 17, baseComfort: 3.4, hunt: 125, agri: 50 },
  { id: 'iberian-edge', name: 'Iberian Edge', region: 'Southern Europe', q: -1, r: -4, climate: 'Csa', terrain: 'coast', water: 3, habitability: 3.4, baseTemperature: 16, baseComfort: 3.2, hunt: 110, agri: 45 },
  { id: 'europe-plain', name: 'European Plain', region: 'Europe', q: 1, r: -5, climate: 'Cfb', terrain: 'plains', water: 4, habitability: 4.2, baseTemperature: 12, baseComfort: 4.0, hunt: 150, agri: 65 },
  { id: 'arabian-interior', name: 'Arabian Interior', region: 'Arabia', q: 3, r: -1, climate: 'BWh', terrain: 'desert', water: 1, habitability: 1.1, baseTemperature: 30, baseComfort: 1.0, hunt: 22, agri: 0 },
  { id: 'mesopotamia', name: 'Mesopotamia', region: 'Fertile Crescent', q: 3, r: -2, climate: 'BSh', terrain: 'river_valley', water: 5, habitability: 4.3, baseTemperature: 22, baseComfort: 4.1, hunt: 155, agri: 105, isTectonic: true },
  { id: 'persian-highland', name: 'Persian Highland', region: 'Iranian Plateau', q: 4, r: -2, climate: 'BSk', terrain: 'highland', water: 3, habitability: 2.9, baseTemperature: 16, baseComfort: 2.7, hunt: 95, agri: 35, isTectonic: true },
  { id: 'caspian-steppe', name: 'Caspian Steppe', region: 'Central Eurasia', q: 4, r: -3, climate: 'BSk', terrain: 'steppe', water: 2, habitability: 2.8, baseTemperature: 14, baseComfort: 2.7, hunt: 100, agri: 25 },
  { id: 'central-steppe', name: 'Central Steppe', region: 'Central Eurasia', q: 5, r: -3, climate: 'BSk', terrain: 'steppe', water: 2, habitability: 2.7, baseTemperature: 10, baseComfort: 2.6, hunt: 95, agri: 20 },
  { id: 'tarim-gate', name: 'Tarim Gate', region: 'Inner Asia', q: 6, r: -3, climate: 'BWk', terrain: 'highland', water: 1, habitability: 1.8, baseTemperature: 11, baseComfort: 1.8, hunt: 45, agri: 5, isTectonic: true },
  { id: 'indus-basin', name: 'Indus Basin', region: 'South Asia', q: 5, r: -2, climate: 'BSh', terrain: 'river_valley', water: 5, habitability: 4.1, baseTemperature: 23, baseComfort: 4.0, hunt: 150, agri: 105 },
  { id: 'himalayan-wall', name: 'Himalayan Wall', region: 'South Asia', q: 5, r: -1, climate: 'ET', terrain: 'mountain', water: 2, habitability: 1.4, baseTemperature: 4, baseComfort: 1.2, hunt: 30, agri: 0, isTectonic: true },
  { id: 'gangetic-belt', name: 'Gangetic Belt', region: 'South Asia', q: 6, r: -2, climate: 'Cwa', terrain: 'plains', water: 5, habitability: 4.8, baseTemperature: 24, baseComfort: 4.5, hunt: 165, agri: 110 },
  { id: 'deccan-coast', name: 'Deccan Coast', region: 'South Asia', q: 6, r: -1, climate: 'Aw', terrain: 'coast', water: 4, habitability: 4.0, baseTemperature: 26, baseComfort: 3.9, hunt: 145, agri: 70 },
  { id: 'china-heartland', name: 'China Heartland', region: 'East Asia', q: 7, r: -3, climate: 'Cfa', terrain: 'plains', water: 4, habitability: 4.5, baseTemperature: 18, baseComfort: 4.2, hunt: 150, agri: 95 },
  { id: 'loess-frontier', name: 'Loess Frontier', region: 'East Asia', q: 7, r: -4, climate: 'Dwa', terrain: 'plains', water: 3, habitability: 3.4, baseTemperature: 11, baseComfort: 3.0, hunt: 110, agri: 55 },
  { id: 'yangtze-coast', name: 'Yangtze Coast', region: 'East Asia', q: 8, r: -3, climate: 'Cfa', terrain: 'coast', water: 5, habitability: 4.7, baseTemperature: 19, baseComfort: 4.5, hunt: 170, agri: 100 },
  { id: 'sunda-shelf', name: 'Sunda Shelf', region: 'Southeast Asia', q: 8, r: -2, climate: 'Af', terrain: 'coast', water: 6, habitability: 4.8, baseTemperature: 27, baseComfort: 4.6, hunt: 200, agri: 85, isVolcanic: true, isTectonic: true },
  { id: 'siberian-fringe', name: 'Siberian Fringe', region: 'Northern Eurasia', q: 6, r: -5, climate: 'Dfc', terrain: 'forest', water: 3, habitability: 2.1, baseTemperature: 2, baseComfort: 1.8, hunt: 80, agri: 5 },
];

const TRIBE_SEEDS: TribeSeed[] = [
  { id: 'rift-foragers', name: 'Rift Foragers', tileId: 'rift-cradle', ancestryId: 'eden-cluster', pop: 164, color: '#f0a85a', leader: { name: 'Neru', archetype: 'Pathfinder', age: 33 }, abilityBias: { foraging: 12, heatTolerance: 8 }, relationships: { 'lake-network': 0.22, 'red-sea-watchers': 0.14, 'congo-canopy': 0.1 } },
  { id: 'lake-network', name: 'Lake Network', tileId: 'great-lakes', ancestryId: 'eden-cluster', pop: 138, color: '#cdd97a', leader: { name: 'Salai', archetype: 'Steward', age: 41 }, abilityBias: { waterEngineering: 10, organization: 6 }, relationships: { 'rift-foragers': 0.22, 'red-sea-watchers': 0.08, 'congo-canopy': 0.18 } },
  { id: 'red-sea-watchers', name: 'Red Sea Watchers', tileId: 'horn-gate', ancestryId: 'coastal-branch', pop: 116, color: '#6cc3c1', leader: { name: 'Tara', archetype: 'Broker', age: 29 }, abilityBias: { heatTolerance: 10, organization: 4 }, relationships: { 'rift-foragers': 0.14, 'lake-network': 0.08 } },
  { id: 'congo-canopy', name: 'Congo Canopy', tileId: 'congo-basin', ancestryId: 'forest-branch', pop: 148, color: '#9dc08b', leader: { name: 'Aru', archetype: 'Sage', age: 47 }, abilityBias: { foraging: 14, coldTolerance: -4 }, relationships: { 'lake-network': 0.18, 'rift-foragers': 0.1 } },
];

const ROUTE_LANES: RouteLane[] = [
  { id: 'nile-levant-route', label: 'Nile-Levant Corridor', tileIds: ['rift-cradle', 'upper-nile', 'nile-corridor', 'levant-corridor', 'mesopotamia'] },
  { id: 'southern-asia-route', label: 'South Asia Expansion Arc', tileIds: ['mesopotamia', 'persian-highland', 'indus-basin', 'gangetic-belt', 'china-heartland', 'yangtze-coast'] },
  { id: 'mediterranean-route', label: 'Mediterranean Turn', tileIds: ['nile-corridor', 'med-coast', 'aegean-arc', 'europe-plain'] },
  { id: 'coastal-bridge', label: 'Red Sea Coastal Bridge', tileIds: ['horn-gate', 'red-sea-passage', 'levant-corridor'] },
];

const REGION_LABELS: RegionLabel[] = [
  { id: 'east-africa', tileId: 'rift-cradle', label: 'East Africa', detail: 'Origin cluster' },
  { id: 'sahara', tileId: 'sahara-east', label: 'Sahara Barrier', detail: 'Low comfort, sparse water' },
  { id: 'levant', tileId: 'levant-corridor', label: 'Levant', detail: 'Gateway to Eurasia' },
  { id: 'south-asia', tileId: 'gangetic-belt', label: 'South Asia', detail: 'Monsoon corridor' },
  { id: 'east-asia', tileId: 'china-heartland', label: 'East Asia', detail: 'High carrying capacity' },
];

function createAbilities(
  bias: Partial<Record<AbilityKey, number>> = {},
): Record<AbilityKey, AbilityState> {
  const baseline: Record<AbilityKey, number> = {
    foraging: 46,
    agriculture: 4,
    heatTolerance: 34,
    coldTolerance: 12,
    waterEngineering: 18,
    attack: 20,
    organization: 22,
  };

  return Object.fromEntries(
    Object.entries(baseline).map(([ability, value]) => {
      const adjusted = Math.max(0, Math.min(100, value + (bias[ability as AbilityKey] ?? 0)));
      return [ability, { cap: adjusted, current: adjusted }];
    }),
  ) as Record<AbilityKey, AbilityState>;
}

function buildNeighbors(id: string, q: number, r: number) {
  return TILE_SEEDS.filter((candidate) => {
    if (candidate.id === id) {
      return false;
    }

    return HEX_DIRECTIONS.some(([dq, dr]) => candidate.q === q + dq && candidate.r === r + dr);
  })
    .map((tile) => tile.id)
    .sort();
}

function createTile(seed: TileSeed): TileState {
  return {
    id: seed.id,
    name: seed.name,
    region: seed.region,
    q: seed.q,
    r: seed.r,
    neighbors: buildNeighbors(seed.id, seed.q, seed.r),
    climate: seed.climate,
    terrain: seed.terrain,
    water: seed.water,
    habitability: seed.habitability,
    baseTemperature: seed.baseTemperature,
    temperature: seed.baseTemperature,
    baseComfort: seed.baseComfort,
    comfort: seed.baseComfort,
    baseCarryingCapacity: { hunt: seed.hunt, agri: seed.agri, water: seed.water * 60 },
    carryingCapacity: { hunt: seed.hunt, agri: seed.agri, water: seed.water * 60 },
    activeDisasters: [],
    activePlagues: [],
    isVolcanic: Boolean(seed.isVolcanic),
    isTectonic: Boolean(seed.isTectonic),
  };
}

function createTribe(seed: TribeSeed): TribeState {
  return {
    id: seed.id,
    name: seed.name,
    tileId: seed.tileId,
    ancestryId: seed.ancestryId,
    pop: seed.pop,
    color: seed.color,
    leader: seed.leader,
    abilities: createAbilities(seed.abilityBias),
    pressures: { food: 0.18, heat: 0.12, cold: 0.05, water: 0.08, competition: 0.11, organization: 0.16, total: 0.12 },
    relationships: seed.relationships ?? {},
    alliances: [],
    statusFlags: { migrating: false, recovering: false, highlighted: false },
  };
}

function computeMetrics(world: Pick<WorldState, 'tiles' | 'tribes'>) {
  const totalPopulation = world.tribes.reduce((sum, tribe) => sum + tribe.pop, 0);
  const tribeCount = world.tribes.length;
  const averageComfort = world.tiles.reduce((sum, tile) => sum + tile.comfort, 0) / Math.max(world.tiles.length, 1);
  const averagePressure = world.tribes.reduce((sum, tribe) => sum + tribe.pressures.total, 0) / Math.max(world.tribes.length, 1);

  return {
    totalPopulation,
    tribeCount,
    innovations: 0,
    conflicts: 0,
    averageComfort,
    averagePressure,
  };
}

export function createInitialWorldState(config: SimulationConfig): WorldState {
  const tiles = TILE_SEEDS.map(createTile);
  const tribes = TRIBE_SEEDS.map(createTribe);
  const metrics = computeMetrics({ tiles, tribes });

  return {
    year: 0,
    seed: config.seed,
    worldPreset: config.worldPreset,
    globalClimate: {
      baseline: config.globals.G_temp,
      anomaly: 0,
      meanTemperature: config.globals.G_temp,
    },
    tiles,
    tribes,
    eventLog: [
      {
        id: 'event-bootstrap',
        year: 0,
        kind: 'system',
        title: 'Foundation scaffold ready',
        detail: 'The authored Afro-Eurasian corridor is live. Later slices will deepen the mechanics phase by phase.',
      },
    ],
    metrics,
    history: [
      {
        year: 0,
        totalPopulation: metrics.totalPopulation,
        tribeCount: metrics.tribeCount,
        innovations: metrics.innovations,
        conflicts: metrics.conflicts,
      },
    ],
    pendingInterventions: [],
    executedInterventions: [],
    activeClimatePulses: [],
  };
}

export function getWorldPresentation(_: SimulationConfig['worldPreset']): WorldPresentation {
  return {
    name: 'Old World Corridor',
    description: 'An authored Afro-Eurasian hex field tuned for East African origin, Sahara friction, and Levantine breakout routes.',
    routeLanes: ROUTE_LANES,
    regionLabels: REGION_LABELS,
    startTileId: 'rift-cradle',
    startTribeId: 'rift-foragers',
  };
}
