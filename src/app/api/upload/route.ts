import { NextResponse } from 'next/server';
import { parseDataset } from '@/lib/csv';

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    const content = await file.text();
    const rows = parseDataset(content, file.name);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Dataset is empty' }, { status: 400 });
    }
    if (rows.length > 200) {
      return NextResponse.json({ error: `Dataset has ${rows.length} rows; max 200 per run` }, { status: 400 });
    }
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
