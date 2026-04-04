import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SIMULATION_CONFIG, cloneSimulationConfig } from '../src/sim/config.js';
import { createSimulationEngine } from '../src/sim/engine.js';
import { createPrng } from '../src/sim/prng.js';
import { buildAllianceFeatures, buildIntensifyFeatures, buildMigrationFeatures, buildRaidFeatures, buildTradeFeatures, estimateActionReward, serializePolicyModule, terrainAridity, terrainRuggedness, trainDecisionPolicy, } from '../src/sim/policy.js';
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function safeAverage(values) {
    if (!values.length) {
        return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function getFoodCapacity(tile) {
    const effectiveMegafauna = tile.megafaunaIndex < 0.1 ? 0 : tile.megafaunaIndex;
    return tile.carryingCapacity.hunt * (1 + effectiveMegafauna * 0.5) + tile.carryingCapacity.agri;
}
function foodCapacityCollapse(tile) {
    return clamp(1 - getFoodCapacity(tile) / Math.max(tile.baseCarryingCapacity.hunt + tile.baseCarryingCapacity.agri, 1), 0, 1.2);
}
function storytellerCrisisSignal(state) {
    return clamp(Math.max(0, 0.55 - state.storyteller.prosperity) * 1.15 +
        state.storyteller.crisisStreak / 18 +
        Math.max(0, state.storyteller.disasterMultiplier - 1) * 0.28, 0, 1.2);
}
function sumDisasterSeverity(tile) {
    return tile.activeDisasters.reduce((sum, disaster) => sum + disaster.severity, 0);
}
function sumPlagueSeverity(tile) {
    return tile.activePlagues.reduce((sum, plague) => sum + plague.severity, 0);
}
function occupancyByTile(state) {
    const occupancy = new Map();
    for (const tribe of state.tribes) {
        occupancy.set(tribe.tileId, (occupancy.get(tribe.tileId) ?? 0) + tribe.pop);
    }
    return occupancy;
}
function tilesById(state) {
    return new Map(state.tiles.map((tile) => [tile.id, tile]));
}
function getRelationship(tribe, otherId) {
    return tribe.relationships[otherId] ?? 0;
}
function currentRisk(tribe, tile) {
    return (sumDisasterSeverity(tile) +
        sumPlagueSeverity(tile) +
        tribe.exchange.raidExposure * 0.8 +
        tribe.exchange.warExhaustion * 0.6);
}
function stageGap(left, right) {
    const order = {
        foraging: 0,
        tending: 1,
        cultivation: 2,
        agropastoral: 3,
        'settled-farming': 4,
    };
    return Math.abs(order[left.development.agricultureStage] - order[right.development.agricultureStage]) / 4;
}
function buildPairKeys(state) {
    const tileMap = tilesById(state);
    const tileToTribes = new Map();
    for (const tribe of state.tribes) {
        tileToTribes.set(tribe.tileId, [...(tileToTribes.get(tribe.tileId) ?? []), tribe]);
    }
    const pairs = [];
    for (const [tileId, tribes] of tileToTribes) {
        const sorted = [...tribes].sort((left, right) => left.id.localeCompare(right.id));
        for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
                pairs.push({ left: sorted[leftIndex], right: sorted[rightIndex], sharedTile: true });
            }
        }
        const tile = tileMap.get(tileId);
        if (!tile) {
            continue;
        }
        for (const neighborId of tile.neighbors.filter((neighborId) => tileId < neighborId)) {
            const neighbors = [...(tileToTribes.get(neighborId) ?? [])].sort((left, right) => left.id.localeCompare(right.id));
            for (const left of sorted) {
                for (const right of neighbors) {
                    pairs.push({ left, right, sharedTile: false });
                }
            }
        }
    }
    return pairs;
}
function collectSamples(state, prngSeed) {
    const prng = createPrng(prngSeed + state.year * 17 + state.tribes.length * 31);
    const samples = [];
    const actionCounts = new Map();
    const tileMap = tilesById(state);
    const occupancy = occupancyByTile(state);
    const storytellerPressure = storytellerCrisisSignal(state);
    for (const tribe of state.tribes) {
        const tile = tileMap.get(tribe.tileId);
        if (!tile) {
            continue;
        }
        const tribeRisk = currentRisk(tribe, tile);
        const currentCrowding = (occupancy.get(tile.id) ?? 0) / Math.max(getFoodCapacity(tile), 1);
        let bestMigration = null;
        for (const neighborId of tile.neighbors) {
            const neighbor = tileMap.get(neighborId);
            if (!neighbor) {
                continue;
            }
            const neighborCrowding = (occupancy.get(neighbor.id) ?? 0) / Math.max(getFoodCapacity(neighbor), 1);
            const alliedPresence = clamp(tribe.alliances.filter((allyId) => state.tribes.some((candidate) => candidate.id === allyId && candidate.tileId === neighbor.id)).length / 2, 0, 1);
            const hostilePresence = clamp(state.tribes.filter((candidate) => candidate.tileId === neighbor.id && getRelationship(tribe, candidate.id) < -0.2).length / 3, 0, 1);
            const features = buildMigrationFeatures({
                totalPressure: tribe.pressures.total,
                foodPressure: tribe.pressures.food,
                waterPressure: tribe.pressures.water,
                competition: tribe.pressures.competition,
                healthPressure: tribe.pressures.health,
                currentRisk: clamp(tribeRisk / 1.6, 0, 1.2),
                sedentism: tribe.development.sedentism,
                stage: tribe.development.agricultureStage,
                resourceDelta: clamp((getFoodCapacity(neighbor) - getFoodCapacity(tile)) / 220, -1.2, 1.2),
                waterDelta: clamp((neighbor.water - tile.water) / 6, -1.2, 1.2),
                occupancyRelief: clamp((currentCrowding - neighborCrowding) / 1.7, -1.2, 1.2),
                riskRelief: clamp((tribeRisk - currentRisk(tribe, neighbor)) / 1.4, -1.2, 1.2),
                comfortDelta: clamp((neighbor.comfort - tile.comfort) / 3.2, -1.2, 1.2),
                frontier: occupancy.has(neighbor.id) ? 0 : 1,
                ruggedness: terrainRuggedness(neighbor.terrain),
                aridity: terrainAridity(neighbor.terrain),
                alliedPresence,
                hostilePresence,
                resourceCollapse: foodCapacityCollapse(neighbor),
                storedFood: clamp(tribe.foodStores, 0, 1.2),
                geneticRisk: clamp(1 - tribe.geneticDiversity, 0, 1.2),
                megafaunaDecline: clamp(1 - tile.megafaunaIndex, 0, 1.2),
                storytellerCrisis: storytellerPressure,
                defeatVulnerability: clamp(tribe.exchange.raidExposure * 0.55 + tribe.exchange.warExhaustion * 0.4 + Math.max(0, 0.4 - tribe.foodStores) * 0.4, 0, 1.2),
            });
            const reward = estimateActionReward('migrate', features);
            if (!bestMigration || reward > bestMigration.reward) {
                bestMigration = {
                    action: 'migrate',
                    features,
                    reward,
                    weight: 0.7 + Math.abs(reward) * 0.5,
                };
            }
        }
        if (bestMigration) {
            samples.push(bestMigration);
            actionCounts.set('migrate', (actionCounts.get('migrate') ?? 0) + 1);
        }
        const agriSuitability = tile.baseCarryingCapacity.agri / Math.max(tile.baseCarryingCapacity.agri + tile.baseCarryingCapacity.hunt, 1);
        const intensifyFeatures = buildIntensifyFeatures({
            totalPressure: tribe.pressures.total,
            foodPressure: tribe.pressures.food,
            waterPressure: tribe.pressures.water,
            healthPressure: tribe.pressures.health,
            risk: clamp(tribeRisk / 1.6, 0, 1.2),
            sedentism: tribe.development.sedentism,
            stage: tribe.development.agricultureStage,
            agriSuitability: clamp(agriSuitability * 1.6, 0, 1.2),
            ruggedness: terrainRuggedness(tile.terrain),
            aridity: terrainAridity(tile.terrain),
            diffusion: tribe.exchange.diffusion,
            exchangePotential: clamp((tribe.exchange.tradeVolume + tribe.exchange.diffusion) / 2, 0, 1.2),
            organization: clamp(tribe.abilities.organization.current / 100, 0, 1.2),
            resourceCollapse: foodCapacityCollapse(tile),
            storedFood: clamp(tribe.foodStores, 0, 1.2),
            geneticRisk: clamp(1 - tribe.geneticDiversity, 0, 1.2),
            megafaunaDecline: clamp(1 - tile.megafaunaIndex, 0, 1.2),
            storytellerCrisis: storytellerPressure,
            defeatVulnerability: clamp(tribe.exchange.raidExposure * 0.55 + tribe.exchange.warExhaustion * 0.4 + Math.max(0, 0.4 - tribe.foodStores) * 0.4, 0, 1.2),
        });
        samples.push({
            action: 'intensify',
            features: intensifyFeatures,
            reward: estimateActionReward('intensify', intensifyFeatures),
            weight: 0.65 + tribe.pressures.food * 0.4,
        });
        actionCounts.set('intensify', (actionCounts.get('intensify') ?? 0) + 1);
    }
    for (const pair of buildPairKeys(state)) {
        if (!pair.sharedTile && prng.next() > 0.3) {
            continue;
        }
        const relation = (getRelationship(pair.left, pair.right.id) + getRelationship(pair.right, pair.left.id)) / 2;
        const complementarity = clamp(Math.abs(pair.left.abilities.agriculture.current - pair.right.abilities.agriculture.current) / 110 +
            Math.abs(pair.left.abilities.waterEngineering.current - pair.right.abilities.waterEngineering.current) / 150 +
            stageGap(pair.left, pair.right) * 0.18, 0, 1.2);
        const surplusLeft = clamp(1.08 - pair.left.pressures.food - pair.left.pressures.water * 0.4, 0, 1);
        const surplusRight = clamp(1.08 - pair.right.pressures.food - pair.right.pressures.water * 0.4, 0, 1);
        const needLeft = clamp(pair.left.pressures.food * 0.75 + pair.left.pressures.water * 0.45 + pair.left.pressures.organization * 0.12, 0, 1.2);
        const needRight = clamp(pair.right.pressures.food * 0.75 + pair.right.pressures.water * 0.45 + pair.right.pressures.organization * 0.12, 0, 1.2);
        const exchangePotential = clamp((surplusLeft * needRight + surplusRight * needLeft) * (pair.sharedTile ? 1 : 0.78) * (0.6 + complementarity), 0, 1.2);
        const hostility = clamp(0.14 +
            (pair.left.pressures.competition + pair.right.pressures.competition) * 0.2 +
            Math.max(0, -relation) * 0.42 +
            (pair.left.exchange.raidExposure + pair.right.exchange.raidExposure) * 0.08, 0, 1.2);
        const alliedPresence = pair.left.alliances.includes(pair.right.id) || pair.right.alliances.includes(pair.left.id) ? 1 : 0;
        const tradeFeatures = buildTradeFeatures({
            foodPressure: clamp((pair.left.pressures.food + pair.right.pressures.food) / 2, 0, 1.2),
            waterPressure: clamp((pair.left.pressures.water + pair.right.pressures.water) / 2, 0, 1.2),
            competition: clamp((pair.left.pressures.competition + pair.right.pressures.competition) / 2, 0, 1.2),
            healthPressure: clamp((pair.left.pressures.health + pair.right.pressures.health) / 2, 0, 1.2),
            risk: clamp((pair.left.exchange.warExhaustion + pair.right.exchange.warExhaustion) / 2, 0, 1.2),
            sedentism: clamp((pair.left.development.sedentism + pair.right.development.sedentism) / 2, 0, 1),
            stage: pair.left.development.agricultureStage,
            relation: clamp((relation + 1) / 2, 0, 1.2),
            complementarity,
            exchangePotential,
            alliedPresence,
            hostility,
            resourceCollapse: safeAverage([foodCapacityCollapse(tileMap.get(pair.left.tileId)), foodCapacityCollapse(tileMap.get(pair.right.tileId))]),
            storedFood: safeAverage([pair.left.foodStores, pair.right.foodStores]),
            geneticRisk: safeAverage([1 - pair.left.geneticDiversity, 1 - pair.right.geneticDiversity]),
            megafaunaDecline: safeAverage([1 - tileMap.get(pair.left.tileId).megafaunaIndex, 1 - tileMap.get(pair.right.tileId).megafaunaIndex]),
            storytellerCrisis: storytellerPressure,
            defeatVulnerability: safeAverage([
                pair.left.exchange.raidExposure * 0.5 + pair.left.exchange.warExhaustion * 0.36 + Math.max(0, 0.35 - pair.left.foodStores) * 0.4,
                pair.right.exchange.raidExposure * 0.5 + pair.right.exchange.warExhaustion * 0.36 + Math.max(0, 0.35 - pair.right.foodStores) * 0.4,
            ]),
        });
        samples.push({
            action: 'trade',
            features: tradeFeatures,
            reward: estimateActionReward('trade', tradeFeatures),
            weight: 0.45 + exchangePotential * 0.6,
        });
        actionCounts.set('trade', (actionCounts.get('trade') ?? 0) + 1);
        const allyFeatures = buildAllianceFeatures({
            competition: clamp((pair.left.pressures.competition + pair.right.pressures.competition) / 2, 0, 1.2),
            healthPressure: clamp((pair.left.pressures.health + pair.right.pressures.health) / 2, 0, 1.2),
            risk: clamp((pair.left.exchange.warExhaustion + pair.right.exchange.warExhaustion) / 2, 0, 1.2),
            sedentism: clamp((pair.left.development.sedentism + pair.right.development.sedentism) / 2, 0, 1),
            stage: pair.left.development.agricultureStage,
            relation: clamp((relation + 1) / 2, 0, 1.2),
            complementarity,
            exchangePotential,
            alliedPresence,
            hostility,
            resourceCollapse: safeAverage([foodCapacityCollapse(tileMap.get(pair.left.tileId)), foodCapacityCollapse(tileMap.get(pair.right.tileId))]),
            storedFood: safeAverage([pair.left.foodStores, pair.right.foodStores]),
            geneticRisk: safeAverage([1 - pair.left.geneticDiversity, 1 - pair.right.geneticDiversity]),
            megafaunaDecline: safeAverage([1 - tileMap.get(pair.left.tileId).megafaunaIndex, 1 - tileMap.get(pair.right.tileId).megafaunaIndex]),
            storytellerCrisis: storytellerPressure,
            defeatVulnerability: safeAverage([
                pair.left.exchange.raidExposure * 0.5 + pair.left.exchange.warExhaustion * 0.36 + Math.max(0, 0.35 - pair.left.foodStores) * 0.4,
                pair.right.exchange.raidExposure * 0.5 + pair.right.exchange.warExhaustion * 0.36 + Math.max(0, 0.35 - pair.right.foodStores) * 0.4,
            ]),
        });
        samples.push({
            action: 'ally',
            features: allyFeatures,
            reward: estimateActionReward('ally', allyFeatures),
            weight: 0.35 + Math.max(0, relation) * 0.6,
        });
        actionCounts.set('ally', (actionCounts.get('ally') ?? 0) + 1);
        const leftTile = tileMap.get(pair.left.tileId);
        const rightTile = tileMap.get(pair.right.tileId);
        const leftStrength = clamp(Math.sqrt(Math.max(pair.left.pop, 1)) * (0.85 + pair.left.abilities.attack.current / 90) * (0.88 + pair.left.abilities.organization.current / 120) / 16, 0, 1.4);
        const rightStrength = clamp(Math.sqrt(Math.max(pair.right.pop, 1)) * (0.85 + pair.right.abilities.attack.current / 90) * (0.88 + pair.right.abilities.organization.current / 120) / 16, 0, 1.4);
        const strengthEdge = clamp(Math.abs(leftStrength - rightStrength), 0, 1.2);
        const raidFeatures = buildRaidFeatures({
            foodPressure: clamp(Math.max(pair.left.pressures.food, pair.right.pressures.food), 0, 1.2),
            competition: clamp(Math.max(pair.left.pressures.competition, pair.right.pressures.competition), 0, 1.2),
            healthPressure: clamp(Math.max(pair.left.pressures.health, pair.right.pressures.health), 0, 1.2),
            risk: clamp(Math.max(pair.left.exchange.warExhaustion, pair.right.exchange.warExhaustion), 0, 1.2),
            sedentism: clamp(Math.min(pair.left.development.sedentism, pair.right.development.sedentism), 0, 1),
            stage: pair.left.development.agricultureStage,
            hostility,
            relation: clamp((relation + 1) / 2, 0, 1.2),
            strengthEdge,
            exchangePotential: clamp((pair.left.exchange.tradeVolume + pair.right.exchange.tradeVolume) * 0.4 +
                (pair.left.development.domestication + pair.right.development.domestication) / 200, 0, 1.2),
            frontier: pair.sharedTile ? 0 : 1,
            ruggedness: Math.max(terrainRuggedness(leftTile.terrain), terrainRuggedness(rightTile.terrain)),
            aridity: Math.max(terrainAridity(leftTile.terrain), terrainAridity(rightTile.terrain)),
            resourceCollapse: safeAverage([foodCapacityCollapse(leftTile), foodCapacityCollapse(rightTile)]),
            storedFood: Math.min(pair.left.foodStores, pair.right.foodStores),
            geneticRisk: Math.max(1 - pair.left.geneticDiversity, 1 - pair.right.geneticDiversity),
            megafaunaDecline: safeAverage([1 - leftTile.megafaunaIndex, 1 - rightTile.megafaunaIndex]),
            storytellerCrisis: storytellerPressure,
            defeatVulnerability: Math.max(pair.left.exchange.raidExposure * 0.5 + pair.left.exchange.warExhaustion * 0.36 + Math.max(0, 0.35 - pair.left.foodStores) * 0.4, pair.right.exchange.raidExposure * 0.5 + pair.right.exchange.warExhaustion * 0.36 + Math.max(0, 0.35 - pair.right.foodStores) * 0.4),
        });
        samples.push({
            action: 'raid',
            features: raidFeatures,
            reward: estimateActionReward('raid', raidFeatures),
            weight: 0.45 + hostility * 0.45,
        });
        actionCounts.set('raid', (actionCounts.get('raid') ?? 0) + 1);
    }
    return { samples, actionCounts };
}
function buildConfig(seed, worldPreset, overrides) {
    const config = cloneSimulationConfig(DEFAULT_SIMULATION_CONFIG);
    config.seed = seed;
    config.worldPreset = worldPreset;
    if (overrides) {
        config.globals = { ...config.globals, ...overrides };
    }
    return config;
}
const TRAINING_RUNS = [
    { label: 'corridor-baseline', config: buildConfig(12045, 'old-world-corridor'), years: 220 },
    { label: 'corridor-mobile', config: buildConfig(31415, 'old-world-corridor', { G_migration: 0.13, G_hostility: 0.24 }), years: 220 },
    { label: 'eurasia-baseline', config: buildConfig(12045, 'detailed-eurasia'), years: 140 },
    { label: 'eurasia-dry', config: buildConfig(7777, 'detailed-eurasia', { G_temp: 16.5, G_migration: 0.12 }), years: 140 },
    { label: 'eurasia-crowded', config: buildConfig(424242, 'detailed-eurasia', { G_birth: 0.037, G_hostility: 0.28 }), years: 140 },
    { label: 'eurasia-frontier', config: buildConfig(99991, 'detailed-eurasia', { G_migration: 0.14, G_cohesion: 0.86 }), years: 140 },
];
async function main() {
    const allSamples = [];
    const aggregateCounts = new Map();
    for (const run of TRAINING_RUNS) {
        const engine = createSimulationEngine(run.config, { policy: null });
        const runCounts = new Map();
        for (let year = 0; year < run.years; year += 1) {
            const state = engine.getState();
            const { samples, actionCounts } = collectSamples(state, run.config.seed + year * 13);
            allSamples.push(...samples);
            for (const [action, count] of actionCounts) {
                runCounts.set(action, (runCounts.get(action) ?? 0) + count);
                aggregateCounts.set(action, (aggregateCounts.get(action) ?? 0) + count);
            }
            engine.step(1);
        }
        console.log(`${run.label}: ${run.years}y -> ${[...runCounts.entries()].map(([action, count]) => `${action}=${count}`).join(', ')}`);
    }
    const result = trainDecisionPolicy(allSamples, {
        epochs: 18,
        learningRate: 0.032,
        regularization: 0.0012,
        seed: 20260403,
    });
    const outputPath = resolve(fileURLToPath(new URL('../../src/sim/learnedPolicy.ts', import.meta.url)));
    await writeFile(outputPath, serializePolicyModule(result.model), 'utf-8');
    console.log(`trained ${result.metrics.sampleCount} samples`);
    console.log(`mae=${result.metrics.mae} mse=${result.metrics.mse} avgReward=${result.metrics.averageReward}`);
    console.log(`counts: ${[...aggregateCounts.entries()].map(([action, count]) => `${action}=${count}`).join(', ')}`);
    console.log(`wrote ${outputPath}`);
}
void main();
