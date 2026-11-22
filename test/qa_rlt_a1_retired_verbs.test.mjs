// QA-F14-A1 (retire-laptop-tunnel) · the grounding never tells an agent to run a retired verb.
// Scans the source procedure, every rendered copy (Claude Code, ChatGPT, AGENTS section) and the
// directory README. The retired set mirrors toolchain packages/cli/src/cli/retiredVerbs.ts; the
// toolchain's QA-F3-R4 pins that list, so a drift shows there first.

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RETIRED = ['preview', 'relay', 'logs', 'network', 'trace', 'dev'];

const COPIES = [
  'recognition.md',
  'hosts/self-serve/SKILL.md',
  'dist/AGENTS.section.md',
  'dist/chatgpt/skills/ar/SKILL.md',
  'dist/claude-code/skills/ar/SKILL.md',
  'dist/claude-code/README.md',
  'README.md',
];

// "vincentt preview", "npx vincentt logs --errors", a code span that is just the verb, or
// "run `preview`" style instructions.
const asCommand = (v) => new RegExp(`(vincentt\\s+${v}\\b|\`${v}\`)`, 'i');

for (const file of COPIES) {
  test(`QA-F14-A1 · ${file} names no retired verb as a command`, () => {
    const p = join(ROOT, file);
    assert.ok(existsSync(p), `${file} is missing`);
    const text = readFileSync(p, 'utf8');
    for (const v of RETIRED) {
      assert.ok(!asCommand(v).test(text), `${file} still names \`${v}\` as a command`);
    }
  });
}

for (const file of COPIES.filter((f) => f !== 'README.md' && !f.endsWith('README.md'))) {
  test(`QA-F14-A1 · ${file} names the build and test-link path instead`, () => {
    const text = readFileSync(join(ROOT, file), 'utf8');
    assert.match(text, /vincentt test-link/);
  });
}
