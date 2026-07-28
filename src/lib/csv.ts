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

  const fromHeaderCsv = tryParseHeaderCsv(fileContent);
  if (fromHeaderCsv) return fromHeaderCsv;

  return parseIdTextBlocks(fileContent);
}

/**
 * Standard CSV with a header row containing a "text" column (e.g.
 * id,text,label). Returns null (instead of throwing) if the file doesn't
 * look like this shape, so parseDataset can fall back to the id/text-block
 * format below.
 */
function tryParseHeaderCsv(fileContent: string): DatasetRow[] | null {
  const parsed = Papa.parse<Record<string, string>>(fileContent, {
    header: true,
    skipEmptyLines: true,
  });
  const fatalErrors = parsed.errors.filter((e) => e.code !== 'UndetectableDelimiter');
  if (fatalErrors.length) return null;

  const fields = parsed.meta.fields ?? [];
  const hasTextColumn = fields.some((f) => ['text', 'Text', 'content', 'Content'].includes(f));
  if (!hasTextColumn) return null;

  try {
    return parsed.data.map((row, i) => normalizeRow(row, i));
  } catch {
    return null;
  }
}

/**
 * Fallback format for files like:
 *
 *   ROW-ID-1
 *   "Some text for this row..."
 *
 *   ROW-ID-2
 *   Some other text, possibly without quotes...
 *
 * i.e. blocks separated by one or more blank lines, where the first line of
 * each block is the id and the remaining line(s) are the text (optionally
 * wrapped in a single pair of double quotes).
 */
function parseIdTextBlocks(fileContent: string): DatasetRow[] {
  const normalized = fileContent.replace(/\r\n/g, '\n');
  const blocks = normalized
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const rows: DatasetRow[] = [];
  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length < 2) continue;

    const id = lines[0];
    const text = stripWrappingQuotes(lines.slice(1).join(' ').trim());
    if (!text) continue;
    rows.push({ id, text });
  }

  if (rows.length === 0) {
    throw new Error(
      'Could not parse dataset. Expected either a CSV with a "text" column, or blocks of one "id" line followed by one "text" line, separated by blank lines.',
    );
  }
  return rows;
}

function stripWrappingQuotes(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/""/g, '"');
  }
  return value;
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
