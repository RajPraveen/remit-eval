// The run's version (design, golden set, core fingerprint, instructions per account),
// and the SQL a run writes with.
import crypto from 'node:crypto';
import type { RunVersion } from '../../../shared/types';
import { versionToRun } from '../account-instructions/account-instructions';
import { db } from '../database/database';
import { loadGoldenSet, recordsInScope } from '../golden-set/golden-set';
import { loadDesign, readPrompt } from '../remittance-agent/design';
import { READ_PART_TOOL, READ_SECTION_TOOL } from '../remittance-agent/utils';

export const SELECT_RUNNING_RUN = db.prepare("SELECT 1 FROM runs WHERE status = 'running'");
export const SELECT_RUN_STATUS = db.prepare('SELECT status FROM runs WHERE id = ?');
export const INSERT_RUN = db.prepare(
  'INSERT INTO runs (scope, note, started_by, started_at, finished_at, status, error, version) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
);
export const FINISH_RUN = db.prepare("UPDATE runs SET status = 'finished', finished_at = ? WHERE id = ?");
export const FAIL_RUN = db.prepare(
  "UPDATE runs SET status = 'failed', finished_at = ?, error = ? WHERE id = ?",
);
export const INSERT_RESULT = db.prepare(
  "INSERT INTO results (run_id, record_id, status) VALUES (?, ?, 'running')",
);
export const FINISH_RESULT = db.prepare(
  "UPDATE results SET status = 'finished', answer = ?, usage = ? WHERE id = ?",
);
export const RESULT_DID_NOT_FINISH = db.prepare(
  "UPDATE results SET status = 'did_not_finish', error = ? WHERE id = ?",
);

/** Everything the run's answers depend on, so two runs can be compared field by field. */
export function buildVersion(scope: string, useDraft: boolean): RunVersion {
  const accounts = [...new Set(recordsInScope(scope).map((r) => r.account))];
  return {
    ...loadDesign(),
    golden_set: loadGoldenSet().version,
    core: coreFingerprint(),
    instructions: Object.fromEntries(accounts.map((a) => [a, versionToRun(a, useDraft)])),
  };
}

// A short hash of the core prompts and tool definitions: they are not in design.json, but changing
// them changes the agent, so the version has to show it.
function coreFingerprint(): string {
  const tools = JSON.stringify([READ_PART_TOOL, READ_SECTION_TOOL]);
  const text = readPrompt('orchestrator') + readPrompt('reader') + tools;
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 4);
}
