// Row builders for the Run page's boundary eval and trace eval cards.
import type { BoundaryTotals, TraceTotals } from '../../../shared/types';
import { BOUNDARY_ROWS, CHECKS, formatChecks, formatTally } from '../shared/format';

export function boundaryItems(boundary: BoundaryTotals) {
  return BOUNDARY_ROWS.map((b) => ({ key: b.key, label: b.label, children: formatTally(boundary[b.key]) }));
}

/** One row per check with the orchestrator and reader tallies side by side. */
export function traceRows(trace: TraceTotals) {
  return CHECKS.map((c) => {
    let orchestrator = formatChecks(trace.orchestrator[c.name]);
    // The reader has no grounding or self-check; its cell stays empty.
    let reader = c.name === 'grounding' || c.name === 'self_check' ? '' : formatChecks(trace.reader[c.name]);
    if (c.name === 'effort') {
      orchestrator += `, ${trace.read_part_calls} read_part calls`;
      reader += `, ${trace.read_section_calls} read_section calls`;
    }
    return { key: c.name, check: c.label, orchestrator, reader };
  });
}
