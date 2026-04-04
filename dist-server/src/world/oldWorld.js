import { STARTING_TECHS_FORAGER, STARTING_TECHS_TENDING, STARTING_TECHS_CULTIVATION, STARTING_TECHS_AGROPASTORAL, } from '../sim/techTree.js';
const HEX_DIRECTIONS = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
];
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(max, Math.max(min, value));
}
function round(value, digits = 2) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Number(value.toFixed(digits));
}
function slugify(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
const OLD_WORLD_CORRIDOR_TILE_SEEDS = [
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
const OLD_WORLD_CORRIDOR_TRIBE_SEEDS = [
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
const OLD_WORLD_CORRIDOR_ROUTE_LANES = [
    { id: 'nile-levant-route', label: 'Nile-Levant Corridor', tileIds: ['rift-cradle', 'upper-nile', 'nile-corridor', 'levant-corridor', 'mesopotamia'] },
    { id: 'southern-asia-route', label: 'South Asia Expansion Arc', tileIds: ['mesopotamia', 'persian-highland', 'indus-basin', 'gangetic-belt', 'china-heartland', 'yangtze-coast'] },
    { id: 'mediterranean-route', label: 'Mediterranean Turn', tileIds: ['nile-corridor', 'med-coast', 'aegean-arc', 'europe-plain'] },
    { id: 'coastal-bridge', label: 'Red Sea Coastal Bridge', tileIds: ['horn-gate', 'red-sea-passage', 'levant-corridor'] },
];
const OLD_WORLD_CORRIDOR_REGION_LABELS = [
    { id: 'east-africa', tileId: 'rift-cradle', label: 'East Africa', detail: 'Origin cluster' },
    { id: 'sahara', tileId: 'sahara-east', label: 'Sahara Barrier', detail: 'Low comfort, sparse water' },
    { id: 'levant', tileId: 'levant-corridor', label: 'Levant', detail: 'Gateway to Eurasia' },
    { id: 'south-asia', tileId: 'gangetic-belt', label: 'South Asia', detail: 'Monsoon corridor' },
    { id: 'east-asia', tileId: 'china-heartland', label: 'East Asia', detail: 'High carrying capacity' },
];
const OLD_WORLD_CORRIDOR_PRESET = {
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
function createAbilities(bias = {}) {
    const baseline = {
        foraging: 46,
        agriculture: 4,
        heatTolerance: 34,
        coldTolerance: 12,
        waterEngineering: 18,
        attack: 20,
        organization: 22,
    };
    return Object.fromEntries(Object.entries(baseline).map(([ability, value]) => {
        const adjusted = Math.max(0, Math.min(100, value + (bias[ability] ?? 0)));
        return [ability, { cap: adjusted, current: adjusted }];
    }));
}
function buildNeighbors(tileSeeds, id, q, r) {
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
function defaultMegafaunaIndex(terrain, climate) {
    const terrainBase = {
        savanna: 0.9,
        plains: 0.8,
        steppe: 0.75,
        forest: 0.7,
        river_valley: 0.65,
        coast: 0.5,
        highland: 0.4,
        desert: 0.15,
        mountain: 0.1,
        sea: 0,
    };
    const climateFactor = climate === 'ET' || climate === 'Dfc' ? 0.6
        : climate === 'BWh' || climate === 'BWk' ? 0.3
            : climate === 'Af' ? 0.85
                : 1.0;
    return round(clamp(terrainBase[terrain] * climateFactor, 0, 1));
}
function defaultElevation(terrain) {
    const base = {
        mountain: 3500,
        highland: 1800,
        steppe: 600,
        desert: 400,
        plains: 200,
        forest: 300,
        savanna: 350,
        river_valley: 50,
        coast: 5,
        sea: 0,
    };
    return base[terrain];
}
function defaultMovementTags(terrain, coastal) {
    const tags = [];
    if (terrain === 'river_valley') {
        tags.push('river-corridor');
    }
    if (terrain === 'coast' || coastal) {
        tags.push('coastal-corridor');
    }
    if (terrain === 'steppe') {
        tags.push('steppe-corridor');
    }
    return tags;
}
function createTile(seed, tileSeeds) {
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
        movementTags: [...new Set(seed.movementTags ?? defaultMovementTags(terrain, coastal))],
    };
}
function createLeader(seed) {
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
function defaultStartingTechs(stage) {
    switch (stage) {
        case 'agropastoral':
        case 'settled-farming':
            return [...STARTING_TECHS_AGROPASTORAL];
        case 'cultivation':
            return [...STARTING_TECHS_CULTIVATION];
        case 'tending':
            return [...STARTING_TECHS_TENDING];
        default:
            return [...STARTING_TECHS_FORAGER];
    }
}
function createTribe(seed) {
    const stage = seed.development?.agricultureStage ?? 'foraging';
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
            agricultureStage: stage,
            domestication: seed.development?.domestication ?? 8,
            sedentism: seed.development?.sedentism ?? 0.1,
        },
        exchange: {
            tradeVolume: seed.exchange?.tradeVolume ?? 0.04,
            diffusion: seed.exchange?.diffusion ?? 0.02,
            raidExposure: seed.exchange?.raidExposure ?? 0,
            warExhaustion: seed.exchange?.warExhaustion ?? 0,
        },
        knownTechnologies: seed.startingTechs ?? defaultStartingTechs(stage),
        geneticDiversity: 1.0,
        foodStores: 0.18,
        relationships: seed.relationships ?? {},
        alliances: seed.alliances ?? [],
        migration: {
            homeTileId: seed.tileId,
            cooldownYears: 0,
            destinationTileId: null,
            plannedRouteTileIds: [],
            commitmentYears: 0,
        },
        statusFlags: { migrating: false, recovering: false, highlighted: false },
    };
}
function describeInitialClimateRegime(meanTemperature) {
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
function computeMetrics(world) {
    const totalPopulation = world.tribes.reduce((sum, tribe) => sum + tribe.pop, 0);
    const tribeCount = world.tribes.length;
    const averageComfort = world.tiles.reduce((sum, tile) => sum + tile.comfort, 0) /
        Math.max(world.tiles.length, 1);
    const averagePressure = world.tribes.reduce((sum, tribe) => sum + tribe.pressures.total, 0) /
        Math.max(world.tribes.length, 1);
    const averageFoodStores = world.tribes.reduce((sum, tribe) => sum + tribe.foodStores, 0) /
        Math.max(world.tribes.length, 1);
    const averageGeneticDiversity = world.tribes.reduce((sum, tribe) => sum + tribe.geneticDiversity, 0) /
        Math.max(world.tribes.length, 1);
    const averageMegafauna = world.tiles.reduce((sum, tile) => sum + tile.megafaunaIndex, 0) /
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
function inBox(lon, lat, minLon, maxLon, minLat, maxLat) {
    return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}
function inEllipse(lon, lat, centerLon, centerLat, radiusLon, radiusLat) {
    const normalizedLon = (lon - centerLon) / radiusLon;
    const normalizedLat = (lat - centerLat) / radiusLat;
    return normalizedLon * normalizedLon + normalizedLat * normalizedLat <= 1;
}
function isDetailedEurasiaLand(lon, lat) {
    let land = false;
    // Africa
    land ||= inEllipse(lon, lat, 7, 24, 28, 14);
    land ||= inEllipse(lon, lat, 20, 6, 20, 20);
    land ||= inEllipse(lon, lat, 24, -22, 12, 12);
    land ||= inEllipse(lon, lat, 47, -19, 4.5, 7.5);
    // Europe and Asia
    land ||= inEllipse(lon, lat, -3, 54, 6.5, 6.5);
    land ||= inEllipse(lon, lat, 10, 50, 24, 12);
    land ||= inEllipse(lon, lat, 19, 64, 9, 10);
    land ||= inEllipse(lon, lat, 43, 50, 30, 14);
    land ||= inEllipse(lon, lat, 87, 55, 56, 16);
    land ||= inEllipse(lon, lat, 48, 24, 12, 10);
    land ||= inEllipse(lon, lat, 79, 22, 16, 12);
    land ||= inEllipse(lon, lat, 112, 36, 30, 15);
    land ||= inEllipse(lon, lat, 104, 13, 13, 12);
    land ||= inEllipse(lon, lat, 138, 37, 5.5, 7.5);
    if (!land) {
        return false;
    }
    const mediterranean = inEllipse(lon, lat, 17, 36.6, 22, 6.2);
    const blackSea = inEllipse(lon, lat, 35, 44, 7.5, 4.2);
    const caspianSea = inEllipse(lon, lat, 51.5, 42.5, 5.2, 8.6);
    const aralSea = inEllipse(lon, lat, 60.5, 45.5, 4, 2.6);
    const persianGulf = inEllipse(lon, lat, 52, 27, 4.5, 2.5);
    const redSea = inEllipse(lon, lat, 39, 20, 2.6, 8.8);
    const bayOfBengal = inEllipse(lon, lat, 89, 16, 7.5, 5.6);
    const southChinaSea = inEllipse(lon, lat, 114.5, 14, 11, 7.5);
    const maghreb = inBox(lon, lat, -10, 12, 30, 38);
    const italyAndBalkans = inBox(lon, lat, 8, 27, 37, 46);
    const anatolia = inBox(lon, lat, 26, 43, 36, 42.5);
    const levant = inBox(lon, lat, 33, 39.5, 29.5, 36.5);
    const sinaiBridge = inBox(lon, lat, 29, 35, 27.5, 32.5);
    const arabia = inBox(lon, lat, 41, 57, 14, 30);
    const india = inBox(lon, lat, 68, 91, 8, 29.5);
    const southeastAsia = inBox(lon, lat, 95, 109, 2, 24);
    const southChina = inBox(lon, lat, 104, 122, 19, 31.5);
    const hornBridge = inBox(lon, lat, 40, 46, 9, 16);
    if (mediterranean && !maghreb && !italyAndBalkans && !anatolia && !levant && !sinaiBridge) {
        return false;
    }
    if (blackSea && !anatolia) {
        return false;
    }
    if (caspianSea || aralSea) {
        return false;
    }
    if (persianGulf && !arabia) {
        return false;
    }
    if (redSea && !sinaiBridge && !arabia && !hornBridge) {
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
function isMountainCore(lon, lat) {
    return (inEllipse(lon, lat, -4, 31, 6, 3) ||
        inEllipse(lon, lat, 10.5, 46.2, 6.2, 2.6) ||
        inEllipse(lon, lat, 23.5, 47, 4.5, 2.6) ||
        inEllipse(lon, lat, 39.5, 9.5, 5.5, 6.5) ||
        inEllipse(lon, lat, 43.5, 42.5, 5.5, 2.1) ||
        inEllipse(lon, lat, 50, 32.2, 7, 4.3) ||
        inEllipse(lon, lat, 71, 36, 6, 3.7) ||
        inEllipse(lon, lat, 84, 31.3, 15.5, 3.5) ||
        inEllipse(lon, lat, 79.5, 41.3, 9.5, 3.4) ||
        inEllipse(lon, lat, 91, 49, 7.5, 3.4) ||
        inEllipse(lon, lat, 100, 26.5, 5.5, 4.5) ||
        inEllipse(lon, lat, 138, 37, 6.5, 7) ||
        inEllipse(lon, lat, 29, -29, 5.2, 4.2));
}
function isHighlandCore(lon, lat) {
    return (inEllipse(lon, lat, 17, 64.5, 7.5, 8) ||
        inEllipse(lon, lat, 35, 39, 8.5, 4.2) ||
        inEllipse(lon, lat, 33.5, -1, 8.5, 11.5) ||
        inEllipse(lon, lat, 22, -24, 10, 8) ||
        inEllipse(lon, lat, 57, 31.5, 10.5, 5.5) ||
        inEllipse(lon, lat, 61, 59, 4.5, 7.5) ||
        inEllipse(lon, lat, 88.5, 34.2, 14.5, 5.8) ||
        inEllipse(lon, lat, 98, 40, 11, 4.5) ||
        inEllipse(lon, lat, 44, 18, 6, 4.5));
}
function isRiverValley(lon, lat) {
    return (inEllipse(lon, lat, 31, 25, 3.4, 9.8) ||
        inEllipse(lon, lat, 30.5, 31.2, 4, 2.6) ||
        inEllipse(lon, lat, 5, 13, 7.5, 3.4) ||
        inEllipse(lon, lat, 23, 45.5, 7.5, 2.7) ||
        inEllipse(lon, lat, 43, 33.5, 5, 3.7) ||
        inEllipse(lon, lat, 70.5, 29.2, 3.8, 4.8) ||
        inEllipse(lon, lat, 82.5, 26.5, 9.5, 4.1) ||
        inEllipse(lon, lat, 113.5, 35.5, 6.8, 3.1) ||
        inEllipse(lon, lat, 112.5, 30.3, 10.5, 3.4) ||
        inEllipse(lon, lat, 103.5, 18.6, 4.5, 5.8));
}
function isDesertCore(lon, lat) {
    return (inEllipse(lon, lat, 13, 23, 24, 9) ||
        inEllipse(lon, lat, 18, -22, 10, 6) ||
        inEllipse(lon, lat, 46.5, 23.5, 10.5, 7.7) ||
        inEllipse(lon, lat, 39, 33, 5.6, 3.6) ||
        inEllipse(lon, lat, 56.5, 33, 7.4, 4.2) ||
        inEllipse(lon, lat, 61.5, 41.5, 6.5, 3.7) ||
        inEllipse(lon, lat, 73, 27.5, 4.6, 3.1) ||
        inEllipse(lon, lat, 84.5, 40.2, 8.7, 3.9) ||
        inEllipse(lon, lat, 102, 42.8, 10.8, 4.3));
}
function isSteppeCore(lon, lat) {
    return (inEllipse(lon, lat, 36, 49, 14, 4.5) ||
        inEllipse(lon, lat, 67, 48.5, 20, 6.5) ||
        inEllipse(lon, lat, 103, 46.5, 12.5, 5.4) ||
        inEllipse(lon, lat, 3, 16, 20, 4));
}
function isVolcanicZone(lon, lat) {
    return (inEllipse(lon, lat, 138, 37, 6.5, 7) ||
        inEllipse(lon, lat, 105, 15, 4.5, 4.5) ||
        inEllipse(lon, lat, 40, 12, 3.6, 5.2));
}
function isTectonicZone(lon, lat) {
    return (isVolcanicZone(lon, lat) ||
        inEllipse(lon, lat, 43.5, 42.5, 6, 2.8) ||
        inEllipse(lon, lat, 50, 32.2, 9, 5.2) ||
        inEllipse(lon, lat, 84, 31.3, 18, 4.5) ||
        inEllipse(lon, lat, 33.5, -1, 8, 11));
}
function classifyDetailedRegion(lon, lat) {
    if (inEllipse(lon, lat, 22, -24, 10, 8)) {
        return 'Southern Africa';
    }
    if (inEllipse(lon, lat, 47, -19, 4.5, 7.5)) {
        return 'Madagascar';
    }
    if (inEllipse(lon, lat, 5, 13, 18, 9)) {
        return 'West Africa';
    }
    if (inEllipse(lon, lat, 22, 0, 12, 10)) {
        return 'Congo Basin';
    }
    if (inEllipse(lon, lat, 34, 5, 12, 15)) {
        return 'East Africa';
    }
    if (inEllipse(lon, lat, 13, 23, 24, 9)) {
        return 'Sahara';
    }
    if (inEllipse(lon, lat, 31, 25, 3.4, 9.8) || inEllipse(lon, lat, 30.5, 31.2, 4, 2.6)) {
        return 'Nile Basin';
    }
    if (lon < 3 && lat < 45) {
        return 'Iberia';
    }
    if (lon < 4 && lat >= 45) {
        return 'Atlantic Europe';
    }
    if (inEllipse(lon, lat, 19, 64.5, 9, 10)) {
        return 'Scandinavia';
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
    if (inBox(lon, lat, 32, 39.5, 29.5, 36.8)) {
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
    if (inBox(lon, lat, 72, 84, 8, 21)) {
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
    if (inBox(lon, lat, 104, 122, 19, 31.5)) {
        return 'South China';
    }
    if (inBox(lon, lat, 120, 132, 41, 50)) {
        return 'Manchuria';
    }
    if (inEllipse(lon, lat, 138, 37, 6.5, 7)) {
        return 'Japan';
    }
    if (inBox(lon, lat, 95, 109, 2, 24)) {
        return 'Mainland Southeast Asia';
    }
    if (lon < 35) {
        return lat < 18 ? 'West Africa' : 'North Africa';
    }
    if (lon < 70) {
        return lat >= 46 ? 'Central Asia' : 'West Asia';
    }
    if (lon < 104) {
        return lat >= 46 ? 'Inner Asia' : 'South Asia';
    }
    return lat >= 48 ? 'Northeast Asia' : 'East Asia';
}
function classifyDetailedTerrain(tile) {
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
    if (isSteppeCore(tile.lon, tile.lat) || (tile.lat >= 42 && tile.lat <= 54 && tile.lon >= 24 && tile.lon <= 116 && !tile.coastal)) {
        return 'steppe';
    }
    if (tile.coastal && tile.lat <= 62 && tile.lat >= -34) {
        return 'coast';
    }
    if (inBox(tile.lon, tile.lat, -2, 31, -5, 7) ||
        tile.lat >= 55 ||
        inBox(tile.lon, tile.lat, 100, 125, 22, 32) ||
        inBox(tile.lon, tile.lat, 96, 108, 2, 22)) {
        return 'forest';
    }
    if (inBox(tile.lon, tile.lat, -18, 40, -18, 16) ||
        (tile.lat < 22 && tile.lon >= 70 && tile.lon <= 108) ||
        inBox(tile.lon, tile.lat, 72, 84, 12, 22)) {
        return 'savanna';
    }
    return 'plains';
}
function classifyDetailedClimate(tile, terrain) {
    const mediterranean = tile.lon <= 40 &&
        tile.lat >= 31 &&
        tile.lat <= 45 &&
        (terrain === 'coast' || terrain === 'plains' || terrain === 'highland');
    const maritimeWest = tile.lon < 15 && tile.lat >= 45 && tile.lat <= 61 && tile.coastal;
    const eastAsia = tile.lon >= 104;
    const monsoonBelt = (tile.lon >= 72 && tile.lon <= 122 && tile.lat >= 18 && tile.lat <= 35) ||
        (tile.lon >= 95 && tile.lon <= 109 && tile.lat >= 2 && tile.lat <= 24);
    const equatorialAfrica = tile.lon >= -15 && tile.lon <= 34 && tile.lat >= -5 && tile.lat <= 8;
    const tropicalAfrica = tile.lon >= -18 && tile.lon <= 40 && tile.lat > 8 && tile.lat <= 18;
    const southernAfrica = tile.lon >= 12 && tile.lon <= 40 && tile.lat <= -18;
    if (terrain === 'mountain') {
        if (tile.lat > 46 || tile.lon >= 72) {
            return 'ET';
        }
        if (tile.lat < 16 && tile.lon >= 28 && tile.lon <= 42) {
            return 'Cwa';
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
        if (tile.lat < 14 && tile.lon >= 28 && tile.lon <= 42) {
            return 'Cwa';
        }
        if (southernAfrica) {
            return 'Cfb';
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
    if (southernAfrica) {
        if (terrain === 'desert') {
            return 'BWh';
        }
        return tile.coastal ? 'Cfb' : 'Aw';
    }
    if (terrain === 'desert') {
        if ((tile.lat < 33 && tile.lon < 80) || inBox(tile.lon, tile.lat, 69, 76, 24, 31)) {
            return 'BWh';
        }
        return 'BWk';
    }
    if (terrain === 'steppe') {
        if (tile.lat < 35 || inBox(tile.lon, tile.lat, 67, 81, 24, 36) || tropicalAfrica) {
            return 'BSh';
        }
        return 'BSk';
    }
    if (equatorialAfrica) {
        return terrain === 'forest' || terrain === 'coast' ? 'Af' : 'Aw';
    }
    if (tropicalAfrica) {
        return terrain === 'coast' || terrain === 'forest' ? 'Aw' : 'BSh';
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
    if (tile.lon < 40) {
        if (tile.lat < 12) {
            return terrain === 'forest' ? 'Af' : 'Aw';
        }
        if (tile.lat < 30) {
            return 'BSh';
        }
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
const CLIMATE_WATER_BASE = {
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
const CLIMATE_HABITABILITY_BASE = {
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
const HUNT_TERRAIN_BASE = {
    river_valley: 155,
    savanna: 175,
    coast: 150,
    forest: 170,
    desert: 28,
    plains: 135,
    steppe: 115,
    highland: 98,
    mountain: 35,
    sea: 0,
};
const AGRI_TERRAIN_BASE = {
    river_valley: 115,
    savanna: 58,
    coast: 78,
    forest: 46,
    desert: 4,
    plains: 96,
    steppe: 28,
    highland: 44,
    mountain: 2,
    sea: 0,
};
const CLIMATE_AGRI_FACTOR = {
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
function calculateDetailedBaseTemperature(tile, terrain, climate) {
    const elevationPenalty = terrain === 'mountain' ? 11.5 : terrain === 'highland' ? 6 : terrain === 'river_valley' ? -1 : 0;
    const maritimeAdjustment = tile.coastal ? 1.5 : 0;
    const monsoonAdjustment = climate === 'Af' || climate === 'Aw' || climate === 'Cwa' || climate === 'Cfa' ? 1.2 : 0;
    const aridAdjustment = climate === 'BWh' ? 2.4 : climate === 'BWk' ? -0.8 : 0;
    const value = 29 -
        Math.abs(tile.lat - 16) * 0.47 -
        Math.max(tile.lat - 42, 0) * 0.08 -
        elevationPenalty +
        maritimeAdjustment +
        monsoonAdjustment +
        aridAdjustment;
    return round(clamp(value, -4, 31), 1);
}
function calculateDetailedWater(climate, terrain, coastal, lat) {
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
function calculateDetailedHabitability(climate, terrain, water) {
    const terrainModifier = {
        river_valley: 0.8,
        savanna: 0.2,
        coast: 0.4,
        forest: 0.3,
        desert: -0.3,
        plains: 0.5,
        steppe: 0.1,
        highland: -0.35,
        mountain: -1.4,
        sea: -4,
    };
    const value = CLIMATE_HABITABILITY_BASE[climate] +
        terrainModifier[terrain] +
        (water - 3) * 0.15;
    return round(clamp(value, 0.4, 5.6), 2);
}
function calculateDetailedComfort(climate, terrain, habitability, water) {
    const climatePenalty = climate === 'BWk' || climate === 'BWh'
        ? 0.35
        : climate === 'ET' || climate === 'Dfc'
            ? 0.25
            : 0;
    const terrainPenalty = terrain === 'mountain' ? 0.35 : terrain === 'highland' ? 0.1 : 0;
    const value = habitability + (water - 3) * 0.09 - climatePenalty - terrainPenalty;
    return round(clamp(value, 0.3, 5.4), 2);
}
function calculateDetailedHunt(terrain, climate, water, habitability) {
    const climateModifier = climate === 'Af'
        ? 1.05
        : climate === 'Aw' || climate === 'Cfa' || climate === 'Cfb'
            ? 1
            : climate === 'Dfc'
                ? 0.72
                : climate === 'ET'
                    ? 0.52
                    : 0.92;
    const value = HUNT_TERRAIN_BASE[terrain] * climateModifier * (0.72 + water / 7 + habitability / 8);
    return Math.round(clamp(value, 10, 260));
}
function calculateDetailedAgri(terrain, climate, water, habitability) {
    const value = AGRI_TERRAIN_BASE[terrain] *
        CLIMATE_AGRI_FACTOR[climate] *
        (0.64 + water / 8 + habitability / 8);
    return Math.round(clamp(value, 0, 165));
}
function createNearestTilePicker(tiles) {
    return (lon, lat) => {
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
// 28 rows × 44 cols.  Row 0 ≈ 72 °N, Row 27 ≈ –35 °S.
// Col 0 ≈ 20 °W, Col 43 ≈ 150 °E.  Each cell ≈ 3.95 ° lon × 3.96 ° lat.
//
// Glyphs: r river_valley  s savanna  c coast  f forest  d desert
//         p plains  t steppe  h highland  m mountain  ~ sea  . off-map
//
// Col lon:  0≈-20  5≈0  10≈20  15≈39  20≈59  25≈79  30≈99  35≈119  40≈138  43≈150
// Row lat:  0≈72  5≈52  10≈32  15≈13  20≈-7  27≈-35
const AUTHORED_OLD_WORLD_TERRAIN_ROWS = [
    '~~~~~~~~~~ff~~~~~~~~~~~~~~~~~~~~~~~~~~~ff~~~', // r0  72N Arctic fringe
    '~~~~~..cffhf~~~~fffffffffffffffffff~cffc~~~~', // r1  68N Scandinavia, Siberia taiga
    '~~~~~.cfhhhf~~cffhhfffffffffffffff~~cffc~~~~', // r2  64N Finland, W.Russia, Siberia
    '~~~~ccchhhhhccpfffhhfffffffffffffffffc~~~~~~', // r3  60N UK, S.Scandinavia, Russia
    '~~~~cffffffpppfffphhffffffffffffffffffc~~~~~', // r4  56N Britain, N.Europe, Russia
    '~~~~cpppppppptttcthhtttttttttttpppppccc~~~~~', // r5  52N France, Germany, steppe belt
    '~~~~ccpppppmtttttttttttttmmmtttttppppfc~~~~~', // r6  48N Iberia, Alps, C.Asia, Mongolia
    '~~~~~c~cmmmrrr~th~~tttttttdddddtpppc~c~~~~~~', // r7  44N Med, Danube, BlackSea, Caucasus
    '~~~~~~c~cccchhmmmhdddmmmmmhhhhdppppm~mc~~~~~', // r8  40N Med, Anatolia, Caucasus, Iran
    '~~~~~ccc~c~hhhhrrmdddhhhhhhhhrrrppmm~mc~~~~~', // r9  36N N.Africa, T-E rivers, Iran, C.Asia
    '~~~ccccpc~~~~rctrmddddmmmmmhhprrrppmmmcc~~~~', // r10 32N Med, Nile Delta, Levant, Mesop, Iran
    '~~cpmmmddddddrr~rrmmmdmmmmmmmrrrrrppcc~~~~~~', // r11 28N Sahara, RedSea, T-E, Pak/Rajasthan
    '~ccpddddddddddr~cddhhcrrrrrrmmmffffccc~~~~~~', // r12 24N Sahara, Yemen, Deccan, Burma
    '~cppddddddddddr~hdddcppppppccrrrcccc~~~~~~~~', // r13 20N Sahel, Eritrea, S.India, SEA
    '~~ctddddddddddrcchdc~~csssssc~crr~cfcc~~~~~~', // r14 16N Sahel, Horn, S.India, Indochina
    '~~~ttrrrdddsssc~chc~~~~ccssccc~crr~cfcc~~~~~', // r15 12N W.Africa, Mandeb, Bengal, SEA
    '~~~~~rrrssssssmc~~~~~~~~ccc~~cffc~ccfc~~~~~~', // r16  8N Trop.Africa, Sri Lanka, SEAsia
    '~~~~~~cssssshhmm~~~~~~~~~~~~~cffc~~cfc~~~~~~', // r17  4N Eq.Africa, Sumatra
    '~~~~~~cfffffhhhm~~~~~~~~~~~~~~cccc~cc~~~~~~~', // r18  0  Eq.Africa, Borneo
    '~~~~~~cfffffhhh~~~~~~~~~~~~~~~~c~~~~~~~~~~~~', // r19 -4S Congo, E.Africa coast
    '~~~~~~ccffffhhh~~~~~~~~~~~~~~~~~~~~~~~~~~~~~', // r20 -8S Tanzania, Mozambique
    '~~~~~~~csssshh~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~', // r21 -12 S.Tanzania, Zambia
    '~~~~~~~~ccssc~~~c~~~~~~~~~~~~~~~~~~~~~~~~~~~', // r22 -16 Zimbabwe, Madagascar
    '~~~~~~~~~csscc~cc~~~~~~~~~~~~~~~~~~~~~~~~~~~', // r23 -20 S.Africa
    '~~~~~~~~~hhhhpccc~~~~~~~~~~~~~~~~~~~~~~~~~~~', // r24 -24 S.Africa
    '~~~~~~~~~hhhhhc~c~~~~~~~~~~~~~~~~~~~~~~~~~~~', // r25 -28 S.Africa
    '~~~~~~~~~hhhmm~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~', // r26 -31 Cape region
    '~~~~~~~~~~hhmm~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~', // r27 -35 Cape
];
const AUTHORED_OLD_WORLD_TERRAIN_MAP = {
    r: 'river_valley',
    s: 'savanna',
    c: 'coast',
    f: 'forest',
    d: 'desert',
    p: 'plains',
    t: 'steppe',
    h: 'highland',
    m: 'mountain',
    '~': 'sea',
};
function buildAuthoredMovementTags(tile, terrain) {
    const tags = defaultMovementTags(terrain, tile.coastal);
    if (terrain !== 'mountain' &&
        ((tile.lon >= 28 && tile.lon <= 35.5 && tile.lat >= 27 && tile.lat <= 33) ||
            (tile.lon >= 40 && tile.lon <= 45.5 && tile.lat >= 9 && tile.lat <= 16))) {
        tags.push('land-bridge');
    }
    if (terrain !== 'mountain' &&
        ((tile.lon >= 28 && tile.lon <= 38 && tile.lat >= 23 && tile.lat <= 35) ||
            (tile.lon >= 42 && tile.lon <= 57 && tile.lat >= 22 && tile.lat <= 34) ||
            (tile.lon >= 66 && tile.lon <= 76 && tile.lat >= 24 && tile.lat <= 33))) {
        tags.push('desert-pass');
    }
    if ((terrain === 'mountain' || terrain === 'highland') &&
        ((tile.lon >= 33 && tile.lon <= 46 && tile.lat >= 37 && tile.lat <= 44) ||
            (tile.lon >= 44 && tile.lon <= 58 && tile.lat >= 29 && tile.lat <= 37) ||
            (tile.lon >= 68 && tile.lon <= 79 && tile.lat >= 31 && tile.lat <= 38) ||
            (tile.lon >= 97 && tile.lon <= 106 && tile.lat >= 21 && tile.lat <= 28))) {
        tags.push('mountain-pass');
    }
    // Straits: sea tiles at narrow crossings that allow passage with high cost
    if (terrain === 'sea') {
        // Bab-el-Mandeb (曼德海峡) — Horn of Africa to Yemen, ~12-13°N, 43°E
        if (tile.lon >= 39 && tile.lon <= 47 && tile.lat >= 10 && tile.lat <= 15) {
            tags.push('strait');
        }
        // Strait of Hormuz — Persian Gulf exit, ~26°N, 56°E
        if (tile.lon >= 53 && tile.lon <= 60 && tile.lat >= 24 && tile.lat <= 28) {
            tags.push('strait');
        }
        // Bosporus / Dardanelles — Black Sea to Mediterranean, ~41°N, 29°E
        if (tile.lon >= 26 && tile.lon <= 32 && tile.lat >= 39 && tile.lat <= 43) {
            tags.push('strait');
        }
        // Strait of Gibraltar — Iberia to Morocco, ~36°N, -5°W
        if (tile.lon >= -8 && tile.lon <= 0 && tile.lat >= 34 && tile.lat <= 38) {
            tags.push('strait');
        }
        // Strait of Malacca — Malay Peninsula to Sumatra, ~3°N, 100°E
        if (tile.lon >= 96 && tile.lon <= 104 && tile.lat >= 0 && tile.lat <= 6) {
            tags.push('strait');
        }
    }
    return [...new Set(tags)];
}
function generateDetailedEurasiaPreset() {
    const rows = AUTHORED_OLD_WORLD_TERRAIN_ROWS.length;
    const cols = AUTHORED_OLD_WORLD_TERRAIN_ROWS[0]?.length ?? 0;
    const draftTiles = [];
    for (let row = 0; row < rows; row += 1) {
        const lat = 72 - (107 * row) / Math.max(rows - 1, 1);
        const terrainRow = AUTHORED_OLD_WORLD_TERRAIN_ROWS[row];
        for (let col = 0; col < cols; col += 1) {
            const glyph = terrainRow[col];
            if (!glyph || glyph === '.') {
                continue;
            }
            const terrain = AUTHORED_OLD_WORLD_TERRAIN_MAP[glyph];
            if (!terrain) {
                continue;
            }
            const lon = -20 + (170 * col) / Math.max(cols - 1, 1);
            draftTiles.push({
                col,
                row,
                q: col - Math.floor(row / 2),
                r: row,
                lon,
                lat,
                landNeighbors: 0,
                coastal: terrain === 'coast',
                terrain,
            });
        }
    }
    const draftTileByCoordinate = new Map(draftTiles.map((tile) => [`${tile.q},${tile.r}`, tile]));
    for (const tile of draftTiles) {
        tile.landNeighbors = HEX_DIRECTIONS.reduce((count, [dq, dr]) => {
            const neighbor = draftTileByCoordinate.get(`${tile.q + dq},${tile.r + dr}`);
            return count + (neighbor && neighbor.terrain !== 'sea' ? 1 : 0);
        }, 0);
        // A land tile is coastal if it has fewer than 6 land neighbors (i.e. borders sea or map edge)
        if (tile.terrain !== 'sea') {
            tile.coastal = tile.coastal || tile.landNeighbors < HEX_DIRECTIONS.length;
        }
    }
    const regionCounts = new Map();
    const annotatedTiles = draftTiles.map((tile) => {
        const region = classifyDetailedRegion(tile.lon, tile.lat);
        const sequence = (regionCounts.get(region) ?? 0) + 1;
        regionCounts.set(region, sequence);
        const climate = classifyDetailedClimate(tile, tile.terrain);
        const baseTemperature = calculateDetailedBaseTemperature(tile, tile.terrain, climate);
        const water = calculateDetailedWater(climate, tile.terrain, tile.coastal, tile.lat);
        const habitability = calculateDetailedHabitability(climate, tile.terrain, water);
        const baseComfort = calculateDetailedComfort(climate, tile.terrain, habitability, water);
        const hunt = calculateDetailedHunt(tile.terrain, climate, water, habitability);
        const agri = calculateDetailedAgri(tile.terrain, climate, water, habitability);
        const seed = {
            id: `${slugify(region)}-${String(sequence).padStart(2, '0')}`,
            name: `${region} ${String(sequence).padStart(2, '0')}`,
            region,
            q: tile.q,
            r: tile.r,
            climate,
            terrain: tile.terrain,
            water,
            habitability,
            baseTemperature,
            baseComfort,
            hunt,
            agri,
            isVolcanic: isVolcanicZone(tile.lon, tile.lat),
            isTectonic: isTectonicZone(tile.lon, tile.lat),
            coastal: tile.coastal,
            movementTags: buildAuthoredMovementTags(tile, tile.terrain),
        };
        return {
            ...tile,
            seed,
        };
    });
    const tileSeeds = annotatedTiles.map((tile) => tile.seed);
    const tileNameById = new Map(tileSeeds.map((tile) => [tile.id, tile.name]));
    const tileSeedById = new Map(tileSeeds.map((tile) => [tile.id, tile]));
    const neighborsById = new Map(tileSeeds.map((tile) => [tile.id, buildNeighbors(tileSeeds, tile.id, tile.q, tile.r)]));
    const pickTileId = createNearestTilePicker(annotatedTiles.map((tile) => ({ id: tile.seed.id, lon: tile.lon, lat: tile.lat })));
    const pickRiverTileId = createNearestTilePicker(annotatedTiles
        .filter((tile) => tile.seed.terrain === 'river_valley')
        .map((tile) => ({ id: tile.seed.id, lon: tile.lon, lat: tile.lat })));
    function findTilePath(startId, endId, predicate) {
        if (startId === endId) {
            return [startId];
        }
        const queue = [startId];
        const visited = new Set([startId]);
        const parentById = new Map([[startId, null]]);
        while (queue.length) {
            const currentId = queue.shift();
            if (!currentId) {
                continue;
            }
            for (const neighborId of neighborsById.get(currentId) ?? []) {
                if (visited.has(neighborId)) {
                    continue;
                }
                const neighbor = tileSeedById.get(neighborId);
                if (!neighbor || (neighborId !== endId && !predicate(neighbor))) {
                    continue;
                }
                visited.add(neighborId);
                parentById.set(neighborId, currentId);
                if (neighborId === endId) {
                    const path = [endId];
                    let cursor = currentId;
                    while (cursor) {
                        path.unshift(cursor);
                        cursor = parentById.get(cursor) ?? null;
                    }
                    return path;
                }
                queue.push(neighborId);
            }
        }
        throw new Error(`No authored path between ${startId} and ${endId}.`);
    }
    function stitchWaypointPath(waypointTileIds, predicate) {
        const dedupedWaypoints = waypointTileIds.filter((tileId, index) => index === 0 || tileId !== waypointTileIds[index - 1]);
        if (dedupedWaypoints.length <= 1) {
            return dedupedWaypoints;
        }
        const firstWaypoint = dedupedWaypoints[0];
        if (!firstWaypoint) {
            return [];
        }
        const stitched = [firstWaypoint];
        for (let index = 1; index < dedupedWaypoints.length; index += 1) {
            const nextWaypoint = dedupedWaypoints[index];
            if (!nextWaypoint) {
                continue;
            }
            const segment = findTilePath(stitched[stitched.length - 1], nextWaypoint, predicate);
            stitched.push(...segment.slice(1));
        }
        return stitched;
    }
    function buildRiverLane(id, label, waypoints) {
        const tileIds = stitchWaypointPath(waypoints.map(([lon, lat]) => pickRiverTileId(lon, lat)), (tile) => tile.terrain === 'river_valley');
        return {
            id,
            label,
            tileIds,
        };
    }
    const startTileId = 'east-africa-10';
    const lakeTileId = 'east-africa-05';
    const escarpmentTileId = 'east-africa-12';
    const hornTileId = 'east-africa-06';
    const upperNileTileId = 'east-africa-02';
    const routeLanes = [
        {
            id: 'east-africa-to-levant',
            label: 'East Africa to Levant',
            tileIds: [
                startTileId,
                upperNileTileId,
                pickTileId(31, 24),
                pickTileId(33, 31),
                pickTileId(36, 34),
            ],
        },
        {
            id: 'nile-to-mediterranean',
            label: 'Nile to Mediterranean',
            tileIds: [
                pickTileId(31, 12),
                pickTileId(31, 22),
                pickTileId(30, 31),
                pickTileId(20, 38),
            ],
        },
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
            id: 'east-asia-monsoon-rim',
            label: 'East Asia Monsoon Rim',
            tileIds: [
                pickTileId(103, 19),
                pickTileId(112, 24),
                pickTileId(113, 31),
                pickTileId(120, 31),
                pickTileId(127, 37),
            ],
        },
    ];
    const riverLanes = [
        buildRiverLane('nile-river', 'Nile', [
            [31.4, 32.4],
            [31.4, 28.4],
            [35.3, 24.4],
            [35.3, 20.5],
            [35.3, 16.5],
        ]),
        buildRiverLane('tigris-euphrates', 'Tigris-Euphrates', [
            [39.3, 36.3],
            [43.3, 36.3],
            [43.3, 32.4],
            [47.2, 28.4],
        ]),
        buildRiverLane('danube-river', 'Danube', [
            [23.5, 44.3],
            [27.4, 44.3],
            [31.4, 44.3],
        ]),
        buildRiverLane('niger-river', 'Niger', [
            [-0.2, 12.6],
            [3.7, 12.6],
            [7.7, 12.6],
            [7.7, 8.6],
        ]),
        buildRiverLane('indus-river', 'Indus', [
            [70.9, 24.4],
            [74.9, 24.4],
            [78.8, 24.4],
        ]),
        buildRiverLane('ganges-river', 'Ganges', [
            [78.8, 24.4],
            [82.8, 24.4],
            [86.7, 24.4],
            [90.7, 24.4],
        ]),
        buildRiverLane('yellow-river', 'Yellow River', [
            [110.5, 36.3],
            [114.4, 36.3],
            [118.4, 36.3],
        ]),
        buildRiverLane('yangtze-river', 'Yangtze', [
            [106.5, 28.4],
            [110.5, 28.4],
            [114.4, 28.4],
            [118.4, 28.4],
            [122.3, 28.4],
        ]),
        buildRiverLane('mekong-river', 'Mekong', [
            [102.6, 20.5],
            [102.6, 16.5],
            [102.6, 12.6],
        ]),
    ];
    const regionLabels = [
        { id: 'east-africa', tileId: startTileId, label: 'East Africa', detail: 'Origin corridor and rift uplands' },
        { id: 'sahara', tileId: pickTileId(12, 24), label: 'Sahara', detail: 'Arid barrier across North Africa' },
        { id: 'nile-basin', tileId: pickTileId(31, 25), label: 'Nile Basin', detail: 'Linear river refuge through the desert' },
        { id: 'pontic-steppe', tileId: pickTileId(39, 49), label: 'Pontic Steppe', detail: 'Dry grassland migration lane' },
        { id: 'fertile-crescent', tileId: pickTileId(40, 34), label: 'Fertile Crescent', detail: 'Dense river-fed bottleneck' },
        { id: 'indian-monsoon', tileId: pickTileId(82, 25.5), label: 'Indian Monsoon', detail: 'High agri, seasonal water pulse' },
        { id: 'north-china', tileId: pickTileId(114, 35), label: 'North China Plain', detail: 'Broad lowland productivity core' },
        { id: 'siberian-taiga', tileId: pickTileId(92, 60), label: 'Siberian Taiga', detail: 'Cold forest with low carrying margin' },
    ];
    const tribeSeeds = [
        {
            id: 'rift-foragers',
            name: 'Rift Foragers',
            tileId: startTileId,
            ancestryId: 'east-africa-cluster',
            pop: 114,
            color: '#d79b5e',
            leader: { name: 'Mira', archetype: 'Pathfinder', age: 31, authority: 0.61, legitimacy: 0.63 },
            abilityBias: { foraging: 8, organization: 2, heatTolerance: 4 },
            relationships: { 'lake-network': 0.18, 'upper-nile-bands': 0.14 },
            development: { agricultureStage: 'foraging', domestication: 5, sedentism: 0.07 },
            exchange: { tradeVolume: 0.02, diffusion: 0.01 },
        },
        {
            id: 'lake-network',
            name: 'Lake Network',
            tileId: lakeTileId,
            ancestryId: 'east-africa-cluster',
            pop: 102,
            color: '#94bc7f',
            leader: { name: 'Salia', archetype: 'Steward', age: 39, authority: 0.64, legitimacy: 0.67 },
            abilityBias: { foraging: 6, waterEngineering: 4, organization: 3 },
            relationships: { 'rift-foragers': 0.18, 'escarpment-keepers': 0.16, 'horn-coast-watchers': 0.1 },
            development: { agricultureStage: 'foraging', domestication: 6, sedentism: 0.08 },
            exchange: { tradeVolume: 0.02, diffusion: 0.01 },
        },
        {
            id: 'escarpment-keepers',
            name: 'Escarpment Keepers',
            tileId: escarpmentTileId,
            ancestryId: 'east-africa-cluster',
            pop: 96,
            color: '#7aa9c2',
            leader: { name: 'Kedi', archetype: 'Sage', age: 42, authority: 0.66, legitimacy: 0.65 },
            abilityBias: { coldTolerance: 4, organization: 4, foraging: 4 },
            relationships: { 'lake-network': 0.16, 'upper-nile-bands': 0.08 },
            development: { agricultureStage: 'foraging', domestication: 4, sedentism: 0.06 },
            exchange: { tradeVolume: 0.01, diffusion: 0.02 },
        },
        {
            id: 'horn-coast-watchers',
            name: 'Horn Coast Watchers',
            tileId: hornTileId,
            ancestryId: 'east-africa-coast-cluster',
            pop: 88,
            color: '#6cc3c1',
            leader: { name: 'Tara', archetype: 'Broker', age: 28, authority: 0.57, legitimacy: 0.6 },
            abilityBias: { heatTolerance: 7, waterEngineering: 3, organization: 2 },
            relationships: { 'rift-foragers': 0.08, 'lake-network': 0.1, 'upper-nile-bands': 0.06 },
            development: { agricultureStage: 'foraging', domestication: 3, sedentism: 0.05 },
            exchange: { tradeVolume: 0.03, diffusion: 0.01 },
        },
        {
            id: 'upper-nile-bands',
            name: 'Upper Nile Bands',
            tileId: upperNileTileId,
            ancestryId: 'east-africa-cluster',
            pop: 106,
            color: '#d7c271',
            leader: { name: 'Samar', archetype: 'Steward', age: 37, authority: 0.67, legitimacy: 0.68 },
            abilityBias: { waterEngineering: 7, foraging: 5, organization: 3 },
            relationships: { 'rift-foragers': 0.14, 'lake-network': 0.12, 'escarpment-keepers': 0.08 },
            development: { agricultureStage: 'foraging', domestication: 7, sedentism: 0.09 },
            exchange: { tradeVolume: 0.02, diffusion: 0.02 },
        },
    ];
    const startTribeId = 'rift-foragers';
    return {
        tileSeeds,
        tribeSeeds,
        bootstrapEvent: {
            title: 'Detailed Old World preset loaded',
            detail: 'An authored Afro-Eurasian tile atlas is active, with fixed chokepoints, explicit river corridors, and a compact East African origin cluster.',
        },
        presentation: {
            name: 'Detailed Old World',
            description: 'An authored Afro-Eurasian tile atlas seeded from a small East African origin cluster, with explicit corridor geometry across Africa, Europe, and Asia.',
            routeLanes,
            riverLanes,
            regionLabels,
            startTileId,
            startTileName: tileNameById.get(startTileId) ?? 'East Africa',
            startTribeId,
            startTribeName: 'Rift Foragers',
        },
    };
}
const WORLD_PRESETS = {
    'old-world-corridor': OLD_WORLD_CORRIDOR_PRESET,
    'detailed-eurasia': generateDetailedEurasiaPreset(),
};
export const WORLD_PRESET_OPTIONS = Object.entries(WORLD_PRESETS).map(([id, preset]) => ({
    id,
    label: preset.presentation.name,
}));
function getWorldPresetDefinition(worldPreset) {
    return WORLD_PRESETS[worldPreset] ?? OLD_WORLD_CORRIDOR_PRESET;
}
export function createInitialWorldState(config) {
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
export function getWorldPresentation(worldPreset) {
    return getWorldPresetDefinition(worldPreset).presentation;
}
