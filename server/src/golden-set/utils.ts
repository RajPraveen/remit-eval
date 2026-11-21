// File helpers for the golden set: where a part's file lives, its type, and turning it into text or PDF pages.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mammoth from 'mammoth';
import { PDFDocument } from 'pdf-lib';
import * as XLSX from 'xlsx';
import type { PartInfo } from '../../../shared/types';
import { GOLDEN_DIR } from '../config';

export const BODY_PART = 'email body';
export const BODY_FILE = 'body.txt';
export const PAGES_PER_SECTION = 2;

const TYPES: Record<string, PartInfo['type']> = {
  '.pdf': 'pdf',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image',
  '.xlsx': 'spreadsheet', '.xls': 'spreadsheet', '.csv': 'spreadsheet',
  '.docx': 'document', '.txt': 'document', '.html': 'document', '.htm': 'document',
};

export const sha256 = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export const arrivalDir = (recordId: string) => path.join(GOLDEN_DIR, recordId, 'arrival');

export function fileOf(recordId: string, part: string): string {
  const file = part === BODY_PART ? BODY_FILE : part;
  return path.join(arrivalDir(recordId), file);
}

export function typeOf(file: string): PartInfo['type'] {
  if (file === BODY_FILE) return 'text';
  return TYPES[path.extname(file).toLowerCase()] ?? 'document';
}

export function imageMime(file: string): string {
  return path.extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
}

async function loadPdf(file: string): Promise<PDFDocument> {
  return PDFDocument.load(fs.readFileSync(file), { ignoreEncryption: true });
}

export async function pdfPageCount(file: string): Promise<number> {
  const pdf = await loadPdf(file);
  return pdf.getPageCount();
}

/** One section (1-based) of a PDF, cut into its own PDF. */
export async function pdfSection(file: string, section: number): Promise<Buffer> {
  const source = await loadPdf(file);
  const first = (section - 1) * PAGES_PER_SECTION;
  const last = Math.min(first + PAGES_PER_SECTION, source.getPageCount());
  const pageIndexes = Array.from({ length: last - first }, (_, i) => first + i);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(source, pageIndexes);
  pages.forEach((p) => out.addPage(p));
  return Buffer.from(await out.save());
}

export async function asText(file: string): Promise<string> {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') return spreadsheetText(file);
  if (ext === '.docx') return (await mammoth.extractRawText({ path: file })).value;
  const text = fs.readFileSync(file, 'utf8');
  if (ext === '.html' || ext === '.htm') return stripTags(text);
  return text;
}

function spreadsheetText(file: string): string {
  const book = XLSX.read(fs.readFileSync(file));
  const sheets = book.SheetNames.map((name) => `Sheet ${name}\n${XLSX.utils.sheet_to_csv(book.Sheets[name])}`);
  return sheets.join('\n\n');
}

function stripTags(html: string): string {
  const withoutCode = html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ');
  const withoutTags = withoutCode.replace(/<[^>]+>/g, ' ');
  return withoutTags.replace(/[ \t]+/g, ' ');
}
