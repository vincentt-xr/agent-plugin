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

test('QA-F14-G3 · the four ids are FROZEN constants; any change to one fails here', () => {
  // Pinned as literals ON PURPOSE. This is the one place in the repo where a hand-written copy of
  // a list is correct: the assertion's whole job is to fail when the source list changes, so
  // deriving it from the source would make the test vacuous.
  assert.deepEqual(
    [...PINNED_ACTION_IDS],
    ['start', 'resume', 'phone', 'stop'],
    'Action ids are APPEND-ONLY (B-F3-8, as amended). An id may be added, but NEVER renamed or ' +
      'removed: a creator\'s already-installed package resolves against the id, and no check in ' +
      'this feature can see that copy — seeing it would require reading their host, which ' +
      'tripwires (a) and (c) forbid. If this assertion fails, the change orphans installed ' +
      'packages that the platform cannot recall.',
  );
  assert.ok(Object.isFrozen(PINNED_ACTION_IDS));
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
  assert.equal(SECTION_CEILING, 4, 'four moments; in practice the append headroom is zero');
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
  assert.deepEqual([...PINNED_PLUGIN_VERBS], ['preview']);
  assert.ok(Object.isFrozen(PINNED_PLUGIN_VERBS));
});
