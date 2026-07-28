import { NextResponse } from 'next/server';
import { loadRun } from '@/lib/storage';
import { resultsToPipeFormat } from '@/lib/csv';

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await loadRun(runId);
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  const body = resultsToPipeFormat(run.results);
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="results-${runId}.txt"`,
    },
  });
}
