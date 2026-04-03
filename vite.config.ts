import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import { handleApiHttpRequest } from './server/httpServer.js';
import { SimulationService } from './server/simulationService.js';

function simulationApiPlugin() {
  const service = new SimulationService();

  return {
    name: 'anthropocene-simulation-api',
    configureServer(server: { middlewares: { use: (handler: (request: Parameters<typeof handleApiHttpRequest>[0], response: Parameters<typeof handleApiHttpRequest>[1], next: () => void) => void) => void } }) {
      server.middlewares.use((request, response, next) => {
        void handleApiHttpRequest(request, response, service).then((handled) => {
          if (!handled) {
            next();
          }
        });
      });
    },
    configurePreviewServer(server: { middlewares: { use: (handler: (request: Parameters<typeof handleApiHttpRequest>[0], response: Parameters<typeof handleApiHttpRequest>[1], next: () => void) => void) => void } }) {
      server.middlewares.use((request, response, next) => {
        void handleApiHttpRequest(request, response, service).then((handled) => {
          if (!handled) {
            next();
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), simulationApiPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
});
