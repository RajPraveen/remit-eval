// Small helpers for the trace eval checks, and loading a result's recorded steps.
import type { CheckName, CheckOutcome, Step, ToolCallDetail } from '../../../shared/types';
import { db, fromJson } from '../database/database';

export interface Check {
  level: 'orchestrator' | 'reader';
  step_id: number | null;
  name: CheckName;
  outcome: CheckOutcome;
  details: Record<string, unknown> & { summary: string };
}

const SELECT_STEPS = db.prepare('SELECT * FROM steps WHERE result_id = ? ORDER BY sequence');

/** A result's steps in the order they started, with their JSON columns parsed. */
export function loadSteps(resultId: number): Step[] {
  const rows = SELECT_STEPS.all(resultId) as any[];
  return rows.map((r) => ({ ...r, detail: fromJson(r.detail), usage: fromJson(r.usage) }));
}

export const toolDetail = (step: Step) => step.detail as ToolCallDetail;

export const isTool = (step: Step, tool: ToolCallDetail['tool']) =>
  step.kind === 'tool_call' && toolDetail(step).tool === tool;

export const passIf = (ok: boolean): CheckOutcome => (ok ? 'pass' : 'fail');

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

/** The keys that appear more than twice. */
export function readMoreThanTwice<T>(items: T[], key: (item: T) => string): string[] {
  const counts = countBy(items, key);
  return [...counts].filter(([, n]) => n > 2).map(([k]) => k);
}
