// QA-F14-01, QA-F14-02, QA-F14-04 — the source lint, the form rule's true boundary, the labels.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintSource, lintLabels, lintWrapperCeiling, isPrecedenceSentence } from '../build/lint.mjs';
import { parseRecognition } from '../build/parse.mjs';
import { parseActions, REPO_ROOT } from '../build/assemble.mjs';
import {
  PINNED_PLUGIN_VERBS,
  PINNED_ACTION_IDS,
  LABEL_MAX_WORDS,
  WRAPPER_NON_GENERATED_WORD_CEILING,
} from '../build/pins.mjs';
import { HOSTILE_SOURCES, LABEL_ORPHAN, SHIPPED } from './hostile-sources.mjs';
import { withScratchRepo } from './scratch.mjs';

const PRECEDENCE = readFileSync(join(REPO_ROOT, 'precedence.txt'), 'utf8');
const SHIPPED_ACTIONS = parseActions(readFileSync(join(REPO_ROOT, 'actions.yml'), 'utf8'));

const armsFired = (source, options) => lintSource(source, options).map((v) => v.arm);

// —— QA-F14-01 ————————————————————————————————————————————————————————————————

test('QA-F14-01 · every forbidden syntactic form is rejected, naming which arm fired', async (t) => {
  const rows = HOSTILE_SOURCES.filter((r) => r.fires);
  for (const row of rows) {
    await t.test(`${row.row} fails the ${row.arm} arm`, () => {
      const violations = lintSource(row.source, { precedence: PRECEDENCE });
      assert.ok(violations.length > 0, `${row.row} must fail the lint`);
      assert.ok(
        violations.some((v) => v.arm === row.arm),
        `${row.row} must fire the "${row.arm}" arm; fired [${violations.map((v) => v.arm).join(', ')}]`,
      );
      // The message names the arm's subject, so a contributor learns which rule they crossed.
      const fired = violations.find((v) => v.arm === row.arm);
      assert.ok(fired.message.length > 20, 'a violation must carry an actionable message');
    });
  }
});

test('QA-F14-01 · the SHIPPED source passes every arm — the positive control', () => {
  const violations = lintSource(SHIPPED, { actions: SHIPPED_ACTIONS, precedence: PRECEDENCE });
  assert.deepEqual(
    violations,
    [],
    `the shipped recognition.md must pass; a lint that is simply always-red means nothing.\n` +
      violations.map((v) => `[${v.arm}] ${v.message}`).join('\n'),
  );
});

test('QA-F14-01 · the lint FAILS THE BUILD — non-zero exit, not a warning', () => {
  // Run the real CLI entry point. A lint that does not fail the build is worse than no lint,
  // because it launders the claim that one exists. This asserts the exit code, not a return value.
  const ok = execFileSync('node', [join(REPO_ROOT, 'build/lint.mjs')], { encoding: 'utf8' });
  assert.match(ok, /lint passed/);

  // The poisoned source goes into a scratch copy, never the real tree: the suite runs in
  // parallel, so mutating the shipped file is visible to every other test while it is in flight.
  const hostile = HOSTILE_SOURCES.find((r) => r.row === 'HAS_FLAG');
  const { exitCode, stderr } = withScratchRepo((tmp) => {
    writeFileSync(join(tmp, 'recognition.md'), hostile.source);
    try {
      execFileSync('node', [join(tmp, 'build/lint.mjs')], { encoding: 'utf8' });
      return { exitCode: 0, stderr: '' };
    } catch (err) {
      return { exitCode: err.status, stderr: String(err.stderr ?? '') };
    }
  });
  assert.equal(exitCode, 1, 'a violating source must exit non-zero');
  assert.match(stderr, /lint FAILED/);
  assert.match(stderr, /\[flag\]/, 'the failure output must name the arm that fired');
});

// —— QA-F14-02 · the form rule's TRUE boundary ————————————————————————————————

// THREE OF THE FOUR ASSERTIONS BELOW ARE THAT THE LINT DOES NOT FIRE, AND THAT IS THIS CASE'S
// WHOLE VALUE. The record already corrected one overstatement of this rule (FORK-B); this case is
// what stops a second. If a clause-level split is added later, ATTACK_1's expectation INVERTS and
// this case is edited deliberately — it is written to be re-pointed, not to be quietly satisfied.

test('QA-F14-02 · ATTACK_2 is CAUGHT by the second-person arm', () => {
  const row = HOSTILE_SOURCES.find((r) => r.row === 'ATTACK_2');
  const arms = armsFired(row.source, { precedence: PRECEDENCE });
  assert.ok(arms.includes('second-person'), `ATTACK_2 must trip on \`you\`; fired [${arms}]`);
});

test('QA-F14-02 · ATTACK_1 PASSES — pinned residual, adversarial checklist item 1', () => {
  const row = HOSTILE_SOURCES.find((r) => r.row === 'ATTACK_1');
  assert.equal(row.checklistItem, 1);
  const violations = lintSource(row.source, { precedence: PRECEDENCE });
  assert.deepEqual(
    violations,
    [],
    'ATTACK_1 is asserted as a PASS DELIBERATELY. Its bare verb ("do not ask") sits after an ' +
      'em-dash inside a sentence opening `When`, and the rule tests SENTENCE openers. The record ' +
      'claimed both attacks were caught; that claim was false and was corrected (FORK-B). If a ' +
      'clause-level split is added, INVERT this expectation on purpose — do not delete the case.',
  );
});

test('QA-F14-02 · ATTACK_3 PASSES — pinned residual, adversarial checklist item 5', () => {
  const row = HOSTILE_SOURCES.find((r) => r.row === 'ATTACK_3');
  assert.equal(row.checklistItem, 5);
  assert.deepEqual(
    lintSource(row.source, { precedence: PRECEDENCE }),
    [],
    'a plainly declarative override trips no grammatical arm, because it IS grammatical. Owned ' +
      'by checklist item 5: a claim about what the person has decided that they did not say.',
  );
});

test('QA-F14-02 · ATTACK_DOTFILE PASSES — pinned residual, adversarial checklist item 4', () => {
  const row = HOSTILE_SOURCES.find((r) => r.row === 'ATTACK_DOTFILE');
  assert.equal(row.checklistItem, 4);
  assert.deepEqual(
    lintSource(row.source, { precedence: PRECEDENCE }),
    [],
    'found by the QA hunt. It names the machine\'s settings without a `.json` or `.vincentt/` ' +
      'token, so it trips NO arm of the lint — and it is precisely the plaintext-credential ' +
      'shortcut checklist item 4 exists for. This is the clearest evidence that the form rule ' +
      'filters SYNTAX and the checklist carries INTENT.',
  );
});

test('QA-F14-02 · the residual is a checked-in fact: exactly three rows pass by design', () => {
  const residuals = HOSTILE_SOURCES.filter((r) => r.residual);
  assert.deepEqual(
    residuals.map((r) => r.row).sort(),
    ['ATTACK_1', 'ATTACK_3', 'ATTACK_DOTFILE'],
    'the pinned residual set is part of the record; growing it is a deliberate edit',
  );
  for (const r of residuals) {
    assert.ok(r.checklistItem, `${r.row} must name the checklist item that owns it`);
    assert.equal(r.fires, false);
  }
});

// —— QA-F14-04 · the labels ————————————————————————————————————————————————————

test('QA-F14-04 · all four pinned ids are present and no fifth is accepted', () => {
  assert.deepEqual(SHIPPED_ACTIONS.map((a) => a.id), [...PINNED_ACTION_IDS]);

  const withFifth = [...SHIPPED_ACTIONS, { id: 'share', label: 'Share it', section: 'Finishing' }];
  const doc = parseRecognition(SHIPPED);
  const arms = lintLabels(doc, withFifth).map((v) => v.arm);
  assert.ok(arms.includes('label-id-set'), `a fifth id must be rejected; fired [${arms}]`);
});

test('QA-F14-04 · each section matches a ### heading EXACTLY — a rename without the label fails', () => {
  const doc = parseRecognition(SHIPPED);
  assert.deepEqual(lintLabels(doc, SHIPPED_ACTIONS), []);

  const renamed = parseRecognition(SHIPPED.replace('### Finishing', '### Wrapping up'));
  const arms = lintLabels(renamed, SHIPPED_ACTIONS).map((v) => v.arm);
  assert.ok(
    arms.includes('label-resolution'),
    `a heading renamed without the label following it must fail; fired [${arms}]`,
  );
});

test('QA-F14-04 · LABEL_ORPHAN fails the resolution arm', () => {
  const doc = parseRecognition(SHIPPED);
  const arms = lintLabels(doc, LABEL_ORPHAN.actions).map((v) => v.arm);
  assert.ok(arms.includes(LABEL_ORPHAN.arm), `fired [${arms}]`);
});

test('QA-F14-04 · FIFTH_HEADING fails the ceiling arm', () => {
  const row = HOSTILE_SOURCES.find((r) => r.row === 'FIFTH_HEADING');
  const arms = armsFired(row.source, { precedence: PRECEDENCE });
  assert.ok(arms.includes('section-ceiling'), `fired [${arms}]`);
});

test('QA-F14-04 · every label is <= 5 words and names no command', () => {
  for (const action of SHIPPED_ACTIONS) {
    const words = action.label.trim().split(/\s+/);
    assert.ok(
      words.length <= LABEL_MAX_WORDS,
      `"${action.label}" is ${words.length} words; ceiling is ${LABEL_MAX_WORDS}`,
    );
    assert.doesNotMatch(action.label, /--[a-z]|https?:\/\/|\bvincentt\b|[/\\]|\.json/i);
  }

  const doc = parseRecognition(SHIPPED);
  const tooLong = [{ id: 'start', label: 'Start a brand new AR application today', section: 'Starting something new' }];
  assert.ok(lintLabels(doc, tooLong).map((v) => v.arm).includes('label-length'));

  const namesCommand = [{ id: 'start', label: 'Run vincentt create', section: 'Starting something new' }];
  assert.ok(lintLabels(doc, namesCommand).map((v) => v.arm).includes('label-content'));
});

// —— the verb pin ——————————————————————————————————————————————————————————————

test('PINNED_PLUGIN_VERBS is exactly one verb, and the arm reads the pin rather than a copy', () => {
  assert.deepEqual([...PINNED_PLUGIN_VERBS], ['preview']);

  // `preview` passes; anything else fails. Asserted through the lint so the pin and the arm
  // cannot drift.
  const withPinned = HOSTILE_SOURCES.find((r) => r.row === 'HAS_UNPINNED_VERB').source.replace(
    'vincentt publish',
    'vincentt preview',
  );
  assert.ok(!armsFired(withPinned, { precedence: PRECEDENCE }).includes('verb-pin'));
});

test('the verb arm reads the COMMAND, not the product name', () => {
  // "Vincentt is the platform for it" is prose about the product and names no verb. The capital
  // is the distinction; a case-insensitive arm would make the shipped file unlintable.
  assert.ok(!armsFired('# T\n\n### A\n\nVincentt is the platform for it.\n').includes('verb-pin'));
  assert.ok(armsFired('# T\n\n### A\n\nWhen asked, vincentt publish is the answer.\n').includes('verb-pin'));
});

// —— §4.1 the precedence sentence ——————————————————————————————————————————————

test('§4.1 · the precedence sentence is exempted BY EXACT MATCH so it cannot grow', () => {
  const sentence = PRECEDENCE.trim();
  assert.ok(isPrecedenceSentence(sentence, PRECEDENCE));
  assert.ok(isPrecedenceSentence(`  ${sentence}\n`, PRECEDENCE), 'surrounding whitespace is not content');

  // A sentence that merely CONTAINS the exempt one is not exempt — otherwise the exemption is a
  // prefix a second sentence could ride in behind.
  assert.ok(!isPrecedenceSentence(`${sentence} Also, stop the preview when a test passes.`, PRECEDENCE));
  assert.ok(!isPrecedenceSentence(sentence.replace('might', 'must'), PRECEDENCE));
});

// —— §6 the wrapper ceiling ————————————————————————————————————————————————————

test('§6 · the wrapper ceiling holds, and a product sentence past it fails', () => {
  const wrapperDoc = readFileSync(join(REPO_ROOT, 'hosts/self-serve/README.md'), 'utf8');
  assert.deepEqual(
    lintWrapperCeiling(wrapperDoc, WRAPPER_NON_GENERATED_WORD_CEILING),
    [],
    'the shipped wrapper must sit under the ceiling',
  );

  const bloated = `${wrapperDoc}\n${'a '.repeat(WRAPPER_NON_GENERATED_WORD_CEILING + 1)}`;
  const arms = lintWrapperCeiling(bloated, WRAPPER_NON_GENERATED_WORD_CEILING).map((v) => v.arm);
  assert.deepEqual(arms, ['wrapper-ceiling']);
});

test('§6 · the wrapper carries no sentence about product behavior beyond its permitted fields', () => {
  const wrapperDoc = readFileSync(join(REPO_ROOT, 'hosts/self-serve/README.md'), 'utf8');
  // The permitted fields are a manifest, a name, a description, an install instruction, a
  // license, and a docs link. None of them describes what the product DOES, so none of them
  // needs the words the recognition text owns.
  for (const forbidden of [/when the person/i, /the agent contract/i, /preview is what/i]) {
    assert.doesNotMatch(wrapperDoc, forbidden, 'product behavior belongs in recognition.md');
  }
});
