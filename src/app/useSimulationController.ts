import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react';

import { DEFAULT_SIMULATION_CONFIG, cloneSimulationConfig } from '../sim/config';
import { createSimulationEngine, type SimulationEngine } from '../sim/engine';
import type {
  InterventionCommand,
  SimulationConfig,
  SimulationStepResult,
  WorldState,
} from '../sim/types';

function createEngineAndState(cfg: SimulationConfig) {
  const engine = createSimulationEngine(cfg);
  return { engine, state: engine.getState() };
}

export function useSimulationController(
  initialConfig: SimulationConfig = DEFAULT_SIMULATION_CONFIG,
) {
  const frameRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const previousFrameRef = useRef<number | null>(null);
  const runtimeRef = useRef<SimulationConfig['runtime']>({
    ...cloneSimulationConfig(initialConfig).runtime,
  });
  // Eagerly create engine so worldState is never null
  const initialRef = useRef(() => {
    const cfg = cloneSimulationConfig(initialConfig);
    return createEngineAndState(cfg);
  });
  const { engine: initialEngine, state: initialState } = useRef(initialRef.current()).current;
  const engineRef = useRef<SimulationEngine>(initialEngine);
  const disposedRef = useRef(false);

  const [config, setConfig] = useState(() => cloneSimulationConfig(initialConfig));
  const [worldState, setWorldState] = useState<WorldState>(initialState);
  const [lastStep, setLastStep] = useState<SimulationStepResult | null>(null);
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connectionState] = useState<'live'>('live');
  const [error, setError] = useState<string | null>(null);

  function ensureEngine(cfg: SimulationConfig): SimulationEngine {
    return engineRef.current;
  }

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
      previousFrameRef.current = null;
      elapsedRef.current = 0;
    };
  }, []);

  const advanceFrame = useEffectEvent((deltaMs: number) => {
    const engine = engineRef.current;
    if (!engine) return;

    const yearsPerSecond = Math.max(runtimeRef.current.yearsPerSecond, 1);
    const millisecondsPerYear = 1000 / yearsPerSecond;
    elapsedRef.current += deltaMs;
    const yearsToAdvance = Math.min(64, Math.floor(elapsedRef.current / millisecondsPerYear));

    if (yearsToAdvance <= 0) return;

    elapsedRef.current -= yearsToAdvance * millisecondsPerYear;
    const result = engine.step(yearsToAdvance);
    if (!disposedRef.current) {
      startTransition(() => {
        setWorldState(result.state);
        setLastStep(result);
      });
    }
  });

  useEffect(() => {
    if (!running) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
      previousFrameRef.current = null;
      elapsedRef.current = 0;
      return;
    }

    const tick = (timestamp: number) => {
      if (previousFrameRef.current === null) {
        previousFrameRef.current = timestamp;
      }

      const delta = Math.min(timestamp - previousFrameRef.current, 200);
      previousFrameRef.current = timestamp;
      advanceFrame(delta);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
      previousFrameRef.current = null;
      elapsedRef.current = 0;
    };
  }, [running]);

  function step(years = 1) {
    const engine = ensureEngine(config);
    try {
      const result = engine.step(years);
      startTransition(() => {
        setWorldState(result.state);
        setLastStep(result);
        setError(null);
      });
      return Promise.resolve(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Step failed.';
      setError(message);
      return Promise.resolve(undefined);
    }
  }

  function reset(nextConfig = config) {
    const cloned = cloneSimulationConfig(nextConfig);
    runtimeRef.current = { ...cloned.runtime };
    setRunning(false);
    const engine = createSimulationEngine(cloned);
    engineRef.current = engine;
    startTransition(() => {
      setConfig(cloned);
      setWorldState(engine.getState());
      setLastStep(null);
      setError(null);
    });
    return Promise.resolve(engine.getState());
  }

  function toggleRunning() {
    if (!engineRef.current) return;
    setRunning((value) => !value);
  }

  function updateRuntimeSpeed(yearsPerSecond: number) {
    runtimeRef.current = {
      ...runtimeRef.current,
      yearsPerSecond,
    };
    setConfig((current) => ({
      ...current,
      runtime: {
        ...current.runtime,
        yearsPerSecond,
      },
    }));
  }

  function scheduleIntervention(command: InterventionCommand) {
    const engine = engineRef.current;
    if (!engine) return Promise.resolve();
    const nextState = engine.enqueueIntervention(command);
    startTransition(() => {
      setWorldState(nextState);
    });
    return Promise.resolve();
  }

  return {
    config,
    worldState,
    running,
    ready,
    syncing,
    connectionState,
    error,
    lastStep,
    setRunning,
    toggleRunning,
    step,
    reset,
    updateRuntimeSpeed,
    scheduleIntervention,
  };
}
