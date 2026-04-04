# Out of Eden

## Anthropocene Simulator: Design Document

This document describes the rules the simulation runs and the reasoning behind them. It is both a specification for implementers and a contract with the design goals of the project.

Anthropocene Simulator is a deterministic early-human migration model. It is not a full civilization simulator. The game is built around a yearly loop where geography, climate stress, disease, exchange, conflict, leadership, and mobility interact on a hex map.

The goal is not to script history. The goal is to let recognizable patterns emerge from stable rules: river-valley concentration, steppe mobility, monsoon growth, frontier collapse, alliance clustering, raiding, megafauna overkill, the Broad Spectrum Revolution, and staggered transitions from foraging to farming. A successful run should produce behavior that a prehistorian would find plausible and a player would find dramatic.

**Guiding principle**: every positive feedback loop must eventually trigger a negative one, and every catastrophe must feel like a chapter in an epic story rather than a random punishment. Emergence comes from coupling, not complexity.

---

## 1. Core Model

The simulation tracks two entities:

- **Tiles**: environmental opportunity and risk, anchored to geography.
- **Tribes**: mobile populations with leaders, abilities, relationships, and development state.

Everything is deterministic for a fixed seed plus intervention sequence. The PRNG is PCG-family or xoshiro256++, seeded once per run, consumed in strict phase order.

### Yearly phase order

1. **Global events**: apply climate state, fire scheduled interventions, tick the storyteller.
2. **Tile update**: recompute climate, carrying capacity, disasters, plagues, resource recovery.
3. **Tribe update**: compute pressures, grow/shrink population, innovate, advance agriculture, update leaders.
4. **Interaction**: resolve trade, diffusion, diplomacy, alliance formation/breakage, raids, combat.
5. **Migration**: evaluate and execute movement.
6. **Fission**: split oversized tribes.
7. **Extinction**: remove dead tribes, clean references.

That ordering matters. Hazards reshape tiles before tribes react; interaction happens before migration so that trade and conflict inform movement decisions; fragmentation happens after pressure and conflict have already accumulated.

---

## 2. World Structure

### Tiles

Each tile stores:

- position (cube coordinates q, r) and neighbor list,
- terrain type and Koppen climate class,
- water score (0-5) and habitability score,
- base and live temperature,
- base and live comfort,
- hunting, farming, and water carrying capacity (base and live),
- tectonic and volcanic tags,
- **elevation** (meters, for sea-level calculations),
- **megafauna index** (0-1, representing large-game availability),
- **coastal flag** (true if adjacent to water or exposed shelf),
- active disasters and plagues.

Live tile values recover toward authored baselines over time, but hazards, climate stress, megafauna depletion, and population drawdown can temporarily push them away from equilibrium.

### Tribes

Each tribe stores:

- population and current tile,
- adaptive abilities (compact set of 7),
- detailed pressure state (8 channels),
- leader state,
- agriculture-development state (stage, domestication score, sedentism),
- exchange state (trade volume, diffusion, raid exposure, war exhaustion),
- **genetic diversity index** (0-1, tracking effective population health),
- **food stores** (0-1, buffering against single bad years),
- bilateral relationships and alliances,
- ancestry linkage for fission tracking.

A tribe is intentionally more than a population counter but less than a full state. The model aims for interpretable historical behavior, not microscopic social simulation. The band of 25-50 people is the fundamental unit of simulation; Dunbar's number (~150) is the threshold where a tribe must split or develop hierarchy; ~1500 defines the outer boundary of a linguistic-cultural group.

---

## 3. Climate Engine

The current build uses a simple sine oscillation for global temperature. This must be replaced with a historically-grounded climate model that produces recognizable paleoclimate events without excessive computation.

### Global temperature curve

Global mean temperature is computed from three additive layers:

```
T_global(year) = T_baseline(year) + T_oscillation(year) + T_noise(year)
```

**Layer 1 -- Baseline curve.** A piecewise-linear interpolation through ~15 key paleoclimate data points:

| Year (BP) | Anomaly (C) | Context |
|-----------|------------|---------|
| 70,000 | -4.0 | MIS 4 cold phase |
| 57,000 | -2.5 | MIS 3 interstadial onset |
| 40,000 | -3.0 | MIS 3 mid-range |
| 29,000 | -3.5 | MIS 3 decline |
| 26,500 | -6.0 | Last Glacial Maximum onset |
| 19,000 | -6.0 | LGM trough |
| 16,000 | -4.0 | Deglaciation begins |
| 14,700 | -2.0 | Bolling-Allerod warm pulse |
| 12,900 | -4.0 | Younger Dryas snap-back |
| 11,600 | 0.0 | Holocene onset |
| 8,200 | -1.0 | 8.2 kya cold event |
| 6,000 | +0.5 | Holocene Climatic Optimum |
| 4,200 | -0.5 | 4.2 kya aridification event |
| 2,000 | 0.0 | Late Holocene |
| 0 | 0.0 | Present |

Implementation: store as a sorted array of (year, anomaly) pairs. Use linear interpolation between adjacent points. This is O(log n) per lookup with binary search and runs once per tick -- negligible cost.

**Layer 2 -- Dansgaard-Oeschger oscillation.** During glacial periods (anomaly < -1.5C), add a ~1500-year pseudo-periodic oscillation with amplitude ~2C. During the Holocene (anomaly > -1.0C), dampen amplitude to ~0.3C. This captures the abrupt warming events that transformed tundra into boreal forest within a generation:

```
glacial_factor = clamp((-anomaly_baseline - 1.0) / 4.0, 0, 1)
DO_amplitude = 0.3 + 1.7 * glacial_factor
T_oscillation = DO_amplitude * sin(2 * PI * year / 1470)
```

**Why 1470?** Dansgaard-Oeschger events recur at roughly 1470-year intervals in ice-core records. This is the single most dramatic rapid climate event in the Pleistocene and a major driver of human migration patterns.

**Layer 3 -- Century-scale noise.** Perlin noise or a low-frequency sine blend at ~200-year wavelength, amplitude ~0.5C. This prevents the climate from feeling mechanically periodic:

```
T_noise = 0.5 * perlinNoise(year / 200)
```

If Perlin noise is too expensive, substitute `0.5 * sin(year / 137 * 2PI) * sin(year / 311 * 2PI)` using two incommensurate periods to produce quasi-random variation.

### Per-tile temperature

Each tile derives its live temperature from the global state plus local geography:

```
T_tile = T_base_authored + (T_global - T_reference)
       * polar_amplification(latitude)
       + altitude_correction
       + coastal_damping
```

Where `polar_amplification = 1 + 1.5 * (|latitude| / 90)^2` reflects the well-established fact that high-latitude regions experience ~2-3x the temperature swing of equatorial regions. Coastal tiles should dampen swings by ~30% (maritime climate buffering).

**Why this matters for gameplay**: during glacial maxima, tropical Africa remains habitable while European and Central Asian tiles become tundra or ice. During rapid D-O warming, steppe corridors open and close within decades. These dynamics drive the Out-of-Africa expansion and subsequent back-migrations that the simulation must reproduce.

### Sea level

Sea level at the LGM sat 120-130m below present, exposing Beringia (Asia-Americas land bridge, up to 1600 km wide), Sundaland (Borneo-Java-Sumatra connected to mainland Asia, 1.85 million km2), and Doggerland (Britain-Europe connection).

```
sea_level(year) = interpolate(SEA_LEVEL_CURVE, year)
```

Key data points: -130m at 26,500 BP, -120m at 19,000 BP, -60m at 14,700 BP (before Meltwater Pulse 1A), -40m at 14,200 BP (after MWP-1A, a 20m rise in ~500 years), approaching 0m by 6,000 BP.

A tile is traversable/habitable when `tile.elevation > sea_level(year)`. Tiles below sea level lose all carrying capacity and become impassable. Coastal status recalculates when sea level crosses tile elevation thresholds.

**Why this matters**: Meltwater Pulse 1A at ~14,700 BP floods coastal tiles fast enough to destroy established settlements within a few generations, forcing dramatic inland migrations. This is a major mid-game event that should be visible and consequential.

**Implementation note**: for the compact preset maps, this can be approximated by toggling a few key "land-bridge" tiles on/off at threshold years. The full system only needs to run on larger maps.

---

## 4. Carrying Capacity and Tile Dynamics

### Carrying capacity model

Every tile provides three capacity channels that recover toward baseline each year:

- **Hunt capacity**: large and small game, gathered plant foods, fishing.
- **Agri capacity**: potential for cultivated food production (only matters at higher agriculture stages).
- **Water capacity**: freshwater access for drinking and sanitation.

Recovery rate toward baseline:

```
hunt_recovery = min(base_hunt * 0.02, base_hunt - current_hunt)
agri_recovery = min(base_agri * 0.015, base_agri - current_agri)
```

Recovery is reduced by climate stress, disaster burden, and plague burden. The recovery rates above (2% and 1.5% per year) are calibrated so that a depleted tile takes ~50-70 years to fully recover -- matching ecological recovery timescales for large-game populations after overhunting.

### Megafauna system

Megafauna provide a large carrying capacity bonus to hunting. Their decline is one of the most consequential events in human prehistory: 88% of Australian megafauna vanished by 40,000 BP; 72% of North American megafauna disappeared between 13,000 and 11,000 BP. This forced the dietary diversification that led to the Broad Spectrum Revolution and eventually agriculture.

Each tile tracks a `megafaunaIndex` (0.0 to 1.0):

```
megafauna_bonus = 1 + megafaunaIndex * 0.5
effective_hunt_capacity = hunt_capacity * megafauna_bonus
```

Megafauna decline is driven by a combination of human hunting pressure and climate stress (the overkill-climate synergy that the academic literature supports):

```
depletion_rate = human_hunting_pressure * 0.003
              + climate_stress * 0.001
              + (human_hunting_pressure * climate_stress) * 0.004

megafaunaIndex(t+1) = max(0, megafaunaIndex(t) - depletion_rate)
```

The interaction term `(hunting * climate) * 0.004` is critical: it means megafauna can survive moderate hunting OR moderate climate stress alone, but the combination is devastating. This matches the "overkill-plus-climate" consensus in paleobiology.

**Gameplay consequence**: when megafauna collapse, hunt capacity drops by up to 50%. Tribes that have already begun diversifying their diet (higher agriculture ability, grinding-stone technologies) survive; pure big-game specialists face catastrophic food pressure. This is the single most important mid-game transition and must feel earned, not scripted.

**Recovery**: megafauna do NOT recover once depleted below 0.1. This is an irreversible extinction, matching reality. Tiles that never had human presence retain their megafauna index until contact.

### Coastal and riverine bonus

Coastal and riverine zones are 3-10x more productive than inland equivalents (ethnographic data from the Binford dataset). This drives the coastal migration hypothesis for Out-of-Africa:

```
coastal_hunt_multiplier = terrain == 'coast' ? 2.5 : terrain == 'river_valley' ? 2.0 : 1.0
```

This should already be reflected in the authored base carrying capacities, but the design document makes the principle explicit: coastal tiles must be significantly more attractive than inland equivalents of the same latitude.

### Comfort

Comfort is the tile-level summary of livability. It feeds into growth, migration attractiveness, and settlement stability:

```
comfort = base_comfort
        - climate_shift * 0.08
        - terrain_penalty
        - crowding_penalty * 1.35
        - climate_stress * 0.75
        - disaster_burden_effect
        - plague_burden_effect
```

Where `crowding_penalty = max(0, crowding_ratio - 0.74)` and `crowding_ratio = total_tile_pop / max(food_capacity, 1)`.

### Resource depletion by tribes

This is "the single most important driver of emergent migration" (v3 document). Tribes that overhunt deplete local resources, forcing them to move, which allows the ecosystem to recover behind them. This spatial negative feedback loop produces realistic wave-front migration:

```
hunt_depletion = foraging_load * (0.006 + mobility * 0.0003)
              + max(0, hunt_pressure - 0.78) * hunt_capacity * 0.016

agri_depletion = farming_load * 0.004
              + max(0, agri_pressure - 1.0) * agri_capacity * 0.009
```

The depletion rate is calibrated so that a single band of 40 people can sustainably forage a rich tile indefinitely, but two bands on the same tile begin to deplete it within a generation, and three bands cause rapid decline. This matches ethnographic forager density data.

---

## 5. Disasters and Plagues

### Disasters

Possible tile disasters:

| Disaster | Terrain triggers | Duration | Primary effect |
|----------|-----------------|----------|----------------|
| Drought | desert, steppe, low water | 3-9 years | Agri -32%, water -38% |
| Flood | river valley, coast, high water | 2-6 years | Agri -20%, comfort drop |
| Wildfire | forest, savanna, hot+dry | 2-5 years | Hunt -24%, cover loss |
| Severe winter | cold climate, high latitude | 2-5 years | Hunt -18%, temp drop |
| Earthquake | tectonic zones | 1-3 years | Infrastructure shock |
| Eruption | volcanic zones | 2-6 years | Hunt -34%, agri -30%, cooling |

Disaster probabilities are per-tile per-year, gated by terrain/climate suitability and scaled by `G_disaster`. Each event has a severity (0.12-0.95) and duration. Only one instance of each disaster type can be active on a tile at once.

Their gameplay role is to create temporary migration pressure and break up otherwise stable corridors. A realistic migration model needs disruption, not just smooth carrying-capacity gradients.

### Correlated catastrophes (global disasters)

The current build lacks global catastrophic events. V3 specifies that total human extinction should occur in roughly 1 out of 10 runs, requiring correlated catastrophes that hit multiple tiles simultaneously.

**Supervolcanic winter**: every ~500-1000 years of game time (calibrated to hit ~1-2 times per 70,000-year run), roll for a Toba-scale eruption. If triggered:

```
P(supervolcano per year) = 0.0012
effect: all tiles receive -3 to -6C temperature anomaly for 5-15 years
         all tiles lose 40-70% of hunt and agri capacity
         megafauna index drops by 0.15-0.3 globally
```

**Megadrought**: prolonged continental-scale drought (Heinrich events):

```
P(megadrought per year) = 0.002 (during glacial periods only)
effect: affected region (50-80% of tiles) loses 30-50% water capacity for 10-30 years
```

**Calibrated extinction probability**:

```
P(total_extinction) = P(catastrophe) * P(all_die | catastrophe)
                    + P(no_catastrophe) * P(all_die | no_catastrophe)
                    = 0.15 * 0.50 + 0.85 * 0.02
                    = 0.092 ~ 10%
```

Most runs (~85%) face no civilization-ending catastrophe and have only ~2% extinction risk from accumulated misfortune. But when a supervolcano erupts, it is a coin flip. Tribes that prepared (diversified geographically, built food stores, developed fishing technology) survive more often. This makes extinction feel earned rather than random.

### Plagues

Possible outbreaks:

| Plague | Trigger conditions | Primary effect |
|--------|-------------------|----------------|
| Waterborne | floods, river valleys, high water | Health pressure, water contamination |
| Respiratory | high density, high trade, sedentism | Rapid spread, health crisis |
| Zoonotic | forest/savanna, animal contact | Sporadic but severe |

Outbreak chance grows with density, sedentism, exchange intensity, and environmental stress. Plagues spread to neighboring tiles based on trade intensity and settlement density.

Plagues make dense productive regions powerful but risky -- a core historical tradeoff. The Neolithic Demographic Transition saw settled farming populations experience higher disease burden despite higher food production.

---

## 6. Population Dynamics

### The core growth equation

The current build uses independent birth and death rates. This should be replaced with the discrete logistic model with an Allee threshold, as specified in v3. This single equation captures both boom-bust dynamics and extinction-vortex spirals:

```
r_eff = r_base * food_multiplier * comfort_multiplier * org_multiplier
      - inbreeding_penalty - environmental_stress

growth_factor = r_eff
              * (1 - N/K)                    // logistic ceiling
              * max(0, (N - A) / N)          // Allee effect

N(t+1) = N(t) + N(t) * growth_factor + migration_net + noise
```

Where:
- `N` = current population
- `K` = effective carrying capacity
- `A` = Allee threshold (25 individuals, matching minimum viable band size)
- `r_base` = base growth rate from config (G_birth - G_death, ~0.006 net)

**Why the Allee term matters**: when population drops below threshold A (~25), the `(N-A)/N` term goes negative and growth turns strongly negative -- the tribe spirals to extinction. This creates dramatic near-miss scenarios where a tribe hovers just above the threshold. Above A, the term approaches 1 and has negligible effect. Three equilibria emerge: extinction at 0 (stable), the threshold A (unstable tipping point), and K (stable).

**Calibration target**: under favorable conditions, short-term growth should reach 0.5-1.5% per year (matching ethnographic hunter-gatherer data from Gurven & Kaplan 2007). Long-run average growth should be ~0.04% per year (matching archaeological population reconstructions, with doubling time ~1700 years). The gap is closed by periodic crashes from disasters, disease, and conflict -- producing the boom-bust cycles that make survival games compelling.

### Food stores buffer

Tribes track a `foodStores` value (0.0 to 1.0) representing accumulated surplus:

```
surplus = effective_food / max(pop, 1) - 1.0
foodStores(t+1) = clamp(foodStores(t) + surplus * 0.1, 0, 1)
```

Food stores buffer against single bad years: when current food is insufficient, stores are drawn down before the full famine penalty applies:

```
effective_food_with_stores = effective_food + foodStores * pop * 0.3
```

This prevents pure death spirals from a single bad harvest. It also rewards sedentary tribes with storage infrastructure (higher agriculture stages accumulate stores faster), matching the archaeological evidence for grain storage pits as a key Natufian innovation.

### Genetic diversity and inbreeding

Small populations lose genetic diversity through drift, eventually causing inbreeding depression. This creates the "extinction vortex" (Gilpin & Soule 1986) where small populations become progressively less viable:

```
Ne = pop * 0.65                          // effective population ~65% of census for HG
F(t+1) = F(t) + (1 - F(t)) / (2 * Ne)  // Wright's inbreeding coefficient
geneticDiversity = 1 - F                 // stored on tribe, starts at 1.0

inbreeding_penalty = lethal_equivalents * F   // delta ~6 lethal equivalents
```

When Ne drops below ~50 (census ~77), inbreeding depression becomes measurable within 5 generations. When Ne drops below ~25 (census ~38), it accelerates rapidly. The revised conservation genetics consensus (Frankham 2014) recommends Ne >= 100 for short-term viability.

**Gameplay effect**: the inbreeding penalty reduces effective growth rate. A tribe of 30 people can survive for a while, but unless it receives genetic rescue (migration contact with another tribe, modeled as a diffusion of genetic diversity during trade), it will slowly degrade. This creates a powerful incentive to maintain contact with other groups -- isolation is slow death.

**Genetic rescue through contact**:

```
if (trade_volume > threshold && both_tribes_alive):
    receiver.geneticDiversity += (donor.geneticDiversity - receiver.geneticDiversity) * 0.02
```

This is computationally trivial (one multiplication per trade pair per tick) but produces profound emergent behavior: isolated tribes on islands or behind mountain barriers slowly decline, while networked populations maintain vigor.

### Death rate channels

```
death_rate = G_death_base
           + food_pressure * 0.04
           + water_pressure * 0.05
           + cold_pressure * 0.03
           + heat_pressure * 0.03
           + competition_pressure * 0.02
           + health_pressure * 0.07
           + raid_exposure * 0.04
           + war_exhaustion * 0.03
           + disaster_burden * 0.03
           + overcrowding_penalty
           + allee_penalty
           + inbreeding_penalty
```

The health channel (0.07 coefficient) is the largest single contributor, matching ethnographic data showing infectious disease as the primary cause of death among hunter-gatherers, followed by violence (~0.02 + 0.04 from competition and raids).

---

## 7. Staged Agriculture Emergence

Agriculture is a staged development path, not a discrete discovery event. The real transition involved centuries of intermediate stages that map naturally to a technology progression.

### Stages

| Stage | Domestication threshold | Conditions | Historical analog |
|-------|------------------------|------------|-------------------|
| Foraging | 0 | Default | 70,000-23,000 BP |
| Tending | 18 | Any terrain | Proto-management of wild plants |
| Cultivation | 38 | Agri suitability > 16% | Broad Spectrum Revolution, 23,000-10,000 BP |
| Agropastoral | 60 | Agri > 24% OR steppe/savanna | Natufian semi-sedentism + animal management |
| Settled Farming | 84 | Agri > 42%, water >= 3, not desert/mountain | Full Neolithic, post-11,500 BP |

### Stage profiles

| Property | Foraging | Tending | Cultivation | Agropastoral | Settled Farming |
|----------|----------|---------|-------------|--------------|-----------------|
| agriMultiplier | 0.2 | 0.44 | 0.74 | 0.98 | 1.2 |
| foragingMultiplier | 1.08 | 1.02 | 0.96 | 0.92 | 0.82 |
| organizationBonus | 0 | 4 | 8 | 12 | 18 |
| birthBonus | 0 | 0.001 | 0.002 | 0.003 | 0.005 |
| migrationFriction | 0.02 | 0.08 | 0.16 | 0.24 | 0.36 |
| plagueVulnerability | 0.86 | 0.92 | 1.0 | 1.08 | 1.18 |
| targetSedentism | 0.08 | 0.18 | 0.34 | 0.50 | 0.72 |

The table encodes a fundamental tradeoff: higher agriculture stages produce more food and support more people, but increase disease vulnerability, reduce mobility, and create dependence on specific tile conditions. Settled Farming has 18% higher plague vulnerability than Foraging -- matching the Neolithic disease burden increase.

### Domestication progress formula

Progress depends on environmental suitability, existing knowledge, trade contact, pressure, and disruption:

```
progress_delta =
    agri_suitability * 0.52
  + river_valley_bonus (0.08) or coast_bonus (0.03)
  + agriculture_ability / 235
  + water_engineering / 420
  + organization / 520
  + trade_volume * 0.16
  + diffusion * 0.22
  + leader_agriculture_modifier
  + food_pressure_drive
  + competition_drive
  - disaster_disruption * 0.48
  - health_disruption * 0.24
  - raid_disruption * 0.35
  - war_exhaustion * 0.18
  - mobility_penalty * 0.08
  - migration_penalty (if currently migrating)
  - harsh_terrain_penalty
```

**Critical design principle**: agriculture should NOT be "discovered" -- it should emerge as the rational response when semi-sedentary tribes with food-processing knowledge face environmental pressure. The Younger Dryas (12,900-11,600 BP) may have been the final trigger that forced Natufian semi-sedentary peoples to actively cultivate rather than merely harvest.

The formula above ensures this happens naturally: river-valley tiles with high agri suitability and stable climate accumulate domestication faster. Tribes under moderate food pressure (but not so much that they must constantly migrate) progress fastest. Disasters and raids knock progress back. Trade and diffusion allow advancement to spread between neighboring groups without requiring independent invention.

### Sedentism dynamics

Sedentism tracks how anchored a tribe is to place. It drifts toward the target sedentism of the current agriculture stage:

```
sedentism(t+1) = sedentism(t) + (target - sedentism(t)) * 0.16 - raid_disruption
```

Sedentism creates a core historical tension: settled groups exploit land more efficiently (higher food output, ability to store grain, stronger organizational structures) but become slower to exit deteriorating conditions. When a drought hits a settled-farming tribe, their high migration friction means they suffer longer before moving, potentially losing population that a mobile foraging group would have preserved.

---

## 8. Tribe Pressures and Abilities

### Pressure channels

Each tribe derives pressure from its environment and local competition across 8 channels:

| Channel | Formula summary | What it represents |
|---------|-----------------|-------------------|
| Food | `1 - effective_food / pop` | Caloric deficit |
| Water | `1 - water_supported / pop` | Freshwater deficit |
| Heat | `(T_tile - heat_threshold) / 16` | Heat stress |
| Cold | `(cold_threshold - T_tile) / 16` | Cold stress |
| Competition | Density-based, modified by sedentism, alliances | Crowding and territorial conflict |
| Organization | `pop / (150 + org_bonus) - org_ability/100` | Exceeding Dunbar limit |
| Health | Plague + disaster + density + raid effects | Disease and injury burden |
| Total | Average of all channels | Summary index |

**Why average, not sum**: the total pressure is the mean of all channels, not their sum. This prevents unrealistic scenarios where a tribe with excellent food but high heat pressure shows the same total as one with moderate problems everywhere. The mean represents the idea that tribes can compensate in some areas while struggling in others -- a tribe in a desert oasis has zero water pressure despite extreme heat pressure.

### Abilities

The ability set remains intentionally compact:

| Ability | Adapts to pressure from | Real-world analog |
|---------|------------------------|-------------------|
| Foraging | food | Hunting techniques, plant knowledge, tool quality |
| Agriculture | food + organization + diffusion | Seed selection, cultivation methods |
| Heat tolerance | heat | Clothing, shelter, water management, behavioral adaptation |
| Cold tolerance | cold | Clothing, fire management, fat stores, shelter construction |
| Water engineering | water + health | Well-digging, irrigation, sanitation, water storage |
| Attack | competition + raids | Weapon craft, tactical coordination, fortification |
| Organization | organization + competition + health | Social hierarchy, labor division, information management |

Abilities adapt under pressure through a weighted lottery system. When a tribe faces food pressure, foraging and agriculture are more likely to improve. When raids increase, attack ability rises. This produces pressure-driven adaptation without requiring a tech tree.

Innovation probability:

```
P(innovation) = G_innovation
              * log10(max(pop, 10)) / 2.4
              * (1 + total_pressure * 2.5 + diffusion * 0.8)
              * leader_innovation_modifier
```

The log-population term reflects that larger groups generate more innovation -- but with diminishing returns. A tribe of 100 innovates ~1.7x faster than a tribe of 10, not 10x. The diffusion term means tribes in trade networks innovate faster even without their own pressure -- knowledge flows along exchange routes.

---

## 9. Leaders

Leaders have real mechanical weight. Each leader has:

- **name** (procedurally generated),
- **archetype** (Pathfinder, Steward, Broker, Sage),
- **age** (increments yearly),
- **tenure** (years in power),
- **authority** (0-1, decays with age, rises with legitimacy),
- **legitimacy** (0-1, rises with prosperity, falls with crisis).

### Archetypes and their modifiers

| Modifier | Pathfinder | Steward | Broker | Sage |
|----------|-----------|---------|--------|------|
| Innovation | 1.04 | 1.05 | 1.02 | 1.22 |
| Migration | 1.22 | 0.92 | 1.03 | 0.98 |
| Agriculture | 0.94 | 1.22 | 1.02 | 1.04 |
| Foraging | 1.08 | 0.98 | 1.00 | 0.98 |
| Diplomacy | 0.94 | 1.08 | 1.22 | 1.10 |
| Trade | 0.96 | 1.08 | 1.24 | 1.06 |
| Attack | 1.12 | 0.94 | 1.00 | 0.92 |
| Defense | 1.02 | 1.10 | 1.00 | 1.04 |
| Disaster resilience | 1.02 | 1.12 | 0.98 | 1.08 |
| Plague resilience | 0.98 | 1.08 | 1.00 | 1.14 |
| Cohesion | 0.98 | 1.08 | 1.04 | 1.06 |
| Raid bias | +0.14 | -0.08 | -0.04 | -0.12 |

All modifiers are scaled by `authority_factor = 0.84 + authority * 0.24 + legitimacy * 0.14`. A leader with full authority and legitimacy has ~1.22x the effect of base modifiers. A leader with collapsed legitimacy has ~0.84x -- still present but diminished.

### Succession

Leaders age, tenure rises, legitimacy shifts under stress. Succession fires when:

```
P(succession) = max(0, age - 56) * 0.008
              + max(0, 0.22 - legitimacy) * 0.35
              + war_exhaustion * 0.08
              + health_pressure * 0.05
```

New leaders are chosen by weighted lottery favoring archetypes that match the tribe's current pressures. A tribe under food stress is more likely to produce a Pathfinder; a prosperous agricultural tribe is more likely to produce a Steward.

Succession matters because it can redirect a tribe toward movement, consolidation, exchange, or resilience -- producing different trajectories from similar starting terrain.

---

## 10. Trade and Diffusion

Trade is an active interaction loop, not a placeholder.

### Trade flow model

When two tribes are on the same or adjacent tiles and not deeply hostile:

```
flow_to_A = surplus_B * need_A * (0.45 + complementarity)
          * contact_factor * trust_factor * alliance_factor
          * leader_trade_modifier

trade_volume_gain = flow / 20
diffusion_gain = total_flow / 15 (applied as ability transfer)
```

Where:
- `complementarity` = absolute difference in agriculture/water abilities, scaled -- tribes with different specializations trade more,
- `contact_factor` = 1.0 for shared tile, 0.76 for neighbors,
- `trust_factor` = 0.42 + max(relation, 0), bounded [0.16, 1.45],
- `alliance_factor` = 1.25 for allies, 1.0 otherwise.

### Diffusion mechanics

Trade produces two outputs:
1. **Short-run support**: trade volume increases effective food supply.
2. **Long-run learning**: diffusion transfers abilities from more-advanced to less-advanced tribes.

Diffusion selects the ability where the source has the biggest advantage over the receiver and transfers a small gain. This means a tribe with advanced agriculture living near a tribe with advanced cold tolerance will exchange both capabilities over time -- without requiring either to independently invent them.

**Agricultural diffusion**: when a tribe trades with a more-advanced agricultural neighbor, it also gains domestication progress:

```
if partner_stage > own_stage:
    domestication += total_flow / 7.5
```

This models the historical spread of farming from independent centers of origin (Fertile Crescent, Yangtze, Mesoamerica) to neighboring regions through contact rather than independent invention.

### Exchange decay

Trade volume, diffusion, raid exposure, and war exhaustion all decay each year:

```
tradeVolume *= 0.58    // fast decay -- trade requires active renewal
diffusion *= 0.52      // knowledge fades without reinforcement
raidExposure *= 0.42   // threat perception fades quickly
warExhaustion *= 0.72  // war scars heal slowly
```

These decay rates are intentionally asymmetric: trade and knowledge decay fast (requiring sustained contact), while war exhaustion lingers (making prolonged conflict costly).

---

## 11. Diplomacy, Alliances, Raids, and Combat

### Relationship dynamics

Relationships drift based on:

```
relation_change = shared_ancestry_bonus (0.03)
                + alliance_bonus (0.02)
                + trade_flow * 0.016
                + diplomacy_leader_bonus
                - shared_tile_competition * 0.08
                - base_hostility * 0.03
                - population_asymmetry * 0.025
```

**Why population asymmetry degrades relations**: when one tribe is much larger than another, the smaller tribe feels threatened and the larger tribe feels entitled. This is well-documented in ethnographic literature and creates the historical pattern where large tribes are more likely to raid their smaller neighbors.

### Alliance formation and breakage

Alliances form when:
- Relation > 0.48
- Trade flow > 2.2
- Competition < 0.62
- Weighted random check passes (scaled by diplomacy modifiers)

Alliances break when:
- Relation drops below 0.12 (probabilistic) or below -0.04 (automatic)

Alliances affect risk evaluation, trade efficiency, military support, and migration decisions. They are bilateral, not transitive -- tribe A allied with B and B allied with C does not make A and C allies.

### Raids

Raids are asymmetric predation. The stronger or more desperate tribe attacks the weaker or richer one:

```
raid_chance = (hostility + max(aggression_left, aggression_right))
            * 0.084 * exposure_scale * policy_adjustment
```

Gated by: not allied, sufficient hostility, one side has military advantage.

Raid outcomes:
- Attacker loses 0.8-3% population (casualties of raiding)
- Defender loses 1.6-8% population (casualties + captured)
- Attacker gains loot (trade volume boost)
- Both gain war exhaustion and raid exposure
- Relation degrades by 0.24
- Defender's domestication, trade, and sedentism are damaged (defeat shock)

**Why raids matter beyond casualties**: the defeat shock mechanic means that repeated raiding can knock a settled agricultural tribe back down the development ladder. This produces the historical pattern where steppe nomads repeatedly disrupted agrarian civilizations -- not through conquest but through chronic raiding that prevented stable development.

### Combat

When rival tribes share a tile and hostility is high enough, open combat occurs. Combat is more destructive than raids but less targeted:

```
intensity = 0.038 + hostility * 0.06 + competition * 0.025
losses = pop * intensity * enemy_strength / total_strength
```

Combat is intentionally coarse-grained. It exists to alter migration, collapse, alliance formation, and frontier shape, not to become a separate tactical game.

---

## 12. Migration

Migration is the main spatial mechanic. A tribe evaluates all neighboring tiles and may move to the best alternative.

### Migration trigger

A tribe considers migrating when any of:
- Total pressure > 0.2
- Food pressure * 1.22 > threshold
- Water pressure * 1.14 > threshold
- Health pressure * 1.05 > threshold
- Competition * 1.18 > threshold
- Current risk (disasters + plagues + raids + war) > 0.3
- Frontier drive > 0.34

### Tile scoring

Each neighbor is scored on:

```
score = resource_delta * 1.3
      + water_delta * 0.95
      + occupancy_relief * (1.14 + mobility * 0.52)
      + risk_relief * 1.06
      + frontier_bonus * (0.22 + mobility * 0.48 + competition * 0.32)
      + ruggedness * mobility * 0.5
      + comfort_delta * 0.1
      + allied_presence * 0.2
      - hostile_presence * 0.28
      - aridity_penalty
```

**Frontier bonus**: unoccupied tiles receive a bonus that scales with mobility and competition pressure. This drives the wave-front expansion pattern: when competition rises in a settled area, mobile tribes push into empty territory. Highly sedentary tribes rarely receive enough frontier bonus to overcome their migration friction.

### Migration friction

```
migration_chance = G_migration
    * pressure_drive * leader_migration_mod * policy_adj
    / (1 + stage_friction + sedentism * 0.68)
```

Higher agriculture stages and higher sedentism dramatically reduce migration probability. A settled-farming tribe with 0.7 sedentism faces a denominator of ~1.84 vs a foraging tribe's ~1.08 -- making them roughly half as likely to move under the same pressure. This creates the historical tension: settled groups can exploit land better but are trapped when conditions deteriorate.

### Migration cost

When a tribe migrates:
- Domestication drops by `sedentism * 4 + stage_rank * 0.4` (losing agricultural infrastructure)
- Sedentism drops to 88% of current
- Trade volume drops to 82% (disrupted networks)
- Food stores drop by 30% (transport losses)

These costs mean migration is genuinely expensive for advanced tribes. A settled-farming tribe that is forced to migrate may drop back to agropastoral or even cultivation stage, losing generations of development. This is historically accurate: migration events in the Neolithic often involved significant cultural regression.

---

## 13. Fission

Fission handles tribe splitting when population exceeds cohesive scale.

### Split trigger

```
split_pressure =
    (pop - 150) / 260
  + competition * 0.5
  + organization_pressure * 0.3
  + war_exhaustion * 0.2
  + raid_exposure * 0.18
  + (1 - G_cohesion)
  - organization_ability / 420
  - leader_cohesion * 0.12
  + alliance_count * 0.02
  - sedentism * 0.08
```

The `(pop - 150) / 260` term is the primary driver: 150 is Dunbar's number, the maximum group size maintainable through personal relationships. Above 150, formal organizational structures (organization ability, leader authority) are needed to maintain cohesion. A tribe of 300 with low organization ability splits almost certainly; a tribe of 300 with high organization and a Steward leader can hold together.

### Branch inheritance

Child tribes inherit most of the parent profile with small drift:
- Population: 32-44% of parent
- Abilities: parent values +/- 2 random drift per ability
- Domestication: parent - 4
- Sedentism: parent * 0.86
- Trade volume: parent * 0.6
- Relationships: starts fresh except moderate positive relation with parent
- Leader: new leader via weighted lottery

The ability drift during fission is the primary mechanism for cultural divergence. Over many generations of splitting, lineages accumulate different specializations: one branch might develop strong cold tolerance while another develops agriculture. This produces the diversity of adaptive strategies visible in the archaeological record.

---

## 14. Storyteller (Nature AI Director)

Borrowed from RimWorld's AI director concept, the storyteller manages event pacing and intensity. It tracks tribal prosperity across the map and ensures growth periods alternate with crises using visible environmental storytelling.

### Prosperity index

```
prosperity = weighted_average(
    avg_food_stores * 0.3,
    avg_growth_rate * 0.25,
    avg_trade_volume * 0.2,
    avg_organization / 100 * 0.15,
    avg_domestication / 100 * 0.1
)
```

### Event pacing rules

1. **After sustained prosperity** (prosperity > 0.6 for > 20 years): increase disaster probability by 1.5x, increase plague spread rate by 1.3x. This is NOT invisible difficulty scaling -- the mechanism is visible (longer droughts, larger floods) and the player can prepare.

2. **After severe crisis** (prosperity < 0.2 for > 10 years): suppress new disaster generation by 0.5x for 15 years (the "pity counter"). This prevents cascading doom spirals that feel unfair.

3. **Monotony breaker**: if no significant event (disaster, plague, major migration, combat) has occurred for > 25 years, slightly increase event probabilities. Extended periods of pure peace are historically unrealistic and boring.

4. **Near-extinction drama**: when total human population drops below 500, suppress new disasters entirely and boost food recovery rates by 2x. This creates dramatic near-miss survival scenarios rather than anticlimactic extinction spirals.

**Key principle**: the storyteller uses visible environmental forces (drought, volcanic winter, ice advance) rather than invisible difficulty scaling. Players accept harsh mechanics when they are fictional forces of nature rather than arbitrary punishment.

**Implementation cost**: one pass over all tribes per tick to compute prosperity (~O(n)), plus a few conditional multipliers on existing disaster rolls. Negligible.

---

## 15. Extinction

Extinction is the clean endpoint when population reaches zero. The model produces extinction through four reinforcing loops (the extinction vortex):

1. **Demographic instability**: small populations have high variance in birth/death rates. A tribe of 30 can lose 10% of its population (3 people) from a single bad year, while a tribe of 300 losing 10% (30 people) is distributed across many families.

2. **Allee effect**: below the threshold of ~25, per-capita growth turns negative. The tribe cannot find mates, cannot organize cooperative hunts, cannot defend against predators.

3. **Genetic drift**: inbreeding coefficient F accumulates faster in small populations, reducing fitness.

4. **Loss of adaptive potential**: small populations innovate less (log-population term in innovation formula) and lose abilities through drift during fission.

These four loops are already implicit in the formulas above. No additional mechanism is needed -- the extinction vortex emerges naturally from the interaction of the Allee threshold, genetic diversity tracking, and population-scaled innovation.

---

## 16. Metrics and Event Log

The event log traces why a run changed shape:

| Event kind | Examples |
|------------|---------|
| system | Leadership change, agriculture stage shift, tribe split |
| intervention | Climate pulse, observation note |
| innovation | Ability improvement |
| migration | Tribe movement |
| warning | Crowding tension, tribe collapse |
| combat | Raid, open battle |
| trade | Significant exchange |
| diplomacy | Alliance formed/broken |
| disaster | Drought, flood, eruption, supervolcano |
| disease | Plague outbreak |

History is stored with logarithmic sampling: every point for the last 100 ticks, every 10th for 100-1000, every 100th beyond that. This gives ~340 data points for 70,000 ticks instead of 70,000.

---

## 17. Frontend Adaptation

The UI exposes simulation systems directly:

### Map

- Hazard markers show disasters and plagues on tiles.
- Alliance halos identify tribes with active alliances.
- Megafauna indicators show large-game availability.
- Sea-level changes reveal/hide land-bridge tiles.
- The preset switch immediately resets into the selected world.

### Inspector

- Pressure view includes all 8 channels.
- Tile view lists active hazards, outbreaks, megafauna index, and sea-level status.
- Tribe view shows agriculture stage, domestication, sedentism, trade, war wear, leader state, allies, genetic diversity, and food stores.
- Relations view flags allied pairs and hostile tensions.

---

## 18. Design Principles

1. **Deterministic phase-ordered yearly loop.** Same seed + same interventions = same outcome. Always.

2. **Geography as primary historical driver.** River valleys concentrate. Steppes mobilize. Mountains barrier. Deserts filter. Coasts attract. The map is destiny -- systems amplify geographic logic, never override it.

3. **Interacting pressure loops over disconnected subsystems.** Every system feeds back into at least two others. Agriculture increases food but increases disease. Trade brings knowledge but attracts raiders. Settlement enables storage but prevents flight. No system exists in isolation.

4. **Every positive loop must trigger a negative one.** Population growth depletes resources. Knowledge accumulation enables larger populations that hit carrying capacity. Trade networks attract raiders. Social cohesion resists change when adaptation is needed.

5. **Input randomness over output randomness.** Randomize the environment (terrain, climate, disasters). Make player/tribe responses largely deterministic. When a tribe fails, the player should see why: wrong location, inadequate preparation, overwhelming odds -- not just "the dice said no."

6. **Four-tier crisis escalation.** Minor crises (fixable with attention) -> moderate (fixable with sacrifice) -> severe (fixable with drastic action: split tribe, abandon territory) -> terminal (only from sustained neglect or overwhelming catastrophe). Every death spiral must have an escape valve.

7. **Failure must feel earned.** Correlated catastrophes make extinction possible but preparable. Geographic diversification, food stores, and technological breadth are visible insurance strategies that the simulation rewards.

8. **Expose live mechanics.** The design document and UI describe only what the simulation actually runs. No aspirational features, no hidden systems.

---

## 19. Practical Reading of the Simulation

The build is a geography-pressure interaction engine with seven major amplifiers:

1. **Disasters and plagues** (including correlated global catastrophes)
2. **Megafauna decline** (the mid-game resource crisis that forces dietary revolution)
3. **Staged agriculture** (emergent from pressure, not scripted)
4. **Trade and diffusion** (knowledge spreads through contact, not independent invention)
5. **Genetic diversity** (isolation is slow death, contact is rescue)
6. **Leaders** (redirect tribal trajectory, make similar situations diverge)
7. **Diplomacy, alliances, raids, and combat** (reshaping frontiers and stability zones)

These systems do not replace migration. They reshape when migration happens, who survives it, and which regions turn into durable cores or unstable frontiers.

The simulation should produce recognizable macro-patterns without scripting:

- **Coastal migration corridors** from high coastal carrying capacity
- **River-valley agricultural cores** from high agri suitability + water + sedentism
- **Steppe raiding frontiers** from high mobility + low agriculture + raid incentives
- **Island isolation decline** from genetic diversity loss without trade contact
- **Post-megafauna dietary revolution** from hunt capacity collapse forcing broadened subsistence
- **Climate-driven expansion and contraction** from D-O oscillations and glacial cycles
- **Trade-network cultural zones** from diffusion creating shared ability profiles among neighbors
- **Fission-driven cultural diversification** from drift accumulating across branch lineages

That is the identity of the simulator.

---

## 20. Implementation Priority

For incremental development, systems should be added in this order based on impact and dependency:

1. **Climate curve replacement** (swap sine wave for piecewise-linear paleoclimate curve + D-O oscillation). Low cost, high impact -- makes the entire 70,000-year timeline historically recognizable.
2. **Megafauna system** (add megafaunaIndex to tiles, depletion formula, hunt capacity multiplier). Moderate cost, critical for mid-game transition.
3. **Food stores** (add foodStores to tribes, buffer logic). Low cost, prevents unfair single-year death spirals.
4. **Genetic diversity** (add geneticDiversity to tribes, inbreeding penalty, genetic rescue via trade). Low cost, creates powerful emergent isolation/contact dynamics.
5. **Correlated catastrophes** (supervolcanic winter, megadrought). Low cost, enables the 10% extinction-rate target.
6. **Storyteller** (prosperity tracking, event pacing multipliers). Low cost, smooths gameplay pacing.
7. **Allee threshold in growth equation** (replace linear penalty with multiplicative `(N-A)/N` term). Low cost, creates proper extinction vortex dynamics.
8. **Sea level** (add elevation to tiles, land-bridge toggle). Moderate cost, primarily needed for larger maps.

Each system is designed to be additive: the simulation should produce reasonable behavior at every stage of implementation, with each addition enriching the emergent dynamics rather than requiring a complete overhaul.
