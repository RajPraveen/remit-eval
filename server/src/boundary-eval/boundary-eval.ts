// Boundary eval: is the answer right? Compares the agent's answer with the expected answer for one result.
// Plain code, no model calls.
import type { Answer, BoundaryDetails, ExpectedAnswer, ReadOutput } from '../../../shared/types';
import { db, toJson } from '../database/database';
import { pairRows, sameAmount, sameReference } from './utils';

const INSERT_BOUNDARY_EVAL = db.prepare(
  'INSERT INTO boundary_evals (result_id, verdict, flagged, details) VALUES (?, ?, ?, ?)',
);

export function writeBoundaryEval(resultId: number, expected: ExpectedAnswer, answer: Answer | null): void {
  const { verdict, flagged, details } = boundaryEval(expected, answer);
  INSERT_BOUNDARY_EVAL.run(resultId, verdict, flagged, toJson(details));
}

/** Right only when the payment reference, payment amount and every invoice row match. */
export function boundaryEval(expected: ExpectedAnswer, answer: Answer | null) {
  const details = boundaryDetails(expected, answer);
  const allRowsMatched = details.invoices.every((r) => r.result === 'matched');
  const referenceRight = details.payment_reference.result === 'match';
  const amountRight = details.payment_amount.result === 'match';
  const right = !!answer && referenceRight && amountRight && allRowsMatched;
  const flagged = answer && answer.concerns.length > 0 ? 'yes' : 'no';
  return { verdict: right ? 'right' : 'wrong', flagged, details } as const;
}

function boundaryDetails(expected: ExpectedAnswer, answer: ReadOutput | null): BoundaryDetails {
  const returned = answer?.invoices ?? [];
  const invoices = pairRows(expected.invoices, returned);
  const count = (result: string) => invoices.filter((r) => r.result === result).length;
  const details: BoundaryDetails = {
    payment_reference: {
      expected: expected.payment_reference,
      returned: answer?.payment_reference ?? null,
      result: answer && sameReference(expected.payment_reference, answer.payment_reference) ? 'match' : 'mismatch',
    },
    payment_amount: {
      expected: expected.payment_amount,
      returned: answer?.payment_amount ?? null,
      result: answer && sameAmount(expected.payment_amount, answer.payment_amount) ? 'match' : 'mismatch',
    },
    invoices,
    counts: {
      expected_rows: expected.invoices.length,
      returned_rows: returned.length,
      matched: count('matched'),
      missing: count('missing'),
      extra: count('extra'),
      wrong_amount: count('wrong_amount'),
    },
  };
  if (!answer) details.reason = 'did_not_finish';
  return details;
}
