/** @vitest-environment node */
import { afterEach, describe, expect, it } from 'vitest';

import { startHttpServer, type StartedHttpServer } from './httpServer.js';

describe('http server', () => {
  let started: StartedHttpServer | null = null;

  afterEach(async () => {
    if (started) {
      await started.close();
      started = null;
    }
  });

  it('serves the simulation api end-to-end', async () => {
    started = await startHttpServer({ host: '127.0.0.1', port: 0 });
    const baseUrl = `http://127.0.0.1:${started.port}`;

    const createResponse = await fetch(`${baseUrl}/api/simulations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: {
          seed: 77,
          globals: {
            G_temp: 18,
          },
        },
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as {
      session: { id: string; state: { year: number } };
    };
    expect(created.session.state.year).toBe(0);

    const stepResponse = await fetch(`${baseUrl}/api/simulations/${created.session.id}/step`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ years: 4 }),
    });
    expect(stepResponse.status).toBe(200);
    const stepped = (await stepResponse.json()) as {
      result: { requestedYears: number; nextYear: number };
      session: { state: { year: number } };
    };
    expect(stepped.result.requestedYears).toBe(4);
    expect(stepped.result.nextYear).toBe(4);
    expect(stepped.session.state.year).toBe(4);

    const getResponse = await fetch(`${baseUrl}/api/simulations/${created.session.id}`);
    expect(getResponse.status).toBe(200);
    const snapshot = (await getResponse.json()) as {
      session: { id: string; state: { year: number } };
    };
    expect(snapshot.session.id).toBe(created.session.id);
    expect(snapshot.session.state.year).toBe(4);

    const healthResponse = await fetch(`${baseUrl}/api/health`);
    expect(healthResponse.status).toBe(200);
    const health = (await healthResponse.json()) as {
      status: string;
      sessions: { active: number };
    };
    expect(health.status).toBe('ok');
    expect(health.sessions.active).toBe(1);
  });
});
