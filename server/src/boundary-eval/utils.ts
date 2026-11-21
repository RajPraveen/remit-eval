// The matching rule (references ignore case and spaces, amounts compare to the cent) and pairing of
// expected invoice rows with returned ones.
import type { BoundaryDetails, InvoiceRow } from '../../../shared/types';

type PairedRow = BoundaryDetails['invoices'][number];

const squash = (reference: string) => reference.toLowerCase().replace(/\s+/g, '');

export const sameReference = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : squash(a) === squash(b);

export const cents = (n: number) => Math.round(n * 100);

export const sameAmount = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : cents(a) === cents(b);

export const sameRow = (a: InvoiceRow, b: InvoiceRow) =>
  sameReference(a.reference, b.reference) && sameAmount(a.amount, b.amount);

/**
 * Pairs each expected row with a returned row, each returned row used once.
 * Exact matches are taken first so a reference match cannot steal a row that matches exactly.
 * Order of the result: wrong amount and missing, then extra, then matched.
 */
export function pairRows(expected: InvoiceRow[], returned: InvoiceRow[]): BoundaryDetails['invoices'] {
  const { take, unused } = returnedPicker(returned);
  const matched: PairedRow[] = [];
  const leftover: InvoiceRow[] = [];
  for (const row of expected) {
    if (take((r) => sameRow(r, row)) >= 0) matched.push(matchedRow(row));
    else leftover.push(row);
  }
  const unmatched = leftover.map((row) => {
    const index = take((r) => sameReference(r.reference, row.reference));
    return unmatchedRow(row, returned, index);
  });
  const extra = unused().map(extraRow);
  return [...unmatched, ...extra, ...matched];
}

/** `take` uses the first returned row not yet used that matches and gives its index (-1 if none). */
function returnedPicker(returned: InvoiceRow[]) {
  const used = new Set<number>();
  const take = (match: (row: InvoiceRow) => boolean) => {
    const i = returned.findIndex((row, idx) => !used.has(idx) && match(row));
    if (i >= 0) used.add(i);
    return i;
  };
  const unused = () => returned.filter((_, i) => !used.has(i));
  return { take, unused };
}

function matchedRow(row: InvoiceRow): PairedRow {
  return { reference: row.reference, expected: row.amount, returned: row.amount, result: 'matched' };
}

function unmatchedRow(row: InvoiceRow, returned: InvoiceRow[], index: number): PairedRow {
  const { reference, amount } = row;
  if (index < 0) return { reference, expected: amount, returned: null, result: 'missing' };
  return { reference, expected: amount, returned: returned[index].amount, result: 'wrong_amount' };
}

function extraRow(row: InvoiceRow): PairedRow {
  return { reference: row.reference, expected: null, returned: row.amount, result: 'extra' };
}
