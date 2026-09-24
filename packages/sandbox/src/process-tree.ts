import { spawn } from 'node:child_process';
import { platform } from 'node:os';

export async function killProcessTree(pid: number): Promise<void> {
  if (pid <= 0) return;

  if (platform() === 'win32') {
    await runDetachedKill('taskkill', ['/PID', String(pid), '/T', '/F']);
    return;
  }

  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Processo já terminou.
    }
  }
}

async function runDetachedKill(command: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve) => {
    const child = spawn(command, [...args], {
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('close', () => resolve());
    child.once('error', () => resolve());
  });
}
