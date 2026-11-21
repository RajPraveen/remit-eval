# Remit Eval — build spec

A small demo app that runs a stub remittance-extraction agent over a golden data set and evaluates it two ways:
a **boundary eval** (is the answer right) and a **trace eval** (did the agent behave properly). Two personas use it:
an **FDE** changes account instructions; a **developer** changes the agent's design. Each sees what their change moved.

This is a demo. Build the positive path. Do not add versioning, guards, retries, auth or options that are not written here.

- Folder: `cash-match-lab/remit-eval/` — a separate app. It must not import from, read, or write the lab (`../lab`, `../data`, `../ui`). The one exception: the API key may be read from `../.env`.
- Shared contract: `shared/types.ts` (already written). Server and page both import from it. Do not redefine these shapes.
- Design reference: canvas https://claude.ai/artifact/ETj45ALFBpNYvcWzVV2VSD (five screens). Backend reference doc: https://claude.ai/artifact/Vy4LnJ3gLy3hC6P6PRa1og

## 1. Layout and stack

```
remit-eval/
  SPEC.md
  package.json          npm workspaces: server, web
  .gitignore            node_modules, data/, golden/*/arrival/, .env, dist
  start.sh  stop.sh     start/stop both sides; pids and logs under data/
  shared/types.ts
  server/               Node 20, TypeScript run with tsx, Express, better-sqlite3
    src/                one folder per job: a main file (entry function first) + utils.ts for its helpers
      app.ts            every route, one line each (npm start)
      check.ts          the `npm run check` command
      config.ts         paths and port only
      golden-set/       golden-set.ts (records, expected answers, file check)  documents.ts (parts, ready for a model)  utils.ts
      remittance-agent/ orchestrator.ts (runRecord)  reader.ts  model-client.ts (the only OpenRouter caller)
                        design.ts (design.json, core prompts)  utils.ts (tools, schemas, steps, usage, reply parsing)
                        design.json  the developer's design (git-tracked)
                        prompts/orchestrator.md  prompts/reader.md   core instructions (git-tracked)
      eval-run/         eval-run.ts (start run, each record, evaluate, gate)  utils.ts (version, fingerprint, SQL)
      boundary-eval/    boundary-eval.ts  utils.ts (reference and amount matching, row pairing)
      trace-eval/       trace-eval.ts (the five checks)  utils.ts (check helpers, loading steps)
      gate/             gate.ts (baseline, what changed, pass or fail)  compare.ts (side by side)  utils.ts
      account-instructions/  account-instructions.ts  utils.ts (rows, SQL)
      run-views/        run-views.ts (runs list, one run, one record)  utils.ts (rows, totals, tallies)
      database/         database.ts (connection, now/toJson/fromJson)  schema.sql (the six tables)
  web/                  React 18 + Vite 5 + Ant Design 6 + react-json-view-lite
    src/
      main.tsx          routes and the top bar
      runs/  run/  compare/   one folder per page: <Page>.tsx, utils.ts for pure helpers
      record/           RecordPage.tsx  BoundaryEvalCard.tsx  TraceEvalCard.tsx  StepsCard.tsx  utils.ts
      settings/         SettingsPage.tsx  AccountInstructionsCard.tsx  AgentDesignCard.tsx  GoldenSetCard.tsx  utils.ts
      shared/           api.ts  format.tsx  usePoll.ts
  golden/               manifest.json, <record>/expected.json (git), <record>/arrival/* (not git)
  data/remit-eval.sqlite   (not git)
```

- API on **127.0.0.1:8770**. Page on **127.0.0.1:5180**, Vite proxying `/api` to 8770. The lab uses 8765/5175/8766/5176 — never touch those.
- Node is v20.16: no native TypeScript, use `tsx`. One server process; services are modules.
- `start.sh` installs dependencies if missing, starts both, prints the page URL. `stop.sh` stops both.
- Key: `OPENROUTER_API_KEY` from `remit-eval/.env`, else `../.env`. Never print or log it.

## 2. Storage

### Files

`server/src/remittance-agent/design.json` (default):
```json
{
  "orchestrator": { "provider": "openrouter", "model": "anthropic/claude-opus-5.5", "tools": ["read_part"] },
  "reader": { "provider": "openrouter", "model": "anthropic/claude-haiku-5.5", "tools": [] }
}
```

`golden/manifest.json`: `{ "version": "v1", "records": GoldenRecord[] }` (see types). Each file entry has a sha256.
`golden/<record>/expected.json`: `ExpectedAnswer`.
`golden/<record>/arrival/`: `body.txt` (the email's subject and body as text — this is the part named `email body`) plus each attachment as its original file (the part's name is the file name).

### SQLite (`data/remit-eval.sqlite`, WAL mode so a client app can read it while the app runs)

Six tables. JSON columns are TEXT holding JSON. Timestamps are ISO strings.

```
account_instructions  id · account · version · reader_text · orchestrator_text · status(draft|current|old) · created_at
runs                  id · scope · note · started_by(page|command) · started_at · finished_at
                      status(running|finished|failed) · error · version(JSON RunVersion)
                      compared_to · gate(pass|fail) · overridden_at
results               id · run_id · record_id · status(running|finished|did_not_finish) · error
                      answer(JSON Answer) · usage(JSON Usage)
steps                 id · result_id · parent_step_id · sequence · turn · kind(message|tool_call|answer)
                      outcome(ok|refused|failed) · detail(JSON) · usage(JSON)
boundary_evals        id · result_id · verdict(right|wrong) · flagged(yes|no) · details(JSON BoundaryDetails)
trace_evals           id · result_id · level(orchestrator|reader) · step_id · name · outcome(pass|fail|not_applicable) · details(JSON)
```

Rules:
- On first start, create the tables, and for every account in the manifest insert `account_instructions` version 1, empty texts, status `current`.
- `account_instructions`: one `current` and at most one `draft` per account. A save always inserts a new row (next version, status `draft`); an existing draft becomes `old`. Text is never edited.
- `runs`, `results`, `steps`: inserted when work starts, updated once when it ends. `boundary_evals`, `trace_evals`: inserted once.
- Each table is written by one module only (section 3).
- Totals, progress and labels are computed when asked for, never stored.

## 3. Services (modules in `server/src`)

| Module | Does | Writes |
|---|---|---|
| `database` | Opens SQLite (WAL), creates tables | |
| `golden-set` | Loads the manifest, verifies each file's sha256, returns a record's expected answer | |
| `documents` | For a record: lists parts (`PartInfo`), returns a part ready for a model, returns one section of a part | |
| `model-client` | One call to OpenRouter; returns the reply and usage | |
| `account-instructions` | Get current/draft/history, save a draft, make the draft current | `account_instructions` |
| `remittance-agent` | Runs the orchestrator loop and readers for one record; records steps | `steps` |
| `boundary-eval`, `trace-eval` | Boundary eval and trace eval for one result; plain code, no model calls | `boundary_evals`, `trace_evals` |
| `gate` | Diffs two runs, finds the baseline, decides pass/fail (`gate.ts`); the side-by-side view (`compare.ts`) | `runs.compared_to`, `runs.gate` |
| `eval-run` | Starts and drives a run | `runs`, `results` |
| `run-views` | What the pages read: the runs list, one run, one record | |
| `app.ts`, `check.ts` | Thin entry points; no logic | |

Hard rules: `remittance-agent` must not import the golden set's expected answers or the evals, and gets documents only through `golden-set/documents`. The evals never call a model. `model-client` is the only module that talks to OpenRouter.

### documents

- Parts: `body.txt` → name `email body`, type `text`. Each other file → name = file name; type by extension: `.pdf` pdf; `.png .jpg .jpeg` image; `.xlsx .xls .csv` spreadsheet; `.docx .txt .html .htm` document.
- Sections: a PDF has one section per 2 pages (one constant, `PAGES_PER_SECTION = 2`; use `pdf-lib` to count pages and to cut a section into its own PDF). Every other part has 1 section. The golden set's longest PDF is 8 pages, so 2 pages per section gives it 4 sections.
- Ready for a model: text/document/spreadsheet → text (`xlsx` to CSV text, `mammoth` for docx, strip tags for html). PDF → the file. Image → the image.

### model-client

- `POST https://openrouter.ai/api/v1/chat/completions` (OpenAI-compatible), `Authorization: Bearer <key>`.
- **Force IPv4.** On this network IPv6 to OpenRouter stalls for minutes. Call `dns.setDefaultResultOrder('ipv4first')` at start-up and use an undici `Agent` with `connect: { family: 4 }`.
- Do **not** send `temperature`, `top_p` or a forced `tool_choice`; these models reject them. Use `tool_choice: "auto"`.
- Tools: `tools: [{ type: "function", function: { name, description, parameters } }]`.
- PDF: content part `{ type: "file", file: { filename, file_data: "data:application/pdf;base64,…" } }`. Image: `{ type: "image_url", image_url: { url: "data:image/png;base64,…" } }`.
- Final answers must be JSON. Ask for it with `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`. If OpenRouter rejects that together with tools, drop `response_format`, rely on the prompt, and parse the first JSON object in the reply.
- Return usage: tokens and cost if OpenRouter reports them (`usage` in the response; send `usage: { include: true }`). Timeout 180 s per call, one retry on a network error or 5xx.

### remittance-agent

Entry point: `runRecord({ recordId, resultId, design, instructions: { reader_text, orchestrator_text } }) → { answer: Answer, usage: Usage }`. It throws if no valid answer comes back.

**Orchestrator** (model `design.orchestrator.model`), a loop:
- System prompt = `prompts/orchestrator.md` + `\n\n## Account instructions\n` + `orchestrator_text` (omit the heading when empty).
- Tool: `read_part({ part: string })` — "Reads one part of the remittance and returns the payment reference number, payment amount and invoice rows found in it."
- User message = the list of parts: name, type, sections.
- Each reply is one **turn** (1, 2, 3…). For each turn: if the reply has text, record a `message` step. For each tool call, record a `tool_call` step, run it, and return its output as the tool result. Run a turn's tool calls concurrently. When a reply has no tool calls, parse it as `Answer`, record an `answer` step with detail `{}`, and return. Stop with an error after 12 turns.
- `read_part` on a name that is not a part of this record: outcome `refused`, output `{ "error": "…" }`, returned to the model as the tool result.

**Reader** (model `design.reader.model`), started by each `read_part` call, fresh context:
- System prompt = `prompts/reader.md` + account instructions heading + `reader_text`.
- `design.reader.tools` is `[]`: one call. User message = the whole part. Reply = `ReadOutput` JSON. No steps of its own.
- `design.reader.tools` includes `read_section`: a loop. User message = the part's name and its number of sections. Tool `read_section({ section: number })` (1-based) returns that section's content as the tool result; the step's stored output is `{ "pages": "11-20" }` for a PDF, `{ "pages": "all" }` otherwise. A section number that does not exist: `refused`. Record the reader's `message` and `tool_call` steps with `parent_step_id` = the `read_part` step's id. The reader's own turns are numbered from 1 within that reader. Its final reply = `ReadOutput` JSON. Stop after 20 turns.
  - If a tool result cannot carry a file through OpenRouter, send a short text tool result and attach the section as the next user message.
- The `read_part` step's output is the reader's `ReadOutput`; its usage is the reader's total.

`sequence` is one running count per result, in the order steps start. Steps are written by the code that executes them, never from the model's own description.

Core instructions to write (`prompts/*.md`), short and plain:
- `orchestrator.md`: extract the payment reference number, payment amount and invoice rows from a remittance. Read the parts you need with `read_part`. Combine the results; a line that appears in more than one part counts once. Keep references exactly as written. List any part you did not read under `skipped_parts` with a short reason. If the invoice amounts do not add up to the payment amount, add a concern `{ "about": "does_not_add_up", "detail": … }`; otherwise `concerns` is empty. Use `null` for a payment reference or amount that is not stated. Reply with only the JSON answer.
- `reader.md`: read one part of a remittance and return the payment reference number, payment amount and every invoice row (reference exactly as written, amount signed, credits negative). Use `null` where a value is not stated. Invent nothing. Reply with only the JSON.

### eval-run

`startRun({ scope, note, started_by, use_draft }) → runId`, returning before the work is done:
1. Refuse if a run is already `running`.
2. `golden-set` verifies the files; on a mismatch insert the run as `failed` with the error.
3. Build `RunVersion`: `golden_set`, `core` (first 4 hex chars of a sha256 over the two prompt files and the tool definitions), the design, and `instructions` (per account in scope: the draft's version when `use_draft` and a draft exists, else the current version).
4. Insert the run as `running`. Then, in the background, for each record in scope, one after another: insert the result as `running` → `remittance-agent.runRecord` → close the result (`finished` with answer and usage, or `did_not_finish` with the error) → `boundary-eval`, then `trace-eval`.
5. `gate` sets `compared_to` and `gate`. Close the run as `finished`.

Scope `all` = every record; an account id = that account's records.

### boundary-eval and trace-eval

**Boundary eval** (answer vs `expected.json`):
- A reference matches when equal after lower-casing and removing all whitespace. An amount matches to the cent, sign included.
- Pair invoice rows: first exact pairs (reference and amount) → `matched`; then leftovers with the same reference → `wrong_amount`; leftover expected → `missing`; leftover returned → `extra`. Each returned row is used once, so repeated rows count separately. Never guess that two different references are the same row.
- `payment_reference` and `payment_amount`: `match` or `mismatch`; `null` matches `null`.
- `verdict` = `right` only if both payment values match and every row is `matched`. `flagged` = `yes` when `concerns` is non-empty.
- A result that did not finish: verdict `wrong`, flagged `no`, `details.reason = "did_not_finish"`, rows all `missing`.
- In `details.invoices`, list non-matched rows first.

**Trace eval** (steps and answer only; never the expected answer). Every row's `details` carries a plain `summary` line.

Orchestrator level, `step_id` null, always five rows:
| name | pass when |
|---|---|
| `grounding` | every value in the answer (payment reference, payment amount, each invoice row as reference+amount) appears in the output of some `ok` `read_part` step, using the boundary matching rule. `null` values need no source |
| `diligence` | every part of the record was read by an `ok` `read_part` step or is named in `skipped_parts` |
| `self_check` | the invoice amounts add up to the payment amount (to the cent) **or** a `does_not_add_up` concern is present. `not_applicable` when `payment_amount` is null |
| `limits` | no `read_part` step was `refused` |
| `effort` | no part was read more than twice. `details` also holds the number of `read_part` calls and of parts |

Reader level, three rows per `ok` `read_part` step, `step_id` = that step:
| name | pass when |
|---|---|
| `diligence` | every section of the part was read by an `ok` `read_section` step under it |
| `limits` | no `read_section` step under it was `refused` |
| `effort` | no section was read more than twice |

When that step has no child steps (the reader had no tools), all three are `not_applicable`.

### gate

- Baseline of a scope = the newest `finished` run with that scope, excluding the run itself, whose gate is `pass` (or `overridden_at` is set) and whose `version.instructions` versions are all not currently `draft`.
- No baseline → `compared_to` null, gate `pass`.
- Otherwise gate `fail` if, against the baseline, any record went right → wrong, any trace eval went pass → fail (matched by record, level, name and part name), or any record went finished → did_not_finish. Else `pass`. `not_applicable` → pass or fail never fails the gate.
- `compare(baseId, runId) → Comparison`: `differed` = a key-by-key diff of the two `version` objects (dotted paths; arrays compared whole); the totals for both; `changed_records` = each record-level difference in the boundary verdict or in a trace eval outcome, with one plain phrase for each side.

## 4. API (all under `/api`, JSON; the server returns data ready to show)

| Request | Returns |
|---|---|
| `POST /api/runs` body `StartRunRequest` | `{ id }`; 409 if a run is running |
| `GET /api/runs` | `RunSummary[]`, newest first |
| `GET /api/runs/:id` | `RunDetail` |
| `GET /api/runs/:id/records/:recordId` | `RecordDetail` |
| `GET /api/compare?base=&run=` | `Comparison` |
| `GET /api/accounts` | `string[]` |
| `GET /api/accounts/:account/instructions` | `AccountInstructions` |
| `POST /api/accounts/:account/instructions` body `{ reader_text, orchestrator_text }` | `AccountInstructions` (a new draft exists) |
| `POST /api/accounts/:account/instructions/make-current` | `AccountInstructions`; 409 unless the draft's latest run is finished with gate `pass` |
| `GET /api/design` | `DesignView` (models: opus-5.5, sonnet-5.5, haiku-5.5 under `anthropic/`) |
| `PUT /api/design` body `Design` | `DesignView`; writes `server/src/remittance-agent/design.json` |
| `GET /api/golden` | `GoldenSet` |
| `GET /api/golden/:recordId/files/:name` | the original file, inline |

`is_draft_run` = some `version.instructions` version is currently a `draft`. `is_baseline` = this run is its scope's baseline now.

## 5. Command

`npm run check` (in `remit-eval/`): starts a run with scope `all`, `started_by` `command`, waits for it, prints one line per record (record, verdict, trace checks passed) and the changed records against the baseline, then exits 0 on gate `pass` and 1 otherwise. It calls the modules directly, not the API.

## 6. Page

Five routes, matching the canvas. Ant Design 6 components (Table, Tag, Select, Input, Button, Checkbox, Descriptions, Breadcrumb), default theme, no custom styling beyond layout. `react-json-view-lite` for JSON. Counts as "4 of 5", never percentages.

**Text rule: labels only.** No helper text, no explanatory sentences, no placeholders that explain, no emoji, no icons, no empty-state prose beyond one or two words.

| Route | Content |
|---|---|
| `/` Runs | Scope select (All records, each account), Note input, "Run golden set" button. Table: Run (link), Started, Scope, By, Note, Changed from baseline (`changed` as `path: before → after`), Records right, Gate (Pass / Fail / Running tags, plus Baseline tag), Compare link (when `compared_to` is set). Poll every 2 s while a run is running |
| `/runs/:id` Run | Header with gate tags and "Compare with run N". Run facts. Version as JSON. Boundary eval: the five totals. Trace eval: a row per check, columns Orchestrator and Reader ("5 of 5", or "Not applicable" when all are); Effort row shows call counts. Records table: Record (link), Kind, Account, Boundary tag, Orchestrator checks, Reader checks, Model calls. Poll while running |
| `/compare?base=&run=` Compare | "What differed" table. Boundary eval and Trace eval, both runs side by side. "Records that changed" table with a link to the record |
| `/runs/:id/records/:recordId` Record | Header: record, kind, account, verdict tag, flagged tag. Boundary eval table: Value, Expected, Returned, Result (non-matched rows first; matched rows beyond the first few behind a "Show N more" button). Trace eval table: Agent, Check, Outcome, Details (`summary`). Steps table: #, Turn, Kind, Detail, Outcome; a reader's steps are indented under their `read_part` step. Clicking a step shows its `detail` and `usage` as JSON. Documents: a link per file |
| `/settings` Settings | **Account instructions**: Account select; two text areas labelled "Reading a document" and "Choosing and combining parts"; buttons "Save draft", "Run this draft", "Make current" (enabled only when the draft's latest run passed); versions table (Version, Status, Saved, Last run). **Agent design**: per agent, Model select and a Tools checkbox (`read_part` checked and disabled; `read_section` editable), "Save design"; the two core instruction files, collapsed, read-only. **Golden set**: version and the records table |

## 7. Out of scope

Override of a failed run, comparing arbitrary pairs from the list, sign-in, held-out records, planted documents, spending limits, retries beyond the one in `model-client`, re-scoring, any versioning of the scorer.

## 8. Done means

1. `./start.sh` brings up both sides; the page opens at http://127.0.0.1:5180.
2. A run over all golden records finishes; every table has rows; the five screens show them.
3. Turning on `read_section` in Settings and running again produces a second run; Compare shows `reader.tools` differed and the reader checks going from Not applicable to results.
4. Saving a draft for an account, running it, and making it current works end to end.
5. `npm run check` runs and exits with pass or fail.
6. The database opens in a client app while the app runs.
