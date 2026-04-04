import { randomUUID } from 'node:crypto';
import { DEFAULT_SIMULATION_CONFIG, cloneSimulationConfig } from '../../src/sim/config.js';
import { ApiError, InvariantError } from './errors.js';
import { SERVER_LIMITS } from './limits.js';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function clampFiniteNumber(value, min, max, fallback) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, value));
}
function clampInteger(value, min, max, fallback) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(value)));
}
function finiteNumberOrThrow(value, message, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        throw new InvariantError(message, { value });
    }
}
function safeIntegerOrThrow(value, message, min, max) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
        throw new InvariantError(message, { value });
    }
}
function sanitizeString(value, maxLength, fallback) {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim().slice(0, maxLength);
    return trimmed || fallback;
}
export function sanitizeSimulationConfig(input, baseInput = DEFAULT_SIMULATION_CONFIG) {
    const base = cloneSimulationConfig(baseInput);
    const source = isRecord(input) ? input : {};
    const globals = isRecord(source.globals) ? source.globals : {};
    const runtime = isRecord(source.runtime) ? source.runtime : {};
    const enabledSystems = isRecord(source.enabledSystems) ? source.enabledSystems : {};
    return {
        seed: clampInteger(source.seed, 1, 2_147_483_647, base.seed),
        worldPreset: source.worldPreset === 'old-world-corridor' || source.worldPreset === 'detailed-eurasia'
            ? source.worldPreset
            : base.worldPreset,
        globals: {
            G_birth: clampFiniteNumber(globals.G_birth, 0, 1, base.globals.G_birth),
            G_death: clampFiniteNumber(globals.G_death, 0, 1, base.globals.G_death),
            G_hostility: clampFiniteNumber(globals.G_hostility, 0, 1, base.globals.G_hostility),
            G_disaster: clampFiniteNumber(globals.G_disaster, 0, 1, base.globals.G_disaster),
            G_innovation: clampFiniteNumber(globals.G_innovation, -0.1, 1, base.globals.G_innovation),
            G_cohesion: clampFiniteNumber(globals.G_cohesion, 0, 1, base.globals.G_cohesion),
            G_temp: clampFiniteNumber(globals.G_temp, -20, 40, base.globals.G_temp),
            G_migration: clampFiniteNumber(globals.G_migration, 0, 1, base.globals.G_migration),
        },
        runtime: {
            yearsPerSecond: clampInteger(runtime.yearsPerSecond, 1, 240, base.runtime.yearsPerSecond),
            snapshotThrottleMs: clampInteger(runtime.snapshotThrottleMs, 16, 2_000, base.runtime.snapshotThrottleMs),
        },
        enabledSystems: {
            globalClimate: typeof enabledSystems.globalClimate === 'boolean'
                ? enabledSystems.globalClimate
                : base.enabledSystems.globalClimate,
            tileRecovery: typeof enabledSystems.tileRecovery === 'boolean'
                ? enabledSystems.tileRecovery
                : base.enabledSystems.tileRecovery,
            tribeDynamics: typeof enabledSystems.tribeDynamics === 'boolean'
                ? enabledSystems.tribeDynamics
                : base.enabledSystems.tribeDynamics,
            interventions: typeof enabledSystems.interventions === 'boolean'
                ? enabledSystems.interventions
                : base.enabledSystems.interventions,
        },
    };
}
export function sanitizeStepYears(years, currentYear) {
    if (years === undefined) {
        return 1;
    }
    if (typeof years !== 'number' || !Number.isFinite(years)) {
        throw new ApiError(400, 'invalid_years', 'Step years must be a finite number.');
    }
    const wholeYears = Math.trunc(years);
    if (wholeYears < 1) {
        throw new ApiError(422, 'invalid_years', 'Step years must be at least 1.');
    }
    if (wholeYears > SERVER_LIMITS.maxYearsPerRequest) {
        throw new ApiError(422, 'step_budget_exceeded', `A single request may advance at most ${SERVER_LIMITS.maxYearsPerRequest} years.`);
    }
    if (currentYear + wholeYears > SERVER_LIMITS.maxYearsPerSession) {
        throw new ApiError(422, 'timeline_limit_exceeded', `This session cannot advance past year ${SERVER_LIMITS.maxYearsPerSession}.`);
    }
    return wholeYears;
}
export function sanitizeInterventionInput(input, currentYear) {
    if (!isRecord(input)) {
        throw new ApiError(400, 'invalid_intervention', 'Intervention payload must be an object.');
    }
    const kind = input.kind === 'climate-pulse' || input.kind === 'observation-note'
        ? input.kind
        : undefined;
    if (!kind) {
        throw new ApiError(422, 'invalid_intervention', 'Intervention kind must be climate-pulse or observation-note.');
    }
    const scheduledYear = clampInteger(input.scheduledYear, currentYear, SERVER_LIMITS.maxYearsPerSession, currentYear);
    const payload = isRecord(input.payload) ? input.payload : {};
    const label = sanitizeString(input.label, SERVER_LIMITS.maxLabelLength, kind === 'climate-pulse' ? 'Climate pulse' : 'Observation note');
    if (kind === 'climate-pulse') {
        return {
            id: sanitizeString(input.id, SERVER_LIMITS.maxIdLength, `cmd-${randomUUID()}`),
            label,
            kind,
            scheduledYear,
            payload: {
                temperatureDelta: clampFiniteNumber(payload.temperatureDelta, -SERVER_LIMITS.maxClimatePulseDelta, SERVER_LIMITS.maxClimatePulseDelta, 0),
                duration: clampInteger(payload.duration, 1, SERVER_LIMITS.maxClimatePulseDuration, 120),
            },
        };
    }
    return {
        id: sanitizeString(input.id, SERVER_LIMITS.maxIdLength, `cmd-${randomUUID()}`),
        label,
        kind,
        scheduledYear,
        payload: {
            note: sanitizeString(payload.note, SERVER_LIMITS.maxNoteLength, label),
        },
    };
}
export function trimStateForTransport(state) {
    return {
        ...structuredClone(state),
        eventLog: state.eventLog.slice(0, SERVER_LIMITS.maxEventLog),
        history: state.history.slice(-SERVER_LIMITS.maxHistoryPoints),
        pendingInterventions: state.pendingInterventions.slice(0, SERVER_LIMITS.maxPendingInterventions),
        executedInterventions: state.executedInterventions.slice(0, SERVER_LIMITS.maxExecutedInterventions),
    };
}
export function assertWorldStateInvariants(state) {
    safeIntegerOrThrow(state.year, 'World year is outside the supported simulation horizon.', 0, SERVER_LIMITS.maxYearsPerSession);
    safeIntegerOrThrow(state.seed, 'World seed is not a supported 32-bit integer.', 1, 2_147_483_647);
    finiteNumberOrThrow(state.globalClimate.baseline, 'Global climate baseline must remain finite and bounded.', SERVER_LIMITS.minTemperature, SERVER_LIMITS.maxTemperature);
    finiteNumberOrThrow(state.globalClimate.anomaly, 'Global climate anomaly must remain finite and bounded.', -SERVER_LIMITS.maxClimatePulseDelta * 4, SERVER_LIMITS.maxClimatePulseDelta * 4);
    finiteNumberOrThrow(state.globalClimate.meanTemperature, 'Global mean temperature must remain finite and bounded.', SERVER_LIMITS.minTemperature, SERVER_LIMITS.maxTemperature);
    safeIntegerOrThrow(state.metrics.totalPopulation, 'World total population must remain within backend limits.', 0, SERVER_LIMITS.maxMetricMagnitude);
    safeIntegerOrThrow(state.metrics.tribeCount, 'World tribe counts must remain within backend limits.', 0, SERVER_LIMITS.maxTribes);
    safeIntegerOrThrow(state.metrics.innovations, 'World innovation counts must remain within backend limits.', 0, SERVER_LIMITS.maxMetricMagnitude);
    safeIntegerOrThrow(state.metrics.conflicts, 'World conflict counts must remain within backend limits.', 0, SERVER_LIMITS.maxMetricMagnitude);
    finiteNumberOrThrow(state.metrics.averageComfort, 'World mean comfort must remain finite and bounded.', 0, SERVER_LIMITS.maxMeanComfort);
    finiteNumberOrThrow(state.metrics.averagePressure, 'World mean pressure must remain finite and bounded.', 0, SERVER_LIMITS.maxPressure);
    finiteNumberOrThrow(state.metrics.averageFoodStores, 'World mean food stores must remain finite and bounded.', 0, 1);
    finiteNumberOrThrow(state.metrics.averageGeneticDiversity, 'World mean genetic diversity must remain finite and bounded.', 0, 1);
    finiteNumberOrThrow(state.metrics.averageMegafauna, 'World mean megafauna must remain finite and bounded.', 0, 1);
    safeIntegerOrThrow(state.metrics.activeHazards, 'Active hazard counts must remain within backend limits.', 0, SERVER_LIMITS.maxMetricMagnitude);
    safeIntegerOrThrow(state.metrics.activePlagues, 'Active plague counts must remain within backend limits.', 0, SERVER_LIMITS.maxMetricMagnitude);
    if (state.tiles.length > SERVER_LIMITS.maxTiles) {
        throw new InvariantError('Tile count exceeds the backend safety limit.', {
            tileCount: state.tiles.length,
        });
    }
    if (state.tribes.length > SERVER_LIMITS.maxTribes) {
        throw new InvariantError('Tribe count exceeds the backend safety limit.', {
            tribeCount: state.tribes.length,
        });
    }
    const tileIds = new Set();
    for (const tile of state.tiles) {
        if (tileIds.has(tile.id)) {
            throw new InvariantError('Duplicate tile ids detected in world state.', { tileId: tile.id });
        }
        tileIds.add(tile.id);
        finiteNumberOrThrow(tile.water, 'Tile water value must remain finite and bounded.', 0, SERVER_LIMITS.maxCapacity);
        finiteNumberOrThrow(tile.temperature, 'Tile temperature value must remain finite and bounded.', SERVER_LIMITS.minTemperature, SERVER_LIMITS.maxTemperature);
        finiteNumberOrThrow(tile.comfort, 'Tile comfort value must remain finite and bounded.', 0, SERVER_LIMITS.maxMeanComfort);
        finiteNumberOrThrow(tile.elevation, 'Tile elevation must remain finite and bounded.', -12000, 12000);
        finiteNumberOrThrow(tile.megafaunaIndex, 'Tile megafauna index must remain finite and bounded.', 0, 1);
        finiteNumberOrThrow(tile.carryingCapacity.hunt, 'Tile hunting capacity must remain finite and bounded.', 0, SERVER_LIMITS.maxCapacity);
        finiteNumberOrThrow(tile.carryingCapacity.agri, 'Tile agricultural capacity must remain finite and bounded.', 0, SERVER_LIMITS.maxCapacity);
        finiteNumberOrThrow(tile.carryingCapacity.water, 'Tile water capacity must remain finite and bounded.', 0, SERVER_LIMITS.maxCapacity);
        for (const disaster of tile.activeDisasters) {
            finiteNumberOrThrow(disaster.severity, 'Disaster severity must remain finite and bounded.', 0, 1);
            safeIntegerOrThrow(disaster.remainingYears, 'Disaster duration must remain within supported bounds.', 0, SERVER_LIMITS.maxYearsPerSession);
        }
        for (const plague of tile.activePlagues) {
            finiteNumberOrThrow(plague.severity, 'Plague severity must remain finite and bounded.', 0, 1);
            safeIntegerOrThrow(plague.remainingYears, 'Plague duration must remain within supported bounds.', 0, SERVER_LIMITS.maxYearsPerSession);
        }
    }
    const tribeIds = new Set();
    for (const tribe of state.tribes) {
        if (tribeIds.has(tribe.id)) {
            throw new InvariantError('Duplicate tribe ids detected in world state.', {
                tribeId: tribe.id,
            });
        }
        tribeIds.add(tribe.id);
        if (!tileIds.has(tribe.tileId)) {
            throw new InvariantError('Tribe references a tile that does not exist.', {
                tribeId: tribe.id,
                tileId: tribe.tileId,
            });
        }
        safeIntegerOrThrow(tribe.pop, 'Tribe population must remain a safe integer within backend limits.', 0, SERVER_LIMITS.maxPopulation);
        finiteNumberOrThrow(tribe.pressures.total, 'Tribe total pressure must remain finite and bounded.', 0, SERVER_LIMITS.maxPressure);
        finiteNumberOrThrow(tribe.pressures.health, 'Tribe health pressure must remain finite and bounded.', 0, SERVER_LIMITS.maxPressure);
        finiteNumberOrThrow(tribe.development.domestication, 'Tribe domestication progress must remain finite and bounded.', 0, 100);
        finiteNumberOrThrow(tribe.development.sedentism, 'Tribe sedentism must remain finite and bounded.', 0, 1);
        finiteNumberOrThrow(tribe.geneticDiversity, 'Tribe genetic diversity must remain finite and bounded.', 0, 1);
        finiteNumberOrThrow(tribe.foodStores, 'Tribe food stores must remain finite and bounded.', 0, 1);
        finiteNumberOrThrow(tribe.exchange.tradeVolume, 'Trade volume must remain finite and bounded.', 0, SERVER_LIMITS.maxPressure);
        finiteNumberOrThrow(tribe.exchange.diffusion, 'Diffusion values must remain finite and bounded.', 0, SERVER_LIMITS.maxPressure);
        finiteNumberOrThrow(tribe.exchange.raidExposure, 'Raid exposure must remain finite and bounded.', 0, SERVER_LIMITS.maxPressure);
        finiteNumberOrThrow(tribe.exchange.warExhaustion, 'War exhaustion must remain finite and bounded.', 0, SERVER_LIMITS.maxPressure);
        if (tribe.leader) {
            safeIntegerOrThrow(tribe.leader.age, 'Leader age must remain a safe integer.', 0, 120);
            safeIntegerOrThrow(tribe.leader.tenure, 'Leader tenure must remain a safe integer.', 0, SERVER_LIMITS.maxYearsPerSession);
            finiteNumberOrThrow(tribe.leader.authority, 'Leader authority must remain finite and bounded.', 0, 1);
            finiteNumberOrThrow(tribe.leader.legitimacy, 'Leader legitimacy must remain finite and bounded.', 0, 1);
        }
        for (const ability of Object.values(tribe.abilities)) {
            finiteNumberOrThrow(ability.cap, 'Ability caps must remain finite.', 0, 100);
            finiteNumberOrThrow(ability.current, 'Ability values must remain finite.', 0, 100);
        }
        for (const relation of Object.values(tribe.relationships)) {
            finiteNumberOrThrow(relation, 'Relationship values must remain finite and bounded.', -1, 1);
        }
    }
    for (const tribe of state.tribes) {
        for (const allianceId of tribe.alliances) {
            if (!tribeIds.has(allianceId)) {
                throw new InvariantError('Alliance references a tribe that does not exist.', {
                    tribeId: tribe.id,
                    allianceId,
                });
            }
        }
    }
    if (state.pendingInterventions.length > SERVER_LIMITS.maxPendingInterventions) {
        throw new InvariantError('Pending interventions exceed the backend queue limit.', {
            pendingInterventions: state.pendingInterventions.length,
        });
    }
    if (state.eventLog.length > SERVER_LIMITS.maxEventLog) {
        throw new InvariantError('Event log exceeds the backend transport limit.', {
            eventLog: state.eventLog.length,
        });
    }
    for (const point of state.history) {
        safeIntegerOrThrow(point.year, 'History points must use safe integer years.', 0, SERVER_LIMITS.maxYearsPerSession);
        safeIntegerOrThrow(point.totalPopulation, 'History population values must remain within backend limits.', 0, SERVER_LIMITS.maxMetricMagnitude);
        safeIntegerOrThrow(point.tribeCount, 'History tribe counts must remain within backend limits.', 0, SERVER_LIMITS.maxTribes);
        safeIntegerOrThrow(point.innovations, 'History innovation counts must remain within backend limits.', 0, SERVER_LIMITS.maxMetricMagnitude);
        safeIntegerOrThrow(point.conflicts, 'History conflict counts must remain within backend limits.', 0, SERVER_LIMITS.maxMetricMagnitude);
    }
}
