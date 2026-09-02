#!/usr/bin/env node
// Enforces the adversarial review — implementation.md §4(4).
//
// The checklist is the ONLY control that owns the lint's residual, and the residual is a CLASS,
// not a list of shapes: any grammatically ordinary declarative sentence passes every syntactic
// arm. A build-time security pass wrote eleven new hostile sentences and all eleven passed the
// shipped lint -- two laundering a teardown by pure inference, two pointing at stored credentials
// by unnamed description. No grep-shaped rule closes that; a human answering five questions is
// what stands there instead.
//
// So the obligation cannot be "a template renders and hopefully someone reads it". The record is
// explicit: "the reviewer answers each item explicitly in the PR - a checklist answered by
// silence is not a control." This makes that mechanical.
//
// SCOPE: it fires only when recognition.md is in the diff. A PR that does not touch the source
// carries no obligation and is not asked to perform one -- a check that fires on every PR trains
// people to fill it in without reading it, which is the failure mode it exists to prevent.
//
// It checks that each of the five items HAS AN ANSWER. It cannot check that the answer is true;
// that is the reviewer's job and is why the reviewer must be someone who did not write the change.

import { readFileSync, existsSync } from 'node:fs';
import { isMain } from './is-main.mjs';

const ITEMS = [
  { n: 1, subject: 'skip, defer, or shortcut a confirmation' },
  { n: 2, subject: 'silence, inference, or a preceding event as consent' },
  { n: 3, subject: 'extend the scope of one of the four pinned moments' },
  { n: 4, subject: 'locally stored credentials or configuration by any description' },
  { n: 5, subject: 'a claim about what the person has decided' },
];

function fail(lines) {
  console.error(`::error::${lines[0]}`);
  for (const line of lines) console.error(line);
  process.exit(1);
}

// Splits the body into the segments that follow each `**N. ...**` heading, then reads the text
// under that segment's `**Answer:**` marker.
export function extractAnswers(body) {
  const answers = new Map();
  for (const item of ITEMS) {
    // Locate this item's heading, then the next item's heading (or the reviewer block / end).
    const start = new RegExp(`^\\s*\\*\\*${item.n}\\.\\s`, 'm').exec(body);
    if (!start) continue;
    const from = start.index + start[0].length;
    const nextItem = new RegExp(`^\\s*\\*\\*${item.n + 1}\\.\\s`, 'm').exec(body.slice(from));
    const nextSection = /^\s*(---|###\s)/m.exec(body.slice(from));
    const ends = [nextItem?.index, nextSection?.index].filter((i) => typeof i === 'number');
    const to = ends.length ? from + Math.min(...ends) : body.length;

    const segment = body.slice(from, to);
    const marker = /\*\*Answer:\*\*/.exec(segment);
    if (!marker) {
      answers.set(item.n, '');
      continue;
    }
    answers.set(item.n, stripComments(segment.slice(marker.index + marker[0].length)).trim());
  }
  return answers;
}

function stripComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

export function reviewIsRequired(changedFiles) {
  return changedFiles.some((f) => f.trim() === 'recognition.md');
}

// An answer must be words. A checkbox, a bare dash, or a leftover placeholder is silence wearing
// a costume.
const PLACEHOLDERS = new Set(['-', '*', '_', 'todo', 'tbd', 'x', '[ ]', '[x]', '...', 'answer']);

export function unanswered(answers) {
  const missing = [];
  for (const item of ITEMS) {
    const raw = (answers.get(item.n) ?? '').replace(/^[-*\s]+/, '').trim();
    // Trailing punctuation is stripped repeatedly, not once: "..." must normalise to "" rather
    // than to "..", which would slip past a set of single-token placeholders.
    const normalised = raw.toLowerCase().replace(/[.!?\s]+$/, '');
    if (!raw || !normalised || PLACEHOLDERS.has(normalised)) missing.push(item);
  }
  return missing;
}

if (isMain(import.meta.url)) {
  const [, , changedFilesPath, bodyPath] = process.argv;

  const changedFiles = existsSync(changedFilesPath)
    ? readFileSync(changedFilesPath, 'utf8').split('\n')
    : [];

  if (!reviewIsRequired(changedFiles)) {
    console.log('recognition.md is untouched — the adversarial review is not required for this PR.');
    process.exit(0);
  }

  const body = existsSync(bodyPath) ? readFileSync(bodyPath, 'utf8') : '';
  const missing = unanswered(extractAnswers(body));

  if (missing.length) {
    fail([
      `This PR changes recognition.md, so the adversarial review (implementation.md §4(4)) is ` +
        `required, and ${missing.length} of 5 items ${missing.length === 1 ? 'is' : 'are'} unanswered.`,
      '',
      ...missing.map((i) => `  ${i.n}. unanswered — ${i.subject}`),
      '',
      'Answer each item in the PR description, in words. "No" and "n/a" are answers; a blank is',
      'not. A checklist answered by silence is not a control.',
      '',
      'This is the only control that owns the lint\'s residual. The lint filters SYNTAX; any',
      'grammatically ordinary declarative sentence passes every arm of it. recognition.md ships',
      'into every creator\'s AGENTS.md and into a package that cannot be recalled once installed.',
    ]);
  }

  console.log('The adversarial review is answered on all five items.');
}
