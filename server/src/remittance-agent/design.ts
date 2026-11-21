// The developer's design (design.json) and the core prompts, as the Settings page shows and saves them.
import fs from 'node:fs';
import path from 'node:path';
import type { Design, DesignView } from '../../../shared/types';
import { DESIGN_FILE, PROMPTS_DIR } from '../config';

const MODELS = ['anthropic/claude-opus-5.5', 'anthropic/claude-sonnet-5.5', 'anthropic/claude-haiku-5.5'];

export function designView(): DesignView {
  return {
    design: loadDesign(),
    core: { orchestrator: readPrompt('orchestrator'), reader: readPrompt('reader') },
    models: MODELS,
  };
}

export function loadDesign(): Design {
  return JSON.parse(fs.readFileSync(DESIGN_FILE, 'utf8'));
}

export function saveDesign(design: Design): void {
  fs.writeFileSync(DESIGN_FILE, JSON.stringify(design, null, 2) + '\n');
}

export function readPrompt(agent: 'orchestrator' | 'reader'): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, `${agent}.md`), 'utf8');
}
