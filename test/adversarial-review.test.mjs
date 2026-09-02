// The adversarial review's enforcement — implementation.md §4(4).
//
// The checklist is the only control that owns the lint's residual, and the residual is a CLASS:
// any grammatically ordinary declarative sentence passes every syntactic arm. So the obligation
// cannot rest on a template rendering and someone hopefully reading it. "A checklist answered by
// silence is not a control" is the requirement, and these cases are what make it mechanical.
//
// The parsing is the part that can be wrong in isolation: a check that reads an answered PR as
// unanswered blocks good work, and one that reads a blank as answered is the false-green the
// whole control exists to prevent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { extractAnswers, unanswered, reviewIsRequired } from '../build/check-adversarial-review.mjs';
import { REPO_ROOT } from '../build/assemble.mjs';

const TEMPLATE = readFileSync(join(REPO_ROOT, '.github/pull_request_template.md'), 'utf8');

// The five items, filled in. Built from the shipped template so the fixture cannot drift from the
// artifact a contributor actually receives.
function answered(answers) {
  let body = TEMPLATE;
  for (const [n, text] of Object.entries(answers)) {
    const marker = new RegExp(`(\\*\\*${n}\\.[\\s\\S]*?\\*\\*Answer:\\*\\*)`, 'm');
    body = body.replace(marker, `$1 ${text}`);
  }
  return body;
}

const ALL_ANSWERED = answered({
  1: 'No — it adds no confirmation-skipping language.',
  2: 'No — nothing treats a prior event as consent.',
  3: 'No — the four moments are unchanged.',
  4: 'No — it points at the agent contract, not at anything stored on the machine.',
  5: 'No.',
});

// —— scope ————————————————————————————————————————————————————————————————————

test('the review is required only when recognition.md is in the diff', () => {
  assert.equal(reviewIsRequired(['recognition.md']), true);
  assert.equal(reviewIsRequired(['README.md', 'recognition.md', 'build/lint.mjs']), true);

  // A PR that does not touch the source carries no obligation. A check that fires on every PR
  // trains people to fill it in without reading it.
  assert.equal(reviewIsRequired(['README.md']), false);
  assert.equal(reviewIsRequired(['build/lint.mjs', 'test/lint.test.mjs']), false);
  assert.equal(reviewIsRequired([]), false);

  // A path that merely ENDS in the name is a different file.
  assert.equal(reviewIsRequired(['docs/recognition.md']), false);
  assert.equal(reviewIsRequired(['hosts/self-serve/recognition.md']), false);
});

// —— the parse ————————————————————————————————————————————————————————————————

test('a fully answered template passes', () => {
  assert.deepEqual(unanswered(extractAnswers(ALL_ANSWERED)), []);
});

test('the SHIPPED template, unfilled, FAILS all five — the blank state is not a pass', () => {
  // The template a contributor receives is empty by construction. If the empty template passed,
  // the control would be satisfied by opening a PR and touching nothing.
  const missing = unanswered(extractAnswers(TEMPLATE));
  assert.equal(missing.length, 5, 'an unfilled template answers nothing');
  assert.deepEqual(missing.map((m) => m.n), [1, 2, 3, 4, 5]);
});

test('ONE unanswered item fails, and the failure names WHICH', () => {
  for (const n of [1, 2, 3, 4, 5]) {
    const answers = { 1: 'No.', 2: 'No.', 3: 'No.', 4: 'No.', 5: 'No.' };
    delete answers[n];
    const missing = unanswered(extractAnswers(answered(answers)));
    assert.deepEqual(missing.map((m) => m.n), [n], `item ${n} must be reported unanswered`);
    assert.ok(missing[0].subject.length > 0, 'the report names the item\'s subject');
  }
});

test('silence wearing a costume is still silence', () => {
  // A checkbox, a bare dash, or a leftover placeholder is not an answer. These are the shapes a
  // reviewer reaches for when clearing a check rather than performing it.
  for (const token of ['-', '*', 'TODO', 'tbd', 'x', '[ ]', '[x]', '...', 'n/a.']) {
    const missing = unanswered(
      extractAnswers(answered({ 1: token, 2: 'No.', 3: 'No.', 4: 'No.', 5: 'No.' })),
    );
    const stillSilent = !['n/a.'].includes(token);
    if (stillSilent) {
      assert.deepEqual(missing.map((m) => m.n), [1], `"${token}" must not count as an answer`);
    }
  }
});

test('"no" and "n/a" ARE answers — the control asks for a response, not a particular one', () => {
  for (const token of ['No', 'no', 'No.', 'n/a', 'N/A', 'Not applicable.']) {
    assert.deepEqual(
      unanswered(extractAnswers(answered({ 1: token, 2: 'No.', 3: 'No.', 4: 'No.', 5: 'No.' }))),
      [],
      `"${token}" is a real answer`,
    );
  }
});

test('an HTML comment is not an answer', () => {
  // The template's own guidance is in comments. A reviewer who deletes nothing and adds nothing
  // must not pass because a comment sits where their words belong.
  const body = answered({ 1: '<!-- think about this -->', 2: 'No.', 3: 'No.', 4: 'No.', 5: 'No.' });
  assert.deepEqual(unanswered(extractAnswers(body)).map((m) => m.n), [1]);
});

test('a missing template entirely fails all five rather than passing vacuously', () => {
  // A PR opened with the template deleted must not be the way around the control.
  const missing = unanswered(extractAnswers('Just some prose about the change.'));
  assert.equal(missing.length, 5);
});

// —— the CLI ————————————————————————————————————————————————————————————————————

const SCRIPT = join(REPO_ROOT, 'build/check-adversarial-review.mjs');

function runCli(changedFiles, body) {
  const dir = mkdtempSync(join(tmpdir(), 'f14-review-'));
  try {
    const filesPath = join(dir, 'changed.txt');
    const bodyPath = join(dir, 'body.md');
    writeFileSync(filesPath, changedFiles.join('\n'));
    writeFileSync(bodyPath, body);
    const r = spawnSync(process.execPath, [SCRIPT, filesPath, bodyPath], { encoding: 'utf8' });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('CLI · a PR not touching recognition.md EXITS 0 without asking for anything', () => {
  const r = runCli(['README.md'], '');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /not required/);
});

test('CLI · a PR touching recognition.md with an unfilled template EXITS 1', () => {
  const r = runCli(['recognition.md'], TEMPLATE);
  assert.equal(r.status, 1, 'the obligation must fail the build, not warn');
  assert.match(r.stderr, /5 of 5 items are unanswered/);
  assert.match(r.stderr, /silence is not a control/);
  assert.match(r.stderr, /cannot be recalled once installed/);
});

test('CLI · a PR touching recognition.md with every item answered EXITS 0', () => {
  const r = runCli(['recognition.md'], ALL_ANSWERED);
  assert.equal(r.status, 0, `expected pass\n${r.stderr}`);
  assert.match(r.stdout, /answered on all five items/);
});

// —— the template carries the record's own words ————————————————————————————————

test('the template ships all five items with their load-bearing qualifiers', () => {
  assert.match(TEMPLATE, /skip, defer, or shortcut a confirmation/);
  assert.match(TEMPLATE, /silence, inference, or a preceding event as consent/);
  assert.match(TEMPLATE, /extend the scope of one of the four pinned moments/);
  assert.match(TEMPLATE, /locally stored credentials or configuration by any description/);
  assert.match(TEMPLATE, /what the person has decided/);

  // Item 4's rewording is the whole point of item 4: the attack that found the gap named none of
  // the path-shaped spellings, so the item is about the REFERENT.
  assert.match(TEMPLATE, /about the referent, not the spelling/);

  // Item 3's pointer at the real target.
  assert.match(TEMPLATE, /Teardown is the one to attack/);

  // B-F14-2, cited where it is enforced.
  assert.match(TEMPLATE, /B-F14-2/);
});

test('the template keeps the "answered explicitly, not by silence" requirement visible', () => {
  assert.match(TEMPLATE, /A checklist answered by silence is not a control/i);
  assert.match(TEMPLATE, /reviewer must be someone who did not write the change/i);
});

test('the template states that both reviews run and that they differ', () => {
  // §4(4) is distinct from the duplication review: one asks about RESTATEMENT, the other about
  // OVERRIDE. Collapsing them loses the one that owns the residual.
  assert.match(TEMPLATE, /RESTATEMENT/);
  assert.match(TEMPLATE, /OVERRIDE/);
});
