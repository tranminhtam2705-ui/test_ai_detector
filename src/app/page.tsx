'use client';

import { useEffect, useMemo, useState } from 'react';

type ToolInfo = {
  key: string;
  displayName: string;
  mode: 'api' | 'browser';
  configured: boolean;
  configHint: string;
};

type DatasetRow = { id: string; text: string; label?: string };

type DetectorOutcome =
  | { status: 'ok'; label: string; aiScore: number | null; note?: string; raw?: unknown }
  | { status: 'error'; error: string; raw?: unknown };

type ResultRow = {
  rowIndex: number;
  rowId: string;
  text: string;
  tool: string;
  outcome: DetectorOutcome;
};

type RunRecord = {
  id: string;
  status: 'running' | 'done';
  totalRows: number;
  tools: string[];
  results: ResultRow[];
};

export default function Home() {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<DatasetRow[] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetch('/api/tools')
      .then((r) => r.json())
      .then((data) => {
        setTools(data.tools);
        setSelectedTools(new Set(data.tools.map((t: ToolInfo) => t.key)));
      });
  }, []);

  useEffect(() => {
    if (!runId) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/run/${runId}`);
      if (!res.ok) return;
      const data: RunRecord = await res.json();
      setRun(data);
      if (data.status === 'done') clearInterval(interval);
    }, 1500);
    return () => clearInterval(interval);
  }, [runId]);

  const expectedResultCount = useMemo(() => {
    if (!rows) return 0;
    return rows.length * selectedTools.size;
  }, [rows, selectedTools]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setRows(null);
    setRun(null);
    setRunId(null);

    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) {
      setUploadError(data.error ?? 'Upload failed');
      return;
    }
    setRows(data.rows);
  }

  function toggleTool(key: string) {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleStart() {
    if (!rows || selectedTools.size === 0) return;
    setStarting(true);
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, tools: Array.from(selectedTools) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error ?? 'Failed to start run');
        return;
      }
      setRunId(data.runId);
      setRun(null);
    } finally {
      setStarting(false);
    }
  }

  const progressPct = run ? Math.min(100, Math.round((run.results.length / (run.totalRows * run.tools.length)) * 100)) : 0;

  return (
    <div className="container">
      <h1>AI Detector Testing Portal</h1>
      <p className="subtitle">Chạy một bộ dataset qua nhiều AI-content-detector và so sánh kết quả.</p>

      <div className="card">
        <h2>1. Chọn tool</h2>
        <div className="tool-grid">
          {tools.map((t) => (
            <label className="tool-item" key={t.key}>
              <input
                type="checkbox"
                checked={selectedTools.has(t.key)}
                onChange={() => toggleTool(t.key)}
              />
              <div>
                <div>
                  {t.displayName}
                  <span className={`badge ${t.mode === 'api' ? 'badge-api' : 'badge-browser'}`}>
                    {t.mode === 'api' ? 'API' : 'browser (best-effort)'}
                  </span>
                  {!t.configured && <span className="badge badge-off">not configured</span>}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#9aa0a6' }}>{t.configHint}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>2. Upload dataset (CSV hoặc JSON)</h2>
        <p style={{ fontSize: '0.85rem', color: '#9aa0a6' }}>
          CSV cần cột <code>text</code> (bắt buộc), <code>id</code> và <code>label</code> (tuỳ chọn). Tối đa 200 dòng.
        </p>
        <input type="file" accept=".csv,.json" onChange={handleFileChange} />
        {uploadError && <div className="error-text">{uploadError}</div>}
        {rows && (
          <p style={{ marginTop: '0.75rem' }}>
            Đã nạp <strong>{rows.length}</strong> dòng dataset. Sẽ chạy <strong>{expectedResultCount}</strong> lượt gọi
            ({rows.length} dòng × {selectedTools.size} tool).
          </p>
        )}
      </div>

      <div className="card">
        <h2>3. Chạy</h2>
        <button onClick={handleStart} disabled={!rows || selectedTools.size === 0 || starting || run?.status === 'running'}>
          {starting ? 'Đang bắt đầu...' : 'Bắt đầu chạy'}
        </button>
        {run && run.status === 'running' && (
          <>
            <div className="progress-bar" style={{ marginTop: '1rem' }}>
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <p style={{ fontSize: '0.85rem', color: '#9aa0a6' }}>
              {run.results.length} / {run.totalRows * run.tools.length} kết quả ({progressPct}%)
            </p>
          </>
        )}
        {run && run.status === 'done' && (
          <p style={{ marginTop: '0.75rem', color: '#4ade80' }}>Hoàn tất: {run.results.length} kết quả.</p>
        )}
      </div>

      {run && run.results.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>4. Kết quả (dataset | tool_used | result)</h2>
            <a href={`/api/export/${run.id}`}>
              <button className="secondary">Export</button>
            </a>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '45%' }}>dataset</th>
                  <th style={{ width: '15%' }}>tool_used</th>
                  <th>result</th>
                </tr>
              </thead>
              <tbody>
                {run.results.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.text.length > 140 ? `${r.text.slice(0, 140)}…` : r.text}</td>
                    <td>{r.tool}</td>
                    <td className={r.outcome.status === 'ok' ? 'status-ok' : 'status-error'}>
                      {r.outcome.status === 'ok'
                        ? `${r.outcome.label}${r.outcome.aiScore !== null && r.outcome.aiScore !== undefined ? ` (aiScore=${r.outcome.aiScore})` : ''}`
                        : `ERROR: ${r.outcome.error}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
