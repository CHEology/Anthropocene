import { createInitialWorldState } from '../world/oldWorld';
import { cloneSimulationConfig } from './config';
import { createPrng, type Prng } from './prng';
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
} from './types';

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
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
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
    const totalCapacity =
      previous.carryingCapacity.hunt +
      previous.carryingCapacity.agri +
      previous.carryingCapacity.water;
    const overcrowdingPenalty =
      Math.max(0, totalPopulation / Math.max(totalCapacity, 1) - 1) * 2.4;
    const climateDrift = write.globalClimate.meanTemperature - previous.baseTemperature;
    const terrainPenalty =
      tile.terrain === 'mountain' ? 1.3 : tile.terrain === 'highland' ? 0.6 : 0;

    tile.temperature = round(tile.baseTemperature + (write.globalClimate.meanTemperature - 15), 2);
    tile.carryingCapacity.hunt = round(
      previous.carryingCapacity.hunt +
        (previous.baseCarryingCapacity.hunt - previous.carryingCapacity.hunt) * 0.05,
      2,
    );
    tile.carryingCapacity.agri = round(
      previous.carryingCapacity.agri +
        (previous.baseCarryingCapacity.agri - previous.carryingCapacity.agri) * 0.05,
      2,
    );
    tile.carryingCapacity.water = previous.baseCarryingCapacity.water;
    tile.comfort = round(
      clamp(
        tile.baseComfort - Math.abs(climateDrift) * 0.05 - terrainPenalty - overcrowdingPenalty,
        0.2,
        6,
      ),
      2,
    );

    if (
      previous.temperature !== tile.temperature ||
      previous.comfort !== tile.comfort ||
      previous.carryingCapacity.hunt !== tile.carryingCapacity.hunt ||
      previous.carryingCapacity.agri !== tile.carryingCapacity.agri
    ) {
      changedTileIds.add(tile.id);
    }
  }
}

function derivePressures(tribe: TribeState, tile: TileState, tilePopulation: number) {
  const effectiveForaging =
    tile.carryingCapacity.hunt * (0.35 + tribe.abilities.foraging.current / 140);
  const effectiveFarming =
    tile.carryingCapacity.agri * (tribe.abilities.agriculture.current / 220);
  const totalFoodCapacity = effectiveForaging + effectiveFarming;
  const food = clamp(1 - totalFoodCapacity / Math.max(tribe.pop, 1), 0, 1);
  const heat = clamp(
    (tile.temperature - 22 - tribe.abilities.heatTolerance.current * 0.28) / 20,
    0,
    1,
  );
  const cold = clamp(
    (5 - tile.temperature + tribe.abilities.coldTolerance.current * 0.26) / 20,
    0,
    1,
  );
  const water = clamp(
    (3 - tile.water) / 4 - tribe.abilities.waterEngineering.current / 200,
    0,
    1,
  );
  const competition = clamp(
    tilePopulation / Math.max(tile.carryingCapacity.hunt + tile.carryingCapacity.agri, 1) - 0.65,
    0,
    1,
  );
  const organization = clamp(tribe.pop / 320 - tribe.abilities.organization.current / 120, 0, 1);
  const total = round((food + heat + cold + water + competition + organization) / 6, 3);

  return {
    food: round(food),
    heat: round(heat),
    cold: round(cold),
    water: round(water),
    competition: round(competition),
    organization: round(organization),
    total,
  };
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
) {
  const readTileMap = tilesById(read);
  const readTribeMap = tribesById(read);
  const writeTribeMap = tribesById(write);
  const occupancy = occupancyByTile(read);
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

    const nextPressures = derivePressures(source, tile, occupancy.get(source.tileId) ?? source.pop);
    target.pressures = nextPressures;

    const innovationProbability =
      config.globals.G_innovation *
      clamp(Math.log10(Math.max(source.pop, 10)) / 2.6, 0.12, 1.8) *
      (1 + nextPressures.total * 2.5);

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

    const birthRate =
      config.globals.G_birth *
      clamp(1 - nextPressures.food * 0.75, 0.2, 1.15) *
      clamp(1 - (nextPressures.heat + nextPressures.cold) * 0.25, 0.65, 1.05);
    const deathRate =
      config.globals.G_death +
      nextPressures.food * 0.04 +
      nextPressures.water * 0.03 +
      nextPressures.competition * 0.02;

    const births = Math.floor(source.pop * birthRate);
    const deaths = Math.floor(source.pop * deathRate);
    target.pop = Math.max(18, source.pop + births - deaths);
    target.statusFlags.recovering = target.pop > source.pop;

    if (target.pop !== previousPop || target.pressures.total !== source.pressures.total) {
      changedTribeIds.add(target.id);
    }
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
    if (tribe.pressures.total < 0.55) {
      continue;
    }

    const currentTile = readTiles.get(tribe.tileId)!;
    const currentScore =
      currentTile.comfort * 2 +
      currentTile.water +
      (currentTile.carryingCapacity.hunt + currentTile.carryingCapacity.agri) / 120;

    let bestTile = currentTile;
    let bestScore = currentScore;

    for (const neighborId of currentTile.neighbors) {
      const neighbor = readTiles.get(neighborId)!;
      const occupancyPenalty = (occupancy.get(neighbor.id) ?? 0) / 150;
      const score =
        neighbor.comfort * 2 +
        neighbor.water +
        (neighbor.carryingCapacity.hunt + neighbor.carryingCapacity.agri) / 120 -
        occupancyPenalty -
        (neighbor.terrain === 'desert' ? 1.4 : 0);

      if (score > bestScore) {
        bestScore = score;
        bestTile = neighbor;
      }
    }

    if (
      bestTile.id !== currentTile.id &&
      bestScore > currentScore + 0.35 &&
      prng.next() < config.globals.G_migration * (1 + tribe.pressures.total * 1.8)
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

  function stepOnce(): SimulationStepResult {
    const previousYear = state.year;
    const previousMetrics = state.metrics;
    const emittedEvents: SimulationEvent[] = [];
    const changedTileIds = new Set<string>();
    const changedTribeIds = new Set<string>();

    let current = cloneState(state);
    let staging = cloneState(current);

    applyGlobalPhase(current, staging, config, emittedEvents);
    current = cloneState(staging);

    staging = cloneState(current);
    applyTilePhase(current, staging, changedTileIds);
    current = cloneState(staging);

    staging = cloneState(current);
    if (config.enabledSystems.tribeDynamics) {
      applyTribePhase(current, staging, config, prng, emittedEvents, changedTribeIds);
    }
    current = cloneState(staging);

    applyInteractionPhase(current, emittedEvents);

    staging = cloneState(current);
    applyMigrationPhase(current, staging, config, prng, emittedEvents, changedTribeIds);
    current = cloneState(staging);

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
      let result = stepOnce();
      for (let index = 1; index < years; index += 1) {
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
      return this.getState();
    },
    setRuntimeSpeed(yearsPerSecond) {
      config.runtime.yearsPerSecond = yearsPerSecond;
    },
  };
}

