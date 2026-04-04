import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react';

import { DEFAULT_SIMULATION_CONFIG, cloneSimulationConfig } from '../sim/config';
import type {
  InterventionCommand,
  SimulationConfig,
  SimulationStepResult,
  WorldState,
} from '../sim/types';
import { createInitialWorldState } from '../world/oldWorld';
import {
  createSimulationSession,
  deleteSimulationSession,
  queueSimulationIntervention,
  resetSimulationSession,
  stepSimulationSession,
  type SessionSnapshot,
} from './simulationApi';

type ConnectionState = 'connecting' | 'live' | 'error';

function mergeRuntimeConfig(
  config: SimulationConfig,
  runtime: SimulationConfig['runtime'],
): SimulationConfig {
  const nextConfig = cloneSimulationConfig(config);
  nextConfig.runtime = { ...runtime };
  return nextConfig;
}

function toStepResult(
  session: SessionSnapshot,
  result: Omit<SimulationStepResult, 'state'>,
): SimulationStepResult {
  return {
    ...result,
    state: session.state,
  };
}

export function useSimulationController(
  initialConfig: SimulationConfig = DEFAULT_SIMULATION_CONFIG,
) {
  const frameRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const previousFrameRef = useRef<number | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const sessionIdRef = useRef<string | null>(null);
  const runtimeRef = useRef<SimulationConfig['runtime']>({
    ...cloneSimulationConfig(initialConfig).runtime,
  });
  const busyRef = useRef(false);
  const connectionStateRef = useRef<ConnectionState>('connecting');
  const disposedRef = useRef(false);

  const [config, setConfig] = useState(() => cloneSimulationConfig(initialConfig));
  const [worldState, setWorldState] = useState<WorldState>(() =>
    createInitialWorldState(initialConfig),
  );
  const [lastStep, setLastStep] = useState<SimulationStepResult | null>(null);
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [error, setError] = useState<string | null>(null);

  const setBusyState = useEffectEvent((value: boolean) => {
    busyRef.current = value;
    startTransition(() => {
      setSyncing(value);
    });
  });

  const setConnectionStateValue = useEffectEvent((value: ConnectionState) => {
    connectionStateRef.current = value;
    startTransition(() => {
      setConnectionState(value);
    });
  });

  const syncFromSession = useEffectEvent(
    (
      session: SessionSnapshot,
      result?: Omit<SimulationStepResult, 'state'>,
      syncConfig = false,
    ) => {
      sessionIdRef.current = session.id;
      const nextConfig = mergeRuntimeConfig(session.config, runtimeRef.current);
      startTransition(() => {
        if (syncConfig) {
          setConfig(nextConfig);
        }
        setWorldState(session.state);
        setReady(true);
        setError(null);
        setConnectionState('live');
        if (result) {
          setLastStep(toStepResult(session, result));
        }
      });
      connectionStateRef.current = 'live';
    },
  );

  const failRequest = useEffectEvent((requestError: unknown) => {
    const message = requestError instanceof Error ? requestError.message : 'Backend request failed.';
    startTransition(() => {
      setRunning(false);
      setError(message);
      setConnectionState('error');
    });
    connectionStateRef.current = 'error';
  });

  function enqueueRequest<T>(task: () => Promise<T>) {
    const scheduled = queueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (disposedRef.current) {
          return undefined;
        }

        setBusyState(true);
        try {
          return await task();
        } finally {
          if (!disposedRef.current) {
            setBusyState(false);
          }
        }
      });

    queueRef.current = scheduled.catch(() => undefined);
    return scheduled.catch((requestError) => {
      if (!disposedRef.current) {
        failRequest(requestError);
      }
      return undefined;
    });
  }

  const bootstrapSession = useEffectEvent((nextConfig: SimulationConfig) => {
    runtimeRef.current = { ...nextConfig.runtime };
    setConnectionStateValue('connecting');
    startTransition(() => {
      setError(null);
      setLastStep(null);
    });

    return enqueueRequest(async () => {
      const response = await createSimulationSession(nextConfig);
      if (!disposedRef.current) {
        syncFromSession(response.session, undefined, true);
      }
      return response.session;
    });
  });

  const advanceFrame = useEffectEvent((deltaMs: number) => {
    if (
      !sessionIdRef.current ||
      busyRef.current ||
      connectionStateRef.current !== 'live'
    ) {
      return;
    }

    const yearsPerSecond = Math.max(runtimeRef.current.yearsPerSecond, 1);
    const millisecondsPerYear = 1000 / yearsPerSecond;
    elapsedRef.current += deltaMs;
    const yearsToAdvance = Math.min(64, Math.floor(elapsedRef.current / millisecondsPerYear));

    if (yearsToAdvance <= 0) {
      return;
    }

    elapsedRef.current -= yearsToAdvance * millisecondsPerYear;
    busyRef.current = true;
    void step(yearsToAdvance);
  });

  useEffect(() => {
    disposedRef.current = false;
    void bootstrapSession(cloneSimulationConfig(initialConfig));

    return () => {
      disposedRef.current = true;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
      previousFrameRef.current = null;
      elapsedRef.current = 0;
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      if (sessionId) {
        void deleteSimulationSession(sessionId).catch(() => undefined);
      }
    };
  }, []);

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
    return enqueueRequest(async () => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        throw new Error('No backend simulation session is available. Reset to reconnect.');
      }

      const response = await stepSimulationSession(sessionId, years);
      if (!disposedRef.current) {
        syncFromSession(response.session, response.result);
      }
      return toStepResult(response.session, response.result);
    });
  }

  function reset(nextConfig = config) {
    const cloned = cloneSimulationConfig(nextConfig);
    runtimeRef.current = { ...cloned.runtime };
    setRunning(false);
    setConnectionStateValue('connecting');
    startTransition(() => {
      setError(null);
      setLastStep(null);
    });

    return enqueueRequest(async () => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        const response = await createSimulationSession(cloned);
        if (!disposedRef.current) {
          syncFromSession(response.session, undefined, true);
        }
        return response.session.state;
      }

      const response = await resetSimulationSession(sessionId, cloned);
      if (!disposedRef.current) {
        syncFromSession(response.session, undefined, true);
      }
      return response.session.state;
    });
  }

  function toggleRunning() {
    if (connectionStateRef.current !== 'live' || !sessionIdRef.current) {
      return;
    }

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
    return enqueueRequest(async () => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        throw new Error('No backend simulation session is available. Reset to reconnect.');
      }

      const response = await queueSimulationIntervention(sessionId, command);
      if (!disposedRef.current) {
        syncFromSession(response.session);
      }
    });
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
