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
  PATH_ALLOWLIST,
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

test('QA-F14-01 · every NON-firing row passes — the narrowing did not overtighten', async (t) => {
  // The other half of the corpus, and it is what makes the narrowing's safety claim two-sided.
  // A row marked `fires: false` and `residual: true` is a known residual the record owns; a row
  // marked `fires: false` with no residual flag is a POSITIVE CONTROL and must be clean.
  //
  // The load-bearing rows here are REVERT_SENTENCE_APPROVED (the one sentence §6.2 requires,
  // which must survive the two new arms), PATH_ALLOWED_EXACT (the enumerated allowance), and
  // HEADING_COMING_BACK_TO (the pinned heading a naive phrase list would break).
  for (const row of HOSTILE_SOURCES.filter((r) => !r.fires)) {
    await t.test(`${row.row} stays clean`, () => {
      const violations = lintSource(row.source, { precedence: PRECEDENCE });
      assert.deepEqual(
        violations,
        [],
        `${row.row} must NOT fire — ${row.note ?? 'positive control'}\n` +
          violations.map((v) => `[${v.arm}] ${v.message}`).join('\n'),
      );
      if (row.residual) {
        // A residual is a KNOWN HOLE the record owns on the adversarial checklist, pinned as a
        // pass so a future change cannot silently believe the lint caught it. If one of these
        // ever starts firing, that is good news and the row is re-pointed DELIBERATELY.
        assert.ok(row.checklistItem, `${row.row} is a residual and must name its checklist item`);
      }
    });
  }
});

test('f17 · the credential residual is DECLARED, not discovered later', () => {
  // The finding this slice's own adversarial pass produced, asserted as a structural fact rather
  // than left in a report. `shared.md` states that the four conditions do not bound what the
  // procedure touches on the way; this row is the measured evidence that the LINT ARMS do not
  // close that class either, which is the honest limit of the mechanical bound.
  const row = HOSTILE_SOURCES.find((r) => r.row === 'ADV_REGISTRY_CREDENTIAL');
  assert.ok(row, 'the residual must stay in the corpus');
  assert.equal(row.fires, false, 'pinned as a PASS — this is the finding, not a defect to hide');
  assert.equal(row.checklistItem, 4, 'owned by checklist item 4: credentials BY ANY DESCRIPTION');
  assert.deepEqual(
    lintSource(row.source, { precedence: PRECEDENCE }),
    [],
    'if this fires, an arm was widened — confirm it was not widened into a word list, which is ' +
      'the enumeration the record refused twice.',
  );
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

// —— the NARROWED path arm (f17 / plugin-holds-upgrade) ———————————————————————

// The narrowing's obligation is two-sided and both sides are asserted mechanically: the ONE
// enumerated token passes, and every other spelling still fails. A table rather than prose,
// because "it must still fail on every path that is not the allowance" is a claim only a corpus
// can carry.
const lintBody = (sentence) =>
  lintSource(`# T\n\n### A\n\n${sentence}\n`, { precedence: PRECEDENCE }).map((v) => v.arm);

test('f17 · the path arm accepts EXACTLY `package.json` and nothing that merely contains it', () => {
  assert.deepEqual([...PATH_ALLOWLIST], ['package.json'], 'one token, not a pattern');

  // The allowance.
  assert.ok(
    !lintBody('The string the answer printed goes into package.json.').includes('file-path'),
    'the enumerated conventional manifest is permitted — it is a fact about the ecosystem',
  );

  // Every spelling the record names, plus the ones an evasion would reach for. Each CONTAINS or
  // resembles the allowed name, and each is a different file.
  const mustFail = [
    '../package.json',
    '../../package.json',
    '~/package.json',
    './package.json',
    'my-package.json',
    'package.json.bak',
    'tsconfig.json',
    'src/package.json',
    '/etc/package.json',
    'node_modules/.package.json',
  ];
  for (const path of mustFail) {
    assert.ok(
      lintBody(`The setting in ${path} is what the note refers to.`).includes('file-path'),
      `"${path}" must still fail: it contains or resembles the allowed name and is a DIFFERENT ` +
        `file. A substring or prefix exemption is what lets one of these ride in behind the ` +
        `legitimate name.`,
    );
  }
});

test('f17 · `.vincentt/` fails ABSOLUTELY and no allowlist entry can admit it', () => {
  for (const sentence of [
    'The recorded version in .vincentt/ is what the comparison uses.',
    'The binding at .vincentt/project.json names the project.',
  ]) {
    assert.ok(lintBody(sentence).includes('file-path'), `must fail: ${sentence}`);
  }

  // Structural, not incidental: the arm tests `.vincentt/` as its own literal BEFORE the
  // allowlist is consulted, so widening the allowlist cannot reach it.
  const src = readFileSync(join(REPO_ROOT, 'build/lint.mjs'), 'utf8');
  assert.match(
    src,
    /for \(const m of text\.matchAll\(\/\\\.vincentt\\\/\/g\)\)/,
    'the .vincentt/ check must be its own unconditional pass, not an allowlist miss',
  );
});

// —— the SEMVER arm · condition (ii) ———————————————————————————————————————————

test('f17 · any version-shaped string fails — the package holds a method, never a fact', () => {
  for (const sentence of [
    'The current release is 2.0.0 and that is what to install.',
    'A project created from template 1.4.3 is the one this describes.',
    'The answer names 0.11.2 as the version installed.',
    'Anything at 10.20.30 or later carries the change.',
  ]) {
    assert.ok(lintBody(sentence).includes('semver'), `must fail the semver arm: ${sentence}`);
  }

  // And the shipped source carries none, which is the property condition (ii) actually asserts.
  assert.ok(
    !lintSource(SHIPPED, { precedence: PRECEDENCE }).some((v) => v.arm === 'semver'),
    'the shipped source must hold no version — a published fact is a stale copy we cannot recall',
  );
});

test('f17 · the semver arm covers every BUILT artifact, not only the source', () => {
  // qa.md's second case scans the artifacts rather than the source, because the source is not
  // what a creator installs. Everything in the package is generated FROM recognition.md, so a
  // version can only enter through a wrapper — which is exactly where PACKAGE_VERSION lives, and
  // that one is OUR OWN package's version rather than a platform component's fact.
  const artifacts = [
    'dist/AGENTS.section.md',
    'hosts/self-serve/SKILL.md',
    'dist/claude-code/skills/ar/SKILL.md',
    'dist/chatgpt/skills/ar/SKILL.md',
  ];
  for (const rel of artifacts) {
    const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
    const found = [...text.matchAll(/\d+\.\d+\.\d+/g)].map((m) => m[0]);
    assert.deepEqual(
      found,
      [],
      `${rel} carries version-shaped strings ${JSON.stringify(found)}. Every version the ` +
        `procedure acts on must be read at run time from the platform's public surface.`,
    );
  }
});

// —— the GIT-DESTRUCTIVE and STATE-RESTORING arms · §6.2 ——————————————————————

test('§6.2 · a named destructive version-control command fails', () => {
  for (const sentence of [
    'When it went badly, `git reset --hard` is what puts the project right.',
    'When stray files remain, `git clean -fd` is what removes them.',
    'The command `git checkout .` is what discards the replacements.',
    'A `git stash` before the upgrade is what keeps the previous work.',
  ]) {
    assert.ok(
      lintBody(sentence).includes('git-destructive'),
      `must fail the git-destructive arm: ${sentence}`,
    );
  }
});

test('§6.2 · THE TRAP SENTENCE FAILS, and it contains no command word', () => {
  // The security pass's own sentence. It names no command, states a fact, and completely
  // specifies a hard reset — which on this tree destroys the project binding, the env file and
  // every asset the creator added, all of them ignored by version control. This is the single
  // most important assertion in the f17 plugin slice: a reviewer scanning for commands passes it.
  const trap = 'A working tree returned to its committed state is the previous contents back.';
  const arms = lintBody(trap);
  assert.ok(
    arms.includes('state-restoring'),
    `the trap sentence must fail; fired [${arms}]. It contains NO command word, which is why the ` +
      `git-destructive arm alone is insufficient and this arm exists.`,
  );

  // Paraphrases, because an arm that only catches the one sentence it was written against is a
  // string match wearing a rule's clothes.
  for (const sentence of [
    'The replaced files can be brought back to how they were before the upgrade.',
    'Each file is restored to its previous contents.',
    'The project is left in a clean state.',
    'The tree is as it was before any of this ran.',
    'The folder is returned to the state it was committed in.',
  ]) {
    assert.ok(
      lintBody(sentence).includes('state-restoring'),
      `a paraphrase must fail too: ${sentence}`,
    );
  }
});

test('§6.2 · the APPROVED revert sentence passes, and the pinned heading is not collateral', () => {
  // The one sentence §6.2 requires. It names where bytes ARE and no transformation that would
  // retrieve them. An arm that forbade this would have been overtightened into forbidding the
  // design.
  const approved =
    "For files that were tracked and committed, the previous contents are in the person's " +
    'version control history.';
  assert.deepEqual(lintBody(approved), [], 'the approved form must pass');

  const caveat =
    'Files that were untracked or ignored had no previous copy anywhere, and their previous ' +
    'contents are gone.';
  assert.deepEqual(lintBody(caveat), [], 'the caveat that precedes it must pass');

  // And the pinned heading, which a naive `back to` list fires on. The shipped file's zero
  // depends on this and a pinned label may not be renamed to satisfy a lint.
  assert.ok(
    SHIPPED.includes('### Coming back to something'),
    'the pinned heading is still there — the arm was narrowed rather than the surface moved',
  );
  assert.ok(
    !lintSource(SHIPPED, { precedence: PRECEDENCE }).some((v) => v.arm === 'state-restoring'),
    'the shipped file must not fire the phrase arm on its own pinned heading',
  );
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

// The residual is asserted BY ITERATING the corpus, never by naming rows. A hand enumeration
// stayed arithmetically correct while the corpus it described fell behind the checklist, so the
// suite was green and its stated measurement was false. Iteration means a row added with no test
// edit is covered, and a row added with the wrong declared verdict goes red.

test('QA-F14-02 · every row\'s verdict matches its declared `fires`, by iteration', () => {
  for (const row of HOSTILE_SOURCES) {
    const violations = lintSource(row.source, { precedence: PRECEDENCE });
    assert.equal(
      violations.length > 0,
      row.fires,
      `${row.row} declares fires: ${row.fires} and the lint says otherwise; fired ` +
        `[${violations.map((v) => v.arm).join(', ')}]`,
    );
  }
});

test('QA-F14-02 · a residual cannot be parked in the corpus without an owner', () => {
  for (const row of HOSTILE_SOURCES) {
    if (row.residual) {
      assert.equal(row.fires, false, `${row.row} is a residual, so it is pinned as a PASS`);
      assert.ok(
        Number.isInteger(row.checklistItem) && row.checklistItem >= 1 && row.checklistItem <= 5,
        `${row.row} must name the checklist item (1..5) that owns it`,
      );
    } else {
      assert.equal(
        row.checklistItem,
        undefined,
        `${row.row} names a checklist item but is not marked residual; mark it one or the other`,
      );
    }
  }
});

// The rows the record specifies as the measurement of the widened checklist. A floor, not an
// enumeration: rows beyond these are covered by the iteration above with no edit here, and
// removing one of these is what turns this red.
const SPECIFIED_RESIDUALS = {
  ATTACK_1: 1,
  ATTACK_3: 5,
  ATTACK_DOTFILE: 4,
  ADV_REGISTRY_CREDENTIAL: 4,
  ATTACK_ACCOUNT_CLAUSE_MACHINE: 4,
  ATTACK_ACCOUNT_CLAUSE_PLACE: 4,
  ATTACK_ACCOUNT_TEARDOWN: 3,
  ATTACK_ACCOUNT_GOAL: 5,
};

test('QA-F14-02 · every residual the record specifies is in the corpus, owned by its item', () => {
  for (const [name, item] of Object.entries(SPECIFIED_RESIDUALS)) {
    const row = HOSTILE_SOURCES.find((r) => r.row === name);
    assert.ok(row, `${name} is specified by the record and missing from the corpus`);
    assert.equal(row.residual, true, `${name} must be marked residual`);
    assert.equal(row.checklistItem, item, `${name} is owned by checklist item ${item}`);
  }
});

test('QA-F14-02 · the ATTACK_ACCOUNT_* rows PASS: the constraint moved and the lint did not', () => {
  // Items 3 and 5 were widened and item 4 gained a per-clause review obligation (C0-C7). None of
  // that is a lint arm, so every account attack passing is the assertion, with the clause arm on
  // and off. The shipped clause arm splits on em-dash/semicolon/", so" and tests BARE VERBS; C0
  // splits on and/where/when/because and tests REFERENTS. Same name, different rules.
  const rows = HOSTILE_SOURCES.filter((r) => r.row.startsWith('ATTACK_ACCOUNT_'));
  assert.ok(rows.length >= 4, 'the four specified account rows must be present');
  for (const row of rows) {
    for (const clauseLevel of [false, true]) {
      assert.deepEqual(
        lintSource(row.source, { precedence: PRECEDENCE, clauseLevel }),
        [],
        `${row.row} must pass with clauseLevel: ${clauseLevel}. If it fires, an arm was widened; ` +
          'confirm it was not widened into a word list, which the record refused.',
      );
    }
  }
});

test('QA-F14-02 · the residual spans every intent-only checklist item the record measures', () => {
  // Items 1, 3, 4 and 5 each have a measured residual; item 2 is owned by the second-person arm
  // and the verdict rows. Losing every row for an item means the corpus no longer measures it.
  const owned = new Set(HOSTILE_SOURCES.filter((r) => r.residual).map((r) => r.checklistItem));
  for (const item of [1, 3, 4, 5]) {
    assert.ok(owned.has(item), `no residual row measures checklist item ${item}`);
  }
});

// —— QA-F14-04 · the labels ————————————————————————————————————————————————————

test('QA-F14-04 · every pinned id is present and an UNPINNED one is not accepted', () => {
  assert.deepEqual(SHIPPED_ACTIONS.map((a) => a.id), [...PINNED_ACTION_IDS]);

  // The ceiling moved to five, so the row that proves an extra id is refused has to be a SIXTH.
  // The property is unchanged: an id outside the pinned set is refused, whatever the count.
  const withSixth = [...SHIPPED_ACTIONS, { id: 'share', label: 'Share it', section: 'Finishing' }];
  const doc = parseRecognition(SHIPPED);
  const arms = lintLabels(doc, withSixth).map((v) => v.arm);
  assert.ok(arms.includes('label-id-set'), `an unpinned id must be rejected; fired [${arms}]`);
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

test('QA-F14-04 · SIXTH_HEADING fails the ceiling arm — the ceiling moved, it did not dissolve', () => {
  const row = HOSTILE_SOURCES.find((r) => r.row === 'SIXTH_HEADING');
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

test('PINNED_PLUGIN_VERBS is the two pinned verbs, and the arm reads the pin rather than a copy', () => {
  assert.deepEqual([...PINNED_PLUGIN_VERBS], ['preview', 'outdated']);

  // Each pinned verb passes; anything else fails. Asserted through the lint so the pin and the
  // arm cannot drift.
  for (const verb of PINNED_PLUGIN_VERBS) {
    const withPinned = HOSTILE_SOURCES.find((r) => r.row === 'HAS_UNPINNED_VERB').source.replace(
      'vincentt publish',
      `vincentt ${verb}`,
    );
    assert.ok(
      !armsFired(withPinned, { precedence: PRECEDENCE }).includes('verb-pin'),
      `"vincentt ${verb}" is pinned and must pass the verb arm`,
    );
  }

  // And the act-named verbs stay refused, because no such verb exists.
  for (const verb of ['update', 'upgrade']) {
    const withActVerb = HOSTILE_SOURCES.find((r) => r.row === 'HAS_UNPINNED_VERB').source.replace(
      'vincentt publish',
      `vincentt ${verb}`,
    );
    assert.ok(
      armsFired(withActVerb, { precedence: PRECEDENCE }).includes('verb-pin'),
      `"vincentt ${verb}" names the act; an agent reading it will run it, and no such verb exists`,
    );
  }
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
