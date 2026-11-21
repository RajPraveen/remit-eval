# Remit Eval

An eval system for a remittance-extraction agent. It runs the agent on a golden set of remittances, judges each
answer (boundary eval) and how the agent got there (trace eval), and fails a run that got worse than the baseline.

`SPEC.md` describes the design. The code is laid out by what the app does:

| Folder | What it holds |
|---|---|
| `server/src/eval-run` | Start a run, work each record, evaluate, decide the gate. Start reading here. |
| `server/src/remittance-agent` | The agent being evaluated: orchestrator, reader, prompts, `design.json` |
| `server/src/boundary-eval` | Is the answer right? |
| `server/src/trace-eval` | Did the agent work properly? Five checks. |
| `server/src/gate` | Baseline, pass or fail, and the side-by-side comparison |
| `server/src/golden-set` | The golden records and their documents |
| `web/src` | The page: runs, one run, one record, compare, settings |
| `golden/` | The manifest and the expected answer for each record |

## Running it

Needs Node.js 20 or later.

1. Put an OpenRouter key in `.env` in this folder: `OPENROUTER_API_KEY=...`
2. Add the golden documents. They are not in this repository. Each record needs its original files under
   `golden/<record>/arrival/`, as listed in `golden/manifest.json`. A run stops if a file does not match its
   fingerprint in the manifest.
3. `./start.sh`, then open http://127.0.0.1:5180. `./stop.sh` stops it.

`npm run check` runs the whole golden set from the terminal and exits with 0 on pass and 1 on fail.

A run of the five records makes about 30 model calls and costs about $0.20.
