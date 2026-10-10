#!/usr/bin/env node
// Points the Claude Code marketplace entry at a release: writes release-pin.json, then re-renders
// every output so marketplace.json follows. The release workflow runs this on main after a tag
// passes and opens the result as a PR; it can be run by hand the same way.
//
//   node build/pin-release.mjs <tag> <sha>

import { writeFileSync } from 'node:fs';
import { isMain } from './is-main.mjs';
import { RELEASE_PIN_PATH, parseReleasePin, write } from './assemble.mjs';

export function renderReleasePin(tag, sha) {
  const json = `${JSON.stringify({ tag, sha }, null, 2)}\n`;
  if (!parseReleasePin(json)) throw new Error('a release pin needs both a tag and a sha.');
  return json;
}

if (isMain(import.meta.url)) {
  const [tag, sha] = process.argv.slice(2);
  try {
    writeFileSync(RELEASE_PIN_PATH, renderReleasePin(tag ?? null, sha ?? null));
    write();
    console.log(`Pinned the Claude Code marketplace entry to ${tag} (${sha}).`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
