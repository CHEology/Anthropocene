import type { TechnologyDefinition, TechnologyId, AbilityKey } from './types.js';

export const TECH_TREE: Record<TechnologyId, TechnologyDefinition> = {
  'fire-mastery': {
    id: 'fire-mastery',
    name: 'Fire Mastery',
    category: 'subsistence',
    prerequisites: [],
    effects: { foraging: 3, coldTolerance: 5 },
    populationRequirement: 15,
    regressionChance: 0.001,
    spreadWeight: 1.2,
    discoveryWeight: 1.5,
  },
  'cooking': {
    id: 'cooking',
    name: 'Cooking',
    category: 'subsistence',
    prerequisites: ['fire-mastery'],
    effects: { foraging: 2, organization: 2 },
    populationRequirement: 20,
    regressionChance: 0.002,
    spreadWeight: 1.0,
    discoveryWeight: 1.2,
  },
  'hafted-tools': {
    id: 'hafted-tools',
    name: 'Hafted Tools',
    category: 'craft',
    prerequisites: ['fire-mastery'],
    effects: { foraging: 5, attack: 3 },
    populationRequirement: 25,
    regressionChance: 0.003,
    spreadWeight: 0.9,
    discoveryWeight: 1.0,
  },
  'composite-tools': {
    id: 'composite-tools',
    name: 'Composite Tools',
    category: 'craft',
    prerequisites: ['hafted-tools'],
    effects: { foraging: 3, waterEngineering: 3 },
    populationRequirement: 40,
    regressionChance: 0.005,
    spreadWeight: 0.8,
    discoveryWeight: 0.8,
  },
  'proto-cultivation': {
    id: 'proto-cultivation',
    name: 'Proto-Cultivation',
    category: 'subsistence',
    prerequisites: ['cooking'],
    effects: { agriculture: 8 },
    populationRequirement: 30,
    regressionChance: 0.006,
    spreadWeight: 1.1,
    discoveryWeight: 0.7,
  },
  'irrigation': {
    id: 'irrigation',
    name: 'Irrigation',
    category: 'subsistence',
    prerequisites: ['proto-cultivation', 'composite-tools'],
    effects: { agriculture: 12, waterEngineering: 8 },
    populationRequirement: 60,
    regressionChance: 0.01,
    spreadWeight: 0.7,
    discoveryWeight: 0.4,
  },
  'animal-tracking': {
    id: 'animal-tracking',
    name: 'Animal Tracking',
    category: 'subsistence',
    prerequisites: [],
    effects: { foraging: 4 },
    populationRequirement: 15,
    regressionChance: 0.001,
    spreadWeight: 1.0,
    discoveryWeight: 1.4,
  },
  'pack-hunting': {
    id: 'pack-hunting',
    name: 'Pack Hunting',
    category: 'subsistence',
    prerequisites: ['animal-tracking', 'hafted-tools'],
    effects: { foraging: 6, attack: 4, organization: 3 },
    populationRequirement: 30,
    regressionChance: 0.004,
    spreadWeight: 0.8,
    discoveryWeight: 0.8,
  },
  'early-domestication': {
    id: 'early-domestication',
    name: 'Early Domestication',
    category: 'subsistence',
    prerequisites: ['animal-tracking', 'proto-cultivation'],
    effects: { agriculture: 6 },
    populationRequirement: 40,
    regressionChance: 0.008,
    spreadWeight: 0.9,
    discoveryWeight: 0.5,
  },
  'herding': {
    id: 'herding',
    name: 'Herding',
    category: 'subsistence',
    prerequisites: ['early-domestication'],
    effects: { agriculture: 10, coldTolerance: 3 },
    populationRequirement: 50,
    regressionChance: 0.008,
    spreadWeight: 0.8,
    discoveryWeight: 0.5,
  },
  'pottery': {
    id: 'pottery',
    name: 'Pottery',
    category: 'craft',
    prerequisites: ['cooking', 'fire-mastery'],
    effects: { organization: 4, waterEngineering: 2 },
    populationRequirement: 35,
    regressionChance: 0.006,
    spreadWeight: 1.0,
    discoveryWeight: 0.7,
  },
  'weaving': {
    id: 'weaving',
    name: 'Weaving',
    category: 'craft',
    prerequisites: ['pottery'],
    effects: { coldTolerance: 5, heatTolerance: 3 },
    populationRequirement: 40,
    regressionChance: 0.006,
    spreadWeight: 0.9,
    discoveryWeight: 0.6,
  },
  'permanent-shelter': {
    id: 'permanent-shelter',
    name: 'Permanent Shelter',
    category: 'craft',
    prerequisites: ['hafted-tools'],
    effects: { coldTolerance: 6, organization: 5 },
    populationRequirement: 35,
    regressionChance: 0.005,
    spreadWeight: 0.8,
    discoveryWeight: 0.8,
  },
  'fortification': {
    id: 'fortification',
    name: 'Fortification',
    category: 'military',
    prerequisites: ['permanent-shelter', 'ritual-organization'],
    effects: { attack: 8, organization: 6 },
    populationRequirement: 80,
    regressionChance: 0.012,
    spreadWeight: 0.5,
    discoveryWeight: 0.3,
  },
  'oral-tradition': {
    id: 'oral-tradition',
    name: 'Oral Tradition',
    category: 'knowledge',
    prerequisites: [],
    effects: { organization: 3 },
    populationRequirement: 15,
    regressionChance: 0.002,
    spreadWeight: 1.3,
    discoveryWeight: 1.3,
  },
  'counting': {
    id: 'counting',
    name: 'Counting',
    category: 'knowledge',
    prerequisites: ['oral-tradition', 'pottery'],
    effects: { organization: 5, agriculture: 3 },
    populationRequirement: 50,
    regressionChance: 0.008,
    spreadWeight: 0.8,
    discoveryWeight: 0.5,
  },
  'ritual-organization': {
    id: 'ritual-organization',
    name: 'Ritual Organization',
    category: 'social',
    prerequisites: ['oral-tradition'],
    effects: { organization: 6 },
    populationRequirement: 30,
    regressionChance: 0.004,
    spreadWeight: 1.0,
    discoveryWeight: 0.9,
  },
  'basic-medicine': {
    id: 'basic-medicine',
    name: 'Basic Medicine',
    category: 'knowledge',
    prerequisites: ['cooking', 'oral-tradition'],
    effects: { organization: 2 },
    populationRequirement: 25,
    regressionChance: 0.005,
    spreadWeight: 1.1,
    discoveryWeight: 0.7,
  },
  'water-finding': {
    id: 'water-finding',
    name: 'Water Finding',
    category: 'subsistence',
    prerequisites: [],
    effects: { waterEngineering: 4 },
    populationRequirement: 15,
    regressionChance: 0.001,
    spreadWeight: 1.1,
    discoveryWeight: 1.3,
  },
  'well-digging': {
    id: 'well-digging',
    name: 'Well Digging',
    category: 'craft',
    prerequisites: ['water-finding', 'composite-tools'],
    effects: { waterEngineering: 8 },
    populationRequirement: 40,
    regressionChance: 0.007,
    spreadWeight: 0.8,
    discoveryWeight: 0.5,
  },
  'canal-building': {
    id: 'canal-building',
    name: 'Canal Building',
    category: 'craft',
    prerequisites: ['well-digging', 'irrigation'],
    effects: { waterEngineering: 12, agriculture: 8 },
    populationRequirement: 100,
    regressionChance: 0.015,
    spreadWeight: 0.5,
    discoveryWeight: 0.2,
  },
  'stone-working': {
    id: 'stone-working',
    name: 'Stone Working',
    category: 'craft',
    prerequisites: ['fire-mastery'],
    effects: { attack: 2, foraging: 2 },
    populationRequirement: 20,
    regressionChance: 0.003,
    spreadWeight: 1.0,
    discoveryWeight: 1.0,
  },
  'copper-working': {
    id: 'copper-working',
    name: 'Copper Working',
    category: 'craft',
    prerequisites: ['stone-working', 'pottery'],
    effects: { attack: 6, foraging: 3 },
    populationRequirement: 60,
    regressionChance: 0.012,
    spreadWeight: 0.7,
    discoveryWeight: 0.3,
  },
  'bronze-working': {
    id: 'bronze-working',
    name: 'Bronze Working',
    category: 'craft',
    prerequisites: ['copper-working', 'counting'],
    effects: { attack: 10, agriculture: 5 },
    populationRequirement: 100,
    regressionChance: 0.018,
    spreadWeight: 0.5,
    discoveryWeight: 0.15,
  },
  'boat-building': {
    id: 'boat-building',
    name: 'Boat Building',
    category: 'craft',
    prerequisites: ['hafted-tools', 'water-finding'],
    effects: { waterEngineering: 4, foraging: 4 },
    populationRequirement: 35,
    regressionChance: 0.006,
    spreadWeight: 0.7,
    discoveryWeight: 0.6,
  },
  'navigation': {
    id: 'navigation',
    name: 'Navigation',
    category: 'knowledge',
    prerequisites: ['boat-building', 'counting'],
    effects: { organization: 4 },
    populationRequirement: 60,
    regressionChance: 0.01,
    spreadWeight: 0.6,
    discoveryWeight: 0.3,
  },
  'fermentation': {
    id: 'fermentation',
    name: 'Fermentation',
    category: 'subsistence',
    prerequisites: ['cooking', 'pottery'],
    effects: { organization: 3, agriculture: 2 },
    populationRequirement: 35,
    regressionChance: 0.005,
    spreadWeight: 1.1,
    discoveryWeight: 0.6,
  },
  'granary-storage': {
    id: 'granary-storage',
    name: 'Granary Storage',
    category: 'subsistence',
    prerequisites: ['pottery', 'proto-cultivation'],
    effects: { agriculture: 5, organization: 4 },
    populationRequirement: 45,
    regressionChance: 0.007,
    spreadWeight: 0.9,
    discoveryWeight: 0.5,
  },
  'tanning': {
    id: 'tanning',
    name: 'Tanning',
    category: 'craft',
    prerequisites: ['animal-tracking', 'fire-mastery'],
    effects: { coldTolerance: 4, heatTolerance: 2 },
    populationRequirement: 25,
    regressionChance: 0.004,
    spreadWeight: 0.9,
    discoveryWeight: 0.8,
  },
  'smelting': {
    id: 'smelting',
    name: 'Smelting',
    category: 'craft',
    prerequisites: ['copper-working', 'stone-working'],
    effects: { attack: 4, agriculture: 3 },
    populationRequirement: 70,
    regressionChance: 0.014,
    spreadWeight: 0.6,
    discoveryWeight: 0.25,
  },
};

export const ALL_TECH_IDS = Object.keys(TECH_TREE) as TechnologyId[];

export function hasTech(knownTechs: TechnologyId[], techId: TechnologyId): boolean {
  return knownTechs.includes(techId);
}

export function hasAllPrerequisites(knownTechs: TechnologyId[], techId: TechnologyId): boolean {
  const tech = TECH_TREE[techId];
  return tech.prerequisites.every((prereq) => knownTechs.includes(prereq));
}

export function getDiscoverableTechs(knownTechs: TechnologyId[]): TechnologyId[] {
  return ALL_TECH_IDS.filter(
    (techId) => !knownTechs.includes(techId) && hasAllPrerequisites(knownTechs, techId),
  );
}

export function getTechAbilityBonuses(knownTechs: TechnologyId[]): Record<AbilityKey, number> {
  const bonuses: Record<AbilityKey, number> = {
    foraging: 0,
    agriculture: 0,
    heatTolerance: 0,
    coldTolerance: 0,
    waterEngineering: 0,
    attack: 0,
    organization: 0,
  };

  for (const techId of knownTechs) {
    const tech = TECH_TREE[techId];
    if (!tech) continue;
    for (const [ability, bonus] of Object.entries(tech.effects)) {
      bonuses[ability as AbilityKey] += bonus as number;
    }
  }

  return bonuses;
}

export function getTechHealthBonus(knownTechs: TechnologyId[]): number {
  let bonus = 0;
  if (knownTechs.includes('basic-medicine')) bonus += 0.06;
  if (knownTechs.includes('well-digging')) bonus += 0.03;
  if (knownTechs.includes('canal-building')) bonus += 0.02;
  return bonus;
}

export function getTechFoodStorageBonus(knownTechs: TechnologyId[]): number {
  let bonus = 0;
  if (knownTechs.includes('pottery')) bonus += 0.04;
  if (knownTechs.includes('granary-storage')) bonus += 0.08;
  if (knownTechs.includes('fermentation')) bonus += 0.03;
  return bonus;
}

export const STARTING_TECHS_FORAGER: TechnologyId[] = [
  'fire-mastery',
  'animal-tracking',
  'oral-tradition',
  'water-finding',
];

export const STARTING_TECHS_TENDING: TechnologyId[] = [
  ...STARTING_TECHS_FORAGER,
  'cooking',
  'hafted-tools',
  'tanning',
];

export const STARTING_TECHS_CULTIVATION: TechnologyId[] = [
  ...STARTING_TECHS_TENDING,
  'proto-cultivation',
  'stone-working',
  'permanent-shelter',
  'ritual-organization',
  'pottery',
];

export const STARTING_TECHS_AGROPASTORAL: TechnologyId[] = [
  ...STARTING_TECHS_CULTIVATION,
  'early-domestication',
  'herding',
  'composite-tools',
  'basic-medicine',
  'granary-storage',
];
