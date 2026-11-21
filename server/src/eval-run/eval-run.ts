// Runs the golden set: starts a run, runs the agent on each record, evaluates each answer
// (boundary eval and trace eval), then decides the gate.
import type { Answer, RunVersion, StartRunRequest } from '../../../shared/types';
import { ConflictError, versionTexts } from '../account-instructions/account-instructions';
import { writeBoundaryEval } from '../boundary-eval/boundary-eval';
import { now, toJson } from '../database/database';
import { decideGate } from '../gate/gate';
import { listParts } from '../golden-set/documents';
import { getExpected, recordsInScope, verifyFiles } from '../golden-set/golden-set';
import { runRecord } from '../remittance-agent/orchestrator';
import { writeTraceEval } from '../trace-eval/trace-eval';
import {
  buildVersion, FAIL_RUN, FINISH_RESULT, FINISH_RUN, INSERT_RESULT, INSERT_RUN, RESULT_DID_NOT_FINISH,
  SELECT_RUN_STATUS, SELECT_RUNNING_RUN,
} from './utils';

export interface StartRunInput extends StartRunRequest {
  started_by: 'page' | 'command';
}

/** Inserts the run and returns its id; the records are run in the background. */
export function startRun(input: StartRunInput): number {
  if (SELECT_RUNNING_RUN.get()) throw new ConflictError('A run is already running');
  const version = buildVersion(input.scope, !!input.use_draft);
  const versionJson = toJson(version);
  const { scope, started_by: startedBy } = input;
  const note = input.note ?? null;
  // A changed golden file would make the run meaningless, so the run is recorded as failed straight away.
  const mismatch = verifyFiles();
  if (mismatch) {
    const failed = INSERT_RUN.run(scope, note, startedBy, now(), now(), 'failed', mismatch, versionJson);
    return Number(failed.lastInsertRowid);
  }
  const started = INSERT_RUN.run(scope, note, startedBy, now(), null, 'running', null, versionJson);
  const runId = Number(started.lastInsertRowid);
  void driveRun(runId, scope, version);
  return runId;
}

async function driveRun(runId: number, scope: string, version: RunVersion): Promise<void> {
  try {
    for (const record of recordsInScope(scope)) await runOneRecord(runId, record.id, record.account, version);
    decideGate(runId);
    FINISH_RUN.run(now(), runId);
  } catch (error) {
    FAIL_RUN.run(now(), (error as Error).message, runId);
  }
}

/** A record that does not finish is still evaluated, with no answer. */
async function runOneRecord(
  runId: number, recordId: string, account: string, version: RunVersion,
): Promise<void> {
  const resultId = Number(INSERT_RESULT.run(runId, recordId).lastInsertRowid);
  let answer: Answer | null = null;
  try {
    const instructions = versionTexts(account, version.instructions[account]);
    const outcome = await runRecord({ recordId, resultId, design: version, instructions });
    answer = outcome.answer;
    FINISH_RESULT.run(toJson(outcome.answer), toJson(outcome.usage), resultId);
  } catch (error) {
    RESULT_DID_NOT_FINISH.run((error as Error).message, resultId);
  }
  const expected = getExpected(recordId);
  const parts = await listParts(recordId);
  writeBoundaryEval(resultId, expected, answer);
  writeTraceEval(resultId, answer, parts);
}

export function runStatus(runId: number): string {
  const row = SELECT_RUN_STATUS.get(runId) as { status: string };
  return row.status;
}
