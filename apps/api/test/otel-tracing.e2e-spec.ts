import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prova, de fora do runtime do Vitest (mesmo espírito de
 * `runtime-smoke.e2e-spec.ts`, ver o comentário completo lá), que a API
 * como processo Node real emite spans OTel REAIS no `ConsoleSpanExporter`
 * quando `OTEL_EXPORTER_OTLP_ENDPOINT` NÃO está definido (o caso padrão,
 * sem credencial nenhuma) — não um log estruturado parecido com span, o
 * span de verdade que o SDK do OTel produz via auto-instrumentação HTTP
 * (`@opentelemetry/auto-instrumentations-node`, carregada em
 * `apps/api/src/tracing.ts`, importado como a primeira linha de
 * `main.ts`).
 *
 * `AgentRunOtelSpanRecorder` (spans manuais de `agent.step`/`tool.call`) já
 * tem cobertura própria com `InMemorySpanExporter` em
 * `agent-run-otel-span-recorder.spec.ts` — este spec cobre especificamente
 * a auto-instrumentação HTTP, que só é observável de verdade com o
 * processo rodando fora do Vitest (a mesma razão de `runtime-smoke`
 * existir: patch de módulo/timing de auto-instrumentação não é
 * reproduzível de forma confiável dentro do runtime do Vitest, que já
 * carrega `http`/`express` antes de qualquer coisa deste pacote rodar).
 */

const apiRoot = resolve(fileURLToPath(import.meta.url), '../..');

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
 * necessidade de matar a árvore de processos no Windows. */
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

async function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status === 200) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`servidor não respondeu 200 em ${url} dentro de ${timeoutMs}ms (último erro: ${String(lastError)})`);
}

describe('OpenTelemetry — API como processo Node real (fora do Vitest)', () => {
  beforeAll(() => {
    const nestCliEntry = resolve(apiRoot, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');
    const build = spawnSync(process.execPath, [nestCliEntry, 'build'], {
      cwd: apiRoot,
      encoding: 'utf-8',
    });
    if (build.status !== 0) {
      throw new Error(`\`nest build\` falhou (status ${String(build.status)}):\n${build.stdout}\n${build.stderr}`);
    }
  }, 120_000);

  it(
    '`node dist/main.js` sem OTEL_EXPORTER_OTLP_ENDPOINT imprime spans OTel reais no console para uma requisição HTTP real',
    async () => {
      const port = await getFreePort();
      const dataDir = mkdtempSync(join(tmpdir(), 'forge-api-otel-smoke-'));

      // `OTEL_EXPORTER_OTLP_ENDPOINT` deliberadamente ausente: é o caso
      // padrão sem credencial nenhuma (mesma filosofia de PGlite/fila em
      // memória/IA mock), que deve cair no `ConsoleSpanExporter`.
      const child = spawn(process.execPath, ['dist/main.js'], {
        cwd: apiRoot,
        env: {
          ...process.env,
          API_PORT: String(port),
          DATABASE_LOCAL_PATH: join(dataDir, 'forge-otel-smoke.pglite'),
        },
      }) as ChildProcessWithoutNullStreams;
      const output = collectOutput(child);

      try {
        const baseUrl = `http://127.0.0.1:${port}`;
        try {
          await waitForHttpOk(`${baseUrl}/`, 90_000);
        } catch (error) {
          throw new Error(`${(error as Error).message}\n--- saída do processo ---\n${output.get()}`);
        }

        // Dá tempo do `SimpleSpanProcessor` (síncrono, mas ainda passa pelo
        // event loop do processo filho) escrever no stdout antes de ler.
        await new Promise((r) => setTimeout(r, 1_000));

        const stdout = output.get();

        // Evidência de que é um span REAL emitido pelo SDK do OTel — não um
        // log estruturado parecido com span escrito à mão por este teste:
        // (1) o resource configurado em `tracing.ts` (`service.name`);
        // (2) um `traceId` de verdade (formato de trace context W3C);
        // (3) o span raiz HTTP nomeado pelo método (`GET`), produzido pela
        //     auto-instrumentação de `@opentelemetry/auto-instrumentations-node`;
        // (4) o atributo semântico de status code da resposta real (200).
        expect(stdout).toContain("'service.name': 'forge-api'");
        expect(stdout).toMatch(/traceId: '[0-9a-f]{32}'/);
        expect(stdout).toMatch(/name: 'GET',/);
        expect(stdout).toContain("'http.response.status_code': 200");
      } finally {
        if (typeof child.pid === 'number') {
          killProcessTree(child.pid);
        }
        rmSync(dataDir, { recursive: true, force: true });
      }
    },
    120_000,
  );
});
