import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ApiError } from './core/errors.js';
import { SERVER_LIMITS } from './core/limits.js';
import { SimulationService } from './simulationService.js';

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

export interface StartedHttpServer {
  close: () => Promise<void>;
  port: number;
  server: Server;
  service: SimulationService;
}

export interface StartHttpServerOptions {
  host?: string;
  port?: number;
  service?: SimulationService;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function setCorsHeaders(response: ServerResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Vary', 'Origin');
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  const body = JSON.stringify(payload);
  response.statusCode = statusCode;
  setCorsHeaders(response);
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(body);
}

function sendBytes(
  response: ServerResponse,
  statusCode: number,
  contentType: string,
  body: Buffer,
) {
  response.statusCode = statusCode;
  setCorsHeaders(response);
  response.setHeader('Content-Type', contentType);
  response.end(body);
}

function toApiError(error: unknown) {
  if (error instanceof ApiError) {
    return error;
  }

  return new ApiError(500, 'internal_error', 'Unexpected server error.');
}

async function readJsonBody(request: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > SERVER_LIMITS.maxRequestBytes) {
      throw new ApiError(413, 'payload_too_large', 'Request body exceeds the allowed size.');
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.');
  }
}

function selectPayload(body: unknown, key: string) {
  if (isRecord(body) && key in body) {
    return body[key];
  }

  return body;
}

function resolveDistDirectory() {
  const candidates = [
    resolve(fileURLToPath(new URL('../dist', import.meta.url))),
    resolve(fileURLToPath(new URL('../../dist', import.meta.url))),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function tryReadFile(path: string) {
  try {
    return await readFile(path);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT' || nodeError.code === 'ENOTDIR') {
      return null;
    }
    throw error;
  }
}

async function serveStatic(pathname: string, response: ServerResponse) {
  const distDirectory = resolveDistDirectory();
  if (!distDirectory) {
    return false;
  }

  const decodedPath = decodeURIComponent(pathname || '/');
  const wantsHtml = decodedPath === '/' || !decodedPath.includes('.');
  const requestedPath = wantsHtml ? '/index.html' : decodedPath;
  const relativePath = normalize(requestedPath).replace(/^[\/]+/, '');
  const absolutePath = resolve(distDirectory, relativePath);
  if (!absolutePath.startsWith(distDirectory)) {
    throw new ApiError(403, 'invalid_path', 'Requested path is outside the deployment root.');
  }

  const file = await tryReadFile(absolutePath);
  if (file) {
    sendBytes(
      response,
      200,
      MIME_TYPES[extname(absolutePath)] ?? 'application/octet-stream',
      file,
    );
    return true;
  }

  if (!wantsHtml) {
    return false;
  }

  const fallbackPath = resolve(distDirectory, 'index.html');
  const indexFile = await tryReadFile(fallbackPath);
  if (!indexFile) {
    return false;
  }

  sendBytes(response, 200, MIME_TYPES['.html'], indexFile);
  return true;
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: SimulationService,
  pathname: string,
) {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'api') {
    return false;
  }

  if (request.method === 'GET' && pathname === '/api/health') {
    sendJson(response, 200, service.getHealth());
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/simulations') {
    const body = await readJsonBody(request);
    const config = selectPayload(body, 'config');
    sendJson(response, 201, { session: service.createSession(config as never) });
    return true;
  }

  if (segments[1] !== 'simulations' || !segments[2]) {
    throw new ApiError(404, 'not_found', 'API route not found.');
  }

  const sessionId = segments[2];

  if (request.method === 'GET' && segments.length === 3) {
    sendJson(response, 200, { session: service.getSessionSnapshot(sessionId) });
    return true;
  }

  if (request.method === 'DELETE' && segments.length === 3) {
    service.deleteSession(sessionId);
    response.statusCode = 204;
    setCorsHeaders(response);
    response.end();
    return true;
  }

  if (request.method === 'POST' && segments.length === 4 && segments[3] === 'step') {
    const body = await readJsonBody(request);
    sendJson(response, 200, service.stepSession(sessionId, isRecord(body) ? body.years : undefined));
    return true;
  }

  if (request.method === 'POST' && segments.length === 4 && segments[3] === 'interventions') {
    const body = await readJsonBody(request);
    const payload = selectPayload(body, 'command');
    sendJson(response, 200, service.enqueueIntervention(sessionId, payload));
    return true;
  }

  if (request.method === 'POST' && segments.length === 4 && segments[3] === 'reset') {
    const body = await readJsonBody(request);
    const config = selectPayload(body, 'config');
    sendJson(response, 200, { session: service.resetSession(sessionId, config as never) });
    return true;
  }

  throw new ApiError(404, 'not_found', 'API route not found.');
}

export async function handleApiHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: SimulationService,
) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (!url.pathname.startsWith('/api')) {
    return false;
  }

  try {
    if (request.method === 'OPTIONS') {
      response.statusCode = 204;
      setCorsHeaders(response);
      response.end();
      return true;
    }

    const handledApi = await handleApiRequest(request, response, service, url.pathname);
    return handledApi;
  } catch (error) {
    const apiError = toApiError(error);
    sendJson(response, apiError.statusCode, {
      error: {
        code: apiError.code,
        message: apiError.message,
        details: apiError.details,
      },
    });
    return true;
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: SimulationService,
) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');

  if (await handleApiHttpRequest(request, response, service)) {
    return;
  }

  try {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const served = await serveStatic(url.pathname, response);
      if (served) {
        return;
      }
    }

    throw new ApiError(404, 'not_found', 'Route not found.');
  } catch (error) {
    const apiError = toApiError(error);
    sendJson(response, apiError.statusCode, {
      error: {
        code: apiError.code,
        message: apiError.message,
        details: apiError.details,
      },
    });
  }
}

export function createHttpServer(service = new SimulationService()) {
  const server = createServer((request, response) => {
    void handleRequest(request, response, service);
  });

  return {
    server,
    service,
  };
}

export async function startHttpServer(
  options: StartHttpServerOptions = {},
): Promise<StartedHttpServer> {
  const host = options.host ?? '0.0.0.0';
  const port = options.port ?? SERVER_LIMITS.defaultPort;
  const service = options.service ?? new SimulationService();
  const { server } = createHttpServer(service);

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(port, host, () => {
      server.off('error', rejectPromise);
      resolvePromise();
    });
  });

  const address = server.address() as AddressInfo | null;
  return {
    server,
    service,
    port: address?.port ?? port,
    close: () =>
      new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error) {
            rejectPromise(error);
            return;
          }
          resolvePromise();
        });
      }),
  };
}
