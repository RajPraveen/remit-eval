// What the pages read: the runs list, one run with its records, and one record with its steps and evals.
// Read-only; totals, progress and labels are worked out here when asked for.
import type {
  Answer, BoundaryEval, RecordDetail, RunDetail, RunRecordRow, RunSummary, Usage,
} from '../../../shared/types';
import { fromJson } from '../database/database';
import { baselineOf } from '../gate/gate';
import { diffVersions, isDraftRun } from '../gate/utils';
import { listParts } from '../golden-set/documents';
import { getExpected, getRecord, recordsInScope } from '../golden-set/golden-set';
import { loadSteps } from '../trace-eval/utils';
import {
  boundaryEvals, boundaryTotals, levelTally, modelCalls, type ResultRow, runResults, type RunRow, runRow,
  runVersion, SELECT_RESULT, SELECT_RUNS_NEWEST_FIRST, tally, traceEvals, traceTotals, type TraceEvalWithPart,
} from './utils';

export function listRuns(): RunSummary[] {
  const rows = SELECT_RUNS_NEWEST_FIRST.all() as RunRow[];
  return rows.map(runSummary);
}

export function runDetail(id: number): RunDetail {
  const row = runRow(id);
  const boundary = boundaryEvals(id);
  const evals = traceEvals(id);
  const records = runResults(id).map((result) => recordRow(result, boundary.get(result.id), evals));
  return { ...runSummary(row), boundary: boundaryTotals(id), trace: traceTotals(id), records };
}

export async function recordDetail(runId: number, recordId: string): Promise<RecordDetail> {
  const result = SELECT_RESULT.get(runId, recordId) as ResultRow | undefined;
  if (!result) throw new Error(`Run ${runId} has no result for ${recordId}`);
  const steps = loadSteps(result.id);
  return {
    run_id: runId,
    record: getRecord(recordId),
    parts: await listParts(recordId),
    status: result.status,
    error: result.error,
    answer: fromJson<Answer>(result.answer),
    usage: fromJson<Usage>(result.usage),
    expected: getExpected(recordId),
    boundary: boundaryEvals(runId).get(result.id) ?? null,
    trace: traceEvals(runId).filter((e) => e.result_id === result.id),
    steps,
  };
}

/** A run as the runs list shows it. Also the top of the run page and of the compare page. */
export function runSummary(row: RunRow): RunSummary {
  const version = runVersion(row);
  const results = runResults(row.id);
  const done = results.filter((r) => r.status !== 'running').length;
  const right = [...boundaryEvals(row.id).values()].filter((b) => b.verdict === 'right').length;
  // A run that failed before it started any record has nothing to make progress on.
  const total = row.status === 'failed' && !results.length ? 0 : recordsInScope(row.scope).length;
  return {
    ...row,
    version,
    is_baseline: baselineOf(row.scope)?.id === row.id,
    is_draft_run: isDraftRun(version),
    progress: tally(done, total),
    records_right: row.status === 'running' ? null : tally(right, results.length),
    changed: row.compared_to ? diffVersions(runVersion(runRow(row.compared_to)), version) : [],
  };
}

/** One record's line on the run page. */
function recordRow(
  result: ResultRow, boundary: BoundaryEval | undefined, evals: TraceEvalWithPart[],
): RunRecordRow {
  const record = getRecord(result.record_id);
  const own = evals.filter((e) => e.result_id === result.id);
  return {
    record_id: result.record_id,
    kind: record.kind,
    account: record.account,
    status: result.status,
    verdict: boundary?.verdict ?? null,
    flagged: boundary?.flagged ?? null,
    orchestrator: levelTally(own, 'orchestrator'),
    reader: levelTally(own, 'reader'),
    model_calls: modelCalls(result),
  };
}
