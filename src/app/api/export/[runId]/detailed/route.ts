import { NextResponse } from 'next/server';
import { loadRun } from '@/lib/storage';
import { resultsToDetailedCsv } from '@/lib/csv';

export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await loadRun(runId);
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  const body = resultsToDetailedCsv(run.results);
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="results-detailed-${runId}.csv"`,
    },
  });
}
