// The FDE's account instructions: one current and at most one draft per account, plus the old ones.
// Text is never edited; a save inserts a new row.
import type { AccountInstructions } from '../../../shared/types';
import { db, now } from '../database/database';
import {
  INSERT_DRAFT, INSERT_FIRST_VERSION, MAKE_CURRENT, RETIRE_CURRENT, RETIRE_DRAFT, type Row, SELECT_ACCOUNT,
  SELECT_DRAFT_VERSION, SELECT_RUN_STATUS, SELECT_TEXTS, SELECT_VERSIONS, withLastRun,
} from './utils';

export class ConflictError extends Error {}

export function getInstructions(account: string): AccountInstructions {
  const rows = (SELECT_VERSIONS.all(account) as Row[]).map(withLastRun);
  const current = rows.find((r) => r.status === 'current');
  if (!current) throw new Error(`Unknown account ${account}`);
  const draft = rows.find((r) => r.status === 'draft') ?? null;
  return { account, current, draft, history: rows };
}

/** On first start every account in the golden set gets version 1, empty and current. */
export function ensureAccounts(accounts: string[]): void {
  for (const account of accounts) {
    if (!SELECT_ACCOUNT.get(account)) INSERT_FIRST_VERSION.run(account, now());
  }
}

type Texts = { reader_text: string; orchestrator_text: string };

export function saveDraft(account: string, texts: Texts): AccountInstructions {
  const latest = getInstructions(account).history[0];
  const readerText = texts.reader_text ?? '';
  const orchestratorText = texts.orchestrator_text ?? '';
  db.transaction(() => {
    RETIRE_DRAFT.run(account);
    INSERT_DRAFT.run(account, latest.version + 1, readerText, orchestratorText, now());
  })();
  return getInstructions(account);
}

/** Only a draft whose latest run finished and passed the gate can become current. */
export function makeCurrent(account: string): AccountInstructions {
  const { draft } = getInstructions(account);
  if (!draft) throw new ConflictError('There is no draft');
  const runStatus = draft.last_run && (SELECT_RUN_STATUS.get(draft.last_run.id) as { status: string }).status;
  if (runStatus !== 'finished' || draft.last_run?.gate !== 'pass') {
    throw new ConflictError("The draft's latest run has not passed");
  }
  db.transaction(() => {
    RETIRE_CURRENT.run(account);
    MAKE_CURRENT.run(draft.id);
  })();
  return getInstructions(account);
}

export function versionTexts(account: string, version: number): Texts {
  return SELECT_TEXTS.get(account, version) as Texts;
}

export function isDraft(account: string, version: number): boolean {
  return !!SELECT_DRAFT_VERSION.get(account, version);
}

/** The version a run of this account uses: the draft when asked and one exists, else the current one. */
export function versionToRun(account: string, useDraft: boolean): number {
  const { current, draft } = getInstructions(account);
  return useDraft && draft ? draft.version : current.version;
}
