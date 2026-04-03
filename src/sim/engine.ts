import { createInitialWorldState } from '../world/oldWorld.js';
import { cloneSimulationConfig } from './config.js';
import { createPrng, type Prng } from './prng.js';
import type {
  AbilityKey,
  ClimatePulseEffect,
  InterventionCommand,
  SimulationConfig,
  SimulationEvent,
  SimulationPhase,
  SimulationStepResult,
  TileState,
  TribeState,
  WorldMetrics,
  WorldState,
} from './types.js';

const MAX_ENGINE_BATCH_YEARS = 4096;
const TARGET_BASELINE_TEMPERATURE = 15;
const MIN_TRIBE_POPULATION = 25;
const MAX_TRIBE_POPULATION = 1_000_000;
const POPULATION_CARRY_LIMIT = 0.999999;
const TRIBE_SPLIT_THRESHOLD = 180;
const TRIBE_RELATION_CAP = 0.9;

const PHASES: SimulationPhase[] = [
  'global-events',
  'tile-update',
  'tribe-update',
  'interaction',
  'migration',
  'fission',
  'extinction',
];

export interface SimulationEngine {
  getState(): WorldState;
  getConfig(): SimulationConfig;
  step(years?: number): SimulationStepResult;
  enqueueIntervention(command: InterventionCommand): WorldState;
  reset(nextConfig?: SimulationConfig): WorldState;
  setRuntimeSpeed(yearsPerSecond: number): void;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(digits));
}

function normalizeStepYears(years = 1) {
  if (!Number.isFinite(years)) {
    throw new RangeError('Simulation step years must be finite.');
  }

  const wholeYears = Math.trunc(years);
  if (wholeYears < 1 || wholeYears > MAX_ENGINE_BATCH_YEARS) {
    throw new RangeError(
      `Simulation step years must be between 1 and ${MAX_ENGINE_BATCH_YEARS}.`,
    );
  }

  return wholeYears;
}

function cloneState(state: WorldState) {
  return structuredClone(state);
}

function eventId(prefix: string, year: number, seq: number) {
  return `${prefix}-${year}-${seq}`;
}

function indexById<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

function occupancyByTile(state: WorldState) {
  const occupancy = new Map<string, number>();
  for (const tribe of state.tribes) {
    occupancy.set(tribe.tileId, (occupancy.get(tribe.tileId) ?? 0) + tribe.pop);
  }
  return occupancy;
}

function tilesById(state: WorldState) {
  return indexById(state.tiles);
}

function tribesById(state: WorldState) {
  return indexById(state.tribes);
}

function shuffleIds(ids: string[], prng: Prng) {
  const result = [...ids];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(prng.next() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function computeMetrics(
  state: WorldState,
  previousMetrics: WorldMetrics,
  events: SimulationEvent[],
) {
  const totalPopulation = state.tribes.reduce((sum, tribe) => sum + tribe.pop, 0);
  const tribeCount = state.tribes.length;
  const averageComfort =
    state.tiles.reduce((sum, tile) => sum + tile.comfort, 0) /
    Math.max(state.tiles.length, 1);
  const averagePressure =
    state.tribes.reduce((sum, tribe) => sum + tribe.pressures.total, 0) /
    Math.max(state.tribes.length, 1);

  return {
    totalPopulation,
    tribeCount,
    innovations:
      previousMetrics.innovations + events.filter((event) => event.kind === 'innovation').length,
    conflicts:
      previousMetrics.conflicts + events.filter((event) => event.kind === 'warning').length,
    averageComfort: round(averageComfort),
    averagePressure: round(averagePressure),
  };
}

function applyGlobalPhase(
  read: WorldState,
  write: WorldState,
  config: SimulationConfig,
  events: SimulationEvent[],
) {
  write.year = read.year + 1;

  const activePulses: ClimatePulseEffect[] = [];
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
    const dueCommands = write.pendingInterventions.filter(
      (command) => command.scheduledYear <= write.year,
    );
    write.pendingInterventions = write.pendingInterventions.filter(
      (command) => command.scheduledYear > write.year,
    );

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
        detail:
          command.kind === 'climate-pulse'
            ? `Climate anomaly scheduled at ${round(command.payload.temperatureDelta ?? 0, 1)}°C for ${
                command.payload.duration ?? 120
              } years.`
            : command.payload.note ?? 'Observation note applied to the timeline.',
      });
    }
  }

  const anomaly = round(
    write.activeClimatePulses.reduce((sum, pulse) => sum + pulse.temperatureDelta, 0),
    2,
  );
  const baseline =
    config.globals.G_temp + 5 * Math.sin((write.year / 100000) * Math.PI * 2);

  write.globalClimate = {
    baseline: round(baseline, 2),
    anomaly,
    meanTemperature: round(baseline + anomaly, 2),
  };
}

function applyTilePhase(read: WorldState, write: WorldState, changedTileIds: Set<string>) {
  const occupancy = occupancyByTile(read);
  const previousTiles = tilesById(read);

  for (const tile of write.tiles) {
    const previous = previousTiles.get(tile.id)!;
    const totalPopulation = occupancy.get(tile.id) ?? 0;
    const baselineFoodCapacity =
      previous.baseCarryingCapacity.hunt + previous.baseCarryingCapacity.agri;
    const crowdingRatio = totalPopulation / Math.max(baselineFoodCapacity, 1);
    const climateShift = Math.abs(write.globalClimate.meanTemperature - TARGET_BASELINE_TEMPERATURE);
    const climateStress = clamp(Math.max(0, climateShift - 1.5) / 8, 0, 0.45);
    const terrainPenalty =
      tile.terrain === 'mountain' ? 1.3 : tile.terrain === 'highland' ? 0.6 : 0;
    const huntRecovery = Math.min(
      previous.baseCarryingCapacity.hunt * 0.018,
      previous.baseCarryingCapacity.hunt - previous.carryingCapacity.hunt,
    );
    const agriRecovery = Math.min(
      previous.baseCarryingCapacity.agri * 0.012,
      previous.baseCarryingCapacity.agri - previous.carryingCapacity.agri,
    );

    tile.temperature = round(
      tile.baseTemperature + (write.globalClimate.meanTemperature - TARGET_BASELINE_TEMPERATURE),
      2,
    );
    tile.carryingCapacity.hunt = round(
      clamp(
        previous.carryingCapacity.hunt * (1 - climateStress * 0.05) + huntRecovery,
        previous.baseCarryingCapacity.hunt > 0 ? previous.baseCarryingCapacity.hunt * 0.18 : 0,
        previous.baseCarryingCapacity.hunt,
      ),
      2,
    );
    tile.carryingCapacity.agri = round(
      clamp(
        previous.carryingCapacity.agri * (1 - climateStress * 0.03) + agriRecovery,
        previous.baseCarryingCapacity.agri > 0 ? previous.baseCarryingCapacity.agri * 0.25 : 0,
        previous.baseCarryingCapacity.agri,
      ),
      2,
    );
    tile.carryingCapacity.water = round(
      clamp(
        previous.baseCarryingCapacity.water * (1 - climateStress * 0.2),
        previous.baseCarryingCapacity.water > 0 ? previous.baseCarryingCapacity.water * 0.55 : 0,
        previous.baseCarryingCapacity.water,
      ),
      2,
    );
    tile.comfort = round(
      clamp(
        tile.baseComfort -
          climateShift * 0.08 -
          terrainPenalty -
          Math.max(0, crowdingRatio - 0.74) * 1.35 -
          climateStress * 0.75,
        0.2,
        6,
      ),
      2,
    );

    if (
      previous.temperature !== tile.temperature ||
      previous.comfort !== tile.comfort ||
      previous.carryingCapacity.hunt !== tile.carryingCapacity.hunt ||
      previous.carryingCapacity.agri !== tile.carryingCapacity.agri ||
      previous.carryingCapacity.water !== tile.carryingCapacity.water
    ) {
      changedTileIds.add(tile.id);
    }
  }
}
interface TribeResourceContext {
  effectiveForaging: number;
  effectiveFarming: number;
  effectiveFood: number;
  supportedByWater: number;
  carryingCapacity: number;
  pressures: TribeState['pressures'];
}

function computeTribeResourceContext(
  tribe: TribeState,
  tile: TileState,
  tilePopulation: number,
): TribeResourceContext {
  const safeTilePopulation = Math.max(tilePopulation, tribe.pop, 1);
  const share = clamp(tribe.pop / safeTilePopulation, 0.08, 1);
  const effectiveForaging = round(
    tile.carryingCapacity.hunt * share * (0.40 + tribe.abilities.foraging.current / 55),
    2,
  );
  const effectiveFarming = round(
    tile.carryingCapacity.agri * share * (tribe.abilities.agriculture.current / 70),
    2,
  );
  const effectiveFood = round(effectiveForaging + effectiveFarming, 2);
  const supportedByWater = round(
    ((tile.carryingCapacity.water *
      share *
      (0.62 + tribe.abilities.waterEngineering.current / 150)) /
      0.55),
    2,
  );
  const heat = clamp(
    (tile.temperature - (18 + tribe.abilities.heatTolerance.current * 0.22)) / 16,
    0,
    1,
  );
  const cold = clamp(
    ((10 - tribe.abilities.coldTolerance.current * 0.28) - tile.temperature) / 16,
    0,
    1,
  );
  const food = clamp(1 - effectiveFood / Math.max(tribe.pop, 1), 0, 1);
  const water = clamp(1 - supportedByWater / Math.max(tribe.pop, 1), 0, 1);
  const competition = clamp(
    tilePopulation / Math.max(tile.carryingCapacity.hunt + tile.carryingCapacity.agri, 1) - 0.65,
    0,
    1,
  );
  const organization = clamp(tribe.pop / 150 - tribe.abilities.organization.current / 100, 0, 1);
  const carryingCapacity = round(
    clamp(
      Math.min(effectiveFood, supportedByWater) +
        tile.comfort * 16 +
        tribe.abilities.organization.current * 0.7,
      MIN_TRIBE_POPULATION * 2,
      MAX_TRIBE_POPULATION,
    ),
    2,
  );
  const total = round((food + heat + cold + water + competition + organization) / 6, 3);

  return {
    effectiveForaging,
    effectiveFarming,
    effectiveFood,
    supportedByWater,
    carryingCapacity,
    pressures: {
      food: round(food),
      heat: round(heat),
      cold: round(cold),
      water: round(water),
      competition: round(competition),
      organization: round(organization),
      total,
    },
  };
}

function derivePressures(tribe: TribeState, tile: TileState, tilePopulation: number) {
  return computeTribeResourceContext(tribe, tile, tilePopulation).pressures;
}

function pickAbility(tribe: TribeState, prng: Prng) {
  const priorities: Array<{ ability: AbilityKey; weight: number }> = [
    { ability: 'foraging', weight: tribe.pressures.food * 1.4 },
    {
      ability: 'agriculture',
      weight: tribe.pressures.food * 0.9 + tribe.pressures.organization * 0.1,
    },
    { ability: 'heatTolerance', weight: tribe.pressures.heat },
    { ability: 'coldTolerance', weight: tribe.pressures.cold },
    { ability: 'waterEngineering', weight: tribe.pressures.water },
    { ability: 'attack', weight: tribe.pressures.competition },
    {
      ability: 'organization',
      weight: tribe.pressures.organization + tribe.pressures.competition * 0.2,
    },
  ];
  const totalWeight = priorities.reduce((sum, entry) => sum + entry.weight, 0);

  if (totalWeight <= 0) {
    return 'foraging';
  }

  const roll = prng.next() * totalWeight;
  let cursor = 0;
  for (const entry of priorities) {
    cursor += entry.weight;
    if (roll <= cursor) {
      return entry.ability;
    }
  }

  return priorities[priorities.length - 1].ability;
}

function applyTribePhase(
  read: WorldState,
  write: WorldState,
  config: SimulationConfig,
  prng: Prng,
  events: SimulationEvent[],
  changedTribeIds: Set<string>,
  populationCarry: Map<string, number>,
) {
  const readTileMap = tilesById(read);
  const readTribeMap = tribesById(read);
  const writeTribeMap = tribesById(write);
  const writeTileMap = tilesById(write);
  const occupancy = occupancyByTile(read);
  const tileLoads = new Map<string, { foraging: number; farming: number }>();
  const orderedIds = shuffleIds(
    read.tribes.map((tribe) => tribe.id),
    prng,
  );

  for (const tribeId of orderedIds) {
    const source = readTribeMap.get(tribeId)!;
    const target = writeTribeMap.get(tribeId)!;
    const tile = readTileMap.get(source.tileId)!;
    const previousPop = target.pop;

    target.statusFlags.migrating = false;
    target.statusFlags.recovering = false;

    const resourceContext = computeTribeResourceContext(
      source,
      tile,
      occupancy.get(source.tileId) ?? source.pop,
    );
    const existingTileLoad = tileLoads.get(source.tileId) ?? { foraging: 0, farming: 0 };
    existingTileLoad.foraging += resourceContext.effectiveForaging;
    existingTileLoad.farming += resourceContext.effectiveFarming;
    tileLoads.set(source.tileId, existingTileLoad);
    const nextPressures = resourceContext.pressures;
    target.pressures = nextPressures;

    const innovationProbability =
      config.globals.G_innovation *
      clamp(Math.log10(Math.max(source.pop, 10)) / 2.4, 0.18, 1.85) *
      (1 + nextPressures.total * 2.8);

    if (prng.next() < innovationProbability) {
      const ability = pickAbility(target, prng);
      const gain = prng.nextInt(1, 3);
      target.abilities[ability].cap = clamp(target.abilities[ability].cap + gain, 0, 100);
      target.abilities[ability].current = clamp(target.abilities[ability].current + gain, 0, 100);
      target.statusFlags.highlighted = true;
      events.push({
        id: eventId('innovation', write.year, events.length),
        year: write.year,
        kind: 'innovation',
        title: `${target.name} adapted`,
        detail: `${ability} improved by +${gain} under ${round(nextPressures.total * 100, 0)} pressure index.`,
        tribeId: target.id,
        tileId: target.tileId,
      });
    } else {
      target.statusFlags.highlighted = false;
    }

    for (const ability of Object.keys(target.abilities) as AbilityKey[]) {
      const abilityState = target.abilities[ability];
      abilityState.current = round(
        clamp(abilityState.current + (abilityState.cap - abilityState.current) * 0.05, 0, 100),
        2,
      );
    }

    const carryingCapacity = resourceContext.carryingCapacity;
    const densityPressure = clamp(source.pop / Math.max(carryingCapacity, 1) - 0.88, 0, 1.4);
    const foodMultiplier = clamp(1 - nextPressures.food * 0.8, 0.08, 1.2);
    const comfortMultiplier = clamp(1 - (nextPressures.heat + nextPressures.cold) * 0.3, 0.5, 1.1);
    const orgMultiplier = 1 + target.abilities.organization.current * 0.005;
    const densityMultiplier = clamp(1 - densityPressure * 0.7, 0.05, 1.05);
    const favorableGrowthBonus = clamp(
      (carryingCapacity / Math.max(source.pop, 1) - 1) * 0.035,
      0,
      0.012,
    );
    const birthRate = clamp(
      (config.globals.G_birth + favorableGrowthBonus) *
        foodMultiplier *
        comfortMultiplier *
        orgMultiplier *
        densityMultiplier,
      0,
      0.18,
    );
    const alleePenalty =
      source.pop < MIN_TRIBE_POPULATION
        ? ((MIN_TRIBE_POPULATION - source.pop) / MIN_TRIBE_POPULATION) * 0.08
        : 0;
    const deathRate = clamp(
      config.globals.G_death +
        nextPressures.food * 0.04 +
        nextPressures.water * 0.05 +
        nextPressures.cold * 0.03 +
        nextPressures.heat * 0.03 +
        nextPressures.competition * 0.02 +
        Math.max(0, source.pop / Math.max(carryingCapacity, 1) - 1) * 0.08 +
        alleePenalty,
      0.001,
      0.24,
    );

    const previousCarry = populationCarry.get(target.id) ?? 0;
    const netExact = source.pop * (birthRate - deathRate) + previousCarry;
    const netWhole = netExact >= 0 ? Math.floor(netExact) : Math.ceil(netExact);
    populationCarry.set(
      target.id,
      clamp(netExact - netWhole, -POPULATION_CARRY_LIMIT, POPULATION_CARRY_LIMIT),
    );
    target.pop = clamp(source.pop + netWhole, 0, MAX_TRIBE_POPULATION);
    target.statusFlags.recovering = target.pop > source.pop;

    if (target.pop !== previousPop || target.pressures.total !== source.pressures.total) {
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
    const huntDepletion =
      load.foraging * 0.005 +
      Math.max(0, huntPressure - 1) * tile.carryingCapacity.hunt * 0.01;
    const agriDepletion =
      load.farming * 0.004 +
      Math.max(0, agriPressure - 1) * tile.carryingCapacity.agri * 0.008;

    writeTile.carryingCapacity.hunt = round(
      clamp(
        writeTile.carryingCapacity.hunt - huntDepletion,
        tile.baseCarryingCapacity.hunt > 0 ? tile.baseCarryingCapacity.hunt * 0.18 : 0,
        tile.baseCarryingCapacity.hunt,
      ),
      2,
    );
    writeTile.carryingCapacity.agri = round(
      clamp(
        writeTile.carryingCapacity.agri - agriDepletion,
        tile.baseCarryingCapacity.agri > 0 ? tile.baseCarryingCapacity.agri * 0.25 : 0,
        tile.baseCarryingCapacity.agri,
      ),
      2,
    );
  }
}
function applyInteractionPhase(read: WorldState, events: SimulationEvent[]) {
  const grouped = new Map<string, TribeState[]>();
  for (const tribe of read.tribes) {
    grouped.set(tribe.tileId, [...(grouped.get(tribe.tileId) ?? []), tribe]);
  }

  for (const [tileId, tribes] of grouped) {
    if (tribes.length < 2) {
      continue;
    }

    const pressure =
      tribes.reduce((sum, tribe) => sum + tribe.pressures.competition, 0) / tribes.length;
    if (pressure > 0.35) {
      events.push({
        id: eventId('warning', read.year, events.length),
        year: read.year,
        kind: 'warning',
        title: 'Crowding tension',
        detail: `${tribes.length} tribes share ${tileId}, raising latent conflict pressure.`,
        tileId,
      });
    }
  }
}

function applyMigrationPhase(
  read: WorldState,
  write: WorldState,
  config: SimulationConfig,
  prng: Prng,
  events: SimulationEvent[],
  changedTribeIds: Set<string>,
) {
  const readTiles = tilesById(read);
  const writeTribes = tribesById(write);
  const occupancy = occupancyByTile(read);

  for (const tribe of read.tribes) {
    const migrationPressure = Math.max(
      tribe.pressures.total,
      tribe.pressures.food * 1.2,
      tribe.pressures.water * 1.1,
    );
    if (migrationPressure < 0.26) {
      continue;
    }

    const currentTile = readTiles.get(tribe.tileId)!;
    const currentOccupancy = (occupancy.get(currentTile.id) ?? 0) / 120;
    const currentScore =
      currentTile.comfort * 2.4 +
      currentTile.water * 0.9 +
      (currentTile.carryingCapacity.hunt + currentTile.carryingCapacity.agri) / 95 -
      currentOccupancy * 2.1;

    let bestTile = currentTile;
    let bestScore = currentScore;

    for (const neighborId of currentTile.neighbors) {
      const neighbor = readTiles.get(neighborId)!;
      const occupancyPenalty = (occupancy.get(neighbor.id) ?? 0) / 120;
      const score =
        neighbor.comfort * 2.4 +
        neighbor.water * 0.9 +
        (neighbor.carryingCapacity.hunt + neighbor.carryingCapacity.agri) / 95 -
        occupancyPenalty * 2.1 -
        (neighbor.terrain === 'desert' ? 1.6 : 0);

      if (score > bestScore) {
        bestScore = score;
        bestTile = neighbor;
      }
    }

    const opportunity = bestScore - currentScore;
    const migrationChance = clamp(
      config.globals.G_migration *
        (0.45 + migrationPressure * 2.6 + Math.max(opportunity, 0) * 0.35),
      0.05,
      0.85,
    );

    const opportunityThreshold = Math.max(0.15 - migrationPressure * 5.0, -3.0);

    if (
      bestTile.id !== currentTile.id &&
      opportunity > opportunityThreshold &&
      prng.next() < migrationChance
    ) {
      const target = writeTribes.get(tribe.id)!;
      target.tileId = bestTile.id;
      target.statusFlags.migrating = true;
      changedTribeIds.add(target.id);
      events.push({
        id: eventId('migration', write.year, events.length),
        year: write.year,
        kind: 'migration',
        title: `${tribe.name} migrated`,
        detail: `${tribe.name} moved from ${currentTile.name} to ${bestTile.name}.`,
        tribeId: tribe.id,
        tileId: bestTile.id,
      });
    }
  }
}

function applyFissionPhase(
  read: WorldState,
  write: WorldState,
  config: SimulationConfig,
  prng: Prng,
  events: SimulationEvent[],
  changedTribeIds: Set<string>,
  populationCarry: Map<string, number>,
) {
  const writeTribes = tribesById(write);
  const nextTribes = [...write.tribes];

  for (const source of read.tribes) {
    if (source.pop < TRIBE_SPLIT_THRESHOLD) {
      continue;
    }

    const target = writeTribes.get(source.id);
    if (!target) {
      continue;
    }

    const splitPressure = clamp(
      (source.pop - 150) / 260 +
        source.pressures.competition * 0.55 +
        source.pressures.organization * 0.35 +
        (1 - config.globals.G_cohesion) -
        target.abilities.organization.current / 420,
      0,
      0.8,
    );

    if (splitPressure < 0.18 || prng.next() >= splitPressure) {
      continue;
    }

    const childPop = clamp(
      Math.floor(source.pop * (0.32 + prng.next() * 0.12)),
      MIN_TRIBE_POPULATION,
      source.pop - MIN_TRIBE_POPULATION,
    );
    if (childPop < MIN_TRIBE_POPULATION || source.pop - childPop < MIN_TRIBE_POPULATION) {
      continue;
    }

    const childId = `${source.id}-branch-${write.year}-${events.length}`;
    target.pop = source.pop - childPop;
    target.relationships = {
      ...target.relationships,
      [childId]: round(TRIBE_RELATION_CAP * 0.4, 2),
    };
    changedTribeIds.add(target.id);

    const child: TribeState = {
      ...structuredClone(target),
      id: childId,
      name: `${source.name} Branch`,
      pop: childPop,
      color: source.color,
      leader: null,
      relationships: {
        [source.id]: round(TRIBE_RELATION_CAP * 0.4, 2),
      },
      alliances: [],
      statusFlags: {
        migrating: false,
        recovering: false,
        highlighted: false,
      },
    };

    for (const ability of Object.keys(child.abilities) as AbilityKey[]) {
      const drift = prng.nextInt(-2, 2);
      child.abilities[ability].cap = clamp(child.abilities[ability].cap + drift, 0, 100);
      child.abilities[ability].current = clamp(
        child.abilities[ability].current + drift,
        0,
        child.abilities[ability].cap,
      );
    }

    nextTribes.push(child);
    populationCarry.set(child.id, 0);
    changedTribeIds.add(child.id);
    events.push({
      id: eventId('system', write.year, events.length),
      year: write.year,
      kind: 'system',
      title: `${source.name} split`,
      detail: `${source.name} exceeded cohesive scale and divided into a new branch at population ${source.pop}.`,
      tribeId: source.id,
      tileId: source.tileId,
    });
  }

  write.tribes = nextTribes;
}

function applyExtinctionPhase(
  state: WorldState,
  events: SimulationEvent[],
  changedTribeIds: Set<string>,
  populationCarry: Map<string, number>,
) {
  const survivors: TribeState[] = [];

  for (const tribe of state.tribes) {
    if (tribe.pop > 0) {
      survivors.push(tribe);
      continue;
    }

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
}

function finalizeState(
  state: WorldState,
  previousMetrics: WorldMetrics,
  events: SimulationEvent[],
): WorldState {
  state.metrics = computeMetrics(state, previousMetrics, events);
  state.history.push({
    year: state.year,
    totalPopulation: state.metrics.totalPopulation,
    tribeCount: state.metrics.tribeCount,
    innovations: state.metrics.innovations,
    conflicts: state.metrics.conflicts,
  });
  state.history = state.history.slice(-72);
  state.eventLog = [...events.reverse(), ...state.eventLog].slice(0, 48);
  return state;
}

export function createSimulationEngine(initialConfig: SimulationConfig): SimulationEngine {
  let config = cloneSimulationConfig(initialConfig);
  let state = createInitialWorldState(config);
  let prng = createPrng(config.seed);
  let populationCarry = new Map(state.tribes.map((tribe) => [tribe.id, 0]));

  function stepOnce(): SimulationStepResult {
    const previousYear = state.year;
    const previousMetrics = state.metrics;
    const emittedEvents: SimulationEvent[] = [];
    const changedTileIds = new Set<string>();
    const changedTribeIds = new Set<string>();

    let current = cloneState(state);
    let staging = cloneState(state);

    applyGlobalPhase(current, staging, config, emittedEvents);
    current = staging;

    staging = cloneState(current);
    applyTilePhase(current, staging, changedTileIds);
    current = staging;

    staging = cloneState(current);
    if (config.enabledSystems.tribeDynamics) {
      applyTribePhase(
        current,
        staging,
        config,
        prng,
        emittedEvents,
        changedTribeIds,
        populationCarry,
      );
    }
    current = staging;

    applyInteractionPhase(current, emittedEvents);

    staging = cloneState(current);
    applyMigrationPhase(current, staging, config, prng, emittedEvents, changedTribeIds);
    current = staging;

    staging = cloneState(current);
    applyFissionPhase(
      current,
      staging,
      config,
      prng,
      emittedEvents,
      changedTribeIds,
      populationCarry,
    );
    current = staging;

    applyExtinctionPhase(current, emittedEvents, changedTribeIds, populationCarry);

    current = finalizeState(current, previousMetrics, emittedEvents);
    state = current;

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
      phases: [...PHASES],
      state: cloneState(state),
    };
  }

  return {
    getState() {
      return cloneState(state);
    },
    getConfig() {
      return cloneSimulationConfig(config);
    },
    step(years = 1) {
      const stepYears = normalizeStepYears(years);
      let result = stepOnce();
      for (let index = 1; index < stepYears; index += 1) {
        result = stepOnce();
      }
      return result;
    },
    enqueueIntervention(command) {
      state.pendingInterventions.push(command);
      state.pendingInterventions.sort((left, right) => left.scheduledYear - right.scheduledYear);
      return this.getState();
    },
    reset(nextConfig = config) {
      config = cloneSimulationConfig(nextConfig);
      state = createInitialWorldState(config);
      prng = createPrng(config.seed);
      populationCarry = new Map(state.tribes.map((tribe) => [tribe.id, 0]));
      return this.getState();
    },
    setRuntimeSpeed(yearsPerSecond) {
      config.runtime.yearsPerSecond = clamp(yearsPerSecond, 1, 240);
    },
  };
}





