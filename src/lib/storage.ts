import { promises as fs } from 'fs';
import path from 'path';
import type { RunRecord } from './types';

const DATA_DIR = path.join(process.cwd(), 'data', 'runs');

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function runPath(runId: string) {
  return path.join(DATA_DIR, `${runId}.json`);
}

export async function saveRun(run: RunRecord): Promise<void> {
  await ensureDir();
  await fs.writeFile(runPath(run.id), JSON.stringify(run), 'utf-8');
}

export async function loadRun(runId: string): Promise<RunRecord | null> {
  try {
    const raw = await fs.readFile(runPath(runId), 'utf-8');
    return JSON.parse(raw) as RunRecord;
  } catch {
    return null;
  }
}
