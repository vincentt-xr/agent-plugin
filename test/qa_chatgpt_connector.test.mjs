// The ChatGPT connector package (connector/chatgpt), uploaded at platform.openai.com -> Plugins
// -> With MCP. OpenAI no longer publishes a standalone package validator, so these cases carry
// the rules from its submission guide and error reference (developers.openai.com/plugins/deploy/
// submission and /submission-errors), using the stricter final-directory limits.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CONNECTOR_DIR, buildZip, withOwnerFields } from '../build/zip-connector.mjs';

const manifest = JSON.parse(readFileSync(join(CONNECTOR_DIR, 'plugin.json'), 'utf8'));
const mcp = JSON.parse(readFileSync(join(CONNECTOR_DIR, 'mcp.json'), 'utf8'));
const oai = manifest.extensions['com.openai'];
const ui = oai.interface;

const oneLine = (s) => typeof s === 'string' && s.length > 0 && !/[\r\n]/.test(s);
const https = (s) => typeof s === 'string' && /^https:\/\/[^\s@]+$/.test(s) && s.length <= 1024;

test('QA-CGC-01: manifest identity fields meet the upload rules', () => {
  assert.match(manifest.name, /^[a-z0-9][a-z0-9-]{0,63}$/);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.description.length > 0 && manifest.description.length <= 1024);
  assert.ok(manifest.author.name.length > 0 && manifest.author.name.length <= 120);
  assert.ok(https(manifest.author.url) && https(manifest.homepage));
});

test('QA-CGC-02: listing fields meet the final directory limits', () => {
  assert.ok(oneLine(ui.displayName) && ui.displayName.length <= 30);
  assert.ok(oneLine(ui.shortDescription) && ui.shortDescription.length <= 30);
  assert.ok(ui.longDescription.length > 0 && ui.longDescription.length <= 4000);
  assert.ok(oneLine(ui.developerName) && ui.developerName.length <= 80);
  assert.ok(oneLine(ui.category));
  assert.ok(Array.isArray(ui.capabilities) && ui.capabilities.length >= 1 && ui.capabilities.length <= 20);
  for (const c of ui.capabilities) assert.ok(oneLine(c) && c.length <= 120, c);
  for (const k of ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']) assert.ok(https(ui[k]), k);
  assert.ok(ui.defaultPrompt.length <= 3 && new Set(ui.defaultPrompt).size === ui.defaultPrompt.length);
  for (const p of ui.defaultPrompt) assert.ok(oneLine(p) && p.length <= 128 && !p.includes('@'), p);
  assert.match(ui.brandColor, /^#[0-9A-Fa-f]{6}$/);
});

test('QA-CGC-03: logo and composer icon are square PNGs inside the package', () => {
  for (const k of ['logo', 'composerIcon']) {
    assert.match(ui[k], /^\.\/[^.][^\s]*\.png$/, k);
    const file = join(CONNECTOR_DIR, ui[k].slice(2));
    const buf = readFileSync(file);
    assert.equal(buf.subarray(1, 4).toString(), 'PNG', `${k} is a PNG`);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    assert.ok(w === h && w >= 48 && w <= 4096, `${k} is ${w}x${h}`);
    assert.ok(statSync(file).size <= 5 * 1024 * 1024);
  }
});

test('QA-CGC-04: review carries five positive and three negative cases, no credentials', () => {
  const { positive, negative } = oai.review.test_cases;
  assert.equal(positive.length, 5);
  assert.equal(negative.length, 3);
  for (const c of positive) for (const k of ['description', 'prompt', 'tools_triggered', 'expected_behavior']) assert.ok(c[k], k);
  for (const c of negative) for (const k of ['description', 'prompt']) assert.ok(c[k], k);
  assert.equal(oai.review.commerce, false);
  for (const banned of ['test_credentials', 'reviewer_instructions']) assert.ok(!(banned in oai.review), banned);
});

test('QA-CGC-05: exactly one remote server, the prod connector, with no headers or secrets', () => {
  const servers = Object.entries(mcp.mcpServers);
  assert.equal(servers.length, 1);
  const [, s] = servers[0];
  assert.equal(s.type, 'streamable-http');
  assert.equal(s.url, 'https://mcp.vincentt.studio/mcp');
  assert.ok(!s.headers || Object.keys(s.headers).length === 0);
  assert.ok(!JSON.stringify(mcp).includes('clientSecret'));
});

test('QA-CGC-06: no apps, hooks, or a local server; the skill has valid front matter', () => {
  const files = readdirSync(CONNECTOR_DIR, { recursive: true });
  assert.ok(!files.some((f) => /(^|\/)(\.app\.json|hooks?(\/|\.json))/.test(f)), files.join(','));
  assert.ok(!('apps' in oai) && !('hooks' in manifest) && !('hooks' in oai));
  assert.ok(!('command' in Object.values(mcp.mcpServers)[0]));
  const skill = readFileSync(join(CONNECTOR_DIR, oai.onboardingSkill.slice(2)), 'utf8');
  const fm = /^---\n([\s\S]*?)\n---\n([\s\S]+)$/.exec(skill);
  assert.ok(fm, 'front matter');
  assert.match(fm[1], /^name: get-started$/m);
  const desc = /^description: (.+)$/m.exec(fm[1]);
  assert.ok(desc && desc[1].length <= 1024);
  assert.ok(`${manifest.name}:get-started`.length <= 64);
  assert.ok(fm[2].trim().length > 0);
});

test('QA-CGC-07: owner-only fields are absent from source and applied only at build time', () => {
  assert.ok(!('countries' in oai.publication), 'countries are the owner\'s call');
  assert.ok(!('demo_recording_url' in oai.review), 'the demo video is the owner\'s');
  const m = withOwnerFields(manifest, { countries: 'us, gb', demoUrl: 'https://example.com/demo' });
  assert.deepEqual(m.extensions['com.openai'].publication.countries, ['US', 'GB']);
  assert.equal(m.extensions['com.openai'].review.demo_recording_url, 'https://example.com/demo');
  assert.throws(() => withOwnerFields(manifest, { countries: 'USA' }));
  assert.throws(() => withOwnerFields(manifest, { demoUrl: 'http://x' }));
  assert.ok(!('countries' in manifest.extensions['com.openai'].publication), 'source not mutated');
});

test('QA-CGC-08: the ZIP has one plugin root at the archive root', () => {
  const out = mkdtempSync(join(tmpdir(), 'cgc-zip-'));
  try {
    const { zip } = buildZip(['--out', out]);
    assert.ok(existsSync(zip));
    const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n');
    assert.ok(names.includes('plugin.json') && names.includes('mcp.json'), names.join(','));
    assert.ok(names.includes('skills/get-started/SKILL.md'));
    assert.ok(names.every((n) => !n.startsWith('/') && !n.includes('..') && !n.includes('\\')));
    assert.ok(names.length <= 5000);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
