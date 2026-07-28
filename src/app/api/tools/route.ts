import { NextResponse } from 'next/server';
import { listAdapters } from '@/lib/runner';

export async function GET() {
  return NextResponse.json({ tools: listAdapters() });
}
