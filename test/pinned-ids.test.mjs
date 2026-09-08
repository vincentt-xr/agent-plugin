// QA-F14-G3 — a published label can outlive the moment it names, and nothing detects it.
//
// A build-time check guards the FUTURE publish; NOTHING guards the INSTALLED one. Seeing a stale
// label on a creator's machine requires reading their host, which tripwires (a) and (c) both
// forbid. So the only assertable thing is what makes an already-installed copy keep working: the
// ids are APPEND-ONLY, exactly as B-F3-8 treats verbs.
//
// A label is display text and may change freely. An id is the thing a stale package resolves
// against, and the platform cannot reach an installed copy to rename one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PINNED_ACTION_IDS, PINNED_PLUGIN_VERBS, SECTION_CEILING } from '../build/pins.mjs';
import { parseActions, REPO_ROOT, renderActions } from '../build/assemble.mjs';
import { lintLabels } from '../build/lint.mjs';
import { parseRecognition } from '../build/parse.mjs';
import { SHIPPED } from './hostile-sources.mjs';

test('QA-F14-G3 · the pinned ids are FROZEN constants; any change to one fails here', () => {
  // Pinned as literals ON PURPOSE. This is the one place in the repo where a hand-written copy of
  // a list is correct: the assertion's whole job is to fail when the source list changes, so
  // deriving it from the source would make the test vacuous.
  //
  // `update` was APPENDED by f17's `plugin-holds-upgrade` (qa.md's [supersede] case). The first
  // four are unmoved and in their original positions, which is the property that matters: the ids
  // are positional against recognition.md's headings, so an append is safe and a reorder is not.
  assert.deepEqual(
    [...PINNED_ACTION_IDS],
    ['start', 'resume', 'phone', 'stop', 'update'],
    'Action ids are APPEND-ONLY (B-F3-8, as amended). An id may be added, but NEVER renamed or ' +
      'removed: a creator\'s already-installed package resolves against the id, and no check in ' +
      'this feature can see that copy — seeing it would require reading their host, which ' +
      'tripwires (a) and (c) forbid. If this assertion fails, the change orphans installed ' +
      'packages that the platform cannot recall.',
  );
  assert.ok(Object.isFrozen(PINNED_ACTION_IDS));
});

test('QA-F14-G3 · the ids f14 shipped are still a PREFIX — append-only, never reordered', () => {
  // The stronger form of the assertion above, and the one that survives a sixth moment. Ids are
  // positional against recognition.md's headings in renderActions, so a REORDER silently
  // re-points every installed copy's rows at the wrong moments — a worse failure than a rename
  // because nothing about it looks like a change to the surface.
  const f14Shipped = ['start', 'resume', 'phone', 'stop'];
  assert.deepEqual(
    PINNED_ACTION_IDS.slice(0, f14Shipped.length),
    f14Shipped,
    'f14\'s four ids must remain the first four, in order. An append extends the list; anything ' +
      'that moves one of these orphans installed copies the platform cannot reach.',
  );
});

test('QA-F14-G3 · the shipped actions.yml carries exactly the pinned ids, in order', () => {
  const actions = parseActions(readFileSync(join(REPO_ROOT, 'actions.yml'), 'utf8'));
  assert.deepEqual(actions.map((a) => a.id), [...PINNED_ACTION_IDS]);
});

test('QA-F14-G3(a) · a heading rename with actions.yml REGENERATED changes both together', () => {
  const renamed = SHIPPED.replace('### Finishing', '### Wrapping up');
  const regenerated = parseActions(renderActions(renamed));

  // The label moved with the heading; the id did not move at all.
  assert.deepEqual(regenerated.map((a) => a.id), [...PINNED_ACTION_IDS], 'ids are untouched by a rename');
  assert.equal(regenerated.find((a) => a.id === 'stop').section, 'Wrapping up');
  assert.deepEqual(lintLabels(parseRecognition(renamed), regenerated), [], 'regenerated labels resolve');
});

test('QA-F14-G3(b) · a heading rename WITHOUT regenerating actions.yml FAILS the build', () => {
  const renamed = parseRecognition(SHIPPED.replace('### Finishing', '### Wrapping up'));
  const stale = parseActions(readFileSync(join(REPO_ROOT, 'actions.yml'), 'utf8'));
  const arms = lintLabels(renamed, stale).map((v) => v.arm);
  assert.ok(arms.includes('label-resolution'), `fired [${arms}]`);
});

test('QA-F14-G3(c) · an ALREADY-INSTALLED stale label is asserted UNDETECTABLE, and that is the finding', () => {
  // There is deliberately no check here, because there is no check that could exist. A creator's
  // installed copy carries whatever label it shipped with; reading it means reading their host.
  //
  // What IS asserted is the property that makes the stale copy keep WORKING: its id still
  // resolves to the same moment, because ids never change. The stale label is cosmetic; a stale
  // id would be a dead row.
  // Deliberately the PRE-f17 set: this is what a copy installed before the fifth moment shipped
  // carries, and every one of its ids must still resolve after the append.
  const installedLastRelease = ['start', 'resume', 'phone', 'stop'];
  for (const id of installedLastRelease) {
    assert.ok(
      PINNED_ACTION_IDS.includes(id),
      `an installed package resolving "${id}" must still find its moment; removing an id breaks ` +
        `a copy we cannot reach`,
    );
  }
});

test('QA-F14-G3 · an id may be ADDED up to the ceiling, but never renamed or removed', () => {
  // Moved 4 -> 5 by `plugin-holds-upgrade`, by f14's own mechanism: "a fifth row is a fifth
  // moment, which is a record change, not a packaging change." Still HARD at its new value —
  // the append headroom is zero again, which is the point of a ceiling.
  assert.equal(SECTION_CEILING, 5, 'five moments; in practice the append headroom is zero');
  assert.equal(PINNED_ACTION_IDS.length, SECTION_CEILING, 'the pinned set is already at the ceiling');

  const doc = parseRecognition(SHIPPED);
  // Removal fails.
  const removed = parseActions(readFileSync(join(REPO_ROOT, 'actions.yml'), 'utf8')).filter((a) => a.id !== 'stop');
  assert.ok(lintLabels(doc, removed).map((v) => v.arm).includes('label-id-set'));
  // Rename fails (it is a removal and an addition at once).
  const renamedId = parseActions(readFileSync(join(REPO_ROOT, 'actions.yml'), 'utf8')).map((a) =>
    a.id === 'stop' ? { ...a, id: 'teardown' } : a,
  );
  const arms = lintLabels(doc, renamedId).map((v) => v.arm);
  assert.equal(arms.filter((a) => a === 'label-id-set').length, 2, 'a rename fails as both an unknown id and a missing one');
});

test('QA-F14-G3 · LABELS may change freely — only ids and moments are pinned', () => {
  const doc = parseRecognition(SHIPPED);
  const relabelled = parseActions(readFileSync(join(REPO_ROOT, 'actions.yml'), 'utf8')).map((a) =>
    a.id === 'phone' ? { ...a, label: 'Try it on a phone' } : a,
  );
  assert.deepEqual(lintLabels(doc, relabelled), [], 'a label is display text and carries no resolution weight');
});

test('the verb pin is frozen for the same reason', () => {
  // `outdated` was appended by f17. The upgrade moment cannot defer its verb the way the other
  // moments defer theirs: every fact the procedure uses arrives from that one answer, so a
  // procedure refusing to name it produces an agent guessing at a verb instead.
  assert.deepEqual([...PINNED_PLUGIN_VERBS], ['preview', 'outdated']);
  assert.ok(Object.isFrozen(PINNED_PLUGIN_VERBS));
  assert.equal(PINNED_PLUGIN_VERBS[0], 'preview', 'append-only, and `preview` stays first');
});

test('B-F3-8: no verb named after the ACT is offered anywhere as invocable', () => {
  // f17's rule, mechanically: "a verb named after the act implies the CLI performs it, and an
  // agent reading `vincentt update` in any text will run it." The MOMENT is called `update`
  // because that is what a person means; nothing invocable may carry that word.
  for (const verb of PINNED_PLUGIN_VERBS) {
    assert.ok(
      !['update', 'upgrade'].includes(verb),
      `"${verb}" names the act rather than the report. No such verb exists and no surface may ` +
        `make it look as though one does.`,
    );
  }
});
