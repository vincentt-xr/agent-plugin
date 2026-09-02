// QA-F14-G2, the SPAWN arm — the gate driven end to end, through its real fetch, to a real exit
// code, entirely OFFLINE against a fixture template repo.
//
// Why the injection this needs is a correctness fix and not a convenience. Without it a spawned
// run necessarily reaches the real GitHub remote, where REFUSE is correct today whichever path
// the run took — so the assertion passes for a reason it did not choose. The moment the template
// tag carries the section, that arm flips from proving the gate refuses to proving NOTHING, and
// it does so silently and in the safe-looking direction. That is the same failure shape as the
// `git archive --remote` defect, which also failed safe and would have survived to the first
// real release.
//
// The seam is deliberately narrow: default is the real remote, an override announces itself, and
// the ref stays fully qualified so an injected value cannot smuggle in a branch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REMOTE_ENV_VAR,
  TAG_ENV_VAR,
  TEMPLATE_REMOTE,
  TEMPLATE_TAG,
  resolveTarget,
} from '../build/publish-gate.mjs';
import { renderGroundingSection, REPO_ROOT } from '../build/assemble.mjs';
import { SHIPPED } from './hostile-sources.mjs';
import { makeTemplateRepo, agentsMd } from './fixture-repo.mjs';

const GATE = join(REPO_ROOT, 'build/publish-gate.mjs');
const EXPECTED = renderGroundingSection(SHIPPED);

function runGate({ remote, tag }) {
  const r = spawnSync(process.execPath, [GATE], {
    encoding: 'utf8',
    env: { ...process.env, [REMOTE_ENV_VAR]: remote, [TAG_ENV_VAR]: tag },
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// —— the four outcomes, spawned, offline ————————————————————————————————————————

test('G2(a) spawned · a tag carrying the section byte-for-byte EXITS 0', () => {
  const { dir, cleanup } = makeTemplateRepo({ '1.0.0': agentsMd(EXPECTED) });
  try {
    const r = runGate({ remote: dir, tag: '1.0.0' });
    assert.equal(r.status, 0, `expected exit 0\n${r.stdout}${r.stderr}`);
    // Each legal exit is pinned to its legal reason: exit 0 must carry the pass line on stdout.
    assert.match(r.stdout, /Publish gate passed/);
    assert.doesNotMatch(r.stdout, /REFUSED/);
  } finally {
    cleanup();
  }
});

test('G2(b) spawned · a tag with a DIFFERENT rendering EXITS 1, naming the byte offset', () => {
  const drifted = EXPECTED.replace('Finishing', 'Finishinq');
  assert.notEqual(drifted, EXPECTED, 'the mutation must actually apply');

  const { dir, cleanup } = makeTemplateRepo({ '1.0.0': agentsMd(drifted) });
  try {
    const r = runGate({ remote: dir, tag: '1.0.0' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Publish REFUSED/);
    assert.match(r.stderr, /differs from this repo's assembly at byte \d+/);
    assert.equal(r.stdout.trim(), '', 'a refusal writes nothing to stdout');
  } finally {
    cleanup();
  }
});

test('G2(c) spawned · a tag with NO section EXITS 1', () => {
  const { dir, cleanup } = makeTemplateRepo({ '1.0.0': '# Agents\n\nNo recognition section.\n' });
  try {
    const r = runGate({ remote: dir, tag: '1.0.0' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no paired recognition markers/);
  } finally {
    cleanup();
  }
});

test('G2(d) spawned · an UNREACHABLE tag EXITS 1 rather than falling through to "assume fine"', () => {
  const { dir, cleanup } = makeTemplateRepo({ '1.0.0': agentsMd(EXPECTED) });
  try {
    // The remote exists; the tag does not. A gate whose failure mode on an unreachable input is
    // "proceed" is not a gate.
    const r = runGate({ remote: dir, tag: 'no-such-tag' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /could not read AGENTS\.md/);
    assert.match(r.stderr, /is not a gate/);
  } finally {
    cleanup();
  }
});

test('G2(d) spawned · a remote that does not exist at all EXITS 1', () => {
  const r = runGate({ remote: join(REPO_ROOT, 'no-such-remote-f14'), tag: '1.0.0' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Publish REFUSED/);
});

// —— (e) the tag, never a branch ————————————————————————————————————————————————

test('G2(e) spawned · a correct MAIN behind a lagging tag still EXITS 1', () => {
  // THE ROW THIS ARM EXISTS FOR, and it is only meaningful if main really does carry the correct
  // content. The tag is cut on a WRONG rendering, then main advances to the RIGHT one — the exact
  // shape of a fix merged but not yet released. Creators receive the tag, so the gate must refuse.
  const lagging = agentsMd(EXPECTED.replace('Vincentt is a platform', 'Vincentt was a platform'));
  assert.notEqual(lagging, agentsMd(EXPECTED), 'the lagging rendering must actually differ');

  const { dir, cleanup } = makeTemplateRepo({
    '1.0.0': lagging,
    'branch:main': agentsMd(EXPECTED),
  });
  try {
    const r = runGate({ remote: dir, tag: '1.0.0' });
    assert.equal(r.status, 1, 'a correct main must not satisfy the gate');
    assert.match(r.stderr, /differs from this repo's assembly/);
  } finally {
    cleanup();
  }
});

test('G2(e) spawned · a BRANCH named `latest` does NOT satisfy `refs/tags/latest`', () => {
  // The ref is fully qualified, so an injected value cannot smuggle a branch in behind a tag
  // name. A branch carrying perfect content must still refuse.
  const { dir, cleanup } = makeTemplateRepo({ 'branch:latest': agentsMd(EXPECTED) });
  try {
    const r = runGate({ remote: dir, tag: 'latest' });
    assert.equal(r.status, 1, 'a branch named `latest` is not the tag `latest`');
    assert.match(r.stderr, /Publish REFUSED/);
  } finally {
    cleanup();
  }
});

// —— the seam is a test seam, not a config surface ——————————————————————————————

test('the default target is the real remote and tag — CI passes neither variable', () => {
  const clean = resolveTarget({});
  assert.equal(clean.remote, TEMPLATE_REMOTE);
  assert.equal(clean.tag, TEMPLATE_TAG);
  assert.equal(clean.overridden, false);

  const release = readFileSync(join(REPO_ROOT, '.github/workflows/release.yml'), 'utf8');
  assert.doesNotMatch(
    release,
    new RegExp(`${REMOTE_ENV_VAR}|${TAG_ENV_VAR}`),
    'the release workflow must never inject a target — CI reads the published tag or nothing',
  );
});

test('an OVERRIDDEN run announces itself, so a pass can never be mistaken for the real tag', () => {
  const { dir, cleanup } = makeTemplateRepo({ '1.0.0': agentsMd(EXPECTED) });
  try {
    const r = runGate({ remote: dir, tag: '1.0.0' });
    assert.equal(r.status, 0);
    assert.match(r.stderr, /INJECTED target/, 'an injected run must say so');
    assert.match(r.stderr, /says nothing about the published template tag/);
    // The announcement goes to stderr; stdout stays reserved for the pass line alone.
    assert.doesNotMatch(r.stdout, /INJECTED/);
  } finally {
    cleanup();
  }
});

test('resolveTarget reports overridden for either variable alone', () => {
  assert.equal(resolveTarget({ [REMOTE_ENV_VAR]: '/tmp/x' }).overridden, true);
  assert.equal(resolveTarget({ [TAG_ENV_VAR]: '9.9.9' }).overridden, true);
  assert.equal(resolveTarget({ [TAG_ENV_VAR]: TEMPLATE_TAG }).overridden, false);
});
