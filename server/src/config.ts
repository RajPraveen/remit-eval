// Paths and the port. Every other module reads its locations from here.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = path.join(SRC_DIR, 'remittance-agent');

export const SERVER_DIR = path.resolve(SRC_DIR, '..');
export const APP_DIR = path.resolve(SERVER_DIR, '..');
export const GOLDEN_DIR = path.resolve(process.env.GOLDEN_DIR || path.join(APP_DIR, 'golden'));
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(APP_DIR, 'data'));
export const PROMPTS_DIR = path.join(AGENT_DIR, 'prompts');
export const DESIGN_FILE = path.join(AGENT_DIR, 'design.json');
export const SCHEMA_FILE = path.join(SRC_DIR, 'database', 'schema.sql');
export const PORT = 8770;
