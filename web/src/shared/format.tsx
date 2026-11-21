// How values, labels and status tags read on every page.
import { Tag } from 'antd';
import type { BoundaryTotals, CheckName, CheckTally, RunSummary, Scope, Tally } from '../../../shared/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatTime(iso: string | null): string {
  if (!iso) return 'none';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatAmount(n: number | null | undefined): string {
  if (n === null || n === undefined) return 'none';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatText(s: string | null | undefined): string {
  return s === null || s === undefined || s === '' ? 'none' : s;
}

export function shortModel(id: string): string {
  return id.replace(/^anthropic\//, '');
}

export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return 'none';
  if (typeof v === 'string') return shortModel(v);
  if (Array.isArray(v)) return v.length ? v.map(formatValue).join(', ') : 'none';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function formatTally(t: Tally | null | undefined): string {
  return t ? `${t.n} of ${t.of}` : 'none';
}

export function formatChecks(t: CheckTally): string {
  const of = t.pass + t.fail;
  return of === 0 ? 'Not applicable' : `${t.pass} of ${of}`;
}

export function formatScope(scope: Scope): string {
  return scope === 'all' ? 'All records' : scope;
}

export const CHECKS: { name: CheckName; label: string }[] = [
  { name: 'grounding', label: 'Grounding' },
  { name: 'diligence', label: 'Diligence' },
  { name: 'self_check', label: 'Self-check' },
  { name: 'limits', label: 'Limits' },
  { name: 'effort', label: 'Effort' },
];

// Boundary eval totals, in the order the Run and Compare pages show them.
export const BOUNDARY_ROWS: { key: keyof BoundaryTotals; label: string }[] = [
  { key: 'records_right', label: 'Records right' },
  { key: 'payment_reference_right', label: 'Payment reference right' },
  { key: 'payment_amount_right', label: 'Payment amount right' },
  { key: 'rows_found', label: 'Invoice rows found' },
  { key: 'rows_correct', label: 'Invoice rows correct' },
];

const GREEN = new Set(['Pass', 'Right', 'Matched', 'Match', 'OK', 'Current']);
const RED = new Set([
  'Fail',
  'Wrong',
  'Missing',
  'Extra',
  'Wrong amount',
  'Refused',
  'Failed',
  'Mismatch',
  'Did not finish',
  'Flagged',
]);
const BLUE = new Set(['Running', 'Draft']);

export function StatusTag({ label }: { label: string }) {
  return <Tag color={tagColor(label)}>{label}</Tag>;
}

function tagColor(label: string): string | undefined {
  if (GREEN.has(label)) return 'green';
  if (RED.has(label)) return 'red';
  if (BLUE.has(label)) return 'blue';
  return undefined;
}

const LABELS: Record<string, string> = {
  pass: 'Pass',
  fail: 'Fail',
  not_applicable: 'Not applicable',
  right: 'Right',
  wrong: 'Wrong',
  match: 'Matched',
  mismatch: 'Mismatch',
  matched: 'Matched',
  missing: 'Missing',
  extra: 'Extra',
  wrong_amount: 'Wrong amount',
  ok: 'OK',
  refused: 'Refused',
  failed: 'Failed',
  running: 'Running',
  finished: 'Finished',
  did_not_finish: 'Did not finish',
  draft: 'Draft',
  current: 'Current',
  old: 'Old',
  page: 'Page',
  command: 'Command',
  message: 'Message',
  tool_call: 'Tool call',
  answer: 'Answer',
};

export const label = (v: string) => LABELS[v] ?? v;

// A running or failed run shows that state instead of its gate.
function mainRunTag(run: RunSummary): string | null {
  if (run.status === 'running') return 'Running';
  if (run.status === 'failed') return 'Failed';
  return run.gate ? label(run.gate) : null;
}

export function RunGateTags({ run }: { run: RunSummary }) {
  const main = mainRunTag(run);
  return (
    <>
      {main && <StatusTag label={main} />}
      {run.is_baseline && <StatusTag label="Baseline" />}
      {run.is_draft_run && <StatusTag label="Draft" />}
    </>
  );
}
