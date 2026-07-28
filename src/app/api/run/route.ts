import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { startRun } from '@/lib/runner';
import type { DatasetRow } from '@/lib/types';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows: DatasetRow[] = body.rows;
    const tools: string[] = body.tools;
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows is required and must be non-empty' }, { status: 400 });
    }
    if (!Array.isArray(tools) || tools.length === 0) {
      return NextResponse.json({ error: 'tools is required and must be non-empty' }, { status: 400 });
    }

    const runId = uuidv4();
    await startRun(runId, rows, tools);
    return NextResponse.json({ runId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
