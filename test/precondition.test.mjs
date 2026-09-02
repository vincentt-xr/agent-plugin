// QA-F14-G1 — the subtractive suite asserts its own precondition (implementation.md §9.2).
//
// THE HIGHEST-BLAST-RADIUS CASE IN THE FEATURE. The subtractive test is the ONLY mechanical
// evidence that tripwire (d) was not a dissolution. It passes identically with the package
// installed, because the package is text a HOST loads and contributes nothing to a spawned
// `vincentt`. A vacuous pass makes the amendment's single gate green by construction —
// permanently, and invisibly.
//
// In CI the package is never installed, so the guard never fires, and a guard exercised only
// where it cannot fire is one nobody knows is broken. This suite therefore INJECTS A FAKE
// INSTALL and asserts the check goes red, then removes it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadInstallManifest,
  findInstalledCopies,
  assertPackageAbsent,
  preconditionMessage,
} from '../build/precondition.mjs';
import { REPO_ROOT, PACKAGE_NAME } from '../build/assemble.mjs';

const MANIFEST = loadInstallManifest(REPO_ROOT);

function scratchHome() {
  return mkdtempSync(join(tmpdir(), 'f14-home-'));
}

// —— the guard passes on a clean machine ——————————————————————————————————————

test('QA-F14-G1 · the precondition PASSES when no copy of our package is present', () => {
  const home = scratchHome();
  try {
    assert.deepEqual(findInstalledCopies(MANIFEST, { home, env: {}, moduleRoots: [] }), []);
    assert.equal(assertPackageAbsent(MANIFEST, { home, env: {}, moduleRoots: [] }), true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// —— THE CASE THAT MATTERS: the guard FIRES on an injected fake install ——————————

test('QA-F14-G1 · an INJECTED fake install at a wrapper path makes the check go RED', () => {
  const home = scratchHome();
  const wrapper = MANIFEST.wrappers[0];
  const injected = join(home, wrapper.installPaths[0]);
  try {
    mkdirSync(injected, { recursive: true });
    writeFileSync(join(injected, 'SKILL.md'), '# a fake installed copy\n');

    const found = findInstalledCopies(MANIFEST, { home, env: {}, moduleRoots: [] });
    assert.equal(found.length, 1, 'the injected install must be found');
    assert.equal(found[0].kind, 'install-path');
    assert.equal(found[0].path, injected);

    assert.throws(
      () => assertPackageAbsent(MANIFEST, { home, env: {}, moduleRoots: [] }),
      /Precondition failed/,
      'a guard that does not fire on a real install is a comment',
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }

  // …then removed. The guard is clean again, which is what makes the injection a test rather
  // than a mutation of the machine.
  const clean = scratchHome();
  try {
    assert.deepEqual(findInstalledCopies(MANIFEST, { home: clean, env: {}, moduleRoots: [] }), []);
  } finally {
    rmSync(clean, { recursive: true, force: true });
  }
});

test('QA-F14-G1 · the guard fires on EVERY declared install path, not just the first', () => {
  const wrapper = MANIFEST.wrappers[0];
  assert.ok(wrapper.installPaths.length >= 2, 'the fixture needs more than one declared path');
  for (const rel of wrapper.installPaths) {
    const home = scratchHome();
    try {
      mkdirSync(join(home, rel), { recursive: true });
      const found = findInstalledCopies(MANIFEST, { home, env: {}, moduleRoots: [] });
      assert.equal(found.length, 1, `a copy at ${rel} must be found`);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }
});

test('QA-F14-G1 · the guard fires on the wrappers\' env var', () => {
  const home = scratchHome();
  const envVar = MANIFEST.wrappers[0].envVars[0];
  // Wrappers may SHARE an env var — they name one home for one package, not one per host — so
  // the expected count is derived from the manifest rather than written as a literal. A literal
  // here would turn "a second host was added" into a test failure, which is the drift the
  // discovered-wrappers shape exists to avoid.
  const expected = MANIFEST.wrappers.filter((w) => (w.envVars ?? []).includes(envVar)).length;
  try {
    const found = findInstalledCopies(MANIFEST, {
      home,
      env: { [envVar]: '/somewhere/agent-plugin' },
      moduleRoots: [],
    });
    assert.equal(found.length, expected);
    assert.ok(found.length > 0, 'setting a declared env var must be found');
    for (const hit of found) assert.equal(hit.kind, 'env-var');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('QA-F14-G1 · the guard fires when the published NAME resolves from a spawn root', () => {
  const root = mkdtempSync(join(tmpdir(), 'f14-root-'));
  try {
    // A fake node_modules entry under the spawn root — module resolution of the published name
    // must find it.
    const pkgDir = join(root, 'node_modules', ...PACKAGE_NAME.split('/'));
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: PACKAGE_NAME, version: '0.0.0', main: 'index.js' }),
    );
    writeFileSync(join(pkgDir, 'index.js'), 'module.exports = {};\n');

    const home = scratchHome();
    try {
      const found = findInstalledCopies(MANIFEST, { home, env: {}, moduleRoots: [root] });
      assert.equal(found.length, 1, 'module resolution of our published name must be checked');
      assert.equal(found[0].kind, 'module');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —— the check is NOT host detection ————————————————————————————————————————————

test('QA-F14-G1 · a machine with NO host installed and our package present FAILS', () => {
  // The tell that this is the right check. Host detection would find nothing here, because there
  // is no host. This check finds our own artifact and refuses.
  const home = scratchHome();
  try {
    mkdirSync(join(home, MANIFEST.wrappers[0].installPaths[0]), { recursive: true });
    assert.throws(() => assertPackageAbsent(MANIFEST, { home, env: {}, moduleRoots: [] }));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('QA-F14-G1 · a machine with a host installed and our package ABSENT passes', () => {
  // Exactly backwards from host detection. The scratch home carries directories that look like a
  // host's, and the check is indifferent to all of them — it reads only OUR publish targets.
  const home = scratchHome();
  try {
    for (const decoy of ['.some-agent-host/plugins', '.config/another-host/skills', '.local/share/host']) {
      mkdirSync(join(home, decoy), { recursive: true });
    }
    assert.equal(assertPackageAbsent(MANIFEST, { home, env: {}, moduleRoots: [] }), true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('QA-F14-G1 · the check gets the SAME answer with no host present — it has no branch', () => {
  const bare = scratchHome();
  const decorated = scratchHome();
  try {
    mkdirSync(join(decorated, '.some-agent-host/plugins'), { recursive: true });
    assert.deepEqual(
      findInstalledCopies(MANIFEST, { home: bare, env: {}, moduleRoots: [] }),
      findInstalledCopies(MANIFEST, { home: decorated, env: {}, moduleRoots: [] }),
      'the answer must not depend on what is running',
    );
  } finally {
    rmSync(bare, { recursive: true, force: true });
    rmSync(decorated, { recursive: true, force: true });
  }
});

test('QA-F14-G1 · the source names no host application in any conditional', () => {
  // Tripwire (a): the product and its tests may not branch on which application is running. The
  // only host token permitted is our own wrapper directory name, which is a publish target.
  const source = readFileSync(join(REPO_ROOT, 'build/precondition.mjs'), 'utf8');
  const code = source
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  for (const forbidden of [/process\.ppid/, /execPath/, /parentProcess/, /\bps -/, /platform\s*===/]) {
    assert.doesNotMatch(code, forbidden, 'the check may not inspect the ambient process');
  }
});

// —— the failure message ————————————————————————————————————————————————————————

test('QA-F14-G1 · the failure message names the path AND says why skipping is wrong', () => {
  const message = preconditionMessage([{ kind: 'install-path', host: 'self-serve', path: '/home/x/.vincentt/agent-plugin' }]);
  assert.match(message, /Precondition failed/);
  assert.match(message, /\/home\/x\/\.vincentt\/agent-plugin/, 'it names the copy it found');
  assert.match(
    message,
    /only evidence tripwire \(d\) was not a dissolution/,
    'a skipped suite and a vacuously-passing one look identical in a CI summary; the message is ' +
      'what stops the next person reaching for --skip',
  );
  assert.match(message, /remove the install and re-run rather than skipping/);
});

// —— the manifest is generated, so a new host extends the check with no edit ——————

test('QA-F14-G1 · the manifest is generated from the wrappers, so it grows without a test edit', () => {
  assert.equal(MANIFEST.generated.from, 'hosts/*/install.json');
  assert.equal(MANIFEST.packageName, PACKAGE_NAME);
  assert.ok(MANIFEST.wrappers.length >= 1);
  for (const wrapper of MANIFEST.wrappers) {
    assert.ok(Array.isArray(wrapper.installPaths) && wrapper.installPaths.length > 0);
    assert.ok(Array.isArray(wrapper.envVars));
  }
  // No test in this file names a path literal — every path comes from the manifest, which is why
  // adding hosts/<new>/install.json extends the guard with no edit here.
  const literals = readFileSync(join(REPO_ROOT, 'test/precondition.test.mjs'), 'utf8').match(
    /['"`]\.vincentt\/agent-plugin['"`]/g,
  );
  assert.equal(literals, null, 'the test must read install paths from the manifest, never restate them');
});
