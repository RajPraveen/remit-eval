// One call to OpenRouter. The only module that talks to a model.
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { Agent, fetch } from 'undici';
import { APP_DIR } from '../config';

// On this network IPv6 to OpenRouter stalls for minutes, so every connection is forced to IPv4.
dns.setDefaultResultOrder('ipv4first');
const ipv4 = new Agent({
  connect: { family: 4 } as Agent.Options["connect"],
  headersTimeout: 180_000,
  bodyTimeout: 180_000,
});
const URL = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 180_000;

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'file'; file: { filename: string; file_data: string } }
  | { type: 'image_url'; image_url: { url: string } };

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string | ContentPart[] };

export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: object };
}

export interface ModelRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  schema?: { name: string; schema: object };
}

export interface CallUsage {
  duration_ms: number;
  tokens?: { input: number; output: number };
  cost_usd?: number;
}

export interface ModelReply {
  text: string;
  tool_calls: ToolCall[];
  usage: CallUsage;
}

export async function callModel(request: ModelRequest): Promise<ModelReply> {
  const started = Date.now();
  const json = await postWithRetry(body(request));
  const message = json.choices?.[0]?.message ?? {};
  const usage = callUsage(json, Date.now() - started);
  return { text: contentText(message.content), tool_calls: message.tool_calls ?? [], usage };
}

function callUsage(json: any, durationMs: number): CallUsage {
  const usage: CallUsage = { duration_ms: durationMs };
  if (json.usage) {
    usage.tokens = { input: json.usage.prompt_tokens ?? 0, output: json.usage.completion_tokens ?? 0 };
    if (typeof json.usage.cost === 'number') usage.cost_usd = json.usage.cost;
  }
  return usage;
}

function body(request: ModelRequest): object {
  const payload: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
    usage: { include: true },
  };
  if (request.tools?.length) {
    payload.tools = request.tools;
    payload.tool_choice = 'auto';
  }
  if (request.schema) {
    const { name, schema } = request.schema;
    payload.response_format = { type: 'json_schema', json_schema: { name, strict: true, schema } };
  }
  return payload;
}

class RetryableError extends Error {}

// One retry, and only for a network error or a 5xx.
async function postWithRetry(payload: object): Promise<any> {
  try {
    return await post(payload);
  } catch (error) {
    if (!(error instanceof RetryableError)) throw error;
    return post(payload);
  }
}

async function post(payload: object): Promise<any> {
  let response;
  try {
    response = await fetch(URL, {
      method: 'POST',
      dispatcher: ipv4,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: `Bearer ${readKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new RetryableError(`Network error: ${(error as Error).message}`);
  }
  const text = await response.text();
  if (response.status >= 500) throw new RetryableError(`OpenRouter ${response.status}: ${text.slice(0, 300)}`);
  if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  if (json.error) throw new Error(`OpenRouter error: ${JSON.stringify(json.error).slice(0, 300)}`);
  return json;
}

function readKey(): string {
  for (const file of [path.join(APP_DIR, '.env'), path.join(APP_DIR, '..', '.env')]) {
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const line = lines.find((l) => l.trim().startsWith('OPENROUTER_API_KEY='));
    if (line) return line.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
  }
  throw new Error('OPENROUTER_API_KEY not found in remit-eval/.env or ../.env');
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c?.text === 'string' ? c.text : '')).join('');
  return '';
}
