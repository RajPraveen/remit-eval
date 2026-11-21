// The data shapes shared by the server and the page. This file is the contract: both sides import from here.
// Changing a shape here changes it for both. See ../SPEC.md.

// ---------- design and version ----------

export interface AgentDesign {
  provider: 'openrouter';
  model: string; // an OpenRouter model id, e.g. "anthropic/claude-opus-5.5"
  tools: string[]; // orchestrator: ["read_part"]; reader: [] or ["read_section"]
}

export interface Design {
  orchestrator: AgentDesign;
  reader: AgentDesign;
}

/** runs.version: everything that defines what was run. */
export interface RunVersion extends Design {
  golden_set: string; // manifest version, e.g. "v1"
  core: string; // short fingerprint of the core prompts and the tool definitions
  instructions: Record<string, number>; // account -> account_instructions.version used
}

export type Scope = string; // "all" or an account id such as "247"

// ---------- the answer sheet ----------

export interface InvoiceRow {
  reference: string; // exactly as written in the document
  amount: number; // signed, to the cent
}

/** What a reader returns for one part (steps.detail.output of a read_part call), and the shape of an expected answer. */
export interface ReadOutput {
  payment_reference: string | null;
  payment_amount: number | null;
  invoices: InvoiceRow[];
}

export type ExpectedAnswer = ReadOutput;

export interface Concern {
  about: string; // the demo has one kind: "does_not_add_up"
  detail: string;
}

/** results.answer: the orchestrator's final answer. */
export interface Answer extends ReadOutput {
  skipped_parts: { part: string; reason: string }[];
  concerns: Concern[];
}

export interface Usage {
  model_calls: number;
  duration_ms: number;
  tokens?: { input: number; output: number };
  cost_usd?: number;
}

// ---------- steps ----------

export type StepKind = 'message' | 'tool_call' | 'answer';
export type StepOutcome = 'ok' | 'refused' | 'failed';

export interface MessageDetail {
  text: string;
}
export interface ToolCallDetail {
  tool: 'read_part' | 'read_section';
  input: { part: string; section?: number };
  output: unknown; // read_part: ReadOutput; read_section: { pages: string }; refused/failed: { error: string }
}
export type StepDetail = MessageDetail | ToolCallDetail | Record<string, never>;

export interface Step {
  id: number;
  result_id: number;
  parent_step_id: number | null;
  sequence: number;
  turn: number;
  kind: StepKind;
  outcome: StepOutcome;
  detail: StepDetail;
  usage: Usage | null;
}

// ---------- evals ----------

export type ValueResult = 'match' | 'mismatch';
export type RowResult = 'matched' | 'missing' | 'extra' | 'wrong_amount';

export interface BoundaryDetails {
  reason?: 'did_not_finish';
  payment_reference: { expected: string | null; returned: string | null; result: ValueResult };
  payment_amount: { expected: number | null; returned: number | null; result: ValueResult };
  invoices: { reference: string; expected: number | null; returned: number | null; result: RowResult }[];
  counts: { expected_rows: number; returned_rows: number; matched: number; missing: number; extra: number; wrong_amount: number };
}

export interface BoundaryEval {
  id: number;
  result_id: number;
  verdict: 'right' | 'wrong';
  flagged: 'yes' | 'no';
  details: BoundaryDetails;
}

export type CheckName = 'grounding' | 'diligence' | 'self_check' | 'limits' | 'effort';
export type CheckOutcome = 'pass' | 'fail' | 'not_applicable';

export interface TraceEval {
  id: number;
  result_id: number;
  level: 'orchestrator' | 'reader';
  step_id: number | null; // reader checks: the read_part step that started that reader
  name: CheckName;
  outcome: CheckOutcome;
  details: Record<string, unknown> & { summary: string }; // summary: one plain line for the page
}

// ---------- golden set ----------

export interface GoldenRecord {
  id: string; // folder name, e.g. "R2-one-pdf"
  kind: string; // e.g. "Email and one PDF"
  account: string;
  files: { name: string; sha256: string }[]; // files under arrival/, plus expected.json
  expected_rows: number;
}

export interface GoldenSet {
  version: string;
  records: GoldenRecord[];
}

export interface PartInfo {
  name: string; // "email body" or the attachment's file name
  type: 'text' | 'pdf' | 'image' | 'spreadsheet' | 'document';
  sections: number;
}

// ---------- account instructions ----------

export interface InstructionsVersion {
  id: number;
  account: string;
  version: number;
  reader_text: string;
  orchestrator_text: string;
  status: 'draft' | 'current' | 'old';
  created_at: string;
  last_run: { id: number; gate: 'pass' | 'fail' | null } | null;
}

export interface AccountInstructions {
  account: string;
  current: InstructionsVersion;
  draft: InstructionsVersion | null;
  history: InstructionsVersion[]; // newest first, includes current and draft
}

// ---------- API: runs ----------

export interface Tally {
  n: number;
  of: number;
}

export interface VersionDiff {
  path: string; // e.g. "reader.tools"
  before: unknown;
  after: unknown;
}

export interface RunSummary {
  id: number;
  scope: Scope;
  note: string | null;
  started_by: 'page' | 'command';
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'finished' | 'failed';
  error: string | null;
  version: RunVersion;
  compared_to: number | null;
  gate: 'pass' | 'fail' | null;
  overridden_at: string | null;
  is_baseline: boolean;
  is_draft_run: boolean;
  progress: Tally; // records done of records in scope
  records_right: Tally | null; // null while running
  changed: VersionDiff[]; // against compared_to; empty for a first run
}

export interface BoundaryTotals {
  records_right: Tally;
  payment_reference_right: Tally;
  payment_amount_right: Tally;
  rows_found: Tally; // matched of expected
  rows_correct: Tally; // matched of returned
}

export interface CheckTally {
  pass: number;
  fail: number;
  not_applicable: number;
}

export interface TraceTotals {
  orchestrator: Record<CheckName, CheckTally>;
  reader: Record<CheckName, CheckTally>;
  read_part_calls: number;
  read_section_calls: number;
  model_calls: number;
}

export interface RunRecordRow {
  record_id: string;
  kind: string;
  account: string;
  status: 'running' | 'finished' | 'did_not_finish';
  verdict: 'right' | 'wrong' | null;
  flagged: 'yes' | 'no' | null;
  orchestrator: CheckTally;
  reader: CheckTally;
  model_calls: number;
}

export interface RunDetail extends RunSummary {
  boundary: BoundaryTotals;
  trace: TraceTotals;
  records: RunRecordRow[];
}

export interface RecordDetail {
  run_id: number;
  record: GoldenRecord;
  parts: PartInfo[];
  status: 'running' | 'finished' | 'did_not_finish';
  error: string | null;
  answer: Answer | null;
  usage: Usage | null;
  expected: ExpectedAnswer;
  boundary: BoundaryEval | null;
  trace: (TraceEval & { part: string | null })[]; // part: the part name for reader checks
  steps: Step[];
}

export interface ChangedRecord {
  record_id: string;
  kind: string;
  what: string; // "Boundary", "Orchestrator, Self-check", "Reader of remit.pdf, Diligence"
  base: string; // e.g. "Wrong, 3 invoice rows missing"
  run: string; // e.g. "Right"
  worse: boolean;
}

export interface Comparison {
  base: RunSummary;
  run: RunSummary;
  differed: VersionDiff[];
  boundary: { base: BoundaryTotals; run: BoundaryTotals };
  trace: { base: TraceTotals; run: TraceTotals };
  changed_records: ChangedRecord[];
  gate: 'pass' | 'fail';
}

export interface StartRunRequest {
  scope: Scope;
  note?: string;
  use_draft?: boolean; // only with an account scope: run that account's draft instructions
}

// ---------- API: design ----------

export interface DesignView {
  design: Design;
  core: { orchestrator: string; reader: string }; // the two core instruction files, read-only
  models: string[]; // model ids offered in the selects
}
