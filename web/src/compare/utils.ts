// Row builders for the Compare page: each row is one value with the baseline and the run side by side.
import type { BoundaryTotals, TraceTotals } from '../../../shared/types';
import { BOUNDARY_ROWS, CHECKS, formatChecks, formatTally } from '../shared/format';

export interface SideBySideRow {
  key: string;
  value: string;
  base: string;
  run: string;
}

export function boundaryRows(base: BoundaryTotals, run: BoundaryTotals): SideBySideRow[] {
  return BOUNDARY_ROWS.map((r) => ({
    key: r.key,
    value: r.label,
    base: formatTally(base[r.key]),
    run: formatTally(run[r.key]),
  }));
}

/** Orchestrator checks, then reader checks, then the call counts. */
export function traceRows(base: TraceTotals, run: TraceTotals): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  for (const level of ['orchestrator', 'reader'] as const) {
    for (const c of CHECKS) {
      // The reader has no grounding or self-check.
      if (level === 'reader' && (c.name === 'grounding' || c.name === 'self_check')) continue;
      rows.push({
        key: `${level}.${c.name}`,
        value: `${level === 'orchestrator' ? 'Orchestrator' : 'Reader'}, ${c.label}`,
        base: formatChecks(base[level][c.name]),
        run: formatChecks(run[level][c.name]),
      });
    }
  }
  rows.push(countRow('read_part_calls', 'read_part calls', base.read_part_calls, run.read_part_calls));
  rows.push(
    countRow('read_section_calls', 'read_section calls', base.read_section_calls, run.read_section_calls),
  );
  rows.push(countRow('model_calls', 'Model calls', base.model_calls, run.model_calls));
  return rows;
}

function countRow(key: string, value: string, base: number, run: number): SideBySideRow {
  return { key, value, base: String(base), run: String(run) };
}
