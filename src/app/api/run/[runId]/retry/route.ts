import { NextResponse } from 'next/server';
import { retryTransientErrors } from '@/lib/runner';

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  try {
    const body = await req.json();
    const tools: string[] = body.tools;
    if (!Array.isArray(tools) || tools.length === 0) {
      return NextResponse.json({ error: 'tools is required and must be non-empty' }, { status: 400 });
    }
    const result = await retryTransientErrors(runId, tools);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
