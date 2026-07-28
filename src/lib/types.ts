export type DatasetRow = {
  id: string;
  text: string;
  label?: string;
};

export type DetectorOutcome =
  | {
      status: 'ok';
      label: string;
      aiScore: number | null;
      note?: string;
      raw?: unknown;
    }
  | {
      status: 'error';
      error: string;
      raw?: unknown;
    };

export type AdapterMode = 'api' | 'browser';

export type RunContext = {
  signal?: AbortSignal;
};

export type Adapter = {
  key: string;
  displayName: string;
  mode: AdapterMode;
  configured: () => boolean;
  configHint: string;
  run: (text: string, ctx: RunContext) => Promise<DetectorOutcome>;
};

export type ResultRow = {
  rowIndex: number;
  rowId: string;
  text: string;
  tool: string;
  outcome: DetectorOutcome;
  startedAt: string;
  finishedAt: string;
};

export type RunRecord = {
  id: string;
  createdAt: string;
  status: 'running' | 'done';
  tools: string[];
  totalRows: number;
  rows: DatasetRow[];
  results: ResultRow[];
};
