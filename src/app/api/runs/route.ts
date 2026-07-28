import { NextResponse } from 'next/server';
import { listRuns } from '@/lib/storage';

export async function GET() {
  const runs = await listRuns();
  return NextResponse.json({ runs });
}
