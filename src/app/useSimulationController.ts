import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react';

import { DEFAULT_SIMULATION_CONFIG, cloneSimulationConfig } from '../sim/config';
import { createSimulationEngine } from '../sim/engine';
import type { InterventionCommand, SimulationConfig, SimulationStepResult, WorldState } from '../sim/types';

export function useSimulationController(initialConfig: SimulationConfig = DEFAULT_SIMULATION_CONFIG) {
  const engineRef = useRef(createSimulationEngine(initialConfig));
  const frameRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const previousFrameRef = useRef<number | null>(null);
  const [config, setConfig] = useState(() => cloneSimulationConfig(initialConfig));
  const [worldState, setWorldState] = useState<WorldState>(() => engineRef.current.getState());
  const [lastStep, setLastStep] = useState<SimulationStepResult | null>(null);
  const [running, setRunning] = useState(false);

  const syncFromEngine = useEffectEvent((result?: SimulationStepResult) => {
    const nextState = engineRef.current.getState();
    startTransition(() => {
      setWorldState(nextState);
      if (result) {
        setLastStep(result);
      }
    });
  });

  const advanceFrame = useEffectEvent((deltaMs: number) => {
    const yearsPerSecond = Math.max(config.runtime.yearsPerSecond, 1);
    const millisecondsPerYear = 1000 / yearsPerSecond;
    elapsedRef.current += deltaMs;
    const yearsToAdvance = Math.min(64, Math.floor(elapsedRef.current / millisecondsPerYear));

    if (yearsToAdvance <= 0) {
      return;
    }

    elapsedRef.current -= yearsToAdvance * millisecondsPerYear;
    const result = engineRef.current.step(yearsToAdvance);
    syncFromEngine(result);
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

      const delta = timestamp - previousFrameRef.current;
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
    const result = engineRef.current.step(years);
    syncFromEngine(result);
    return result;
  }

  function reset(nextConfig = config) {
    const cloned = cloneSimulationConfig(nextConfig);
    engineRef.current = createSimulationEngine(cloned);
    setConfig(cloned);
    setRunning(false);
    setLastStep(null);
    startTransition(() => {
      setWorldState(engineRef.current.getState());
    });
  }

  function toggleRunning() {
    setRunning((value) => !value);
  }

  function updateRuntimeSpeed(yearsPerSecond: number) {
    const nextConfig = {
      ...config,
      runtime: {
        ...config.runtime,
        yearsPerSecond,
      },
    };
    engineRef.current.setRuntimeSpeed(yearsPerSecond);
    setConfig(nextConfig);
  }

  function scheduleIntervention(command: InterventionCommand) {
    engineRef.current.enqueueIntervention(command);
    syncFromEngine();
  }

  return {
    config,
    worldState,
    running,
    lastStep,
    setRunning,
    toggleRunning,
    step,
    reset,
    updateRuntimeSpeed,
    scheduleIntervention,
  };
}
