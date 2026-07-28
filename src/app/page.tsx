'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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
  startedAt: string;
  finishedAt: string;
};

function latencyMs(r: ResultRow): number | null {
  const ms = new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime();
  return isNaN(ms) ? null : ms;
}

function creditsUsedFrom(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  if (typeof r.credits_used === 'number') return r.credits_used;
  if (typeof r.scannedDocument?.actualCredits === 'number') return r.scannedDocument.actualCredits;
  return null;
}

type RunRecord = {
  id: string;
  status: 'running' | 'done';
  totalRows: number;
  tools: string[];
  results: ResultRow[];
};

type RunSummary = {
  id: string;
  createdAt: string;
  status: 'running' | 'done';
  totalRows: number;
  tools: string[];
  resultCount: number;
};

export default function Home() {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<DatasetRow[] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [starting, setStarting] = useState(false);
  const [batches, setBatches] = useState<RunSummary[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  function refreshBatches() {
    fetch('/api/runs')
      .then((r) => r.json())
      .then((data) => setBatches(data.runs ?? []));
  }

  useEffect(() => {
    fetch('/api/tools')
      .then((r) => r.json())
      .then((data) => {
        setTools(data.tools);
        setSelectedTools(new Set(data.tools.map((t: ToolInfo) => t.key)));
      });
    refreshBatches();
  }, []);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startPolling(id: string) {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      const res = await fetch(`/api/run/${id}`);
      if (!res.ok) return;
      const data: RunRecord = await res.json();
      setRun(data);
      if (data.status === 'done') {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        refreshBatches();
      }
    }, 1500);
  }

  useEffect(() => {
    if (!runId) return;
    startPolling(runId);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
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

  async function handleRetry() {
    if (!selectedBatchId || selectedTools.size === 0) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/run/${selectedBatchId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tools: Array.from(selectedTools) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRetryError(data.error ?? 'Failed to retry');
        return;
      }
      if (data.retried === 0) {
        setRetryError('Không có dòng nào bị lỗi rate-limit/hết credit khớp với tool đã chọn trong batch này.');
        return;
      }
      setRunId(selectedBatchId);
      setRun(null);
      startPolling(selectedBatchId);
    } finally {
      setRetrying(false);
    }
  }

  const progressPct = run ? Math.min(100, Math.round((run.results.length / (run.totalRows * run.tools.length)) * 100)) : 0;

  const toolSummary = useMemo(() => {
    if (!run) return [];
    const byTool = new Map<
      string,
      { count: number; ok: number; error: number; latencies: number[]; creditsUsed: number[] }
    >();
    for (const r of run.results) {
      const entry = byTool.get(r.tool) ?? { count: 0, ok: 0, error: 0, latencies: [], creditsUsed: [] };
      entry.count++;
      if (r.outcome.status === 'ok') entry.ok++;
      else entry.error++;
      const ms = latencyMs(r);
      if (ms !== null) entry.latencies.push(ms);
      const used = creditsUsedFrom(r.outcome.raw);
      if (used !== null) entry.creditsUsed.push(used);
      byTool.set(r.tool, entry);
    }
    return Array.from(byTool.entries()).map(([tool, e]) => ({
      tool,
      count: e.count,
      ok: e.ok,
      error: e.error,
      avgLatencyMs: e.latencies.length ? Math.round(e.latencies.reduce((a, b) => a + b, 0) / e.latencies.length) : null,
      totalCredits: e.creditsUsed.length ? e.creditsUsed.reduce((a, b) => a + b, 0) : null,
    }));
  }, [run]);

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

      <div className="card">
        <h2>3b. Chạy lại lỗi rate-limit / hết credit từ 1 batch trước</h2>
        <p style={{ fontSize: '0.85rem', color: '#9aa0a6' }}>
          Đọc lại kết quả một batch đã chạy, chỉ chạy lại đúng những dòng bị lỗi rate-limit (HTTP 429) hoặc hết
          credit/coin, cho các tool đang được tick ở mục 1 - không đụng tới các dòng đã thành công hay dataset gốc.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            style={{ background: '#171a21', color: '#e6e6e6', border: '1px solid #262b36', borderRadius: 8, padding: '0.5rem' }}
          >
            <option value="">-- Chọn batch --</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {new Date(b.createdAt).toLocaleString()} · {b.totalRows} dòng · {b.tools.join(', ')} · {b.resultCount} kết
                quả {b.status === 'running' ? '(đang chạy)' : ''}
              </option>
            ))}
          </select>
          <button className="secondary" onClick={refreshBatches} type="button">
            Làm mới danh sách
          </button>
          <button
            onClick={handleRetry}
            disabled={!selectedBatchId || selectedTools.size === 0 || retrying || run?.status === 'running'}
          >
            {retrying ? 'Đang chạy lại...' : 'Chạy lại lỗi rate-limit/credit'}
          </button>
        </div>
        {retryError && <div className="error-text">{retryError}</div>}
      </div>

      {run && run.results.length > 0 && (
        <div className="card">
          <h2>4. Tổng hợp theo tool (latency, credit)</h2>
          <p style={{ fontSize: '0.8rem', color: '#9aa0a6' }}>
            Credit/coin đã dùng chỉ hiện với tool trả về thông tin này trong response (Winston AI, Copyleaks). Sapling
            miễn phí. Pangram, WalterWrites, Ryne.ai không trả credit trong response request đơn lẻ — cần check
            dashboard riêng của họ để biết chính xác.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>tool</th>
                  <th>số request</th>
                  <th>thành công</th>
                  <th>lỗi</th>
                  <th>latency TB (ms)</th>
                  <th>credit đã dùng (nếu có)</th>
                </tr>
              </thead>
              <tbody>
                {toolSummary.map((s) => (
                  <tr key={s.tool}>
                    <td>{s.tool}</td>
                    <td>{s.count}</td>
                    <td className="status-ok">{s.ok}</td>
                    <td className={s.error > 0 ? 'status-error' : ''}>{s.error}</td>
                    <td>{s.avgLatencyMs ?? '—'}</td>
                    <td>{s.totalCredits ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {run && run.results.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>5. Kết quả chi tiết</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <a href={`/api/export/${run.id}`}>
                <button className="secondary">Export (dataset|tool_used|result)</button>
              </a>
              <a href={`/api/export/${run.id}/detailed`}>
                <button className="secondary">Export chi tiết (CSV, có latency/credit)</button>
              </a>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>dataset</th>
                  <th style={{ width: '12%' }}>tool_used</th>
                  <th>result</th>
                  <th style={{ width: '8%' }}>latency (ms)</th>
                </tr>
              </thead>
              <tbody>
                {run.results.map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.text.length > 140 ? `${r.text.slice(0, 140)}…` : r.text}</td>
                    <td>{r.tool}</td>
                    <td className={r.outcome.status === 'ok' ? 'status-ok' : 'status-error'}>
                      {r.outcome.status === 'ok'
                        ? `${r.outcome.label}${r.outcome.aiScore !== null && r.outcome.aiScore !== undefined ? ` (aiScore=${r.outcome.aiScore})` : ''}${r.outcome.note ? ` — ${r.outcome.note}` : ''}`
                        : `ERROR: ${r.outcome.error}`}
                    </td>
                    <td>{latencyMs(r) ?? '—'}</td>
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
