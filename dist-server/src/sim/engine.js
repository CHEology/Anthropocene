import { createInitialWorldState } from '../world/oldWorld.js';
import { cloneSimulationConfig } from './config.js';
import { TRAINED_DECISION_POLICY } from './learnedPolicy.js';
import { buildAllianceFeatures, buildIntensifyFeatures, buildMigrationFeatures, buildRaidFeatures, buildTradeFeatures, decisionAdjustment, terrainAridity, terrainRuggedness, } from './policy.js';
import { createPrng } from './prng.js';
import { TECH_TREE, ALL_TECH_IDS, hasTech, hasAllPrerequisites, getDiscoverableTechs, getTechAbilityBonuses, getTechHealthBonus, getTechFoodStorageBonus, } from './techTree.js';
const MAX_ENGINE_BATCH_YEARS = 4096;
const TARGET_BASELINE_TEMPERATURE = 15;
const MIN_TRIBE_POPULATION = 25;
const MAX_TRIBE_POPULATION = 1_000_000;
const POPULATION_CARRY_LIMIT = 0.999999;
const TRIBE_SPLIT_THRESHOLD = 220;
const TRIBE_RELATION_BOUND = 0.95;
const PHASES = [
    'global-events',
    'tile-update',
    'tribe-update',
    'interaction',
    'migration',
    'fission',
    'extinction',
];
const STAGE_ORDER = [
    'foraging',
    'tending',
    'cultivation',
    'agropastoral',
    'settled-farming',
];
const STAGE_PROFILES = {
    'foraging': {
        agriMultiplier: 0.2,
        foragingMultiplier: 1.08,
        organizationBonus: 0,
        birthBonus: 0,
        migrationFriction: 0.02,
        plagueVulnerability: 0.86,
        targetSedentism: 0.08,
    },
    'tending': {
        agriMultiplier: 0.44,
        foragingMultiplier: 1.02,
        organizationBonus: 4,
        birthBonus: 0.001,
        migrationFriction: 0.08,
        plagueVulnerability: 0.92,
        targetSedentism: 0.18,
    },
    'cultivation': {
        agriMultiplier: 0.74,
        foragingMultiplier: 0.96,
        organizationBonus: 8,
        birthBonus: 0.002,
        migrationFriction: 0.16,
        plagueVulnerability: 1,
        targetSedentism: 0.34,
    },
    'agropastoral': {
        agriMultiplier: 0.98,
        foragingMultiplier: 0.92,
        organizationBonus: 12,
        birthBonus: 0.003,
        migrationFriction: 0.24,
        plagueVulnerability: 1.08,
        targetSedentism: 0.5,
    },
    'settled-farming': {
        agriMultiplier: 1.2,
        foragingMultiplier: 0.82,
        organizationBonus: 18,
        birthBonus: 0.005,
        migrationFriction: 0.36,
        plagueVulnerability: 1.18,
        targetSedentism: 0.72,
    },
};
const DISASTER_LABELS = {
    drought: 'Drought',
    flood: 'Flood',
    wildfire: 'Wildfire',
    'severe-winter': 'Severe Winter',
    earthquake: 'Earthquake',
    eruption: 'Eruption',
    supervolcano: 'Supervolcanic Winter',
    megadrought: 'Continental Megadrought',
};
// Paleoclimate curve: (year_BP, anomaly_C) -- piecewise-linear interpolation
// Sources: NGRIP ice core, Shakun et al. 2012, Clark et al. 2012
const PALEOCLIMATE_CURVE = [
    [70000, -4.0], // MIS 4 cold phase
    [57000, -2.5], // MIS 3 interstadial onset
    [40000, -3.0], // MIS 3 mid-range
    [29000, -3.5], // MIS 3 decline
    [26500, -6.0], // Last Glacial Maximum onset
    [19000, -6.0], // LGM trough
    [16000, -4.0], // Deglaciation begins
    [14700, -2.0], // Bolling-Allerod warm pulse
    [12900, -4.0], // Younger Dryas snap-back
    [11600, 0.0], // Holocene onset
    [8200, -1.0], // 8.2 kya cold event
    [6000, 0.5], // Holocene Climatic Optimum
    [4200, -0.5], // 4.2 kya aridification
    [2000, 0.0], // Late Holocene
    [0, 0.0], // Present
];
const GENETIC_LETHAL_EQUIVALENTS = 6;
const ALLEE_THRESHOLD = 25;
const SUPERVOLCANO_CHANCE_PER_YEAR = 0.0012;
const MEGADROUGHT_CHANCE_PER_YEAR = 0.002;
const PLAGUE_LABELS = {
    waterborne: 'Waterborne Outbreak',
    respiratory: 'Respiratory Wave',
    zoonotic: 'Zoonotic Spillover',
};
const NAME_STARTS = ['Ar', 'Bel', 'Da', 'En', 'Ha', 'Ka', 'La', 'Ma', 'Na', 'Ri', 'Sa', 'Ta', 'Va', 'Ya'];
const NAME_ENDS = ['an', 'ar', 'el', 'en', 'ir', 'is', 'or', 'un', 'ya', 'ek', 'im', 'ul'];
function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(max, Math.max(min, value));
}
// Pre-computed powers of 10 for fast rounding without toFixed string conversion
const POW10 = [1, 10, 100, 1000, 10000];
function round(value, digits = 3) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    const m = POW10[digits] ?? (10 ** digits);
    return Math.round(value * m) / m;
}
function deriveClimateRegime(meanTemperature, anomaly) {
    if (anomaly <= -2.4) {
        return 'volcanic-winter';
    }
    if (meanTemperature <= TARGET_BASELINE_TEMPERATURE - 4.2) {
        return 'deep-glacial';
    }
    if (meanTemperature <= TARGET_BASELINE_TEMPERATURE - 1.7) {
        return 'glacial';
    }
    if (meanTemperature <= TARGET_BASELINE_TEMPERATURE - 0.35) {
        return 'cool-transition';
    }
    if (anomaly >= 1.2 || meanTemperature >= TARGET_BASELINE_TEMPERATURE + 1.6) {
        return 'warm-pulse';
    }
    return 'temperate-window';
}
function storytellerCrisisSignal(storyteller) {
    return clamp(Math.max(0, 0.55 - storyteller.prosperity) * 1.15 +
        storyteller.crisisStreak / 18 +
        Math.max(0, storyteller.disasterMultiplier - 1) * 0.28, 0, 1.2);
}
function deriveStorytellerPosture(storyteller) {
    if (storyteller.crisisStreak >= 6 || storyteller.prosperity < 0.22) {
        return 'crisis';
    }
    if (storyteller.recoveryMultiplier >= 1.4) {
        return 'recovery';
    }
    if (storyteller.prosperity > 0.68 && storyteller.prosperityStreak >= 8) {
        return 'prosperity';
    }
    if (storyteller.quietStreak >= 12) {
        return 'quiet';
    }
    return 'balanced';
}
function foodCapacityCollapse(tile) {
    return clamp(1 -
        getFoodCapacity(tile) /
            Math.max(tile.baseCarryingCapacity.hunt + tile.baseCarryingCapacity.agri, 1), 0, 1.2);
}
/**
 * Interpolate the paleoclimate curve for a given simulation year.
 * Simulation year 0 maps to ~70,000 BP; year 70000 maps to present (0 BP).
 * Uses piecewise-linear interpolation through NGRIP ice-core derived data.
 */
function interpolatePaleoclimate(simYear) {
    const yearBP = Math.max(0, 70000 - simYear);
    // Curve is sorted descending by yearBP
    if (yearBP >= PALEOCLIMATE_CURVE[0][0])
        return PALEOCLIMATE_CURVE[0][1];
    if (yearBP <= PALEOCLIMATE_CURVE[PALEOCLIMATE_CURVE.length - 1][0]) {
        return PALEOCLIMATE_CURVE[PALEOCLIMATE_CURVE.length - 1][1];
    }
    for (let i = 0; i < PALEOCLIMATE_CURVE.length - 1; i++) {
        const [yearHigh, tempHigh] = PALEOCLIMATE_CURVE[i];
        const [yearLow, tempLow] = PALEOCLIMATE_CURVE[i + 1];
        if (yearBP <= yearHigh && yearBP >= yearLow) {
            const t = (yearHigh - yearBP) / Math.max(yearHigh - yearLow, 1);
            return tempHigh + (tempLow - tempHigh) * t;
        }
    }
    return 0;
}
/**
 * Dansgaard-Oeschger oscillation: ~1470-year period, amplitude scales with glacial intensity.
 * During glacial periods (anomaly < -1.5C), amplitude reaches ~2C.
 * During Holocene (anomaly > -1.0C), dampens to ~0.3C.
 */
function dansgaardOeschgerOscillation(simYear, baselineAnomaly) {
    const glacialFactor = clamp((-baselineAnomaly - 1.0) / 4.0, 0, 1);
    const amplitude = 0.3 + 1.7 * glacialFactor;
    return amplitude * Math.sin(2 * Math.PI * simYear / 1470);
}
/**
 * Century-scale climate noise using two incommensurate sine periods.
 * Cheaper than Perlin noise, produces quasi-random variation.
 */
function centuryClimateNoise(simYear) {
    return 0.5 * Math.sin(simYear / 137 * 2 * Math.PI) * Math.sin(simYear / 311 * 2 * Math.PI);
}
function innovationEraFactor(simYear) {
    const yearBP = Math.max(0, 70000 - simYear);
    if (yearBP >= 50000)
        return 0.24;
    if (yearBP >= 35000)
        return 0.36;
    if (yearBP >= 20000)
        return 0.54;
    if (yearBP >= 12000)
        return 0.76;
    if (yearBP >= 6000)
        return 0.9;
    return 1;
}
function agricultureEraFactor(simYear) {
    const yearBP = Math.max(0, 70000 - simYear);
    if (yearBP >= 25000)
        return 0.015;
    if (yearBP >= 18000)
        return 0.06;
    if (yearBP >= 14000)
        return 0.18;
    if (yearBP >= 10000)
        return 0.46;
    if (yearBP >= 7000)
        return 0.72;
    return 1;
}
function domesticationEraCeiling(simYear) {
    const yearBP = Math.max(0, 70000 - simYear);
    if (yearBP >= 40000)
        return 12;
    if (yearBP >= 25000)
        return 16;
    if (yearBP >= 18000)
        return 22;
    if (yearBP >= 14000)
        return 32;
    if (yearBP >= 11000)
        return 52;
    if (yearBP >= 8000)
        return 72;
    return 100;
}
function technologyComplexity(techId) {
    const tech = TECH_TREE[techId];
    if (!tech) {
        return 1;
    }
    const categoryLoad = tech.category === 'knowledge' ? 0.44
        : tech.category === 'craft' ? 0.52
            : tech.category === 'military' ? 0.4
                : 0.26;
    return clamp(1 + tech.prerequisites.length * 0.42 + tech.populationRequirement / 110 + categoryLoad, 1, 4.4);
}
function technologyRegionalism(techId) {
    const tech = TECH_TREE[techId];
    if (!tech) {
        return 1;
    }
    const categoryBias = tech.category === 'subsistence' ? 0.92
        : tech.category === 'craft' ? 1.04
            : tech.category === 'knowledge' ? 1.16
                : 1.1;
    return clamp(categoryBias + tech.prerequisites.length * 0.08 + tech.populationRequirement / 220, 0.92, 1.9);
}
function safeAverage(values) {
    return values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;
}
function normalizeStepYears(years = 1) {
    if (!Number.isFinite(years)) {
        throw new RangeError('Simulation step years must be finite.');
    }
    const wholeYears = Math.trunc(years);
    if (wholeYears < 1 || wholeYears > MAX_ENGINE_BATCH_YEARS) {
        throw new RangeError(`Simulation step years must be between 1 and ${MAX_ENGINE_BATCH_YEARS}.`);
    }
    return wholeYears;
}
function cloneState(state) {
    return structuredClone(state);
}
function eventId(prefix, year, seq) {
    return `${prefix}-${year}-${seq}`;
}
function indexById(items) {
    return new Map(items.map((item) => [item.id, item]));
}
function occupancyByTile(state) {
    const occupancy = new Map();
    for (const tribe of state.tribes) {
        occupancy.set(tribe.tileId, (occupancy.get(tribe.tileId) ?? 0) + tribe.pop);
    }
    return occupancy;
}
function tilesById(state) {
    return indexById(state.tiles);
}
function tribesById(state) {
    return indexById(state.tribes);
}
function shuffleIds(ids, prng) {
    const result = [...ids];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(prng.next() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
}
function getFoodCapacity(tile, coastalForaging = false) {
    const effectiveMegafauna = tile.megafaunaIndex < 0.1 ? 0 : tile.megafaunaIndex;
    const megafaunaBonus = 1 + effectiveMegafauna * 0.5;
    // Coastal foraging bonus: foraging-stage tribes exploit shellfish/littoral resources
    const coastBonus = coastalForaging && (tile.terrain === 'coast' || tile.movementTags.includes('coastal-corridor')) ? 45 : 0;
    return tile.carryingCapacity.hunt * megafaunaBonus + tile.carryingCapacity.agri + coastBonus;
}
function sumDisasterSeverity(tile) {
    return tile.activeDisasters.reduce((sum, disaster) => sum + disaster.severity, 0);
}
function sumPlagueSeverity(tile) {
    return tile.activePlagues.reduce((sum, plague) => sum + plague.severity, 0);
}
function stageRank(stage) {
    return STAGE_ORDER.indexOf(stage);
}
function getStageProfile(stage) {
    return STAGE_PROFILES[stage];
}
function resolveAgricultureStage(domestication, tile) {
    const agriSuitability = tile.baseCarryingCapacity.agri /
        Math.max(tile.baseCarryingCapacity.agri + tile.baseCarryingCapacity.hunt, 1);
    let stage = 'foraging';
    if (domestication >= 18) {
        stage = 'tending';
    }
    if (domestication >= 38 && agriSuitability > 0.16) {
        stage = 'cultivation';
    }
    if (domestication >= 60 &&
        (agriSuitability > 0.24 || tile.terrain === 'steppe' || tile.terrain === 'savanna')) {
        stage = 'agropastoral';
    }
    if (domestication >= 84 &&
        agriSuitability > 0.42 &&
        tile.water >= 3 &&
        tile.terrain !== 'desert' &&
        tile.terrain !== 'mountain') {
        stage = 'settled-farming';
    }
    return stage;
}
function getLeaderModifiers(leader) {
    if (!leader) {
        return {
            innovation: 1,
            migration: 1,
            agriculture: 1,
            foraging: 1,
            diplomacy: 1,
            trade: 1,
            attack: 1,
            defense: 1,
            disasterResilience: 1,
            plagueResilience: 1,
            cohesion: 1,
            raidBias: 0,
        };
    }
    const authorityFactor = 0.78 + leader.authority * 0.32 + leader.legitimacy * 0.2;
    switch (leader.archetype) {
        case 'Pathfinder':
            return {
                innovation: round(1.04 * authorityFactor),
                migration: round(1.22 * authorityFactor),
                agriculture: round(0.94 * authorityFactor),
                foraging: round(1.08 * authorityFactor),
                diplomacy: round(0.94 * authorityFactor),
                trade: round(0.96 * authorityFactor),
                attack: round(1.12 * authorityFactor),
                defense: round(1.02 * authorityFactor),
                disasterResilience: round(1.02 * authorityFactor),
                plagueResilience: round(0.98 * authorityFactor),
                cohesion: round(0.98 * authorityFactor),
                raidBias: 0.14,
            };
        case 'Steward':
            return {
                innovation: round(1.05 * authorityFactor),
                migration: round(0.92 * authorityFactor),
                agriculture: round(1.22 * authorityFactor),
                foraging: round(0.98 * authorityFactor),
                diplomacy: round(1.08 * authorityFactor),
                trade: round(1.08 * authorityFactor),
                attack: round(0.94 * authorityFactor),
                defense: round(1.1 * authorityFactor),
                disasterResilience: round(1.12 * authorityFactor),
                plagueResilience: round(1.08 * authorityFactor),
                cohesion: round(1.08 * authorityFactor),
                raidBias: -0.08,
            };
        case 'Broker':
            return {
                innovation: round(1.02 * authorityFactor),
                migration: round(1.03 * authorityFactor),
                agriculture: round(1.02 * authorityFactor),
                foraging: round(1 * authorityFactor),
                diplomacy: round(1.22 * authorityFactor),
                trade: round(1.24 * authorityFactor),
                attack: round(1 * authorityFactor),
                defense: round(1 * authorityFactor),
                disasterResilience: round(0.98 * authorityFactor),
                plagueResilience: round(1 * authorityFactor),
                cohesion: round(1.04 * authorityFactor),
                raidBias: -0.04,
            };
        case 'Sage':
        default:
            return {
                innovation: round(1.22 * authorityFactor),
                migration: round(0.98 * authorityFactor),
                agriculture: round(1.04 * authorityFactor),
                foraging: round(0.98 * authorityFactor),
                diplomacy: round(1.1 * authorityFactor),
                trade: round(1.06 * authorityFactor),
                attack: round(0.92 * authorityFactor),
                defense: round(1.04 * authorityFactor),
                disasterResilience: round(1.08 * authorityFactor),
                plagueResilience: round(1.14 * authorityFactor),
                cohesion: round(1.06 * authorityFactor),
                raidBias: -0.12,
            };
    }
}
function getRelationship(tribe, otherId) {
    return tribe.relationships[otherId] ?? 0;
}
function setRelationship(tribeMap, leftId, rightId, value) {
    const relation = round(clamp(value, -TRIBE_RELATION_BOUND, TRIBE_RELATION_BOUND), 2);
    const left = tribeMap.get(leftId);
    const right = tribeMap.get(rightId);
    if (!left || !right) {
        return;
    }
    left.relationships = { ...left.relationships, [rightId]: relation };
    right.relationships = { ...right.relationships, [leftId]: relation };
}
function hasAlliance(tribe, otherId) {
    return tribe.alliances.includes(otherId);
}
function addAlliance(tribeMap, leftId, rightId) {
    const left = tribeMap.get(leftId);
    const right = tribeMap.get(rightId);
    if (!left || !right) {
        return;
    }
    if (!left.alliances.includes(rightId)) {
        left.alliances = [...left.alliances, rightId].sort();
    }
    if (!right.alliances.includes(leftId)) {
        right.alliances = [...right.alliances, leftId].sort();
    }
}
function removeAlliance(tribeMap, leftId, rightId) {
    const left = tribeMap.get(leftId);
    const right = tribeMap.get(rightId);
    if (!left || !right) {
        return;
    }
    left.alliances = left.alliances.filter((allianceId) => allianceId !== rightId);
    right.alliances = right.alliances.filter((allianceId) => allianceId !== leftId);
}
function hazardsEqual(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    return left.every((entry, index) => entry.kind === right[index]?.kind &&
        entry.severity === right[index]?.severity &&
        entry.remainingYears === right[index]?.remainingYears);
}
function generateLeaderName(prng) {
    const first = prng.pick(NAME_STARTS);
    const second = prng.pick(NAME_ENDS);
    const third = prng.next() < 0.35 ? prng.pick(NAME_ENDS) : '';
    return `${first}${second}${third}`;
}
function chooseLeaderArchetype(tribe, prng) {
    const positiveRelations = Object.values(tribe.relationships).filter((value) => value > 0.2).length;
    const weights = [
        {
            archetype: 'Pathfinder',
            weight: 0.9 +
                tribe.pressures.food * 1.2 +
                tribe.pressures.water * 1.1 +
                tribe.exchange.raidExposure * 0.8 +
                (1 - tribe.development.sedentism),
        },
        {
            archetype: 'Steward',
            weight: 0.9 +
                stageRank(tribe.development.agricultureStage) * 0.45 +
                tribe.abilities.agriculture.current / 55 +
                tribe.abilities.waterEngineering.current / 80,
        },
        {
            archetype: 'Broker',
            weight: 0.9 +
                tribe.alliances.length * 0.5 +
                tribe.exchange.tradeVolume * 1.5 +
                positiveRelations * 0.08,
        },
        {
            archetype: 'Sage',
            weight: 0.9 +
                tribe.exchange.diffusion * 1.3 +
                tribe.pressures.health * 0.9 +
                tribe.abilities.organization.current / 90,
        },
    ];
    const totalWeight = weights.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = prng.next() * totalWeight;
    for (const entry of weights) {
        cursor -= entry.weight;
        if (cursor <= 0) {
            return entry.archetype;
        }
    }
    return weights[weights.length - 1].archetype;
}
function createSuccessorLeader(tribe, prng) {
    const archetype = chooseLeaderArchetype(tribe, prng);
    const stage = stageRank(tribe.development.agricultureStage);
    return {
        name: generateLeaderName(prng),
        archetype,
        age: prng.nextInt(26, 44),
        tenure: 0,
        authority: round(clamp(0.46 + prng.next() * 0.24 + stage * 0.02, 0.28, 1), 3),
        legitimacy: round(clamp(0.48 + prng.next() * 0.24 + tribe.alliances.length * 0.02, 0.2, 1), 3),
    };
}
function getBranchDepth(tribeId) {
    return (tribeId.match(/-branch-/g) ?? []).length;
}
function stripBranchSuffix(name) {
    return name.replace(/(?: Branch(?: \d+)?)+$/u, '').trim();
}
function deriveBranchName(source) {
    const baseName = stripBranchSuffix(source.name);
    const nextDepth = getBranchDepth(source.id) + 1;
    return nextDepth === 1 ? `${baseName} Branch` : `${baseName} Branch ${nextDepth}`;
}
function alliedSupportCount(tribeId, tribeMap, tileMap) {
    const tribe = tribeMap.get(tribeId);
    if (!tribe) {
        return 0;
    }
    const nearbyTiles = new Set([tribe.tileId, ...(tileMap.get(tribe.tileId)?.neighbors ?? [])]);
    let support = 0;
    for (const allyId of tribe.alliances) {
        const ally = tribeMap.get(allyId);
        if (ally && nearbyTiles.has(ally.tileId)) {
            support += 1;
        }
    }
    return support;
}
function mobilityProfile(tribe) {
    return clamp(1 - tribe.development.sedentism + (tribe.development.agricultureStage === 'foraging' ? 0.14 : 0), 0.08, 1.18);
}
function alliedPresenceOnTile(tribe, tileId, tribeMap) {
    let count = 0;
    for (const allyId of tribe.alliances) {
        const ally = tribeMap.get(allyId);
        if (ally && ally.tileId === tileId)
            count++;
        if (count >= 3)
            break;
    }
    return count;
}
function hostilePresenceOnTile(tribe, tileId, tileToTribes) {
    const residents = tileToTribes.get(tileId);
    if (!residents)
        return 0;
    let count = 0;
    for (const candidate of residents) {
        if (getRelationship(tribe, candidate.id) < -0.2)
            count++;
        if (count >= 4)
            break;
    }
    return count;
}
function applyDefeatShock(tribe, severity, stripStores = true) {
    const shock = clamp(severity, 0.04, 0.42);
    tribe.exchange.tradeVolume = round(clamp(tribe.exchange.tradeVolume - shock * (stripStores ? 0.95 : 0.55), 0, 1.5), 3);
    tribe.exchange.diffusion = round(clamp(tribe.exchange.diffusion - shock * 0.45, 0, 1.5), 3);
    tribe.exchange.raidExposure = round(clamp(tribe.exchange.raidExposure + shock * 0.8, 0, 1.5), 3);
    tribe.exchange.warExhaustion = round(clamp(tribe.exchange.warExhaustion + shock * 0.7, 0, 1.5), 3);
    tribe.development.domestication = round(clamp(tribe.development.domestication - shock * 6.5, 0, 100), 2);
    tribe.development.sedentism = round(clamp(tribe.development.sedentism - shock * 0.08, 0.02, 0.94), 3);
    tribe.foodStores = round(clamp(tribe.foodStores - shock * (stripStores ? 0.68 : 0.28), 0, 1), 3);
    tribe.geneticDiversity = round(clamp(tribe.geneticDiversity - shock * (stripStores ? 0.018 : 0.008), 0, 1), 4);
    tribe.abilities.attack.current = round(clamp(tribe.abilities.attack.current - shock * 7.5, 0, tribe.abilities.attack.cap), 2);
    tribe.abilities.organization.current = round(clamp(tribe.abilities.organization.current - shock * 5.5, 0, tribe.abilities.organization.cap), 2);
    if (tribe.leader) {
        tribe.leader.legitimacy = round(clamp(tribe.leader.legitimacy - shock * 0.12, 0.16, 1), 3);
    }
}
function militaryStrength(tribe, tile, modifiers, supportCount) {
    const terrainModifier = tile.terrain === 'mountain'
        ? 1.18
        : tile.terrain === 'highland'
            ? 1.12
            : tile.terrain === 'forest'
                ? 1.06
                : 1;
    return (Math.sqrt(Math.max(tribe.pop, 1)) *
        (0.82 + tribe.abilities.attack.current / 90) *
        (0.88 + tribe.abilities.organization.current / 110) *
        modifiers.attack *
        terrainModifier *
        (1 + supportCount * 0.08));
}
function computeMetrics(state, previousMetrics, events) {
    let totalPopulation = 0;
    let sumPressure = 0;
    let sumFoodStores = 0;
    let sumGeneticDiversity = 0;
    for (const tribe of state.tribes) {
        totalPopulation += tribe.pop;
        sumPressure += tribe.pressures.total;
        sumFoodStores += tribe.foodStores;
        sumGeneticDiversity += tribe.geneticDiversity;
    }
    const tribeCount = state.tribes.length;
    const tribeDiv = Math.max(tribeCount, 1);
    let sumComfort = 0;
    let sumMegafauna = 0;
    let activeHazards = 0;
    let activePlagues = 0;
    let landTileCount = 0;
    for (const tile of state.tiles) {
        if (tile.terrain === 'sea')
            continue;
        landTileCount++;
        sumComfort += tile.comfort;
        sumMegafauna += tile.megafaunaIndex;
        activeHazards += tile.activeDisasters.length;
        activePlagues += tile.activePlagues.length;
    }
    const tileDiv = Math.max(landTileCount, 1);
    // Single pass over events for innovation and conflict counts
    let innovationCount = 0;
    let conflictCount = 0;
    for (const event of events) {
        if (event.kind === 'innovation')
            innovationCount++;
        else if (event.kind === 'warning' || event.kind === 'combat')
            conflictCount++;
    }
    return {
        totalPopulation,
        tribeCount,
        innovations: previousMetrics.innovations + innovationCount,
        conflicts: previousMetrics.conflicts + conflictCount,
        averageComfort: round(sumComfort / tileDiv),
        averagePressure: round(sumPressure / tribeDiv),
        averageFoodStores: round(sumFoodStores / tribeDiv),
        averageGeneticDiversity: round(sumGeneticDiversity / tribeDiv, 4),
        averageMegafauna: round(sumMegafauna / tileDiv),
        activeHazards,
        activePlagues,
    };
}
function applyGlobalPhase(read, write, config, events) {
    write.year = read.year + 1;
    const activePulses = [];
    for (const pulse of write.activeClimatePulses) {
        if (pulse.remainingYears > 1) {
            activePulses.push({
                ...pulse,
                remainingYears: pulse.remainingYears - 1,
            });
        }
    }
    write.activeClimatePulses = activePulses;
    if (config.enabledSystems.interventions) {
        const dueCommands = write.pendingInterventions.filter((command) => command.scheduledYear <= write.year);
        write.pendingInterventions = write.pendingInterventions.filter((command) => command.scheduledYear > write.year);
        for (const command of dueCommands) {
            write.executedInterventions.unshift(command);
            if (command.kind === 'climate-pulse') {
                write.activeClimatePulses.push({
                    commandId: command.id,
                    label: command.label,
                    remainingYears: Math.max(1, command.payload.duration ?? 120),
                    temperatureDelta: command.payload.temperatureDelta ?? 0,
                });
            }
            events.push({
                id: eventId('intervention', write.year, events.length),
                year: write.year,
                kind: 'intervention',
                title: command.label,
                detail: command.kind === 'climate-pulse'
                    ? `Climate anomaly scheduled at ${round(command.payload.temperatureDelta ?? 0, 1)}°C for ${command.payload.duration ?? 120} years.`
                    : command.payload.note ?? 'Observation note applied to the timeline.',
            });
        }
    }
    const pulseAnomaly = round(write.activeClimatePulses.reduce((sum, pulse) => sum + pulse.temperatureDelta, 0), 2);
    const paleoclimateDelta = interpolatePaleoclimate(write.year);
    // Normalize so year 0 starts at 0 delta -- the curve shape matters, not absolute offset.
    // This way tile base temperatures (authored for G_temp) remain valid at start.
    const paleoclimateAtStart = interpolatePaleoclimate(0);
    const normalizedPaleoclimate = paleoclimateDelta - paleoclimateAtStart;
    const doOscillation = dansgaardOeschgerOscillation(write.year, paleoclimateDelta);
    const centuryNoise = centuryClimateNoise(write.year);
    const baseline = config.globals.G_temp + normalizedPaleoclimate + doOscillation + centuryNoise;
    const meanTemperature = round(baseline + pulseAnomaly, 2);
    write.globalClimate = {
        baseline: round(baseline, 2),
        anomaly: pulseAnomaly,
        meanTemperature,
        regime: deriveClimateRegime(meanTemperature, pulseAnomaly),
    };
}
function buildDisaster(kind, severity, remainingYears) {
    return {
        kind,
        severity: round(clamp(severity, 0.12, 0.95), 2),
        remainingYears: Math.max(1, Math.trunc(remainingYears)),
    };
}
function buildPlague(kind, severity, remainingYears) {
    return {
        kind,
        severity: round(clamp(severity, 0.12, 0.9), 2),
        remainingYears: Math.max(2, Math.trunc(remainingYears)),
    };
}
function applyTilePhase(read, write, config, prng, events, changedTileIds) {
    const occupancy = occupancyByTile(read);
    const previousTiles = tilesById(read);
    const tribesOnTile = new Map();
    for (const tribe of read.tribes) {
        const list = tribesOnTile.get(tribe.tileId);
        if (list)
            list.push(tribe);
        else
            tribesOnTile.set(tribe.tileId, [tribe]);
    }
    const storytellerMod = write.storyteller.disasterMultiplier;
    // --- Correlated catastrophes: supervolcanic winter ---
    const isGlacial = write.globalClimate.meanTemperature < TARGET_BASELINE_TEMPERATURE - 1.5;
    if (prng.next() < SUPERVOLCANO_CHANCE_PER_YEAR * storytellerMod) {
        const severity = 0.6 + prng.next() * 0.35;
        const duration = prng.nextInt(5, 15);
        const tempDrop = -(3 + prng.next() * 3);
        write.activeClimatePulses.push({
            commandId: `supervolcano-${write.year}`,
            label: 'Supervolcanic Winter',
            remainingYears: duration,
            temperatureDelta: tempDrop,
        });
        for (const tile of write.tiles) {
            tile.activeDisasters.push(buildDisaster('supervolcano', severity, duration));
            tile.megafaunaIndex = round(clamp(tile.megafaunaIndex - (0.15 + prng.next() * 0.15), 0, 1), 3);
            changedTileIds.add(tile.id);
        }
        events.push({
            id: eventId('disaster', write.year, events.length),
            year: write.year,
            kind: 'disaster',
            title: 'Supervolcanic Winter',
            detail: `A massive eruption blankets the world in ash. Global temperatures drop ${round(-tempDrop, 1)}C for ${duration} years.`,
        });
    }
    // --- Correlated catastrophes: megadrought (glacial periods only) ---
    if (isGlacial && prng.next() < MEGADROUGHT_CHANCE_PER_YEAR * storytellerMod) {
        const severity = 0.4 + prng.next() * 0.3;
        const duration = prng.nextInt(10, 30);
        const affectedFraction = 0.5 + prng.next() * 0.3;
        let affectedCount = 0;
        for (const tile of write.tiles) {
            if (prng.next() < affectedFraction) {
                tile.activeDisasters.push(buildDisaster('megadrought', severity, duration));
                changedTileIds.add(tile.id);
                affectedCount++;
            }
        }
        events.push({
            id: eventId('disaster', write.year, events.length),
            year: write.year,
            kind: 'disaster',
            title: 'Continental Megadrought',
            detail: `A prolonged continental drought grips ${affectedCount} regions for ${duration} years, devastating water and agriculture.`,
        });
    }
    for (const tile of write.tiles) {
        const previous = previousTiles.get(tile.id);
        const totalPopulation = occupancy.get(tile.id) ?? 0;
        const residentTribes = tribesOnTile.get(tile.id) ?? [];
        const baselineFoodCapacity = previous.baseCarryingCapacity.hunt + previous.baseCarryingCapacity.agri;
        const crowdingRatio = totalPopulation / Math.max(baselineFoodCapacity, 1);
        const climateShift = Math.abs(write.globalClimate.meanTemperature - TARGET_BASELINE_TEMPERATURE);
        const climateStress = clamp(Math.max(0, climateShift - 1.5) / 8, 0, 0.45);
        const terrainPenalty = tile.terrain === 'mountain' ? 1.1 : tile.terrain === 'highland' ? 0.28 : 0;
        const recoveryMod = write.storyteller.recoveryMultiplier;
        const huntRecovery = Math.min(previous.baseCarryingCapacity.hunt * 0.06 * recoveryMod, previous.baseCarryingCapacity.hunt - previous.carryingCapacity.hunt);
        const agriRecovery = Math.min(previous.baseCarryingCapacity.agri * 0.05 * recoveryMod, previous.baseCarryingCapacity.agri - previous.carryingCapacity.agri);
        tile.temperature = round(tile.baseTemperature + (write.globalClimate.meanTemperature - TARGET_BASELINE_TEMPERATURE), 2);
        tile.carryingCapacity.hunt = round(clamp(previous.carryingCapacity.hunt * (1 - climateStress * 0.05) + huntRecovery, previous.baseCarryingCapacity.hunt > 0 ? previous.baseCarryingCapacity.hunt * 0.18 : 0, previous.baseCarryingCapacity.hunt), 2);
        tile.carryingCapacity.agri = round(clamp(previous.carryingCapacity.agri * (1 - climateStress * 0.03) + agriRecovery, previous.baseCarryingCapacity.agri > 0 ? previous.baseCarryingCapacity.agri * 0.25 : 0, previous.baseCarryingCapacity.agri), 2);
        tile.carryingCapacity.water = round(clamp(previous.baseCarryingCapacity.water * (1 - climateStress * 0.2), previous.baseCarryingCapacity.water > 0 ? previous.baseCarryingCapacity.water * 0.55 : 0, previous.baseCarryingCapacity.water), 2);
        tile.comfort = round(clamp(tile.baseComfort -
            climateShift * 0.08 -
            terrainPenalty -
            Math.max(0, crowdingRatio - 0.74) * 1.35 -
            climateStress * 0.75, 0.2, 6), 2);
        const disasters = previous.activeDisasters
            .filter((disaster) => disaster.remainingYears > 1)
            .map((disaster) => ({ ...disaster, remainingYears: disaster.remainingYears - 1 }));
        const disasterKinds = new Set(disasters.map((disaster) => disaster.kind));
        const disasterMultiplier = 0.42 + config.globals.G_disaster * 2.8;
        const droughtChance = disasterMultiplier * (0.0008 +
            climateStress * 0.0022 +
            (tile.water < 3 ? 0.0016 : 0) +
            (tile.terrain === 'desert' || tile.terrain === 'steppe' ? 0.0015 : 0));
        if (!disasterKinds.has('drought') && prng.next() < droughtChance) {
            const severity = 0.22 + prng.next() * 0.38;
            disasters.push(buildDisaster('drought', severity, prng.nextInt(3, 9)));
            events.push({
                id: eventId('disaster', write.year, events.length),
                year: write.year,
                kind: 'disaster',
                title: `${DISASTER_LABELS.drought} in ${tile.name}`,
                detail: `${tile.name} enters a multi-year dry spell that cuts water and agricultural potential.`,
                tileId: tile.id,
            });
            disasterKinds.add('drought');
        }
        const floodChance = disasterMultiplier * (0.0005 +
            (tile.terrain === 'river_valley' ? 0.0022 : 0) +
            (tile.terrain === 'coast' ? 0.0014 : 0) +
            (tile.water >= 4 ? 0.0014 : 0));
        if (!disasterKinds.has('flood') && prng.next() < floodChance) {
            const severity = 0.2 + prng.next() * 0.32;
            disasters.push(buildDisaster('flood', severity, prng.nextInt(2, 6)));
            events.push({
                id: eventId('disaster', write.year, events.length),
                year: write.year,
                kind: 'disaster',
                title: `${DISASTER_LABELS.flood} in ${tile.name}`,
                detail: `${tile.name} suffers flooding that damages food systems and displaces settlements.`,
                tileId: tile.id,
            });
            disasterKinds.add('flood');
        }
        const wildfireChance = disasterMultiplier * (0.0004 +
            ((tile.terrain === 'forest' || tile.terrain === 'savanna') ? 0.002 : 0) +
            (tile.temperature > 22 ? 0.001 : 0) +
            (tile.water < 3.6 ? 0.0012 : 0));
        if (!disasterKinds.has('wildfire') && prng.next() < wildfireChance) {
            const severity = 0.18 + prng.next() * 0.34;
            disasters.push(buildDisaster('wildfire', severity, prng.nextInt(2, 5)));
            events.push({
                id: eventId('disaster', write.year, events.length),
                year: write.year,
                kind: 'disaster',
                title: `${DISASTER_LABELS.wildfire} in ${tile.name}`,
                detail: `${tile.name} burns through forage and woodland cover under hot, dry conditions.`,
                tileId: tile.id,
            });
            disasterKinds.add('wildfire');
        }
        const winterChance = disasterMultiplier * (0.0004 +
            (tile.temperature < 6 ? 0.0024 : 0) +
            ((tile.climate === 'Dfc' || tile.climate === 'Dwa' || tile.climate === 'ET') ? 0.0016 : 0));
        if (!disasterKinds.has('severe-winter') && prng.next() < winterChance) {
            const severity = 0.18 + prng.next() * 0.34;
            disasters.push(buildDisaster('severe-winter', severity, prng.nextInt(2, 5)));
            events.push({
                id: eventId('disaster', write.year, events.length),
                year: write.year,
                kind: 'disaster',
                title: `${DISASTER_LABELS['severe-winter']} in ${tile.name}`,
                detail: `${tile.name} enters a cold shock that depresses hunting returns and local comfort.`,
                tileId: tile.id,
            });
            disasterKinds.add('severe-winter');
        }
        if (!disasterKinds.has('earthquake') && tile.isTectonic && prng.next() < disasterMultiplier * 0.0019) {
            const severity = 0.22 + prng.next() * 0.34;
            disasters.push(buildDisaster('earthquake', severity, prng.nextInt(1, 3)));
            events.push({
                id: eventId('disaster', write.year, events.length),
                year: write.year,
                kind: 'disaster',
                title: `${DISASTER_LABELS.earthquake} in ${tile.name}`,
                detail: `${tile.name} experiences tectonic disruption that damages settlement stability.`,
                tileId: tile.id,
            });
            disasterKinds.add('earthquake');
        }
        if (!disasterKinds.has('eruption') && tile.isVolcanic && prng.next() < disasterMultiplier * 0.001) {
            const severity = 0.3 + prng.next() * 0.4;
            disasters.push(buildDisaster('eruption', severity, prng.nextInt(2, 6)));
            events.push({
                id: eventId('disaster', write.year, events.length),
                year: write.year,
                kind: 'disaster',
                title: `${DISASTER_LABELS.eruption} in ${tile.name}`,
                detail: `${tile.name} is hit by volcanic fallout that sharply lowers regional carrying capacity.`,
                tileId: tile.id,
            });
            disasterKinds.add('eruption');
        }
        const plagues = previous.activePlagues
            .filter((plague) => plague.remainingYears > 1)
            .map((plague) => ({ ...plague, remainingYears: plague.remainingYears - 1 }));
        const plagueKinds = new Set(plagues.map((plague) => plague.kind));
        const density = totalPopulation / Math.max(getFoodCapacity(tile), 1);
        const settlement = safeAverage(residentTribes.map((tribe) => tribe.development.sedentism));
        const tradeIntensity = safeAverage(residentTribes.map((tribe) => tribe.exchange.tradeVolume));
        const neighborPlaguePressure = safeAverage(previous.neighbors
            .map((neighborId) => previousTiles.get(neighborId))
            .filter((neighbor) => Boolean(neighbor))
            .map((neighbor) => sumPlagueSeverity(neighbor)));
        const localOutbreakChance = disasterMultiplier *
            (0.00018 +
                Math.max(0, density - 0.48) * 0.0038 +
                settlement * 0.0018 +
                tradeIntensity * 0.0014 +
                (disasterKinds.has('flood') || disasterKinds.has('drought') ? 0.0014 : 0));
        const spreadChance = neighborPlaguePressure > 0 && totalPopulation > 0
            ? clamp(neighborPlaguePressure *
                (0.022 + tradeIntensity * 0.05 + settlement * 0.04 + Math.max(0, density - 0.6) * 0.02), 0, 0.24)
            : 0;
        if (prng.next() < localOutbreakChance + spreadChance) {
            let kind = 'zoonotic';
            if ((disasterKinds.has('flood') || tile.terrain === 'river_valley' || tile.terrain === 'coast') && tile.water >= 4) {
                kind = 'waterborne';
            }
            else if (settlement > 0.35 || tradeIntensity > 0.12 || density > 0.8) {
                kind = 'respiratory';
            }
            if (!plagueKinds.has(kind)) {
                const severity = 0.18 + prng.next() * 0.3 + Math.max(0, density - 0.55) * 0.12 + settlement * 0.04;
                plagues.push(buildPlague(kind, severity, prng.nextInt(4, 9)));
                events.push({
                    id: eventId('disease', write.year, events.length),
                    year: write.year,
                    kind: 'disease',
                    title: `${PLAGUE_LABELS[kind]} in ${tile.name}`,
                    detail: `${tile.name} develops a disease pulse amplified by density, exchange, and ecological stress.`,
                    tileId: tile.id,
                });
            }
        }
        tile.activeDisasters = disasters.sort((left, right) => left.kind.localeCompare(right.kind));
        tile.activePlagues = plagues.sort((left, right) => left.kind.localeCompare(right.kind));
        for (const disaster of tile.activeDisasters) {
            switch (disaster.kind) {
                case 'drought':
                    tile.carryingCapacity.hunt *= 1 - disaster.severity * 0.18;
                    tile.carryingCapacity.agri *= 1 - disaster.severity * 0.32;
                    tile.carryingCapacity.water *= 1 - disaster.severity * 0.38;
                    tile.comfort -= disaster.severity * 0.65;
                    tile.temperature += disaster.severity * 0.55;
                    break;
                case 'flood':
                    tile.carryingCapacity.hunt *= 1 - disaster.severity * 0.12;
                    tile.carryingCapacity.agri *= 1 - disaster.severity * 0.2;
                    tile.comfort -= disaster.severity * 0.58;
                    break;
                case 'wildfire':
                    tile.carryingCapacity.hunt *= 1 - disaster.severity * 0.24;
                    tile.carryingCapacity.agri *= 1 - disaster.severity * 0.08;
                    tile.comfort -= disaster.severity * 0.52;
                    break;
                case 'severe-winter':
                    tile.carryingCapacity.hunt *= 1 - disaster.severity * 0.18;
                    tile.carryingCapacity.agri *= 1 - disaster.severity * 0.26;
                    tile.carryingCapacity.water *= 1 - disaster.severity * 0.08;
                    tile.comfort -= disaster.severity * 0.54;
                    tile.temperature -= disaster.severity * 1.5;
                    break;
                case 'earthquake':
                    tile.carryingCapacity.hunt *= 1 - disaster.severity * 0.12;
                    tile.carryingCapacity.agri *= 1 - disaster.severity * 0.12;
                    tile.carryingCapacity.water *= 1 - disaster.severity * 0.08;
                    tile.comfort -= disaster.severity * 0.68;
                    break;
                case 'eruption':
                    tile.carryingCapacity.hunt *= 1 - disaster.severity * 0.34;
                    tile.carryingCapacity.agri *= 1 - disaster.severity * 0.3;
                    tile.carryingCapacity.water *= 1 - disaster.severity * 0.22;
                    tile.comfort -= disaster.severity * 1.04;
                    tile.temperature -= disaster.severity * 2.2;
                    break;
                case 'supervolcano':
                    tile.carryingCapacity.hunt *= 1 - disaster.severity * 0.55;
                    tile.carryingCapacity.agri *= 1 - disaster.severity * 0.5;
                    tile.carryingCapacity.water *= 1 - disaster.severity * 0.3;
                    tile.comfort -= disaster.severity * 1.6;
                    tile.temperature -= disaster.severity * 3.5;
                    break;
                case 'megadrought':
                    tile.carryingCapacity.hunt *= 1 - disaster.severity * 0.22;
                    tile.carryingCapacity.agri *= 1 - disaster.severity * 0.45;
                    tile.carryingCapacity.water *= 1 - disaster.severity * 0.55;
                    tile.comfort -= disaster.severity * 0.9;
                    tile.temperature += disaster.severity * 0.8;
                    break;
            }
        }
        for (const plague of tile.activePlagues) {
            tile.comfort -= plague.severity * 0.16;
        }
        tile.temperature = round(tile.temperature, 2);
        tile.carryingCapacity.hunt = round(clamp(tile.carryingCapacity.hunt, previous.baseCarryingCapacity.hunt > 0 ? previous.baseCarryingCapacity.hunt * 0.12 : 0, previous.baseCarryingCapacity.hunt), 2);
        tile.carryingCapacity.agri = round(clamp(tile.carryingCapacity.agri, previous.baseCarryingCapacity.agri > 0 ? previous.baseCarryingCapacity.agri * 0.18 : 0, previous.baseCarryingCapacity.agri), 2);
        tile.carryingCapacity.water = round(clamp(tile.carryingCapacity.water, previous.baseCarryingCapacity.water > 0 ? previous.baseCarryingCapacity.water * 0.4 : 0, previous.baseCarryingCapacity.water), 2);
        tile.comfort = round(clamp(tile.comfort, 0.15, 6), 2);
        if (previous.temperature !== tile.temperature ||
            previous.comfort !== tile.comfort ||
            previous.carryingCapacity.hunt !== tile.carryingCapacity.hunt ||
            previous.carryingCapacity.agri !== tile.carryingCapacity.agri ||
            previous.carryingCapacity.water !== tile.carryingCapacity.water ||
            !hazardsEqual(previous.activeDisasters, tile.activeDisasters) ||
            !hazardsEqual(previous.activePlagues, tile.activePlagues)) {
            changedTileIds.add(tile.id);
        }
    }
}
function computeTribeResourceContext(tribe, tile, tilePopulation) {
    const safeTilePopulation = Math.max(tilePopulation, tribe.pop, 1);
    const share = clamp(tribe.pop / safeTilePopulation, 0.06, 1);
    const stageProfile = getStageProfile(tribe.development.agricultureStage);
    const leaderModifiers = getLeaderModifiers(tribe.leader);
    const mobility = mobilityProfile(tribe);
    const disasterBurden = sumDisasterSeverity(tile);
    const plagueBurden = sumPlagueSeverity(tile) * stageProfile.plagueVulnerability;
    const tradeSupport = tribe.exchange.tradeVolume * 22 * leaderModifiers.trade;
    const diffusionSupport = tribe.exchange.diffusion * 8 * leaderModifiers.innovation;
    const foragePenalty = 1 - clamp(disasterBurden * 0.22 + plagueBurden * 0.08 + Math.max(0, 0.32 - tribe.foodStores) * 0.06, 0, 0.62);
    const farmPenalty = 1 - clamp(disasterBurden * 0.26 + plagueBurden * 0.07 + Math.max(0, 0.28 - tribe.foodStores) * 0.05, 0, 0.66);
    const huntDensity = safeTilePopulation / Math.max(tile.carryingCapacity.hunt, tribe.pop, 1);
    const foodCapacity = getFoodCapacity(tile);
    const foodDensity = tilePopulation / Math.max(foodCapacity, 1);
    const crowdingThreshold = 0.5 + stageProfile.targetSedentism * 0.18 + tribe.alliances.length * 0.012;
    const crowdingForagePenalty = 1 - clamp(Math.max(0, huntDensity - (0.56 + stageProfile.targetSedentism * 0.12)) * (0.46 + mobility * 0.62), 0, 0.9);
    const crowdingFarmPenalty = 1 - clamp(Math.max(0, foodDensity - (0.84 + stageProfile.targetSedentism * 0.1)) * (0.16 + stageProfile.targetSedentism * 0.26), 0, 0.5);
    const effectiveMegafauna = tile.megafaunaIndex < 0.1 ? 0 : tile.megafaunaIndex;
    const megafaunaBonus = 1 + effectiveMegafauna * 0.5;
    const effectiveForaging = round(tile.carryingCapacity.hunt *
        megafaunaBonus *
        share *
        (0.4 + tribe.abilities.foraging.current / 55) *
        stageProfile.foragingMultiplier *
        leaderModifiers.foraging *
        foragePenalty *
        crowdingForagePenalty, 2);
    const effectiveFarming = round(tile.carryingCapacity.agri *
        share *
        (tribe.abilities.agriculture.current / 70) *
        stageProfile.agriMultiplier *
        leaderModifiers.agriculture *
        (0.82 + tribe.development.domestication / 140) *
        farmPenalty *
        crowdingFarmPenalty, 2);
    const effectiveFood = round(effectiveForaging + effectiveFarming + tradeSupport + diffusionSupport, 2);
    const effectiveStoredFood = round(tribe.foodStores *
        tribe.pop *
        clamp(0.12 +
            stageProfile.targetSedentism * 0.18 +
            tribe.abilities.organization.current / 340 +
            (leaderModifiers.disasterResilience - 1) * 0.22, 0.08, 0.34), 2);
    const effectiveFoodWithStores = round(effectiveFood + effectiveStoredFood, 2);
    const supportedByWater = round((((tile.carryingCapacity.water *
        share *
        (0.66 +
            tribe.abilities.waterEngineering.current / 145 +
            stageProfile.targetSedentism * 0.08)) /
        0.55) *
        leaderModifiers.disasterResilience), 2);
    const resourceCollapse = round(foodCapacityCollapse(tile), 3);
    const megafaunaDecline = round(clamp(1 - tile.megafaunaIndex, 0, 1.2), 3);
    const geneticRisk = round(clamp(1 - tribe.geneticDiversity, 0, 1.2), 4);
    const defeatVulnerability = round(clamp(tribe.exchange.raidExposure * 0.44 +
        tribe.exchange.warExhaustion * 0.38 +
        Math.max(0, 0.35 - tribe.foodStores) * 0.45, 0, 1.2), 3);
    const heat = clamp((tile.temperature - (18 + tribe.abilities.heatTolerance.current * 0.22)) / 16, 0, 1);
    const cold = clamp(((10 - tribe.abilities.coldTolerance.current * 0.28) - tile.temperature) / 16, 0, 1);
    const food = clamp(1 - effectiveFoodWithStores / Math.max(tribe.pop, 1), 0, 1);
    const water = clamp(1 - supportedByWater / Math.max(tribe.pop, 1), 0, 1);
    const competition = clamp((foodDensity - crowdingThreshold) *
        (1.32 + mobility * 1.02 + (stageProfile.targetSedentism < 0.22 ? 0.24 : 0.08)) +
        resourceCollapse * 0.22 +
        Math.max(0, tilePopulation / Math.max(tile.baseCarryingCapacity.hunt + tile.baseCarryingCapacity.agri, 1) - 0.88) * 0.22, 0, 1);
    const organization = clamp(tribe.pop /
        (150 + stageProfile.organizationBonus * 4 + (tribe.leader?.authority ?? 0.55) * 60) -
        tribe.abilities.organization.current / 100 +
        geneticRisk * 0.08, 0, 1);
    const health = clamp(plagueBurden * 0.78 +
        disasterBurden * 0.18 +
        stageProfile.plagueVulnerability * 0.1 +
        tribe.exchange.raidExposure * 0.26 +
        tribe.exchange.warExhaustion * 0.24 +
        geneticRisk * 0.22 +
        defeatVulnerability * 0.16 +
        Math.max(0, foodDensity - 0.82) * 0.2 +
        Math.max(0, 0.24 - tribe.foodStores) * 0.18 -
        tribe.abilities.waterEngineering.current / 210 -
        (leaderModifiers.plagueResilience - 1) * 0.22, 0, 1);
    const techBonuses = getTechAbilityBonuses(tribe.knownTechnologies);
    const techCarryBonus = (techBonuses.organization + techBonuses.agriculture + techBonuses.waterEngineering) * 0.6;
    const carryingCapacity = round(clamp(Math.min(effectiveFoodWithStores, supportedByWater + effectiveStoredFood * 0.16) +
        tile.habitability * 12 +
        tile.water * 10 +
        tile.comfort * 1.6 +
        (tile.terrain === 'highland' ? (1 - stageProfile.targetSedentism) * 9 : 0) +
        tribe.abilities.organization.current * 0.95 +
        stageProfile.organizationBonus * 2.8 +
        tradeSupport * 3.2 +
        techCarryBonus -
        plagueBurden * 18 -
        disasterBurden * 8 -
        tribe.exchange.warExhaustion * 9 -
        competition * 14 -
        resourceCollapse * 12 -
        geneticRisk * 6.5, MIN_TRIBE_POPULATION * 2, MAX_TRIBE_POPULATION), 2);
    const total = round(safeAverage([food, heat, cold, water, competition, organization, health]), 3);
    return {
        effectiveForaging,
        effectiveFarming,
        effectiveFood,
        effectiveStoredFood,
        effectiveFoodWithStores,
        supportedByWater,
        carryingCapacity,
        disasterBurden: round(disasterBurden),
        plagueBurden: round(plagueBurden),
        resourceCollapse,
        megafaunaDecline,
        geneticRisk,
        defeatVulnerability,
        pressures: {
            food: round(food),
            heat: round(heat),
            cold: round(cold),
            water: round(water),
            competition: round(competition),
            organization: round(organization),
            health: round(health),
            total,
        },
    };
}
function pickAbility(tribe, prng) {
    const priorities = [
        { ability: 'foraging', weight: tribe.pressures.food * 1.2 },
        {
            ability: 'agriculture',
            weight: tribe.pressures.food * 0.75 +
                tribe.pressures.organization * 0.18 +
                tribe.development.domestication / 160 +
                tribe.exchange.diffusion * 0.5,
        },
        { ability: 'heatTolerance', weight: tribe.pressures.heat },
        { ability: 'coldTolerance', weight: tribe.pressures.cold },
        {
            ability: 'waterEngineering',
            weight: tribe.pressures.water + tribe.pressures.health * 0.3,
        },
        {
            ability: 'attack',
            weight: tribe.pressures.competition +
                tribe.exchange.raidExposure * 0.45 +
                tribe.exchange.warExhaustion * 0.2,
        },
        {
            ability: 'organization',
            weight: tribe.pressures.organization +
                tribe.pressures.competition * 0.2 +
                tribe.pressures.health * 0.18,
        },
    ];
    const totalWeight = priorities.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) {
        return 'foraging';
    }
    let cursor = prng.next() * totalWeight;
    for (const entry of priorities) {
        cursor -= entry.weight;
        if (cursor <= 0) {
            return entry.ability;
        }
    }
    return priorities[priorities.length - 1].ability;
}
function updateLeaderState(source, target, prng, events, year, growthSignal, disasterBurden) {
    if (!target.leader) {
        target.leader = createSuccessorLeader(target, prng);
        return;
    }
    const nextLeader = { ...target.leader };
    nextLeader.age += 1;
    nextLeader.tenure += 1;
    const legitimacyDelta = growthSignal * 0.85 +
        target.exchange.tradeVolume * 0.08 +
        target.exchange.diffusion * 0.05 +
        (stageRank(target.development.agricultureStage) - stageRank(source.development.agricultureStage)) * 0.05 -
        target.pressures.total * 0.08 -
        target.pressures.health * 0.05 -
        target.exchange.warExhaustion * 0.09 -
        target.exchange.raidExposure * 0.05 -
        disasterBurden * 0.04;
    nextLeader.legitimacy = round(clamp(nextLeader.legitimacy + legitimacyDelta, 0.16, 1), 3);
    nextLeader.authority = round(clamp(nextLeader.authority + legitimacyDelta * 0.55 - Math.max(0, nextLeader.age - 58) * 0.0015, 0.25, 1), 3);
    const successionChance = clamp(Math.max(0, nextLeader.age - 56) * 0.008 +
        Math.max(0, 0.22 - nextLeader.legitimacy) * 0.35 +
        target.exchange.warExhaustion * 0.08 +
        target.pressures.health * 0.05, 0, 0.35);
    if (prng.next() < successionChance) {
        const previousLeader = nextLeader;
        target.leader = createSuccessorLeader(target, prng);
        events.push({
            id: eventId('system', year, events.length),
            year,
            kind: 'system',
            title: `${target.name} changed leadership`,
            detail: `${previousLeader.name} gave way to ${target.leader.name}, shifting the tribe toward ${target.leader.archetype.toLowerCase()} leadership.`,
            tribeId: target.id,
            tileId: target.tileId,
        });
        return;
    }
    target.leader = nextLeader;
}
function applyTribePhase(read, write, config, prng, events, changedTribeIds, changedTileIds, populationCarry, decisionPolicy) {
    const readTileMap = tilesById(read);
    const readTribeMap = tribesById(read);
    const writeTribeMap = tribesById(write);
    const writeTileMap = tilesById(write);
    const occupancy = occupancyByTile(read);
    const tileLoads = new Map();
    const orderedIds = shuffleIds(read.tribes.map((tribe) => tribe.id), prng);
    for (const tribeId of orderedIds) {
        const source = readTribeMap.get(tribeId);
        const target = writeTribeMap.get(tribeId);
        const tile = readTileMap.get(source.tileId);
        const previousPop = target.pop;
        const previousStage = source.development.agricultureStage;
        const leaderModifiers = getLeaderModifiers(source.leader);
        const mobility = mobilityProfile(source);
        target.statusFlags.migrating = false;
        target.statusFlags.recovering = false;
        target.migration.homeTileId = source.migration.homeTileId || source.tileId;
        target.migration.cooldownYears = Math.max(0, source.migration.cooldownYears - 1);
        if (!source.migration.destinationTileId) {
            target.migration.destinationTileId = null;
            target.migration.plannedRouteTileIds = [];
            target.migration.commitmentYears = 0;
        }
        const resourceContext = computeTribeResourceContext(source, tile, occupancy.get(source.tileId) ?? source.pop);
        const existingTileLoad = tileLoads.get(source.tileId) ?? { foraging: 0, farming: 0, mobility: 0, crowding: 0 };
        existingTileLoad.foraging += resourceContext.effectiveForaging;
        existingTileLoad.farming += resourceContext.effectiveFarming;
        existingTileLoad.mobility += mobility * source.pop / 180;
        existingTileLoad.crowding += clamp(source.pop / Math.max(tile.baseCarryingCapacity.hunt + tile.baseCarryingCapacity.agri, 1), 0, 4) * mobility;
        tileLoads.set(source.tileId, existingTileLoad);
        target.pressures = resourceContext.pressures;
        // --- Tech tree: discovery ---
        const discoverableTechs = getDiscoverableTechs(target.knownTechnologies);
        const eraInnovation = innovationEraFactor(write.year);
        const memoryAndSurplus = 0.24 +
            source.exchange.diffusion * 0.48 +
            source.exchange.tradeVolume * 0.22 +
            Math.max(0, source.foodStores - 0.14) * 0.34 +
            Math.max(0, 1 - target.pressures.health) * 0.1;
        const discoveryBase = config.globals.G_innovation *
            eraInnovation *
            clamp(Math.log10(Math.max(source.pop, 10)) / 3.1, 0.08, 0.82) *
            clamp(0.22 +
                target.pressures.total * 0.52 +
                target.pressures.food * 0.18 +
                target.pressures.organization * 0.16 +
                resourceContext.megafaunaDecline * 0.08, 0.1, 1.05) *
            clamp(memoryAndSurplus, 0.16, 1.2) *
            leaderModifiers.innovation;
        let didDiscover = false;
        if (discoverableTechs.length > 0 && prng.next() < discoveryBase) {
            const weights = discoverableTechs.map((techId) => {
                const tech = TECH_TREE[techId];
                const complexity = technologyComplexity(techId);
                let weight = tech.discoveryWeight / complexity;
                if (tech.category === 'subsistence' && target.pressures.food > 0.2)
                    weight *= 1.35;
                if (tech.category === 'military' && target.pressures.competition > 0.25)
                    weight *= 1.22;
                if (tech.category === 'knowledge' && target.pressures.organization > 0.15)
                    weight *= 1.16;
                if (tech.category === 'knowledge' && source.exchange.diffusion < 0.04)
                    weight *= 0.6;
                if (tech.category === 'craft' && source.foodStores < 0.18)
                    weight *= 0.72;
                if (write.year < 6000 && tech.populationRequirement > 45)
                    weight *= 0.35;
                if (write.year < 12000 && tech.populationRequirement > 70)
                    weight *= 0.25;
                if (write.year < 20000 && tech.populationRequirement > 90)
                    weight *= 0.18;
                if (source.pop < tech.populationRequirement * 0.9)
                    weight *= 0.12;
                return { techId, weight };
            });
            const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
            let cursor = prng.next() * totalWeight;
            let chosenTech = weights[0].techId;
            for (const w of weights) {
                cursor -= w.weight;
                if (cursor <= 0) {
                    chosenTech = w.techId;
                    break;
                }
            }
            target.knownTechnologies = [...target.knownTechnologies, chosenTech];
            const tech = TECH_TREE[chosenTech];
            for (const [ability, bonus] of Object.entries(tech.effects)) {
                const a = ability;
                target.abilities[a].cap = clamp(target.abilities[a].cap + bonus, 0, 100);
                target.abilities[a].current = clamp(target.abilities[a].current + bonus, 0, 100);
            }
            didDiscover = true;
            target.statusFlags.highlighted = true;
            events.push({
                id: eventId('innovation', write.year, events.length),
                year: write.year,
                kind: 'innovation',
                title: `${target.name} discovered ${tech.name}`,
                detail: `${target.name} developed ${tech.name} (${tech.category}) under ${round(target.pressures.total * 100, 0)} pressure index.`,
                tribeId: target.id,
                tileId: target.tileId,
            });
        }
        // --- Tech tree: regression (can lose techs if conditions are bad) ---
        if (!didDiscover && target.knownTechnologies.length > 0) {
            for (const techId of [...target.knownTechnologies]) {
                const tech = TECH_TREE[techId];
                if (!tech)
                    continue;
                if (tech.prerequisites.length === 0 &&
                    source.pop > 30 &&
                    resourceContext.disasterBurden + resourceContext.plagueBurden + source.exchange.warExhaustion < 1.25) {
                    continue;
                }
                let regressionRisk = tech.regressionChance;
                if (source.pop < tech.populationRequirement * 0.6)
                    regressionRisk *= 3;
                else if (source.pop < tech.populationRequirement)
                    regressionRisk *= 1.5;
                regressionRisk += resourceContext.disasterBurden * 0.002;
                regressionRisk += resourceContext.plagueBurden * 0.0025;
                regressionRisk += source.exchange.warExhaustion * 0.0014;
                regressionRisk += Math.max(0, 0.22 - source.foodStores) * 0.01;
                if (tech.category === 'knowledge' && source.exchange.diffusion < 0.04)
                    regressionRisk *= 1.4;
                if (prng.next() < regressionRisk) {
                    const dependents = target.knownTechnologies.filter((tid) => TECH_TREE[tid]?.prerequisites.includes(techId));
                    if (dependents.length === 0) {
                        target.knownTechnologies = target.knownTechnologies.filter((t) => t !== techId);
                        for (const [ability, bonus] of Object.entries(tech.effects)) {
                            const a = ability;
                            target.abilities[a].cap = clamp(target.abilities[a].cap - bonus, 0, 100);
                            target.abilities[a].current = clamp(target.abilities[a].current - bonus, 0, 100);
                        }
                        events.push({
                            id: eventId('innovation', write.year, events.length),
                            year: write.year,
                            kind: 'innovation',
                            title: `${target.name} lost ${tech.name}`,
                            detail: `${target.name} could no longer sustain ${tech.name} knowledge under declining conditions.`,
                            tribeId: target.id,
                            tileId: target.tileId,
                        });
                        break;
                    }
                }
            }
            target.statusFlags.highlighted = false;
        }
        else if (!didDiscover) {
            target.statusFlags.highlighted = false;
        }
        for (const ability of Object.keys(target.abilities)) {
            const abilityState = target.abilities[ability];
            abilityState.current = round(clamp(abilityState.current + (abilityState.cap - abilityState.current) * 0.05, 0, 100), 2);
        }
        const agriSuitability = tile.baseCarryingCapacity.agri /
            Math.max(tile.baseCarryingCapacity.agri + tile.baseCarryingCapacity.hunt, 1);
        const storytellerPressure = storytellerCrisisSignal(write.storyteller);
        const intensifyFeatures = buildIntensifyFeatures({
            totalPressure: target.pressures.total,
            foodPressure: target.pressures.food,
            waterPressure: target.pressures.water,
            healthPressure: target.pressures.health,
            risk: clamp((resourceContext.disasterBurden +
                resourceContext.plagueBurden +
                source.exchange.raidExposure * 0.7 +
                source.exchange.warExhaustion * 0.5) / 1.6, 0, 1.2),
            sedentism: source.development.sedentism,
            stage: source.development.agricultureStage,
            agriSuitability: clamp(agriSuitability * 1.6, 0, 1.2),
            ruggedness: terrainRuggedness(tile.terrain),
            aridity: terrainAridity(tile.terrain),
            diffusion: source.exchange.diffusion,
            exchangePotential: clamp((source.exchange.tradeVolume + source.exchange.diffusion) / 2, 0, 1.2),
            organization: clamp(target.abilities.organization.current / 100, 0, 1.2),
            resourceCollapse: resourceContext.resourceCollapse,
            storedFood: clamp(source.foodStores, 0, 1.2),
            geneticRisk: resourceContext.geneticRisk,
            megafaunaDecline: resourceContext.megafaunaDecline,
            storytellerCrisis: storytellerPressure,
            defeatVulnerability: resourceContext.defeatVulnerability,
        });
        const intensifyAdjustment = decisionAdjustment(decisionPolicy, 'intensify', intensifyFeatures, 0.22);
        const progressDelta = (agriSuitability * 0.48 +
            (tile.terrain === 'river_valley' ? 0.08 : tile.terrain === 'coast' ? 0.03 : 0) +
            target.abilities.agriculture.current / 300 +
            target.abilities.waterEngineering.current / 560 +
            target.abilities.organization.current / 680 +
            source.exchange.tradeVolume * 0.08 +
            source.exchange.diffusion * 0.12 +
            (leaderModifiers.agriculture - 1) * 0.42 +
            Math.max(0, target.pressures.food - 0.12) * 0.28 +
            Math.max(0, target.pressures.competition - 0.2) * 0.1 +
            resourceContext.resourceCollapse * 0.14 +
            resourceContext.megafaunaDecline * 0.18 +
            storytellerPressure * 0.06 +
            resourceContext.geneticRisk * 0.05 -
            resourceContext.effectiveStoredFood / Math.max(source.pop, 1) * 0.3 -
            resourceContext.disasterBurden * 0.48 -
            target.pressures.health * 0.24 -
            source.exchange.raidExposure * 0.35 -
            source.exchange.warExhaustion * 0.18 -
            mobility * 0.08 -
            (source.statusFlags.migrating ? 0.2 : 0) -
            (tile.terrain === 'desert' || tile.terrain === 'mountain' ? 0.12 : tile.terrain === 'highland' ? 0.02 : 0)) *
            0.0008 *
            intensifyAdjustment *
            agricultureEraFactor(write.year);
        target.development.domestication = round(clamp(source.development.domestication + progressDelta, 0, domesticationEraCeiling(write.year)), 2);
        target.development.agricultureStage = resolveAgricultureStage(target.development.domestication, tile);
        target.development.sedentism = round(clamp(source.development.sedentism +
            (getStageProfile(target.development.agricultureStage).targetSedentism -
                source.development.sedentism) *
                0.16 -
            source.exchange.raidExposure * 0.04, 0.02, 0.94), 3);
        if (target.development.agricultureStage !== previousStage) {
            events.push({
                id: eventId('system', write.year, events.length),
                year: write.year,
                kind: 'system',
                title: `${target.name} shifted subsistence`,
                detail: `${target.name} moved from ${previousStage} to ${target.development.agricultureStage}.`,
                tribeId: target.id,
                tileId: target.tileId,
            });
        }
        const stageProfile = getStageProfile(target.development.agricultureStage);
        const carryingCapacity = resourceContext.carryingCapacity;
        const rawFoodBalance = resourceContext.effectiveFood / Math.max(source.pop, 1) - 1.0;
        const foodMultiplier = clamp(1 - target.pressures.food * 0.84 + source.exchange.tradeVolume * 0.05, 0.1, 1.08);
        const comfortMultiplier = clamp(1 - (target.pressures.heat + target.pressures.cold) * 0.32 - target.pressures.health * 0.14, 0.45, 1.06);
        const orgMultiplier = 1 +
            (target.abilities.organization.current + stageProfile.organizationBonus) / 320 +
            (leaderModifiers.cohesion - 1) * 0.06;
        const fertilityBoost = 1 + stageProfile.birthBonus + source.exchange.tradeVolume * 0.03;
        // --- Inbreeding penalty from genetic diversity loss ---
        // Ne = effective population (~65% of census for hunter-gatherers)
        // Inbreeding penalty scales with accumulated homozygosity
        // Penalty is moderate: at F=0.5 (severe inbreeding), penalty ~0.009 per year
        const Ne = source.pop * 0.65;
        const inbreedingCoeff = 1 - source.geneticDiversity;
        const inbreedingPenalty = GENETIC_LETHAL_EQUIVALENTS * inbreedingCoeff * 0.0034;
        const techHealthBonus = getTechHealthBonus(target.knownTechnologies);
        const recoveryUpside = Math.max(0, rawFoodBalance) * 0.002 +
            Math.max(0, 0.34 - target.pressures.total) * 0.0015 +
            Math.max(0, source.foodStores - 0.22) * 0.001 +
            Math.max(0, source.exchange.tradeVolume - 0.1) * 0.0005;
        const rBase = clamp(config.globals.G_birth *
            foodMultiplier *
            comfortMultiplier *
            orgMultiplier *
            fertilityBoost -
            config.globals.G_death +
            techHealthBonus * 0.22 +
            recoveryUpside -
            inbreedingPenalty -
            target.pressures.health * 0.016 -
            resourceContext.disasterBurden * 0.011 -
            resourceContext.plagueBurden * 0.015 -
            resourceContext.resourceCollapse * 0.01 -
            Math.max(0, 0.22 - source.foodStores) * 0.011, -0.09, 0.012);
        const alleeMultiplier = source.pop <= 0 ? 0 : Math.max(-1, (source.pop - ALLEE_THRESHOLD) / source.pop);
        const logisticMultiplier = clamp(1 - source.pop / Math.max(carryingCapacity, 1), -0.4, 1);
        const growthFactor = rBase * logisticMultiplier * alleeMultiplier;
        // --- Food stores buffer: reduces starvation death during bad years ---
        const techStorageBonus = getTechFoodStorageBonus(target.knownTechnologies);
        const foodStoresBuffer = clamp((resourceContext.effectiveStoredFood / Math.max(source.pop, 1)) + techStorageBonus, 0, 0.5);
        const starvationDamper = target.pressures.food > 0.35 && foodStoresBuffer > 0
            ? clamp(1 - foodStoresBuffer * 1.2, 0.25, 1)
            : 1;
        // --- Extra pressure deaths (only severe conditions, buffered by stores) ---
        const pressureDeathRate = clamp(Math.max(0, target.pressures.food - 0.42) * 0.03 +
            Math.max(0, target.pressures.water - 0.46) * 0.034 +
            Math.max(0, target.pressures.health - 0.26) * 0.024 +
            Math.max(0, target.pressures.competition - 0.4) * 0.014 +
            Math.max(0, -rawFoodBalance) * 0.034 +
            resourceContext.plagueBurden * 0.016 +
            resourceContext.disasterBurden * 0.009 +
            source.exchange.raidExposure * 0.018 +
            source.exchange.warExhaustion * 0.015 +
            resourceContext.geneticRisk * 0.0075, 0, 0.072) * starvationDamper;
        const previousCarry = populationCarry.get(target.id) ?? 0;
        const netExact = source.pop * (growthFactor - pressureDeathRate)
            + previousCarry;
        const netWhole = netExact >= 0 ? Math.floor(netExact) : Math.ceil(netExact);
        populationCarry.set(target.id, clamp(netExact - netWhole, -POPULATION_CARRY_LIMIT, POPULATION_CARRY_LIMIT));
        target.pop = clamp(source.pop + netWhole, 0, MAX_TRIBE_POPULATION);
        target.statusFlags.recovering = target.pop > source.pop;
        // --- Update food stores ---
        const storageCap = clamp(0.18 +
            stageProfile.targetSedentism * 0.62 +
            techStorageBonus * 1.7 +
            target.abilities.organization.current / 600, 0.22, 0.92);
        const storesAccumRate = stageProfile.targetSedentism > 0.3 ? 0.08 : 0.035;
        const storesGain = Math.max(0, rawFoodBalance) *
            storesAccumRate *
            (0.74 + target.abilities.organization.current / 240) *
            clamp(storageCap - source.foodStores + 0.12, 0.12, 1);
        const storesDraw = Math.max(0, -rawFoodBalance) *
            (0.36 +
                mobility * 0.14 +
                resourceContext.disasterBurden * 0.16 +
                resourceContext.plagueBurden * 0.08 +
                target.pressures.food * 0.14) +
            source.exchange.raidExposure * 0.032 +
            source.exchange.warExhaustion * 0.026;
        target.foodStores = round(clamp(source.foodStores + storesGain - storesDraw, 0, storageCap), 3);
        // --- Update genetic diversity (Wright's inbreeding coefficient) ---
        // Drift accelerates in tiny isolated bands and slows with durable exchange/alliance contact.
        const generationLength = 25;
        const contactBuffer = clamp(source.alliances.length * 0.09 + source.exchange.tradeVolume * 0.24 + source.exchange.diffusion * 0.16, 0, 0.62);
        const isolationFactor = clamp(1.0 - contactBuffer + Math.max(0, 55 - source.pop) / 260, 0.22, 1.12);
        const nextF = inbreedingCoeff +
            ((1 - inbreedingCoeff) / Math.max(2 * Ne * generationLength, 2)) * isolationFactor;
        const diversityExchangeBoost = clamp(contactBuffer * 0.018 + (source.pop >= 70 ? 0.003 : 0), 0, 0.02);
        target.geneticDiversity = round(clamp(1 - nextF + diversityExchangeBoost, 0, 1), 4);
        // --- Storyteller recovery boost ---
        const recoveryMod = write.storyteller.recoveryMultiplier;
        target.exchange = {
            tradeVolume: round(clamp(source.exchange.tradeVolume * (0.93 + recoveryMod * 0.01), 0, 1.5), 3),
            diffusion: round(clamp(source.exchange.diffusion * (0.91 + recoveryMod * 0.01), 0, 1.5), 3),
            raidExposure: round(clamp(source.exchange.raidExposure * 0.7, 0, 1.5), 3),
            warExhaustion: round(clamp(source.exchange.warExhaustion * 0.74, 0, 1.5), 3),
        };
        const growthSignal = (target.pop - source.pop) / Math.max(source.pop, 1);
        updateLeaderState(source, target, prng, events, write.year, growthSignal, resourceContext.disasterBurden);
        if (target.pop !== previousPop ||
            target.pressures.total !== source.pressures.total ||
            target.development.agricultureStage !== source.development.agricultureStage) {
            changedTribeIds.add(target.id);
        }
    }
    for (const [tileId, load] of tileLoads) {
        const tile = readTileMap.get(tileId);
        const writeTile = writeTileMap.get(tileId);
        if (!tile || !writeTile) {
            continue;
        }
        const huntPressure = load.foraging / Math.max(tile.carryingCapacity.hunt, 1);
        const agriPressure = load.farming / Math.max(tile.carryingCapacity.agri, 1);
        const huntDepletion = load.foraging * (0.002 + load.mobility * 0.0001) +
            Math.max(0, huntPressure - 0.85) * tile.carryingCapacity.hunt * (0.006 + load.crowding * 0.001);
        const agriDepletion = load.farming * 0.0015 + Math.max(0, agriPressure - 1.1) * tile.carryingCapacity.agri * 0.004;
        writeTile.carryingCapacity.hunt = round(clamp(writeTile.carryingCapacity.hunt - huntDepletion, tile.baseCarryingCapacity.hunt > 0 ? tile.baseCarryingCapacity.hunt * 0.18 : 0, tile.baseCarryingCapacity.hunt), 2);
        writeTile.carryingCapacity.agri = round(clamp(writeTile.carryingCapacity.agri - agriDepletion, tile.baseCarryingCapacity.agri > 0 ? tile.baseCarryingCapacity.agri * 0.25 : 0, tile.baseCarryingCapacity.agri), 2);
        // Megafauna depletion: human hunting + climate stress synergy
        // Megafauna don't recover once below 0.1 (irreversible extinction)
        if (writeTile.megafaunaIndex > 0) {
            const climateStressForMega = clamp(Math.abs(write.globalClimate.meanTemperature - TARGET_BASELINE_TEMPERATURE) / 10, 0, 0.5);
            const humanHuntPressure = clamp(huntPressure, 0, 2);
            const megaDepletion = humanHuntPressure * 0.003 +
                climateStressForMega * 0.001 +
                humanHuntPressure * climateStressForMega * 0.004;
            const nextMegafauna = clamp(writeTile.megafaunaIndex - megaDepletion, 0, 1);
            writeTile.megafaunaIndex = round(nextMegafauna < 0.1 ? 0 : nextMegafauna, 3);
            if (writeTile.megafaunaIndex !== tile.megafaunaIndex) {
                changedTileIds.add(tileId);
            }
        }
    }
}
function applyDiffusion(receiver, source, amount, favoredAbility) {
    const candidates = (favoredAbility
        ? [favoredAbility]
        : ['agriculture', 'waterEngineering', 'organization', 'foraging', 'coldTolerance', 'heatTolerance']).filter((ability) => source.abilities[ability].current > receiver.abilities[ability].current + 2);
    const ability = candidates[0];
    if (!ability) {
        return;
    }
    const gain = round(clamp(amount, 0.2, 1.6), 2);
    receiver.abilities[ability].current = clamp(receiver.abilities[ability].current + gain, 0, 100);
    receiver.abilities[ability].cap = clamp(receiver.abilities[ability].cap + gain * 0.45, 0, 100);
    receiver.exchange.diffusion = round(clamp(receiver.exchange.diffusion + gain / 6, 0, 1.5), 3);
}
function applyInteractionPhase(read, write, config, prng, events, changedTribeIds, decisionPolicy) {
    const readTileMap = tilesById(read);
    const readTribeMap = tribesById(read);
    const writeTribeMap = tribesById(write);
    const tileToTribes = new Map();
    for (const tribe of read.tribes) {
        const list = tileToTribes.get(tribe.tileId);
        if (list)
            list.push(tribe);
        else
            tileToTribes.set(tribe.tileId, [tribe]);
    }
    const pairs = [];
    for (const [tileId, tribes] of tileToTribes) {
        const sorted = [...tribes].sort((left, right) => left.id.localeCompare(right.id));
        for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
                pairs.push({ leftId: sorted[leftIndex].id, rightId: sorted[rightIndex].id, sharedTile: true });
            }
        }
        const tile = readTileMap.get(tileId);
        if (!tile) {
            continue;
        }
        for (const neighborId of tile.neighbors.filter((neighborId) => tileId < neighborId)) {
            const neighbors = [...(tileToTribes.get(neighborId) ?? [])].sort((left, right) => left.id.localeCompare(right.id));
            for (const left of sorted) {
                for (const right of neighbors) {
                    pairs.push({ leftId: left.id, rightId: right.id, sharedTile: false });
                }
            }
        }
    }
    const exposure = new Map();
    const warnedTiles = new Set();
    const storytellerPressure = storytellerCrisisSignal(read.storyteller);
    for (const pair of pairs) {
        const readLeft = readTribeMap.get(pair.leftId);
        const readRight = readTribeMap.get(pair.rightId);
        const left = writeTribeMap.get(pair.leftId);
        const right = writeTribeMap.get(pair.rightId);
        if (!readLeft || !readRight || !left || !right || left.pop <= 0 || right.pop <= 0) {
            continue;
        }
        const relationBefore = (getRelationship(left, right.id) + getRelationship(right, left.id)) / 2;
        const alliedBefore = hasAlliance(left, right.id) || hasAlliance(right, left.id);
        const leftLeader = getLeaderModifiers(left.leader);
        const rightLeader = getLeaderModifiers(right.leader);
        const pairMobility = safeAverage([mobilityProfile(readLeft), mobilityProfile(readRight)]);
        const pairCompetition = safeAverage([readLeft.pressures.competition, readRight.pressures.competition]);
        const pairHealth = safeAverage([readLeft.pressures.health, readRight.pressures.health]);
        const surplusLeft = clamp(1.08 - readLeft.pressures.food - readLeft.pressures.water * 0.4, 0, 1);
        const surplusRight = clamp(1.08 - readRight.pressures.food - readRight.pressures.water * 0.4, 0, 1);
        const needLeft = clamp(readLeft.pressures.food * 0.8 + readLeft.pressures.water * 0.46 + readLeft.pressures.organization * 0.12, 0, 1.2);
        const needRight = clamp(readRight.pressures.food * 0.8 + readRight.pressures.water * 0.46 + readRight.pressures.organization * 0.12, 0, 1.2);
        const complementarity = Math.abs(readLeft.abilities.agriculture.current - readRight.abilities.agriculture.current) / 110 +
            Math.abs(readLeft.abilities.waterEngineering.current - readRight.abilities.waterEngineering.current) / 150 +
            Math.abs(stageRank(readLeft.development.agricultureStage) - stageRank(readRight.development.agricultureStage)) * 0.08;
        const contactFactor = pair.sharedTile ? 1 : 0.76;
        const trustFactor = clamp(0.42 + Math.max(relationBefore, 0), 0.16, 1.45);
        const allianceFactor = alliedBefore ? 1.25 : 1;
        const tradeFeatures = buildTradeFeatures({
            foodPressure: clamp((readLeft.pressures.food + readRight.pressures.food) / 2, 0, 1.2),
            waterPressure: clamp((readLeft.pressures.water + readRight.pressures.water) / 2, 0, 1.2),
            competition: clamp(pairCompetition, 0, 1.2),
            healthPressure: clamp(pairHealth, 0, 1.2),
            risk: clamp((readLeft.exchange.warExhaustion + readRight.exchange.warExhaustion) / 2, 0, 1.2),
            sedentism: safeAverage([readLeft.development.sedentism, readRight.development.sedentism]),
            stage: readLeft.development.agricultureStage,
            relation: clamp((relationBefore + 1) / 2, 0, 1.2),
            complementarity: clamp(complementarity, 0, 1.2),
            exchangePotential: clamp((surplusLeft * needRight + surplusRight * needLeft) * (0.72 + complementarity) * contactFactor, 0, 1.2),
            alliedPresence: alliedBefore ? 1 : 0,
            hostility: clamp(Math.max(0, -relationBefore) + pairCompetition * 0.2, 0, 1.2),
            resourceCollapse: safeAverage([foodCapacityCollapse(readTileMap.get(readLeft.tileId)), foodCapacityCollapse(readTileMap.get(readRight.tileId))]),
            storedFood: safeAverage([readLeft.foodStores, readRight.foodStores]),
            geneticRisk: safeAverage([1 - readLeft.geneticDiversity, 1 - readRight.geneticDiversity]),
            megafaunaDecline: safeAverage([1 - readTileMap.get(readLeft.tileId).megafaunaIndex, 1 - readTileMap.get(readRight.tileId).megafaunaIndex]),
            storytellerCrisis: storytellerPressure,
            defeatVulnerability: safeAverage([
                readLeft.exchange.raidExposure * 0.5 + readLeft.exchange.warExhaustion * 0.36 + Math.max(0, 0.35 - readLeft.foodStores) * 0.4,
                readRight.exchange.raidExposure * 0.5 + readRight.exchange.warExhaustion * 0.36 + Math.max(0, 0.35 - readRight.foodStores) * 0.4,
            ]),
        });
        const tradeAdjustment = decisionAdjustment(decisionPolicy, 'trade', tradeFeatures, 0.28);
        const flowToLeft = clamp(surplusRight * needLeft * (0.45 + complementarity) * contactFactor * trustFactor * allianceFactor * rightLeader.trade * tradeAdjustment, 0, 1.5) * 16;
        const flowToRight = clamp(surplusLeft * needRight * (0.45 + complementarity) * contactFactor * trustFactor * allianceFactor * leftLeader.trade * tradeAdjustment, 0, 1.5) * 16;
        const totalFlow = round(flowToLeft + flowToRight, 2);
        if (relationBefore > -0.02 && totalFlow > 0.55) {
            left.exchange.tradeVolume = round(clamp(left.exchange.tradeVolume + flowToLeft / 20, 0, 1.5), 3);
            right.exchange.tradeVolume = round(clamp(right.exchange.tradeVolume + flowToRight / 20, 0, 1.5), 3);
            applyDiffusion(left, right, totalFlow / 15);
            applyDiffusion(right, left, totalFlow / 15);
            // Genetic rescue through durable exchange and alliance contact.
            if (totalFlow > 1.1 || alliedBefore || (pair.sharedTile && relationBefore > 0.22)) {
                const rescueRate = alliedBefore ? 0.04 : totalFlow > 3 ? 0.03 : pair.sharedTile ? 0.018 : 0.014;
                const leftBefore = left.geneticDiversity;
                const rightBefore = right.geneticDiversity;
                left.geneticDiversity = round(clamp(leftBefore + (rightBefore - leftBefore) * rescueRate, 0, 1), 4);
                right.geneticDiversity = round(clamp(rightBefore + (leftBefore - rightBefore) * rescueRate, 0, 1), 4);
            }
            const domesticationTransfer = (totalFlow / 20) *
                agricultureEraFactor(write.year) *
                clamp(0.65 + relationBefore, 0.3, 1.4);
            if (stageRank(readRight.development.agricultureStage) > stageRank(readLeft.development.agricultureStage) && relationBefore > 0.08) {
                left.development.domestication = round(clamp(left.development.domestication + domesticationTransfer, 0, domesticationEraCeiling(write.year)), 2);
            }
            if (stageRank(readLeft.development.agricultureStage) > stageRank(readRight.development.agricultureStage) && relationBefore > 0.08) {
                right.development.domestication = round(clamp(right.development.domestication + domesticationTransfer, 0, domesticationEraCeiling(write.year)), 2);
            }
            // --- Tech spread via trade ---
            if (totalFlow > 4.6 && relationBefore > 0.08) {
                const spreadChance = clamp(totalFlow *
                    0.0012 *
                    innovationEraFactor(write.year) *
                    (alliedBefore ? 1.18 : pair.sharedTile ? 0.94 : 0.72) *
                    clamp(0.42 +
                        relationBefore +
                        safeAverage([readLeft.exchange.diffusion, readRight.exchange.diffusion]) * 0.4, 0.18, 1.2), 0, 0.018);
                for (const techId of readRight.knownTechnologies) {
                    if (!left.knownTechnologies.includes(techId) && hasAllPrerequisites(left.knownTechnologies, techId)) {
                        const spreadResistance = technologyRegionalism(techId) * technologyComplexity(techId);
                        if (prng.next() < (spreadChance * TECH_TREE[techId].spreadWeight) / spreadResistance) {
                            left.knownTechnologies = [...left.knownTechnologies, techId];
                            const tech = TECH_TREE[techId];
                            for (const [ability, bonus] of Object.entries(tech.effects)) {
                                const a = ability;
                                left.abilities[a].cap = clamp(left.abilities[a].cap + bonus, 0, 100);
                                left.abilities[a].current = clamp(left.abilities[a].current + bonus, 0, 100);
                            }
                            events.push({
                                id: eventId('innovation', write.year, events.length),
                                year: write.year,
                                kind: 'innovation',
                                title: `${left.name} adopted ${tech.name}`,
                                detail: `${left.name} learned ${tech.name} through trade with ${right.name}.`,
                                tribeId: left.id,
                                tileId: left.tileId,
                            });
                            break;
                        }
                    }
                }
                for (const techId of readLeft.knownTechnologies) {
                    if (!right.knownTechnologies.includes(techId) && hasAllPrerequisites(right.knownTechnologies, techId)) {
                        const spreadResistance = technologyRegionalism(techId) * technologyComplexity(techId);
                        if (prng.next() < (spreadChance * TECH_TREE[techId].spreadWeight) / spreadResistance) {
                            right.knownTechnologies = [...right.knownTechnologies, techId];
                            const tech = TECH_TREE[techId];
                            for (const [ability, bonus] of Object.entries(tech.effects)) {
                                const a = ability;
                                right.abilities[a].cap = clamp(right.abilities[a].cap + bonus, 0, 100);
                                right.abilities[a].current = clamp(right.abilities[a].current + bonus, 0, 100);
                            }
                            events.push({
                                id: eventId('innovation', write.year, events.length),
                                year: write.year,
                                kind: 'innovation',
                                title: `${right.name} adopted ${tech.name}`,
                                detail: `${right.name} learned ${tech.name} through trade with ${left.name}.`,
                                tribeId: right.id,
                                tileId: right.tileId,
                            });
                            break;
                        }
                    }
                }
            }
            changedTribeIds.add(left.id);
            changedTribeIds.add(right.id);
            if (totalFlow > 6.2 && (alliedBefore || prng.next() < 0.1 * tradeAdjustment)) {
                events.push({
                    id: eventId('trade', write.year, events.length),
                    year: write.year,
                    kind: 'trade',
                    title: `${left.name} and ${right.name} exchanged goods`,
                    detail: `${left.name} and ${right.name} reinforced an exchange loop across ${pair.sharedTile ? 'one shared tile' : 'neighboring tiles'}.`,
                    tribeId: left.id,
                    tileId: left.tileId,
                });
            }
        }
        let relation = relationBefore;
        relation += readLeft.ancestryId === readRight.ancestryId ? 0.03 : 0;
        relation += alliedBefore ? 0.02 : 0;
        relation += totalFlow * 0.016;
        relation += (leftLeader.diplomacy + rightLeader.diplomacy - 2) * 0.05;
        relation -= pair.sharedTile ? pairCompetition * (0.08 + pairMobility * 0.04) : 0;
        relation -= config.globals.G_hostility * 0.03;
        relation -= Math.abs(readLeft.pop - readRight.pop) / Math.max(readLeft.pop + readRight.pop, 1) * 0.025;
        setRelationship(writeTribeMap, left.id, right.id, relation);
        const alliedNow = hasAlliance(left, right.id) || hasAlliance(right, left.id);
        const relationAfter = (getRelationship(left, right.id) + getRelationship(right, left.id)) / 2;
        const allianceFeatures = buildAllianceFeatures({
            competition: clamp(pairCompetition, 0, 1.2),
            healthPressure: clamp(pairHealth, 0, 1.2),
            risk: clamp((readLeft.exchange.warExhaustion + readRight.exchange.warExhaustion) / 2, 0, 1.2),
            sedentism: safeAverage([readLeft.development.sedentism, readRight.development.sedentism]),
            stage: readLeft.development.agricultureStage,
            relation: clamp((relationAfter + 1) / 2, 0, 1.2),
            complementarity: clamp(complementarity, 0, 1.2),
            exchangePotential: clamp(totalFlow / 16, 0, 1.2),
            alliedPresence: alliedBefore ? 1 : 0,
            hostility: clamp(Math.max(0, -relationAfter) + pairCompetition * 0.22, 0, 1.2),
            resourceCollapse: safeAverage([foodCapacityCollapse(readTileMap.get(readLeft.tileId)), foodCapacityCollapse(readTileMap.get(readRight.tileId))]),
            storedFood: safeAverage([readLeft.foodStores, readRight.foodStores]),
            geneticRisk: safeAverage([1 - readLeft.geneticDiversity, 1 - readRight.geneticDiversity]),
            megafaunaDecline: safeAverage([1 - readTileMap.get(readLeft.tileId).megafaunaIndex, 1 - readTileMap.get(readRight.tileId).megafaunaIndex]),
            storytellerCrisis: storytellerPressure,
            defeatVulnerability: safeAverage([
                readLeft.exchange.raidExposure * 0.5 + readLeft.exchange.warExhaustion * 0.36 + Math.max(0, 0.35 - readLeft.foodStores) * 0.4,
                readRight.exchange.raidExposure * 0.5 + readRight.exchange.warExhaustion * 0.36 + Math.max(0, 0.35 - readRight.foodStores) * 0.4,
            ]),
        });
        const allianceAdjustment = decisionAdjustment(decisionPolicy, 'ally', allianceFeatures, 0.34);
        if (!alliedNow &&
            relationAfter > 0.48 &&
            totalFlow > 2.2 &&
            pairCompetition < 0.62 &&
            prng.next() <
                0.024 *
                    (leftLeader.diplomacy + rightLeader.diplomacy) *
                    (1 + safeAverage([1 - readLeft.geneticDiversity, 1 - readRight.geneticDiversity]) * 0.7) *
                    allianceAdjustment) {
            addAlliance(writeTribeMap, left.id, right.id);
            setRelationship(writeTribeMap, left.id, right.id, relationAfter + 0.1);
            changedTribeIds.add(left.id);
            changedTribeIds.add(right.id);
            events.push({
                id: eventId('diplomacy', write.year, events.length),
                year: write.year,
                kind: 'diplomacy',
                title: `${left.name} and ${right.name} allied`,
                detail: `${left.name} and ${right.name} formalized cooperation through exchange, trust, and shared pressure.`,
                tribeId: left.id,
                tileId: left.tileId,
            });
        }
        if (alliedNow &&
            ((relationAfter < 0.12 && prng.next() < 0.24) || relationAfter < -0.04)) {
            removeAlliance(writeTribeMap, left.id, right.id);
            changedTribeIds.add(left.id);
            changedTribeIds.add(right.id);
            events.push({
                id: eventId('diplomacy', write.year, events.length),
                year: write.year,
                kind: 'diplomacy',
                title: `${left.name} and ${right.name} broke alliance`,
                detail: `${left.name} and ${right.name} failed to sustain trust under rising pressure.`,
                tribeId: left.id,
                tileId: left.tileId,
            });
        }
        const exposureScale = 1 - Math.max(exposure.get(left.id) ?? 0, exposure.get(right.id) ?? 0) * 0.62;
        const fragilityBrake = clamp(Math.min(readLeft.pop, readRight.pop) / 110, 0.22, 1) *
            clamp(safeAverage([readLeft.geneticDiversity, readRight.geneticDiversity]) + 0.15, 0.35, 1.1);
        const scarcityTension = (readLeft.pressures.food + readRight.pressures.food) * 0.09 +
            (readLeft.pressures.water + readRight.pressures.water) * 0.035 +
            (Math.max(0, 0.32 - readLeft.foodStores) + Math.max(0, 0.32 - readRight.foodStores)) * 0.08;
        const hostility = config.globals.G_hostility * 0.18 +
            pairCompetition * (0.12 + pairMobility * 0.04) +
            scarcityTension +
            storytellerPressure * 0.05 +
            Math.max(0, -relationAfter) * 0.3 +
            (readLeft.abilities.attack.current + readRight.abilities.attack.current) / 380 -
            totalFlow * 0.1 -
            (readLeft.exchange.tradeVolume + readRight.exchange.tradeVolume) * 0.04 -
            (hasAlliance(left, right.id) || hasAlliance(right, left.id) ? 0.75 : 0);
        const fatigueLeft = readLeft.exchange.raidExposure * 0.1 + readLeft.exchange.warExhaustion * 0.12;
        const fatigueRight = readRight.exchange.raidExposure * 0.1 + readRight.exchange.warExhaustion * 0.12;
        const aggressionLeft = readLeft.pressures.food * 0.24 +
            readLeft.pressures.competition * (0.2 + mobilityProfile(readLeft) * 0.05) +
            Math.max(0, 0.26 - readLeft.foodStores) * 0.14 +
            (1 - readLeft.geneticDiversity) * 0.03 +
            readLeft.abilities.attack.current / 260 +
            leftLeader.raidBias * 0.55 -
            readLeft.exchange.tradeVolume * 0.08 -
            fatigueLeft -
            (readLeft.leader?.legitimacy ?? 0.55) * 0.08;
        const aggressionRight = readRight.pressures.food * 0.24 +
            readRight.pressures.competition * (0.2 + mobilityProfile(readRight) * 0.05) +
            Math.max(0, 0.26 - readRight.foodStores) * 0.14 +
            (1 - readRight.geneticDiversity) * 0.03 +
            readRight.abilities.attack.current / 260 +
            rightLeader.raidBias * 0.55 -
            readRight.exchange.tradeVolume * 0.08 -
            fatigueRight -
            (readRight.leader?.legitimacy ?? 0.55) * 0.08;
        if (!(hasAlliance(left, right.id) || hasAlliance(right, left.id))) {
            const leftTile = readTileMap.get(left.tileId);
            const rightTile = readTileMap.get(right.tileId);
            const leftStrength = militaryStrength(left, leftTile, leftLeader, alliedSupportCount(left.id, writeTribeMap, readTileMap));
            const rightStrength = militaryStrength(right, rightTile, rightLeader, alliedSupportCount(right.id, writeTribeMap, readTileMap));
            const raidFeatures = buildRaidFeatures({
                foodPressure: clamp(Math.max(readLeft.pressures.food, readRight.pressures.food), 0, 1.2),
                competition: clamp(Math.max(readLeft.pressures.competition, readRight.pressures.competition), 0, 1.2),
                healthPressure: clamp(Math.max(readLeft.pressures.health, readRight.pressures.health), 0, 1.2),
                risk: clamp(Math.max(readLeft.exchange.warExhaustion, readRight.exchange.warExhaustion), 0, 1.2),
                sedentism: Math.min(readLeft.development.sedentism, readRight.development.sedentism),
                stage: readLeft.development.agricultureStage,
                hostility: clamp(hostility, 0, 1.2),
                relation: clamp((relationAfter + 1) / 2, 0, 1.2),
                strengthEdge: clamp(Math.abs(leftStrength - rightStrength) / Math.max(leftStrength + rightStrength, 1) * 2, 0, 1.2),
                exchangePotential: clamp((totalFlow / 14) + safeAverage([left.development.domestication, right.development.domestication]) / 120, 0, 1.2),
                frontier: pair.sharedTile ? 0 : 1,
                ruggedness: Math.max(terrainRuggedness(leftTile.terrain), terrainRuggedness(rightTile.terrain)),
                aridity: Math.max(terrainAridity(leftTile.terrain), terrainAridity(rightTile.terrain)),
                resourceCollapse: safeAverage([foodCapacityCollapse(leftTile), foodCapacityCollapse(rightTile)]),
                storedFood: Math.min(readLeft.foodStores, readRight.foodStores),
                geneticRisk: Math.max(1 - readLeft.geneticDiversity, 1 - readRight.geneticDiversity),
                megafaunaDecline: safeAverage([1 - leftTile.megafaunaIndex, 1 - rightTile.megafaunaIndex]),
                storytellerCrisis: storytellerPressure,
                defeatVulnerability: Math.max(readLeft.exchange.raidExposure * 0.5 + readLeft.exchange.warExhaustion * 0.36 + Math.max(0, 0.35 - readLeft.foodStores) * 0.4, readRight.exchange.raidExposure * 0.5 + readRight.exchange.warExhaustion * 0.36 + Math.max(0, 0.35 - readRight.foodStores) * 0.4),
            });
            const raidAdjustment = decisionAdjustment(decisionPolicy, 'raid', raidFeatures, 0.38);
            const raidPressure = hostility * 0.74 +
                Math.max(aggressionLeft, aggressionRight) * 0.62 +
                pairCompetition * 0.12 -
                totalFlow * 0.06 -
                Math.min(readLeft.foodStores, readRight.foodStores) * 0.1;
            const raidChance = clamp(Math.max(0, raidPressure - 0.42) * 0.028 * exposureScale * raidAdjustment * fragilityBrake, 0, 0.09);
            if (prng.next() < raidChance) {
                const attacker = aggressionLeft >= aggressionRight ? left : right;
                const defender = attacker.id === left.id ? right : left;
                const attackerTile = readTileMap.get(attacker.tileId);
                const defenderTile = readTileMap.get(defender.tileId);
                const attackerModifiers = getLeaderModifiers(attacker.leader);
                const defenderModifiers = getLeaderModifiers(defender.leader);
                const attackerStrength = militaryStrength(attacker, attackerTile, attackerModifiers, alliedSupportCount(attacker.id, writeTribeMap, readTileMap));
                const defenderStrength = militaryStrength(defender, defenderTile, defenderModifiers, alliedSupportCount(defender.id, writeTribeMap, readTileMap));
                const raidShare = clamp(attackerStrength / Math.max(attackerStrength + defenderStrength, 1), 0.24, 0.82);
                const attackerLoss = Math.min(Math.max(attacker.pop - 1, 0), Math.round(attacker.pop * (0.008 + (1 - raidShare) * 0.02) * exposureScale));
                const defenderLoss = Math.min(Math.max(defender.pop - 1, 0), Math.round(defender.pop * (0.016 + raidShare * 0.064) * exposureScale));
                const loot = clamp(defenderLoss * 0.36 + totalFlow * 0.38 + getStageProfile(defender.development.agricultureStage).targetSedentism * 8, 2, 28);
                attacker.pop = clamp(attacker.pop - attackerLoss, 0, MAX_TRIBE_POPULATION);
                defender.pop = clamp(defender.pop - defenderLoss, 0, MAX_TRIBE_POPULATION);
                attacker.exchange.tradeVolume = round(clamp(attacker.exchange.tradeVolume + loot / 18, 0, 1.5), 3);
                attacker.exchange.warExhaustion = round(clamp(attacker.exchange.warExhaustion + 0.08, 0, 1.5), 3);
                // Tech looting: attacker may capture defender's technology
                if (prng.next() < 0.018) {
                    const readDefender = readTribeMap.get(defender.id);
                    if (readDefender) {
                        for (const techId of readDefender.knownTechnologies) {
                            const tech = TECH_TREE[techId];
                            if (!tech) {
                                continue;
                            }
                            if (tech.category === 'knowledge' && prng.next() < 0.72) {
                                continue;
                            }
                            if (!attacker.knownTechnologies.includes(techId) && hasAllPrerequisites(attacker.knownTechnologies, techId)) {
                                attacker.knownTechnologies = [...attacker.knownTechnologies, techId];
                                for (const [ability, bonus] of Object.entries(tech.effects)) {
                                    const a = ability;
                                    attacker.abilities[a].cap = clamp(attacker.abilities[a].cap + bonus, 0, 100);
                                    attacker.abilities[a].current = clamp(attacker.abilities[a].current + bonus, 0, 100);
                                }
                                break;
                            }
                        }
                    }
                }
                applyDefeatShock(attacker, Math.max(attackerLoss / Math.max(attacker.pop + attackerLoss, 1), 0.05), false);
                applyDefeatShock(defender, Math.max(defenderLoss / Math.max(defender.pop + defenderLoss, 1), 0.12), true);
                setRelationship(writeTribeMap, attacker.id, defender.id, relationAfter - 0.24);
                exposure.set(attacker.id, (exposure.get(attacker.id) ?? 0) + 0.32);
                exposure.set(defender.id, (exposure.get(defender.id) ?? 0) + 0.34);
                changedTribeIds.add(attacker.id);
                changedTribeIds.add(defender.id);
                events.push({
                    id: eventId('combat', write.year, events.length),
                    year: write.year,
                    kind: 'combat',
                    title: `${attacker.name} raided ${defender.name}`,
                    detail: `${attacker.name} exploited scarcity and crowding to strip stores and people from ${defender.name}.`,
                    tribeId: attacker.id,
                    tileId: attacker.tileId,
                });
            }
            else if (pair.sharedTile) {
                const battlePressure = hostility +
                    Math.max(0, -relationAfter) * 0.24 +
                    pairCompetition * 0.12 -
                    totalFlow * 0.08 -
                    safeAverage([readLeft.foodStores, readRight.foodStores]) * 0.18;
                const battleChance = clamp(Math.max(0, battlePressure - 0.5) * 0.034 * exposureScale * (0.84 + pairMobility * 0.12) * fragilityBrake, 0, 0.08);
                if (prng.next() < battleChance) {
                    const intensity = clamp(0.018 + hostility * 0.026 + pairCompetition * 0.014, 0.02, 0.072);
                    const leftLoss = Math.min(Math.max(left.pop - 1, 0), Math.round(left.pop * intensity * rightStrength / Math.max(leftStrength + rightStrength, 1)));
                    const rightLoss = Math.min(Math.max(right.pop - 1, 0), Math.round(right.pop * intensity * leftStrength / Math.max(leftStrength + rightStrength, 1)));
                    left.pop = clamp(left.pop - leftLoss, 0, MAX_TRIBE_POPULATION);
                    right.pop = clamp(right.pop - rightLoss, 0, MAX_TRIBE_POPULATION);
                    applyDefeatShock(left, Math.max(leftLoss / Math.max(readLeft.pop, 1), 0.08), leftLoss > rightLoss);
                    applyDefeatShock(right, Math.max(rightLoss / Math.max(readRight.pop, 1), 0.08), rightLoss > leftLoss);
                    if (leftLoss < rightLoss) {
                        left.exchange.tradeVolume = round(clamp(left.exchange.tradeVolume + 0.08, 0, 1.5), 3);
                    }
                    if (rightLoss < leftLoss) {
                        right.exchange.tradeVolume = round(clamp(right.exchange.tradeVolume + 0.08, 0, 1.5), 3);
                    }
                    setRelationship(writeTribeMap, left.id, right.id, relationAfter - 0.32);
                    exposure.set(left.id, (exposure.get(left.id) ?? 0) + 0.56);
                    exposure.set(right.id, (exposure.get(right.id) ?? 0) + 0.56);
                    changedTribeIds.add(left.id);
                    changedTribeIds.add(right.id);
                    events.push({
                        id: eventId('combat', write.year, events.length),
                        year: write.year,
                        kind: 'combat',
                        title: `${left.name} and ${right.name} fought`,
                        detail: `${left.name} and ${right.name} escalated crowding and territorial strain into open combat.`,
                        tribeId: left.id,
                        tileId: left.tileId,
                    });
                }
            }
        }
        if (pair.sharedTile) {
            const pressure = pairCompetition;
            if (pressure > 0.28 && !warnedTiles.has(left.tileId)) {
                warnedTiles.add(left.tileId);
                events.push({
                    id: eventId('warning', write.year, events.length),
                    year: write.year,
                    kind: 'warning',
                    title: 'Crowding tension',
                    detail: `${left.name} and ${right.name} are sharing one tile under rising crowding pressure.`,
                    tileId: left.tileId,
                });
            }
        }
    }
}
function corridorAffinity(tile) {
    return clamp((tile.movementTags.includes('river-corridor') ? 0.34 : 0) +
        (tile.movementTags.includes('coastal-corridor') ? 0.22 : 0) +
        (tile.movementTags.includes('steppe-corridor') ? 0.18 : 0) +
        (tile.movementTags.includes('desert-pass') ? 0.12 : 0) +
        (tile.movementTags.includes('mountain-pass') ? 0.14 : 0) +
        (tile.movementTags.includes('land-bridge') ? 0.1 : 0), 0, 1.2);
}
function computeRegionalDensity(tileToTribes, tiles) {
    const regionalTribeCount = new Map();
    for (const [tileId, tribesOnTile] of tileToTribes) {
        const count = tribesOnTile.length;
        const tile = tiles.get(tileId);
        if (!tile)
            continue;
        regionalTribeCount.set(tileId, (regionalTribeCount.get(tileId) ?? 0) + count);
        for (const n1 of tile.neighbors) {
            regionalTribeCount.set(n1, (regionalTribeCount.get(n1) ?? 0) + count);
            const n1Tile = tiles.get(n1);
            if (n1Tile) {
                for (const n2 of n1Tile.neighbors) {
                    if (n2 !== tileId) {
                        regionalTribeCount.set(n2, (regionalTribeCount.get(n2) ?? 0) + count);
                    }
                }
            }
        }
    }
    return regionalTribeCount;
}
function applyMigrationPhase(read, write, config, prng, events, changedTribeIds, decisionPolicy) {
    const readTiles = tilesById(read);
    const readTribeMap = tribesById(read);
    const writeTribes = tribesById(write);
    const occupancy = occupancyByTile(read);
    const storytellerPressure = storytellerCrisisSignal(read.storyteller);
    const tileToTribes = new Map();
    for (const tribe of read.tribes) {
        const list = tileToTribes.get(tribe.tileId);
        if (list)
            list.push(tribe);
        else
            tileToTribes.set(tribe.tileId, [tribe]);
    }
    const regionalTribeCount = computeRegionalDensity(tileToTribes, readTiles);
    function tileTraversalCost(tile) {
        // Sea is impassable unless it's a strait
        if (tile.terrain === 'sea') {
            return tile.movementTags.includes('strait') ? 1.8 : Infinity;
        }
        let cost = 1;
        if (tile.terrain === 'river_valley') {
            cost = 0.34;
        }
        else if (tile.terrain === 'coast') {
            cost = 0.52;
        }
        else if (tile.terrain === 'plains' || tile.terrain === 'forest') {
            cost = 0.86;
        }
        else if (tile.terrain === 'savanna') {
            cost = 0.92;
        }
        else if (tile.terrain === 'steppe') {
            cost = 0.76;
        }
        else if (tile.terrain === 'highland') {
            cost = 1.08;
        }
        else if (tile.terrain === 'desert') {
            cost = 1.26;
        }
        else if (tile.terrain === 'mountain') {
            cost = 1.72;
        }
        cost -= corridorAffinity(tile) * 0.26;
        if (tile.movementTags.includes('desert-pass')) {
            cost -= 0.12;
        }
        if (tile.movementTags.includes('mountain-pass')) {
            cost -= 0.22;
        }
        return clamp(cost, 0.22, 2.1);
    }
    function gatherTilePaths(startId, maxSteps) {
        const heap = [];
        function heapPush(node) {
            heap.push(node);
            let i = heap.length - 1;
            while (i > 0) {
                const parent = (i - 1) >> 1;
                if (heap[parent].key <= node.key)
                    break;
                heap[i] = heap[parent];
                i = parent;
            }
            heap[i] = node;
        }
        function heapPop() {
            const top = heap[0];
            const last = heap.pop();
            if (heap.length > 0) {
                heap[0] = last;
                let i = 0;
                const len = heap.length;
                while (true) {
                    let smallest = i;
                    const l = 2 * i + 1;
                    const r = 2 * i + 2;
                    if (l < len && heap[l].key < heap[smallest].key)
                        smallest = l;
                    if (r < len && heap[r].key < heap[smallest].key)
                        smallest = r;
                    if (smallest === i)
                        break;
                    [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
                    i = smallest;
                }
            }
            return top;
        }
        const best = new Map([
            [startId, { cost: 0, steps: 0, previous: null }],
        ]);
        heapPush({ tileId: startId, cost: 0, steps: 0, key: 0 });
        while (heap.length) {
            const current = heapPop();
            const currentTile = readTiles.get(current.tileId);
            if (!currentTile || current.steps >= maxSteps) {
                continue;
            }
            for (const neighborId of currentTile.neighbors) {
                const neighbor = readTiles.get(neighborId);
                if (!neighbor) {
                    continue;
                }
                // Skip impassable sea tiles (straits are allowed)
                if (neighbor.terrain === 'sea' && !neighbor.movementTags.includes('strait')) {
                    continue;
                }
                const nextSteps = current.steps + 1;
                const nextCost = current.cost + tileTraversalCost(neighbor);
                const previous = best.get(neighborId);
                if (previous &&
                    (previous.cost < nextCost - 0.01 ||
                        (Math.abs(previous.cost - nextCost) <= 0.01 && previous.steps <= nextSteps))) {
                    continue;
                }
                best.set(neighborId, { cost: nextCost, steps: nextSteps, previous: current.tileId });
                heapPush({ tileId: neighborId, cost: nextCost, steps: nextSteps, key: nextCost + nextSteps * 0.04 });
            }
        }
        return best;
    }
    function recoverPath(startId, targetId, best) {
        const path = [];
        let currentId = targetId;
        while (currentId) {
            path.push(currentId);
            const node = best.get(currentId);
            currentId = node?.previous ?? null;
        }
        path.reverse();
        return path[0] === startId ? path : [];
    }
    function applyMovementCosts(target, nextTile, movingFar) {
        const corridorSupport = corridorAffinity(nextTile);
        const domesticationLoss = movingFar ? 2.2 : 1.05;
        const sedentismLoss = movingFar ? 0.92 : 0.965;
        target.development.domestication = round(clamp(target.development.domestication -
            target.development.sedentism * domesticationLoss -
            stageRank(target.development.agricultureStage) * (movingFar ? 0.24 : 0.08) +
            corridorSupport * 0.42, 0, 100), 2);
        target.development.sedentism = round(clamp(target.development.sedentism * sedentismLoss, 0.02, 0.94), 3);
        target.exchange.tradeVolume = round(clamp(target.exchange.tradeVolume * (movingFar ? 0.8 : 0.88) + corridorSupport * 0.04, 0, 1.5), 3);
        target.foodStores = round(clamp(target.foodStores * (movingFar ? 0.72 : 0.84) + corridorSupport * 0.03, 0, 1), 3);
    }
    function clearMigrationPlan(target, settle) {
        target.migration.destinationTileId = null;
        target.migration.plannedRouteTileIds = [];
        target.migration.commitmentYears = 0;
        if (settle) {
            target.migration.homeTileId = target.tileId;
            target.migration.cooldownYears = Math.max(target.migration.cooldownYears, 4 + Math.round(target.development.sedentism * 5) + Math.round(stageRank(target.development.agricultureStage) * 3));
        }
    }
    for (const tribe of read.tribes) {
        const target = writeTribes.get(tribe.id);
        const leaderModifiers = getLeaderModifiers(tribe.leader);
        const stageProfile = getStageProfile(tribe.development.agricultureStage);
        const currentTile = readTiles.get(tribe.tileId);
        const currentRisk = sumDisasterSeverity(currentTile) +
            sumPlagueSeverity(currentTile) +
            tribe.exchange.raidExposure * 0.78 +
            tribe.exchange.warExhaustion * 0.58;
        const defeatVulnerability = clamp(tribe.exchange.raidExposure * 0.52 +
            tribe.exchange.warExhaustion * 0.4 +
            Math.max(0, 0.42 - tribe.foodStores) * 0.38, 0, 1.2);
        const migrationPressure = Math.max(tribe.pressures.total, tribe.pressures.food * 1.24, tribe.pressures.water * 1.15, tribe.pressures.health * 1.05, tribe.pressures.competition * 1.22, currentRisk * 0.88, defeatVulnerability * 0.76);
        const mobility = mobilityProfile(tribe);
        const coastalForaging = tribe.development.agricultureStage === 'foraging' || tribe.development.agricultureStage === 'tending';
        // Regional density: how many tribes are within 2 hops (drives expansion pressure)
        const localDensity = regionalTribeCount.get(currentTile.id) ?? 0;
        const densityPush = clamp((localDensity - 4) / 12, 0, 1.0); // kicks in above 4 nearby tribes
        const frontierDrive = clamp(tribe.pressures.competition * 0.92 +
            tribe.pressures.food * 0.54 +
            mobility * 0.18 +
            storytellerPressure * 0.1 +
            densityPush * 0.6, 0, 1.6);
        const currentFood = getFoodCapacity(currentTile, coastalForaging);
        const currentCrowding = (occupancy.get(currentTile.id) ?? 0) / Math.max(currentFood, 1);
        const emergency = migrationPressure > 0.56 ||
            currentRisk > 0.46 ||
            tribe.pressures.competition > 0.44 ||
            tribe.pressures.food > 0.52;
        if (tribe.migration.destinationTileId && tribe.migration.plannedRouteTileIds.length) {
            const nextTileId = tribe.migration.plannedRouteTileIds[0];
            const nextTile = readTiles.get(nextTileId);
            if (nextTile && currentTile.neighbors.includes(nextTileId)) {
                target.tileId = nextTileId;
                target.statusFlags.migrating = true;
                target.migration.destinationTileId = tribe.migration.destinationTileId;
                target.migration.plannedRouteTileIds = tribe.migration.plannedRouteTileIds.slice(1);
                target.migration.commitmentYears = Math.max(0, tribe.migration.commitmentYears - 1);
                applyMovementCosts(target, nextTile, true);
                if (target.tileId === target.migration.destinationTileId ||
                    target.migration.plannedRouteTileIds.length === 0 ||
                    target.migration.commitmentYears === 0) {
                    clearMigrationPlan(target, true);
                }
                changedTribeIds.add(target.id);
                events.push({
                    id: eventId('migration', write.year, events.length),
                    year: write.year,
                    kind: 'migration',
                    title: tribe.name + ' continued migrating',
                    detail: tribe.name +
                        ' moved from ' +
                        currentTile.name +
                        ' to ' +
                        nextTile.name +
                        (tribe.migration.destinationTileId
                            ? ' while following a committed route toward ' +
                                (readTiles.get(tribe.migration.destinationTileId)?.name ?? 'a new settlement') +
                                '.'
                            : '.'),
                    tribeId: tribe.id,
                    tileId: nextTile.id,
                });
                continue;
            }
            clearMigrationPlan(target, false);
        }
        if (tribe.migration.cooldownYears > 0 && !emergency) {
            continue;
        }
        if (migrationPressure < 0.14 && frontierDrive < 0.16 && currentRisk < 0.16) {
            continue;
        }
        const evaluateCandidate = (candidate, steps, pathCost, policyKind) => {
            const neighborFood = getFoodCapacity(candidate, coastalForaging);
            const neighborCrowding = (occupancy.get(candidate.id) ?? 0) / Math.max(neighborFood, 1);
            const neighborRisk = sumDisasterSeverity(candidate) +
                sumPlagueSeverity(candidate) +
                tribe.exchange.raidExposure * 0.3 +
                tribe.exchange.warExhaustion * 0.24;
            const alliedPresence = alliedPresenceOnTile(tribe, candidate.id, readTribeMap);
            const hostilePresence = hostilePresenceOnTile(tribe, candidate.id, tileToTribes);
            const corridorSupport = corridorAffinity(candidate);
            // Density at destination (lower = more attractive for expansion)
            const destDensity = regionalTribeCount.get(candidate.id) ?? 0;
            const densityRelief = clamp((localDensity - destDensity) / 10, -0.5, 1.0);
            const features = buildMigrationFeatures({
                totalPressure: tribe.pressures.total,
                foodPressure: tribe.pressures.food,
                waterPressure: tribe.pressures.water,
                competition: tribe.pressures.competition,
                healthPressure: tribe.pressures.health,
                currentRisk: clamp(currentRisk / 1.6, 0, 1.2),
                sedentism: tribe.development.sedentism,
                stage: tribe.development.agricultureStage,
                resourceDelta: clamp((neighborFood - currentFood) / 260, -1.0, 1.0),
                waterDelta: clamp((candidate.water - currentTile.water) / 5.2, -1.2, 1.2),
                occupancyRelief: clamp((currentCrowding - neighborCrowding) / 1.45, -1.2, 1.2),
                riskRelief: clamp((currentRisk - neighborRisk) / 1.25, -1.2, 1.2),
                comfortDelta: clamp((candidate.comfort - currentTile.comfort) / 3.2, -1.2, 1.2),
                frontier: occupancy.has(candidate.id) ? 0 : 1,
                ruggedness: terrainRuggedness(candidate.terrain),
                aridity: terrainAridity(candidate.terrain),
                alliedPresence: clamp(alliedPresence / 2, 0, 1.2),
                hostilePresence: clamp(hostilePresence / 3, 0, 1.2),
                resourceCollapse: foodCapacityCollapse(candidate),
                storedFood: clamp(tribe.foodStores, 0, 1.2),
                geneticRisk: clamp(1 - tribe.geneticDiversity, 0, 1.2),
                megafaunaDecline: clamp(1 - currentTile.megafaunaIndex, 0, 1.2),
                storytellerCrisis: storytellerPressure,
                defeatVulnerability,
            });
            const policyBoost = decisionAdjustment(decisionPolicy, 'migrate', features, policyKind === 'relocation' ? 0.14 : 0.08);
            // Frontier bonus scales with regional density push — crowded homeland = stronger frontier pull
            const frontierBase = policyKind === 'relocation'
                ? 0.28 + mobility * 0.18 + densityPush * 0.42
                : 0.1 + mobility * 0.08 + densityPush * 0.22;
            let score = features.resourceDelta * 1.08 +
                features.waterDelta * 0.94 +
                features.occupancyRelief * (0.9 + mobility * 0.4) +
                features.riskRelief * 1.02 +
                features.comfortDelta * 0.12 +
                features.frontier * frontierBase +
                features.allySupport * 0.2 +
                corridorSupport * (policyKind === 'relocation' ? 0.38 + densityPush * 0.2 : 0.22 + densityPush * 0.12) +
                densityRelief * (0.18 + densityPush * 0.24) +
                (steps > 1 ? Math.min(steps / 6, 1) * 0.16 : 0) +
                features.geneticRisk * 0.14 +
                features.megafaunaDecline * (0.08 + mobility * 0.04) -
                features.storedFood * 0.18 -
                features.resourceCollapse * 0.24 -
                features.hostility * 0.3 -
                features.aridity * (candidate.movementTags.includes('desert-pass') ? 0.08 : 0.16 + tribe.pressures.water * 0.18) -
                features.ruggedness * (candidate.movementTags.includes('mountain-pass') ? 0.08 : 0.16 + tribe.development.sedentism * 0.08) -
                pathCost * (policyKind === 'relocation' ? 0.08 : 0.03);
            if (candidate.terrain === 'mountain' && !candidate.movementTags.includes('mountain-pass')) {
                score -= emergency ? 0.16 : 0.32;
            }
            if (candidate.terrain === 'desert' &&
                !candidate.movementTags.includes('desert-pass') &&
                !candidate.movementTags.includes('coastal-corridor')) {
                score -= emergency ? 0.08 : 0.18;
            }
            return {
                tile: candidate,
                features,
                score: score * policyBoost,
            };
        };
        let bestLocal = null;
        for (const neighborId of currentTile.neighbors) {
            const neighbor = readTiles.get(neighborId);
            if (!neighbor || neighbor.terrain === 'sea') {
                continue;
            }
            const candidate = evaluateCandidate(neighbor, 1, tileTraversalCost(neighbor), 'local');
            if (!bestLocal || candidate.score > bestLocal.score) {
                bestLocal = candidate;
            }
        }
        const strongRelocation = emergency ||
            tribe.leader?.archetype === 'Pathfinder' ||
            tribe.pressures.competition > 0.52 ||
            tribe.pop > TRIBE_SPLIT_THRESHOLD * 0.82;
        const pathBudget = strongRelocation ? 10 : 6;
        const pathMap = gatherTilePaths(currentTile.id, pathBudget);
        let bestRelocation = null;
        for (const [tileId, node] of pathMap) {
            if (tileId === currentTile.id || node.steps < 2 || node.steps > pathBudget) {
                continue;
            }
            if (node.steps > 6 && !strongRelocation) {
                continue;
            }
            const candidateTile = readTiles.get(tileId);
            if (!candidateTile || candidateTile.terrain === 'sea') {
                continue;
            }
            const path = recoverPath(currentTile.id, tileId, pathMap);
            if (path.length !== node.steps + 1) {
                continue;
            }
            const candidate = evaluateCandidate(candidateTile, node.steps, node.cost, 'relocation');
            const withPath = { ...candidate, path, steps: node.steps, pathCost: node.cost };
            if (!bestRelocation || withPath.score > bestRelocation.score) {
                bestRelocation = withPath;
            }
        }
        if (bestLocal) {
            const localThreshold = 0.22 + tribe.development.sedentism * 0.12 - mobility * 0.05 - densityPush * 0.08;
            const localChance = clamp(config.globals.G_migration *
                (0.08 +
                    migrationPressure * 0.18 +
                    currentRisk * 0.12 +
                    Math.max(bestLocal.score - localThreshold, 0) * 0.18) *
                leaderModifiers.migration *
                decisionAdjustment(decisionPolicy, 'migrate', bestLocal.features, 0.08) /
                (1 + stageProfile.migrationFriction * 1.3 + tribe.development.sedentism * 1.25), emergency ? 0.02 : 0.01, emergency ? 0.32 : 0.14);
            if (bestLocal.score > localThreshold && prng.next() < localChance) {
                target.tileId = bestLocal.tile.id;
                target.statusFlags.migrating = true;
                clearMigrationPlan(target, false);
                target.migration.homeTileId = bestLocal.tile.id;
                target.migration.cooldownYears = Math.max(target.migration.cooldownYears, 3 + Math.round(tribe.development.sedentism * 3) + Math.round(stageRank(tribe.development.agricultureStage) * 2));
                applyMovementCosts(target, bestLocal.tile, false);
                changedTribeIds.add(target.id);
                events.push({
                    id: eventId('migration', write.year, events.length),
                    year: write.year,
                    kind: 'migration',
                    title: tribe.name + ' shifted range',
                    detail: tribe.name +
                        ' shifted from ' +
                        currentTile.name +
                        ' to ' +
                        bestLocal.tile.name +
                        ' without fully abandoning its local range.',
                    tribeId: tribe.id,
                    tileId: bestLocal.tile.id,
                });
                continue;
            }
        }
        if (!bestRelocation) {
            continue;
        }
        const relocationThreshold = 0.34 + tribe.development.sedentism * 0.14 - mobility * 0.08 - densityPush * 0.12;
        const relocationChance = clamp(config.globals.G_migration *
            (0.04 +
                migrationPressure * 0.14 +
                frontierDrive * 0.12 +
                densityPush * 0.06 +
                Math.max(bestRelocation.score - relocationThreshold, 0) * 0.16 +
                (strongRelocation ? 0.05 : 0)) *
            leaderModifiers.migration *
            decisionAdjustment(decisionPolicy, 'migrate', bestRelocation.features, 0.12) /
            (1 + stageProfile.migrationFriction * 0.72 + tribe.development.sedentism * 0.6), emergency ? 0.02 : 0.01, emergency ? 0.3 : 0.14);
        if (bestRelocation.score <= relocationThreshold || prng.next() >= relocationChance) {
            continue;
        }
        const route = bestRelocation.path.slice(1);
        const firstStepId = route[0];
        const firstStep = firstStepId ? readTiles.get(firstStepId) : null;
        if (!firstStep) {
            continue;
        }
        target.tileId = firstStep.id;
        target.statusFlags.migrating = true;
        target.migration.destinationTileId = bestRelocation.tile.id;
        target.migration.plannedRouteTileIds = route.slice(1);
        target.migration.commitmentYears = route.length + 2;
        applyMovementCosts(target, firstStep, true);
        if (target.tileId === bestRelocation.tile.id || target.migration.plannedRouteTileIds.length === 0) {
            clearMigrationPlan(target, true);
        }
        changedTribeIds.add(target.id);
        events.push({
            id: eventId('migration', write.year, events.length),
            year: write.year,
            kind: 'migration',
            title: tribe.name + ' began a relocation',
            detail: tribe.name +
                ' left ' +
                currentTile.name +
                ' for ' +
                firstStep.name +
                ', committing to a longer move toward ' +
                bestRelocation.tile.name +
                '.',
            tribeId: tribe.id,
            tileId: firstStep.id,
        });
    }
}
function applyFissionPhase(read, write, config, prng, events, changedTribeIds, populationCarry) {
    const writeTribes = tribesById(write);
    const nextTribes = [...write.tribes];
    const tileMap = tilesById(write);
    const projectedOccupancy = occupancyByTile(write);
    const tileToTribes = new Map();
    for (const t of read.tribes) {
        const list = tileToTribes.get(t.tileId);
        if (list)
            list.push(t);
        else
            tileToTribes.set(t.tileId, [t]);
    }
    for (const source of read.tribes) {
        if (source.pop < TRIBE_SPLIT_THRESHOLD) {
            continue;
        }
        const target = writeTribes.get(source.id);
        if (!target) {
            continue;
        }
        const splitPressure = clamp((source.pop - TRIBE_SPLIT_THRESHOLD) / 480 +
            Math.max(0, source.pressures.competition - 0.18) * 0.56 +
            Math.max(0, source.pressures.organization - 0.22) * 0.18 +
            source.exchange.warExhaustion * 0.12 +
            source.exchange.raidExposure * 0.08 +
            (1 - config.globals.G_cohesion) * 0.8 -
            target.abilities.organization.current / 520 -
            getLeaderModifiers(target.leader).cohesion * 0.16 +
            target.alliances.length * 0.03 -
            target.development.sedentism * 0.1, 0, 0.72);
        if (splitPressure < 0.34 || prng.next() >= splitPressure) {
            continue;
        }
        const childPop = clamp(Math.floor(source.pop * (0.32 + prng.next() * 0.12)), MIN_TRIBE_POPULATION, source.pop - MIN_TRIBE_POPULATION);
        if (childPop < MIN_TRIBE_POPULATION || source.pop - childPop < MIN_TRIBE_POPULATION) {
            continue;
        }
        const childId = `${source.id}-branch-${write.year}-${events.length}`;
        target.pop = source.pop - childPop;
        target.exchange.warExhaustion = round(clamp(target.exchange.warExhaustion + 0.12, 0, 1.5), 3);
        target.exchange.tradeVolume = round(clamp(target.exchange.tradeVolume * 0.82, 0, 1.5), 3);
        target.abilities.organization.current = round(clamp(target.abilities.organization.current - 4, 0, target.abilities.organization.cap), 2);
        setRelationship(writeTribes, target.id, childId, TRIBE_RELATION_BOUND * 0.4);
        changedTribeIds.add(target.id);
        // Child inherits techs from parent, but may lose 1-2 advanced ones
        let childTechs = [...target.knownTechnologies];
        const techsToMaybeLose = childTechs.filter((t) => TECH_TREE[t]?.populationRequirement > childPop * 0.8);
        for (const t of techsToMaybeLose) {
            if (prng.next() < 0.3) {
                const deps = childTechs.filter((tid) => TECH_TREE[tid]?.prerequisites.includes(t));
                if (deps.length === 0)
                    childTechs = childTechs.filter((x) => x !== t);
            }
        }
        const child = {
            ...structuredClone(target),
            id: childId,
            name: deriveBranchName(source),
            pop: childPop,
            leader: createSuccessorLeader(target, prng),
            knownTechnologies: childTechs,
            relationships: {
                [source.id]: round(TRIBE_RELATION_BOUND * 0.4, 2),
            },
            alliances: [],
            development: {
                ...structuredClone(target.development),
                domestication: round(clamp(target.development.domestication - 4, 0, 100), 2),
                sedentism: round(clamp(target.development.sedentism * 0.86, 0.02, 0.94), 3),
            },
            exchange: {
                tradeVolume: round(clamp(target.exchange.tradeVolume * 0.45, 0, 1.5), 3),
                diffusion: round(clamp(target.exchange.diffusion * 0.7, 0, 1.5), 3),
                raidExposure: 0,
                warExhaustion: round(clamp(target.exchange.warExhaustion * 0.72 + 0.08, 0, 1.5), 3),
            },
            geneticDiversity: round(clamp(target.geneticDiversity * 0.98, 0, 1), 4),
            foodStores: round(clamp(target.foodStores * 0.5, 0, 1), 3),
            statusFlags: {
                migrating: false,
                recovering: false,
                highlighted: false,
            },
        };
        const originTile = tileMap.get(source.tileId);
        let settlementDetail = `The new branch remained near ${source.tileId}.`;
        if (source.migration.destinationTileId && source.migration.plannedRouteTileIds.length) {
            child.migration.homeTileId = source.tileId;
            child.migration.destinationTileId = source.migration.destinationTileId;
            child.migration.plannedRouteTileIds = [...source.migration.plannedRouteTileIds];
            child.migration.commitmentYears = Math.max(2, source.migration.commitmentYears);
            child.statusFlags.migrating = true;
            target.migration.destinationTileId = null;
            target.migration.plannedRouteTileIds = [];
            target.migration.commitmentYears = 0;
            target.migration.homeTileId = target.tileId;
            target.migration.cooldownYears = Math.max(target.migration.cooldownYears, 4);
            target.statusFlags.migrating = false;
            settlementDetail = child.name + ' split away from ' + source.name + ' and continued the migration route toward ' + (tileMap.get(source.migration.destinationTileId)?.name ?? source.migration.destinationTileId) + '.';
        }
        if (originTile && !child.migration.destinationTileId) {
            const coastalForagingChild = child.development.agricultureStage === 'foraging' || child.development.agricultureStage === 'tending';
            const originFood = getFoodCapacity(originTile, coastalForagingChild);
            const originCrowding = (projectedOccupancy.get(originTile.id) ?? source.pop) / Math.max(originFood, 1);
            const mobility = mobilityProfile(child);
            let bestDestination = originTile;
            let bestDestinationScore = -Infinity;
            // Gather candidate tiles: 1-hop always; 2-hop when crowded; 3-hop when very crowded
            const localTribes = tileToTribes.get(originTile.id)?.length ?? 0;
            const searchHops = localTribes >= 6 ? 3 : localTribes >= 3 ? 2 : 1;
            const candidateSet = new Set();
            // 1-hop
            for (const n1 of originTile.neighbors)
                candidateSet.add(n1);
            // 2-hop
            if (searchHops >= 2) {
                for (const n1 of originTile.neighbors) {
                    const t1 = tileMap.get(n1);
                    if (t1)
                        for (const n2 of t1.neighbors) {
                            if (n2 !== originTile.id)
                                candidateSet.add(n2);
                        }
                }
            }
            // 3-hop
            if (searchHops >= 3) {
                const hop2 = new Set(candidateSet);
                for (const n2id of hop2) {
                    const t2 = tileMap.get(n2id);
                    if (t2)
                        for (const n3 of t2.neighbors) {
                            if (n3 !== originTile.id)
                                candidateSet.add(n3);
                        }
                }
            }
            for (const neighborId of candidateSet) {
                const neighbor = tileMap.get(neighborId);
                if (!neighbor || neighbor.terrain === 'sea') {
                    continue;
                }
                const neighborFood = getFoodCapacity(neighbor, coastalForagingChild);
                const neighborCrowding = (projectedOccupancy.get(neighbor.id) ?? 0) / Math.max(neighborFood, 1);
                const hops = originTile.neighbors.includes(neighborId) ? 1 : searchHops >= 3 ? 3 : 2;
                const distancePenalty = hops > 1 ? (hops - 1) * 0.12 : 0;
                const corridorBonus = corridorAffinity(neighbor) * 0.18;
                let destinationScore = clamp((originCrowding - neighborCrowding) / 1.15, -1.2, 1.2) * (1.28 + source.pressures.competition * 1.02) +
                    clamp((neighborFood - originFood) / 260, -1.0, 1.0) * 0.68 +
                    clamp((neighbor.water - originTile.water) / 4.5, -1.2, 1.2) * 0.44 +
                    (projectedOccupancy.has(neighbor.id) ? 0 : 0.52 + source.pressures.competition * 0.36) +
                    corridorBonus -
                    distancePenalty -
                    terrainAridity(neighbor.terrain) * (0.12 + source.pressures.water * 0.22) -
                    terrainRuggedness(neighbor.terrain) * (0.03 + child.development.sedentism * 0.12) -
                    foodCapacityCollapse(neighbor) * 0.2;
                if (neighbor.terrain === 'highland') {
                    destinationScore +=
                        (mobility > 0.68 ? 0.32 : 0.12) +
                            Math.max(0, source.pressures.competition - 0.12) * 0.68;
                }
                if (neighbor.terrain === 'mountain') {
                    destinationScore -= 0.08 + child.development.sedentism * 0.18;
                }
                if (destinationScore > bestDestinationScore) {
                    bestDestinationScore = destinationScore;
                    bestDestination = neighbor;
                }
            }
            if (bestDestination.id !== originTile.id && bestDestinationScore > -0.12) {
                child.tileId = bestDestination.id;
                child.statusFlags.migrating = true;
                child.foodStores = round(clamp(child.foodStores * 0.84, 0, 1), 3);
                child.exchange.tradeVolume = round(clamp(child.exchange.tradeVolume * 0.82, 0, 1.5), 3);
                projectedOccupancy.set(originTile.id, Math.max((projectedOccupancy.get(originTile.id) ?? 0) - childPop, 0));
                projectedOccupancy.set(bestDestination.id, (projectedOccupancy.get(bestDestination.id) ?? 0) + childPop);
                settlementDetail = `${child.name} peeled away from ${originTile.name} toward ${bestDestination.name} under crowding pressure.`;
            }
        }
        for (const ability of Object.keys(child.abilities)) {
            const drift = prng.nextInt(-2, 2);
            child.abilities[ability].cap = clamp(child.abilities[ability].cap + drift, 0, 100);
            child.abilities[ability].current = clamp(child.abilities[ability].current + drift, 0, child.abilities[ability].cap);
        }
        nextTribes.push(child);
        populationCarry.set(child.id, 0);
        changedTribeIds.add(child.id);
        events.push({
            id: eventId('system', write.year, events.length),
            year: write.year,
            kind: 'system',
            title: `${source.name} split`,
            detail: `${source.name} exceeded cohesive scale and divided into a new branch at population ${source.pop}. ${settlementDetail}`,
            tribeId: source.id,
            tileId: child.tileId,
        });
    }
    write.tribes = nextTribes;
}
function applyExtinctionPhase(state, events, changedTribeIds, populationCarry) {
    const survivors = [];
    const extinctIds = new Set();
    for (const tribe of state.tribes) {
        if (tribe.pop > 0) {
            survivors.push(tribe);
            continue;
        }
        extinctIds.add(tribe.id);
        populationCarry.delete(tribe.id);
        changedTribeIds.add(tribe.id);
        events.push({
            id: eventId('warning', state.year, events.length),
            year: state.year,
            kind: 'warning',
            title: `${tribe.name} collapsed`,
            detail: `${tribe.name} fell below a viable population threshold and disappeared.`,
            tribeId: tribe.id,
            tileId: tribe.tileId,
        });
    }
    state.tribes = survivors;
    if (!extinctIds.size) {
        return;
    }
    const survivorIds = new Set(survivors.map((tribe) => tribe.id));
    for (const tribe of survivors) {
        const nextAlliances = tribe.alliances.filter((allianceId) => survivorIds.has(allianceId));
        const nextRelationships = Object.fromEntries(Object.entries(tribe.relationships).filter(([otherId]) => survivorIds.has(otherId)));
        if (nextAlliances.length !== tribe.alliances.length) {
            tribe.alliances = [...new Set(nextAlliances)].sort();
            changedTribeIds.add(tribe.id);
        }
        if (Object.keys(nextRelationships).length !== Object.keys(tribe.relationships).length) {
            tribe.relationships = nextRelationships;
            changedTribeIds.add(tribe.id);
        }
    }
}
/**
 * Storyteller / AI Director: manages event pacing and intensity.
 * Tracks prosperity across the map and modulates disaster/recovery rates.
 */
function updateStoryteller(state, events) {
    const st = state.storyteller;
    const tribes = state.tribes;
    if (tribes.length === 0) {
        st.prosperity = 0;
        st.crisisStreak += 1;
        st.prosperityStreak = 0;
        st.quietStreak += 1;
        st.disasterMultiplier = 0;
        st.recoveryMultiplier = 2.0;
        st.posture = 'crisis';
        return;
    }
    const avgFoodStores = safeAverage(tribes.map((tribe) => tribe.foodStores));
    const avgGrowth = safeAverage(tribes.map((tribe) => (tribe.statusFlags.recovering ? 0.5 : 0)));
    const avgTrade = safeAverage(tribes.map((tribe) => tribe.exchange.tradeVolume));
    const avgOrg = safeAverage(tribes.map((tribe) => tribe.abilities.organization.current / 100));
    const avgDomest = safeAverage(tribes.map((tribe) => tribe.development.domestication / 100));
    st.prosperity = round(clamp(avgFoodStores * 0.28 + avgGrowth * 0.24 + avgTrade * 0.18 + avgOrg * 0.16 + avgDomest * 0.14, 0, 1), 3);
    if (st.prosperity > 0.62) {
        st.prosperityStreak += 1;
        st.crisisStreak = 0;
    }
    else if (st.prosperity < 0.24) {
        st.crisisStreak += 1;
        st.prosperityStreak = 0;
    }
    else {
        st.prosperityStreak = Math.max(0, st.prosperityStreak - 1);
        st.crisisStreak = Math.max(0, st.crisisStreak - 1);
    }
    const hasSignificantEvent = events.some((event) => event.kind === 'disaster' ||
        event.kind === 'disease' ||
        event.kind === 'combat' ||
        event.kind === 'migration');
    if (!hasSignificantEvent) {
        st.quietStreak += 1;
    }
    else {
        st.quietStreak = 0;
    }
    let disasterMod = 1.0;
    if (st.prosperityStreak > 20) {
        disasterMod = 1.46;
    }
    if (st.crisisStreak > 10) {
        disasterMod = 0.55;
    }
    if (st.quietStreak > 24) {
        disasterMod *= 1.22;
    }
    const totalPop = tribes.reduce((sum, tribe) => sum + tribe.pop, 0);
    if (totalPop < 500) {
        disasterMod = 0;
        st.recoveryMultiplier = 2.0;
    }
    else if (totalPop < 1000) {
        disasterMod *= 0.35;
        st.recoveryMultiplier = 1.56;
    }
    else {
        st.recoveryMultiplier = round(clamp(1 + Math.max(0, 0.42 - st.prosperity) * 0.95, 1, 1.48), 3);
    }
    st.disasterMultiplier = round(clamp(disasterMod, 0, 2.4), 2);
    st.posture = deriveStorytellerPosture(st);
}
function finalizeState(state, previousMetrics, events) {
    state.metrics = computeMetrics(state, previousMetrics, events);
    state.history.push({
        year: state.year,
        totalPopulation: state.metrics.totalPopulation,
        tribeCount: state.metrics.tribeCount,
        innovations: state.metrics.innovations,
        conflicts: state.metrics.conflicts,
    });
    // Keep history bounded without allocating a new array when under limit
    if (state.history.length > 72) {
        state.history = state.history.slice(-72);
    }
    // Prepend new events and cap total length without spread allocation
    events.reverse();
    const maxLog = 48;
    const keep = Math.min(state.eventLog.length, maxLog - Math.min(events.length, maxLog));
    if (keep <= 0) {
        state.eventLog = events.slice(0, maxLog);
    }
    else {
        state.eventLog = events.concat(state.eventLog.slice(0, keep));
        if (state.eventLog.length > maxLog)
            state.eventLog.length = maxLog;
    }
}
export function createSimulationEngine(initialConfig, options = {}) {
    let config = cloneSimulationConfig(initialConfig);
    let state = createInitialWorldState(config);
    let prng = createPrng(config.seed);
    let populationCarry = new Map(state.tribes.map((tribe) => [tribe.id, 0]));
    const decisionPolicy = options.policy === undefined ? TRAINED_DECISION_POLICY : options.policy;
    function stepOnce() {
        const previousYear = state.year;
        const previousMetrics = state.metrics;
        const emittedEvents = [];
        const changedTileIds = new Set();
        const changedTribeIds = new Set();
        // Optimized: only 1 clone for the read snapshot; mutate write in-place.
        // Between phases, swap read = write and create a fresh write by cloning
        // only the arrays that the next phase mutates (tiles or tribes), not the
        // entire world state.
        const read = cloneState(state);
        const write = cloneState(state);
        applyGlobalPhase(read, write, config, emittedEvents);
        // Global phase only touches scalars on write. Copy them into read for
        // tile phase to see the new climate. No deep clone needed.
        read.year = write.year;
        read.globalClimate = { ...write.globalClimate };
        read.activeClimatePulses = write.activeClimatePulses;
        read.pendingInterventions = write.pendingInterventions;
        read.executedInterventions = write.executedInterventions;
        read.storyteller = { ...write.storyteller };
        applyTilePhase(read, write, config, prng, emittedEvents, changedTileIds);
        // Tile phase mutated write.tiles. Swap tiles into read so tribe phase
        // sees updated tiles but old tribes.
        read.tiles = write.tiles;
        // Clone write.tribes from read.tribes so tribe phase has a fresh write target
        // (the read.tribes are still the pre-tick snapshot).
        write.tribes = structuredClone(read.tribes);
        if (config.enabledSystems.tribeDynamics) {
            applyTribePhase(read, write, config, prng, emittedEvents, changedTribeIds, changedTileIds, populationCarry, decisionPolicy);
        }
        // Tribe phase mutated write.tribes. Swap into read for interaction phase.
        read.tribes = write.tribes;
        write.tribes = structuredClone(read.tribes);
        applyInteractionPhase(read, write, config, prng, emittedEvents, changedTribeIds, decisionPolicy);
        read.tribes = write.tribes;
        write.tribes = structuredClone(read.tribes);
        applyMigrationPhase(read, write, config, prng, emittedEvents, changedTribeIds, decisionPolicy);
        read.tribes = write.tribes;
        write.tribes = structuredClone(read.tribes);
        applyFissionPhase(read, write, config, prng, emittedEvents, changedTribeIds, populationCarry);
        applyExtinctionPhase(write, emittedEvents, changedTribeIds, populationCarry);
        updateStoryteller(write, emittedEvents);
        finalizeState(write, previousMetrics, emittedEvents);
        state = write;
        return {
            previousYear,
            nextYear: state.year,
            emittedEvents,
            changedTileIds: [...changedTileIds],
            changedTribeIds: [...changedTribeIds],
            metricsDelta: {
                totalPopulation: state.metrics.totalPopulation - previousMetrics.totalPopulation,
                tribeCount: state.metrics.tribeCount - previousMetrics.tribeCount,
                innovations: state.metrics.innovations - previousMetrics.innovations,
                conflicts: state.metrics.conflicts - previousMetrics.conflicts,
            },
            phases: PHASES,
            state,
        };
    }
    return {
        getState() {
            return state;
        },
        getConfig() {
            return config;
        },
        step(years = 1) {
            const stepYears = normalizeStepYears(years);
            let result;
            for (let index = 0; index < stepYears; index += 1) {
                result = stepOnce();
            }
            return result;
        },
        enqueueIntervention(command) {
            state.pendingInterventions.push(command);
            state.pendingInterventions.sort((left, right) => left.scheduledYear - right.scheduledYear);
            return state;
        },
        reset(nextConfig = config) {
            config = cloneSimulationConfig(nextConfig);
            state = createInitialWorldState(config);
            prng = createPrng(config.seed);
            populationCarry = new Map(state.tribes.map((tribe) => [tribe.id, 0]));
            return state;
        },
        setRuntimeSpeed(yearsPerSecond) {
            config.runtime.yearsPerSecond = clamp(yearsPerSecond, 1, 240);
        },
    };
}
