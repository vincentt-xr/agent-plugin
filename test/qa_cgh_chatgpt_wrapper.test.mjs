// QA-CGH-01..03 — the ChatGPT / Codex wrapper.
//
// The cases assert the three properties the change record names: the wrapper is DISCOVERED
// (not listed in a test), the manifest declares skills and NOTHING that would be a connector,
// and every starter prompt resolves to a real section.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeOutputs,
  listWrappers,
  renderChatgptPlugin,
  renderDescription,
  renderLongDescription,
  readSource,
  CHATGPT_DIR,
  CHATGPT_SKILL_NAME,
} from '../build/assemble.mjs';
import { parseRecognition } from '../build/parse.mjs';
import { PINNED_ACTION_IDS, SECTION_CEILING } from '../build/pins.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// —— QA-CGH-01 · discovered, and the manifest is the union ————————————————————

test('QA-CGH-01 · the chatgpt wrapper is discovered from hosts/, not listed in a test', () => {
  const hosts = listWrappers().map((w) => w.host);
  assert.ok(hosts.includes('chatgpt'), 'chatgpt must be discovered from hosts/*/install.json');
  assert.deepEqual(hosts, [...hosts].sort(), 'wrappers are sorted, so the manifest is stable');
});

test('QA-CGH-01 · the install manifest grew to three hosts with no edit to the precondition check', () => {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'build/install-manifest.json'), 'utf8'));
  const hosts = manifest.wrappers.map((w) => w.host);
  assert.deepEqual(hosts, ['chatgpt', 'claude-code', 'self-serve']);

  // The manifest lists paths WE publish to. It must name no host APPLICATION and enumerate no
  // host directory — the property that keeps it from becoming host detection (tripwire (a)).
  const chatgpt = manifest.wrappers.find((w) => w.host === 'chatgpt');
  assert.ok(chatgpt.installPaths.length > 0);
  for (const p of chatgpt.installPaths) {
    assert.ok(!p.startsWith('/'), 'an install path is relative to a home, never absolute');
  }
});

// —— QA-CGH-02 · skills and nothing else ——————————————————————————————————————

test('QA-CGH-02 · the manifest declares skills and neither mcpServers nor apps', () => {
  const plugin = JSON.parse(renderChatgptPlugin(readSource()));

  assert.equal(plugin.skills, './skills/');
  assert.ok(!('mcpServers' in plugin), 'an .mcp.json reference would be the connector f14 refused');
  assert.ok(!('apps' in plugin), 'an .app.json reference would be the connector f14 refused');

  // D-The-plugin-declares-no-connect-action: nothing anywhere in the manifest may describe a
  // connection step. Asserted over the serialized form so a nested field cannot smuggle one in.
  const serialized = JSON.stringify(plugin).toLowerCase();
  for (const forbidden of ['mcp', 'oauth', 'connect']) {
    assert.ok(!serialized.includes(forbidden), `manifest must not mention "${forbidden}"`);
  }
});

test('QA-CGH-02 · description is byte-identical to what the other wrappers carry', () => {
  const source = readSource();
  const plugin = JSON.parse(renderChatgptPlugin(source));

  // The one field with real weight — it is what the host matches a person's words against, so
  // the three wrappers cannot be allowed to drift on it.
  assert.equal(plugin.description, renderDescription(source));
  assert.equal(plugin.interface.shortDescription, renderDescription(source));
  assert.equal(plugin.interface.longDescription, renderLongDescription(source));
});

test('QA-CGH-02 · the skill body is byte-identical to the claude-code wrapper body', () => {
  const outputs = computeOutputs();
  const chatgpt = outputs.find((o) => o.path.includes(`${CHATGPT_DIR}/skills/`));
  const claude = outputs.find((o) => o.path.includes('dist/claude-code/skills/'));

  // Frontmatter differs (the skill name is resolved per host); the BODY may not. A wrapper that
  // carried a different body would be a second product wearing one name.
  const body = (s) => s.content.split('---').slice(2).join('---');
  assert.equal(body(chatgpt), body(claude));
});

test('QA-CGH-02 · a hand-edit of the generated manifest is detectable', () => {
  const path = join(REPO_ROOT, CHATGPT_DIR, '.codex-plugin/plugin.json');
  assert.ok(existsSync(path), 'the manifest is a tracked output');

  const onDisk = readFileSync(path, 'utf8');
  const rendered = computeOutputs().find((o) => o.path === path).content;
  assert.equal(onDisk, rendered, 'the tracked copy must equal a fresh render (QA-F14-03)');
});

// —— QA-CGH-03 · every starter prompt resolves ————————————————————————————————

test('QA-CGH-03 · there is exactly one starter prompt per pinned action, and no fifth row', () => {
  const plugin = JSON.parse(renderChatgptPlugin(readSource()));
  const prompts = plugin.interface.defaultPrompt;

  assert.equal(prompts.length, PINNED_ACTION_IDS.length);
  assert.ok(prompts.length <= SECTION_CEILING, 'a fifth row would be a fifth moment');
  assert.equal(new Set(prompts).size, prompts.length, 'no duplicate rows');
});

test('QA-CGH-03 · the prompt set is keyed by the pinned ids, so it cannot outgrow the source', () => {
  const doc = parseRecognition(readSource());
  const plugin = JSON.parse(renderChatgptPlugin(readSource()));

  // Tripwire (b): a prompt may not name a moment the grounding lacks. The prompts are derived
  // from the pinned ids, and the ids resolve to sections — so the count is the binding assertion.
  assert.equal(plugin.interface.defaultPrompt.length, doc.sections.length);
});

test('QA-CGH-03 · no starter prompt names a flag, a path, a URL, or an exit code', () => {
  const plugin = JSON.parse(renderChatgptPlugin(readSource()));

  for (const prompt of plugin.interface.defaultPrompt) {
    assert.ok(!/--[a-z]/.test(prompt), `prompt names a flag: "${prompt}"`);
    assert.ok(!/https?:\/\//.test(prompt), `prompt names a URL: "${prompt}"`);
    assert.ok(!/\.json|\.vincentt\//.test(prompt), `prompt names a path: "${prompt}"`);
    assert.ok(!/\bexits? \d+/i.test(prompt), `prompt names an exit code: "${prompt}"`);

    // A starter prompt is a sentence a person clicks to SPEAK, so unlike a menu label it is
    // written in the first person. That is the whole difference FORK-A turned on.
    assert.ok(/^[A-Z]/.test(prompt), `prompt opens as a sentence: "${prompt}"`);
    assert.ok(prompt.endsWith('.'), `prompt is a full sentence: "${prompt}"`);
  }
});

test('QA-CGH-03 · the skill name is bare inside the plugin and qualified on disk', () => {
  const install = JSON.parse(readFileSync(join(REPO_ROOT, 'hosts/chatgpt/install.json'), 'utf8'));

  // The same split the Claude Code wrapper makes: the install path shares a namespace with every
  // other publisher on the machine, the skill name resolves inside our own plugin directory.
  assert.equal(CHATGPT_SKILL_NAME, 'ar');
  assert.ok(install.installPaths.some((p) => p.endsWith('vincentt-ar')));
});
