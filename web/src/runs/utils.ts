// Pure helpers for the Runs page.

/** Scope choices for a new run: all records first, then one per account. */
export function scopeOptions(accounts: string[]): { value: string; label: string }[] {
  return [{ value: 'all', label: 'All records' }, ...accounts.map((a) => ({ value: a, label: a }))];
}
