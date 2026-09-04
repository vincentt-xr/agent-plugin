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
  renderChatgptSkill,
  renderChatgptActionSkills,
  renderClaudeCodeCommands,
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
  // NAME THE SKILL. A substring match on `skills/` selected whichever output sorted first, which
  // was `ar` only by luck of generation order — once the four action skills joined the tree, the
  // same assertion could have compared a POINTER body against the full one and passed for the
  // wrong reason. The comparison is only meaningful about the skill that carries recognition.md.
  const chatgpt = outputs.find((o) => o.path.endsWith(`${CHATGPT_DIR}/skills/${CHATGPT_SKILL_NAME}/SKILL.md`));
  const claude = outputs.find((o) => o.path.endsWith('dist/claude-code/skills/ar/SKILL.md'));
  assert.ok(chatgpt && claude, 'both full-body skills resolve by name');

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

// —— QA-CGH-04 · each marketplace names its OWN build ————————————————————————

test('QA-CGH-04 · the two marketplace manifests point at different builds', () => {
  const chatgpt = JSON.parse(readFileSync(join(REPO_ROOT, '.agents/plugins/marketplace.json'), 'utf8'));
  const claude = JSON.parse(readFileSync(join(REPO_ROOT, '.claude-plugin/marketplace.json'), 'utf8'));

  // This host accepts the Claude Code path as legacy-compatible, so a single manifest would
  // resolve — and would serve dist/claude-code, whose commands belong to a host this one is not.
  // The failure is silent: an install succeeds and the creator gets the wrong build.
  assert.equal(chatgpt.plugins[0].source.path, './dist/chatgpt');
  assert.equal(claude.plugins[0].source, './dist/claude-code');
  assert.notEqual(chatgpt.plugins[0].source.path, claude.plugins[0].source);
});

test('QA-CGH-04 · the chatgpt marketplace description matches the wrapper it names', () => {
  const source = readSource();
  const marketplace = JSON.parse(readFileSync(join(REPO_ROOT, '.agents/plugins/marketplace.json'), 'utf8'));

  assert.equal(marketplace.metadata.description, renderDescription(source));
  assert.equal(marketplace.plugins[0].description, renderLongDescription(source));
});

test('QA-CGH-03 · the skill name is bare inside the plugin and qualified on disk', () => {
  const install = JSON.parse(readFileSync(join(REPO_ROOT, 'hosts/chatgpt/install.json'), 'utf8'));

  // The same split the Claude Code wrapper makes: the install path shares a namespace with every
  // other publisher on the machine, the skill name resolves inside our own plugin directory.
  assert.equal(CHATGPT_SKILL_NAME, 'ar');
  assert.ok(install.installPaths.some((p) => p.endsWith('vincentt-ar')));
});

// —— QA-CGH-05 · the manifest satisfies the host's own validation ——————————————
//
// This host VALIDATES a manifest before it will load it, against a fixed key allowlist and a
// set of required interface fields. Both arms below were REGRESSIONS FOUND IN SHIPPED OUTPUT:
// the directory listing carried a `generated` stamp the allowlist rejects, and omitted the
// required `capabilities`. A green suite proved nothing, because nothing here ran the host's
// rules. These cases are that check, transcribed — not a restatement of the renderer.

test('QA-CGH-05 · the manifest carries no key the host rejects', () => {
  const plugin = JSON.parse(renderChatgptPlugin(readSource()));

  // Transcribed from the host's validator. `generated` is absent from it by design: every other
  // output this repo emits carries that stamp and this one may not.
  const ALLOWED = new Set([
    'id', 'name', 'version', 'description', 'skills', 'apps', 'mcpServers',
    'interface', 'author', 'homepage', 'repository', 'license', 'keywords',
  ]);
  const rejected = Object.keys(plugin).filter((k) => !ALLOWED.has(k));
  assert.deepEqual(rejected, [], 'a key outside the allowlist fails the host, not this suite');
});

test('QA-CGH-05 · every interface field the host requires is present and non-empty', () => {
  const { interface: iface } = JSON.parse(renderChatgptPlugin(readSource()));

  for (const field of ['displayName', 'shortDescription', 'longDescription', 'developerName', 'category']) {
    assert.equal(typeof iface[field], 'string');
    assert.ok(iface[field].trim().length > 0, `interface.${field} must be a non-empty string`);
  }
  assert.ok(Array.isArray(iface.capabilities) && iface.capabilities.length > 0);
  assert.ok(
    iface.capabilities.every((c) => typeof c === 'string' && c.trim().length > 0),
    'capabilities must be an array of non-empty strings',
  );
});

test('QA-CGH-05 · capabilities are the pinned moments, so they cannot drift from the source', () => {
  const { interface: iface } = JSON.parse(renderChatgptPlugin(readSource()));
  const labels = parseRecognition(readSource()).sections.map((s) => s.heading);

  // Keyed by the pinned ids like the prompts are: a fifth capability is a fifth moment, which
  // is a record change before it is ever a row in a third party's directory.
  assert.equal(iface.capabilities.length, PINNED_ACTION_IDS.length);
  assert.ok(iface.capabilities.length <= SECTION_CEILING, 'a fifth row would be a fifth moment');
  assert.equal(new Set(iface.capabilities).size, iface.capabilities.length, 'no duplicate rows');
  assert.equal(labels.length, iface.capabilities.length, 'one capability per section');
});

// —— QA-CGH-06 · the marketplace entry carries a comparable version ————————————

test('QA-CGH-06 · the chatgpt marketplace entry names the version the host compares against', () => {
  const marketplace = JSON.parse(readFileSync(join(REPO_ROOT, '.agents/plugins/marketplace.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));

  // Fixed once for the Claude Code entry and not here, so this host kept the bug the other one
  // shed: with no version, an installed copy and a marketplace several commits ahead both read
  // as current and the listing offers no update. Both entries are asserted so the next fix to
  // either cannot land on one alone.
  assert.equal(marketplace.plugins[0].version, pkg.version);

  const claude = JSON.parse(readFileSync(join(REPO_ROOT, '.claude-plugin/marketplace.json'), 'utf8'));
  assert.equal(claude.plugins[0].version, pkg.version);
});

// —— QA-CGH-07 · the four moments are reachable inside the plugin ——————————————
//
// Before these, this host's listing showed ONE component where the Claude Code panel showed
// five, and the four moments were reachable only as starter prompts on the directory page. The
// four are the feature; a host that cannot see them carries less than the product, not less of
// the packaging.

test('QA-CGH-07 · there is one action skill per pinned id, and no fifth', () => {
  const skills = renderChatgptActionSkills(readSource());

  assert.equal(skills.length, PINNED_ACTION_IDS.length);
  assert.ok(skills.length <= SECTION_CEILING, 'a fifth skill would be a fifth moment');
  assert.equal(new Set(skills.map((s) => s.name)).size, skills.length, 'names are distinct');
  assert.ok(!skills.some((s) => s.name === CHATGPT_SKILL_NAME), 'none may shadow the body skill');
});

test('QA-CGH-07 · the action skills and the claude-code commands are the same four', () => {
  const source = readSource();
  const skills = renderChatgptActionSkills(source).map((s) => s.name);
  const commands = renderClaudeCodeCommands(source).map((c) => c.name);

  // THE SAME ACTIONS in two shapes. A name that existed on one host and not the other would be
  // the per-host affordance the wrapper rules exist to prevent — the check that keeps the two
  // trees honest is that the sets match, not that each looks reasonable alone.
  assert.deepEqual(skills, commands);
});

test('QA-CGH-07 · an action skill POINTS at the body skill and never copies it', () => {
  const source = readSource();
  const headings = parseRecognition(source).sections.map((s) => s.heading);
  const full = renderChatgptSkill(source, 'precedence.');

  for (const skill of renderChatgptActionSkills(source)) {
    assert.ok(
      skill.content.includes(`\`${CHATGPT_SKILL_NAME}\` skill's`),
      `${skill.name} must name the skill that carries the source`,
    );
    // A pointer is SHORT. A copy would put recognition.md in a creator's tree five times, and
    // would be the duplication the generated-not-authored rule exists to prevent.
    assert.ok(skill.content.length < full.length / 4, `${skill.name} must not restate the body`);
    assert.ok(
      headings.some((h) => skill.content.includes(h)),
      `${skill.name} must name a real section of recognition.md`,
    );
  }
});

test('QA-CGH-07 · every action skill carries the frontmatter the host requires', () => {
  for (const skill of renderChatgptActionSkills(readSource())) {
    const [, front] = skill.content.split('---');
    assert.match(front, /\nname: \S+/, 'a non-empty name');
    assert.match(front, /\ndescription: \S+/, 'a non-empty description');
    // The host refuses a plugin skill that opts out of model invocation.
    assert.ok(!front.includes('disable-model-invocation'), 'a plugin skill may not opt out');
  }
});

// —— QA-CGH-08 · the mark ——————————————————————————————————————————————————————

test('QA-CGH-08 · the icon fields resolve to files that exist in the built tree', () => {
  const { interface: iface } = JSON.parse(renderChatgptPlugin(readSource()));

  // The host validates that an asset path RESOLVES and checks nothing else — not the format and
  // not the dimensions. So the arm that matters is existence, and a path that points outside the
  // plugin root is the one the host rejects.
  for (const field of ['composerIcon', 'logo']) {
    const raw = iface[field];
    assert.ok(raw.startsWith('./'), `${field} must be relative to the plugin root`);
    assert.ok(!raw.includes('..'), `${field} must not escape the plugin root`);
    assert.ok(existsSync(join(REPO_ROOT, CHATGPT_DIR, raw)), `${field} must point at a real file`);
  }
});

test('QA-CGH-08 · the brand color is the mark’s own, in the form the host accepts', () => {
  const { interface: iface } = JSON.parse(renderChatgptPlugin(readSource()));

  assert.match(iface.brandColor, /^#[0-9a-fA-F]{6}$/, 'the host accepts #RRGGBB only');
  const svg = readFileSync(join(REPO_ROOT, CHATGPT_DIR, 'assets/logo.svg'), 'utf8');
  assert.ok(svg.includes(iface.brandColor), 'the color is read off the mark, not picked beside it');
});
