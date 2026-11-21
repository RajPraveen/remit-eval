// Reading a run's rows back, and the totals and tallies the pages show.
// Computed when asked for, never stored.
import type {
  BoundaryDetails, BoundaryEval, BoundaryTotals, CheckName, CheckTally, RunVersion, Tally, ToolCallDetail,
  TraceEval, TraceTotals, Usage,
} from '../../../shared/types';
import { db, fromJson } from '../database/database';

export interface RunRow {
  id: number;
  scope: string;
  note: string | null;
  started_by: 'page' | 'command';
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'finished' | 'failed';
  error: string | null;
  version: string;
  compared_to: number | null;
  gate: 'pass' | 'fail' | null;
  overridden_at: string | null;
}

export interface ResultRow {
  id: number;
  run_id: number;
  record_id: string;
  status: 'running' | 'finished' | 'did_not_finish';
  error: string | null;
  answer: string | null;
  usage: string | null;
}

export type TraceEvalWithPart = TraceEval & { part: string | null };

const SELECT_RUN = db.prepare('SELECT * FROM runs WHERE id = ?');
export const SELECT_RUNS_NEWEST_FIRST = db.prepare('SELECT * FROM runs ORDER BY id DESC');
const SELECT_RESULTS = db.prepare('SELECT * FROM results WHERE run_id = ? ORDER BY id');
export const SELECT_RESULT = db.prepare('SELECT * FROM results WHERE run_id = ? AND record_id = ?');
const SELECT_BOUNDARY_EVALS = db.prepare(
  'SELECT b.* FROM boundary_evals b JOIN results r ON r.id = b.result_id WHERE r.run_id = ?',
);
// The step's detail comes along so a reader's check can name the part it read.
const SELECT_TRACE_EVALS = db.prepare(
  'SELECT t.*, s.detail AS step_detail FROM trace_evals t JOIN results r ON r.id = t.result_id ' +
    'LEFT JOIN steps s ON s.id = t.step_id WHERE r.run_id = ? ORDER BY t.id',
);
const COUNT_TOOL_CALLS = db.prepare(
  'SELECT COUNT(*) AS n FROM steps s JOIN results r ON r.id = s.result_id ' +
    "WHERE r.run_id = ? AND s.kind = 'tool_call' AND json_extract(s.detail, '$.tool') = ?",
);

const CHECKS: CheckName[] = ['grounding', 'diligence', 'self_check', 'limits', 'effort'];

export const tally = (n: number, of: number): Tally => ({ n, of });
const emptyTally = (): CheckTally => ({ pass: 0, fail: 0, not_applicable: 0 });

// Rows

export function runRow(id: number): RunRow {
  const row = SELECT_RUN.get(id) as RunRow | undefined;
  if (!row) throw new Error(`No run ${id}`);
  return row;
}

export const runVersion = (row: RunRow) => fromJson<RunVersion>(row.version)!;

export const runResults = (runId: number) => SELECT_RESULTS.all(runId) as ResultRow[];

/** The run's boundary evals, keyed by result id. */
export function boundaryEvals(runId: number): Map<number, BoundaryEval> {
  const rows = SELECT_BOUNDARY_EVALS.all(runId) as any[];
  return new Map(rows.map((r) => [r.result_id, { ...r, details: fromJson<BoundaryDetails>(r.details)! }]));
}

export function traceEvals(runId: number): TraceEvalWithPart[] {
  const rows = SELECT_TRACE_EVALS.all(runId) as any[];
  return rows.map(({ step_detail, ...r }) => ({
    ...r,
    details: fromJson(r.details),
    part: step_detail ? fromJson<ToolCallDetail>(step_detail)!.input.part : null,
  }));
}

export const modelCalls = (result: ResultRow) => fromJson<Usage>(result.usage)?.model_calls ?? 0;

// Totals and tallies

export function boundaryTotals(runId: number): BoundaryTotals {
  const evals = [...boundaryEvals(runId).values()];
  const countWhere = (test: (b: BoundaryEval) => boolean) => tally(evals.filter(test).length, evals.length);
  const sum = (pick: (d: BoundaryDetails) => number) => evals.reduce((n, b) => n + pick(b.details), 0);
  return {
    records_right: countWhere((b) => b.verdict === 'right'),
    payment_reference_right: countWhere((b) => b.details.payment_reference.result === 'match'),
    payment_amount_right: countWhere((b) => b.details.payment_amount.result === 'match'),
    rows_found: tally(sum((d) => d.counts.matched), sum((d) => d.counts.expected_rows)),
    rows_correct: tally(sum((d) => d.counts.matched), sum((d) => d.counts.returned_rows)),
  };
}

export function traceTotals(runId: number): TraceTotals {
  const evals = traceEvals(runId);
  return {
    orchestrator: checkTallies(evals, 'orchestrator'),
    reader: checkTallies(evals, 'reader'),
    read_part_calls: toolCallCount(runId, 'read_part'),
    read_section_calls: toolCallCount(runId, 'read_section'),
    model_calls: runResults(runId).reduce((n, r) => n + modelCalls(r), 0),
  };
}

/** Pass, fail and not applicable for each of the five checks at one level. */
function checkTallies(evals: TraceEval[], level: TraceEval['level']): Record<CheckName, CheckTally> {
  const out = Object.fromEntries(CHECKS.map((name) => [name, emptyTally()])) as Record<CheckName, CheckTally>;
  for (const e of evals) if (e.level === level) out[e.name][e.outcome] += 1;
  return out;
}

/** Pass, fail and not applicable over all checks at one level. */
export function levelTally(evals: TraceEval[], level: TraceEval['level']): CheckTally {
  const out = emptyTally();
  for (const e of evals) if (e.level === level) out[e.outcome] += 1;
  return out;
}

function toolCallCount(runId: number, tool: string): number {
  const row = COUNT_TOOL_CALLS.get(runId, tool) as { n: number };
  return row.n;
}
