// The API: every route of the app, one line each. Routes only call the modules; the logic lives there.
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Design } from '../../shared/types';
import {
  ConflictError, ensureAccounts, getInstructions, makeCurrent, saveDraft,
} from './account-instructions/account-instructions';
import { PORT } from './config';
import { startRun } from './eval-run/eval-run';
import { compare } from './gate/compare';
import { accounts, filePath, getRecord, loadGoldenSet } from './golden-set/golden-set';
import { designView, saveDesign } from './remittance-agent/design';
import { listRuns, recordDetail, runDetail } from './run-views/run-views';

ensureAccounts(accounts());

const app = express();
app.use(express.json({ limit: '1mb' }));

app.post('/api/runs', route((req) => ({ id: startRun({ ...req.body, started_by: 'page' }) })));
app.get('/api/runs', route(() => listRuns()));
app.get('/api/runs/:id', route((req) => runDetail(runId(req))));
app.get('/api/runs/:id/records/:recordId', route((req) => recordDetail(runId(req), param(req, 'recordId'))));
app.get('/api/compare', route((req) => compare(Number(req.query.base), Number(req.query.run))));
app.get('/api/accounts', route(() => accounts()));
app.get('/api/accounts/:account/instructions', route((req) => getInstructions(account(req))));
app.post('/api/accounts/:account/instructions', route((req) => saveDraft(account(req), req.body)));
app.post('/api/accounts/:account/instructions/make-current', route((req) => makeCurrent(account(req))));
app.get('/api/design', route(() => designView()));
app.put('/api/design', route((req) => saveDesignAndView(req.body)));
app.get('/api/golden', route(() => loadGoldenSet()));
app.get('/api/golden/:recordId/files/:name', route((req, res) => sendRecordFile(req, res)));

app.use(sendError);

app.listen(PORT, '127.0.0.1', () => console.log(`Remit Eval API on http://127.0.0.1:${PORT}`));

type Handler = (req: Request, res: Response) => unknown;

/** Sends the handler's return value as JSON; a handler that returns nothing has answered itself. */
function route(handler: Handler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const value = await handler(req, res);
      if (value !== undefined) res.json(value);
    } catch (error) {
      next(error);
    }
  };
}

function param(req: Request, name: string): string {
  return String(req.params[name]);
}

const runId = (req: Request) => Number(param(req, 'id'));
const account = (req: Request) => param(req, 'account');

function saveDesignAndView(design: Design) {
  saveDesign(design);
  return designView();
}

/** A golden file shown in the browser. The name may be given with or without its arrival/ folder. */
function sendRecordFile(req: Request, res: Response): void {
  const recordId = param(req, 'recordId');
  const name = param(req, 'name');
  const file = getRecord(recordId).files.find((f) => f.name === name || f.name === `arrival/${name}`);
  if (!file) throw new Error(`No file ${name} in ${recordId}`);
  res.sendFile(filePath(recordId, file.name), { headers: { 'Content-Disposition': 'inline' } });
}

/** A conflict (a run already running, no draft, a draft that has not passed) is a 409; else a 500. */
function sendError(error: Error, _req: Request, res: Response, _next: NextFunction): void {
  res.status(error instanceof ConflictError ? 409 : 500).json({ error: error.message });
}
