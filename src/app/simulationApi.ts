import type { InterventionCommand, SimulationConfig, SimulationStepResult, WorldState } from '../sim/types';

export interface SessionSnapshot {
  id: string;
  createdAt: string;
  lastAccessAt: string;
  advancedYears: number;
  config: SimulationConfig;
  state: WorldState;
  limits: {
    maxYearsPerRequest: number;
    maxYearsPerSession: number;
    maxPendingInterventions: number;
  };
}

export interface SessionStepResponse {
  session: SessionSnapshot;
  result: Omit<SimulationStepResult, 'state'> & {
    requestedYears: number;
  };
}

interface ApiEnvelope<T> {
  session?: SessionSnapshot;
  result?: SessionStepResponse['result'];
  command?: unknown;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  return '';
}

const API_BASE_URL = resolveApiBaseUrl();

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as ApiEnvelope<T>) : undefined;
  if (!response.ok) {
    const message = payload?.error?.message ?? `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  return payload as T;
}

export async function createSimulationSession(config: SimulationConfig) {
  return requestJson<{ session: SessionSnapshot }>('/api/simulations', {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
}

export async function getSimulationSession(sessionId: string) {
  return requestJson<{ session: SessionSnapshot }>(`/api/simulations/${sessionId}`);
}

export async function stepSimulationSession(sessionId: string, years: number) {
  return requestJson<SessionStepResponse>(`/api/simulations/${sessionId}/step`, {
    method: 'POST',
    body: JSON.stringify({ years }),
  });
}

export async function resetSimulationSession(sessionId: string, config: SimulationConfig) {
  return requestJson<{ session: SessionSnapshot }>(`/api/simulations/${sessionId}/reset`, {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
}

export async function queueSimulationIntervention(
  sessionId: string,
  command: InterventionCommand,
) {
  return requestJson<{ session: SessionSnapshot; command: unknown }>(
    `/api/simulations/${sessionId}/interventions`,
    {
      method: 'POST',
      body: JSON.stringify({ command }),
    },
  );
}

export async function deleteSimulationSession(sessionId: string) {
  const response = await fetch(`${API_BASE_URL}/api/simulations/${sessionId}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    let message = `${response.status} ${response.statusText}`;
    if (text) {
      try {
        const payload = JSON.parse(text) as ApiEnvelope<never>;
        message = payload.error?.message ?? message;
      } catch {
        message = text;
      }
    }
    throw new Error(message);
  }
}
