// The golden set: its records, each record's expected answer, and a check that no file changed.
import fs from 'node:fs';
import path from 'node:path';
import type { ExpectedAnswer, GoldenRecord, GoldenSet } from '../../../shared/types';
import { GOLDEN_DIR } from '../config';
import { sha256 } from './utils';

export function loadGoldenSet(): GoldenSet {
  const manifest = fs.readFileSync(path.join(GOLDEN_DIR, 'manifest.json'), 'utf8');
  return JSON.parse(manifest);
}

export function getRecord(recordId: string): GoldenRecord {
  const record = loadGoldenSet().records.find((r) => r.id === recordId);
  if (!record) throw new Error(`No golden record ${recordId}`);
  return record;
}

export function getExpected(recordId: string): ExpectedAnswer {
  const expected = fs.readFileSync(filePath(recordId, 'expected.json'), 'utf8');
  return JSON.parse(expected);
}

export function accounts(): string[] {
  const all = loadGoldenSet().records.map((r) => r.account);
  return [...new Set(all)];
}

export function recordsInScope(scope: string): GoldenRecord[] {
  return loadGoldenSet().records.filter((r) => scope === 'all' || r.account === scope);
}

/**
 * A manifest name is relative to the record folder ("arrival/remit.pdf").
 * A bare name other than expected.json is under arrival/.
 */
export function filePath(recordId: string, name: string): string {
  const folder = path.join(GOLDEN_DIR, recordId);
  const underRecord = name === 'expected.json' || name.includes('/');
  return underRecord ? path.join(folder, name) : path.join(folder, 'arrival', name);
}

/** Returns null when every file matches its sha256, else a one-line error. */
export function verifyFiles(): string | null {
  for (const record of loadGoldenSet().records) {
    for (const file of record.files) {
      const full = filePath(record.id, file.name);
      if (!fs.existsSync(full)) return `${record.id}/${file.name} is missing`;
      if (sha256(full) !== file.sha256) return `${record.id}/${file.name} does not match its sha256`;
    }
  }
  return null;
}
