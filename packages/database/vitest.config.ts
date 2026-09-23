import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // PGlite (Postgres real via WASM) pode demorar para subir sob carga —
    // especialmente quando `turbo run` executa vários builds/tests em
    // paralelo (ex.: build do Next.js concorrente). Margens generosas
    // evitam falsos negativos por contenção de CPU, não por bug real.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
