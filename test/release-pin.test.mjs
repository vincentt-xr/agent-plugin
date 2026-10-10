// The Claude Code marketplace entry installs a release tag, not the tip of main.
//
// Claude Code reads marketplace.json from the default branch. A relative `source` therefore hands
// creators whatever main holds, where no tag-time check has run. The pin fixes the entry to the
// release tag's commit; these cases guard the shape a host fetches and the inputs that would
// quietly pin something that is not a release.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReleasePin,
  renderClaudeCodeSource,
  renderClaudeCodeMarketplace,
  readSource,
  PACKAGE_VERSION,
} from '../build/assemble.mjs';
import { renderReleasePin } from '../build/pin-release.mjs';
import { resolveTagCommit } from '../build/check-pin.mjs';

const SHA = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';
const PIN = { tag: '1.2.3', sha: SHA };

test('a pinned entry is a git-subdir source fixed to the tag commit', () => {
  assert.deepEqual(renderClaudeCodeSource(PIN), {
    source: 'git-subdir',
    url: 'https://github.com/vincentt-xr/agent-plugin.git',
    path: 'dist/claude-code',
    ref: '1.2.3',
    sha: SHA,
  });
});

test('the pinned entry carries the tag version, not the version main has moved to', () => {
  const entry = JSON.parse(renderClaudeCodeMarketplace(readSource(), PIN)).plugins[0];
  assert.equal(entry.version, '1.2.3');
});

test('before the first release the entry falls back to the relative path', () => {
  assert.equal(parseReleasePin('{"tag": null, "sha": null}'), null);
  const entry = JSON.parse(renderClaudeCodeMarketplace(readSource(), null)).plugins[0];
  assert.equal(entry.source, './dist/claude-code');
  assert.equal(entry.version, PACKAGE_VERSION);
});

test('a half-set pin is refused rather than read as "no release"', () => {
  assert.throws(() => parseReleasePin(`{"tag": "1.2.3", "sha": null}`), /sha/);
  assert.throws(() => parseReleasePin(`{"tag": null, "sha": "${SHA}"}`), /tag/);
});

test('a v-prefixed tag, a branch name, or a short sha is not a release pin', () => {
  assert.throws(() => parseReleasePin(JSON.stringify({ tag: 'v1.2.3', sha: SHA })), /bare semver/);
  assert.throws(() => parseReleasePin(JSON.stringify({ tag: 'main', sha: SHA })), /bare semver/);
  assert.throws(() => parseReleasePin(JSON.stringify({ tag: '1.2.3', sha: SHA.slice(0, 7) })), /full/);
  assert.throws(() => parseReleasePin(JSON.stringify({ tag: '1.2.3', sha: SHA.toUpperCase() })), /full/);
  assert.throws(() => parseReleasePin('{not json'), /not valid JSON/);
});

test('pin-release writes a pin that parses back to itself', () => {
  assert.deepEqual(parseReleasePin(renderReleasePin('1.2.3', SHA)), PIN);
  assert.throws(() => renderReleasePin(null, null), /needs both/);
});

test('an annotated tag resolves to the commit, not the tag object', () => {
  const out = [`${'1'.repeat(40)}\trefs/tags/1.2.3`, `${SHA}\trefs/tags/1.2.3^{}`].join('\n');
  assert.equal(resolveTagCommit(out, '1.2.3'), SHA);
});

test('a lightweight tag resolves directly, and a similarly named tag does not match', () => {
  const out = [`${'2'.repeat(40)}\trefs/tags/1.2.30`, `${SHA}\trefs/tags/1.2.3`].join('\n');
  assert.equal(resolveTagCommit(out, '1.2.3'), SHA);
  assert.equal(resolveTagCommit(`${SHA}\trefs/tags/1.2.30`, '1.2.3'), undefined);
});
