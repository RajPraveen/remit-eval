// `npm run check`: runs the whole golden set, prints one line per record and what changed against the
// baseline, and exits 0 when the gate passes.
import type { CheckTally } from '../../shared/types';
import { ensureAccounts } from './account-instructions/account-instructions';
import { runStatus, startRun } from './eval-run/eval-run';
import { compare } from './gate/compare';
import { accounts } from './golden-set/golden-set';
import { runDetail } from './run-views/run-views';

main().then((code) => process.exit(code), (error) => {
  console.error(error.message);
  process.exit(1);
});

async function main(): Promise<number> {
  ensureAccounts(accounts());
  const runId = startRun({ scope: 'all', started_by: 'command' });
  console.log(`Run ${runId} started`);
  while (runStatus(runId) === 'running') await sleep(2000);
  const run = runDetail(runId);
  if (run.status === 'failed') {
    console.log(`Run ${runId} failed: ${run.error}`);
    return 1;
  }
  for (const r of run.records) {
    const verdict = r.status === 'did_not_finish' ? 'did not finish' : r.verdict;
    console.log(`${r.record_id}  ${verdict}  orchestrator ${passed(r.orchestrator)}  reader ${passed(r.reader)}`);
  }
  if (run.compared_to) printChanges(run.compared_to, runId);
  else console.log('No baseline');
  console.log(`Gate: ${run.gate}`);
  return run.gate === 'pass' ? 0 : 1;
}

function printChanges(baseId: number, runId: number): void {
  const changes = compare(baseId, runId).changed_records;
  console.log(changes.length ? `Changed against run ${baseId}:` : `No records changed against run ${baseId}`);
  for (const c of changes) {
    const worse = c.worse ? '  (worse)' : '';
    console.log(`  ${c.record_id}  ${c.what}: ${c.base} -> ${c.run}${worse}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** "4 of 5": checks passed out of those that applied. */
function passed(tally: CheckTally): string {
  return `${tally.pass} of ${tally.pass + tally.fail}`;
}
