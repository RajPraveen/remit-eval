// Shared by the orchestrator and the reader: tool definitions and answer schemas, usage adding,
// step recording and reply parsing.
import type {
  Answer, Design, ReadOutput, StepDetail, StepKind, StepOutcome, Usage,
} from '../../../shared/types';
import { db, toJson } from '../database/database';
import { PAGES_PER_SECTION } from '../golden-set/documents';
import type { CallUsage, ChatMessage, ToolCall, ToolDefinition } from './model-client';

export interface RunRecordInput {
  recordId: string;
  resultId: number;
  design: Design;
  instructions: { reader_text: string; orchestrator_text: string };
}

/** Steps of one result share a running sequence number, in the order they start. */
export interface StepContext {
  resultId: number;
  sequence: { n: number };
}

// Tool definitions and schemas. Their text is part of the run's core fingerprint, so a change here shows
// up as a changed version.

export const READ_PART_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_part',
    description:
      'Reads one part of the remittance and returns the payment reference number, payment amount and invoice rows found in it.',
    parameters: {
      type: 'object',
      properties: { part: { type: 'string', description: 'The part name' } },
      required: ['part'],
      additionalProperties: false,
    },
  },
};

export const READ_SECTION_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_section',
    description:
      `Returns one section of the part. Sections are numbered from 1; a PDF section is up to ${PAGES_PER_SECTION} pages.`,
    parameters: {
      type: 'object',
      properties: { section: { type: 'number', description: 'The section number, from 1' } },
      required: ['section'],
      additionalProperties: false,
    },
  },
};

// Strict JSON schema object: every property required, nothing else allowed.
const objectOf = (properties: Record<string, object>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

const INVOICE_ROW = objectOf({ reference: { type: 'string' }, amount: { type: 'number' } });
const SKIPPED_PART = objectOf({ part: { type: 'string' }, reason: { type: 'string' } });
const CONCERN = objectOf({ about: { type: 'string' }, detail: { type: 'string' } });

const READ_OUTPUT_PROPS = {
  payment_reference: { type: ['string', 'null'] },
  payment_amount: { type: ['number', 'null'] },
  invoices: { type: 'array', items: INVOICE_ROW },
};
const ANSWER_PROPS = {
  ...READ_OUTPUT_PROPS,
  skipped_parts: { type: 'array', items: SKIPPED_PART },
  concerns: { type: 'array', items: CONCERN },
};

export const READ_OUTPUT_SCHEMA = { name: 'read_output', schema: objectOf(READ_OUTPUT_PROPS) };
export const ANSWER_SCHEMA = { name: 'answer', schema: objectOf(ANSWER_PROPS) };

// Usage

export const emptyUsage = (): Usage => ({ model_calls: 0, duration_ms: 0 });

export function addCall(total: Usage, call: CallUsage): void {
  addUsage(total, { model_calls: 1, duration_ms: call.duration_ms, tokens: call.tokens, cost_usd: call.cost_usd });
}

export function addUsage(total: Usage, part: Usage): void {
  total.model_calls += part.model_calls;
  total.duration_ms += part.duration_ms;
  if (part.tokens) {
    const input = (total.tokens?.input ?? 0) + part.tokens.input;
    const output = (total.tokens?.output ?? 0) + part.tokens.output;
    total.tokens = { input, output };
  }
  if (part.cost_usd !== undefined) total.cost_usd = (total.cost_usd ?? 0) + part.cost_usd;
}

export function oneCall(call: CallUsage): Usage {
  const usage = emptyUsage();
  addCall(usage, call);
  return usage;
}

// Steps

const INSERT_STEP = db.prepare(
  'INSERT INTO steps (result_id, parent_step_id, sequence, turn, kind, outcome, detail, usage) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
);
const CLOSE_STEP = db.prepare('UPDATE steps SET outcome = ?, detail = ?, usage = ? WHERE id = ?');

export interface NewStep {
  parent: number | null;
  turn: number;
  kind: StepKind;
  detail: StepDetail;
  outcome: StepOutcome | null;
  usage?: Usage | null;
}

export function startStep(ctx: StepContext, step: NewStep): number {
  ctx.sequence.n += 1;
  const detail = toJson(step.detail);
  const usage = toJson(step.usage ?? null);
  const { parent, turn, kind, outcome } = step;
  const inserted = INSERT_STEP.run(ctx.resultId, parent, ctx.sequence.n, turn, kind, outcome, detail, usage);
  return Number(inserted.lastInsertRowid);
}

export function closeStep(id: number, outcome: StepOutcome, detail: StepDetail, usage: Usage | null): void {
  CLOSE_STEP.run(outcome, toJson(detail), toJson(usage), id);
}

/** A reply with both text and tool calls keeps its text as a message step. */
export function recordMessage(
  ctx: StepContext, parent: number | null, turn: number, text: string, call: CallUsage,
): void {
  startStep(ctx, { parent, turn, kind: 'message', detail: { text }, outcome: 'ok', usage: oneCall(call) });
}

// Messages and replies

export function systemPrompt(core: string, accountText: string): string {
  return accountText.trim() ? `${core}\n\n## Account instructions\n${accountText}` : core;
}

export function assistantTurn(text: string, toolCalls: ToolCall[]): ChatMessage {
  return { role: 'assistant', content: text || null, tool_calls: toolCalls.length ? toolCalls : undefined };
}

export function toolResult(call: ToolCall, output: unknown): ChatMessage {
  return { role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) };
}

export function toolArgs(call: ToolCall): Record<string, unknown> {
  try {
    return JSON.parse(call.function.arguments || '{}');
  } catch {
    return {};
  }
}

export function parseReadOutput(text: string): ReadOutput {
  const value = firstJsonObject(text) as ReadOutput;
  if (!value || !Array.isArray(value.invoices)) throw new Error('The reply is not a valid read output');
  return {
    payment_reference: value.payment_reference ?? null,
    payment_amount: value.payment_amount ?? null,
    invoices: value.invoices.map((row) => ({ reference: String(row.reference), amount: Number(row.amount) })),
  };
}

export function parseAnswer(text: string): Answer {
  const value = firstJsonObject(text) as Answer;
  const read = parseReadOutput(text);
  return { ...read, skipped_parts: value.skipped_parts ?? [], concerns: value.concerns ?? [] };
}

/** The whole reply as JSON, or else the first balanced {...} in it (models sometimes wrap JSON in prose). */
function firstJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    if (start < 0) throw new Error('No JSON in the reply');
    const end = matchingBrace(text, start);
    if (end < 0) throw new Error('Unfinished JSON in the reply');
    return JSON.parse(text.slice(start, end + 1));
  }
}

/** Index of the brace that closes the one at `start`, skipping braces inside strings; -1 if none. */
function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}
