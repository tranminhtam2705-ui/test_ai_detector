import { ADAPTERS, getAdapter } from './adapters';
import { saveRun, loadRun } from './storage';
import type { DatasetRow, DetectorOutcome, RunRecord } from './types';

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

// Matches the error messages our adapters produce for rate-limiting and
// credit/coin exhaustion (see http.ts's 429 retry, and each adapter's
// HTTP-error passthrough of the provider's own error body), so a retry only
// re-runs entries that are plausibly transient - not deterministic failures
// like "not configured" or "text too short" that would just fail again.
const RETRYABLE_ERROR_PATTERN = /\b429\b|rate.?limit|throttled|too many requests|credit|coins?\b|trial[_ ]expired/i;

function isRetryableError(message: string): boolean {
  return RETRYABLE_ERROR_PATTERN.test(message);
}

/**
 * Re-runs only the (row, tool) pairs from a previous run that failed with a
 * rate-limit or insufficient-credit error, restricted to the given tools,
 * and overwrites those entries in place on the same run record. Everything
 * else in the run (successful results, permanent failures, other tools) is
 * left untouched - this never re-processes the whole dataset.
 */
export async function retryTransientErrors(
  runId: string,
  toolKeys: string[],
): Promise<{ retried: number } | { error: string }> {
  const run = await loadRun(runId);
  if (!run) return { error: 'Run not found' };
  if (run.status === 'running') return { error: 'Run is still in progress' };

  const toolSet = new Set(toolKeys);
  const targetIndices = run.results
    .map((r, i) => i)
    .filter((i) => {
      const r = run.results[i];
      return toolSet.has(r.tool) && r.outcome.status === 'error' && isRetryableError(r.outcome.error);
    });

  if (targetIndices.length === 0) return { retried: 0 };

  run.status = 'running';
  await saveRun(run);

  void (async () => {
    for (const idx of targetIndices) {
      const entry = run.results[idx];
      const adapter = getAdapter(entry.tool);
      const startedAt = new Date().toISOString();
      let outcome: DetectorOutcome;
      if (!adapter) {
        outcome = { status: 'error', error: `Unknown tool: ${entry.tool}` };
      } else if (!adapter.configured()) {
        outcome = { status: 'error', error: `Not configured: ${adapter.configHint}` };
      } else {
        try {
          outcome = await adapter.run(entry.text, {});
        } catch (e) {
          outcome = { status: 'error', error: e instanceof Error ? e.message : String(e) };
        }
      }
      run.results[idx] = { ...entry, outcome, startedAt, finishedAt: new Date().toISOString() };
      await saveRun(run);
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_ROWS_MS));
    }
    run.status = 'done';
    await saveRun(run);
  })();

  return { retried: targetIndices.length };
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
