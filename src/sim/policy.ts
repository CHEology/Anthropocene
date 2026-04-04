import type { AgricultureStage, TerrainType } from './types.js';
import { createPrng } from './prng.js';

export type DecisionAction = 'migrate' | 'trade' | 'raid' | 'ally' | 'intensify';

export const DECISION_FEATURE_NAMES = [
  'pressureTotal',
  'foodPressure',
  'waterPressure',
  'competition',
  'healthPressure',
  'risk',
  'mobility',
  'sedentism',
  'stageLevel',
  'resourceDelta',
  'waterDelta',
  'occupancyRelief',
  'riskRelief',
  'comfortDelta',
  'resourceCollapse',
  'storedFood',
  'geneticRisk',
  'megafaunaDecline',
  'storytellerCrisis',
  'defeatVulnerability',
  'frontier',
  'ruggedness',
  'aridity',
  'allySupport',
  'hostility',
  'relation',
  'complementarity',
  'strengthEdge',
  'exchangePotential',
  'agriSuitability',
  'diffusion',
  'organization',
] as const;

export type DecisionFeatureName = (typeof DECISION_FEATURE_NAMES)[number];
export type DecisionFeatures = Record<DecisionFeatureName, number>;

export interface DecisionPolicyActionModel {
  bias: number;
  weights: Record<DecisionFeatureName, number>;
}

export interface LearnedDecisionPolicy {
  version: string;
  trainedAt: string;
  trainingSeed: number;
  sampleCount: number;
  actions: Record<DecisionAction, DecisionPolicyActionModel>;
}

export interface TrainingSample {
  action: DecisionAction;
  features: DecisionFeatures;
  reward: number;
  weight?: number;
}

export interface DecisionTrainingOptions {
  epochs?: number;
  learningRate?: number;
  regularization?: number;
  seed?: number;
}

export interface DecisionTrainingResult {
  model: LearnedDecisionPolicy;
  metrics: {
    sampleCount: number;
    epochs: number;
    mae: number;
    mse: number;
    averageReward: number;
  };
}

export interface MigrationFeatureInput {
  totalPressure: number;
  foodPressure: number;
  waterPressure: number;
  competition: number;
  healthPressure: number;
  currentRisk: number;
  sedentism: number;
  stage: AgricultureStage;
  resourceDelta: number;
  waterDelta: number;
  occupancyRelief: number;
  riskRelief: number;
  comfortDelta: number;
  frontier: number;
  ruggedness: number;
  aridity: number;
  alliedPresence: number;
  hostilePresence: number;
  resourceCollapse: number;
  storedFood: number;
  geneticRisk: number;
  megafaunaDecline: number;
  storytellerCrisis: number;
  defeatVulnerability: number;
}

export interface TradeFeatureInput {
  foodPressure: number;
  waterPressure: number;
  competition: number;
  healthPressure: number;
  risk: number;
  sedentism: number;
  stage: AgricultureStage;
  relation: number;
  complementarity: number;
  exchangePotential: number;
  alliedPresence: number;
  hostility: number;
  resourceCollapse: number;
  storedFood: number;
  geneticRisk: number;
  megafaunaDecline: number;
  storytellerCrisis: number;
  defeatVulnerability: number;
}

export interface RaidFeatureInput {
  foodPressure: number;
  competition: number;
  healthPressure: number;
  risk: number;
  sedentism: number;
  stage: AgricultureStage;
  hostility: number;
  relation: number;
  strengthEdge: number;
  exchangePotential: number;
  frontier: number;
  ruggedness: number;
  aridity: number;
  resourceCollapse: number;
  storedFood: number;
  geneticRisk: number;
  megafaunaDecline: number;
  storytellerCrisis: number;
  defeatVulnerability: number;
}

export interface AllianceFeatureInput {
  competition: number;
  healthPressure: number;
  risk: number;
  sedentism: number;
  stage: AgricultureStage;
  relation: number;
  complementarity: number;
  exchangePotential: number;
  alliedPresence: number;
  hostility: number;
  resourceCollapse: number;
  storedFood: number;
  geneticRisk: number;
  megafaunaDecline: number;
  storytellerCrisis: number;
  defeatVulnerability: number;
}

export interface IntensifyFeatureInput {
  totalPressure: number;
  foodPressure: number;
  waterPressure: number;
  healthPressure: number;
  risk: number;
  sedentism: number;
  stage: AgricultureStage;
  agriSuitability: number;
  ruggedness: number;
  aridity: number;
  diffusion: number;
  exchangePotential: number;
  organization: number;
  resourceCollapse: number;
  storedFood: number;
  geneticRisk: number;
  megafaunaDecline: number;
  storytellerCrisis: number;
  defeatVulnerability: number;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

export function stageLevel(stage: AgricultureStage) {
  switch (stage) {
    case 'foraging':
      return 0;
    case 'tending':
      return 0.25;
    case 'cultivation':
      return 0.5;
    case 'agropastoral':
      return 0.75;
    case 'settled-farming':
      return 1;
    default:
      return 0;
  }
}

export function terrainRuggedness(terrain: TerrainType) {
  if (terrain === 'mountain') {
    return 0.95;
  }
  if (terrain === 'highland') {
    return 0.72;
  }
  if (terrain === 'steppe') {
    return 0.38;
  }
  if (terrain === 'forest') {
    return 0.26;
  }
  return 0;
}

export function terrainAridity(terrain: TerrainType) {
  if (terrain === 'desert') {
    return 1;
  }
  if (terrain === 'steppe') {
    return 0.32;
  }
  if (terrain === 'mountain') {
    return 0.18;
  }
  return 0;
}

function createEmptyFeatures(): DecisionFeatures {
  return Object.fromEntries(
    DECISION_FEATURE_NAMES.map((name) => [name, 0]),
  ) as DecisionFeatures;
}

export function createEmptyDecisionPolicy(seed = 0): LearnedDecisionPolicy {
  const actions = Object.fromEntries(
    (['migrate', 'trade', 'raid', 'ally', 'intensify'] as DecisionAction[]).map((action) => [
      action,
      {
        bias: 0,
        weights: createEmptyFeatures(),
      },
    ]),
  ) as LearnedDecisionPolicy['actions'];

  return {
    version: 'linear-contextual-v1',
    trainedAt: '1970-01-01T00:00:00.000Z',
    trainingSeed: seed,
    sampleCount: 0,
    actions,
  };
}

function sanitizeFeatureValue(value: number) {
  return round(clamp(value, -1.5, 1.5), 5);
}

function buildFeatureSet(partial: Partial<DecisionFeatures>): DecisionFeatures {
  const features = createEmptyFeatures();
  for (const name of DECISION_FEATURE_NAMES) {
    features[name] = sanitizeFeatureValue(partial[name] ?? 0);
  }
  return features;
}

export function buildMigrationFeatures(input: MigrationFeatureInput): DecisionFeatures {
  const mobility = clamp(1 - input.sedentism, 0, 1);
  return buildFeatureSet({
    pressureTotal: input.totalPressure,
    foodPressure: input.foodPressure,
    waterPressure: input.waterPressure,
    competition: input.competition,
    healthPressure: input.healthPressure,
    risk: input.currentRisk,
    mobility,
    sedentism: input.sedentism,
    stageLevel: stageLevel(input.stage),
    resourceDelta: input.resourceDelta,
    waterDelta: input.waterDelta,
    occupancyRelief: input.occupancyRelief,
    riskRelief: input.riskRelief,
    comfortDelta: input.comfortDelta,
    resourceCollapse: input.resourceCollapse,
    storedFood: input.storedFood,
    geneticRisk: input.geneticRisk,
    megafaunaDecline: input.megafaunaDecline,
    storytellerCrisis: input.storytellerCrisis,
    defeatVulnerability: input.defeatVulnerability,
    frontier: input.frontier,
    ruggedness: input.ruggedness,
    aridity: input.aridity,
    allySupport: input.alliedPresence,
    hostility: input.hostilePresence,
  });
}

export function buildTradeFeatures(input: TradeFeatureInput): DecisionFeatures {
  const mobility = clamp(1 - input.sedentism, 0, 1);
  return buildFeatureSet({
    foodPressure: input.foodPressure,
    waterPressure: input.waterPressure,
    competition: input.competition,
    healthPressure: input.healthPressure,
    risk: input.risk,
    mobility,
    sedentism: input.sedentism,
    stageLevel: stageLevel(input.stage),
    allySupport: input.alliedPresence,
    hostility: input.hostility,
    relation: input.relation,
    complementarity: input.complementarity,
    exchangePotential: input.exchangePotential,
    resourceCollapse: input.resourceCollapse,
    storedFood: input.storedFood,
    geneticRisk: input.geneticRisk,
    megafaunaDecline: input.megafaunaDecline,
    storytellerCrisis: input.storytellerCrisis,
    defeatVulnerability: input.defeatVulnerability,
  });
}

export function buildRaidFeatures(input: RaidFeatureInput): DecisionFeatures {
  const mobility = clamp(1 - input.sedentism, 0, 1);
  return buildFeatureSet({
    foodPressure: input.foodPressure,
    competition: input.competition,
    healthPressure: input.healthPressure,
    risk: input.risk,
    mobility,
    sedentism: input.sedentism,
    stageLevel: stageLevel(input.stage),
    exchangePotential: input.exchangePotential,
    hostility: input.hostility,
    relation: input.relation,
    strengthEdge: input.strengthEdge,
    resourceCollapse: input.resourceCollapse,
    storedFood: input.storedFood,
    geneticRisk: input.geneticRisk,
    megafaunaDecline: input.megafaunaDecline,
    storytellerCrisis: input.storytellerCrisis,
    defeatVulnerability: input.defeatVulnerability,
    frontier: input.frontier,
    ruggedness: input.ruggedness,
    aridity: input.aridity,
  });
}

export function buildAllianceFeatures(input: AllianceFeatureInput): DecisionFeatures {
  const mobility = clamp(1 - input.sedentism, 0, 1);
  return buildFeatureSet({
    competition: input.competition,
    healthPressure: input.healthPressure,
    risk: input.risk,
    mobility,
    sedentism: input.sedentism,
    stageLevel: stageLevel(input.stage),
    allySupport: input.alliedPresence,
    hostility: input.hostility,
    relation: input.relation,
    complementarity: input.complementarity,
    exchangePotential: input.exchangePotential,
    resourceCollapse: input.resourceCollapse,
    storedFood: input.storedFood,
    geneticRisk: input.geneticRisk,
    megafaunaDecline: input.megafaunaDecline,
    storytellerCrisis: input.storytellerCrisis,
    defeatVulnerability: input.defeatVulnerability,
  });
}

export function buildIntensifyFeatures(input: IntensifyFeatureInput): DecisionFeatures {
  const mobility = clamp(1 - input.sedentism, 0, 1);
  return buildFeatureSet({
    pressureTotal: input.totalPressure,
    foodPressure: input.foodPressure,
    waterPressure: input.waterPressure,
    healthPressure: input.healthPressure,
    risk: input.risk,
    mobility,
    sedentism: input.sedentism,
    stageLevel: stageLevel(input.stage),
    ruggedness: input.ruggedness,
    aridity: input.aridity,
    exchangePotential: input.exchangePotential,
    agriSuitability: input.agriSuitability,
    diffusion: input.diffusion,
    organization: input.organization,
    resourceCollapse: input.resourceCollapse,
    storedFood: input.storedFood,
    geneticRisk: input.geneticRisk,
    megafaunaDecline: input.megafaunaDecline,
    storytellerCrisis: input.storytellerCrisis,
    defeatVulnerability: input.defeatVulnerability,
  });
}

export function estimateActionReward(action: DecisionAction, features: DecisionFeatures) {
  switch (action) {
    case 'migrate':
      return round(
        clamp(
          features.resourceDelta * 0.54 +
            features.waterDelta * 0.2 +
            features.occupancyRelief * 0.38 +
            features.riskRelief * 0.24 +
            features.frontier * (0.18 + features.mobility * 0.08) +
            features.ruggedness * features.mobility * 0.08 +
            features.comfortDelta * 0.04 +
            features.allySupport * 0.08 +
            features.geneticRisk * 0.08 +
            features.megafaunaDecline * 0.16 +
            features.storytellerCrisis * 0.08 +
            features.defeatVulnerability * 0.12 -
            features.resourceCollapse * 0.24 -
            features.storedFood * 0.18 -
            features.aridity * (0.12 + features.waterPressure * 0.08) -
            features.hostility * 0.1 -
            features.sedentism * 0.18,
          -1.2,
          1.2,
        ),
        4,
      );
    case 'trade':
      return round(
        clamp(
          features.exchangePotential * 0.56 +
            features.complementarity * 0.22 +
            features.relation * 0.24 +
            features.allySupport * 0.08 +
            features.stageLevel * 0.05 +
            features.storedFood * 0.04 +
            features.geneticRisk * 0.08 +
            features.storytellerCrisis * 0.06 -
            features.resourceCollapse * 0.08 -
            features.hostility * 0.24 -
            features.competition * 0.12 -
            features.risk * 0.08,
          -1.2,
          1.2,
        ),
        4,
      );
    case 'raid':
      return round(
        clamp(
          features.hostility * 0.34 +
            features.strengthEdge * 0.3 +
            features.exchangePotential * 0.16 +
            features.foodPressure * 0.18 +
            features.competition * 0.24 +
            features.mobility * 0.1 +
            features.frontier * 0.05 +
            features.resourceCollapse * 0.08 +
            features.megafaunaDecline * 0.06 +
            features.storytellerCrisis * 0.08 +
            features.defeatVulnerability * 0.12 -
            features.storedFood * 0.14 -
            features.relation * 0.22 -
            features.healthPressure * 0.1 -
            features.risk * 0.08,
          -1.2,
          1.2,
        ),
        4,
      );
    case 'ally':
      return round(
        clamp(
          features.relation * 0.5 +
            features.exchangePotential * 0.24 +
            features.complementarity * 0.16 +
            features.allySupport * 0.1 +
            features.storedFood * 0.04 +
            features.geneticRisk * 0.12 +
            features.storytellerCrisis * 0.06 -
            features.defeatVulnerability * 0.06 -
            features.hostility * 0.3 -
            features.competition * 0.14 -
            features.risk * 0.08,
          -1.2,
          1.2,
        ),
        4,
      );
    case 'intensify':
    default:
      return round(
        clamp(
          features.agriSuitability * 0.54 +
            features.foodPressure * 0.2 +
            features.diffusion * 0.18 +
            features.organization * 0.14 +
            features.exchangePotential * 0.1 +
            features.stageLevel * 0.08 +
            features.resourceCollapse * 0.22 +
            features.megafaunaDecline * 0.24 +
            features.geneticRisk * 0.08 +
            features.storytellerCrisis * 0.06 -
            features.storedFood * 0.12 -
            features.defeatVulnerability * 0.08 -
            features.risk * 0.22 -
            features.mobility * 0.18 -
            features.aridity * 0.16 -
            features.ruggedness * 0.1,
          -1.2,
          1.2,
        ),
        4,
      );
  }
}

export function scoreDecision(
  policy: LearnedDecisionPolicy | null | undefined,
  action: DecisionAction,
  features: DecisionFeatures,
) {
  if (!policy) {
    return 0;
  }

  const model = policy.actions[action];
  let score = model.bias;
  for (const name of DECISION_FEATURE_NAMES) {
    score += (model.weights[name] ?? 0) * features[name];
  }
  return score;
}

export function decisionAdjustment(
  policy: LearnedDecisionPolicy | null | undefined,
  action: DecisionAction,
  features: DecisionFeatures,
  magnitude = 0.35,
) {
  const score = scoreDecision(policy, action, features);
  return round(1 + Math.tanh(score) * magnitude, 4);
}

export function trainDecisionPolicy(
  samples: TrainingSample[],
  options: DecisionTrainingOptions = {},
): DecisionTrainingResult {
  const epochs = options.epochs ?? 12;
  const learningRate = options.learningRate ?? 0.035;
  const regularization = options.regularization ?? 0.0008;
  const seed = options.seed ?? 12045;
  const prng = createPrng(seed);
  const model = createEmptyDecisionPolicy(seed);
  model.sampleCount = samples.length;
  model.trainedAt = new Date().toISOString();

  if (!samples.length) {
    return {
      model,
      metrics: {
        sampleCount: 0,
        epochs,
        mae: 0,
        mse: 0,
        averageReward: 0,
      },
    };
  }

  const ordered = [...samples];
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (let index = ordered.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(prng.next() * (index + 1));
      [ordered[index], ordered[swapIndex]] = [ordered[swapIndex], ordered[index]];
    }

    for (const sample of ordered) {
      const sampleWeight = sample.weight ?? 1;
      const actionModel = model.actions[sample.action];
      let prediction = actionModel.bias;
      for (const name of DECISION_FEATURE_NAMES) {
        prediction += actionModel.weights[name] * sample.features[name];
      }
      const error = sample.reward - prediction;
      actionModel.bias = round(actionModel.bias + learningRate * error * sampleWeight, 6);
      for (const name of DECISION_FEATURE_NAMES) {
        const updated =
          actionModel.weights[name] +
          learningRate * (error * sample.features[name] * sampleWeight - regularization * actionModel.weights[name]);
        actionModel.weights[name] = round(updated, 6);
      }
    }
  }

  let absoluteError = 0;
  let squaredError = 0;
  let rewardSum = 0;
  for (const sample of samples) {
    const prediction = scoreDecision(model, sample.action, sample.features);
    const error = sample.reward - prediction;
    absoluteError += Math.abs(error);
    squaredError += error * error;
    rewardSum += sample.reward;
  }

  return {
    model,
    metrics: {
      sampleCount: samples.length,
      epochs,
      mae: round(absoluteError / samples.length, 6),
      mse: round(squaredError / samples.length, 6),
      averageReward: round(rewardSum / samples.length, 6),
    },
  };
}

function serializeWeights(weights: Record<DecisionFeatureName, number>) {
  return DECISION_FEATURE_NAMES.map((name) => `      ${name}: ${round(weights[name] ?? 0, 6)},`).join('\n');
}

export function serializePolicyModule(model: LearnedDecisionPolicy) {
  const actions = (['migrate', 'trade', 'raid', 'ally', 'intensify'] as DecisionAction[])
    .map((action) => {
      const actionModel = model.actions[action];
      return `    ${action}: {\n      bias: ${round(actionModel.bias, 6)},\n      weights: {\n${serializeWeights(actionModel.weights)}\n      },\n    },`;
    })
    .join('\n');

  return `import type { LearnedDecisionPolicy } from './policy.js';\n\nexport const TRAINED_DECISION_POLICY: LearnedDecisionPolicy = {\n  version: '${model.version}',\n  trainedAt: '${model.trainedAt}',\n  trainingSeed: ${model.trainingSeed},\n  sampleCount: ${model.sampleCount},\n  actions: {\n${actions}\n  },\n};\n`;
}