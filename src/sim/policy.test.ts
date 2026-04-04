import { describe, expect, it } from 'vitest';

import {
  buildMigrationFeatures,
  createEmptyDecisionPolicy,
  decisionAdjustment,
  scoreDecision,
  trainDecisionPolicy,
  type TrainingSample,
} from './policy';

describe('decision policy', () => {
  it('learns to favor frontier migration under crowding and relief', () => {
    const positive = buildMigrationFeatures({
      totalPressure: 0.8,
      foodPressure: 0.7,
      waterPressure: 0.3,
      competition: 0.9,
      healthPressure: 0.2,
      currentRisk: 0.2,
      sedentism: 0.12,
      stage: 'foraging',
      resourceDelta: 0.4,
      waterDelta: 0.1,
      occupancyRelief: 0.7,
      riskRelief: 0.2,
      comfortDelta: -0.05,
      frontier: 1,
      ruggedness: 0.5,
      aridity: 0.1,
      alliedPresence: 0,
      hostilePresence: 0.1,
      resourceCollapse: 0.55,
      storedFood: 0.1,
      geneticRisk: 0.28,
      megafaunaDecline: 0.35,
      storytellerCrisis: 0.42,
      defeatVulnerability: 0.18,
    });
    const negative = buildMigrationFeatures({
      totalPressure: 0.2,
      foodPressure: 0.1,
      waterPressure: 0.1,
      competition: 0.08,
      healthPressure: 0.05,
      currentRisk: 0.1,
      sedentism: 0.8,
      stage: 'cultivation',
      resourceDelta: -0.2,
      waterDelta: -0.1,
      occupancyRelief: -0.2,
      riskRelief: -0.1,
      comfortDelta: 0.1,
      frontier: 0,
      ruggedness: 0.1,
      aridity: 0.4,
      alliedPresence: 0.2,
      hostilePresence: 0.6,
      resourceCollapse: 0.08,
      storedFood: 0.65,
      geneticRisk: 0.06,
      megafaunaDecline: 0.12,
      storytellerCrisis: 0.08,
      defeatVulnerability: 0.05,
    });

    const samples: TrainingSample[] = [];
    for (let index = 0; index < 80; index += 1) {
      samples.push({ action: 'migrate', features: positive, reward: 0.9, weight: 1 });
      samples.push({ action: 'migrate', features: negative, reward: -0.7, weight: 1 });
    }

    const result = trainDecisionPolicy(samples, {
      epochs: 10,
      learningRate: 0.04,
      regularization: 0.001,
      seed: 42,
    });

    expect(scoreDecision(result.model, 'migrate', positive)).toBeGreaterThan(0.4);
    expect(scoreDecision(result.model, 'migrate', negative)).toBeLessThan(-0.2);
    expect(decisionAdjustment(result.model, 'migrate', positive, 0.4)).toBeGreaterThan(1);
  });

  it('returns neutral adjustments for an empty policy', () => {
    const policy = createEmptyDecisionPolicy(1);
    const features = buildMigrationFeatures({
      totalPressure: 0,
      foodPressure: 0,
      waterPressure: 0,
      competition: 0,
      healthPressure: 0,
      currentRisk: 0,
      sedentism: 0.5,
      stage: 'tending',
      resourceDelta: 0,
      waterDelta: 0,
      occupancyRelief: 0,
      riskRelief: 0,
      comfortDelta: 0,
      frontier: 0,
      ruggedness: 0,
      aridity: 0,
      alliedPresence: 0,
      hostilePresence: 0,
      resourceCollapse: 0,
      storedFood: 0,
      geneticRisk: 0,
      megafaunaDecline: 0,
      storytellerCrisis: 0,
      defeatVulnerability: 0,
    });

    expect(scoreDecision(policy, 'migrate', features)).toBe(0);
    expect(decisionAdjustment(policy, 'migrate', features, 0.4)).toBe(1);
  });
});