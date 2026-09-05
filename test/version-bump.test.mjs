// A change to the shipped content must move the version — build/check-version-bump.mjs.
//
// The version is not bookkeeping: assemble.mjs stamps it into every wrapper manifest and a HOST
// COMPARES AGAINST IT. Left unmoved after a content change, the host tells a creator they are on
// the latest version — truthfully, about stale content — with Update greyed out.
//
// Two directions can be wrong, and the second is the dangerous one: a check that fails a PR
// carrying no shipped content trains people to bump without reading, and a check that passes a
// content change with a frozen version is the false-green the whole thing exists to prevent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { shippedContentChanged, versionOf, SHIPPED_CONTENT } from '../build/check-version-bump.mjs';
import { REPO_ROOT } from '../build/assemble.mjs';

const CHECKER = join(REPO_ROOT, 'build/check-version-bump.mjs');

/** Run the checker as CI runs it — a real process, so the exit code is the assertion. */
function run(changedFiles, baseVersion, headVersion) {
  const dir = mkdtempSync(join(tmpdir(), 'version-bump-'));
  try {
    const changed = join(dir, 'changed.txt');
    const base = join(dir, 'base.json');
    const head = join(dir, 'head.json');
    writeFileSync(changed, changedFiles.join('\n'));
    writeFileSync(base, baseVersion === null ? '{not json' : JSON.stringify({ version: baseVersion }));
    writeFileSync(head, headVersion === null ? '{not json' : JSON.stringify({ version: headVersion }));
    const r = spawnSync(process.execPath, [CHECKER, changed, base, head], { encoding: 'utf8' });
    return { status: r.status, out: r.stdout + r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('recognition.md is shipped content', () => {
  assert.ok(SHIPPED_CONTENT.includes('recognition.md'));
});

test('the scope stays narrow — a README or a test carries no obligation', () => {
  assert.deepEqual(shippedContentChanged(['README.md', 'test/lint.test.mjs', '.github/workflows/ci.yml']), []);
});

test('a changed-file list is read tolerantly of whitespace and blank lines', () => {
  assert.deepEqual(shippedContentChanged(['  recognition.md  ', '', 'README.md']), ['recognition.md']);
});

test('versionOf reads a version, and reports undefined rather than guessing', () => {
  assert.equal(versionOf('{"version":"1.2.3"}'), '1.2.3');
  assert.equal(versionOf('{not json'), undefined);
  assert.equal(versionOf('{"version":""}'), undefined);
  assert.equal(versionOf('{}'), undefined);
});

test('a PR touching no shipped content passes without being asked to bump', () => {
  const { status, out } = run(['README.md', 'build/lint.mjs'], '0.2.0', '0.2.0');
  assert.equal(status, 0);
  assert.match(out, /not asked to move the version/);
});

test('a content change with a moved version passes', () => {
  const { status, out } = run(['recognition.md'], '0.2.0', '0.2.1');
  assert.equal(status, 0);
  assert.match(out, /0\.2\.0 → 0\.2\.1/);
});

// THE FALSE-GREEN THIS EXISTS TO PREVENT.
test('a content change with a frozen version FAILS, and names the file', () => {
  const { status, out } = run(['recognition.md'], '0.2.0', '0.2.0');
  assert.equal(status, 1);
  assert.match(out, /leaves the version at 0\.2\.0/);
  assert.match(out, /changed — recognition\.md/);
  assert.match(out, /npm version patch/);
});

test('precedence.txt is shipped content too — it travels in the package', () => {
  const { status } = run(['precedence.txt'], '0.2.0', '0.2.0');
  assert.equal(status, 1);
});

// A check whose failure mode on a malformed input is "proceed" is not a check.
test('an unreadable package.json REFUSES rather than passing the comparison', () => {
  const { status, out } = run(['recognition.md'], null, '0.2.1');
  assert.equal(status, 1);
  assert.match(out, /Could not read a version/);
});
