import { SERVER_LIMITS } from './core/limits.js';
import { startHttpServer } from './httpServer.js';

function parsePort(value: string | undefined) {
  if (!value) {
    return SERVER_LIMITS.defaultPort;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : SERVER_LIMITS.defaultPort;
}

const host = process.env.HOST ?? '0.0.0.0';
const port = parsePort(process.env.PORT);
const started = await startHttpServer({ host, port });

console.log(`Anthropocene backend listening on http://${host}:${started.port}`);

async function shutdown(signal: string) {
  console.log(`Shutting down backend after ${signal}...`);
  await started.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
