import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // PGlite (Postgres real compilado para WASM) é lento para inicializar e
    // encerrar — os defaults do Vitest (5s teste / 10s hook) estouram em
    // specs que sobem um Nest app real ligado ao banco. Mesma ordem de
    // grandeza usada pelos testes de integração de @forge/database.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // PGlite (WASM) não tolera múltiplas instâncias inicializando ao mesmo
    // tempo no mesmo processo — mesmo com diretórios de dados distintos por
    // arquivo de teste, rodar specs e2e em paralelo produz erros
    // intermitentes de inicialização. Cada arquivo já isola seu próprio
    // banco/app; rodar os arquivos em série é seguro e barato o bastante
    // para o volume de specs desta fase.
    fileParallelism: false,
  },
});
