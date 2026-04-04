/** @vitest-environment node */
import { describe, expect, it } from 'vitest';

import { ApiError } from './core/errors.js';
import { SERVER_LIMITS } from './core/limits.js';
import { SimulationService } from './simulationService.js';

describe('SimulationService', () => {
  it('rejects step requests above the per-request budget', () => {
    const service = new SimulationService();
    const session = service.createSession();

    expect(() =>
      service.stepSession(session.id, SERVER_LIMITS.maxYearsPerRequest + 1),
    ).toThrowError(ApiError);
  });

  it('stays finite over repeated bounded steps', { timeout: 30_000 }, () => {
    const service = new SimulationService();
    const session = service.createSession({ seed: 31415, worldPreset: 'old-world-corridor' });

    for (let index = 0; index < 8; index += 1) {
      const result = service.stepSession(session.id, SERVER_LIMITS.stepChunkYears);
      expect(result.session.state.year).toBe((index + 1) * SERVER_LIMITS.stepChunkYears);
    }

    const state = service.getSessionSnapshot(session.id).state;
    expect(state.year).toBe(8 * SERVER_LIMITS.stepChunkYears);
    expect(state.metrics.totalPopulation).toBeGreaterThan(0);
    expect(state.metrics.averageFoodStores).toBeGreaterThanOrEqual(0);
    expect(state.metrics.averageGeneticDiversity).toBeGreaterThanOrEqual(0);
    expect(state.metrics.averageMegafauna).toBeGreaterThanOrEqual(0);
    expect(state.globalClimate.regime.length).toBeGreaterThan(0);
    expect(state.storyteller.posture.length).toBeGreaterThan(0);
    expect(state.tribes.every((tribe) => Number.isSafeInteger(tribe.pop) && tribe.pop >= 0)).toBe(true);
    expect(state.tiles.every((tile) => Number.isFinite(tile.temperature) && Number.isFinite(tile.comfort))).toBe(true);
  });

  it('keeps alliance references valid through long detailed-eurasia runs', { timeout: 45_000 }, () => {
    const service = new SimulationService();
    const session = service.createSession({ seed: 12045, worldPreset: 'detailed-eurasia' });

    service.stepSession(session.id, 168);
    service.stepSession(session.id, 168);

    const state = service.getSessionSnapshot(session.id).state;
    const tribeIds = new Set(state.tribes.map((tribe) => tribe.id));

    for (const tribe of state.tribes) {
      expect(tribe.alliances.every((allianceId) => tribeIds.has(allianceId))).toBe(true);
    }
  });

  it('sanitizes queued interventions before storing them', () => {
    const service = new SimulationService();
    const session = service.createSession();
    const response = service.enqueueIntervention(session.id, {
      kind: 'climate-pulse',
      label: 'Pulse',
      scheduledYear: 4,
      payload: {
        temperatureDelta: 999,
        duration: 99_999,
      },
    });

    expect(response.command.payload.temperatureDelta).toBe(SERVER_LIMITS.maxClimatePulseDelta);
    expect(response.command.payload.duration).toBe(SERVER_LIMITS.maxClimatePulseDuration);
    expect(response.session.state.pendingInterventions).toHaveLength(1);
  });
});
