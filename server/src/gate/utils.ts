// What changed in the version between two runs, and each record's outcome in words,
// so two runs can be lined up.
import type {
  BoundaryDetails, CheckName, CheckOutcome, RunVersion, VersionDiff,
} from '../../../shared/types';
import { isDraft } from '../account-instructions/account-instructions';
import { boundaryEvals, runResults, traceEvals, type TraceEvalWithPart } from '../run-views/utils';

const CHECK_LABELS: Record<CheckName, string> = {
  grounding: 'Grounding', diligence: 'Diligence', self_check: 'Self-check', limits: 'Limits', effort: 'Effort',
};
const OUTCOME_LABELS: Record<CheckOutcome, string> = {
  pass: 'Pass', fail: 'Fail', not_applicable: 'Not applicable',
};

/** One line of a record's outcome: the boundary eval, or one trace eval check. */
export interface Facet {
  what: string;
  phrase: string;
  value: string; // right/wrong/did_not_finish or pass/fail/not_applicable
}

export interface RecordOutcome {
  status: string;
  facets: Map<string, Facet>;
}

// Version

/** True when the run used an account's draft that is still a draft. */
export function isDraftRun(version: RunVersion): boolean {
  return Object.entries(version.instructions).some(([account, v]) => isDraft(account, v));
}

/** Every field of the version (dotted path) whose value differs. */
export function diffVersions(before: RunVersion, after: RunVersion): VersionDiff[] {
  const a = new Map<string, unknown>();
  const b = new Map<string, unknown>();
  flatten(before, '', a);
  flatten(after, '', b);
  const paths = [...new Set([...a.keys(), ...b.keys()])];
  return paths
    .filter((path) => JSON.stringify(a.get(path)) !== JSON.stringify(b.get(path)))
    .map((path) => ({ path, before: a.get(path) ?? null, after: b.get(path) ?? null }));
}

function flatten(value: unknown, prefix: string, out: Map<string, unknown>): void {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, inner] of Object.entries(value)) flatten(inner, prefix ? `${prefix}.${key}` : key, out);
  } else out.set(prefix, value);
}

// Record outcomes

export const isWorse = (before: string, after: string) =>
  (before === 'right' && after === 'wrong') || (before === 'pass' && after === 'fail');

/** Per record: its status, and one facet for the boundary eval plus one per trace eval check. */
export function recordOutcomes(runId: number): Map<string, RecordOutcome> {
  const boundary = boundaryEvals(runId);
  const evals = traceEvals(runId);
  const out = new Map<string, RecordOutcome>();
  for (const result of runResults(runId)) {
    const facets = new Map<string, Facet>();
    const b = boundary.get(result.id);
    facets.set('boundary', {
      what: 'Boundary',
      phrase: boundaryPhrase(result.status, b?.verdict, b?.details),
      value: result.status === 'did_not_finish' ? 'wrong' : (b?.verdict ?? 'wrong'),
    });
    for (const check of evals.filter((t) => t.result_id === result.id)) {
      facets.set(checkKey(check), checkFacet(check));
    }
    out.set(result.record_id, { status: result.status, facets });
  }
  return out;
}

// The key lines a check up across runs: the same check, at the same level, on the same part.
const checkKey = (check: TraceEvalWithPart) => `${check.level}|${check.part ?? ''}|${check.name}`;

function checkFacet(check: TraceEvalWithPart): Facet {
  const agent = check.level === 'orchestrator' ? 'Orchestrator' : `Reader of ${check.part}`;
  let phrase = OUTCOME_LABELS[check.outcome];
  if (check.outcome === 'fail') phrase = `Fail: ${check.details.summary}`;
  return { what: `${agent}, ${CHECK_LABELS[check.name]}`, phrase, value: check.outcome };
}

function boundaryPhrase(
  status: string, verdict: string | undefined, details: BoundaryDetails | undefined,
): string {
  if (status === 'did_not_finish') return 'Did not finish';
  if (!details || verdict === 'right') return 'Right';
  const parts: string[] = [];
  if (details.payment_reference.result === 'mismatch') parts.push('payment reference wrong');
  if (details.payment_amount.result === 'mismatch') parts.push('payment amount wrong');
  const { missing, extra, wrong_amount } = details.counts;
  const rows = (n: number, what: string) => `${n} invoice row${n === 1 ? '' : 's'} ${what}`;
  if (missing) parts.push(rows(missing, 'missing'));
  if (wrong_amount) parts.push(rows(wrong_amount, 'with the wrong amount'));
  if (extra) parts.push(rows(extra, 'extra'));
  return ['Wrong', ...parts].join(', ');
}
