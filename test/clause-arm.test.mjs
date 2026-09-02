// The clause-level split — implementation.md §4 calls it "cheap and worth doing" and explicitly
// does NOT claim it closes the class.
//
// It is implemented, OFF BY DEFAULT, and MEASURED here. Off by default because qa.md's
// QA-F14-02 pins ATTACK_1 as a PASS: enabling the arm inverts a pinned expectation, and that is a
// deliberate record change, not something a build decides for itself.
//
// These assertions exist so the claim "it converts one residual and closes nothing" is a
// checked-in measurement rather than a paragraph. If the arm is ever switched on, QA-F14-02's
// ATTACK_1 expectation inverts WITH it, in the same commit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintSource, splitClauses } from '../build/lint.mjs';
import { REPO_ROOT } from '../build/assemble.mjs';
import { HOSTILE_SOURCES } from './hostile-sources.mjs';

const PRECEDENCE = readFileSync(join(REPO_ROOT, 'precedence.txt'), 'utf8');
const row = (name) => HOSTILE_SOURCES.find((r) => r.row === name);
const clauseArms = (source) =>
  lintSource(source, { precedence: PRECEDENCE, clauseLevel: true }).map((v) => v.arm);

test('the clause arm is OFF by default — the shipped lint pins ATTACK_1 as a PASS', () => {
  assert.deepEqual(
    lintSource(row('ATTACK_1').source, { precedence: PRECEDENCE }),
    [],
    'the default lint must match qa.md QA-F14-02 exactly',
  );
});

test('MEASURED · with the clause arm ON, ATTACK_1 is CAUGHT', () => {
  const arms = clauseArms(row('ATTACK_1').source);
  assert.ok(arms.includes('clause-opener'), `expected clause-opener; fired [${arms}]`);
});

test('MEASURED · with the clause arm ON, ATTACK_3 STILL PASSES — the class is NOT closed', () => {
  assert.deepEqual(
    lintSource(row('ATTACK_3').source, { precedence: PRECEDENCE, clauseLevel: true }),
    [],
    'a declarative override has no bare verb to find. Checklist item 5 still owns it.',
  );
});

test('MEASURED · with the clause arm ON, ATTACK_DOTFILE STILL PASSES', () => {
  assert.deepEqual(
    lintSource(row('ATTACK_DOTFILE').source, { precedence: PRECEDENCE, clauseLevel: true }),
    [],
    'it is grammatically indistinguishable from a legitimate sentence. Checklist item 4 owns it.',
  );
});

test('MEASURED · with the clause arm ON, the SHIPPED source stays clean — no false positive', () => {
  const violations = lintSource(row('SHIPPED').source, { precedence: PRECEDENCE, clauseLevel: true });
  assert.deepEqual(
    violations,
    [],
    `the approved source must survive the stricter arm:\n${violations.map((v) => v.message).join('\n')}`,
  );
});

test('MEASURED · the arm converts exactly ONE of the three pinned residuals', () => {
  const residuals = HOSTILE_SOURCES.filter((r) => r.residual);
  const caught = residuals.filter((r) => clauseArms(r.source).includes('clause-opener'));
  assert.deepEqual(
    caught.map((r) => r.row),
    ['ATTACK_1'],
    'one of three. The two it does not catch are the ones that read as ordinary prose, which is ' +
      'exactly why the record refuses to claim this closes the class.',
  );
});

test('the clause splitter splits on em-dashes, semicolons, and ", so"', () => {
  assert.deepEqual(splitClauses('A thing — do the other thing.'), ['A thing', 'do the other thing.']);
  assert.deepEqual(splitClauses('A thing; do the other.'), ['A thing', 'do the other.']);
  assert.deepEqual(splitClauses('A thing, so do the other.'), ['A thing', 'do the other.']);
  assert.deepEqual(splitClauses('One clause only.'), ['One clause only.']);
});
