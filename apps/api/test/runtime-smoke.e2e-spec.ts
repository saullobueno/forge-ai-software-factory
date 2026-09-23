import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regressão-alvo: `apps/api` rodava perfeitamente sob Vitest/`nest start
 * --watch` (ambos toleram imports relativos sem extensão em
 * `@forge/types`/`@forge/domain`/`@forge/database`) mas quebrava
 * imediatamente como processo Node real — `ERR_MODULE_NOT_FOUND` ao
 * carregar esses pacotes via `node dist/main.js` ou `nest start`. Como
 * TODA a suíte (incluindo os e2e-specs vizinhos deste arquivo) roda via
 * Vitest, esse bug nunca aparecia em `pnpm test`/`pnpm test:e2e`.
 *
 * Este spec fecha esse buraco: builda de verdade, sobe o binário
 * *compilado* (`node dist/main.js`) e também o `nest start` (sem
 * `--watch`) como processos Node reais — fora do runtime do Vitest — e
 * faz uma requisição HTTP de verdade contra cada um. Se alguém
 * reintroduzir um import relativo sem extensão (ou sem `.ts`/`.js`
 * correto) em qualquer um desses três pacotes, ou desfizer a resolução
 * NodeNext em `apps/api/tsconfig.json`, este teste falha — mesmo que
 * `vitest run` "normal" continue verde.
 */

const apiRoot = resolve(fileURLToPath(import.meta.url), '../..');
// Chamado via `node <caminho>` (não `pnpm exec nest`/o shim `.bin/nest`):
// evita depender do `cmd.exe`/`shell: true` no Windows para resolver um
// `.cmd`, o que se mostrou frágil com caminhos relativos com `/`.
const nestCliEntry = resolve(apiRoot, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');

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

/** No Windows, `nest start`/`nest build` sobem um processo `node` filho
 * separado do processo do CLI — matar só o processo do CLI deixa o
 * servidor real órfão e ainda escutando a porta. `taskkill /T` mata a
 * árvore inteira a partir do PID. Em POSIX, o grupo de processos (criado
 * via `detached: true` no spawn) cobre o mesmo caso. */
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

async function waitForHttpOk(url: string, timeoutMs: number): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await fetch(url);
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`servidor não respondeu em ${url} dentro de ${timeoutMs}ms (último erro: ${String(lastError)})`);
}

/**
 * Sobe `command`/`args` como processo real, espera responder em `/` na
 * porta livre escolhida, roda `assertion`, e sempre mata a árvore de
 * processos ao final (sucesso ou falha) para não vazar processos.
 */
async function runServerProcessAndAssert(
  command: string,
  args: string[],
  readinessTimeoutMs: number,
  assertion: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const port = await getFreePort();
  const dataDir = mkdtempSync(join(tmpdir(), 'forge-api-runtime-smoke-'));

  const child = spawn(command, args, {
    cwd: apiRoot,
    env: {
      ...process.env,
      API_PORT: String(port),
      DATABASE_LOCAL_PATH: join(dataDir, 'forge-runtime-smoke.pglite'),
    },
  }) as ChildProcessWithoutNullStreams;
  const output = collectOutput(child);

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
      await waitForHttpOk(`${baseUrl}/`, readinessTimeoutMs);
    } catch (error) {
      throw new Error(`${(error as Error).message}\n--- saída do processo ---\n${output.get()}`);
    }
    await assertion(baseUrl);
  } finally {
    if (typeof child.pid === 'number') {
      killProcessTree(child.pid);
    }
    rmSync(dataDir, { recursive: true, force: true });
  }
}

describe('API como processo Node real (fora do Vitest)', () => {
  beforeAll(() => {
    // Builda de verdade antes dos testes — sem isso, `dist/main.js`
    // poderia estar obsoleto (ou nem existir) e o teste estaria validando
    // o build de uma execução anterior, não o código atual.
    const build = spawnSync(process.execPath, [nestCliEntry, 'build'], {
      cwd: apiRoot,
      encoding: 'utf-8',
    });
    if (build.status !== 0) {
      throw new Error(`\`nest build\` falhou (status ${String(build.status)}):\n${build.stdout}\n${build.stderr}`);
    }
  }, 120_000);

  it(
    '`node dist/main.js` sobe e responde a uma requisição HTTP real',
    async () => {
      await runServerProcessAndAssert(process.execPath, ['dist/main.js'], 20_000, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/`);
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('Hello World!');
      });
    },
    60_000,
  );

  it(
    '`nest start` (sem --watch) sobe e responde a uma requisição HTTP real',
    async () => {
      await runServerProcessAndAssert(process.execPath, [nestCliEntry, 'start'], 45_000, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/`);
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('Hello World!');
      });
    },
    60_000,
  );
});
