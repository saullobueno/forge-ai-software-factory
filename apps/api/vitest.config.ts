import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Sob a carga do `turbo run` (build/lint/testes de todos os pacotes em
    // paralelo) o Nest levava >10s (default) para compilar o módulo de teste.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
