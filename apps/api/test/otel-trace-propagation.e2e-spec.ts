import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Fase 14 continuação #3 — prova real (dois processos Node reais, fora do
 * Vitest, mesmo espírito de `otel-tracing.e2e-spec.ts`/
 * `runtime-smoke.e2e-spec.ts` vizinhos) de que a lacuna registrada em
 * `PROGRESS.md` ("propagação de trace context entre `apps/web` e
 * `apps/api` — cada requisição do proxy Next.js hoje inicia um trace
 * novo, sem `traceparent` herdado") está fechada: uma requisição real
 * feita ao proxy same-origin de `apps/web` (`/api/*`, Route Handler em
 * `src/app/api/[...path]/route.ts`) chega em `apps/api` com o MESMO
 * `traceId` que o span real criado no lado do Next.js
 * (`apps/web/src/tracing.ts` + `src/proxy.ts`) — não dois traces
 * desconectados.
 *
 * **Por que este teste mora em `apps/api`, não em `apps/web`**:
 * `apps/api` já tem toda a infraestrutura de subir um processo Node real
 * fora do Vitest e inspecionar `stdout` capturado (ver os dois specs
 * vizinhos); `apps/web` não tem Vitest nenhum, só Playwright (que roda um
 * BROWSER real contra servidores já up — não dá pra usar isso aqui, o que
 * este teste precisa é comparar o `stdout` bruto de DOIS processos
 * simultâneos, não interações de UI). Reaproveitar a infra já existente
 * aqui é mais simples e honesto do que introduzir um segundo test runner
 * em `apps/web` só para este caso.
 *
 * **Por que `next dev`, não `next build && next start`**: o Route Handler
 * lê `API_INTERNAL_URL` de `process.env` quando o módulo carrega, não em
 * build time — `next dev` reavalia isso ao subir sem exigir um `next
 * build` completo antes (mais rápido para um teste isolado como este); o
 * `proxy.ts`/Route Handler que este teste precisa exercitar funciona
 * identicamente em dev e produção (nenhum comportamento exclusivo de
 * produção está em jogo aqui).
 *
 * **Isolamento de `.next`**: como este teste sobe seu próprio `next dev`
 * na mesma pasta `apps/web` que qualquer `pnpm dev`/Playwright já possa
 * estar usando nesta máquina, usa `NEXT_WEB_DIST_DIR` (`next.config.ts`)
 * para gravar cache num diretório próprio (`.next-otel-trace-test`,
 * removido no `finally`) em vez de disputar `.next` com outro processo —
 * mesma classe de contenção já documentada extensivamente em
 * `PROGRESS.md` para PGlite, resolvida aqui na origem em vez de só
 * documentada como flake aceitável.
 *
 * **Efeito colateral real encontrado e neutralizado**: `next dev`
 * reescreve `apps/web/tsconfig.json` sozinho (adiciona entradas de
 * `include` apontando para os tipos gerados do `distDir` em uso, e
 * reformata o arquivo inteiro) — mesmo com `distDir` isolado, porque
 * `tsconfig.json` em si vive na raiz do projeto, não dentro do
 * `distDir`. Sem neutralizar isso, rodar este teste sujaria
 * `apps/web/tsconfig.json` de verdade no working tree. Este spec
 * salva o conteúdo original antes de subir o `next dev` e restaura
 * byte a byte no `finally`, mesmo raciocínio de "nunca tocar o fixture
 * original" já aplicado em outros pontos do projeto (Fase 18).
 */

const apiRoot = resolve(fileURLToPath(import.meta.url), '../..');
const webRoot = resolve(apiRoot, '../web');
const nestCliEntry = resolve(apiRoot, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');
// Invocado via `node <caminho>`, nunca o shim `.bin/next` (`.cmd` no
// Windows) — mesmo motivo já documentado nos specs vizinhos: evita
// depender do `cmd.exe`/`shell: true` para resolver um `.cmd` a partir de
// um caminho com espaços.
const nextBinEntry = resolve(webRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const WEB_DIST_DIR = '.next-otel-trace-test';
const webTsconfigPath = join(webRoot, 'tsconfig.json');

async function getFreePort(): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('não foi possível obter uma porta livre'));
        return;
      }
      const { port } = address;
      server.close(() => resolvePort(port));
    });
  });
}

/** Ver o comentário equivalente em `runtime-smoke.e2e-spec.ts` — mesma
 * necessidade de matar a árvore de processos no Windows (`next dev`
 * também sobe um processo `node` filho separado do processo do CLI). */
function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F']);
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // processo já pode ter encerrado sozinho.
    }
  }
}

function collectOutput(child: ChildProcessWithoutNullStreams): { get: () => string } {
  const chunks: string[] = [];
  child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
  return { get: () => chunks.join('') };
}

async function waitForHttpOk(url: string, timeoutMs: number, output: { get: () => string }): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status === 200) return;
      lastError = new Error(`status ${String(response.status)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `servidor não respondeu 200 em ${url} dentro de ${timeoutMs}ms (último erro: ${String(lastError)})\n--- saída do processo ---\n${output.get()}`,
  );
}

/** Extrai, em ordem de aparição, todo `traceId` de 32 hex chars impresso
 * pelo `ConsoleSpanExporter` (formato real do SDK do OTel, mesmo padrão
 * já usado em `otel-tracing.e2e-spec.ts`) — nunca uma estrutura montada à
 * mão por este teste. */
function extractTraceIds(stdout: string): string[] {
  return [...stdout.matchAll(/traceId: '([0-9a-f]{32})'/g)].map((match) => match[1] as string);
}

describe('Propagação de trace context W3C: apps/web (proxy) -> apps/api (Fase 14 continuação #3)', () => {
  beforeAll(() => {
    const build = spawnSync(process.execPath, [nestCliEntry, 'build'], {
      cwd: apiRoot,
      encoding: 'utf-8',
    });
    if (build.status !== 0) {
      throw new Error(`\`nest build\` falhou (status ${String(build.status)}):\n${build.stdout}\n${build.stderr}`);
    }
  }, 120_000);

  it(
    'uma requisição real via `/api/*` chega em apps/api com o MESMO traceId do span real criado no proxy de apps/web',
    async () => {
      const apiPort = await getFreePort();
      const webPort = await getFreePort();
      const dataDir = mkdtempSync(join(tmpdir(), 'forge-trace-propagation-'));

      const apiChild = spawn(process.execPath, ['dist/main.js'], {
        cwd: apiRoot,
        env: {
          ...process.env,
          API_PORT: String(apiPort),
          DATABASE_LOCAL_PATH: join(dataDir, 'forge-trace-propagation.pglite'),
        },
      }) as ChildProcessWithoutNullStreams;
      const apiOutput = collectOutput(apiChild);

      // `next dev` reescreve `apps/web/tsconfig.json` sozinho (ver
      // comentário do topo do arquivo) — snapshot para restaurar depois,
      // independente de sucesso/falha do teste.
      const originalWebTsconfig = readFileSync(webTsconfigPath, 'utf-8');

      try {
        await waitForHttpOk(`http://127.0.0.1:${apiPort}/`, 90_000, apiOutput);

        const webChild = spawn(process.execPath, [nextBinEntry, 'dev', '-p', String(webPort)], {
          cwd: webRoot,
          env: {
            ...process.env,
            API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
            NEXT_WEB_DIST_DIR: WEB_DIST_DIR,
          },
        }) as ChildProcessWithoutNullStreams;
        const webOutput = collectOutput(webChild);

        try {
          // `/login` (não `/`, que redireciona) responde 200 sem sessão —
          // usado só como probe de "o servidor Node.js está aceitando
          // conexões", não exercita `/api/*`.
          await waitForHttpOk(`http://127.0.0.1:${webPort}/login`, 90_000, webOutput);

          // Requisição real através do proxy same-origem: nenhum cookie de
          // sessão é enviado de propósito — `GET /auth/me` responde 401,
          // o que não importa aqui (o span HTTP real da API é criado pela
          // auto-instrumentação ANTES de qualquer guard/rota decidir o
          // status, ver `instrumentation-http`).
          const response1 = await fetch(`http://127.0.0.1:${webPort}/api/auth/me`);
          expect(response1.status).toBe(401);

          // Dá tempo dos `SimpleSpanProcessor`s (síncronos, mas ainda
          // passam pelo event loop de cada processo filho) escreverem no
          // stdout — mesmo idioma de `otel-tracing.e2e-spec.ts`.
          await new Promise((r) => setTimeout(r, 1_500));

          const webStdout1 = webOutput.get();
          const apiStdout1 = apiOutput.get();

          // Evidência de que é um span REAL emitido pelo SDK do OTel do
          // lado do Next.js — mesmo padrão de asserção já usado para
          // `apps/api` em `otel-tracing.e2e-spec.ts`.
          expect(webStdout1).toContain("'service.name': 'forge-web'");
          expect(webStdout1).toMatch(/name: 'web\.proxy GET \/api\/auth\/me'/);
          expect(apiStdout1).toContain("'service.name': 'forge-api'");

          const webTraceIds1 = extractTraceIds(webStdout1);
          const apiTraceIds1 = extractTraceIds(apiStdout1);
          expect(webTraceIds1.length, `nenhum traceId no stdout do web:\n${webStdout1}`).toBeGreaterThanOrEqual(1);
          expect(apiTraceIds1.length, `nenhum traceId no stdout da api:\n${apiStdout1}`).toBeGreaterThanOrEqual(1);

          // A prova central deste teste: o `traceId` que `apps/web` gerou
          // para esta requisição é o MESMO que aparece no span HTTP real
          // criado por `apps/api` — não dois traces desconectados.
          expect(apiTraceIds1[apiTraceIds1.length - 1]).toBe(webTraceIds1[webTraceIds1.length - 1]);

          // Segunda requisição real, independente: prova negativa de que
          // o `traceId` não é um valor fixo/hardcoded — cada requisição
          // gera seu próprio trace, sempre correlacionado nos dois lados.
          const response2 = await fetch(`http://127.0.0.1:${webPort}/api/auth/me`);
          expect(response2.status).toBe(401);
          await new Promise((r) => setTimeout(r, 1_500));

          const webTraceIds2 = extractTraceIds(webOutput.get());
          const apiTraceIds2 = extractTraceIds(apiOutput.get());
          const newWebTraceId = webTraceIds2[webTraceIds2.length - 1];
          const newApiTraceId = apiTraceIds2[apiTraceIds2.length - 1];

          expect(newApiTraceId).toBe(newWebTraceId);
          expect(newWebTraceId).not.toBe(webTraceIds1[webTraceIds1.length - 1]);
        } finally {
          if (typeof webChild.pid === 'number') {
            killProcessTree(webChild.pid);
          }
          rmSync(join(webRoot, WEB_DIST_DIR), { recursive: true, force: true });
          // Restaura `tsconfig.json` byte a byte — nunca deixa este teste
          // sujar o working tree real (ver comentário do topo do arquivo).
          writeFileSync(webTsconfigPath, originalWebTsconfig);
        }
      } finally {
        if (typeof apiChild.pid === 'number') {
          killProcessTree(apiChild.pid);
        }
        rmSync(dataDir, { recursive: true, force: true });
      }
    },
    180_000,
  );
});
