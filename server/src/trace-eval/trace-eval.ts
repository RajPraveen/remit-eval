// Trace eval: did the agent work properly? Five checks on the recorded steps and the answer, for the
// orchestrator and for each reader: grounding, diligence, self-check, limits, effort.
// Plain code, no model calls.
import type { Answer, PartInfo, ReadOutput, Step } from '../../../shared/types';
import { db, toJson } from '../database/database';
import { cents, sameAmount, sameReference, sameRow } from '../boundary-eval/utils';
import { type Check, isTool, loadSteps, passIf, plural, readMoreThanTwice, toolDetail } from './utils';

const INSERT_TRACE_EVAL = db.prepare(
  'INSERT INTO trace_evals (result_id, level, step_id, name, outcome, details) VALUES (?, ?, ?, ?, ?, ?)',
);

export function writeTraceEval(resultId: number, answer: Answer | null, parts: PartInfo[]): void {
  const checks = traceChecks(answer, loadSteps(resultId), parts);
  for (const { level, step_id, name, outcome, details } of checks) {
    INSERT_TRACE_EVAL.run(resultId, level, step_id, name, outcome, toJson(details));
  }
}

/**
 * The orchestrator's five checks, then diligence, limits and effort for each reader that finished.
 * Grounding and self-check look at the final answer, so only the orchestrator has them.
 */
export function traceChecks(answer: Answer | null, steps: Step[], parts: PartInfo[]): Check[] {
  const readParts = steps.filter((s) => s.parent_step_id === null && isTool(s, 'read_part'));
  const finishedReads = readParts.filter((s) => s.outcome === 'ok');
  return [
    grounding(answer, readParts),
    orchestratorDiligence(answer, readParts, parts),
    selfCheck(answer),
    limits('orchestrator', null, readParts, 'read_part'),
    orchestratorEffort(readParts, parts),
    ...finishedReads.flatMap((s) => readerChecks(s, steps, parts)),
  ];
}

// Orchestrator

/** Every value in the answer must appear in the output of some part that was read. */
function grounding(answer: Answer | null, readParts: Step[]): Check {
  const check = { level: 'orchestrator' as const, step_id: null, name: 'grounding' as const };
  if (!answer) return { ...check, outcome: 'not_applicable', details: { summary: 'No answer' } };
  const outputs = readParts.filter((s) => s.outcome === 'ok').map((s) => toolDetail(s).output as ReadOutput);
  const ungrounded = ungroundedValues(answer, outputs);
  const summary = ungrounded.length
    ? `Not found in any part read: ${ungrounded.join(', ')}`
    : 'Every value came from a part that was read';
  return { ...check, outcome: passIf(!ungrounded.length), details: { summary, ungrounded } };
}

function ungroundedValues(answer: Answer, outputs: ReadOutput[]): string[] {
  const ungrounded: string[] = [];
  const reference = answer.payment_reference;
  const amount = answer.payment_amount;
  const readsReference = (o: ReadOutput) =>
    o.payment_reference !== null && sameReference(o.payment_reference, reference);
  const readsAmount = (o: ReadOutput) => o.payment_amount !== null && sameAmount(o.payment_amount, amount);
  const referenceRead = outputs.some(readsReference);
  const amountRead = outputs.some(readsAmount);
  if (reference !== null && !referenceRead) ungrounded.push(`payment reference ${reference}`);
  if (amount !== null && !amountRead) ungrounded.push(`payment amount ${amount}`);
  for (const row of answer.invoices) {
    const rowRead = outputs.some((o) => o.invoices.some((r) => sameRow(r, row)));
    if (!rowRead) ungrounded.push(`invoice ${row.reference} ${row.amount}`);
  }
  return ungrounded;
}

/** Every part was read or skipped with a reason. */
function orchestratorDiligence(answer: Answer | null, readParts: Step[], parts: PartInfo[]): Check {
  const read = new Set(readParts.filter((s) => s.outcome === 'ok').map((s) => toolDetail(s).input.part));
  const skipped = new Set((answer?.skipped_parts ?? []).map((s) => s.part));
  const unaccounted = parts.map((p) => p.name).filter((name) => !read.has(name) && !skipped.has(name));
  const partCount = plural(parts.length, 'part');
  let summary = `All ${partCount} read`;
  if (skipped.size) summary = `${read.size} of ${partCount} read, the rest skipped with a reason`;
  if (unaccounted.length) summary = `Neither read nor skipped: ${unaccounted.join(', ')}`;
  const outcome = passIf(!unaccounted.length);
  return { level: 'orchestrator', step_id: null, name: 'diligence', outcome, details: { summary, unaccounted } };
}

/** The invoices add up to the payment amount, or the answer flags that they do not. */
function selfCheck(answer: Answer | null): Check {
  const check = { level: 'orchestrator' as const, step_id: null, name: 'self_check' as const };
  if (!answer || answer.payment_amount === null) {
    const summary = answer ? 'No payment amount stated' : 'No answer';
    return { ...check, outcome: 'not_applicable', details: { summary } };
  }
  const total = answer.invoices.reduce((sum, row) => sum + cents(row.amount), 0) / 100;
  const addsUp = cents(total) === cents(answer.payment_amount);
  const flagged = answer.concerns.some((c) => c.about === 'does_not_add_up');
  const flagWords = flagged ? 'flagged' : 'not flagged';
  let summary = `Invoices add up to ${total}, not ${answer.payment_amount}; ${flagWords}`;
  if (addsUp) summary = `Invoices add up to ${answer.payment_amount}`;
  const details = { summary, invoice_total: total, payment_amount: answer.payment_amount };
  return { ...check, outcome: passIf(addsUp || flagged), details };
}

/** No part was read more than twice. */
function orchestratorEffort(readParts: Step[], parts: PartInfo[]): Check {
  const overRead = readMoreThanTwice(readParts, (s) => toolDetail(s).input.part);
  const summary = overRead.length
    ? `Read more than twice: ${overRead.join(', ')}`
    : `${plural(readParts.length, 'read_part call')} for ${plural(parts.length, 'part')}`;
  const details = { summary, read_part_calls: readParts.length, parts: parts.length };
  return { level: 'orchestrator', step_id: null, name: 'effort', outcome: passIf(!overRead.length), details };
}

// Both levels

/** No tool call was refused (a part or section that does not exist). */
function limits(level: Check['level'], stepId: number | null, calls: Step[], what: string): Check {
  const refused = calls.filter((s) => s.outcome === 'refused').length;
  const summary = refused
    ? `${refused} ${what} call${refused === 1 ? ' was' : 's were'} refused`
    : `No ${what} call was refused`;
  return { level, step_id: stepId, name: 'limits', outcome: passIf(!refused), details: { summary, refused } };
}

// Reader

/** Diligence, limits and effort for the reader started by one read_part step. */
function readerChecks(readPart: Step, steps: Step[], parts: PartInfo[]): Check[] {
  const children = steps.filter((s) => s.parent_step_id === readPart.id);
  if (!children.length) return readerHadNoTools(readPart.id);
  const partName = toolDetail(readPart).input.part;
  const sectionCalls = children.filter((s) => isTool(s, 'read_section'));
  const sectionsTotal = parts.find((p) => p.name === partName)?.sections ?? 0;
  return [
    readerDiligence(readPart.id, sectionCalls, sectionsTotal),
    limits('reader', readPart.id, sectionCalls, 'read_section'),
    readerEffort(readPart.id, sectionCalls, sectionsTotal),
  ];
}

// A reader reading the whole part in one call records no steps, so its checks do not apply.
function readerHadNoTools(stepId: number): Check[] {
  const names = ['diligence', 'limits', 'effort'] as const;
  const details = { summary: 'The reader had no tools' };
  return names.map((name) => ({
    level: 'reader',
    step_id: stepId,
    name,
    outcome: 'not_applicable',
    details,
  }));
}

/** Every section of the part was read. */
function readerDiligence(stepId: number, sectionCalls: Step[], sectionsTotal: number): Check {
  const okCalls = sectionCalls.filter((s) => s.outcome === 'ok');
  const read = new Set(okCalls.map((s) => toolDetail(s).input.section));
  const unread = Array.from({ length: sectionsTotal }, (_, i) => i + 1).filter((n) => !read.has(n));
  const summary = unread.length
    ? `Sections not read: ${unread.join(', ')}`
    : `All ${plural(sectionsTotal, 'section')} read`;
  const outcome = passIf(!unread.length);
  return { level: 'reader', step_id: stepId, name: 'diligence', outcome, details: { summary, unread } };
}

/** No section was read more than twice. */
function readerEffort(stepId: number, sectionCalls: Step[], sectionsTotal: number): Check {
  const okCalls = sectionCalls.filter((s) => s.outcome === 'ok');
  const overRead = readMoreThanTwice(okCalls, (s) => String(toolDetail(s).input.section)).map(Number);
  const summary = overRead.length
    ? `Sections read more than twice: ${overRead.join(', ')}`
    : `${plural(sectionCalls.length, 'read_section call')} for ${plural(sectionsTotal, 'section')}`;
  const details = { summary, read_section_calls: sectionCalls.length, sections: sectionsTotal };
  return { level: 'reader', step_id: stepId, name: 'effort', outcome: passIf(!overRead.length), details };
}
