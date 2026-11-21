// Pure helpers for the Record page: boundary eval rows, step order and labels, trace grouping.
import type {
  BoundaryDetails,
  GoldenRecord,
  RecordDetail,
  Step,
  ToolCallDetail,
} from '../../../shared/types';
import { CHECKS, formatAmount, formatText, label } from '../shared/format';

/** Matched invoice rows shown before "Show N more". */
const SHOWN_MATCHED = 3;

export interface BoundaryRow {
  key: string;
  value: string;
  expected: string;
  returned: string;
  result: string;
}

export function paymentRows(d: BoundaryDetails): BoundaryRow[] {
  return [
    {
      key: 'ref',
      value: 'Payment reference',
      expected: formatText(d.payment_reference.expected),
      returned: formatText(d.payment_reference.returned),
      result: label(d.payment_reference.result),
    },
    {
      key: 'amount',
      value: 'Payment amount',
      expected: formatAmount(d.payment_amount.expected),
      returned: formatAmount(d.payment_amount.returned),
      result: label(d.payment_amount.result),
    },
  ];
}

export function invoiceRows(d: BoundaryDetails): BoundaryRow[] {
  return d.invoices.map((inv, i) => ({
    key: `inv${i}`,
    value: inv.reference,
    expected: formatAmount(inv.expected),
    returned: formatAmount(inv.returned),
    result: label(inv.result),
  }));
}

/** How many invoice rows to hide: matched rows beyond the first few, cut from the end of the list. */
export function hiddenRowCount(rows: BoundaryRow[], showAll: boolean): number {
  if (showAll) return 0;
  const matched = rows.filter((r) => r.result === 'Matched').length;
  return Math.max(0, matched - SHOWN_MATCHED);
}

/** A step placed in the tree: top-level steps in sequence order, each followed by its reader's steps. */
export interface StepRow {
  step: Step;
  depth: number;
  number: string; // position in the tree: 1, 1.1, 2
}

export function orderSteps(steps: Step[]): StepRow[] {
  const bySeq = [...steps].sort((x, y) => x.sequence - y.sequence);
  const out: StepRow[] = [];
  const add = (parent: number | null, depth: number, prefix: string) => {
    bySeq
      .filter((s) => s.parent_step_id === parent)
      .forEach((s, i) => {
        const number = `${prefix}${i + 1}`;
        out.push({ step: s, depth, number });
        add(s.id, depth + 1, `${number}.`);
      });
  };
  add(null, 0, '');
  return out;
}

export function stepDetail(s: Step): string {
  if (s.kind === 'message') return 'text' in s.detail ? s.detail.text : '';
  if (s.kind === 'tool_call') {
    const d = s.detail as ToolCallDetail;
    return d.tool === 'read_section' ? `read_section(${d.input.section})` : `read_part(${d.input.part})`;
  }
  return '';
}

/** The answer step shows the record's answer in place of the step's own detail. */
export function stepJson(step: Step, answer: RecordDetail['answer']) {
  return { detail: step.kind === 'answer' && answer ? answer : step.detail, usage: step.usage };
}

export type TraceCheck = RecordDetail['trace'][number];

export const checkLabel = (name: string) => CHECKS.find((c) => c.name === name)?.label ?? name;

export function agentName(t: TraceCheck): string {
  return t.level === 'orchestrator' ? 'Orchestrator' : `Reader of ${t.part ?? 'none'}`;
}

/**
 * Rows the Agent cell spans so checks read grouped by agent: the first check of a group spans the
 * whole group, the rest span 0.
 */
export function agentRowSpan(trace: TraceCheck[], index: number): number {
  const agent = (i: number) => `${trace[i].level}|${trace[i].part}`;
  if (index > 0 && agent(index - 1) === agent(index)) return 0;
  let n = 1;
  while (index + n < trace.length && agent(index + n) === agent(index)) n += 1;
  return n;
}

/** The files the agent received; expected.json is the answer key, not a document. */
export function documentFiles(record: GoldenRecord) {
  return record.files.filter((f) => f.name !== 'expected.json');
}

export function documentName(fileName: string): string {
  return fileName.replace(/^arrival\//, '');
}

/** The records before and after this one in the run's order, for Previous and Next. */
export function neighbours(recordIds: string[], recordId: string) {
  const position = recordIds.indexOf(recordId);
  const previous = position > 0 ? recordIds[position - 1] : null;
  const next = position >= 0 && position < recordIds.length - 1 ? recordIds[position + 1] : null;
  return { position, previous, next };
}

/** How the document panel shows a file, by its extension. */
export function viewerKind(fileName: string): 'pdf' | 'image' | 'text' | 'table' | 'other' {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  if (extension === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg'].includes(extension)) return 'image';
  if (extension === 'csv') return 'table';
  if (['txt', 'html', 'htm'].includes(extension)) return 'text';
  return 'other'; // spreadsheets and Word files: the browser cannot show them
}

/** CSV text as rows of cells. Handles quoted cells with commas and doubled quotes. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}
