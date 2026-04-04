import type {
  AbilityKey,
  AbilityState,
  RegionLabel,
  RouteLane,
  SimulationConfig,
  StorytellerState,
  TileState,
  TribeState,
  WorldPresentation,
  WorldState,
} from '../sim/types.js';

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
  elevation?: number;
  megafaunaIndex?: number;
  coastal?: boolean;
}

interface LeaderSeed {
  name: string;
  archetype: NonNullable<TribeState['leader']>['archetype'];
  age: number;
  tenure?: number;
  authority?: number;
  legitimacy?: number;
}

interface TribeSeed {
  id: string;
  name: string;
  tileId: string;
  ancestryId: string;
  pop: number;
  color: string;
  leader: LeaderSeed | null;
  abilityBias?: Partial<Record<AbilityKey, number>>;
  relationships?: Record<string, number>;
  alliances?: string[];
  development?: Partial<TribeState['development']>;
  exchange?: Partial<TribeState['exchange']>;
}

interface WorldPresetDefinition {
  presentation: WorldPresentation;
  bootstrapEvent: {
    title: string;
    detail: string;
  };
  tileSeeds: TileSeed[];
  tribeSeeds: TribeSeed[];
}

interface DetailedTileDraft {
  col: number;
  row: number;
  q: number;
  r: number;
  lon: number;
  lat: number;
  landNeighbors: number;
  coastal: boolean;
}

const HEX_DIRECTIONS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(digits));
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const OLD_WORLD_CORRIDOR_TILE_SEEDS: TileSeed[] = [
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

const OLD_WORLD_CORRIDOR_TRIBE_SEEDS: TribeSeed[] = [
  {
    id: 'rift-foragers',
    name: 'Rift Foragers',
    tileId: 'rift-cradle',
    ancestryId: 'eden-cluster',
    pop: 164,
    color: '#f0a85a',
    leader: { name: 'Neru', archetype: 'Pathfinder', age: 33, authority: 0.62, legitimacy: 0.66 },
    abilityBias: { foraging: 12, heatTolerance: 8 },
    relationships: { 'lake-network': 0.22, 'red-sea-watchers': 0.14, 'congo-canopy': 0.1 },
    development: { agricultureStage: 'foraging', domestication: 6, sedentism: 0.08 },
  },
  {
    id: 'lake-network',
    name: 'Lake Network',
    tileId: 'great-lakes',
    ancestryId: 'eden-cluster',
    pop: 138,
    color: '#cdd97a',
    leader: { name: 'Salai', archetype: 'Steward', age: 41, authority: 0.68, legitimacy: 0.72 },
    abilityBias: { waterEngineering: 10, organization: 6 },
    relationships: { 'rift-foragers': 0.22, 'red-sea-watchers': 0.08, 'congo-canopy': 0.18 },
    development: { agricultureStage: 'tending', domestication: 14, sedentism: 0.17 },
  },
  {
    id: 'red-sea-watchers',
    name: 'Red Sea Watchers',
    tileId: 'horn-gate',
    ancestryId: 'coastal-branch',
    pop: 116,
    color: '#6cc3c1',
    leader: { name: 'Tara', archetype: 'Broker', age: 29, authority: 0.57, legitimacy: 0.61 },
    abilityBias: { heatTolerance: 10, organization: 4 },
    relationships: { 'rift-foragers': 0.14, 'lake-network': 0.08 },
    development: { agricultureStage: 'tending', domestication: 12, sedentism: 0.14 },
    exchange: { tradeVolume: 0.08, diffusion: 0.04 },
  },
  {
    id: 'congo-canopy',
    name: 'Congo Canopy',
    tileId: 'congo-basin',
    ancestryId: 'forest-branch',
    pop: 148,
    color: '#9dc08b',
    leader: { name: 'Aru', archetype: 'Sage', age: 47, authority: 0.7, legitimacy: 0.68 },
    abilityBias: { foraging: 14, coldTolerance: -4 },
    relationships: { 'lake-network': 0.18, 'rift-foragers': 0.1 },
    development: { agricultureStage: 'foraging', domestication: 8, sedentism: 0.09 },
  },
];

const OLD_WORLD_CORRIDOR_ROUTE_LANES: RouteLane[] = [
  { id: 'nile-levant-route', label: 'Nile-Levant Corridor', tileIds: ['rift-cradle', 'upper-nile', 'nile-corridor', 'levant-corridor', 'mesopotamia'] },
  { id: 'southern-asia-route', label: 'South Asia Expansion Arc', tileIds: ['mesopotamia', 'persian-highland', 'indus-basin', 'gangetic-belt', 'china-heartland', 'yangtze-coast'] },
  { id: 'mediterranean-route', label: 'Mediterranean Turn', tileIds: ['nile-corridor', 'med-coast', 'aegean-arc', 'europe-plain'] },
  { id: 'coastal-bridge', label: 'Red Sea Coastal Bridge', tileIds: ['horn-gate', 'red-sea-passage', 'levant-corridor'] },
];

const OLD_WORLD_CORRIDOR_REGION_LABELS: RegionLabel[] = [
  { id: 'east-africa', tileId: 'rift-cradle', label: 'East Africa', detail: 'Origin cluster' },
  { id: 'sahara', tileId: 'sahara-east', label: 'Sahara Barrier', detail: 'Low comfort, sparse water' },
  { id: 'levant', tileId: 'levant-corridor', label: 'Levant', detail: 'Gateway to Eurasia' },
  { id: 'south-asia', tileId: 'gangetic-belt', label: 'South Asia', detail: 'Monsoon corridor' },
  { id: 'east-asia', tileId: 'china-heartland', label: 'East Asia', detail: 'High carrying capacity' },
];

const OLD_WORLD_CORRIDOR_PRESET: WorldPresetDefinition = {
  tileSeeds: OLD_WORLD_CORRIDOR_TILE_SEEDS,
  tribeSeeds: OLD_WORLD_CORRIDOR_TRIBE_SEEDS,
  bootstrapEvent: {
    title: 'Foundation scaffold ready',
    detail: 'The authored Afro-Eurasian corridor is live. Later slices will deepen the mechanics phase by phase.',
  },
  presentation: {
    name: 'Old World Corridor',
    description: 'An authored Afro-Eurasian hex field tuned for East African origin, Sahara friction, and Levantine breakout routes.',
    routeLanes: OLD_WORLD_CORRIDOR_ROUTE_LANES,
    regionLabels: OLD_WORLD_CORRIDOR_REGION_LABELS,
    startTileId: 'rift-cradle',
    startTileName: 'Rift Cradle',
    startTribeId: 'rift-foragers',
    startTribeName: 'Rift Foragers',
  },
};

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

function buildNeighbors(tileSeeds: TileSeed[], id: string, q: number, r: number) {
  return tileSeeds
    .filter((candidate) => {
      if (candidate.id === id) {
        return false;
      }

      return HEX_DIRECTIONS.some(([dq, dr]) => candidate.q === q + dq && candidate.r === r + dr);
    })
    .map((tile) => tile.id)
    .sort();
}

function defaultMegafaunaIndex(terrain: TileState['terrain'], climate: TileState['climate']): number {
  const terrainBase: Record<TileState['terrain'], number> = {
    savanna: 0.9,
    plains: 0.8,
    steppe: 0.75,
    forest: 0.7,
    river_valley: 0.65,
    coast: 0.5,
    highland: 0.4,
    desert: 0.15,
    mountain: 0.1,
  };
  const climateFactor =
    climate === 'ET' || climate === 'Dfc' ? 0.6
    : climate === 'BWh' || climate === 'BWk' ? 0.3
    : climate === 'Af' ? 0.85
    : 1.0;
  return round(clamp(terrainBase[terrain] * climateFactor, 0, 1));
}

function defaultElevation(terrain: TileState['terrain']): number {
  const base: Record<TileState['terrain'], number> = {
    mountain: 3500,
    highland: 1800,
    steppe: 600,
    desert: 400,
    plains: 200,
    forest: 300,
    savanna: 350,
    river_valley: 50,
    coast: 5,
  };
  return base[terrain];
}

function createTile(seed: TileSeed, tileSeeds: TileSeed[]): TileState {
  const terrain = seed.terrain;
  const coastal = seed.coastal ?? (terrain === 'coast');
  return {
    id: seed.id,
    name: seed.name,
    region: seed.region,
    q: seed.q,
    r: seed.r,
    neighbors: buildNeighbors(tileSeeds, seed.id, seed.q, seed.r),
    climate: seed.climate,
    terrain,
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
    elevation: seed.elevation ?? defaultElevation(terrain),
    megafaunaIndex: seed.megafaunaIndex ?? defaultMegafaunaIndex(terrain, seed.climate),
    coastal,
  };
}

function createLeader(seed: LeaderSeed | null): TribeState['leader'] {
  if (!seed) {
    return null;
  }

  return {
    name: seed.name,
    archetype: seed.archetype,
    age: seed.age,
    tenure: seed.tenure ?? 0,
    authority: clamp(seed.authority ?? 0.58, 0.25, 1),
    legitimacy: clamp(seed.legitimacy ?? 0.64, 0.2, 1),
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
    leader: createLeader(seed.leader),
    abilities: createAbilities(seed.abilityBias),
    pressures: {
      food: 0.18,
      heat: 0.12,
      cold: 0.05,
      water: 0.08,
      competition: 0.11,
      organization: 0.16,
      health: 0.08,
      total: 0.11,
    },
    development: {
      agricultureStage: seed.development?.agricultureStage ?? 'foraging',
      domestication: seed.development?.domestication ?? 8,
      sedentism: seed.development?.sedentism ?? 0.1,
    },
    exchange: {
      tradeVolume: seed.exchange?.tradeVolume ?? 0.04,
      diffusion: seed.exchange?.diffusion ?? 0.02,
      raidExposure: seed.exchange?.raidExposure ?? 0,
      warExhaustion: seed.exchange?.warExhaustion ?? 0,
    },
    geneticDiversity: 1.0,
    foodStores: 0.3,
    relationships: seed.relationships ?? {},
    alliances: seed.alliances ?? [],
    statusFlags: { migrating: false, recovering: false, highlighted: false },
  };
}

function describeInitialClimateRegime(meanTemperature: number): WorldState['globalClimate']['regime'] {
  if (meanTemperature <= 9.5) {
    return 'deep-glacial';
  }
  if (meanTemperature <= 13.2) {
    return 'glacial';
  }
  if (meanTemperature <= 14.6) {
    return 'cool-transition';
  }
  if (meanTemperature >= 16.8) {
    return 'warm-pulse';
  }
  return 'temperate-window';
}

function computeMetrics(world: Pick<WorldState, 'tiles' | 'tribes'>) {
  const totalPopulation = world.tribes.reduce((sum, tribe) => sum + tribe.pop, 0);
  const tribeCount = world.tribes.length;
  const averageComfort =
    world.tiles.reduce((sum, tile) => sum + tile.comfort, 0) /
    Math.max(world.tiles.length, 1);
  const averagePressure =
    world.tribes.reduce((sum, tribe) => sum + tribe.pressures.total, 0) /
    Math.max(world.tribes.length, 1);
  const averageFoodStores =
    world.tribes.reduce((sum, tribe) => sum + tribe.foodStores, 0) /
    Math.max(world.tribes.length, 1);
  const averageGeneticDiversity =
    world.tribes.reduce((sum, tribe) => sum + tribe.geneticDiversity, 0) /
    Math.max(world.tribes.length, 1);
  const averageMegafauna =
    world.tiles.reduce((sum, tile) => sum + tile.megafaunaIndex, 0) /
    Math.max(world.tiles.length, 1);

  return {
    totalPopulation,
    tribeCount,
    innovations: 0,
    conflicts: 0,
    averageComfort: round(averageComfort, 3),
    averagePressure: round(averagePressure, 3),
    averageFoodStores: round(averageFoodStores, 3),
    averageGeneticDiversity: round(averageGeneticDiversity, 4),
    averageMegafauna: round(averageMegafauna, 3),
    activeHazards: 0,
    activePlagues: 0,
  };
}

function inBox(
  lon: number,
  lat: number,
  minLon: number,
  maxLon: number,
  minLat: number,
  maxLat: number,
) {
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

function inEllipse(
  lon: number,
  lat: number,
  centerLon: number,
  centerLat: number,
  radiusLon: number,
  radiusLat: number,
) {
  const normalizedLon = (lon - centerLon) / radiusLon;
  const normalizedLat = (lat - centerLat) / radiusLat;
  return normalizedLon * normalizedLon + normalizedLat * normalizedLat <= 1;
}

function isDetailedEurasiaLand(lon: number, lat: number) {
  let land = false;
  land ||= inEllipse(lon, lat, 18, 52, 30, 17);
  land ||= inEllipse(lon, lat, 64, 55, 42, 17);
  land ||= inEllipse(lon, lat, 112, 56, 58, 19);
  land ||= inEllipse(lon, lat, 112, 39, 45, 15);
  land ||= inEllipse(lon, lat, 48, 25, 16, 12);
  land ||= inEllipse(lon, lat, 79, 22, 16, 12);
  land ||= inEllipse(lon, lat, 102, 18, 15, 10);
  land ||= inEllipse(lon, lat, 136, 37, 9, 10);
  land ||= inEllipse(lon, lat, -2, 54, 8, 8);
  land ||= inEllipse(lon, lat, 19, 64, 11, 11);
  land ||= inEllipse(lon, lat, 13, 41, 10, 6.5);

  if (!land) {
    return false;
  }

  const mediterranean = inEllipse(lon, lat, 18, 36.5, 21, 6.5);
  const blackSea = inEllipse(lon, lat, 35, 44, 8, 4.5);
  const caspianSea = inEllipse(lon, lat, 51.5, 42, 5, 8.5);
  const aralSea = inEllipse(lon, lat, 60.5, 45, 4.2, 2.8);
  const persianGulf = inEllipse(lon, lat, 51, 27, 5, 2.8);
  const bayOfBengal = inEllipse(lon, lat, 89, 18, 8.5, 6.8);
  const southChinaSea = inEllipse(lon, lat, 118, 18, 15, 8.5);
  const redSea = inEllipse(lon, lat, 39, 20, 3, 8.5);

  const anatolia = inBox(lon, lat, 26, 43, 36, 42.5);
  const italyAndBalkans = inBox(lon, lat, 8, 25, 38, 46);
  const levant = inBox(lon, lat, 33, 39, 31, 36);
  const sinaiBridge = inBox(lon, lat, 29, 35, 29, 33);
  const southArabia = inBox(lon, lat, 42, 56, 16, 24);
  const india = inBox(lon, lat, 69, 90, 8, 30);
  const southeastAsia = inBox(lon, lat, 95, 109, 10, 24);
  const southChina = inBox(lon, lat, 105, 122, 21, 31);

  if (mediterranean && !italyAndBalkans && !anatolia && !levant && !sinaiBridge) {
    return false;
  }

  if (blackSea && !anatolia) {
    return false;
  }

  if (caspianSea || aralSea) {
    return false;
  }

  if (persianGulf && !southArabia) {
    return false;
  }

  if (redSea && !sinaiBridge && !southArabia) {
    return false;
  }

  if (bayOfBengal && !india && !southeastAsia) {
    return false;
  }

  if (southChinaSea && !southChina && !southeastAsia) {
    return false;
  }

  return true;
}
function isMountainCore(lon: number, lat: number) {
  return (
    inEllipse(lon, lat, 10.5, 46.2, 6.2, 2.6) ||
    inEllipse(lon, lat, 23.5, 47, 4.5, 2.6) ||
    inEllipse(lon, lat, 43.5, 42.5, 5.5, 2.1) ||
    inEllipse(lon, lat, 50, 32.2, 7, 4.3) ||
    inEllipse(lon, lat, 71, 36, 6, 3.7) ||
    inEllipse(lon, lat, 84, 31.3, 15.5, 3.5) ||
    inEllipse(lon, lat, 79.5, 41.3, 9.5, 3.4) ||
    inEllipse(lon, lat, 91, 49, 7.5, 3.4) ||
    inEllipse(lon, lat, 100, 26.5, 5.5, 4.5) ||
    inEllipse(lon, lat, 138, 37, 6.5, 7)
  );
}

function isHighlandCore(lon: number, lat: number) {
  return (
    inEllipse(lon, lat, 17, 64.5, 7.5, 8) ||
    inEllipse(lon, lat, 35, 39, 8.5, 4.2) ||
    inEllipse(lon, lat, 57, 31.5, 10.5, 5.5) ||
    inEllipse(lon, lat, 61, 59, 4.5, 7.5) ||
    inEllipse(lon, lat, 88.5, 34.2, 14.5, 5.8) ||
    inEllipse(lon, lat, 98, 40, 11, 4.5)
  );
}

function isRiverValley(lon: number, lat: number) {
  return (
    inEllipse(lon, lat, 23, 45.5, 7.5, 2.7) ||
    inEllipse(lon, lat, 43, 33.5, 5, 3.7) ||
    inEllipse(lon, lat, 70.5, 29.2, 3.8, 4.8) ||
    inEllipse(lon, lat, 82.5, 26.5, 9.5, 4.1) ||
    inEllipse(lon, lat, 113.5, 35.5, 6.8, 3.1) ||
    inEllipse(lon, lat, 112.5, 30.3, 10.5, 3.4) ||
    inEllipse(lon, lat, 103.5, 18.6, 4.5, 5.8)
  );
}

function isDesertCore(lon: number, lat: number) {
  return (
    inEllipse(lon, lat, 46.5, 23.5, 10.5, 7.7) ||
    inEllipse(lon, lat, 39, 33, 5.6, 3.6) ||
    inEllipse(lon, lat, 56.5, 33, 7.4, 4.2) ||
    inEllipse(lon, lat, 61.5, 41.5, 6.5, 3.7) ||
    inEllipse(lon, lat, 73, 27.5, 4.6, 3.1) ||
    inEllipse(lon, lat, 84.5, 40.2, 8.7, 3.9) ||
    inEllipse(lon, lat, 102, 42.8, 10.8, 4.3)
  );
}

function isSteppeCore(lon: number, lat: number) {
  return (
    inEllipse(lon, lat, 36, 49, 14, 4.5) ||
    inEllipse(lon, lat, 67, 48.5, 20, 6.5) ||
    inEllipse(lon, lat, 103, 46.5, 12.5, 5.4)
  );
}

function isVolcanicZone(lon: number, lat: number) {
  return inEllipse(lon, lat, 138, 37, 6.5, 7) || inEllipse(lon, lat, 105, 15, 4.5, 4.5);
}

function isTectonicZone(lon: number, lat: number) {
  return (
    isVolcanicZone(lon, lat) ||
    inEllipse(lon, lat, 43.5, 42.5, 6, 2.8) ||
    inEllipse(lon, lat, 50, 32.2, 9, 5.2) ||
    inEllipse(lon, lat, 84, 31.3, 18, 4.5)
  );
}

function classifyDetailedRegion(lon: number, lat: number) {
  if (inEllipse(lon, lat, 17, 64.5, 7.5, 8)) {
    return 'Scandinavia';
  }
  if (lon < 3 && lat < 45) {
    return 'Iberia';
  }
  if (lon < 4 && lat >= 45) {
    return 'Atlantic Europe';
  }
  if (inBox(lon, lat, 5, 18, 44, 54)) {
    return 'Central Europe';
  }
  if (inBox(lon, lat, 10, 26, 38, 46)) {
    return 'Mediterranean Europe';
  }
  if (inBox(lon, lat, 20, 36, 45, 55)) {
    return 'Eastern Europe';
  }
  if (inEllipse(lon, lat, 36, 49, 14, 4.5)) {
    return 'Pontic Steppe';
  }
  if (inBox(lon, lat, 32, 39, 30, 36.8)) {
    return 'Levant';
  }
  if (inEllipse(lon, lat, 43, 33.5, 5, 3.7)) {
    return 'Mesopotamia';
  }
  if (inEllipse(lon, lat, 43.5, 42.5, 6, 2.8)) {
    return 'Caucasus';
  }
  if (inEllipse(lon, lat, 35, 39, 8.5, 4.2)) {
    return 'Anatolia';
  }
  if (inEllipse(lon, lat, 46.5, 23.5, 10.5, 7.7)) {
    return 'Arabia';
  }
  if (inEllipse(lon, lat, 57, 31.5, 10.5, 5.5)) {
    return 'Iranian Plateau';
  }
  if (inEllipse(lon, lat, 61.5, 41.5, 6.5, 3.7)) {
    return 'Transoxiana';
  }
  if (inEllipse(lon, lat, 84.5, 40.2, 8.7, 3.9)) {
    return 'Tarim Basin';
  }
  if (inEllipse(lon, lat, 84, 31.3, 15.5, 3.5)) {
    return 'Himalayan Arc';
  }
  if (inEllipse(lon, lat, 88.5, 34.2, 14.5, 5.8)) {
    return 'Tibetan Plateau';
  }
  if (inEllipse(lon, lat, 70.5, 29.2, 3.8, 4.8)) {
    return 'Indus Basin';
  }
  if (inEllipse(lon, lat, 82.5, 26.5, 9.5, 4.1)) {
    return 'Gangetic Plain';
  }
  if (inBox(lon, lat, 72, 83, 12, 23)) {
    return 'Deccan';
  }
  if (inEllipse(lon, lat, 103, 46.5, 12.5, 5.4)) {
    return 'Mongolian Steppe';
  }
  if (lat > 55) {
    return 'Siberian Taiga';
  }
  if (inEllipse(lon, lat, 113.5, 35.5, 6.8, 3.1)) {
    return 'North China Plain';
  }
  if (inEllipse(lon, lat, 112.5, 30.3, 10.5, 3.4)) {
    return 'Yangtze Basin';
  }
  if (inBox(lon, lat, 105, 121, 21, 30)) {
    return 'South China';
  }
  if (inBox(lon, lat, 120, 132, 41, 50)) {
    return 'Manchuria';
  }
  if (inBox(lon, lat, 126, 131, 34, 39.5)) {
    return 'Korea';
  }
  if (inEllipse(lon, lat, 138, 37, 6.5, 7)) {
    return 'Japan';
  }
  if (inBox(lon, lat, 96, 108, 10, 24)) {
    return 'Mainland Southeast Asia';
  }
  if (lon < 30) {
    return lat >= 50 ? 'Eastern Europe' : 'Mediterranean Europe';
  }
  if (lon < 70) {
    return lat >= 46 ? 'Central Asia' : 'Iranian Plateau';
  }
  if (lon < 105) {
    return lat >= 46 ? 'Central Asia' : 'Inner Asia';
  }
  return lat >= 48 ? 'Northeast Asia' : 'East Asia';
}

function classifyDetailedTerrain(tile: DetailedTileDraft): TileState['terrain'] {
  if (isMountainCore(tile.lon, tile.lat)) {
    return 'mountain';
  }

  if (isHighlandCore(tile.lon, tile.lat)) {
    return 'highland';
  }

  if (isRiverValley(tile.lon, tile.lat)) {
    return 'river_valley';
  }

  if (isDesertCore(tile.lon, tile.lat)) {
    return 'desert';
  }

  if (isSteppeCore(tile.lon, tile.lat) || (tile.lat >= 43 && tile.lat <= 54 && tile.lon >= 25 && tile.lon <= 116 && !tile.coastal)) {
    return 'steppe';
  }

  if (tile.coastal && tile.lat <= 62 && tile.lat >= 12) {
    return 'coast';
  }

  if (tile.lat >= 55 || inBox(tile.lon, tile.lat, 100, 125, 22, 32) || inBox(tile.lon, tile.lat, 96, 108, 10, 22)) {
    return 'forest';
  }

  if ((tile.lat < 22 && tile.lon >= 70 && tile.lon <= 108) || inBox(tile.lon, tile.lat, 72, 84, 12, 22)) {
    return 'savanna';
  }

  return 'plains';
}

function classifyDetailedClimate(
  tile: DetailedTileDraft,
  terrain: TileState['terrain'],
): TileState['climate'] {
  const mediterranean =
    tile.lon <= 40 &&
    tile.lat >= 32 &&
    tile.lat <= 45 &&
    (terrain === 'coast' || terrain === 'plains' || terrain === 'highland');
  const maritimeWest = tile.lon < 15 && tile.lat >= 45 && tile.lat <= 61 && tile.coastal;
  const eastAsia = tile.lon >= 104;
  const monsoonBelt =
    (tile.lon >= 72 && tile.lon <= 122 && tile.lat >= 18 && tile.lat <= 35) ||
    (tile.lon >= 95 && tile.lon <= 109 && tile.lat >= 10 && tile.lat <= 24);

  if (terrain === 'mountain') {
    if (tile.lat > 46 || tile.lon >= 72) {
      return 'ET';
    }
    if (mediterranean) {
      return 'Csb';
    }
    if (tile.lon >= 40 && tile.lon < 72) {
      return 'BSk';
    }
    return tile.lat >= 40 ? 'Dfc' : 'Csb';
  }

  if (terrain === 'highland') {
    if (inEllipse(tile.lon, tile.lat, 88.5, 34.2, 14.5, 5.8)) {
      return 'ET';
    }
    if (tile.lat >= 56) {
      return 'Dfc';
    }
    if (tile.lon >= 40 && tile.lon < 80) {
      return 'BSk';
    }
    if (mediterranean) {
      return 'Csb';
    }
    if (eastAsia && tile.lat < 35) {
      return 'Cwa';
    }
    return tile.lat >= 46 ? 'Dfc' : 'Csb';
  }

  if (tile.lat >= 58) {
    return 'Dfc';
  }

  if (terrain === 'desert') {
    if ((tile.lat < 31 && tile.lon < 80) || inBox(tile.lon, tile.lat, 69, 76, 24, 31)) {
      return 'BWh';
    }
    return 'BWk';
  }

  if (terrain === 'steppe') {
    if (tile.lat < 35 || inBox(tile.lon, tile.lat, 67, 81, 24, 36)) {
      return 'BSh';
    }
    return 'BSk';
  }

  if (mediterranean) {
    return tile.lat >= 38 || tile.lon > 20 ? 'Csb' : 'Csa';
  }

  if (maritimeWest) {
    return 'Cfb';
  }

  if (eastAsia) {
    if (tile.lat < 18) {
      return terrain === 'forest' || terrain === 'coast' ? 'Af' : 'Aw';
    }
    if (tile.lat < 32) {
      return terrain === 'coast' ? 'Cfa' : 'Cwa';
    }
    if (tile.lat < 40) {
      return terrain === 'coast' ? 'Cfa' : 'Dwa';
    }
    if (tile.lat < 48) {
      return 'Dwa';
    }
    return 'Dfc';
  }

  if (monsoonBelt) {
    if (tile.lat < 18) {
      return terrain === 'forest' || terrain === 'coast' ? 'Af' : 'Aw';
    }
    if (tile.lat < 24) {
      return terrain === 'coast' ? 'Aw' : 'Cwa';
    }
    return 'Cwa';
  }

  if (tile.lon < 45) {
    if (tile.lat < 40) {
      return 'Csa';
    }
    if (tile.lat < 56) {
      return 'Cfb';
    }
    return 'Dfc';
  }

  if (tile.lon < 104) {
    if (tile.lat >= 54) {
      return 'Dfc';
    }
    if (tile.lat >= 40) {
      return 'BSk';
    }
    return 'BSh';
  }

  return tile.lat >= 50 ? 'Dfc' : 'Cwa';
}

const CLIMATE_WATER_BASE: Record<TileState['climate'], number> = {
  Af: 5.8,
  Aw: 4.2,
  BWh: 0.6,
  BSh: 2.2,
  BSk: 2,
  BWk: 1,
  Csa: 3,
  Csb: 3.4,
  Cfa: 4.7,
  Cfb: 4.2,
  Cwa: 4.6,
  Dwa: 2.8,
  Dfc: 2.6,
  ET: 1.3,
};

const CLIMATE_HABITABILITY_BASE: Record<TileState['climate'], number> = {
  Af: 4.1,
  Aw: 3.8,
  BWh: 0.9,
  BSh: 2.5,
  BSk: 2.7,
  BWk: 1.7,
  Csa: 3.5,
  Csb: 3.8,
  Cfa: 4.6,
  Cfb: 4.3,
  Cwa: 4.5,
  Dwa: 3.2,
  Dfc: 2.2,
  ET: 1.1,
};

const HUNT_TERRAIN_BASE: Record<TileState['terrain'], number> = {
  river_valley: 155,
  savanna: 175,
  coast: 150,
  forest: 170,
  desert: 28,
  plains: 135,
  steppe: 115,
  highland: 85,
  mountain: 35,
};

const AGRI_TERRAIN_BASE: Record<TileState['terrain'], number> = {
  river_valley: 115,
  savanna: 58,
  coast: 78,
  forest: 46,
  desert: 4,
  plains: 96,
  steppe: 28,
  highland: 36,
  mountain: 2,
};

const CLIMATE_AGRI_FACTOR: Record<TileState['climate'], number> = {
  Af: 0.82,
  Aw: 0.75,
  BWh: 0.08,
  BSh: 0.46,
  BSk: 0.36,
  BWk: 0.12,
  Csa: 0.7,
  Csb: 0.75,
  Cfa: 1,
  Cfb: 0.92,
  Cwa: 1.04,
  Dwa: 0.74,
  Dfc: 0.18,
  ET: 0.02,
};
function calculateDetailedBaseTemperature(
  tile: DetailedTileDraft,
  terrain: TileState['terrain'],
  climate: TileState['climate'],
) {
  const elevationPenalty =
    terrain === 'mountain' ? 11.5 : terrain === 'highland' ? 6 : terrain === 'river_valley' ? -1 : 0;
  const maritimeAdjustment = tile.coastal ? 1.5 : 0;
  const monsoonAdjustment =
    climate === 'Af' || climate === 'Aw' || climate === 'Cwa' || climate === 'Cfa' ? 1.2 : 0;
  const aridAdjustment = climate === 'BWh' ? 2.4 : climate === 'BWk' ? -0.8 : 0;
  const value =
    29 -
    Math.abs(tile.lat - 16) * 0.47 -
    Math.max(tile.lat - 42, 0) * 0.08 -
    elevationPenalty +
    maritimeAdjustment +
    monsoonAdjustment +
    aridAdjustment;

  return round(clamp(value, -4, 31), 1);
}

function calculateDetailedWater(
  climate: TileState['climate'],
  terrain: TileState['terrain'],
  coastal: boolean,
  lat: number,
) {
  let water = CLIMATE_WATER_BASE[climate];

  if (terrain === 'river_valley') {
    water += 1.5;
  }
  if (terrain === 'forest') {
    water += 0.4;
  }
  if (terrain === 'coast') {
    water += 0.6;
  }
  if (terrain === 'mountain') {
    water -= 0.5;
  }
  if (terrain === 'highland') {
    water -= 0.2;
  }
  if (terrain === 'desert') {
    water -= 0.4;
  }
  if (coastal && lat > 46 && lat < 62) {
    water += 0.2;
  }

  return round(clamp(water, 0, 6), 1);
}

function calculateDetailedHabitability(
  climate: TileState['climate'],
  terrain: TileState['terrain'],
  water: number,
) {
  const terrainModifier: Record<TileState['terrain'], number> = {
    river_valley: 0.8,
    savanna: 0.2,
    coast: 0.4,
    forest: 0.3,
    desert: -0.3,
    plains: 0.5,
    steppe: 0.1,
    highland: -0.5,
    mountain: -1.4,
  };

  const value =
    CLIMATE_HABITABILITY_BASE[climate] +
    terrainModifier[terrain] +
    (water - 3) * 0.15;

  return round(clamp(value, 0.4, 5.6), 2);
}

function calculateDetailedComfort(
  climate: TileState['climate'],
  terrain: TileState['terrain'],
  habitability: number,
  water: number,
) {
  const climatePenalty =
    climate === 'BWk' || climate === 'BWh'
      ? 0.35
      : climate === 'ET' || climate === 'Dfc'
        ? 0.25
        : 0;
  const terrainPenalty = terrain === 'mountain' ? 0.35 : terrain === 'highland' ? 0.18 : 0;
  const value = habitability + (water - 3) * 0.09 - climatePenalty - terrainPenalty;
  return round(clamp(value, 0.3, 5.4), 2);
}

function calculateDetailedHunt(
  terrain: TileState['terrain'],
  climate: TileState['climate'],
  water: number,
  habitability: number,
) {
  const climateModifier =
    climate === 'Af'
      ? 1.05
      : climate === 'Aw' || climate === 'Cfa' || climate === 'Cfb'
        ? 1
        : climate === 'Dfc'
          ? 0.72
          : climate === 'ET'
            ? 0.52
            : 0.92;
  const value =
    HUNT_TERRAIN_BASE[terrain] * climateModifier * (0.72 + water / 7 + habitability / 8);
  return Math.round(clamp(value, 10, 260));
}

function calculateDetailedAgri(
  terrain: TileState['terrain'],
  climate: TileState['climate'],
  water: number,
  habitability: number,
) {
  const value =
    AGRI_TERRAIN_BASE[terrain] *
    CLIMATE_AGRI_FACTOR[climate] *
    (0.64 + water / 8 + habitability / 8);
  return Math.round(clamp(value, 0, 165));
}

function createNearestTilePicker(tiles: Array<{ id: string; lon: number; lat: number }>) {
  return (lon: number, lat: number) => {
    let best = tiles[0]?.id ?? '';
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const tile of tiles) {
      const lonDelta = tile.lon - lon;
      const latDelta = tile.lat - lat;
      const distance = lonDelta * lonDelta + latDelta * latDelta;
      if (distance < bestDistance) {
        best = tile.id;
        bestDistance = distance;
      }
    }

    return best;
  };
}

function generateDetailedEurasiaPreset(): WorldPresetDefinition {
  const cols = 32;
  const rows = 20;
  const draftTiles: DetailedTileDraft[] = [];

  for (let row = 0; row < rows; row += 1) {
    const lat = 72 - (64 * row) / (rows - 1);
    for (let col = 0; col < cols; col += 1) {
      const lon = -10 + (175 * col) / (cols - 1);
      if (!isDetailedEurasiaLand(lon, lat)) {
        continue;
      }

      draftTiles.push({
        col,
        row,
        q: col - Math.floor(row / 2),
        r: row,
        lon,
        lat,
        landNeighbors: 0,
        coastal: false,
      });
    }
  }

  const draftTileByCoordinate = new Map(
    draftTiles.map((tile) => [`${tile.q},${tile.r}`, tile] as const),
  );

  for (const tile of draftTiles) {
    tile.landNeighbors = HEX_DIRECTIONS.reduce((count, [dq, dr]) => {
      return count + (draftTileByCoordinate.has(`${tile.q + dq},${tile.r + dr}`) ? 1 : 0);
    }, 0);
    tile.coastal = tile.landNeighbors < HEX_DIRECTIONS.length;
  }

  const regionCounts = new Map<string, number>();
  const annotatedTiles = draftTiles.map((tile) => {
    const region = classifyDetailedRegion(tile.lon, tile.lat);
    const sequence = (regionCounts.get(region) ?? 0) + 1;
    regionCounts.set(region, sequence);

    const terrain = classifyDetailedTerrain(tile);
    const climate = classifyDetailedClimate(tile, terrain);
    const baseTemperature = calculateDetailedBaseTemperature(tile, terrain, climate);
    const water = calculateDetailedWater(climate, terrain, tile.coastal, tile.lat);
    const habitability = calculateDetailedHabitability(climate, terrain, water);
    const baseComfort = calculateDetailedComfort(climate, terrain, habitability, water);
    const hunt = calculateDetailedHunt(terrain, climate, water, habitability);
    const agri = calculateDetailedAgri(terrain, climate, water, habitability);

    const seed: TileSeed = {
      id: `${slugify(region)}-${String(sequence).padStart(2, '0')}`,
      name: `${region} ${String(sequence).padStart(2, '0')}`,
      region,
      q: tile.q,
      r: tile.r,
      climate,
      terrain,
      water,
      habitability,
      baseTemperature,
      baseComfort,
      hunt,
      agri,
      isVolcanic: isVolcanicZone(tile.lon, tile.lat),
      isTectonic: isTectonicZone(tile.lon, tile.lat),
      coastal: tile.coastal,
    };

    return {
      ...tile,
      seed,
    };
  });

  const tileSeeds = annotatedTiles.map((tile) => tile.seed);
  const tileNameById = new Map(tileSeeds.map((tile) => [tile.id, tile.name]));
  const pickTileId = createNearestTilePicker(
    annotatedTiles.map((tile) => ({ id: tile.seed.id, lon: tile.lon, lat: tile.lat })),
  );

  const routeLanes: RouteLane[] = [
    {
      id: 'fertile-crescent-to-ganges',
      label: 'Fertile Crescent to Ganges',
      tileIds: [
        pickTileId(35, 33),
        pickTileId(43, 34),
        pickTileId(58, 33),
        pickTileId(69, 31),
        pickTileId(79, 27.5),
        pickTileId(88, 25.5),
      ],
    },
    {
      id: 'steppe-corridor',
      label: 'Steppe Corridor',
      tileIds: [
        pickTileId(26, 48),
        pickTileId(41, 49),
        pickTileId(59, 50),
        pickTileId(75, 49),
        pickTileId(93, 47),
        pickTileId(110, 45),
        pickTileId(125, 46),
      ],
    },
    {
      id: 'inner-asia-arc',
      label: 'Inner Asia Arc',
      tileIds: [
        pickTileId(34, 39),
        pickTileId(49, 39),
        pickTileId(65, 40),
        pickTileId(79, 40),
        pickTileId(95, 38),
        pickTileId(110, 35),
      ],
    },
    {
      id: 'east-asia-monsoon-rim',
      label: 'East Asia Monsoon Rim',
      tileIds: [
        pickTileId(103, 19),
        pickTileId(112, 24),
        pickTileId(113, 31),
        pickTileId(120, 31),
        pickTileId(127, 37),
        pickTileId(139, 36),
      ],
    },
  ];

  const regionLabels: RegionLabel[] = [
    { id: 'atlantic-europe', tileId: pickTileId(2, 49), label: 'Atlantic Europe', detail: 'Maritime temperate fringe' },
    { id: 'pontic-steppe', tileId: pickTileId(39, 49), label: 'Pontic Steppe', detail: 'Dry grassland migration lane' },
    { id: 'fertile-crescent', tileId: pickTileId(40, 34), label: 'Fertile Crescent', detail: 'Dense river-fed bottleneck' },
    { id: 'indian-monsoon', tileId: pickTileId(82, 25.5), label: 'Indian Monsoon', detail: 'High agri, seasonal water pulse' },
    { id: 'tibetan-rim', tileId: pickTileId(89, 33), label: 'Tibetan Rim', detail: 'High-altitude movement barrier' },
    { id: 'north-china', tileId: pickTileId(114, 35), label: 'North China Plain', detail: 'Broad lowland productivity core' },
    { id: 'siberian-taiga', tileId: pickTileId(92, 60), label: 'Siberian Taiga', detail: 'Cold forest with low carrying margin' },
  ];

  const tribeSeeds: TribeSeed[] = [
    {
      id: 'levant-foragers',
      name: 'Levant Foragers',
      tileId: pickTileId(35, 33),
      ancestryId: 'west-asia-cluster',
      pop: 154,
      color: '#d79b5e',
      leader: { name: 'Mira', archetype: 'Pathfinder', age: 31, authority: 0.63, legitimacy: 0.64 },
      abilityBias: { foraging: 9, organization: 4, heatTolerance: 3 },
      relationships: { 'mesopotamian-stewards': 0.3, 'anatolian-pastoralists': 0.16 },
      alliances: ['mesopotamian-stewards'],
      development: { agricultureStage: 'tending', domestication: 20, sedentism: 0.2 },
      exchange: { tradeVolume: 0.1, diffusion: 0.06 },
    },
    {
      id: 'mesopotamian-stewards',
      name: 'Mesopotamian Stewards',
      tileId: pickTileId(43, 33),
      ancestryId: 'west-asia-cluster',
      pop: 166,
      color: '#76b7b2',
      leader: { name: 'Samar', archetype: 'Steward', age: 43, authority: 0.72, legitimacy: 0.74 },
      abilityBias: { waterEngineering: 12, agriculture: 6, organization: 5 },
      relationships: { 'levant-foragers': 0.3, 'indus-river-clans': 0.18 },
      alliances: ['levant-foragers'],
      development: { agricultureStage: 'cultivation', domestication: 38, sedentism: 0.36 },
      exchange: { tradeVolume: 0.12, diffusion: 0.08 },
    },
    {
      id: 'anatolian-pastoralists',
      name: 'Anatolian Pastoralists',
      tileId: pickTileId(34, 39),
      ancestryId: 'highland-branch',
      pop: 142,
      color: '#9ac07c',
      leader: { name: 'Torun', archetype: 'Broker', age: 37, authority: 0.61, legitimacy: 0.65 },
      abilityBias: { coldTolerance: 6, organization: 4, foraging: 5 },
      relationships: { 'levant-foragers': 0.16, 'pontic-riders': 0.18 },
      development: { agricultureStage: 'cultivation', domestication: 34, sedentism: 0.33 },
      exchange: { tradeVolume: 0.08, diffusion: 0.05 },
    },
    {
      id: 'pontic-riders',
      name: 'Pontic Riders',
      tileId: pickTileId(39, 49),
      ancestryId: 'steppe-branch',
      pop: 136,
      color: '#c68ec4',
      leader: { name: 'Kadar', archetype: 'Broker', age: 35, authority: 0.6, legitimacy: 0.61 },
      abilityBias: { attack: 7, coldTolerance: 5, organization: 3 },
      relationships: { 'anatolian-pastoralists': 0.18, 'yellow-river-league': 0.08 },
      development: { agricultureStage: 'agropastoral', domestication: 56, sedentism: 0.48 },
      exchange: { tradeVolume: 0.07, diffusion: 0.04 },
    },
    {
      id: 'indus-river-clans',
      name: 'Indus River Clans',
      tileId: pickTileId(70.5, 29),
      ancestryId: 'south-asia-cluster',
      pop: 158,
      color: '#e0c06f',
      leader: { name: 'Veyan', archetype: 'Steward', age: 40, authority: 0.7, legitimacy: 0.71 },
      abilityBias: { agriculture: 7, waterEngineering: 9, heatTolerance: 4 },
      relationships: { 'mesopotamian-stewards': 0.18, 'ganga-network': 0.28 },
      alliances: ['ganga-network'],
      development: { agricultureStage: 'cultivation', domestication: 42, sedentism: 0.4 },
      exchange: { tradeVolume: 0.12, diffusion: 0.08 },
    },
    {
      id: 'ganga-network',
      name: 'Ganga Network',
      tileId: pickTileId(82.5, 26.5),
      ancestryId: 'south-asia-cluster',
      pop: 171,
      color: '#78a4d3',
      leader: { name: 'Rini', archetype: 'Steward', age: 34, authority: 0.74, legitimacy: 0.73 },
      abilityBias: { agriculture: 10, organization: 6, waterEngineering: 5 },
      relationships: { 'indus-river-clans': 0.28, 'yangtze-marshals': 0.14 },
      alliances: ['indus-river-clans'],
      development: { agricultureStage: 'agropastoral', domestication: 62, sedentism: 0.54 },
      exchange: { tradeVolume: 0.14, diffusion: 0.08 },
    },
    {
      id: 'yellow-river-league',
      name: 'Yellow River League',
      tileId: pickTileId(114, 35),
      ancestryId: 'east-asia-cluster',
      pop: 164,
      color: '#d98a73',
      leader: { name: 'Hanru', archetype: 'Sage', age: 45, authority: 0.71, legitimacy: 0.69 },
      abilityBias: { agriculture: 8, organization: 7, coldTolerance: 3 },
      relationships: { 'yangtze-marshals': 0.3, 'pontic-riders': 0.08 },
      alliances: ['yangtze-marshals'],
      development: { agricultureStage: 'cultivation', domestication: 44, sedentism: 0.39 },
      exchange: { tradeVolume: 0.11, diffusion: 0.08 },
    },
    {
      id: 'yangtze-marshals',
      name: 'Yangtze Marshals',
      tileId: pickTileId(113, 30.5),
      ancestryId: 'east-asia-cluster',
      pop: 160,
      color: '#7dc0a4',
      leader: { name: 'Lian', archetype: 'Broker', age: 32, authority: 0.66, legitimacy: 0.68 },
      abilityBias: { waterEngineering: 11, agriculture: 6, organization: 5 },
      relationships: { 'yellow-river-league': 0.3, 'ganga-network': 0.14 },
      alliances: ['yellow-river-league'],
      development: { agricultureStage: 'cultivation', domestication: 46, sedentism: 0.42 },
      exchange: { tradeVolume: 0.11, diffusion: 0.08 },
    },
  ];

  const startTileId = pickTileId(35, 33);
  const startTribeId = 'levant-foragers';

  return {
    tileSeeds,
    tribeSeeds,
    bootstrapEvent: {
      title: 'Detailed Eurasia preset loaded',
      detail: 'A denser Eurasian lattice is active, with terrain, climate, and corridor tuning pushed toward recognizable geography.',
    },
    presentation: {
      name: 'Detailed Eurasia',
      description: 'A ~400-tile Eurasian field with broader geographic fidelity across coastlines, mountain belts, deserts, monsoon plains, and steppe corridors.',
      routeLanes,
      regionLabels,
      startTileId,
      startTileName: tileNameById.get(startTileId) ?? 'Levant',
      startTribeId,
      startTribeName: 'Levant Foragers',
    },
  };
}

const WORLD_PRESETS = {
  'old-world-corridor': OLD_WORLD_CORRIDOR_PRESET,
  'detailed-eurasia': generateDetailedEurasiaPreset(),
} satisfies Record<SimulationConfig['worldPreset'], WorldPresetDefinition>;

export const WORLD_PRESET_OPTIONS = (
  Object.entries(WORLD_PRESETS) as Array<
    [SimulationConfig['worldPreset'], WorldPresetDefinition]
  >
).map(([id, preset]) => ({
  id,
  label: preset.presentation.name,
}));

function getWorldPresetDefinition(worldPreset: SimulationConfig['worldPreset']) {
  return WORLD_PRESETS[worldPreset] ?? OLD_WORLD_CORRIDOR_PRESET;
}

export function createInitialWorldState(config: SimulationConfig): WorldState {
  const preset = getWorldPresetDefinition(config.worldPreset);
  const tiles = preset.tileSeeds.map((seed) => createTile(seed, preset.tileSeeds));
  const tribes = preset.tribeSeeds.map(createTribe);
  const metrics = computeMetrics({ tiles, tribes });

  return {
    year: 0,
    seed: config.seed,
    worldPreset: config.worldPreset,
    globalClimate: {
      baseline: config.globals.G_temp,
      anomaly: 0,
      meanTemperature: config.globals.G_temp,
      regime: describeInitialClimateRegime(config.globals.G_temp),
    },
    storyteller: {
      prosperity: 0.5,
      prosperityStreak: 0,
      crisisStreak: 0,
      quietStreak: 0,
      disasterMultiplier: 1.0,
      recoveryMultiplier: 1.0,
      posture: 'balanced',
    },
    tiles,
    tribes,
    eventLog: [
      {
        id: 'event-bootstrap',
        year: 0,
        kind: 'system',
        title: preset.bootstrapEvent.title,
        detail: preset.bootstrapEvent.detail,
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

export function getWorldPresentation(
  worldPreset: SimulationConfig['worldPreset'],
): WorldPresentation {
  return getWorldPresetDefinition(worldPreset).presentation;
}
