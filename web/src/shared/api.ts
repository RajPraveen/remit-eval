// Calls to the eval server. Failed calls show an error message on the page, then throw.
import { message } from 'antd';
import type {
  AccountInstructions,
  Comparison,
  Design,
  DesignView,
  GoldenSet,
  RecordDetail,
  RunDetail,
  RunSummary,
  StartRunRequest,
} from '../../../shared/types';

async function errorText(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text);
    if (body && typeof body.error === 'string') return body.error;
    if (body && typeof body.message === 'string') return body.message;
  } catch {
    // not JSON
  }
  return text || `${res.status} ${res.statusText}`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    message.error(String(e));
    throw e;
  }
  if (!res.ok) {
    const text = await errorText(res);
    message.error(text);
    throw new Error(text);
  }
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;

export const api = {
  startRun: (body: StartRunRequest) => request<{ id: number }>('POST', '/runs', body),
  runs: () => request<RunSummary[]>('GET', '/runs'),
  run: (id: number | string) => request<RunDetail>('GET', `/runs/${enc(String(id))}`),
  record: (runId: number | string, recordId: string) =>
    request<RecordDetail>('GET', `/runs/${enc(String(runId))}/records/${enc(recordId)}`),
  compare: (base: number | string, run: number | string) =>
    request<Comparison>('GET', `/compare?base=${enc(String(base))}&run=${enc(String(run))}`),
  accounts: () => request<string[]>('GET', '/accounts'),
  instructions: (account: string) =>
    request<AccountInstructions>('GET', `/accounts/${enc(account)}/instructions`),
  saveInstructions: (account: string, body: { reader_text: string; orchestrator_text: string }) =>
    request<AccountInstructions>('POST', `/accounts/${enc(account)}/instructions`, body),
  makeCurrent: (account: string) =>
    request<AccountInstructions>('POST', `/accounts/${enc(account)}/instructions/make-current`),
  design: () => request<DesignView>('GET', '/design'),
  saveDesign: (design: Design) => request<DesignView>('PUT', '/design', design),
  golden: () => request<GoldenSet>('GET', '/golden'),
};

export const fileUrl = (recordId: string, name: string) => `/api/golden/${enc(recordId)}/files/${enc(name)}`;
