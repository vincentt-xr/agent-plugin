// QA-F14-15..17 — the Claude plugin directory README.
//
// The directory refuses a plugin folder without a README of at least 40 words outside code
// blocks, and its security scan reads the README for what the plugin runs and sends.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeOutputs, CLAUDE_CODE_DIR } from '../build/assemble.mjs';
import { lintDisclosure } from '../build/lint.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const README_PATH = join(REPO_ROOT, CLAUDE_CODE_DIR, 'README.md');
const DIRECTORY_MIN_WORDS = 40;

function proseWords(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .split(/\s+/)
    .filter(Boolean).length;
}

test('QA-F14-15 · the Claude Code plugin folder ships a README the directory accepts', () => {
  assert.ok(existsSync(README_PATH), `${CLAUDE_CODE_DIR}/README.md must be generated`);
  const words = proseWords(readFileSync(README_PATH, 'utf8'));
  assert.ok(
    words >= DIRECTORY_MIN_WORDS,
    `README has ${words} words outside code blocks; the directory requires ${DIRECTORY_MIN_WORDS}`,
  );
});

test('QA-F14-16 · the README is generated, and carries the disclosure verbatim', () => {
  const output = computeOutputs().find((o) => o.path === README_PATH);
  assert.ok(output, 'the README is an assembler output, so --check catches a hand-edit');
  const disclosure = readFileSync(join(REPO_ROOT, 'disclosure.md'), 'utf8').trim();
  assert.ok(output.content.includes(disclosure), 'the disclosure must appear unedited');
});

test('QA-F14-17 · the disclosure is held to the source lint arms', () => {
  const shipped = readFileSync(join(REPO_ROOT, 'disclosure.md'), 'utf8');
  assert.deepEqual(lintDisclosure(shipped), []);

  const arms = (text) => lintDisclosure(text).map((v) => v.arm);
  assert.ok(arms('The tool runs vincentt publish on request.').includes('verb-pin'));
  assert.ok(arms('The tool accepts --yes.').includes('flag'));
  assert.ok(arms('The tool is version 1.2.3.').includes('semver'));
  assert.ok(arms('The tool signs you in.').includes('second-person'));
});
