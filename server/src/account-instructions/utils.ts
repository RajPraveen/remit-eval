// The account_instructions row and the SQL statements the FDE's texts are read and written with.
import type { InstructionsVersion, RunVersion } from '../../../shared/types';
import { db, fromJson } from '../database/database';

export interface Row {
  id: number;
  account: string;
  version: number;
  reader_text: string;
  orchestrator_text: string;
  status: InstructionsVersion['status'];
  created_at: string;
}

interface RunGateRow {
  id: number;
  gate: 'pass' | 'fail' | null;
  version: string;
}

export const SELECT_ACCOUNT = db.prepare('SELECT 1 FROM account_instructions WHERE account = ?');
export const INSERT_FIRST_VERSION = db.prepare(
  "INSERT INTO account_instructions (account, version, reader_text, orchestrator_text, status, created_at) " +
    "VALUES (?, 1, '', '', 'current', ?)",
);
export const INSERT_DRAFT = db.prepare(
  'INSERT INTO account_instructions (account, version, reader_text, orchestrator_text, status, created_at) ' +
    "VALUES (?, ?, ?, ?, 'draft', ?)",
);
export const SELECT_VERSIONS = db.prepare(
  'SELECT * FROM account_instructions WHERE account = ? ORDER BY version DESC',
);
export const SELECT_TEXTS = db.prepare(
  'SELECT reader_text, orchestrator_text FROM account_instructions WHERE account = ? AND version = ?',
);
export const SELECT_DRAFT_VERSION = db.prepare(
  "SELECT 1 FROM account_instructions WHERE account = ? AND version = ? AND status = 'draft'",
);
export const RETIRE_DRAFT = db.prepare(
  "UPDATE account_instructions SET status = 'old' WHERE account = ? AND status = 'draft'",
);
export const RETIRE_CURRENT = db.prepare(
  "UPDATE account_instructions SET status = 'old' WHERE account = ? AND status = 'current'",
);
export const MAKE_CURRENT = db.prepare("UPDATE account_instructions SET status = 'current' WHERE id = ?");
export const SELECT_RUN_STATUS = db.prepare('SELECT status FROM runs WHERE id = ?');
const SELECT_RUNS_NEWEST_FIRST = db.prepare('SELECT id, gate, version FROM runs ORDER BY id DESC');

/** The newest run that used this account's version. */
export function lastRun(account: string, version: number): InstructionsVersion['last_run'] {
  const runs = SELECT_RUNS_NEWEST_FIRST.all() as RunGateRow[];
  const run = runs.find((r) => fromJson<RunVersion>(r.version)?.instructions?.[account] === version);
  return run ? { id: run.id, gate: run.gate } : null;
}

export function withLastRun(row: Row): InstructionsVersion {
  return { ...row, last_run: lastRun(row.account, row.version) };
}
