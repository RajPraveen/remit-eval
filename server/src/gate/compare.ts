// The compare page: two runs side by side, what differed in their versions, their totals, and what changed.
import type { Comparison } from '../../../shared/types';
import { runSummary } from '../run-views/run-views';
import { boundaryTotals, runRow, runVersion, traceTotals } from '../run-views/utils';
import { changedRecords } from './gate';
import { diffVersions } from './utils';

export function compare(baseId: number, runId: number): Comparison {
  const changes = changedRecords(baseId, runId);
  const rows = { base: runRow(baseId), run: runRow(runId) };
  return {
    base: runSummary(rows.base),
    run: runSummary(rows.run),
    differed: diffVersions(runVersion(rows.base), runVersion(rows.run)),
    boundary: { base: boundaryTotals(baseId), run: boundaryTotals(runId) },
    trace: { base: traceTotals(baseId), run: traceTotals(runId) },
    changed_records: changes,
    gate: changes.some((c) => c.worse) ? 'fail' : 'pass',
  };
}
