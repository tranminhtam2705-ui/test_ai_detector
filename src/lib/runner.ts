import { ADAPTERS, getAdapter } from './adapters';
import { saveRun } from './storage';
import type { DatasetRow, RunRecord } from './types';

const DELAY_BETWEEN_ROWS_MS = 1500;

export async function startRun(runId: string, rows: DatasetRow[], toolKeys: string[]): Promise<void> {
  const run: RunRecord = {
    id: runId,
    createdAt: new Date().toISOString(),
    status: 'running',
    tools: toolKeys,
    totalRows: rows.length,
    rows,
    results: [],
  };
  await saveRun(run);

  // Fire-and-forget: this runs in the background of the long-lived Next.js
  // server process. The frontend polls GET /api/run/:id for progress.
  void executeRun(run).catch(async (e) => {
    run.status = 'done';
    run.results.push({
      rowIndex: -1,
      rowId: 'runner',
      text: '',
      tool: 'runner',
      outcome: { status: 'error', error: `Runner crashed: ${e instanceof Error ? e.message : String(e)}` },
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });
    await saveRun(run);
  });
}

async function executeRun(run: RunRecord): Promise<void> {
  const adapters = run.tools.map(getAdapter).filter((a): a is NonNullable<typeof a> => Boolean(a));

  for (let rowIndex = 0; rowIndex < run.rows.length; rowIndex++) {
    const row = run.rows[rowIndex];

    const settled = await Promise.allSettled(
      adapters.map(async (adapter) => {
        const startedAt = new Date().toISOString();
        if (!adapter.configured()) {
          return {
            rowIndex,
            rowId: row.id,
            text: row.text,
            tool: adapter.key,
            outcome: { status: 'error' as const, error: `Not configured: ${adapter.configHint}` },
            startedAt,
            finishedAt: new Date().toISOString(),
          };
        }
        try {
          const outcome = await adapter.run(row.text, {});
          return {
            rowIndex,
            rowId: row.id,
            text: row.text,
            tool: adapter.key,
            outcome,
            startedAt,
            finishedAt: new Date().toISOString(),
          };
        } catch (e) {
          return {
            rowIndex,
            rowId: row.id,
            text: row.text,
            tool: adapter.key,
            outcome: { status: 'error' as const, error: e instanceof Error ? e.message : String(e) },
            startedAt,
            finishedAt: new Date().toISOString(),
          };
        }
      }),
    );

    for (const s of settled) {
      if (s.status === 'fulfilled') run.results.push(s.value);
    }
    await saveRun(run);

    if (rowIndex < run.rows.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_ROWS_MS));
    }
  }

  run.status = 'done';
  await saveRun(run);
}

export function listAdapters() {
  return ADAPTERS.map((a) => ({
    key: a.key,
    displayName: a.displayName,
    mode: a.mode,
    configured: a.configured(),
    configHint: a.configHint,
  }));
}
