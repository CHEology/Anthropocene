import { useDeferredValue, useEffect, useRef, useState, type CSSProperties } from 'react';

import { DEFAULT_SIMULATION_CONFIG, cloneSimulationConfig } from '../sim/config';
import type { InterventionCommand, SimulationConfig, SimulationEvent, TribeState } from '../sim/types';
import { getWorldPresentation, WORLD_PRESET_OPTIONS } from '../world/oldWorld';
import { MapCanvas } from './components/MapCanvas';
import { useSimulationController } from './useSimulationController';

type LayerMode = 'comfort' | 'habitability' | 'water' | 'temperature';
type InspectorTab = 'overview' | 'tile' | 'tribe' | 'pressures' | 'relations' | 'events';
type ThemeMode = 'dark' | 'light';

type InterventionDraft = {
  kind: InterventionCommand['kind'];
  scheduledYear: number;
  temperatureDelta: number;
  duration: number;
  note: string;
};

const ABILITY_LABELS: Record<string, string> = {
  foraging: 'Foraging',
  agriculture: 'Agriculture',
  heatTolerance: 'Heat Tolerance',
  coldTolerance: 'Cold Tolerance',
  waterEngineering: 'Water Engineering',
  attack: 'Attack',
  organization: 'Organization',
};

const LAYER_LABELS: Record<LayerMode, string> = {
  comfort: 'Comfort',
  habitability: 'Habitability',
  water: 'Water',
  temperature: 'Temperature',
};

const AGRICULTURE_STAGE_LABELS: Record<TribeState['development']['agricultureStage'], string> = {
  foraging: 'Foraging',
  tending: 'Tending',
  cultivation: 'Cultivation',
  agropastoral: 'Agropastoral',
  'settled-farming': 'Settled Farming',
};

const DISASTER_LABELS: Record<string, string> = {
  drought: 'Drought',
  flood: 'Flood',
  wildfire: 'Wildfire',
  'severe-winter': 'Severe Winter',
  earthquake: 'Earthquake',
  eruption: 'Eruption',
};

const PLAGUE_LABELS: Record<string, string> = {
  waterborne: 'Waterborne',
  respiratory: 'Respiratory',
  zoonotic: 'Zoonotic',
};

const EVENT_KIND_LABELS: Record<SimulationEvent['kind'], string> = {
  system: 'System',
  intervention: 'Intervention',
  innovation: 'Innovation',
  migration: 'Migration',
  warning: 'Warning',
  combat: 'Combat',
  trade: 'Trade',
  diplomacy: 'Diplomacy',
  disaster: 'Disaster',
  disease: 'Disease',
};

const CLIMATE_REGIME_LABELS: Record<string, string> = {
  'deep-glacial': 'Deep Glacial',
  glacial: 'Glacial',
  'cool-transition': 'Cool Transition',
  'temperate-window': 'Temperate Window',
  'warm-pulse': 'Warm Pulse',
  'volcanic-winter': 'Volcanic Winter',
};

const STORYTELLER_POSTURE_LABELS: Record<string, string> = {
  quiet: 'Quiet',
  balanced: 'Balanced',
  prosperity: 'Prosperity',
  recovery: 'Recovery',
  crisis: 'Crisis',
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const savedTheme = window.localStorage.getItem('anthropocene-theme');
  if (savedTheme === 'dark' || savedTheme === 'light') {
    return savedTheme;
  }

  return window.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark';
}

function formatSigned(value: number, digits = 1) {
  const rounded = value.toFixed(digits);
  return value > 0 ? `+${rounded}` : rounded;
}

function formatMetric(value: number, digits = 2) {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatStage(stage: TribeState['development']['agricultureStage']) {
  return AGRICULTURE_STAGE_LABELS[stage] ?? stage;
}

function formatClimateRegime(regime: string) {
  return CLIMATE_REGIME_LABELS[regime] ?? regime;
}

function formatStorytellerPosture(posture: string) {
  return STORYTELLER_POSTURE_LABELS[posture] ?? posture;
}

function formatElevation(value: number) {
  return `${Math.round(value)} m`;
}

function formatViability(tribe: TribeState) {
  const strain =
    tribe.pressures.total * 0.42 +
    tribe.pressures.food * 0.22 +
    tribe.pressures.health * 0.12 +
    Math.max(0, 0.4 - tribe.foodStores) * 0.14 +
    (1 - tribe.geneticDiversity) * 0.1 -
    tribe.development.sedentism * 0.05;

  if (strain < 0.18) {
    return 'Expanding';
  }
  if (strain < 0.36) {
    return 'Stable';
  }
  if (strain < 0.58) {
    return 'Strained';
  }
  return 'Fragile';
}

function sparklinePoints(values: number[], width: number, height: number) {
  if (values.length <= 1) {
    return `0,${height / 2} ${width},${height / 2}`;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${x},${y}`;
    })
    .join(' ');
}

function ChartCard({
  label,
  value,
  color,
  history,
}: {
  label: string;
  value: number;
  color: string;
  history: number[];
}) {
  return (
    <article className="chart-card">
      <div className="chart-card__label">{label}</div>
      <div className="chart-card__value">{formatMetric(value)}</div>
      <svg className="chart-card__sparkline" viewBox="0 0 180 56" preserveAspectRatio="none">
        <polyline fill="none" stroke={color} strokeWidth="2.5" points={sparklinePoints(history, 180, 56)} />
      </svg>
    </article>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(value: number): void;
}) {
  return (
    <label className="slider-field">
      <div className="slider-field__meta">
        <span>{label}</span>
        <strong>{value.toFixed(step < 1 ? 3 : 1)}</strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-chip">
      <span className="metric-chip__label">{label}</span>
      <strong className="metric-chip__value">{value}</strong>
    </div>
  );
}

function StatusChip({ label, tone = 'default' }: { label: string; tone?: 'default' | 'danger' | 'info' | 'success' }) {
  return <span className={`status-chip status-chip--${tone}`}>{label}</span>;
}

function ChronologyEntry({ event }: { event: SimulationEvent }) {
  const title = event.detail ? `${event.title} - ${event.detail}` : event.title;

  return (
    <article className={`chronology-entry chronology-entry--${event.kind}`} title={title}>
      <div className="chronology-entry__body">
        <span className="chronology-entry__kind">{EVENT_KIND_LABELS[event.kind] ?? event.kind}</span>
        <strong className="chronology-entry__title">{event.title}</strong>
        {event.detail ? <span className="chronology-entry__detail">{event.detail}</span> : null}
      </div>
      <strong className="chronology-entry__year">Y{event.year}</strong>
    </article>
  );
}

function AbilityRows({ tribe }: { tribe: TribeState | null }) {
  if (!tribe) {
    return <div className="empty-state">Select a tribe to inspect abilities.</div>;
  }

  return (
    <div className="bars-list">
      {Object.entries(tribe.abilities).map(([ability, value]) => (
        <div className="bar-row" key={ability}>
          <div className="bar-row__meta">
            <span>{ABILITY_LABELS[ability] ?? ability}</span>
            <strong>
              {Math.round(value.current)} / {Math.round(value.cap)}
            </strong>
          </div>
          <div className="bar-track">
            <div className="bar-track__fill" style={{ width: `${value.current}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PressureRows({ tribe }: { tribe: TribeState | null }) {
  if (!tribe) {
    return <div className="empty-state">No active tribe selected.</div>;
  }

  const entries = [
    ['Food', tribe.pressures.food],
    ['Heat', tribe.pressures.heat],
    ['Cold', tribe.pressures.cold],
    ['Water', tribe.pressures.water],
    ['Competition', tribe.pressures.competition],
    ['Organization', tribe.pressures.organization],
    ['Health', tribe.pressures.health],
    ['Total', tribe.pressures.total],
  ] as const;

  return (
    <div className="bars-list">
      {entries.map(([label, value]) => (
        <div className="bar-row" key={label}>
          <div className="bar-row__meta">
            <span>{label}</span>
            <strong>{value.toFixed(2)}</strong>
          </div>
          <div className="bar-track bar-track--danger">
            <div className="bar-track__fill bar-track__fill--danger" style={{ width: `${value * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function buildCommandId(worldYear: number, pending: number, executed: number) {
  return `cmd-${worldYear}-${pending + executed + 1}`;
}

export function App() {
  const controller = useSimulationController(DEFAULT_SIMULATION_CONFIG);
  const [draftConfig, setDraftConfig] = useState<SimulationConfig>(() => cloneSimulationConfig(DEFAULT_SIMULATION_CONFIG));
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme);
  const [layerMode, setLayerMode] = useState<LayerMode>('comfort');
  const [showRoutes, setShowRoutes] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showPressure, setShowPressure] = useState(true);
  const [leftRailOpen, setLeftRailOpen] = useState(false);
  const [rightRailOpen, setRightRailOpen] = useState(false);
  const [rightRailMinimized, setRightRailMinimized] = useState(false);
  const [rightRailWidth, setRightRailWidth] = useState(392);
  const [resizingRightRail, setResizingRightRail] = useState(false);
  const [interventionOpen, setInterventionOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview');
  const presentation = getWorldPresentation(controller.worldState.worldPreset);
  const draftPresentation = getWorldPresentation(draftConfig.worldPreset);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(presentation.startTileId);
  const [selectedTribeId, setSelectedTribeId] = useState<string | null>(presentation.startTribeId);
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const rightRailResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [interventionDraft, setInterventionDraft] = useState<InterventionDraft>({
    kind: 'climate-pulse',
    scheduledYear: 80,
    temperatureDelta: -1.2,
    duration: 140,
    note: 'Schedule climate disturbance for replayable analysis.',
  });

  const deferredWorldState = useDeferredValue(controller.worldState);
  const liveWorldState = controller.worldState;
  const controlsDisabled = controller.connectionState !== 'live';
  const selectedTile = liveWorldState.tiles.find((tile) => tile.id === selectedTileId) ?? null;
  const selectedTribe = liveWorldState.tribes.find((tribe) => tribe.id === selectedTribeId) ?? null;
  const tribesOnSelectedTile = selectedTile
    ? liveWorldState.tribes.filter((tribe) => tribe.tileId === selectedTile.id)
    : [];
  const tribeNameById = new Map(liveWorldState.tribes.map((tribe) => [tribe.id, tribe.name]));

  useEffect(() => {
    setDraftConfig(cloneSimulationConfig(controller.config));
  }, [controller.config]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    window.localStorage.setItem('anthropocene-theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!liveWorldState.tiles.some((tile) => tile.id === selectedTileId)) {
      setSelectedTileId(presentation.startTileId);
    }
  }, [liveWorldState.tiles, presentation.startTileId, selectedTileId]);

  useEffect(() => {
    if (selectedTribeId && !liveWorldState.tribes.some((tribe) => tribe.id === selectedTribeId)) {
      setSelectedTribeId(null);
    }
  }, [liveWorldState.tribes, selectedTribeId]);

  useEffect(() => {
    if (!selectedTileId) {
      return;
    }

    const tribeOnTile = liveWorldState.tribes.find((tribe) => tribe.tileId === selectedTileId) ?? null;
    const tribeSelectionIsValid = Boolean(
      selectedTribeId && liveWorldState.tribes.some((tribe) => tribe.id === selectedTribeId && tribe.tileId === selectedTileId),
    );

    if (!tribeSelectionIsValid) {
      setSelectedTribeId(tribeOnTile?.id ?? null);
    }
  }, [liveWorldState.tribes, selectedTileId, selectedTribeId]);

  useEffect(() => {
    if (!selectedTribe || inspectorTab === 'tile') {
      return;
    }

    if (selectedTileId !== selectedTribe.tileId) {
      setSelectedTileId(selectedTribe.tileId);
    }
  }, [inspectorTab, selectedTileId, selectedTribe]);

  useEffect(() => {
    if (!resizingRightRail) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const current = rightRailResizeRef.current;
      if (!current) {
        return;
      }

      const delta = current.startX - event.clientX;
      setRightRailWidth(clamp(current.startWidth + delta, 300, 620));
    };

    const stopResize = () => {
      rightRailResizeRef.current = null;
      setResizingRightRail(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
    };
  }, [resizingRightRail]);

  function handleTileSelect(tileId: string) {
    const tribeOnTile = liveWorldState.tribes.find((tribe) => tribe.tileId === tileId) ?? null;
    setSelectedTileId(tileId);
    setSelectedTribeId(tribeOnTile?.id ?? null);
    setInspectorTab('tile');
    setRightRailMinimized(false);
    setRightRailOpen(true);
  }

  function handleTribeSelect(tribeId: string) {
    const tribe = liveWorldState.tribes.find((candidate) => candidate.id === tribeId) ?? null;
    setSelectedTribeId(tribeId);
    if (tribe) {
      setSelectedTileId(tribe.tileId);
    }
    setInspectorTab('tribe');
    setRightRailMinimized(false);
    setRightRailOpen(true);
  }

  function beginRightRailResize(event: React.PointerEvent<HTMLDivElement>) {
    if (rightRailMinimized || window.matchMedia('(max-width: 1380px)').matches) {
      return;
    }

    rightRailResizeRef.current = {
      startX: event.clientX,
      startWidth: rightRailWidth,
    };
    setResizingRightRail(true);
    event.preventDefault();
  }

  function handleReset() {
    void controller.reset(draftConfig);
    setSelectedTileId(draftPresentation.startTileId);
    setSelectedTribeId(draftPresentation.startTribeId);
  }

  function handlePresetChange(nextPreset: SimulationConfig['worldPreset']) {
    const nextConfig = {
      ...draftConfig,
      worldPreset: nextPreset,
    };
    const nextPresentation = getWorldPresentation(nextPreset);

    setDraftConfig(nextConfig);
    setSelectedTileId(nextPresentation.startTileId);
    setSelectedTribeId(nextPresentation.startTribeId);
    void controller.reset(nextConfig);
  }

  function handleSpeedChange(nextValue: number) {
    controller.updateRuntimeSpeed(nextValue);
    setDraftConfig((current) => ({
      ...current,
      runtime: {
        ...current.runtime,
        yearsPerSecond: nextValue,
      },
    }));
  }

  function scheduleIntervention() {
    const command: InterventionCommand = {
      id: buildCommandId(
        controller.worldState.year,
        controller.worldState.pendingInterventions.length,
        controller.worldState.executedInterventions.length,
      ),
      label:
        interventionDraft.kind === 'climate-pulse'
          ? `Climate Pulse ${formatSigned(interventionDraft.temperatureDelta)}°C`
          : 'Observation Note',
      kind: interventionDraft.kind,
      scheduledYear: interventionDraft.scheduledYear,
      payload:
        interventionDraft.kind === 'climate-pulse'
          ? {
              temperatureDelta: interventionDraft.temperatureDelta,
              duration: interventionDraft.duration,
              note: interventionDraft.note,
            }
          : {
              note: interventionDraft.note,
            },
    };
    void controller.scheduleIntervention(command);
    setInterventionOpen(false);
  }

  const history = deferredWorldState.history;
  const activePulse = deferredWorldState.activeClimatePulses.reduce(
    (sum, pulse) => sum + pulse.temperatureDelta,
    0,
  );
  const relations = selectedTribe
    ? Object.entries(selectedTribe.relationships).sort((left, right) => right[1] - left[1])
    : [];
  const activeDisasterCount = deferredWorldState.metrics.activeHazards;
  const activePlagueCount = deferredWorldState.metrics.activePlagues;
  const allianceCount = deferredWorldState.tribes.reduce((sum, tribe) => sum + tribe.alliances.length, 0) / 2;
  const selectedTileDisasters = selectedTile?.activeDisasters ?? [];
  const selectedTilePlagues = selectedTile?.activePlagues ?? [];
  const selectedTribeAllies = selectedTribe
    ? selectedTribe.alliances.map((allianceId) => tribeNameById.get(allianceId) ?? allianceId)
    : [];
  const climateStatus = formatClimateRegime(deferredWorldState.globalClimate.regime);
  const storytellerStatus = formatStorytellerPosture(deferredWorldState.storyteller.posture);
  const selectedTribeViability = selectedTribe ? formatViability(selectedTribe) : null;

  return (
    <div
      className="app-shell"
      style={{ ['--right-rail-width' as string]: rightRailMinimized ? '72px' : `${rightRailWidth}px` } as CSSProperties}
    >
      <header className="topbar panel-surface">
        <div className="title-block">
          <p className="eyebrow">Migration Analysis Console</p>
          <h1>Anthropocene Simulator</h1>
          <p className="title-block__summary">
            Deterministic world-state dashboard for early-human migration modeling. {controller.connectionState === 'live' ? 'Backend connected.' : controller.connectionState === 'connecting' ? 'Connecting to backend...' : `Backend error: ${controller.error ?? 'Unavailable.'}`}
          </p>
          <div className="metric-grid metric-grid--topbar">
            <MetricChip label="Year" value={`${deferredWorldState.year}`} />
            <MetricChip label="Population" value={`${deferredWorldState.metrics.totalPopulation}`} />
            <MetricChip label="Climate Regime" value={climateStatus} />
            <MetricChip label="Queued" value={`${deferredWorldState.pendingInterventions.length}`} />
            <MetricChip label="Backend" value={controller.connectionState === 'live' ? 'Live' : controller.connectionState === 'connecting' ? 'Connecting' : 'Error'} />
          </div>
        </div>

        <div className="topbar__controls">
          <button className="button button--primary" disabled={controlsDisabled} onClick={controller.toggleRunning}>
            {controller.running ? 'Pause' : 'Run'}
          </button>
          <button className="button" disabled={controlsDisabled || controller.syncing} onClick={() => void controller.step(1)}>Step 1y</button>
          <label className="compact-field">
            <span>Speed</span>
            <select value={controller.config.runtime.yearsPerSecond} onChange={(event) => handleSpeedChange(Number(event.target.value))}>
              {[1, 2, 4, 8, 16, 32].map((speed) => (
                <option key={speed} value={speed}>{speed} y/s</option>
              ))}
            </select>
          </label>
          <label className="compact-field compact-field--seed">
            <span>Seed</span>
            <input
              type="number"
              value={draftConfig.seed}
              onChange={(event) => setDraftConfig((current) => ({ ...current, seed: Number(event.target.value) || 0 }))}
            />
          </label>
          <label className="compact-field compact-field--preset">
            <span>Preset</span>
            <select value={draftConfig.worldPreset} onChange={(event) => handlePresetChange(event.target.value as SimulationConfig['worldPreset'])}>
              {WORLD_PRESET_OPTIONS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
            </select>
          </label>
          <button className="button" disabled={controller.syncing} onClick={handleReset}>Reset</button>
          <button className="button" onClick={() => setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))}>
            Theme: {themeMode === 'dark' ? 'Dark' : 'Light'}
          </button>
          <button className="button" disabled={controlsDisabled} onClick={() => setInterventionOpen((value) => !value)}>Interventions</button>
          <button className="button button--ghost mobile-only" onClick={() => setLeftRailOpen((value) => !value)}>Controls</button>
          <button className="button button--ghost mobile-only" onClick={() => setRightRailOpen((value) => !value)}>Inspector</button>
        </div>
      </header>

      <aside className={`side-rail side-rail--left panel-surface ${leftRailOpen ? 'is-open' : ''}`}>
        <section className="panel-section">
          <div className="section-heading">
            <h2>Scenario</h2>
            <p>{draftPresentation.description}</p>
          </div>
          <div className="metric-grid">
            <MetricChip label="Start Tile" value={draftPresentation.startTileName} />
            <MetricChip label="Routes" value={`${draftPresentation.routeLanes.length}`} />
            <MetricChip label="Climate Regime" value={climateStatus} />
            <MetricChip label="Anomaly" value={`${formatSigned(activePulse)}°C`} />
          </div>
          <p className="aside-note">Preset changes apply immediately. Other draft parameters apply on reset. Runtime controls remain deterministic for a fixed seed.</p>
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <h2>Global Parameters</h2>
            <p>Baseline controls from the PDF specification.</p>
          </div>
          <SliderField label="Birth (G_birth)" value={draftConfig.globals.G_birth} min={0.01} max={0.08} step={0.001} onChange={(value) => setDraftConfig((current) => ({ ...current, globals: { ...current.globals, G_birth: value } }))} />
          <SliderField label="Death (G_death)" value={draftConfig.globals.G_death} min={0.01} max={0.08} step={0.001} onChange={(value) => setDraftConfig((current) => ({ ...current, globals: { ...current.globals, G_death: value } }))} />
          <SliderField label="Hostility (G_hostility)" value={draftConfig.globals.G_hostility} min={0} max={1} step={0.01} onChange={(value) => setDraftConfig((current) => ({ ...current, globals: { ...current.globals, G_hostility: value } }))} />
          <SliderField label="Innovation (G_innovation)" value={draftConfig.globals.G_innovation} min={0} max={0.01} step={0.0005} onChange={(value) => setDraftConfig((current) => ({ ...current, globals: { ...current.globals, G_innovation: value } }))} />
          <SliderField label="Cohesion (G_cohesion)" value={draftConfig.globals.G_cohesion} min={0.5} max={1} step={0.01} onChange={(value) => setDraftConfig((current) => ({ ...current, globals: { ...current.globals, G_cohesion: value } }))} />
          <SliderField label="Mean Temp (G_temp)" value={draftConfig.globals.G_temp} min={-5} max={30} step={0.5} onChange={(value) => setDraftConfig((current) => ({ ...current, globals: { ...current.globals, G_temp: value } }))} />
          <SliderField label="Migration (G_migration)" value={draftConfig.globals.G_migration} min={0} max={0.6} step={0.01} onChange={(value) => setDraftConfig((current) => ({ ...current, globals: { ...current.globals, G_migration: value } }))} />
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <h2>Map Layers</h2>
            <p>Analytical overlays for terrain suitability and stress.</p>
          </div>
          <div className="toggle-cluster">
            {(['comfort', 'habitability', 'water', 'temperature'] as LayerMode[]).map((mode) => (
              <button key={mode} className={`toggle-pill ${layerMode === mode ? 'is-active' : ''}`} onClick={() => setLayerMode(mode)}>
                {LAYER_LABELS[mode]}
              </button>
            ))}
          </div>
          <div className="checkbox-list">
            <label><input type="checkbox" checked={showRoutes} onChange={(event) => setShowRoutes(event.target.checked)} /> Corridor lanes</label>
            <label><input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} /> Controlled labels</label>
            <label><input type="checkbox" checked={showPressure} onChange={(event) => setShowPressure(event.target.checked)} /> Pressure markers</label>
          </div>
        </section>
      </aside>

      <main className="map-stage panel-surface">
        <div className="map-stage__header">
          <div>
            <p className="eyebrow">World Map</p>
            <h2>{presentation.name}</h2>
          </div>
          <div className="map-stage__stats">
            <MetricChip label="Tiles" value={`${deferredWorldState.tiles.length}`} />
            <MetricChip label="Tribes" value={`${deferredWorldState.metrics.tribeCount}`} />
            <MetricChip label="Avg Comfort" value={deferredWorldState.metrics.averageComfort.toFixed(2)} />
            <MetricChip label="Avg Pressure" value={deferredWorldState.metrics.averagePressure.toFixed(2)} />
          </div>
        </div>
        <MapCanvas
          hoveredTileId={hoveredTileId}
          layerMode={layerMode}
          onHoverTile={setHoveredTileId}
          onSelectTile={handleTileSelect}
          presentation={presentation}
          selectedTileId={selectedTileId}
          showLabels={showLabels}
          showPressure={showPressure}
          showRoutes={showRoutes}
          themeMode={themeMode}
          worldState={liveWorldState}
        />
        <div className="map-stage__footer">
          <div>
            <strong>{selectedTile?.name ?? 'No tile selected'}</strong>
            <span>{selectedTile ? `${selectedTile.region} | ${selectedTile.climate} | ${selectedTile.coastal ? 'coastal' : 'inland'} | ${selectedTile.terrain}` : 'Click a hex to inspect tile state.'}</span>
          </div>
          <div>
            <strong>{selectedTribe?.name ?? 'No tribe selected'}</strong>
            <span>{selectedTribe ? `${selectedTribe.pop} people • ${selectedTribe.leader?.archetype ?? 'No leader'}` : 'Use the map or tile panel to select a tribe.'}</span>
          </div>
        </div>
      </main>

      <aside className={`side-rail side-rail--right panel-surface ${rightRailOpen ? 'is-open' : ''} ${rightRailMinimized ? 'is-minimized' : ''}`}>
        <div className={`side-rail__resize-handle ${resizingRightRail ? 'is-active' : ''}`} onPointerDown={beginRightRailResize} />
        <div className="rail-header">
          <div className="rail-header__title">
            <p className="eyebrow">Inspector</p>
            <strong>{selectedTile?.name ?? selectedTribe?.name ?? 'Selection'}</strong>
          </div>
          <div className="rail-header__actions">
            <button className="button button--ghost" onClick={() => setRightRailMinimized((value) => !value)}>
              {rightRailMinimized ? 'Expand' : 'Minimize'}
            </button>
            <button className="button button--ghost" onClick={() => { setRightRailOpen(false); setRightRailMinimized(false); }}>
              Close
            </button>
          </div>
        </div>
        {!rightRailMinimized && (
          <>
        <div className="tabs">
          {(['overview', 'tile', 'tribe', 'pressures', 'relations', 'events'] as InspectorTab[]).map((tab) => (
            <button key={tab} className={`tab-button ${inspectorTab === tab ? 'is-active' : ''}`} onClick={() => setInspectorTab(tab)}>
              {tab}
            </button>
          ))}
        </div>

        <div className="inspector-panel">
          {inspectorTab === 'overview' && (
            <>
              <div className="section-heading">
                <h2>Overview</h2>
                <p>Current simulation state and active shell instrumentation.</p>
              </div>
              <div className="metric-grid">
                <MetricChip label="Innovations" value={`${deferredWorldState.metrics.innovations}`} />
                <MetricChip label="Conflict Alerts" value={`${deferredWorldState.metrics.conflicts}`} />
                <MetricChip label="Active Hazards" value={`${activeDisasterCount}`} />
                <MetricChip label="Active Plagues" value={`${activePlagueCount}`} />
                <MetricChip label="Avg Stores" value={formatPercent(deferredWorldState.metrics.averageFoodStores)} />
                <MetricChip label="Avg Diversity" value={formatPercent(deferredWorldState.metrics.averageGeneticDiversity)} />
                <MetricChip label="Avg Megafauna" value={formatPercent(deferredWorldState.metrics.averageMegafauna)} />
                <MetricChip label="Tick Status" value={controller.running ? 'Running' : controller.connectionState === 'connecting' ? 'Connecting' : controller.connectionState === 'error' ? 'Offline' : 'Paused'} />
              </div>
              <div className="subsection">
                <h3>Climate and Pacing</h3>
                <div className="detail-list">
                  <div className="detail-row"><span>Climate Regime</span><strong>{climateStatus}</strong></div>
                  <div className="detail-row"><span>Storyteller</span><strong>{storytellerStatus}</strong></div>
                  <div className="detail-row"><span>Prosperity</span><strong>{formatPercent(deferredWorldState.storyteller.prosperity)}</strong></div>
                  <div className="detail-row"><span>Disaster / Recovery</span><strong>{`${deferredWorldState.storyteller.disasterMultiplier.toFixed(2)} / ${deferredWorldState.storyteller.recoveryMultiplier.toFixed(2)}`}</strong></div>
                </div>
              </div>
              <AbilityRows tribe={selectedTribe} />
            </>
          )}

          {inspectorTab === 'tile' && (
            <>
              <div className="section-heading">
                <h2>{selectedTile?.name ?? 'Tile'}</h2>
                <p>{selectedTile ? `${selectedTile.region} | ${selectedTile.climate} | ${selectedTile.coastal ? 'coastal' : 'inland'}` : 'Choose a tile from the map.'}</p>
              </div>
              {selectedTile ? (
                <div className="detail-grid">
                  <MetricChip label="Comfort" value={selectedTile.comfort.toFixed(2)} />
                  <MetricChip label="Temp" value={`${selectedTile.temperature.toFixed(1)}°C`} />
                  <MetricChip label="Water" value={`${selectedTile.water}`} />
                  <MetricChip label="Elevation" value={formatElevation(selectedTile.elevation)} />
                  <MetricChip label="Megafauna" value={formatPercent(selectedTile.megafaunaIndex)} />
                  <MetricChip label="Coastal" value={selectedTile.coastal ? 'Yes' : 'No'} />
                  <MetricChip label="Hunt K" value={selectedTile.carryingCapacity.hunt.toFixed(0)} />
                  <MetricChip label="Agri K" value={selectedTile.carryingCapacity.agri.toFixed(0)} />
                  <MetricChip label="Water K" value={selectedTile.carryingCapacity.water.toFixed(0)} />
                  <MetricChip label="Neighbors" value={`${selectedTile.neighbors.length}`} />
                </div>
              ) : (
                <div className="empty-state">No tile selected.</div>
              )}
              <div className="subsection">
                <h3>Hazards and Ecology</h3>
                <div className="detail-list">
                  <div className="detail-row"><span>Climate Regime</span><strong>{climateStatus}</strong></div>
                  <div className="detail-row"><span>Active Disasters</span><strong>{selectedTileDisasters.length ? selectedTileDisasters.map((disaster) => DISASTER_LABELS[disaster.kind] ?? disaster.kind).join(', ') : 'None'}</strong></div>
                  <div className="detail-row"><span>Active Plagues</span><strong>{selectedTilePlagues.length ? selectedTilePlagues.map((plague) => PLAGUE_LABELS[plague.kind] ?? plague.kind).join(', ') : 'None'}</strong></div>
                </div>
              </div>
              <div className="subsection">
                <h3>Resident Tribes</h3>
                <div className="list-stack">
                  {tribesOnSelectedTile.length ? tribesOnSelectedTile.map((tribe) => (
                    <button key={tribe.id} className={`list-row ${selectedTribeId === tribe.id ? 'is-active' : ''}`} onClick={() => handleTribeSelect(tribe.id)}>
                      <span>{tribe.name}</span>
                      <strong>{tribe.pop}</strong>
                    </button>
                  )) : <div className="empty-state">No tribe currently occupies this tile.</div>}
                </div>
              </div>
            </>
          )}

          {inspectorTab === 'tribe' && (
            <>
              <div className="section-heading">
                <h2>{selectedTribe?.name ?? 'Tribe'}</h2>
                <p>{selectedTribe ? `${selectedTribe.pop} people • ${selectedTribe.leader?.archetype ?? 'No leader'} archetype` : 'Choose a tribe from the tile panel.'}</p>
              </div>
              {selectedTribe ? (
                <>
                  <div className="detail-grid">
                    <MetricChip label="Population" value={`${selectedTribe.pop}`} />
                    <MetricChip label="Stage" value={formatStage(selectedTribe.development.agricultureStage)} />
                    <MetricChip label="Sedentism" value={formatPercent(selectedTribe.development.sedentism)} />
                    <MetricChip label="Domestication" value={selectedTribe.development.domestication.toFixed(1)} />
                    <MetricChip label="Food Stores" value={formatPercent(selectedTribe.foodStores)} />
                    <MetricChip label="Genetic" value={formatPercent(selectedTribe.geneticDiversity)} />
                    <MetricChip label="Viability" value={selectedTribeViability ?? 'Unknown'} />
                    <MetricChip label="Trade" value={selectedTribe.exchange.tradeVolume.toFixed(2)} />
                    <MetricChip label="War Wear" value={selectedTribe.exchange.warExhaustion.toFixed(2)} />
                    <MetricChip label="Allies" value={`${selectedTribe.alliances.length}`} />
                  </div>
                  <div className="subsection">
                    <h3>Leader State</h3>
                    <div className="detail-list">
                      <div className="detail-row"><span>Archetype</span><strong>{selectedTribe.leader?.archetype ?? 'Vacant'}</strong></div>
                      <div className="detail-row"><span>Authority</span><strong>{selectedTribe.leader ? formatPercent(selectedTribe.leader.authority) : '0%'}</strong></div>
                      <div className="detail-row"><span>Legitimacy</span><strong>{selectedTribe.leader ? formatPercent(selectedTribe.leader.legitimacy) : '0%'}</strong></div>
                      <div className="detail-row"><span>Age / Tenure</span><strong>{selectedTribe.leader ? `${selectedTribe.leader.age} / ${selectedTribe.leader.tenure}` : '0 / 0'}</strong></div>
                    </div>
                  </div>
                  <div className="subsection">
                    <h3>Exchange and Risk</h3>
                    <div className="detail-list">
                      <div className="detail-row"><span>Knowledge Diffusion</span><strong>{selectedTribe.exchange.diffusion.toFixed(2)}</strong></div>
                      <div className="detail-row"><span>Raid Exposure</span><strong>{selectedTribe.exchange.raidExposure.toFixed(2)}</strong></div>
                      <div className="detail-row"><span>Health Pressure</span><strong>{selectedTribe.pressures.health.toFixed(2)}</strong></div>
                      <div className="detail-row"><span>Climate / Story</span><strong>{`${climateStatus} / ${storytellerStatus}`}</strong></div>
                      <div className="detail-row"><span>Tile</span><strong>{selectedTribe.tileId}</strong></div>
                      <div className="detail-row"><span>Ancestry</span><strong>{selectedTribe.ancestryId}</strong></div>
                    </div>
                  </div>
                  <div className="tag-list">
                    {selectedTribeAllies.length ? selectedTribeAllies.map((ally) => (
                      <StatusChip key={ally} label={`Allied with ${ally}`} tone="success" />
                    )) : <StatusChip label="No active alliances" />}
                  </div>
                </>
              ) : <div className="empty-state">No tribe selected.</div>}
              <AbilityRows tribe={selectedTribe} />
            </>
          )}

          {inspectorTab === 'pressures' && (
            <>
              <div className="section-heading">
                <h2>Pressures</h2>
                <p>Pressure proxies driving migration and innovation scaffolding.</p>
              </div>
              <PressureRows tribe={selectedTribe} />
            </>
          )}

          {inspectorTab === 'relations' && (
            <>
              <div className="section-heading">
                <h2>Relations</h2>
                <p>Live diplomacy, alliance, and hostility edges shaped by trade, raids, and co-location pressure.</p>
              </div>
              <div className="list-stack">
                {relations.length ? relations.map(([tribeId, value]) => (
                  <div className="list-row" key={tribeId}>
                    <span>{tribeNameById.get(tribeId) ?? tribeId}</span>
                    <div className="list-row__aside">
                      {selectedTribe?.alliances.includes(tribeId) ? <StatusChip label="Allied" tone="success" /> : null}
                      <strong>{value.toFixed(2)}</strong>
                    </div>
                  </div>
                )) : <div className="empty-state">No relationship edges are available for the selected tribe.</div>}
              </div>
            </>
          )}

          {inspectorTab === 'events' && (
            <>
              <div className="section-heading">
                <h2>Event Feed</h2>
                <p>Replayable event chronology derived from seed + intervention sequence.</p>
              </div>
              <div className="event-stack">
                {deferredWorldState.eventLog.map((event) => (
                  <article className={`event-card event-card--${event.kind}`} key={event.id}>
                    <div className="event-card__meta">
                      <span>{event.kind}</span>
                      <strong>Year {event.year}</strong>
                    </div>
                    <h3>{event.title}</h3>
                    <p>{event.detail}</p>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
          </>
        )}
      </aside>

      <section className="timeline-strip panel-surface">
        <div className="timeline-strip__charts">
          <ChartCard label="Population" value={deferredWorldState.metrics.totalPopulation} color="#d0d5dd" history={history.map((entry) => entry.totalPopulation)} />
          <ChartCard label="Tribe Count" value={deferredWorldState.metrics.tribeCount} color="#7aa2c8" history={history.map((entry) => entry.tribeCount)} />
          <ChartCard label="Innovations" value={deferredWorldState.metrics.innovations} color="#7e9f74" history={history.map((entry) => entry.innovations)} />
          <ChartCard label="Conflict Alerts" value={deferredWorldState.metrics.conflicts} color="#ba6a4a" history={history.map((entry) => entry.conflicts)} />
        </div>
        <div className="timeline-strip__events">
          <div className="section-heading">
            <h2>Chronology</h2>
            <p>Recent simulation entries pinned for operational review.</p>
          </div>
          <div className="chronology-list">
            {deferredWorldState.eventLog.slice(0, 8).map((event) => (
              <ChronologyEntry event={event} key={event.id} />
            ))}
          </div>
        </div>
      </section>

      <aside className={`drawer panel-surface ${interventionOpen ? 'is-open' : ''}`}>
        <div className="section-heading">
          <h2>Intervention Drawer</h2>
          <p>Queue deterministic high-level commands for replay and comparison.</p>
        </div>
        <label className="compact-field compact-field--full">
          <span>Mode</span>
          <select value={interventionDraft.kind} onChange={(event) => setInterventionDraft((current) => ({ ...current, kind: event.target.value as InterventionCommand['kind'] }))}>
            <option value="climate-pulse">Climate Pulse</option>
            <option value="observation-note">Observation Note</option>
          </select>
        </label>
        <label className="compact-field compact-field--full">
          <span>Target Year</span>
          <input type="number" value={interventionDraft.scheduledYear} onChange={(event) => setInterventionDraft((current) => ({ ...current, scheduledYear: Number(event.target.value) }))} />
        </label>
        {interventionDraft.kind === 'climate-pulse' && (
          <>
            <label className="compact-field compact-field--full">
              <span>Temperature Delta</span>
              <input type="number" step="0.1" value={interventionDraft.temperatureDelta} onChange={(event) => setInterventionDraft((current) => ({ ...current, temperatureDelta: Number(event.target.value) }))} />
            </label>
            <label className="compact-field compact-field--full">
              <span>Duration</span>
              <input type="number" value={interventionDraft.duration} onChange={(event) => setInterventionDraft((current) => ({ ...current, duration: Number(event.target.value) }))} />
            </label>
          </>
        )}
        <label className="compact-field compact-field--full">
          <span>Note</span>
          <textarea rows={4} value={interventionDraft.note} onChange={(event) => setInterventionDraft((current) => ({ ...current, note: event.target.value }))} />
        </label>
        <div className="drawer__actions">
          <button className="button button--primary" disabled={controlsDisabled || controller.syncing} onClick={scheduleIntervention}>Queue Command</button>
          <button className="button" onClick={() => setInterventionOpen(false)}>Close</button>
        </div>
        <div className="subsection">
          <h3>Queued Commands</h3>
          <div className="list-stack list-stack--compact">
            {deferredWorldState.pendingInterventions.length ? deferredWorldState.pendingInterventions.map((command) => (
              <div className="list-row" key={command.id}>
                <span>{command.label}</span>
                <strong>Y{command.scheduledYear}</strong>
              </div>
            )) : <div className="empty-state">No interventions queued.</div>}
          </div>
        </div>
      </aside>
    </div>
  );
}

