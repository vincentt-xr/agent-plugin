#!/usr/bin/env node
// Builds the ChatGPT connector plugin ZIP for upload at platform.openai.com (Plugins -> With MCP).
//
//   node build/zip-connector.mjs [--countries US,GB] [--demo-url https://...] [--out <dir>]
//
// The package source is connector/chatgpt/. Two review fields are owner-only and are never
// committed: the country list and the demo video. Pass them here at build time; without them the
// ZIP omits both, which the portal accepts at upload and asks for before "Submit for review".
// The ZIP holds the package files at its root (one plugin root, no sibling files), as the portal
// requires.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './is-main.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CONNECTOR_DIR = join(ROOT, 'connector', 'chatgpt');

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** The manifest with the owner-only fields applied. Pure, so the test can call it. */
export function withOwnerFields(manifest, { countries, demoUrl } = {}) {
  const m = structuredClone(manifest);
  const oai = m.extensions['com.openai'];
  if (countries) {
    const list = countries.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (!list.every((c) => /^[A-Z]{2}$/.test(c))) throw new Error(`--countries takes two-letter codes, got ${countries}`);
    oai.publication = { ...oai.publication, countries: list };
  }
  if (demoUrl) {
    if (!/^https:\/\/\S+$/.test(demoUrl)) throw new Error(`--demo-url must be an https URL, got ${demoUrl}`);
    oai.review = { ...oai.review, demo_recording_url: demoUrl };
  }
  return m;
}

export function buildZip(argv) {
  const manifest = JSON.parse(readFileSync(join(CONNECTOR_DIR, 'plugin.json'), 'utf8'));
  const out = resolve(arg(argv, '--out') ?? join(ROOT, 'out'));
  const finalManifest = withOwnerFields(manifest, { countries: arg(argv, '--countries'), demoUrl: arg(argv, '--demo-url') });

  const stage = mkdtempSync(join(tmpdir(), 'vincentt-connector-'));
  try {
    cpSync(CONNECTOR_DIR, stage, { recursive: true });
    writeFileSync(join(stage, 'plugin.json'), `${JSON.stringify(finalManifest, null, 2)}\n`);
    mkdirSync(out, { recursive: true });
    const zip = join(out, `${manifest.name}-${manifest.version}.zip`);
    rmSync(zip, { force: true });
    // -X drops extra file attributes; -D drops directory entries so only files are listed.
    execFileSync('zip', ['-r', '-X', '-D', '-q', zip, '.'], { cwd: stage });
    return { zip, countries: finalManifest.extensions['com.openai'].publication.countries ?? null,
      demoUrl: finalManifest.extensions['com.openai'].review.demo_recording_url ?? null };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) {
  const r = buildZip(process.argv.slice(2));
  console.log(`built ${r.zip}`);
  if (!r.countries) console.log('countries: not set (owner sets them with --countries or in the portal)');
  if (!r.demoUrl) console.log('demo video: not set (required before submitting for review; pass --demo-url)');
}
