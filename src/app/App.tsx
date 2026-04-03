import { useDeferredValue, useEffect, useState } from 'react';

import { MapCanvas } from './components/MapCanvas';
import { useSimulationController } from './useSimulationController';
import { DEFAULT_SIMULATION_CONFIG, cloneSimulationConfig } from '../sim/config';
import { getWorldPresentation } from '../world/oldWorld';
import type {
  InterventionCommand,
  SimulationConfig,
  TribeState,
  WorldMetrics,
  WorldState,
} from '../sim/types';

type LayerMode = 'comfort' | 'habitability' | 'water' | 'temperature';
type InspectorTab = 'overview' | 'tile' | 'tribe' | 'pressures' | 'relations' | 'events';

type InterventionDraft = {
  kind: InterventionCommand['kind'];
  scheduledYear: number;
  temperatureDelta: number;
  duration: number;
  note: string;
};

function formatSigned(value: number, digits = 1) {
  const rounded = value.toFixed(digits);
  return value > 0 ? `+${rounded}` : rounded;
}

function formatMetric(value: number, digits = 2) {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
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
        <polyline fill="none" stroke={color} strokeWidth="3" points={sparklinePoints(history, 180, 56)} />
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
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
            <span>{ability}</span>
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

function buildCommandId(worldState: WorldState) {
  return `cmd-${worldState.year}-${worldState.pendingInterventions.length + worldState.executedInterventions.length + 1}`;
}

export function App() {
  const controller = useSimulationController(DEFAULT_SIMULATION_CONFIG);
  const [draftConfig, setDraftConfig] = useState<SimulationConfig>(() => cloneSimulationConfig(DEFAULT_SIMULATION_CONFIG));
  const [layerMode, setLayerMode] = useState<LayerMode>('comfort');
  const [showRoutes, setShowRoutes] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showPressure, setShowPressure] = useState(true);
  const [leftRailOpen, setLeftRailOpen] = useState(false);
  const [rightRailOpen, setRightRailOpen] = useState(false);
  const [interventionOpen, setInterventionOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview');
  const presentation = getWorldPresentation(controller.worldState.worldPreset);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(presentation.startTileId);
  const [selectedTribeId, setSelectedTribeId] = useState<string | null>(presentation.startTribeId);
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const [interventionDraft, setInterventionDraft] = useState<InterventionDraft>({
    kind: 'climate-pulse',
    scheduledYear: 80,
    temperatureDelta: -1.2,
    duration: 140,
    note: 'Mark a major inflection for later slices.',
  });

  const deferredWorldState = useDeferredValue(controller.worldState);
  const selectedTile = deferredWorldState.tiles.find((tile) => tile.id === selectedTileId) ?? null;
  const selectedTribe = deferredWorldState.tribes.find((tribe) => tribe.id === selectedTribeId) ?? null;
  const tribesOnSelectedTile = selectedTile
    ? deferredWorldState.tribes.filter((tribe) => tribe.tileId === selectedTile.id)
    : [];

  useEffect(() => {
    setDraftConfig(cloneSimulationConfig(controller.config));
  }, [controller.config]);

  useEffect(() => {
    if (!deferredWorldState.tiles.some((tile) => tile.id === selectedTileId)) {
      setSelectedTileId(presentation.startTileId);
    }
  }, [deferredWorldState.tiles, presentation.startTileId, selectedTileId]);

  useEffect(() => {
    if (!deferredWorldState.tribes.some((tribe) => tribe.id === selectedTribeId)) {
      setSelectedTribeId(deferredWorldState.tribes[0]?.id ?? null);
    }
  }, [deferredWorldState.tribes, selectedTribeId]);

  useEffect(() => {
    if (selectedTile) {
      const tribeOnTile = deferredWorldState.tribes.find((tribe) => tribe.tileId === selectedTile.id);
      if (tribeOnTile && !selectedTribe) {
        setSelectedTribeId(tribeOnTile.id);
      }
    }
  }, [deferredWorldState.tribes, selectedTile, selectedTribe]);

  function handleTileSelect(tileId: string) {
    setSelectedTileId(tileId);
    const tribeOnTile = deferredWorldState.tribes.find((tribe) => tribe.tileId === tileId);
    if (tribeOnTile) {
      setSelectedTribeId(tribeOnTile.id);
    }
    setRightRailOpen(true);
  }

  function handleReset() {
    controller.reset(draftConfig);
    setSelectedTileId(presentation.startTileId);
    setSelectedTribeId(presentation.startTribeId);
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
      id: buildCommandId(controller.worldState),
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
    controller.scheduleIntervention(command);
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

  return (
    <div className="app-shell">
      <header className="topbar panel-surface">
        <div className="title-block">
          <p className="eyebrow">Out of Eden Research Console</p>
          <h1>Anthropocene Simulator</h1>
          <p className="title-block__summary">Hybrid intervention sandbox for emergent early-human migration dynamics.</p>
        </div>

        <div className="topbar__controls">
          <button className="button button--primary" onClick={controller.toggleRunning}>
            {controller.running ? 'Pause' : 'Run'}
          </button>
          <button className="button" onClick={() => controller.step(1)}>Step 1y</button>
          <label className="compact-field">
            <span>Speed</span>
            <select value={controller.config.runtime.yearsPerSecond} onChange={(event) => handleSpeedChange(Number(event.target.value))}>
              {[1, 2, 4, 8, 16, 32].map((speed) => (
                <option key={speed} value={speed}>{speed} y/s</option>
              ))}
            </select>
          </label>
          <div className="year-readout">
            <span>Year</span>
            <strong>{deferredWorldState.year}</strong>
          </div>
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
            <select value={draftConfig.worldPreset} onChange={(event) => setDraftConfig((current) => ({ ...current, worldPreset: event.target.value as SimulationConfig['worldPreset'] }))}>
              <option value="old-world-corridor">Old World Corridor</option>
            </select>
          </label>
          <button className="button" onClick={handleReset}>Reset World</button>
          <button className="button" onClick={() => setInterventionOpen((value) => !value)}>Interventions</button>
          <button className="button button--ghost mobile-only" onClick={() => setLeftRailOpen((value) => !value)}>Controls</button>
          <button className="button button--ghost mobile-only" onClick={() => setRightRailOpen((value) => !value)}>Inspector</button>
        </div>
      </header>

      <aside className={`side-rail side-rail--left panel-surface ${leftRailOpen ? 'is-open' : ''}`}>
        <section className="panel-section">
          <div className="section-heading">
            <h2>Scenario</h2>
            <p>{presentation.description}</p>
          </div>
          <div className="metric-grid">
            <MetricChip label="Active Climate" value={`${deferredWorldState.globalClimate.meanTemperature.toFixed(1)}°C`} />
            <MetricChip label="Anomaly" value={`${formatSigned(activePulse)}°C`} />
            <MetricChip label="Pending Commands" value={`${deferredWorldState.pendingInterventions.length}`} />
            <MetricChip label="Last Step" value={controller.lastStep ? `${controller.lastStep.nextYear}` : 'Idle'} />
          </div>
          <p className="aside-note">Global parameter edits remain in draft until you hit <strong>Reset World</strong>.</p>
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <h2>Global Parameters</h2>
            <p>Slice 1 exposes the PDF baselines and reserves runtime mutation for later systems.</p>
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
            <p>Use comfort, habitability, water, and temperature layers to spot route tension.</p>
          </div>
          <div className="toggle-cluster">
            {(['comfort', 'habitability', 'water', 'temperature'] as LayerMode[]).map((mode) => (
              <button key={mode} className={`toggle-pill ${layerMode === mode ? 'is-active' : ''}`} onClick={() => setLayerMode(mode)}>
                {mode}
              </button>
            ))}
          </div>
          <div className="checkbox-list">
            <label><input type="checkbox" checked={showRoutes} onChange={(event) => setShowRoutes(event.target.checked)} /> Migration corridors</label>
            <label><input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} /> Region labels</label>
            <label><input type="checkbox" checked={showPressure} onChange={(event) => setShowPressure(event.target.checked)} /> Pressure hotspots</label>
          </div>
        </section>
      </aside>

      <main className="map-stage panel-surface">
        <div className="map-stage__header">
          <div>
            <p className="eyebrow">World Field</p>
            <h2>{presentation.name}</h2>
          </div>
          <div className="map-stage__stats">
            <MetricChip label="Population" value={`${deferredWorldState.metrics.totalPopulation}`} />
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
          worldState={deferredWorldState}
        />
        <div className="map-stage__footer">
          <div>
            <strong>{selectedTile?.name ?? 'No tile selected'}</strong>
            <span>{selectedTile ? `${selectedTile.region} • ${selectedTile.climate} • ${selectedTile.terrain}` : 'Click a hex to inspect it.'}</span>
          </div>
          <div>
            <strong>{hoveredTileId ? 'Hovering' : 'Selection'}</strong>
            <span>{hoveredTileId ?? selectedTileId ?? '—'}</span>
          </div>
        </div>
      </main>

      <aside className={`side-rail side-rail--right panel-surface ${rightRailOpen ? 'is-open' : ''}`}>
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
                <p>High-signal snapshot of the current scaffolded world state.</p>
              </div>
              <div className="metric-grid">
                <MetricChip label="Tribes" value={`${deferredWorldState.metrics.tribeCount}`} />
                <MetricChip label="Innovations" value={`${deferredWorldState.metrics.innovations}`} />
                <MetricChip label="Conflicts" value={`${deferredWorldState.metrics.conflicts}`} />
                <MetricChip label="Commands Applied" value={`${deferredWorldState.executedInterventions.length}`} />
              </div>
              <AbilityRows tribe={selectedTribe} />
            </>
          )}

          {inspectorTab === 'tile' && (
            <>
              <div className="section-heading">
                <h2>{selectedTile?.name ?? 'Tile'}</h2>
                <p>{selectedTile ? `${selectedTile.region} • ${selectedTile.climate}` : 'Choose a tile from the map.'}</p>
              </div>
              {selectedTile ? (
                <div className="detail-grid">
                  <MetricChip label="Comfort" value={selectedTile.comfort.toFixed(2)} />
                  <MetricChip label="Temp" value={`${selectedTile.temperature.toFixed(1)}°C`} />
                  <MetricChip label="Water" value={`${selectedTile.water}`} />
                  <MetricChip label="Hunt K" value={selectedTile.carryingCapacity.hunt.toFixed(0)} />
                  <MetricChip label="Agri K" value={selectedTile.carryingCapacity.agri.toFixed(0)} />
                  <MetricChip label="Neighbors" value={`${selectedTile.neighbors.length}`} />
                </div>
              ) : (
                <div className="empty-state">No tile selected.</div>
              )}
              <div className="subsection">
                <h3>Resident Tribes</h3>
                <div className="list-stack">
                  {tribesOnSelectedTile.length ? tribesOnSelectedTile.map((tribe) => (
                    <button key={tribe.id} className={`list-row ${selectedTribeId === tribe.id ? 'is-active' : ''}`} onClick={() => { setSelectedTribeId(tribe.id); setInspectorTab('tribe'); }}>
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
                <p>{selectedTribe ? `${selectedTribe.pop} people • ${selectedTribe.leader?.archetype ?? 'No leader'} leader archetype` : 'Choose a tribe from the tile panel.'}</p>
              </div>
              {selectedTribe ? (
                <div className="detail-grid">
                  <MetricChip label="Population" value={`${selectedTribe.pop}`} />
                  <MetricChip label="Tile" value={selectedTribe.tileId} />
                  <MetricChip label="Ancestry" value={selectedTribe.ancestryId} />
                  <MetricChip label="Leader" value={selectedTribe.leader?.name ?? 'Vacant'} />
                </div>
              ) : <div className="empty-state">No tribe selected.</div>}
              <AbilityRows tribe={selectedTribe} />
            </>
          )}

          {inspectorTab === 'pressures' && (
            <>
              <div className="section-heading">
                <h2>Pressures</h2>
                <p>Slice 1 pressure proxies already drive innovation and migration scaffolding.</p>
              </div>
              <PressureRows tribe={selectedTribe} />
            </>
          )}

          {inspectorTab === 'relations' && (
            <>
              <div className="section-heading">
                <h2>Relations</h2>
                <p>Relationship maps are seeded now and will matter more in later diplomacy slices.</p>
              </div>
              <div className="list-stack">
                {relations.length ? relations.map(([tribeId, value]) => (
                  <div className="list-row" key={tribeId}>
                    <span>{tribeId}</span>
                    <strong>{value.toFixed(2)}</strong>
                  </div>
                )) : <div className="empty-state">No relationship edges are available for the selected tribe.</div>}
              </div>
            </>
          )}

          {inspectorTab === 'events' && (
            <>
              <div className="section-heading">
                <h2>Event Feed</h2>
                <p>System, innovation, migration, and intervention entries are replayable from seed + command sequence.</p>
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
      </aside>

      <section className="timeline-strip panel-surface">
        <div className="timeline-strip__charts">
          <ChartCard label="Population" value={deferredWorldState.metrics.totalPopulation} color="#f0be6f" history={history.map((entry) => entry.totalPopulation)} />
          <ChartCard label="Tribe Count" value={deferredWorldState.metrics.tribeCount} color="#82c7c1" history={history.map((entry) => entry.tribeCount)} />
          <ChartCard label="Innovations" value={deferredWorldState.metrics.innovations} color="#d6de8a" history={history.map((entry) => entry.innovations)} />
          <ChartCard label="Conflict Alerts" value={deferredWorldState.metrics.conflicts} color="#d17a52" history={history.map((entry) => entry.conflicts)} />
        </div>
        <div className="timeline-strip__events">
          <div className="section-heading">
            <h2>Chronology</h2>
            <p>Newest simulation entries stay pinned here while the detailed feed remains in the inspector.</p>
          </div>
          <div className="list-stack list-stack--compact">
            {deferredWorldState.eventLog.slice(0, 8).map((event) => (
              <div className="list-row list-row--event" key={event.id}>
                <span>{event.title}</span>
                <strong>Y{event.year}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <aside className={`drawer panel-surface ${interventionOpen ? 'is-open' : ''}`}>
        <div className="section-heading">
          <h2>Intervention Drawer</h2>
          <p>Slice 1 only schedules replayable high-level commands. Later slices will attach richer effects.</p>
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
          <button className="button button--primary" onClick={scheduleIntervention}>Queue Command</button>
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
