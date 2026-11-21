// The gate: did the run get worse than the baseline? Finds the scope's baseline, lists what changed
// record by record, and fails the run if anything got worse.
import type { ChangedRecord } from '../../../shared/types';
import { db } from '../database/database';
import { getRecord } from '../golden-set/golden-set';
import { runRow, runVersion, type RunRow } from '../run-views/utils';
import { isDraftRun, isWorse, type RecordOutcome, recordOutcomes } from './utils';

const SELECT_FINISHED_RUNS = db.prepare(
  "SELECT * FROM runs WHERE scope = ? AND status = 'finished' ORDER BY id DESC",
);
const SAVE_GATE = db.prepare('UPDATE runs SET compared_to = ?, gate = ? WHERE id = ?');

/** Without a baseline there is nothing to get worse than, so the run passes. */
export function decideGate(runId: number): void {
  const row = runRow(runId);
  const base = baselineOf(row.scope, runId);
  const gate = base && changedRecords(base.id, runId).some((c) => c.worse) ? 'fail' : 'pass';
  SAVE_GATE.run(base?.id ?? null, gate, runId);
}

/**
 * Newest finished run of the scope (other than `excludeId`) that passed or was overridden,
 * on no current draft.
 */
export function baselineOf(scope: string, excludeId: number | null = null): RunRow | null {
  const rows = SELECT_FINISHED_RUNS.all(scope) as RunRow[];
  const accepted = (r: RunRow) => r.gate === 'pass' || r.overridden_at;
  return rows.find((r) => r.id !== excludeId && accepted(r) && !isDraftRun(runVersion(r))) ?? null;
}

/** Every facet of a record whose words differ between the baseline and the run. */
export function changedRecords(baseId: number, runId: number): ChangedRecord[] {
  const base = recordOutcomes(baseId);
  const run = recordOutcomes(runId);
  const changes: ChangedRecord[] = [];
  for (const [recordId, after] of run) {
    const before = base.get(recordId);
    if (!before) continue;
    const kind = getRecord(recordId).kind;
    changes.push(...changedFacets(before, after).map((change) => ({ record_id: recordId, kind, ...change })));
  }
  return changes;
}

type FacetChange = Omit<ChangedRecord, 'record_id' | 'kind'>;

function changedFacets(before: RecordOutcome, after: RecordOutcome): FacetChange[] {
  const changes: FacetChange[] = [];
  for (const [key, a] of after.facets) {
    const b = before.facets.get(key);
    // A record that finished in the baseline and did not finish now is worse even if the words match.
    const stoppedFinishing =
      key === 'boundary' && before.status === 'finished' && after.status === 'did_not_finish';
    if (b && b.phrase === a.phrase && !stoppedFinishing) continue;
    if (!b && a.value === 'not_applicable') continue;
    const worse = stoppedFinishing || (!!b && isWorse(b.value, a.value));
    changes.push({ what: a.what, base: b?.phrase ?? 'Not applicable', run: a.phrase, worse });
  }
  for (const [key, b] of before.facets) {
    if (after.facets.has(key) || b.value === 'not_applicable') continue;
    changes.push({ what: b.what, base: b.phrase, run: 'Not applicable', worse: false });
  }
  return changes;
}
