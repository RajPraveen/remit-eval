// The reader: started by each read_part call with a fresh context. It reads the whole part in one call,
// or, when the design gives it read_section, reads the part section by section.
import type { PartInfo, ReadOutput, Usage } from '../../../shared/types';
import { partContent, sectionPages } from '../golden-set/documents';
import { readPrompt } from './design';
import { callModel, type ChatMessage, type ContentPart, type ToolCall } from './model-client';
import {
  addCall, assistantTurn, closeStep, emptyUsage, oneCall, parseReadOutput, READ_OUTPUT_SCHEMA, READ_SECTION_TOOL,
  recordMessage, type RunRecordInput, startStep, type StepContext, systemPrompt, toolArgs, toolResult,
} from './utils';

const READER_TURNS = 20;

export interface ReaderRun {
  output: ReadOutput;
  usage: Usage;
}

/** Reads one part. `readPartStep` is the read_part step this reader's own steps hang under. */
export async function runReader(
  ctx: StepContext, readPartStep: number, part: PartInfo, input: RunRecordInput,
): Promise<ReaderRun> {
  if (input.design.reader.tools.includes('read_section')) return readBySection(ctx, readPartStep, part, input);
  return readWhole(part, input);
}

/** No tools: one call with the whole part. The reader records no steps of its own. */
async function readWhole(part: PartInfo, input: RunRecordInput): Promise<ReaderRun> {
  const intro: ContentPart = { type: 'text', text: `Part: ${part.name} (${part.type})` };
  const content: ContentPart[] = [intro, ...(await partContent(input.recordId, part))];
  const reply = await callModel({
    model: input.design.reader.model,
    schema: READ_OUTPUT_SCHEMA,
    messages: [
      { role: 'system', content: readerPrompt(input) },
      { role: 'user', content },
    ],
  });
  return { output: parseReadOutput(reply.text), usage: oneCall(reply.usage) };
}

/** A loop of turns: the reader asks for sections until it replies without a tool call. */
async function readBySection(
  ctx: StepContext, parent: number, part: PartInfo, input: RunRecordInput,
): Promise<ReaderRun> {
  const usage = emptyUsage();
  const ask = `Part: ${part.name} (${part.type}), ${part.sections} section(s). Read its sections with read_section.`;
  const messages: ChatMessage[] = [
    { role: 'system', content: readerPrompt(input) },
    { role: 'user', content: ask },
  ];
  for (let turn = 1; turn <= READER_TURNS; turn++) {
    const model = input.design.reader.model;
    const reply = await callModel({ model, messages, tools: [READ_SECTION_TOOL], schema: READ_OUTPUT_SCHEMA });
    addCall(usage, reply.usage);
    if (reply.text.trim() && reply.tool_calls.length) recordMessage(ctx, parent, turn, reply.text, reply.usage);
    if (!reply.tool_calls.length) return { output: parseReadOutput(reply.text), usage };
    messages.push(assistantTurn(reply.text, reply.tool_calls));
    const sections = reply.tool_calls.map((call) => runReadSection(ctx, parent, turn, input.recordId, part, call));
    messages.push(...(await Promise.all(sections)));
  }
  throw new Error(`The reader of ${part.name} did not answer within ${READER_TURNS} turns`);
}

async function runReadSection(
  ctx: StepContext, parent: number, turn: number, recordId: string, part: PartInfo, call: ToolCall,
): Promise<ChatMessage> {
  const section = Number(toolArgs(call).section);
  const detail = { tool: 'read_section' as const, input: { part: part.name, section } };
  const stepId = startStep(ctx, {
    parent, turn, kind: 'tool_call', detail: { ...detail, output: null }, outcome: null,
  });
  if (!isSectionCall(call, section, part)) {
    const error = `Section ${call.function.arguments} does not exist; this part has ${part.sections} section(s).`;
    closeStep(stepId, 'refused', { ...detail, output: { error } }, null);
    return toolResult(call, { error });
  }
  const content = await partContent(recordId, part, section);
  const pages = await sectionPages(recordId, part, section);
  closeStep(stepId, 'ok', { ...detail, output: { pages } }, null);
  return { role: 'tool', tool_call_id: call.id, content };
}

function isSectionCall(call: ToolCall, section: number, part: PartInfo): boolean {
  const exists = Number.isInteger(section) && section >= 1 && section <= part.sections;
  return call.function.name === 'read_section' && exists;
}

function readerPrompt(input: RunRecordInput): string {
  return systemPrompt(readPrompt('reader'), input.instructions.reader_text);
}
