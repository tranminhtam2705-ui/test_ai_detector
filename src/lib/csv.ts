import Papa from 'papaparse';
import type { DatasetRow, ResultRow } from './types';

export function parseDataset(fileContent: string, fileName: string): DatasetRow[] {
  const isJson = fileName.toLowerCase().endsWith('.json');

  if (isJson) {
    const parsed = JSON.parse(fileContent);
    const arr = Array.isArray(parsed) ? parsed : parsed.rows;
    if (!Array.isArray(arr)) throw new Error('JSON dataset must be an array of rows or { rows: [...] }');
    return arr.map((row, i) => normalizeRow(row, i));
  }

  const parsed = Papa.parse<Record<string, string>>(fileContent, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length) {
    throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
  }
  return parsed.data.map((row, i) => normalizeRow(row, i));
}

function normalizeRow(row: any, index: number): DatasetRow {
  const text = row.text ?? row.Text ?? row.content ?? row.Content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error(`Row ${index + 1} is missing a non-empty "text" field`);
  }
  return {
    id: String(row.id ?? row.ID ?? `row-${index + 1}`),
    text,
    label: row.label ?? row.Label ?? undefined,
  };
}

function escapePipeField(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

export function resultsToPipeFormat(results: ResultRow[]): string {
  const lines = ['dataset|tool_used|result'];
  for (const r of results) {
    const dataset = escapePipeField(r.text);
    const toolUsed = escapePipeField(r.tool);
    const result =
      r.outcome.status === 'error'
        ? `ERROR: ${r.outcome.error}`
        : `${r.outcome.label}${r.outcome.aiScore !== null && r.outcome.aiScore !== undefined ? ` (aiScore=${r.outcome.aiScore})` : ''}`;
    lines.push(`${dataset}|${toolUsed}|${escapePipeField(result)}`);
  }
  return lines.join('\n');
}

/**
 * Best-effort credit-usage extraction. Only Winston AI, Copyleaks, and
 * WalterWrites report credit/coin consumption in their API response; Sapling
 * is free, and Pangram/Ryne.ai don't include billing info in this endpoint's
 * response, so those columns come back blank and must be checked on the
 * provider's own dashboard.
 */
function extractCredits(raw: unknown): { used?: number; remaining?: number } {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, any>;
  if (typeof r.credits_used === 'number' || typeof r.credits_remaining === 'number') {
    return { used: r.credits_used, remaining: r.credits_remaining };
  }
  if (typeof r.scannedDocument?.actualCredits === 'number') {
    return { used: r.scannedDocument.actualCredits };
  }
  return {};
}

export function resultsToDetailedCsv(results: ResultRow[]): string {
  const rows = results.map((r) => {
    const latencyMs = new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime();
    const credits = extractCredits(r.outcome.raw);
    return {
      dataset: r.text,
      tool: r.tool,
      status: r.outcome.status,
      label: r.outcome.status === 'ok' ? r.outcome.label : '',
      ai_score: r.outcome.status === 'ok' ? r.outcome.aiScore ?? '' : '',
      latency_ms: latencyMs,
      credits_used: credits.used ?? '',
      credits_remaining: credits.remaining ?? '',
      note: r.outcome.status === 'ok' ? r.outcome.note ?? '' : '',
      error: r.outcome.status === 'error' ? r.outcome.error : '',
    };
  });
  return Papa.unparse(rows);
}
