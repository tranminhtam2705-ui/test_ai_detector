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

export type RunSummary = {
  id: string;
  createdAt: string;
  status: 'running' | 'done';
  totalRows: number;
  tools: string[];
  resultCount: number;
};

export async function listRuns(): Promise<RunSummary[]> {
  await ensureDir();
  const files = await fs.readdir(DATA_DIR).catch(() => []);
  const summaries: RunSummary[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, file), 'utf-8');
      const run = JSON.parse(raw) as RunRecord;
      summaries.push({
        id: run.id,
        createdAt: run.createdAt,
        status: run.status,
        totalRows: run.totalRows,
        tools: run.tools,
        resultCount: run.results.length,
      });
    } catch {
      // skip unreadable/corrupt run files
    }
  }
  return summaries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
