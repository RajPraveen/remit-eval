// The parts of a record's arrival, and each part (or one section of it) ready for a model.
import fs from 'node:fs';
import path from 'node:path';
import type { PartInfo } from '../../../shared/types';
import type { ContentPart } from '../remittance-agent/model-client';
import {
  arrivalDir, asText, BODY_FILE, BODY_PART, fileOf, imageMime, PAGES_PER_SECTION, pdfPageCount, pdfSection, typeOf,
} from './utils';

export { BODY_PART, PAGES_PER_SECTION } from './utils';

export async function listParts(recordId: string): Promise<PartInfo[]> {
  const files = fs.readdirSync(arrivalDir(recordId)).filter((f) => !f.startsWith('.')).sort();
  // The email body always comes first, then the attachments by name.
  const ordered = [...files.filter((f) => f === BODY_FILE), ...files.filter((f) => f !== BODY_FILE)];
  return Promise.all(ordered.map((file) => partInfo(recordId, file)));
}

async function partInfo(recordId: string, file: string): Promise<PartInfo> {
  const type = typeOf(file);
  const sections = type === 'pdf' ? await pdfSectionCount(path.join(arrivalDir(recordId), file)) : 1;
  return { name: file === BODY_FILE ? BODY_PART : file, type, sections };
}

async function pdfSectionCount(file: string): Promise<number> {
  const pages = await pdfPageCount(file);
  return Math.ceil(pages / PAGES_PER_SECTION);
}

/** The whole part, or one section (1-based) of it, as model content. */
export async function partContent(recordId: string, part: PartInfo, section?: number): Promise<ContentPart[]> {
  const file = fileOf(recordId, part.name);
  if (part.type === 'pdf') return [await pdfContent(file, part, section)];
  if (part.type === 'image') return [imageContent(file)];
  return [{ type: 'text', text: await asText(file) }];
}

async function pdfContent(file: string, part: PartInfo, section?: number): Promise<ContentPart> {
  const bytes = section ? await pdfSection(file, section) : fs.readFileSync(file);
  const filename = section ? `${path.parse(part.name).name}-section-${section}.pdf` : part.name;
  const fileData = `data:application/pdf;base64,${bytes.toString('base64')}`;
  return { type: 'file', file: { filename, file_data: fileData } };
}

function imageContent(file: string): ContentPart {
  const base64 = fs.readFileSync(file).toString('base64');
  return { type: 'image_url', image_url: { url: `data:${imageMime(file)};base64,${base64}` } };
}

/** The page range a section covers: "11-20" for a PDF, "all" otherwise. */
export async function sectionPages(recordId: string, part: PartInfo, section: number): Promise<string> {
  if (part.type !== 'pdf') return 'all';
  const total = await pdfPageCount(fileOf(recordId, part.name));
  const first = (section - 1) * PAGES_PER_SECTION + 1;
  const last = Math.min(first + PAGES_PER_SECTION - 1, total);
  return first === last ? `${first}` : `${first}-${last}`;
}
