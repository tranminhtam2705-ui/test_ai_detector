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
