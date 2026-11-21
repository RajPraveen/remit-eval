// The remittance agent being evaluated: an orchestrator loop that starts a reader for each read_part call.
// Every step is recorded by the code that runs it, never from the model's own description.
import type { Answer, PartInfo, Usage } from '../../../shared/types';
import { listParts } from '../golden-set/documents';
import { readPrompt } from './design';
import { callModel, type ChatMessage, type ToolCall } from './model-client';
import { runReader } from './reader';
import {
  addCall, addUsage, ANSWER_SCHEMA, assistantTurn, closeStep, emptyUsage, parseAnswer, READ_PART_TOOL,
  recordMessage, type RunRecordInput, startStep, type StepContext, systemPrompt, toolArgs, toolResult,
} from './utils';

const ORCHESTRATOR_TURNS = 12;

/** Runs one record. Throws if no valid answer comes back within the turn limit. */
export async function runRecord(input: RunRecordInput): Promise<{ answer: Answer; usage: Usage }> {
  const ctx: StepContext = { resultId: input.resultId, sequence: { n: 0 } };
  const parts = await listParts(input.recordId);
  const usage = emptyUsage();
  const prompt = systemPrompt(readPrompt('orchestrator'), input.instructions.orchestrator_text);
  const messages: ChatMessage[] = [
    { role: 'system', content: prompt },
    { role: 'user', content: describeParts(parts) },
  ];
  for (let turn = 1; turn <= ORCHESTRATOR_TURNS; turn++) {
    const model = input.design.orchestrator.model;
    const reply = await callModel({ model, messages, tools: [READ_PART_TOOL], schema: ANSWER_SCHEMA });
    addCall(usage, reply.usage);
    if (reply.text.trim() && reply.tool_calls.length) recordMessage(ctx, null, turn, reply.text, reply.usage);
    if (!reply.tool_calls.length) {
      const answer = parseAnswer(reply.text);
      startStep(ctx, { parent: null, turn, kind: 'answer', detail: {}, outcome: 'ok' });
      return { answer, usage };
    }
    messages.push(assistantTurn(reply.text, reply.tool_calls));
    // A turn's tool calls run at the same time.
    const reads = reply.tool_calls.map((call) => runReadPart(ctx, turn, parts, call, input, usage));
    messages.push(...(await Promise.all(reads)));
  }
  throw new Error(`The orchestrator did not answer within ${ORCHESTRATOR_TURNS} turns`);
}

function describeParts(parts: PartInfo[]): string {
  const lines = parts.map((p) => `- ${p.name} (${p.type}, ${p.sections} section${p.sections === 1 ? '' : 's'})`);
  return `The remittance has these parts:\n${lines.join('\n')}`;
}

/** One read_part call. Its step's output is the reader's answer and its usage is the reader's total. */
async function runReadPart(
  ctx: StepContext, turn: number, parts: PartInfo[], call: ToolCall, input: RunRecordInput, total: Usage,
): Promise<ChatMessage> {
  const name = String(toolArgs(call).part ?? '');
  const detail = { tool: 'read_part' as const, input: { part: name } };
  const stepId = startStep(ctx, {
    parent: null, turn, kind: 'tool_call', detail: { ...detail, output: null }, outcome: null,
  });
  const part = parts.find((p) => p.name === name);
  if (call.function.name !== 'read_part' || !part) {
    const error = `"${name}" is not a part of this remittance. Parts: ${parts.map((p) => p.name).join(', ')}.`;
    closeStep(stepId, 'refused', { ...detail, output: { error } }, null);
    return toolResult(call, { error });
  }
  try {
    const reader = await runReader(ctx, stepId, part, input);
    addUsage(total, reader.usage);
    closeStep(stepId, 'ok', { ...detail, output: reader.output }, reader.usage);
    return toolResult(call, reader.output);
  } catch (error) {
    const message = (error as Error).message;
    closeStep(stepId, 'failed', { ...detail, output: { error: message } }, null);
    return toolResult(call, { error: message });
  }
}
