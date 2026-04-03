import { randomUUID } from 'node:crypto';
import { cloneSimulationConfig } from '../src/sim/config.js';
import { createSimulationEngine } from '../src/sim/engine.js';
import { ApiError } from './core/errors.js';
import { SERVER_LIMITS } from './core/limits.js';
import { assertWorldStateInvariants, sanitizeInterventionInput, sanitizeSimulationConfig, sanitizeStepYears, trimStateForTransport, } from './core/validation.js';
function iso(timestamp) {
    return new Date(timestamp).toISOString();
}
export class SimulationService {
    sessions = new Map();
    now;
    constructor(options = {}) {
        this.now = options.now ?? (() => Date.now());
    }
    createSession(input) {
        this.pruneSessions();
        const config = sanitizeSimulationConfig(input);
        const engine = createSimulationEngine(config);
        const now = this.now();
        const record = {
            id: randomUUID(),
            engine,
            config,
            createdAt: now,
            lastAccessAt: now,
            advancedYears: 0,
        };
        assertWorldStateInvariants(record.engine.getState());
        this.sessions.set(record.id, record);
        return this.snapshot(record);
    }
    getSessionSnapshot(sessionId) {
        const record = this.getRecord(sessionId);
        return this.snapshot(record);
    }
    stepSession(sessionId, yearsInput) {
        const record = this.getRecord(sessionId);
        const currentState = record.engine.getState();
        const requestedYears = sanitizeStepYears(yearsInput, currentState.year);
        let remaining = requestedYears;
        let finalResult = null;
        while (remaining > 0) {
            const chunk = Math.min(remaining, SERVER_LIMITS.stepChunkYears);
            finalResult = record.engine.step(chunk);
            assertWorldStateInvariants(finalResult.state);
            remaining -= chunk;
        }
        if (!finalResult) {
            throw new ApiError(500, 'step_failed', 'The simulation did not produce a step result.');
        }
        record.advancedYears += requestedYears;
        record.lastAccessAt = this.now();
        return {
            session: this.snapshot(record, finalResult.state),
            result: {
                previousYear: finalResult.previousYear,
                nextYear: finalResult.nextYear,
                emittedEvents: finalResult.emittedEvents,
                changedTileIds: finalResult.changedTileIds,
                changedTribeIds: finalResult.changedTribeIds,
                metricsDelta: finalResult.metricsDelta,
                phases: finalResult.phases,
                requestedYears,
            },
        };
    }
    enqueueIntervention(sessionId, input) {
        const record = this.getRecord(sessionId);
        const state = record.engine.getState();
        if (state.pendingInterventions.length >= SERVER_LIMITS.maxPendingInterventions) {
            throw new ApiError(422, 'intervention_queue_full', `A session may queue at most ${SERVER_LIMITS.maxPendingInterventions} interventions.`);
        }
        const command = sanitizeInterventionInput(input, state.year);
        record.engine.enqueueIntervention(command);
        record.lastAccessAt = this.now();
        const nextState = record.engine.getState();
        assertWorldStateInvariants(nextState);
        return {
            session: this.snapshot(record, nextState),
            command,
        };
    }
    resetSession(sessionId, input) {
        const record = this.getRecord(sessionId);
        const nextConfig = sanitizeSimulationConfig(input, record.config);
        record.config = nextConfig;
        record.engine.reset(nextConfig);
        record.advancedYears = 0;
        record.lastAccessAt = this.now();
        const state = record.engine.getState();
        assertWorldStateInvariants(state);
        return this.snapshot(record, state);
    }
    deleteSession(sessionId) {
        if (!this.sessions.delete(sessionId)) {
            throw new ApiError(404, 'session_not_found', 'Simulation session not found.');
        }
    }
    getHealth() {
        this.pruneSessions();
        return {
            status: 'ok',
            sessions: {
                active: this.sessions.size,
                max: SERVER_LIMITS.maxSessions,
                ttlMs: SERVER_LIMITS.sessionTtlMs,
            },
            limits: {
                maxYearsPerRequest: SERVER_LIMITS.maxYearsPerRequest,
                maxYearsPerSession: SERVER_LIMITS.maxYearsPerSession,
                stepChunkYears: SERVER_LIMITS.stepChunkYears,
            },
        };
    }
    snapshot(record, stateInput) {
        const state = trimStateForTransport(stateInput ?? record.engine.getState());
        assertWorldStateInvariants(state);
        return {
            id: record.id,
            createdAt: iso(record.createdAt),
            lastAccessAt: iso(record.lastAccessAt),
            advancedYears: record.advancedYears,
            config: cloneSimulationConfig(record.config),
            state,
            limits: {
                maxYearsPerRequest: SERVER_LIMITS.maxYearsPerRequest,
                maxYearsPerSession: SERVER_LIMITS.maxYearsPerSession,
                maxPendingInterventions: SERVER_LIMITS.maxPendingInterventions,
            },
        };
    }
    getRecord(sessionId) {
        this.pruneSessions();
        const record = this.sessions.get(sessionId);
        if (!record) {
            throw new ApiError(404, 'session_not_found', 'Simulation session not found.');
        }
        record.lastAccessAt = this.now();
        return record;
    }
    pruneSessions() {
        const now = this.now();
        for (const [sessionId, record] of this.sessions) {
            if (now - record.lastAccessAt > SERVER_LIMITS.sessionTtlMs) {
                this.sessions.delete(sessionId);
            }
        }
        while (this.sessions.size >= SERVER_LIMITS.maxSessions) {
            const oldest = [...this.sessions.values()].sort((left, right) => left.lastAccessAt - right.lastAccessAt)[0];
            if (!oldest) {
                break;
            }
            this.sessions.delete(oldest.id);
        }
    }
}
