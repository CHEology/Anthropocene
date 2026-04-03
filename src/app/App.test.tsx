import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SIMULATION_CONFIG, cloneSimulationConfig } from '../sim/config';
import { createInitialWorldState } from '../world/oldWorld';
import { App } from './App';

function buildSessionPayload() {
  const config = cloneSimulationConfig(DEFAULT_SIMULATION_CONFIG);
  return {
    session: {
      id: 'session-1',
      createdAt: '2026-04-02T00:00:00.000Z',
      lastAccessAt: '2026-04-02T00:00:00.000Z',
      advancedYears: 0,
      config,
      state: createInitialWorldState(config),
      limits: {
        maxYearsPerRequest: 256,
        maxYearsPerSession: 70000,
        maxPendingInterventions: 64,
      },
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';

  const sessionPayload = buildSessionPayload();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = init?.method ?? 'GET';

      if (url.endsWith('/api/simulations') && method === 'POST') {
        return Response.json(sessionPayload, { status: 201 });
      }

      if (url.includes('/api/simulations/session-1') && method === 'DELETE') {
        return new Response(null, { status: 204 });
      }

      if (url.includes('/api/simulations/session-1') && method === 'GET') {
        return Response.json(sessionPayload, { status: 200 });
      }

      if (url.includes('/api/simulations/session-1/step') && method === 'POST') {
        return Response.json(
          {
            session: sessionPayload.session,
            result: {
              previousYear: 0,
              nextYear: 1,
              emittedEvents: [],
              changedTileIds: [],
              changedTribeIds: [],
              metricsDelta: {},
              phases: [
                'global-events',
                'tile-update',
                'tribe-update',
                'interaction',
                'migration',
                'fission',
                'extinction',
              ],
              requestedYears: 1,
            },
          },
          { status: 200 },
        );
      }

      if (url.includes('/api/simulations/session-1/interventions') && method === 'POST') {
        return Response.json({ session: sessionPayload.session, command: {} }, { status: 200 });
      }

      if (url.includes('/api/simulations/session-1/reset') && method === 'POST') {
        return Response.json(sessionPayload, { status: 200 });
      }

      throw new Error(`Unhandled fetch: ${method} ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('app shell', () => {
  it('renders the simulator layout', () => {
    const { container } = render(<App />);

    expect(screen.getByRole('heading', { name: 'Anthropocene Simulator' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Old World Corridor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Interventions' })).toBeInTheDocument();

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.style.width).toBe('');
    expect(canvas?.style.height).toBe('');
  });

  it('toggles between dark and light theme modes', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Theme: Dark' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('anthropocene-theme')).toBe('light');
  });
});
