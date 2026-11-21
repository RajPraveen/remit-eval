// Pure helpers for the Settings cards.
import type { GoldenRecord } from '../../../shared/types';
import { shortModel } from '../shared/format';

export function accountOptions(accounts: string[]) {
  return accounts.map((a) => ({ value: a, label: a }));
}

export function modelOptions(models: string[]) {
  return models.map((m) => ({ value: m, label: shortModel(m) }));
}

export function fileNames(record: GoldenRecord): string {
  return record.files.map((f) => f.name).join(', ');
}
