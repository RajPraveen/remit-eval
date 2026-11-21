// The SQLite connection. WAL mode so another app can read the file while this one runs.
// Creates the six tables from schema.sql on first start.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DATA_DIR, SCHEMA_FILE } from '../config';

fs.mkdirSync(DATA_DIR, { recursive: true });
export const db = new Database(path.join(DATA_DIR, 'remit-eval.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'));

export const now = () => new Date().toISOString();

export const toJson = (value: unknown) => (value === undefined || value === null ? null : JSON.stringify(value));

export const fromJson = <T>(text: string | null): T | null => (text === null ? null : (JSON.parse(text) as T));
